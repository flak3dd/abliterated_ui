import { Platform } from 'react-native';
import { SessionEnvironment, WorkspaceFile } from '../types';

/**
 * Client-Side Single File & ZIP Archive Packager
 * Generates standards-compliant PKZIP archives in pure TypeScript/JavaScript
 * without external binary dependencies. Works natively on Web and React Native.
 */

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface DownloadableFile {
  name: string;
  content: string | Uint8Array;
  language?: string;
}

/**
 * Builds a standard PKZIP archive (uncompressed Store format)
 */
export function createZipBlob(files: DownloadableFile[]): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const cleanName = file.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBytes = encoder.encode(cleanName);
    const dataBytes =
      typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local Header (30 bytes + nameLen + dataLen)
    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // PK\x03\x04
    lv.setUint16(4, 20, true); // Version needed: 2.0
    lv.setUint16(6, 0x0800, true); // Bit flag: UTF-8 encoding
    lv.setUint16(8, 0, true); // Compression: 0 (Stored)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field len
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    localHeaders.push(local);

    // Central Directory Header (46 bytes + nameLen)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // PK\x01\x02
    cv.setUint16(4, 20, true); // Made by: 2.0
    cv.setUint16(6, 20, true); // Needed: 2.0
    cv.setUint16(8, 0x0800, true); // UTF-8
    cv.setUint16(10, 0, true); // Stored
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra field len
    cv.setUint16(32, 0, true); // Comment len
    cv.setUint16(34, 0, true); // Disk start
    cv.setUint16(36, 0, true); // Internal attributes
    cv.setUint32(38, 0, true); // External attributes
    cv.setUint32(42, currentOffset, true); // Relative offset of local header
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    currentOffset += local.length;
  }

  const centralOffset = currentOffset;
  let centralSize = 0;
  for (const c of centralHeaders) centralSize += c.length;

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // PK\x05\x06
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk with central dir
  ev.setUint16(8, files.length, true); // Number of central dir records on this disk
  ev.setUint16(10, files.length, true); // Total number of central dir records
  ev.setUint32(12, centralSize, true); // Size of central dir
  ev.setUint32(16, centralOffset, true); // Offset of central dir
  ev.setUint16(20, 0, true); // Comment length

  const totalLength = currentOffset + centralSize + 22;
  const combined = new Uint8Array(totalLength);
  let pos = 0;
  for (const l of localHeaders) {
    combined.set(l, pos);
    pos += l.length;
  }
  for (const c of centralHeaders) {
    combined.set(c, pos);
    pos += c.length;
  }
  combined.set(eocd, pos);

  return new Blob([combined], { type: 'application/zip' });
}

/**
 * Trigger download of any Blob object
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 250);
  }
}

/**
 * Trigger download of a single text or code file
 */
export function downloadSingleFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Package multiple files and trigger ZIP download
 */
export function downloadFilesAsZip(zipFilename: string, files: DownloadableFile[]): void {
  if (!files.length) return;
  const blob = createZipBlob(files);
  const name = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  downloadBlob(blob, name);
}

/**
 * Download entire SessionEnvironment as a .ZIP archive
 */
export function downloadEnvironmentAsZip(env: SessionEnvironment): void {
  const fileList = Object.values(env.files);
  if (fileList.length === 0) return;

  const downloadable: DownloadableFile[] = fileList.map((f) => ({
    name: f.path,
    content: f.content,
    language: f.language,
  }));

  const archiveName = `${env.name || env.id}.zip`;
  downloadFilesAsZip(archiveName, downloadable);
}

const EXTENSION_MAP: Record<string, string> = {
  python: 'py',
  py: 'py',
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  bash: 'sh',
  sh: 'sh',
  zsh: 'sh',
  shell: 'sh',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  golang: 'go',
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  sql: 'sql',
  markdown: 'md',
  md: 'md',
  diff: 'diff',
  dockerfile: 'dockerfile',
  xml: 'xml',
  toml: 'toml',
  ini: 'ini',
  text: 'txt',
  txt: 'txt',
};

/**
 * Intelligently extracts filename annotations from code headers or comments,
 * and cleans redundant annotation lines.
 */
export function detectFilenameAndContent(
  code: string,
  language?: string,
  index = 0
): { filename: string; cleanContent: string } {
  const raw = code.replace(/^\n+/, '');
  const lines = raw.split('\n');
  const firstLine = lines[0]?.trim() || '';
  const secondLine = lines[1]?.trim() || '';

  const patterns = [
    /^(?:\/\/|#|\/\*|<!--|###)\s*(?:filepath:\s*|file:\s*)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_\-]+)(?:\s*\*\/|\s*-->)?$/,
    /^(?:\/\/\s*|\#\s*)([a-zA-Z0-9_\-./\\]+\/[a-zA-Z0-9_\-./\\]+)$/,
    /^--- (?:a\/)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_\-]+)$/,
    /^\+\+\+ (?:b\/)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_\-]+)$/,
  ];

  for (const pattern of patterns) {
    const match1 = firstLine.match(pattern);
    if (match1 && match1[1]) {
      const detected = match1[1].replace(/^[ab]\//, '').trim();
      const cleanContent = lines.slice(1).join('\n').replace(/^\n+/, '');
      return { filename: detected, cleanContent: cleanContent || raw };
    }

    const match2 = secondLine.match(pattern);
    if (match2 && match2[1] && firstLine.startsWith('#!')) {
      const detected = match2[1].replace(/^[ab]\//, '').trim();
      const cleanContent = [lines[0], ...lines.slice(2)].join('\n');
      return { filename: detected, cleanContent };
    }
  }

  // Fallback: deduce extension from language
  const langKey = (language || '').toLowerCase().trim();
  const ext = EXTENSION_MAP[langKey] || (langKey.length >= 1 && langKey.length <= 5 ? langKey : 'txt');
  const filename = `file_${index + 1}.${ext}`;

  return { filename, cleanContent: raw };
}

/**
 * Extracts all code blocks with filenames and stores them as WorkspaceFile objects
 */
export function extractFilesFromMarkdown(markdown: string): WorkspaceFile[] {
  const files: WorkspaceFile[] = [];
  const regex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(markdown)) !== null) {
    const rawHeader = (match[1] || '').trim();
    const code = match[2];
    if (!code.trim()) continue;

    let headerFile = '';
    let lang = rawHeader;
    if (rawHeader.includes(':')) {
      const parts = rawHeader.split(':');
      lang = parts[0]?.trim() || '';
      headerFile = parts[1]?.trim() || '';
    } else if (rawHeader.includes(' ')) {
      const parts = rawHeader.split(/\s+/);
      lang = parts[0]?.trim() || '';
      headerFile = parts[1]?.trim() || '';
    }

    const { filename, cleanContent } = detectFilenameAndContent(code, lang, idx);
    const finalName = headerFile || filename;

    files.push({
      path: finalName,
      content: cleanContent,
      language: lang || 'text',
      updatedAt: Date.now(),
      sizeBytes: new TextEncoder().encode(cleanContent).length,
    });

    idx++;
  }

  return files;
}
