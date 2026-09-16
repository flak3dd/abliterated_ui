/**
 * Upload local files into the active chat sandbox (env.files),
 * the same store the BUILD agent write_file / list_files use.
 */
import { useChatStore } from '../stores/useChatStore';
import { useSandboxStore } from '../stores/useSandboxStore';
import {
  isSecretPath,
  langFromPath,
  safeRelPath,
} from './agent/tools';
import type { Message } from '../types';

export const SANDBOX_UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // ~8MB

export type SandboxUploadSkip = { name: string; reason: string };

export type SandboxUploadResult = {
  uploaded: string[];
  skipped: SandboxUploadSkip[];
};

/** Basename-only sanitize; blocks path traversal and empty/secret names. */
export function sanitizeUploadFilename(name: string): string | null {
  const raw = String(name || '').replace(/\\/g, '/');
  const base = raw.split('/').filter(Boolean).pop() || '';
  if (!base || base === '.' || base === '..') return null;
  // Refuse secrets on the original basename (before stripping leading dots).
  if (isSecretPath(base)) return null;

  // Collapse weird unicode / control chars; keep common code filename chars.
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  const safe = safeRelPath(cleaned);
  if (!safe || isSecretPath(safe)) return null;
  return safe;
}

export type UploadableFile = {
  name: string;
  size: number;
  text: () => Promise<string>;
};

/**
 * Write selected files into the active sandbox env, mark dirty, materialize,
 * and optionally append a short chat note listing paths.
 */
export async function uploadFilesToActiveSandbox(
  files: UploadableFile[],
  opts?: { chatNote?: boolean }
): Promise<SandboxUploadResult> {
  const uploaded: string[] = [];
  const skipped: SandboxUploadSkip[] = [];

  const chat = useChatStore.getState();
  const env = chat.getActiveEnvironment();
  if (!env) {
    return {
      uploaded: [],
      skipped: files.map((f) => ({
        name: f.name,
        reason: 'No active sandbox environment',
      })),
    };
  }

  const batch: { path: string; content: string; language?: string }[] = [];

  for (const file of files) {
    const path = sanitizeUploadFilename(file.name);
    if (!path) {
      skipped.push({
        name: file.name,
        reason: 'Invalid or unsafe filename (path traversal / secrets blocked)',
      });
      continue;
    }
    if (file.size > SANDBOX_UPLOAD_MAX_BYTES) {
      skipped.push({
        name: file.name,
        reason: `Skipped: exceeds ${SANDBOX_UPLOAD_MAX_BYTES / (1024 * 1024)}MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
      });
      continue;
    }
    let content: string;
    try {
      content = await file.text();
    } catch (e: any) {
      skipped.push({
        name: file.name,
        reason: e?.message || 'Failed to read file',
      });
      continue;
    }
    // Empty is allowed for touch files; agent write_file refuses empty — uploads can create stubs.
    batch.push({ path, content, language: langFromPath(path) });
    uploaded.push(path);
  }

  if (batch.length) {
    chat.addOrUpdateFiles(env.id, batch);
    useSandboxStore
      .getState()
      .appendLog(
        `[Upload] Wrote ${batch.length} file(s) into sandbox: ${uploaded.join(', ')}`
      );
    try {
      await useSandboxStore.getState().materializeActiveEnv();
    } catch (e: any) {
      useSandboxStore
        .getState()
        .appendLog(`[Upload] Materialize deferred/failed: ${e?.message || e}`);
    }

    if (opts?.chatNote !== false) {
      appendUploadChatNote(uploaded, skipped);
    }
  }

  return { uploaded, skipped };
}

function appendUploadChatNote(uploaded: string[], skipped: SandboxUploadSkip[]) {
  const state = useChatStore.getState();
  const sid = state.activeSessionId;
  if (!sid || !uploaded.length) return;

  const lines = [
    `Uploaded to sandbox (${uploaded.length}):`,
    ...uploaded.map((p) => `- \`${p}\``),
  ];
  if (skipped.length) {
    lines.push('', `Skipped (${skipped.length}):`);
    for (const s of skipped) {
      lines.push(`- ${s.name}: ${s.reason}`);
    }
  }

  const note: Message = {
    id: 'msg_upload_' + Date.now(),
    role: 'assistant',
    content: lines.join('\n'),
    timestamp: Date.now(),
  };

  useChatStore.setState((prev) => ({
    messages: {
      ...prev.messages,
      [sid]: [...(prev.messages[sid] || []), note],
    },
  }));
  void useChatStore.getState().flushSave?.();
}
