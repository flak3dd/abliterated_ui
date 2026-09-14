import { GroundingReport, WorkspaceFile } from '../types';

/**
 * Standard Python libraries and common ecosystem packages
 */
const PYTHON_VERIFIED_MODULES = new Set([
  // Python 3.11/3.12 Standard Library
  'os', 'sys', 'json', 'math', 're', 'pathlib', 'typing', 'unittest', 'asyncio',
  'hashlib', 'http', 'urllib', 'collections', 'itertools', 'functools', 'time',
  'datetime', 'random', 'subprocess', 'threading', 'multiprocessing', 'queue',
  'socket', 'select', 'ssl', 'csv', 'sqlite3', 'logging', 'argparse', 'io',
  'struct', 'shutil', 'tempfile', 'glob', 'copy', 'pickle', 'contextlib', 'enum',
  'dataclasses', 'inspect', 'traceback', 'uuid', 'base64', 'binascii', 'decimal',
  'fractions', 'numbers', 'cmath', 'statistics', 'operator', 'weakref', 'gc',
  'platform', 'errno', 'ctypes', 'site', 'warnings', 'zipfile', 'tarfile', 'gzip',
  'bz2', 'lzma', 'shlex', 'configparser', 'xml', 'html', 'email', 'mimetypes',
  // Standard Ecosystem Tools in DGX Spark Sandbox
  'pytest', 'httpx', 'aiohttp', 'requests', 'numpy', 'torch', 'pydantic',
  'fastapi', 'uvicorn', 'flask', 'scipy', 'transformers', 'vllm', 'PIL', 'pillow'
]);

/**
 * Standard Node.js built-ins and core packages
 */
const NODE_VERIFIED_MODULES = new Set([
  'fs', 'fs/promises', 'path', 'http', 'https', 'crypto', 'events', 'util',
  'os', 'stream', 'url', 'child_process', 'cluster', 'zlib', 'net', 'tls',
  'dns', 'buffer', 'perf_hooks', 'worker_threads', 'process', 'readline',
  // Common workspace packages
  'react', 'react-native', 'expo', 'lucide-react-native', 'zustand', 'vitest',
  'jest', 'typescript', 'axios', 'express'
]);

/**
 * Common lazy placeholder patterns that indicate hallucinatory completion
 */
const PLACEHOLDER_PATTERNS = [
  /#\s*(TODO|FIXME|rest of code|add implementation|fill in|your code here)/i,
  /\/\/\s*(TODO|FIXME|rest of code|add implementation|fill in|your code here)/i,
  /\/\*\s*(TODO|FIXME|rest of code|add implementation|fill in)\s*\*\//i,
  /^\s*\.\.\.\s*$/m,
  /def\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:\s*\n\s*(pass|\.\.\.)\s*$/m,
];

/**
 * Extracts all code block filenames written in the markdown response
 */
export function extractDeclaredFiles(content: string): string[] {
  const files: string[] = [];
  const regex = /```[a-zA-Z0-9_-]+\s+([a-zA-Z0-9_./\\-]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) {
      files.push(match[1].trim());
    }
  }
  return files;
}

/**
 * Analyzes assistant text for hallucinations, placeholders, and ungrounded imports.
 */
export function evaluateFactualGrounding(
  content: string,
  existingFiles: Record<string, WorkspaceFile> = {}
): GroundingReport {
  const warnings: string[] = [];
  const detectedImports: string[] = [];
  const verifiedFiles: string[] = [];
  let hasPlaceholders = false;
  let score = 100;

  // 1. Collect all declared filenames from the message itself
  const declaredFiles = extractDeclaredFiles(content);
  const allKnownFilenames = new Set([
    ...Object.keys(existingFiles),
    ...declaredFiles,
    ...declaredFiles.map((f) => f.split('/').pop() || f),
    ...Object.keys(existingFiles).map((f) => f.split('/').pop() || f),
  ]);

  // 2. Check for lazy placeholder stubs (hallucination of complete implementation)
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content)) {
      hasPlaceholders = true;
      score -= 20;
      warnings.push('Incomplete implementation stub or placeholder detected (e.g. TODO, "...", or empty pass)');
      break;
    }
  }

  // 3. Scan Python imports: "import xyz", "from xyz import foo"
  const pythonImportRegex = /(?:^|\n)\s*(?:from\s+([a-zA-Z0-9_.]+)|import\s+([a-zA-Z0-9_.]+))/g;
  let pyMatch;
  while ((pyMatch = pythonImportRegex.exec(content)) !== null) {
    const rawModule = (pyMatch[1] || pyMatch[2] || '').split('.')[0];
    if (rawModule && !detectedImports.includes(rawModule)) {
      detectedImports.push(rawModule);

      const isStd = PYTHON_VERIFIED_MODULES.has(rawModule);
      const isWorkspaceModule =
        allKnownFilenames.has(`${rawModule}.py`) ||
        allKnownFilenames.has(rawModule);

      if (isStd || isWorkspaceModule) {
        verifiedFiles.push(rawModule);
      } else {
        score -= 8;
        warnings.push(`Unverified Python module import: "${rawModule}" (neither in standard library nor active sandbox)`);
      }
    }
  }

  // 4. Scan JavaScript / TypeScript imports: "import ... from 'xyz'", "require('xyz')"
  const jsImportRegex = /(?:from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
  let jsMatch;
  while ((jsMatch = jsImportRegex.exec(content)) !== null) {
    const rawPath = jsMatch[1] || jsMatch[2] || '';
    if (rawPath && !detectedImports.includes(rawPath)) {
      detectedImports.push(rawPath);

      if (rawPath.startsWith('.')) {
        // Relative file import
        const cleanName = rawPath.replace(/^\.\//, '').replace(/^\.\.\//, '');
        const hasMatch = Array.from(allKnownFilenames).some(
          (f) => f.startsWith(cleanName) || f.includes(cleanName)
        );
        if (hasMatch) {
          verifiedFiles.push(rawPath);
        } else {
          score -= 8;
          warnings.push(`Relative import "${rawPath}" does not match any known file in the sandbox`);
        }
      } else {
        // Package import
        const pkgName = rawPath.startsWith('@')
          ? rawPath.split('/').slice(0, 2).join('/')
          : rawPath.split('/')[0];
        if (NODE_VERIFIED_MODULES.has(pkgName)) {
          verifiedFiles.push(pkgName);
        }
      }
    }
  }

  // 5. Check for synthetic fake URLs
  const fakeUrlRegex = /https?:\/\/(?:api\.(?:fake|dummy|test|nonexistent)|nonexistent-domain\.com|fake-service)/gi;
  if (fakeUrlRegex.test(content)) {
    score -= 15;
    warnings.push('Fabricated synthetic endpoint URL detected in code');
  }

  // Final score clamping
  const finalScore = Math.max(0, Math.min(100, score));
  const isGrounded = finalScore >= 80 && !hasPlaceholders;

  return {
    isGrounded,
    groundingScore: finalScore,
    warnings,
    verifiedFiles: Array.from(new Set(verifiedFiles)),
    detectedImports,
    hasPlaceholders,
    timestamp: Date.now(),
  };
}
