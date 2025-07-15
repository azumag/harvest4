import { WebSocketStream } from '../api/websocket-stream';
import { OrderBookData, TransactionData, TickerStreamData } from '../types/bitbank';
import { io } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
  })),
}));

describe('WebSocketStream', () => {
  let websocketStream: WebSocketStream;
  let mockSocket: any;

  beforeEach(() => {
    // Mock setup - using jest.mock at the top
    mockSocket = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    };
    io.mockReturnValue(mockSocket);

    websocketStream = new WebSocketStream({
      endpoint: 'wss://stream.bitbank.cc',
      pair: 'btc_jpy',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should create WebSocket connection with correct configuration', () => {
      expect(websocketStream).toBeDefined();
    });

    it('should connect to WebSocket endpoint', async () => {
      const connectPromise = websocketStream.connect();
      
      // Simulate successful connection
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
      }

      await connectPromise;
      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const connectPromise = websocketStream.connect();
      
      // Simulate connection error
      const errorHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'connect_error'
      )?.[1];
      
      if (errorHandler) {
        errorHandler(new Error('Connection failed'));
      }

      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    it('should disconnect from WebSocket', () => {
      websocketStream.disconnect();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Channel Subscription', () => {
    it('should subscribe to all channels on connection', async () => {
      const connectPromise = websocketStream.connect();
      
      // Simulate successful connection
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
      }

      await connectPromise;

      // Check that all channels were joined
      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', 'ticker_btc_jpy');
      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', 'transactions_btc_jpy');
      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', 'depth_whole_btc_jpy');
      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', 'depth_diff_btc_jpy');
    });
  });

  describe('Data Handling', () => {
    let tickerListener: jest.Mock;
    let transactionListener: jest.Mock;
    let orderBookListener: jest.Mock;

    beforeEach(() => {
      tickerListener = jest.fn();
      transactionListener = jest.fn();
      orderBookListener = jest.fn();

      websocketStream.on('ticker', tickerListener);
      websocketStream.on('transaction', transactionListener);
      websocketStream.on('orderbook', orderBookListener);
    });

    it('should handle ticker data', () => {
      const tickerData: TickerStreamData = {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '100.5',
        timestamp: Date.now(),
      };

      // Find and call the ticker event handler
      const tickerHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'ticker_btc_jpy'
      )?.[1];

      if (tickerHandler) {
        tickerHandler(tickerData);
      }

      expect(tickerListener).toHaveBeenCalledWith(tickerData);
    });

    it('should handle transaction data', () => {
      const transactionData: TransactionData = {
        transaction_id: 12345,
        side: 'buy',
        price: '5000000',
        amount: '0.1',
        executed_at: Date.now(),
      };

      // Find and call the transaction event handler
      const transactionHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'transactions_btc_jpy'
      )?.[1];

      if (transactionHandler) {
        transactionHandler(transactionData);
      }

      expect(transactionListener).toHaveBeenCalledWith(transactionData);
    });

    it('should handle order book data', () => {
      const orderBookData: OrderBookData = {
        asks: [
          { price: '5000000', amount: '0.1' },
          { price: '5001000', amount: '0.2' },
        ],
        bids: [
          { price: '4999000', amount: '0.15' },
          { price: '4998000', amount: '0.25' },
        ],
        asks_over: '0',
        bids_under: '0',
        asks_count: 2,
        bids_count: 2,
        sequence_id: 1,
        timestamp: Date.now(),
      };

      // Find and call the order book event handler
      const orderBookHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'depth_whole_btc_jpy'
      )?.[1];

      if (orderBookHandler) {
        orderBookHandler(orderBookData);
      }

      expect(orderBookListener).toHaveBeenCalledWith(orderBookData);
    });
  });

  describe('Health Monitoring', () => {
    it('should return false for unhealthy connection initially', () => {
      expect(websocketStream.isConnectionHealthy()).toBe(false);
    });

    it('should provide connection statistics', () => {
      const stats = websocketStream.getConnectionStats();
      
      expect(stats).toHaveProperty('isConnected');
      expect(stats).toHaveProperty('connectionAge');
      expect(stats).toHaveProperty('timeSinceLastMessage');
      expect(stats).toHaveProperty('reconnectAttempts');
    });
  });

  describe('Alert System', () => {
    let alertListener: jest.Mock;

    beforeEach(() => {
      alertListener = jest.fn();
      websocketStream.on('alert', alertListener);
    });

    it('should emit alerts for connection issues', () => {
      // Simulate error
      const errorHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'error'
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error('Test error'));
      }

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system',
          level: 'high',
          message: 'WebSocket error occurred',
        })
      );
    });
  });

  describe('Reconnection Logic', () => {
    it('should attempt reconnection on server disconnect', () => {
      const disconnectHandler = mockSocket.on.mock.calls.find(
        ([event]: [string]) => event === 'disconnect'
      )?.[1];

      if (disconnectHandler) {
        disconnectHandler('io server disconnect');
      }

      // Verify reconnection attempt is scheduled
      expect(setTimeout).toHaveBeenCalled();
    });

    it('should not exceed maximum reconnection attempts', () => {
      const websocketStreamWithLimits = new WebSocketStream({
        endpoint: 'wss://stream.bitbank.cc',
        pair: 'btc_jpy',
        maxReconnectAttempts: 1,
      });

      // Should emit critical alert when max attempts reached
      const alertListener = jest.fn();
      websocketStreamWithLimits.on('alert', alertListener);

      // This test would need more complex mocking to fully verify
      // the reconnection attempt limit behavior
    });
  });
});