import { Message } from '../types';
import { resolveApiUrl, buildApiHeaders } from './apiConfig';

export interface StreamCallbacks {
  onToken: (token: string, isReasoning: boolean) => void;
  onComplete: (finalContent: string, finalReasoning: string) => void;
  onError: (error: Error) => void;
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
}): Promise<void> {
  const url = resolveApiUrl(host, port, '/v1/chat/completions');
  const effectiveTemp = temperature !== undefined
    ? temperature
    : (antiHallucination ? 0.0 : 0.7);

  const selectedModel =
    model ||
    (host.includes('featherless')
      ? 'meta-llama/Meta-Llama-3.1-8B-Instruct'
      : 'qwen-abliterated');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildApiHeaders(apiKey, {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify({
        model: selectedModel,
        messages,
        stream: true,
        temperature: effectiveTemp,
        top_p: top_p ?? (antiHallucination ? 1.0 : 0.95),
        repetition_penalty: 1.1,
      }),
      signal: abortSignal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Inference endpoint (${selectedModel}) responded with HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let reasoning = '';
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
      return;
    }

    const errorMsg = `\n\n[⚠️ Backend Connection Error]: Unable to reach vLLM server at http://${host}:${port} (${err.message}). Please ensure the inference backend or SSH tunnel is active.`;
    callbacks.onToken(errorMsg, false);
    callbacks.onError(new Error(errorMsg));
  }
}
