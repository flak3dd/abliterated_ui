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
  'abc', 'types', 'concurrent',
  // Standard Ecosystem Tools in DGX Spark Sandbox
  'pytest', 'httpx', 'aiohttp', 'requests', 'numpy', 'torch', 'pydantic',
  'fastapi', 'uvicorn', 'flask', 'scipy', 'transformers', 'vllm', 'PIL', 'pillow',
  'safetensors', 'diffusers', 'accelerate', 'einops', 'tqdm', 'cv2', 'pandas', 'yaml', 'dotenv', 'psutil'
]);

/**
 * Standard Node.js built-ins and core packages
 */
const NODE_VERIFIED_MODULES = new Set([
  'fs', 'fs/promises', 'path', 'http', 'https', 'crypto', 'events', 'util',
  'os', 'stream', 'url', 'child_process', 'cluster', 'zlib', 'net', 'tls',
  'dns', 'buffer', 'perf_hooks', 'worker_threads', 'process', 'readline',
  // React & React Native Ecosystem
  'react', 'react/jsx-runtime', 'react-dom', 'react-native', 'react-native-web',
  'react-native-reanimated', 'react-native-safe-area-context', 'react-native-screens',
  'react-native-svg', 'react-native-worklets',
  // Expo Ecosystem
  'expo', 'expo-router', 'expo-status-bar', 'expo-haptics', 'expo-clipboard',
  'expo-constants', 'expo-image-picker', 'expo-linking', 'expo-sharing',
  'expo-speech', 'expo-font', 'expo-image', 'expo-asset', 'expo-crypto',
  '@expo/vector-icons', '@react-native-async-storage/async-storage',
  // Core Utilities & State
  'lucide-react-native', 'zustand', 'vitest', 'jest', 'typescript', 'axios', 'express',
  'tailwind-merge', 'clsx', 'date-fns', 'lodash'
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
 * Extracts all code block filenames and declared files written in the markdown response
 */
export function extractDeclaredFiles(content: string): string[] {
  const files = new Set<string>();

  // 1. ```lang path/to/file.ext
  const codeBlockRegex = /```[a-zA-Z0-9_-]+\s+([a-zA-Z0-9_./\\-]+)/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match[1]) {
      files.add(match[1].trim());
    }
  }

  // 2. Comments like // filename.tsx, # filename.py
  const commentRegex = /(?:^|\n)\s*(?:\/\/|#)\s*([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)/g;
  while ((match = commentRegex.exec(content)) !== null) {
    if (match[1]) {
      files.add(match[1].trim());
    }
  }

  // 3. Markdown headings like ### components/BouncingButton.tsx
  const headingRegex = /(?:^|\n)#{1,4}\s+([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)/g;
  while ((match = headingRegex.exec(content)) !== null) {
    if (match[1]) {
      files.add(match[1].trim());
    }
  }

  return Array.from(files);
}

interface CodeBlock {
  lang: string;
  code: string;
}

/**
 * Extracts fenced code blocks with their specified language tag
 */
function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```([a-zA-Z0-9_-]*)[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      lang: (match[1] || '').trim().toLowerCase(),
      code: match[2],
    });
  }
  return blocks;
}

const PYTHON_LANGS = new Set(['python', 'py', 'python3', 'py3']);
const JS_LANGS = new Set([
  'javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx', 'node', 'react', 'json', 'html', 'css'
]);

/**
 * Extracts genuine Python module imports from a code segment.
 * Specifically ignores JS/TS imports (e.g. "import React from 'react'").
 */
function extractPythonImports(text: string): string[] {
  const imports: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Filter out JavaScript / TypeScript import statements:
    if (/from\s+['"]/.test(trimmed)) continue;              // from 'xyz' or from "xyz"
    if (/import\s+.*?\s+from\s+/.test(trimmed)) continue;  // import Foo from 'bar'
    if (/import\s*\{/.test(trimmed)) continue;              // import { Foo } from 'bar'
    if (/import\s+type\s+/.test(trimmed)) continue;         // import type { Foo }
    if (/import\s*\(/.test(trimmed)) continue;              // import('foo') dynamic import

    // 1. "from foo.bar import baz" -> module is "foo"
    const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+/);
    if (fromMatch && fromMatch[1]) {
      const topModule = fromMatch[1].split('.')[0].replace(/^\.+/, '');
      if (topModule) imports.push(topModule);
      continue;
    }

    // 2. "import foo" or "import foo as f" or "import foo, bar"
    const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_.,\s]+)(?:#.*)?$/);
    if (importMatch && importMatch[1]) {
      const parts = importMatch[1].split(',');
      for (const part of parts) {
        const modName = part.trim().split(/\s+/)[0]?.split('.')[0];
        if (modName && /^[a-zA-Z0-9_]+$/.test(modName)) {
          imports.push(modName);
        }
      }
    }
  }

  return imports;
}

/**
 * Extracts JavaScript / TypeScript import module names and paths
 */
function extractJsImports(text: string): string[] {
  const imports: string[] = [];
  const jsImportRegex = /(?:from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"])/g;
  let match;
  while ((match = jsImportRegex.exec(text)) !== null) {
    const rawPath = match[1] || match[2] || match[3] || match[4] || '';
    if (rawPath) {
      imports.push(rawPath);
    }
  }
  return imports;
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

  // 1. Collect all declared filenames from the message itself & existing sandbox
  const declaredFiles = extractDeclaredFiles(content);
  const rawFileKeys = [...Object.keys(existingFiles), ...declaredFiles];
  const allKnownFilenames = new Set<string>();

  for (const f of rawFileKeys) {
    const clean = f.trim();
    if (!clean) continue;
    allKnownFilenames.add(clean);
    const basename = clean.split('/').pop() || clean;
    allKnownFilenames.add(basename);
    const nameWithoutExt = basename.replace(/\.[a-zA-Z0-9]+$/, '');
    allKnownFilenames.add(nameWithoutExt);
  }

  // 2. Check for lazy placeholder stubs (hallucination of complete implementation)
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content)) {
      hasPlaceholders = true;
      score -= 20;
      warnings.push('Incomplete implementation stub or placeholder detected (e.g. TODO, "...", or empty pass)');
      break;
    }
  }

  // 3. Extract code blocks with language tagging
  const codeBlocks = extractCodeBlocks(content);
  const pythonSegments: string[] = [];
  const jsSegments: string[] = [];

  if (codeBlocks.length > 0) {
    for (const block of codeBlocks) {
      if (PYTHON_LANGS.has(block.lang)) {
        pythonSegments.push(block.code);
      } else if (JS_LANGS.has(block.lang)) {
        jsSegments.push(block.code);
      } else {
        // Unknown or unspecified code block language: check both safely
        pythonSegments.push(block.code);
        jsSegments.push(block.code);
      }
    }
  } else {
    // Plain text without code fence: check both safely
    pythonSegments.push(content);
    jsSegments.push(content);
  }

  // 4. Scan genuine Python imports
  for (const segment of pythonSegments) {
    const pyImports = extractPythonImports(segment);
    for (const rawModule of pyImports) {
      if (!detectedImports.includes(rawModule)) {
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
  }

  // 5. Scan JavaScript / TypeScript imports
  for (const segment of jsSegments) {
    const jsImports = extractJsImports(segment);
    for (const rawPath of jsImports) {
      if (!detectedImports.includes(rawPath)) {
        detectedImports.push(rawPath);

        if (rawPath.startsWith('.')) {
          // Relative file import (e.g. './BouncingButton')
          const cleanName = rawPath.replace(/^\.\//, '').replace(/^\.\.\//, '');
          const cleanNameNoExt = cleanName.replace(/\.[a-zA-Z0-9]+$/, '');
          const hasMatch =
            allKnownFilenames.has(cleanName) ||
            allKnownFilenames.has(cleanNameNoExt) ||
            Array.from(allKnownFilenames).some(
              (f) => f.startsWith(cleanName) || f.includes(cleanNameNoExt)
            );

          if (hasMatch) {
            verifiedFiles.push(rawPath);
          } else {
            score -= 8;
            warnings.push(`Relative import "${rawPath}" does not match any known file in the sandbox`);
          }
        } else {
          // Package import (e.g. 'react', '@expo/vector-icons')
          const pkgName = rawPath.startsWith('@')
            ? rawPath.split('/').slice(0, 2).join('/')
            : rawPath.split('/')[0];

          if (NODE_VERIFIED_MODULES.has(pkgName) || NODE_VERIFIED_MODULES.has(rawPath)) {
            verifiedFiles.push(pkgName);
          }
        }
      }
    }
  }

  // 6. Check for synthetic fake URLs
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
