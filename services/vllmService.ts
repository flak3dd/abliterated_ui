import { Message } from '../types';
import { resolveApiUrl, buildApiHeaders } from './apiConfig';
import { useMeshStore } from '../stores/useMeshStore';

export interface StreamCallbacks {
  onToken: (token: string, isReasoning: boolean) => void;
  onComplete: (finalContent: string, finalReasoning: string) => void;
  onError: (error: Error) => void;
}

export const SPARK_MAX_CONTEXT = 16384;
export const SPARK_TARGET_OUTPUT = 8192;
export const SPARK_MIN_OUTPUT = 768;

export function estimateTokens(text: string): number {
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.length / 3.4));
}

export function fitMessagesToContext(
  messages: Array<{ role: string; content: string }>,
  ctx = SPARK_MAX_CONTEXT,
  targetOut = SPARK_TARGET_OUTPUT
): { messages: Array<{ role: string; content: string }>; max_tokens: number } {
  const overhead = 96;
  const system = messages.filter((m) => m.role === 'system').map((m) => ({ ...m, content: m.content || '' }));
  let rest = messages.filter((m) => m.role !== 'system').map((m) => ({ ...m, content: m.content || '' }));

  const packed = () => [...system, ...rest];
  const used = () =>
    packed().reduce((sum, m) => sum + estimateTokens(m.content) + 6, 0) + overhead;
  const remaining = () => ctx - used();

  while (rest.length > 1 && remaining() < SPARK_MIN_OUTPUT) {
    rest = rest.slice(1);
  }
  if (remaining() < SPARK_MIN_OUTPUT && system[0]) {
    const others = rest.reduce((sum, m) => sum + estimateTokens(m.content) + 6, 0) + overhead;
    const sysBudgetChars = Math.max(400, Math.floor((ctx - SPARK_MIN_OUTPUT - others) * 3.4));
    if (system[0].content.length > sysBudgetChars) {
      system[0].content = system[0].content.slice(0, sysBudgetChars) + '\n... [system truncated for context]';
    }
  }
  const max_tokens = Math.max(SPARK_MIN_OUTPUT, Math.min(targetOut, remaining()));
  return { messages: packed(), max_tokens };
}

export async function streamChatCompletion({
  host,
  port = 443,
  model,
  apiKey,
  messages,
  callbacks,
  abortSignal,
  temperature,
  top_p,
  antiHallucination = true,
  max_tokens = SPARK_TARGET_OUTPUT,
}: {
  host: string;
  port?: number;
  model?: string;
  apiKey?: string;
  messages: Array<{ role: string; content: string }>;
  callbacks: StreamCallbacks;
  abortSignal?: AbortSignal;
  temperature?: number;
  top_p?: number;
  antiHallucination?: boolean;
  max_tokens?: number;
}): Promise<void> {
  const url = resolveApiUrl(host, port, '/v1/chat/completions');
  const effectiveTemp = temperature !== undefined
    ? temperature
    : (antiHallucination ? 0.0 : 0.7);

  const live = useMeshStore.getState().servingModel;
  const hostLc = (host || '').toLowerCase();
  const selectedModel =
    model ||
    live ||
    (hostLc.includes('featherless')
      ? 'meta-llama/Meta-Llama-3.1-8B-Instruct'
      : hostLc.includes('abliteration') || hostLc.includes('abliterated.ai') || hostLc.includes('abliterated.io')
        ? 'abliterated-model'
        : 'qwen-abliterated');

  const fitted = fitMessagesToContext(messages, SPARK_MAX_CONTEXT, max_tokens);
  let fullContent = '';
  let reasoning = '';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildApiHeaders(apiKey, {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify({
        model: selectedModel,
        messages: fitted.messages,
        stream: true,
        temperature: effectiveTemp,
        top_p: top_p ?? (antiHallucination ? 1.0 : 0.95),
        repetition_penalty: 1.1,
        max_tokens: fitted.max_tokens,
      }),
      signal: abortSignal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      let detail = errText.slice(0, 400);
      try {
        const parsed = JSON.parse(errText);
        detail = parsed?.error?.message || parsed?.message || detail;
      } catch {}
      if (response.status === 402) {
        throw new Error(
          `Abliteration needs credits before it will chat (${selectedModel}). Add credits, then retry.`
        );
      }
      throw new Error(
        `Inference endpoint (${selectedModel}) HTTP ${response.status}` +
          (detail ? ': ' + detail : '')
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let insideThink = false;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices?.[0]?.delta;
            const content = delta?.content || '';
            const reasonToken = delta?.reasoning_content || '';

            if (reasonToken) {
              reasoning += reasonToken;
              callbacks.onToken(reasonToken, true);
              continue;
            }

            let tokenToProcess = content;

            if (tokenToProcess.includes('<think>')) {
              insideThink = true;
              tokenToProcess = tokenToProcess.replace('<think>', '');
            }

            if (tokenToProcess.includes('</think>')) {
              insideThink = false;
              const parts = tokenToProcess.split('</think>');
              if (parts[0]) {
                reasoning += parts[0];
                callbacks.onToken(parts[0], true);
              }
              if (parts[1]) {
                fullContent += parts[1];
                callbacks.onToken(parts[1], false);
              }
              continue;
            }

            if (insideThink) {
              if (tokenToProcess) {
                reasoning += tokenToProcess;
                callbacks.onToken(tokenToProcess, true);
              }
            } else {
              if (tokenToProcess) {
                fullContent += tokenToProcess;
                callbacks.onToken(tokenToProcess, false);
              }
            }
          } catch {
            // Partial JSON chunk, proceed to next
          }
        }
      }
    }

    callbacks.onComplete(fullContent, reasoning.trim());
  } catch (err: any) {
    if (abortSignal?.aborted) {
      callbacks.onComplete(fullContent, reasoning.trim());
      return;
    }

    const errorMsg = `\n\n[⚠️ Backend Connection Error]: Unable to reach ${url} (${err.message}). Check API key, Cloud Mesh, and that the host is reachable.`;
    callbacks.onToken(errorMsg, false);
    callbacks.onError(new Error(errorMsg));
  }
}
