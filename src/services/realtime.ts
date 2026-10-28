// src/services/realtime.ts — WebSocket client for the backend /realtime endpoint (replaces supabase.channel)
import { API_URL, getAccessToken } from './api';

type Handler = (event: string, data: any) => void;

let ws: WebSocket | null = null;
let connecting: Promise<void> | null = null;
let retry = 0;
const handlers = new Map<string, Set<Handler>>();

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

async function connect() {
  connecting ??= (async () => {
    const token = await getAccessToken();
    if (!token) return;
    ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/realtime?token=${encodeURIComponent(token)}`);
    ws.onopen = () => {
      retry = 0;
      for (const channel of handlers.keys()) send({ type: 'subscribe', channel });
    };
    ws.onmessage = (e) => {
      try {
        const { channel, event, data } = JSON.parse(String(e.data));
        handlers.get(channel)?.forEach((h) => h(event, data));
      } catch {}
    };
    ws.onclose = () => {
      ws = null;
      if (handlers.size) setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  })().finally(() => { connecting = null; });
  return connecting;
}

// channel: 'group:<id>' | 'user:<id>' | 'conversation:<id>'. Returns an unsubscribe function.
export function subscribe(channel: string, handler: Handler): () => void {
  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());
    send({ type: 'subscribe', channel });
  }
  handlers.get(channel)!.add(handler);
  if (!ws) connect();
  return () => {
    const set = handlers.get(channel);
    set?.delete(handler);
    if (set && !set.size) {
      handlers.delete(channel);
      send({ type: 'unsubscribe', channel });
      if (!handlers.size) ws?.close();
    }
  };
}
