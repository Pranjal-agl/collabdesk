import { Injectable, OnDestroy, signal } from '@angular/core';
import { Client, IMessage } from '@stomp/rx-stomp';
import { Observable, Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export type WsConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {

  readonly connectionState = signal<WsConnectionState>('DISCONNECTED');

  private client: Client | null = null;
  private reconnectAttempt = 0;
  private readonly MAX_BACKOFF_MS = 30_000;
  private readonly destroy$ = new Subject<void>();

  constructor(private auth: AuthService) {}

  connect(): void {
    if (this.client?.active) return;

    const token = this.auth.getToken();
    if (!token) return;

    this.connectionState.set('CONNECTING');

    this.client = new Client({
      brokerURL: environment.wsUrl,
      connectHeaders: { Authorization: `Bearer ${token}` },
      // Exponential backoff: on disconnect, wait before reconnecting
      reconnectDelay: 0,   // we control reconnect manually
    });

    this.client.onConnect    = ()  => this.onConnected();
    this.client.onDisconnect = ()  => this.scheduleReconnect();
    this.client.onStompError = ()  => this.scheduleReconnect();

    this.client.activate();
  }

  /**
   * Subscribe to a STOMP topic.
   * Returns an Observable that emits parsed message bodies.
   */
  subscribe<T>(destination: string): Observable<T> {
    return new Observable(observer => {
      const sub = this.client?.subscribe(destination, (msg: IMessage) => {
        try {
          observer.next(JSON.parse(msg.body) as T);
        } catch {
          // skip malformed messages
        }
      });
      return () => sub?.unsubscribe();
    });
  }

  disconnect(): void {
    this.client?.deactivate();
    this.connectionState.set('DISCONNECTED');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.disconnect();
  }

  private onConnected(): void {
    this.reconnectAttempt = 0;
    this.connectionState.set('CONNECTED');
  }

  private scheduleReconnect(): void {
    this.connectionState.set('DISCONNECTED');
    const backoff = Math.min(1000 * 2 ** this.reconnectAttempt, this.MAX_BACKOFF_MS);
    this.reconnectAttempt++;

    timer(backoff)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.connect());
  }
}
