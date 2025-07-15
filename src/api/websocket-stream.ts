import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import {
  OrderBookData,
  DepthDiffData,
  TransactionData,
  TickerStreamData,
  WebSocketChannels,
  MarketAlert
} from '../types/bitbank';

interface WebSocketStreamConfig {
  endpoint: string;
  pair: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export class WebSocketStream extends EventEmitter {
  private socket: Socket | null = null;
  private config: WebSocketStreamConfig;
  private channels: WebSocketChannels;
  private reconnectAttempts = 0;
  private isConnected = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectionStartTime = 0;
  private lastMessageTime = 0;

  constructor(config: WebSocketStreamConfig) {
    super();
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      ...config
    };
    
    this.channels = {
      ticker: `ticker_${config.pair}`,
      transactions: `transactions_${config.pair}`,
      depth_diff: `depth_diff_${config.pair}`,
      depth_whole: `depth_whole_${config.pair}`
    };
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.connectionStartTime = Date.now();
        
        this.socket = io(this.config.endpoint, {
          transports: ['websocket'],
          upgrade: false,
          rememberUpgrade: false,
          timeout: 20000,
          forceNew: true,
          autoConnect: false
        });

        this.setupEventHandlers();
        this.socket.connect();

        this.socket.on('connect', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.subscribeToChannels();
          this.emit('connected');
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          this.handleConnectionError(error);
          reject(error);
        });

      } catch (error) {
        this.handleConnectionError(error);
        reject(error);
      }
    });
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('disconnected', reason);
      
      if (reason === 'io server disconnect') {
        this.attemptReconnect();
      }
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
      this.emitAlert('system', 'high', 'WebSocket error occurred', error);
    });

    // Handle ticker updates
    this.socket.on(this.channels.ticker, (data: TickerStreamData) => {
      this.lastMessageTime = Date.now();
      this.emit('ticker', data);
    });

    // Handle transaction updates
    this.socket.on(this.channels.transactions, (data: TransactionData) => {
      this.lastMessageTime = Date.now();
      this.emit('transaction', data);
    });

    // Handle full order book updates
    this.socket.on(this.channels.depth_whole, (data: OrderBookData) => {
      this.lastMessageTime = Date.now();
      this.emit('orderbook', data);
    });

    // Handle incremental order book updates
    this.socket.on(this.channels.depth_diff, (data: DepthDiffData) => {
      this.lastMessageTime = Date.now();
      this.emit('orderbook_diff', data);
    });
  }

  private subscribeToChannels(): void {
    if (!this.socket || !this.isConnected) return;

    // Join all channels for the trading pair
    this.socket.emit('join-room', this.channels.ticker);
    this.socket.emit('join-room', this.channels.transactions);
    this.socket.emit('join-room', this.channels.depth_whole);
    this.socket.emit('join-room', this.channels.depth_diff);

    this.emit('subscribed', this.channels);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;
      
      if (timeSinceLastMessage > this.config.heartbeatInterval! * 2) {
        this.emitAlert('system', 'medium', 'No messages received for extended period', {
          timeSinceLastMessage,
          threshold: this.config.heartbeatInterval! * 2
        });
      }

      // Send ping to keep connection alive
      if (this.socket && this.isConnected) {
        this.socket.emit('ping');
      }
    }, this.config.heartbeatInterval!);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      this.emitAlert('system', 'critical', 'Max reconnection attempts reached', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts
      });
      return;
    }

    this.reconnectAttempts++;
    
    this.emitAlert('system', 'medium', 'Attempting to reconnect', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts
    });

    setTimeout(() => {
      this.connect().catch((error) => {
        this.handleConnectionError(error);
      });
    }, this.config.reconnectInterval!);
  }

  private handleConnectionError(error: unknown): void {
    this.emitAlert('system', 'high', 'Connection error occurred', error);
    
    if (this.reconnectAttempts < this.config.maxReconnectAttempts!) {
      this.attemptReconnect();
    }
  }

  private emitAlert(type: MarketAlert['type'], level: MarketAlert['level'], message: string, data?: unknown): void {
    const alert: MarketAlert = {
      type,
      level,
      message,
      timestamp: Date.now(),
      data
    };
    
    this.emit('alert', alert);
  }

  public disconnect(): void {
    this.isConnected = false;
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public isConnectionHealthy(): boolean {
    const now = Date.now();
    const connectionAge = now - this.connectionStartTime;
    const timeSinceLastMessage = now - this.lastMessageTime;
    
    return (
      this.isConnected &&
      connectionAge > 5000 && // Connection established for at least 5 seconds
      timeSinceLastMessage < 60000 // Received message within last minute
    );
  }

  public getConnectionStats(): {
    isConnected: boolean;
    connectionAge: number;
    timeSinceLastMessage: number;
    reconnectAttempts: number;
  } {
    const now = Date.now();
    return {
      isConnected: this.isConnected,
      connectionAge: now - this.connectionStartTime,
      timeSinceLastMessage: now - this.lastMessageTime,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}