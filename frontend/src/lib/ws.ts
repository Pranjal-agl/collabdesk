// WebSocket client: STOMP over WebSocket against the Spring Boot broker in real
// mode, or the in-browser demo bus in demo mode. Both expose the same surface.
//
// Real mode, in short:
//  - One stompjs Client for the whole session. stompjs owns reconnection,
//    with exponential backoff (1s -> 2s -> 4s ... capped at 30s).
//  - Before every (re)connect, beforeConnect makes sure the access token is
//    fresh: STOMP sends it once on CONNECT, and the server refuses
//    subscriptions from sessions that didn't authenticate.
//  - Subscriptions are only sent to the server while connected; each topic
//    gets one STOMP subscription that fans out to every local handler, and
//    they are all re-established on each reconnect.
//  - Presence joins are remembered and replayed after a reconnect, because a
//    new socket is a new session as far as the server's roster is concerned.
//  - publish() while disconnected is dropped instead of throwing.

import { Client, ReconnectionTimeMode, type IMessage, type StompSubscription } from '@stomp/stompjs';
import { demoBus } from './demo';
import { freshAccessToken } from './api';

export type WsState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

type StateListener = (state: WsState) => void;
type MessageHandler = (msg: unknown) => void;

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const PRESENCE = /^\/app\/presence\/([^/]+)\/(join|leave)$/;

class WsClient {
  private client: Client | null = null;
  private state: WsState = 'DISCONNECTED';
  private stateListeners = new Set<StateListener>();
  private sessionId: string | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private subscriptions = new Map<string, StompSubscription>();
  private joinedProjects = new Set<string>();
  private refreshOnNextConnect = false;

  getState(): WsState {
    return this.state;
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /** Starts the session's connection. Safe to call more than once. */
  connect(_accessToken?: string): void {
    if (DEMO) {
      if (this.sessionId) return;
      this.sessionId = crypto.randomUUID();
      this.setState('CONNECTING');
      void demoBus.connect(this.sessionId).then(() => this.setState('CONNECTED'));
      return;
    }
    if (this.client) return;

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const client = new Client({
      brokerURL: `${scheme}://${location.host}/ws/websocket`,
      reconnectDelay: 1000,
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
      maxReconnectDelay: 30_000,
      heartbeatIncoming: 20_000,
      heartbeatOutgoing: 20_000,
      beforeConnect: async () => {
        this.setState('CONNECTING');
        const token = await freshAccessToken(this.refreshOnNextConnect);
        this.refreshOnNextConnect = false;
        if (!token) {
          // Signed out (or the refresh token is gone): stop trying.
          void client.deactivate();
          this.client = null;
          this.setState('DISCONNECTED');
          return;
        }
        client.connectHeaders = { Authorization: `Bearer ${token}` };
      },
      onConnect: () => {
        this.setState('CONNECTED');
        this.subscriptions.clear();
        for (const topic of this.handlers.keys()) this.watch(topic);
        for (const projectId of this.joinedProjects) client.publish({ destination: `/app/presence/${projectId}/join`, body: '{}' });
      },
      onStompError: () => {
        // The server refused us (most likely an expired or revoked token).
        // Force a token refresh before stompjs's next attempt.
        this.refreshOnNextConnect = true;
      },
      onWebSocketClose: () => {
        this.subscriptions.clear();
        if (this.client === client) this.setState('CONNECTING');
      },
    });
    this.client = client;
    client.activate();
  }

  subscribe<T>(topic: string, handler: (msg: T) => void): () => void {
    let set = this.handlers.get(topic);
    if (!set) this.handlers.set(topic, (set = new Set()));
    set.add(handler as MessageHandler);

    if (DEMO) {
      const unsubscribe = demoBus.subscribe(topic, handler as MessageHandler);
      return () => {
        unsubscribe();
        this.forget(topic, handler as MessageHandler);
      };
    }

    if (this.client?.connected && !this.subscriptions.has(topic)) this.watch(topic);
    return () => this.forget(topic, handler as MessageHandler);
  }

  publish(destination: string, body: unknown): void {
    const presence = destination.match(PRESENCE);
    if (presence) {
      if (presence[2] === 'join') this.joinedProjects.add(presence[1]);
      else this.joinedProjects.delete(presence[1]);
    }
    if (DEMO) {
      demoBus.publish(this.sessionId, destination, body);
      return;
    }
    // Cursor/typing frames are disposable; presence is replayed on connect.
    if (!this.client?.connected) return;
    this.client.publish({ destination, body: JSON.stringify(body ?? {}) });
  }

  disconnect(): void {
    this.joinedProjects.clear();
    this.subscriptions.clear();
    if (DEMO) {
      if (this.sessionId) demoBus.disconnect(this.sessionId);
      this.sessionId = null;
    } else {
      const client = this.client;
      this.client = null;
      void client?.deactivate();
    }
    this.setState('DISCONNECTED');
  }

  /** One server subscription per topic, fanning out to every local handler. */
  private watch(topic: string): void {
    const client = this.client;
    if (!client?.connected) return;
    const subscription = client.subscribe(topic, (message: IMessage) => {
      let payload: unknown;
      try {
        payload = JSON.parse(message.body);
      } catch {
        return; // skip malformed frames
      }
      this.handlers.get(topic)?.forEach((handler) => handler(payload));
    });
    this.subscriptions.set(topic, subscription);
  }

  private forget(topic: string, handler: MessageHandler): void {
    const set = this.handlers.get(topic);
    if (!set) return;
    set.delete(handler);
    if (set.size > 0) return;
    this.handlers.delete(topic);
    const subscription = this.subscriptions.get(topic);
    this.subscriptions.delete(topic);
    if (subscription && this.client?.connected) subscription.unsubscribe();
  }

  private setState(state: WsState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}

export const ws = new WsClient();
