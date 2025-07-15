import { EventEmitter } from 'events';
import { WebSocketStream } from '../api/websocket-stream';
import { OrderBookManager } from '../api/orderbook-manager';
import { VolumeAnalyzer } from '../analysis/volume-analyzer';
import { MicrostructureAnalyzer } from '../analysis/microstructure-analyzer';
import {
  RealtimeMarketData,
  OrderBookData,
  TransactionData,
  TickerStreamData,
  MarketAlert,
  OrderBookAnalysis,
  VolumeAnalysis,
  MarketMicrostructure
} from '../types/bitbank';

interface MarketMonitorConfig {
  pair: string;
  websocketEndpoint?: string;
  orderBookConfig?: unknown;
  volumeConfig?: unknown;
  microstructureConfig?: unknown;
  alertThresholds?: {
    critical: number;
    high: number;
    medium: number;
  };
}

export class MarketMonitor extends EventEmitter {
  private config: MarketMonitorConfig;
  private websocketStream: WebSocketStream;
  private orderBookManager: OrderBookManager;
  private volumeAnalyzer: VolumeAnalyzer;
  private microstructureAnalyzer: MicrostructureAnalyzer;
  
  private realtimeData: RealtimeMarketData;
  private alerts: MarketAlert[] = [];
  private isRunning = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: MarketMonitorConfig) {
    super();
    
    this.config = {
      websocketEndpoint: 'wss://stream.bitbank.cc',
      alertThresholds: {
        critical: 10,
        high: 50,
        medium: 100
      },
      ...config
    };

    this.websocketStream = new WebSocketStream({
      endpoint: this.config.websocketEndpoint!,
      pair: this.config.pair
    });

    this.orderBookManager = new OrderBookManager(this.config.orderBookConfig as any);
    this.volumeAnalyzer = new VolumeAnalyzer(this.config.volumeConfig as any);
    this.microstructureAnalyzer = new MicrostructureAnalyzer(this.config.microstructureConfig as any);

    this.realtimeData = {
      pair: this.config.pair,
      orderBook: {
        asks: [],
        bids: [],
        asks_over: '0',
        bids_under: '0',
        asks_count: 0,
        bids_count: 0,
        sequence_id: 0,
        timestamp: 0
      },
      recentTransactions: [],
      ticker: {
        pair: this.config.pair,
        sell: '0',
        buy: '0',
        high: '0',
        low: '0',
        last: '0',
        vol: '0',
        timestamp: 0
      },
      analysis: {
        orderBook: this.getEmptyOrderBookAnalysis(),
        volume: this.getEmptyVolumeAnalysis(),
        microstructure: this.getEmptyMicrostructureAnalysis()
      },
      alerts: [],
      lastUpdated: 0
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // WebSocket stream events
    this.websocketStream.on('connected', () => {
      this.emit('connected');
    });

    this.websocketStream.on('disconnected', (reason) => {
      this.emit('disconnected', reason);
    });

    this.websocketStream.on('error', (error) => {
      this.emit('error', error);
    });

    this.websocketStream.on('ticker', (ticker: TickerStreamData) => {
      this.updateTicker(ticker);
    });

    this.websocketStream.on('transaction', (transaction: TransactionData) => {
      this.updateTransaction(transaction);
    });

    this.websocketStream.on('orderbook', (orderbook: OrderBookData) => {
      this.updateOrderBook(orderbook);
    });

    this.websocketStream.on('orderbook_diff', (diff) => {
      this.orderBookManager.applyDepthDiff(diff);
    });

    // Order book manager events
    this.orderBookManager.on('orderbook_updated', (orderbook: OrderBookData) => {
      this.realtimeData.orderBook = orderbook;
      this.updateRealtimeData();
    });

    this.orderBookManager.on('orderbook_analysis', (analysis: OrderBookAnalysis) => {
      this.realtimeData.analysis.orderBook = analysis;
      this.updateRealtimeData();
    });

    this.orderBookManager.on('alert', (alert: MarketAlert) => {
      this.handleAlert(alert);
    });

    // Volume analyzer events
    this.volumeAnalyzer.on('volume_analysis', (analysis: VolumeAnalysis) => {
      this.realtimeData.analysis.volume = analysis;
      this.updateRealtimeData();
    });

    this.volumeAnalyzer.on('alert', (alert: MarketAlert) => {
      this.handleAlert(alert);
    });

    // Microstructure analyzer events
    this.microstructureAnalyzer.on('microstructure_analysis', (analysis: MarketMicrostructure) => {
      this.realtimeData.analysis.microstructure = analysis;
      this.updateRealtimeData();
    });

    this.microstructureAnalyzer.on('alert', (alert: MarketAlert) => {
      this.handleAlert(alert);
    });

    // WebSocket stream alerts
    this.websocketStream.on('alert', (alert: MarketAlert) => {
      this.handleAlert(alert);
    });
  }

  private updateTicker(ticker: TickerStreamData): void {
    this.realtimeData.ticker = ticker;
    this.updateRealtimeData();
  }

  private updateTransaction(transaction: TransactionData): void {
    // Add to recent transactions (keep last 100)
    this.realtimeData.recentTransactions.push(transaction);
    if (this.realtimeData.recentTransactions.length > 100) {
      this.realtimeData.recentTransactions.shift();
    }

    // Update analyzers
    this.volumeAnalyzer.addTransaction(transaction);
    this.microstructureAnalyzer.addTransaction(transaction);
    
    this.updateRealtimeData();
  }

  private updateOrderBook(orderbook: OrderBookData): void {
    this.orderBookManager.updateOrderBook(orderbook);
    this.microstructureAnalyzer.updateOrderBook(orderbook);
  }

  private updateRealtimeData(): void {
    this.realtimeData.lastUpdated = Date.now();
    this.emit('data_updated', this.realtimeData);
  }

  private handleAlert(alert: MarketAlert): void {
    // Add to alerts array
    this.alerts.push(alert);
    this.realtimeData.alerts.push(alert);

    // Keep only recent alerts (last 1000)
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }

    if (this.realtimeData.alerts.length > 100) {
      this.realtimeData.alerts.shift();
    }

    // Check alert thresholds
    this.checkAlertThresholds();
    
    this.emit('alert', alert);
    this.updateRealtimeData();
  }

  private checkAlertThresholds(): void {
    const recentAlerts = this.alerts.filter(alert => 
      Date.now() - alert.timestamp < 300000 // Last 5 minutes
    );

    const criticalAlerts = recentAlerts.filter(alert => alert.level === 'critical');
    const highAlerts = recentAlerts.filter(alert => alert.level === 'high');
    const mediumAlerts = recentAlerts.filter(alert => alert.level === 'medium');

    if (criticalAlerts.length >= this.config.alertThresholds!.critical) {
      this.emit('alert_threshold_exceeded', {
        level: 'critical',
        count: criticalAlerts.length,
        threshold: this.config.alertThresholds!.critical
      });
    }

    if (highAlerts.length >= this.config.alertThresholds!.high) {
      this.emit('alert_threshold_exceeded', {
        level: 'high',
        count: highAlerts.length,
        threshold: this.config.alertThresholds!.high
      });
    }

    if (mediumAlerts.length >= this.config.alertThresholds!.medium) {
      this.emit('alert_threshold_exceeded', {
        level: 'medium',
        count: mediumAlerts.length,
        threshold: this.config.alertThresholds!.medium
      });
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Market monitor is already running');
    }

    try {
      await this.websocketStream.connect();
      this.isRunning = true;
      this.startHealthCheck();
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.websocketStream.disconnect();
    this.stopHealthCheck();
    this.isRunning = false;
    this.emit('stopped');
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      const health = this.getHealthStatus();
      this.emit('health_check', health);
      
      if (!health.overall) {
        this.handleAlert({
          type: 'system',
          level: 'high',
          message: 'System health check failed',
          timestamp: Date.now(),
          data: health
        });
      }
    }, 30000); // Check every 30 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  public getRealtimeData(): RealtimeMarketData {
    return this.realtimeData;
  }

  public getAlerts(level?: MarketAlert['level']): MarketAlert[] {
    if (level) {
      return this.alerts.filter(alert => alert.level === level);
    }
    return [...this.alerts];
  }

  public getHealthStatus(): {
    websocket: boolean;
    orderBook: boolean;
    volume: boolean;
    microstructure: boolean;
    overall: boolean;
  } {
    const websocket = this.websocketStream.isConnectionHealthy();
    const orderBook = this.orderBookManager.isHealthy();
    const volume = this.volumeAnalyzer.isHealthy();
    const microstructure = this.microstructureAnalyzer.isHealthy();
    
    return {
      websocket,
      orderBook,
      volume,
      microstructure,
      overall: websocket && orderBook && volume && microstructure
    };
  }

  public getStats(): {
    uptime: number;
    alertCount: number;
    dataUpdates: number;
    connectionStats: unknown;
  } {
    return {
      uptime: this.isRunning ? Date.now() - this.realtimeData.lastUpdated : 0,
      alertCount: this.alerts.length,
      dataUpdates: this.realtimeData.lastUpdated,
      connectionStats: this.websocketStream.getConnectionStats()
    };
  }

  public clearAlerts(): void {
    this.alerts = [];
    this.realtimeData.alerts = [];
    this.emit('alerts_cleared');
  }

  public isMonitorRunning(): boolean {
    return this.isRunning;
  }

  private getEmptyOrderBookAnalysis(): OrderBookAnalysis {
    return {
      bidAskSpread: 0,
      bidAskSpreadPercent: 0,
      midPrice: 0,
      totalBidVolume: 0,
      totalAskVolume: 0,
      orderBookImbalance: 0,
      supportLevel: 0,
      resistanceLevel: 0,
      liquidityDepth: 0,
      largeOrderThreshold: 0,
      largeOrders: { bids: [], asks: [] }
    };
  }

  private getEmptyVolumeAnalysis(): VolumeAnalysis {
    return {
      currentVolume: 0,
      volumeMA: 0,
      volumeSpike: false,
      volumeProfile: [],
      twap: 0,
      vwap: 0,
      institutionalActivity: 0
    };
  }

  private getEmptyMicrostructureAnalysis(): MarketMicrostructure {
    return {
      averageSpread: 0,
      spreadTrend: 'stable',
      tradeFrequency: 0,
      priceImpact: 0,
      liquidityProviders: {},
      executionQuality: 0
    };
  }
}