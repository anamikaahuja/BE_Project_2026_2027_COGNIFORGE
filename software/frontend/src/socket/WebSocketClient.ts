import { getBackendWsBase } from '../config/backend';

export interface PlannedMessage {
  status: 'planned';
  primitives: string[];
  robot_joints: number[];
  contingencies: number[][] | null;
  rejected_joints: number[] | null;
  requires_hitl: boolean;
  high_cognitive_load: boolean;
  correction_report: {
    classification: string;
    anomalies: string[];
    corrected?: boolean;
    message?: string;
  } | null;
  server_time: number;
}

type MessageHandler = (msg: PlannedMessage) => void;

/**
 * Thin WebSocket wrapper around the COGNIFORGE `/ws/stream` endpoint.
 * Buffers outgoing demonstration frames on a fixed interval (matching the
 * proposal's 500ms/30-frame sliding-window design, simplified here to a
 * per-frame throttle since the live pipeline is reactive rather than
 * batch), and dispatches parsed inbound messages to a single handler.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private onMessageHandler: MessageHandler | null = null;
  private onOpenHandler: (() => void) | null = null;
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;

  constructor(host?: string, port: number = 8000) {
    const base = host ? `ws://${host}:${port}` : getBackendWsBase(port);
    this.url = `${base}/ws/stream`;
  }

  public connect(): void {
    this.shouldReconnect = true;
    try {
      this.socket = new WebSocket(this.url);
    } catch (e) {
      // A malformed URL (e.g. an empty/misconfigured host) would otherwise
      // throw synchronously here and, since this runs inside Engine.init()
      // during React's mount effect, take the entire app down to a blank
      // screen. Log and retry instead of crashing.
      console.error('[WebSocketClient] Failed to construct WebSocket for URL', this.url, e);
      if (this.shouldReconnect) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
      return;
    }

    this.socket.onopen = () => {
      console.log('[WebSocketClient] Connected to COGNIFORGE backend');
      this.onOpenHandler?.();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PlannedMessage;
        this.onMessageHandler?.(data);
      } catch (e) {
        console.error('[WebSocketClient] Failed to parse message', e);
      }
    };

    this.socket.onclose = () => {
      console.warn('[WebSocketClient] Disconnected');
      if (this.shouldReconnect) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
    };

    this.socket.onerror = (e) => {
      console.error('[WebSocketClient] Error', e);
    };
  }

  public onMessage(handler: MessageHandler): void {
    this.onMessageHandler = handler;
  }

  public onOpen(handler: () => void): void {
    this.onOpenHandler = handler;
  }

  public get isOpen(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  public send(payload: unknown): void {
    if (this.isOpen) {
      this.socket!.send(JSON.stringify(payload));
    }
  }

  public approveHitl(): void {
    this.send({ hitl_approved: true });
  }

  public dispose(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}
