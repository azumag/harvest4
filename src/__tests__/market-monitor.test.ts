import { MarketMonitor } from '../monitoring/market-monitor';
import { MarketAlert } from '../types/bitbank';
import { WebSocketStream } from '../api/websocket-stream';
import { OrderBookManager } from '../api/orderbook-manager';
import { VolumeAnalyzer } from '../analysis/volume-analyzer';
import { MicrostructureAnalyzer } from '../analysis/microstructure-analyzer';

// Mock all dependencies
jest.mock('../api/websocket-stream');
jest.mock('../api/orderbook-manager');
jest.mock('../analysis/volume-analyzer');
jest.mock('../analysis/microstructure-analyzer');

describe('MarketMonitor', () => {
  let marketMonitor: MarketMonitor;
  let mockWebSocketStream: any;
  let mockOrderBookManager: any;
  let mockVolumeAnalyzer: any;
  let mockMicrostructureAnalyzer: any;

  beforeEach(() => {
    // Setup mocks - using jest.mock at the top of the file

    mockWebSocketStream = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      on: jest.fn(),
      isConnectionHealthy: jest.fn().mockReturnValue(true),
      getConnectionStats: jest.fn().mockReturnValue({
        isConnected: true,
        connectionAge: 10000,
        timeSinceLastMessage: 1000,
        reconnectAttempts: 0,
      }),
    };

    mockOrderBookManager = {
      on: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      updateOrderBook: jest.fn(),
      applyDepthDiff: jest.fn(),
    };

    mockVolumeAnalyzer = {
      on: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      addTransaction: jest.fn(),
    };

    mockMicrostructureAnalyzer = {
      on: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      addTransaction: jest.fn(),
      updateOrderBook: jest.fn(),
    };

    WebSocketStream.mockImplementation(() => mockWebSocketStream);
    OrderBookManager.mockImplementation(() => mockOrderBookManager);
    VolumeAnalyzer.mockImplementation(() => mockVolumeAnalyzer);
    MicrostructureAnalyzer.mockImplementation(() => mockMicrostructureAnalyzer);

    marketMonitor = new MarketMonitor({
      pair: 'btc_jpy',
      websocketEndpoint: 'wss://stream.bitbank.cc',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize market monitor with correct configuration', () => {
      expect(marketMonitor).toBeDefined();
      expect(mockWebSocketStream.on).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(mockWebSocketStream.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
      expect(mockWebSocketStream.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWebSocketStream.on).toHaveBeenCalledWith('ticker', expect.any(Function));
      expect(mockWebSocketStream.on).toHaveBeenCalledWith('transaction', expect.any(Function));
      expect(mockWebSocketStream.on).toHaveBeenCalledWith('orderbook', expect.any(Function));
      expect(mockWebSocketStream.on).toHaveBeenCalledWith('orderbook_diff', expect.any(Function));
    });

    it('should setup event handlers for all analyzers', () => {
      expect(mockOrderBookManager.on).toHaveBeenCalledWith('orderbook_updated', expect.any(Function));
      expect(mockOrderBookManager.on).toHaveBeenCalledWith('orderbook_analysis', expect.any(Function));
      expect(mockOrderBookManager.on).toHaveBeenCalledWith('alert', expect.any(Function));

      expect(mockVolumeAnalyzer.on).toHaveBeenCalledWith('volume_analysis', expect.any(Function));
      expect(mockVolumeAnalyzer.on).toHaveBeenCalledWith('alert', expect.any(Function));

      expect(mockMicrostructureAnalyzer.on).toHaveBeenCalledWith('microstructure_analysis', expect.any(Function));
      expect(mockMicrostructureAnalyzer.on).toHaveBeenCalledWith('alert', expect.any(Function));
    });
  });

  describe('Start and Stop', () => {
    it('should start market monitor and WebSocket stream', async () => {
      const startedListener = jest.fn();
      marketMonitor.on('started', startedListener);

      await marketMonitor.start();

      expect(mockWebSocketStream.connect).toHaveBeenCalled();
      expect(startedListener).toHaveBeenCalled();
    });

    it('should handle WebSocket connection errors', async () => {
      const error = new Error('Connection failed');
      mockWebSocketStream.connect.mockRejectedValue(error);

      await expect(marketMonitor.start()).rejects.toThrow('Connection failed');
    });

    it('should stop market monitor and WebSocket stream', () => {
      marketMonitor.stop();

      expect(mockWebSocketStream.disconnect).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      await marketMonitor.start();
      
      await expect(marketMonitor.start()).rejects.toThrow('Market monitor is already running');
    });
  });

  describe('Data Processing', () => {
    let dataUpdatedListener: jest.Mock;

    beforeEach(() => {
      dataUpdatedListener = jest.fn();
      marketMonitor.on('data_updated', dataUpdatedListener);
    });

    it('should process ticker data updates', () => {
      const tickerData = {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '100.5',
        timestamp: Date.now(),
      };

      // Simulate ticker event
      const tickerHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'ticker'
      )?.[1];

      if (tickerHandler) {
        tickerHandler(tickerData);
      }

      expect(dataUpdatedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          pair: 'btc_jpy',
          ticker: tickerData,
        })
      );
    });

    it('should process transaction data updates', () => {
      const transactionData = {
        transaction_id: 12345,
        side: 'buy' as const,
        price: '5000000',
        amount: '0.1',
        executed_at: Date.now(),
      };

      // Simulate transaction event
      const transactionHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'transaction'
      )?.[1];

      if (transactionHandler) {
        transactionHandler(transactionData);
      }

      expect(mockVolumeAnalyzer.addTransaction).toHaveBeenCalledWith(transactionData);
      expect(mockMicrostructureAnalyzer.addTransaction).toHaveBeenCalledWith(transactionData);
      expect(dataUpdatedListener).toHaveBeenCalled();
    });

    it('should process order book data updates', () => {
      const orderBookData = {
        asks: [{ price: '5000000', amount: '0.1' }],
        bids: [{ price: '4999000', amount: '0.15' }],
        asks_over: '0',
        bids_under: '0',
        asks_count: 1,
        bids_count: 1,
        sequence_id: 1,
        timestamp: Date.now(),
      };

      // Simulate orderbook event
      const orderBookHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'orderbook'
      )?.[1];

      if (orderBookHandler) {
        orderBookHandler(orderBookData);
      }

      expect(mockOrderBookManager.updateOrderBook).toHaveBeenCalledWith(orderBookData);
      expect(mockMicrostructureAnalyzer.updateOrderBook).toHaveBeenCalledWith(orderBookData);
    });

    it('should process order book diff updates', () => {
      const diffData = {
        asks: [{ price: '5000000', amount: '0.05' }],
        bids: [{ price: '4999000', amount: '0' }],
        sequence_id: 2,
        timestamp: Date.now(),
      };

      // Simulate orderbook_diff event
      const diffHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'orderbook_diff'
      )?.[1];

      if (diffHandler) {
        diffHandler(diffData);
      }

      expect(mockOrderBookManager.applyDepthDiff).toHaveBeenCalledWith(diffData);
    });
  });

  describe('Alert Management', () => {
    let alertListener: jest.Mock;

    beforeEach(() => {
      alertListener = jest.fn();
      marketMonitor.on('alert', alertListener);
    });

    it('should handle alerts from analyzers', () => {
      const alert: MarketAlert = {
        type: 'volume',
        level: 'high',
        message: 'Volume spike detected',
        timestamp: Date.now(),
        data: { volume: 1000 },
      };

      // Simulate alert from volume analyzer
      const alertHandler = mockVolumeAnalyzer.on.mock.calls.find(
        ([event]: [string]) => event === 'alert'
      )?.[1];

      if (alertHandler) {
        alertHandler(alert);
      }

      expect(alertListener).toHaveBeenCalledWith(alert);
    });

    it('should track alert thresholds', () => {
      const thresholdListener = jest.fn();
      marketMonitor.on('alert_threshold_exceeded', thresholdListener);

      // Generate multiple critical alerts
      for (let i = 0; i < 15; i++) {
        const alert: MarketAlert = {
          type: 'system',
          level: 'critical',
          message: `Critical alert ${i}`,
          timestamp: Date.now(),
          data: {},
        };

        const alertHandler = mockVolumeAnalyzer.on.mock.calls.find(
          ([event]: [string]) => event === 'alert'
        )?.[1];

        if (alertHandler) {
          alertHandler(alert);
        }
      }

      expect(thresholdListener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'critical',
          count: 15,
        })
      );
    });

    it('should clear alerts', () => {
      const alert: MarketAlert = {
        type: 'volume',
        level: 'high',
        message: 'Test alert',
        timestamp: Date.now(),
        data: {},
      };

      // Add an alert
      const alertHandler = mockVolumeAnalyzer.on.mock.calls.find(
        ([event]: [string]) => event === 'alert'
      )?.[1];

      if (alertHandler) {
        alertHandler(alert);
      }

      expect(marketMonitor.getAlerts()).toHaveLength(1);

      marketMonitor.clearAlerts();
      expect(marketMonitor.getAlerts()).toHaveLength(0);
    });
  });

  describe('Health Monitoring', () => {
    it('should perform health checks', () => {
      const healthListener = jest.fn();
      marketMonitor.on('health_check', healthListener);

      // Start health monitoring
      marketMonitor.start();

      // Advance timers to trigger health check
      jest.advanceTimersByTime(30000);

      expect(healthListener).toHaveBeenCalledWith(
        expect.objectContaining({
          websocket: true,
          orderBook: true,
          volume: true,
          microstructure: true,
          overall: true,
        })
      );
    });

    it('should detect unhealthy components', () => {
      mockVolumeAnalyzer.isHealthy.mockReturnValue(false);

      const health = marketMonitor.getHealthStatus();

      expect(health.overall).toBe(false);
      expect(health.volume).toBe(false);
    });
  });

  describe('Real-time Data Access', () => {
    it('should provide real-time market data', () => {
      const realtimeData = marketMonitor.getRealtimeData();

      expect(realtimeData).toHaveProperty('pair');
      expect(realtimeData).toHaveProperty('orderBook');
      expect(realtimeData).toHaveProperty('recentTransactions');
      expect(realtimeData).toHaveProperty('ticker');
      expect(realtimeData).toHaveProperty('analysis');
      expect(realtimeData).toHaveProperty('alerts');
      expect(realtimeData).toHaveProperty('lastUpdated');
    });

    it('should filter alerts by level', () => {
      const alerts = [
        { type: 'volume', level: 'high', message: 'High alert', timestamp: Date.now(), data: {} },
        { type: 'system', level: 'critical', message: 'Critical alert', timestamp: Date.now(), data: {} },
        { type: 'spread', level: 'medium', message: 'Medium alert', timestamp: Date.now(), data: {} },
      ];

      alerts.forEach(alert => {
        const alertHandler = mockVolumeAnalyzer.on.mock.calls.find(
          ([event]: [string]) => event === 'alert'
        )?.[1];

        if (alertHandler) {
          alertHandler(alert);
        }
      });

      expect(marketMonitor.getAlerts('high')).toHaveLength(1);
      expect(marketMonitor.getAlerts('critical')).toHaveLength(1);
      expect(marketMonitor.getAlerts('medium')).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should provide market monitor statistics', () => {
      const stats = marketMonitor.getStats();

      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('alertCount');
      expect(stats).toHaveProperty('dataUpdates');
      expect(stats).toHaveProperty('connectionStats');
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket connection errors', () => {
      const errorListener = jest.fn();
      marketMonitor.on('error', errorListener);

      // Simulate WebSocket error
      const errorHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'error'
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error('WebSocket error'));
      }

      expect(errorListener).toHaveBeenCalledWith(new Error('WebSocket error'));
    });

    it('should handle disconnection events', () => {
      const disconnectedListener = jest.fn();
      marketMonitor.on('disconnected', disconnectedListener);

      // Simulate WebSocket disconnection
      const disconnectHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'disconnected'
      )?.[1];

      if (disconnectHandler) {
        disconnectHandler('transport close');
      }

      expect(disconnectedListener).toHaveBeenCalledWith('transport close');
    });
  });

  describe('Integration', () => {
    it('should coordinate all components correctly', async () => {
      await marketMonitor.start();

      // Simulate a complete data flow
      const tickerData = {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '100.5',
        timestamp: Date.now(),
      };

      const transactionData = {
        transaction_id: 12345,
        side: 'buy' as const,
        price: '5000000',
        amount: '0.1',
        executed_at: Date.now(),
      };

      const orderBookData = {
        asks: [{ price: '5000000', amount: '0.1' }],
        bids: [{ price: '4999000', amount: '0.15' }],
        asks_over: '0',
        bids_under: '0',
        asks_count: 1,
        bids_count: 1,
        sequence_id: 1,
        timestamp: Date.now(),
      };

      // Simulate events
      const tickerHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'ticker'
      )?.[1];
      const transactionHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'transaction'
      )?.[1];
      const orderBookHandler = mockWebSocketStream.on.mock.calls.find(
        ([event]: [string]) => event === 'orderbook'
      )?.[1];

      if (tickerHandler) tickerHandler(tickerData);
      if (transactionHandler) transactionHandler(transactionData);
      if (orderBookHandler) orderBookHandler(orderBookData);

      // Verify all components received the data
      expect(mockVolumeAnalyzer.addTransaction).toHaveBeenCalledWith(transactionData);
      expect(mockMicrostructureAnalyzer.addTransaction).toHaveBeenCalledWith(transactionData);
      expect(mockOrderBookManager.updateOrderBook).toHaveBeenCalledWith(orderBookData);
      expect(mockMicrostructureAnalyzer.updateOrderBook).toHaveBeenCalledWith(orderBookData);
    });
  });
});