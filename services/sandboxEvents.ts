const PRIMARY = 17330;

export type SandboxEvent = {
  type?: string;
  ts?: string;
  t?: number;
  envId?: string;
  [k: string]: unknown;
};

export function subscribeSandboxEvents(
  onEvent: (evt: SandboxEvent) => void,
  onStatus?: (state: 'open' | 'error' | 'closed') => void
): () => void {
  let closed = false;
  let es: EventSource | null = null;

  if (typeof EventSource === 'undefined') {
    onStatus?.('closed');
    return () => {};
  }

  try {
    es = new EventSource(`http://127.0.0.1:${PRIMARY}/api/sandbox/events`);
    es.onopen = () => onStatus?.('open');
    es.onerror = () => onStatus?.('error');
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        onEvent(data);
      } catch {
        /* ignore */
      }
    };
  } catch {
    onStatus?.('error');
  }

  return () => {
    if (closed) return;
    closed = true;
    try {
      es?.close();
    } catch {
      /* */
    }
    onStatus?.('closed');
  };
}
