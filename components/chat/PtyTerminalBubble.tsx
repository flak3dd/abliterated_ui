import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Colors from '../../theme/colors';

type Props = {
  envId: string;
  sessionId?: string;
  title?: string;
};

/**
 * Interactive PTY bubble — web uses xterm.js + WebSocket to sandbox-runner.
 * Native shows connection hint (open on web / desktop for full PTY).
 */
export const PtyTerminalBubble: React.FC<Props> = ({ envId, sessionId, title }) => {
  const hostRef = useRef<any>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const termRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setErr('Interactive PTY is available on web/desktop.');
      setStatus('error');
      return;
    }
    setStatus('connecting');
    try {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      // @ts-ignore css
      await import('@xterm/xterm/css/xterm.css');
      const el = hostRef.current;
      if (!el) return;
      el.innerHTML = '';
      const term = new Terminal({
        convertEol: true,
        fontFamily: 'Menlo, monospace',
        fontSize: 12,
        theme: { background: '#0a0a0c', foreground: '#e4e4e7' },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      fit.fit();
      termRef.current = term;

      const id = sessionId || `pty_${Date.now()}`;
      const ws = new WebSocket(
        `ws://127.0.0.1:17330/api/sandbox/pty?id=${encodeURIComponent(id)}&envId=${encodeURIComponent(envId)}&cols=${term.cols}&rows=${term.rows}`
      );
      wsRef.current = ws;
      ws.onopen = () => setStatus('live');
      ws.onerror = () => {
        setStatus('error');
        setErr('WebSocket error — is sandbox runner up with node-pty?');
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'out') term.write(msg.data);
          if (msg.type === 'exit') term.writeln(`\r\n[exit ${msg.exitCode}]`);
        } catch {
          term.write(String(ev.data));
        }
      };
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'in', data }));
        }
      });
    } catch (e: any) {
      setStatus('error');
      setErr(e?.message || 'xterm failed');
    }
  };

  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Text style={styles.title}>{title || `PTY · ${envId}`}</Text>
        <Text style={styles.status}>{status}</Text>
        {status !== 'live' ? (
          <TouchableOpacity onPress={connect} style={styles.btn}>
            <Text style={styles.btnText}>Connect</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {Platform.OS === 'web' ? React.createElement('div', { ref: hostRef, style: { height: 220, width: '100%' } }) : <Text style={styles.err}>Use web for xterm PTY</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    backgroundColor: '#0a0a0c',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: { flex: 1, fontSize: 11, fontFamily: 'Menlo', color: Colors.brand.emerald },
  status: { fontSize: 10, fontFamily: 'Menlo', color: Colors.text.tertiary },
  btn: {
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  btnText: { fontSize: 10, fontWeight: '700', color: '#09090B' },
  err: { color: Colors.brand.rose, fontSize: 10, fontFamily: 'Menlo', padding: 8 },
});
