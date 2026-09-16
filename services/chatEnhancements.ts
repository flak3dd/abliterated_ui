import type { ChatSession, Message, MessageAttachment, SessionEnvironment } from '../types';

export function buildSessionExportMarkdown(opts: {
  session: ChatSession;
  messages: Message[];
  env?: SessionEnvironment | null;
}): string {
  const { session, messages, env } = opts;
  const lines: string[] = [
    `# ${session.title}`,
    '',
    `- session: \`${session.id}\``,
    `- env: \`${session.envId}\``,
    session.parentSessionId ? `- branched from: \`${session.parentSessionId}\`` : '',
    `- exported: ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ].filter(Boolean) as string[];

  for (const m of messages) {
    lines.push(`## ${m.role}`, '');
    if (m.attachments?.length) {
      for (const a of m.attachments) {
        lines.push(`- attachment: ${a.name} (${a.mime})`);
      }
      lines.push('');
    }
    lines.push(m.content || '_(empty)_', '');
    if (m.ragCitations?.length) {
      lines.push('### Citations');
      for (const c of m.ragCitations) {
        lines.push(`- **${c.title}** (${c.source}, score ${c.score.toFixed(2)}) — ${c.snippet.slice(0, 160)}`);
      }
      lines.push('');
    }
    if (m.previewUrl) {
      lines.push(`Preview: ${m.previewUrl}`, '');
    }
  }

  if (env) {
    lines.push('---', '', '## Sandbox files', '');
    for (const p of Object.keys(env.files).sort()) {
      lines.push(`### \`${p}\``, '', '```', (env.files[p].content || '').slice(0, 8000), '```', '');
    }
  }
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string) {
  if (typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function filterMessagesByQuery(messages: Message[], query: string): Message[] {
  const q = query.trim().toLowerCase();
  if (!q) return messages;
  return messages.filter(
    (m) =>
      m.content.toLowerCase().includes(q) ||
      (m.reasoning || '').toLowerCase().includes(q) ||
      (m.attachments || []).some((a) => a.name.toLowerCase().includes(q))
  );
}

export async function readFilesAsAttachments(files: File[]): Promise<MessageAttachment[]> {
  const out: MessageAttachment[] = [];
  for (const f of files.slice(0, 8)) {
    const uri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
    out.push({
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: f.name,
      mime: f.type || 'application/octet-stream',
      uri,
      sizeBytes: f.size,
    });
  }
  return out;
}

/** OpenAI-compatible multimodal content parts from text + image attachments */
export function buildVisionUserContent(
  text: string,
  attachments?: MessageAttachment[]
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  const images = (attachments || []).filter((a) => /^image\//i.test(a.mime) && a.uri);
  if (!images.length) return text;
  return [
    { type: 'text', text: text || '(see attached image)' },
    ...images.map((a) => ({ type: 'image_url', image_url: { url: a.uri } })),
  ];
}
