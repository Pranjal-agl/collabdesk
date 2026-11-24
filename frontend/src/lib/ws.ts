// WebSocket client: STOMP over WebSocket against the Spring Boot broker in real
// mode, or the in-browser demo bus in demo mode. Both expose the same surface.
//
// Reconnect strategy: exponential backoff 1s -> 2s -> 4s ... capped at 30s,
// reset on successful connect. Subscriptions made while disconnected are
// queued by stompjs and re-established on connect, so a page never has to
// special-case a dropped socket — presence re-joins via the pages' own effects.

import { Client, IMessage } from '@stomp/stompjs';
import { demoBus } from './demo';

export type WsState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

type StateListener = (state: WsState) => void;
type MessageHandler = (msg: unknown) => void;

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const MAX_BACKOFF_MS = 30_000;
// Safety net only — real backoff is scheduled manually below.
const STOMP_OWN_RETRY_MS = 120_000;

class WsClient {
  private client: Client | null = null;
  private state: WsState = 'DISCONNECTED';
  private stateListeners = new Set<StateListener>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();

  getState(): WsState {
    return this.state;
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  connect(accessToken: string): void {
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING') return;
    this.setState('CONNECTING');

    if (DEMO) {
      this.sessionId = crypto.randomUUID();
      demoBus.connect(this.sessionId).then(() => {
        this.reconnectAttempt = 0;
        this.setState('CONNECTED');
      });
      return;
    }

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    this.client = new Client({
      brokerURL: `${scheme}://${location.host}/ws/websocket`,
      connectHeaders: { Authorization: `Bearer ${accessToken}` },
      reconnectDelay: STOMP_OWN_RETRY_MS,
      onConnect: () => {
        this.reconnectAttempt = 0;
        this.setState('CONNECTED');
      },
      onWebSocketClose: () => this.scheduleReconnect(),
      onWebSocketError: () => this.scheduleReconnect(),
      onStompError: () => this.scheduleReconnect(),
    });
    // Replay subscriptions registered while disconnected.
    for (const [topic, handlers] of this.handlers) {
      for (const handler of handlers) this.watch(topic, handler);
    }
    this.client.activate();
  }

  subscribe<T>(topic: string, handler: (msg: T) => void): () => void {
    let set = this.handlers.get(topic);
    if (!set) this.handlers.set(topic, (set = new Set()));
    set.add(handler as MessageHandler);

    if (DEMO) {
      const unsub = demoBus.subscribe(topic, handler as MessageHandler);
      return () => {
        unsub();
        set!.delete(handler as MessageHandler);
      };
    }
    if (this.client?.connected) this.watch(topic, handler as MessageHandler);
    // If not connected yet, connect() replays all registered handlers.
    return () => {
      set!.delete(handler as MessageHandler);
    };
  }

  publish(destination: string, body: unknown): void {
    if (DEMO) {
      demoBus.publish(this.sessionId, destination, body);
      return;
    }
    this.client?.publish({ destination, body: JSON.stringify(body) });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    if (DEMO) {
      if (this.sessionId) demoBus.disconnect(this.sessionId);
      this.sessionId = null;
    } else {
      this.client?.deactivate();
      this.client = null;
    }
    this.setState('DISCONNECTED');
  }

  private watch(topic: string, handler: MessageHandler): void {
    this.client!.subscribe(topic, (message: IMessage) => {
      try {
        handler(JSON.parse(message.body));
      } catch {
        // skip malformed frames
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.state === 'DISCONNECTED') return; // already scheduling / giving up
    this.setState('DISCONNECTED');
    const backoff = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      const token = localStorage.getItem('cd_access_token');
      if (token) this.connect(token);
    }, backoff);
  }

  private setState(state: WsState): void {
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}

export const ws = new WsClient();
