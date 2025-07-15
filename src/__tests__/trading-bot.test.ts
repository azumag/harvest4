import { jest } from '@jest/globals';
import { TradingBot, TradingBotConfig } from '../bot/trading-bot';
import { BitbankClient } from '../api/bitbank-client';
import { TradingStrategy } from '../strategies/trading-strategy';
import { ProfitCalculator } from '../utils/profit-calculator';

// Mock the dependencies
jest.mock('../api/bitbank-client');
jest.mock('../strategies/trading-strategy');
jest.mock('../utils/profit-calculator');

const MockedBitbankClient = BitbankClient as jest.MockedClass<typeof BitbankClient>;
const MockedTradingStrategy = TradingStrategy as jest.MockedClass<typeof TradingStrategy>;
const MockedProfitCalculator = ProfitCalculator as jest.MockedClass<typeof ProfitCalculator>;

describe('TradingBot', () => {
  let bot: TradingBot;
  let config: TradingBotConfig;
  let mockClient: jest.Mocked<BitbankClient>;
  let mockStrategy: jest.Mocked<TradingStrategy>;
  let mockProfitCalculator: jest.Mocked<ProfitCalculator>;

  beforeEach(() => {
    config = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      baseUrl: 'https://api.bitbank.cc',
      pair: 'btc_jpy',
      initialBalance: 100000,
      maxConcurrentTrades: 3,
      tradingInterval: 30000,
      stopLossPercentage: 2,
      takeProfitPercentage: 4,
      strategy: {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8,
      },
    };

    // Create mock instances
    mockClient = {
      getTicker: jest.fn(),
      getBalance: jest.fn(),
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      cancelOrder: jest.fn(),
      getActiveOrders: jest.fn(),
    } as any;

    mockStrategy = {
      generateSignal: jest.fn(),
      updatePrice: jest.fn(),
    } as any;

    mockProfitCalculator = {
      addPosition: jest.fn(),
      closePosition: jest.fn(),
      calculateProfitMetrics: jest.fn(),
      getPerformanceReport: jest.fn(),
      getCurrentBalance: jest.fn(),
      getTotalProfit: jest.fn(),
      getTradeHistory: jest.fn(),
      getOpenPositions: jest.fn(),
    } as any;

    // Mock constructors
    MockedBitbankClient.mockImplementation(() => mockClient);
    MockedTradingStrategy.mockImplementation(() => mockStrategy);
    MockedProfitCalculator.mockImplementation(() => mockProfitCalculator);

    bot = new TradingBot(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create bot with correct configuration', () => {
      expect(MockedBitbankClient).toHaveBeenCalledWith(config);
      expect(MockedTradingStrategy).toHaveBeenCalledWith(config.strategy);
      expect(MockedProfitCalculator).toHaveBeenCalledWith(config.initialBalance);
    });

    it('should initialize as not running', () => {
      expect(bot.isActive()).toBe(false);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      // Mock successful API calls
      mockClient.getTicker.mockResolvedValue({
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '100.5',
        timestamp: Date.now(),
      });

      mockClient.getBalance.mockResolvedValue([
        {
          asset: 'jpy',
          free_amount: '100000',
          locked_amount: '0',
          onhand_amount: '100000',
          withdrawal_fee: '0',
        },
        {
          asset: 'btc',
          free_amount: '0.001',
          locked_amount: '0',
          onhand_amount: '0.001',
          withdrawal_fee: '0.0001',
        },
      ]);

      mockStrategy.generateSignal.mockReturnValue({
        action: 'hold',
        confidence: 0.5,
        price: 5000000,
        amount: 0,
        reason: 'No clear trend',
      });

      mockProfitCalculator.calculateProfitMetrics.mockReturnValue({
        totalProfit: 0,
        totalReturn: 0,
        winRate: 0,
        totalTrades: 0,
        currentDrawdown: 0,
        maxDrawdown: 0,
      });

      mockProfitCalculator.getCurrentBalance.mockReturnValue(100000);
    });

    it('should throw error if already running', async () => {
      // Mock the trading loop to prevent infinite running
      (bot as any).tradingLoop = jest.fn();

      await bot.start();
      
      await expect(bot.start()).rejects.toThrow('Trading bot is already running');
      
      await bot.stop();
    });

    it('should validate configuration before starting', async () => {
      const validateSpy = jest.spyOn(bot as any, 'validateConfiguration');
      validateSpy.mockResolvedValue(undefined);

      // Mock the trading loop to prevent infinite running
      (bot as any).tradingLoop = jest.fn();

      await bot.start();

      expect(validateSpy).toHaveBeenCalled();
      
      await bot.stop();
    });

    it('should handle configuration validation errors', async () => {
      mockClient.getTicker.mockRejectedValue(new Error('API Error'));

      await expect(bot.start()).rejects.toThrow('Configuration validation failed');
    });
  });

  describe('signal execution', () => {
    it('should execute buy signal', async () => {
      const buySignal = {
        action: 'buy' as const,
        confidence: 0.8,
        price: 5000000,
        amount: 0.001,
        reason: 'Bullish trend',
      };

      mockClient.createOrder.mockResolvedValue({
        order_id: 12345,
        pair: 'btc_jpy',
        side: 'buy',
        type: 'limit',
        start_amount: '0.001',
        remaining_amount: '0.001',
        executed_amount: '0.000',
        price: '5000000',
        average_price: '0',
        ordered_at: Date.now(),
        status: 'UNFILLED',
      });

      await (bot as any).executeSignal(buySignal);

      expect(mockClient.createOrder).toHaveBeenCalledWith({
        pair: config.pair,
        amount: '0.001',
        price: '5000000',
        side: 'buy',
        type: 'limit',
      });

      expect(mockProfitCalculator.addPosition).toHaveBeenCalled();
    });

    it('should not execute signal if maximum concurrent trades reached', async () => {
      const buySignal = {
        action: 'buy' as const,
        confidence: 0.8,
        price: 5000000,
        amount: 0.001,
        reason: 'Bullish trend',
      };

      // Fill up active positions
      (bot as any).activePositions.set('pos1', {});
      (bot as any).activePositions.set('pos2', {});
      (bot as any).activePositions.set('pos3', {});

      await (bot as any).executeSignal(buySignal);

      expect(mockClient.createOrder).not.toHaveBeenCalled();
    });

    it('should handle order creation errors gracefully', async () => {
      const buySignal = {
        action: 'buy' as const,
        confidence: 0.8,
        price: 5000000,
        amount: 0.001,
        reason: 'Bullish trend',
      };

      mockClient.createOrder.mockRejectedValue(new Error('Order failed'));

      await (bot as any).executeSignal(buySignal);

      expect(mockClient.createOrder).toHaveBeenCalled();
      expect(mockProfitCalculator.addPosition).not.toHaveBeenCalled();
    });
  });

  describe('stop loss and take profit', () => {
    it('should trigger stop loss for buy position', async () => {
      const position = {
        side: 'buy' as const,
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
        orderId: 12345,
      };

      (bot as any).activePositions.set('pos1', position);

      const ticker = {
        pair: 'btc_jpy',
        last: '4900000', // Below stop loss (2% of 5000000)
        sell: '4900000',
        buy: '4899000',
        high: '5000000',
        low: '4900000',
        vol: '100',
        timestamp: Date.now(),
      };

      mockClient.cancelOrder.mockResolvedValue({} as any);
      mockClient.createOrder.mockResolvedValue({} as any);

      await (bot as any).checkStopLossAndTakeProfit(ticker);

      expect(mockClient.cancelOrder).toHaveBeenCalledWith(config.pair, 12345);
      expect(mockClient.createOrder).toHaveBeenCalledWith({
        pair: config.pair,
        amount: '0.001',
        side: 'sell',
        type: 'market',
      });
    });

    it('should trigger take profit for buy position', async () => {
      const position = {
        side: 'buy' as const,
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
        orderId: 12345,
      };

      (bot as any).activePositions.set('pos1', position);

      const ticker = {
        pair: 'btc_jpy',
        last: '5200000', // Above take profit (4% of 5000000)
        sell: '5200000',
        buy: '5199000',
        high: '5200000',
        low: '5000000',
        vol: '100',
        timestamp: Date.now(),
      };

      mockClient.cancelOrder.mockResolvedValue({} as any);
      mockClient.createOrder.mockResolvedValue({} as any);

      await (bot as any).checkStopLossAndTakeProfit(ticker);

      expect(mockClient.cancelOrder).toHaveBeenCalledWith(config.pair, 12345);
      expect(mockClient.createOrder).toHaveBeenCalledWith({
        pair: config.pair,
        amount: '0.001',
        side: 'sell',
        type: 'market',
      });
    });
  });

  describe('stop', () => {
    it('should stop the bot and close all positions', async () => {
      const position = {
        side: 'buy' as const,
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
        orderId: 12345,
      };

      (bot as any).activePositions.set('pos1', position);
      (bot as any).isRunning = true;

      mockClient.getTicker.mockResolvedValue({
        pair: 'btc_jpy',
        last: '5000000',
        sell: '5000000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        vol: '100',
        timestamp: Date.now(),
      });

      mockClient.cancelOrder.mockResolvedValue({} as any);
      mockClient.createOrder.mockResolvedValue({} as any);

      mockProfitCalculator.getPerformanceReport.mockReturnValue('Performance Report');

      await bot.stop();

      expect(bot.isActive()).toBe(false);
      expect(mockClient.cancelOrder).toHaveBeenCalled();
      expect(mockClient.createOrder).toHaveBeenCalled();
      expect(mockProfitCalculator.getPerformanceReport).toHaveBeenCalled();
    });
  });

  describe('getters', () => {
    it('should return profit report', () => {
      const mockReport = 'Mock Performance Report';
      mockProfitCalculator.getPerformanceReport.mockReturnValue(mockReport);

      const report = bot.getProfitReport();

      expect(report).toBe(mockReport);
      expect(mockProfitCalculator.getPerformanceReport).toHaveBeenCalled();
    });

    it('should return active positions', () => {
      const position = {
        side: 'buy' as const,
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      };

      (bot as any).activePositions.set('pos1', position);

      const activePositions = bot.getActivePositions();

      expect(activePositions).toHaveLength(1);
      expect(activePositions[0]).toEqual(position);
    });
  });
});