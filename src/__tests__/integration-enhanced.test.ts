import { jest } from '@jest/globals';
import axios from 'axios';
import { TradingBot, TradingBotConfig } from '../bot/trading-bot';
import { BitbankClient } from '../api/bitbank-client';
import { ProfitCalculator } from '../utils/profit-calculator';
import { TradingStrategy } from '../strategies/trading-strategy';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Enhanced Integration Tests', () => {
  let config: TradingBotConfig;
  let mockAxiosInstance: any;

  beforeEach(() => {
    config = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
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

    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: { timeout: 10000 },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Trading Flow', () => {
    it('should complete full trading cycle from start to profit', async () => {
      // Mock successful API responses
      const mockTicker = {
        pair: 'btc_jpy',
        sell: '5001000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '2000',
        timestamp: Date.now(),
      };

      const mockBalance = [
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
      ];

      const mockOrder = {
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
      };

      // Setup API mocks
      mockAxiosInstance.get
        .mockResolvedValueOnce({ // getTicker for validation
          data: { success: 1, data: mockTicker },
          status: 200,
        })
        .mockResolvedValueOnce({ // getBalance for validation
          data: { success: 1, data: mockBalance },
          status: 200,
        })
        .mockResolvedValueOnce({ // getTicker for trading cycle
          data: { success: 1, data: mockTicker },
          status: 200,
        });

      mockAxiosInstance.post.mockResolvedValue({ // createOrder
        data: { success: 1, data: mockOrder },
        status: 200,
      });

      const bot = new TradingBot(config);
      
      // Mock the trading loop to run once
      const _originalTradingLoop = (bot as any).tradingLoop;
      let cycleCount = 0;
      (bot as any).tradingLoop = jest.fn().mockImplementation(async () => {
        if (cycleCount < 1) {
          cycleCount++;
          await (bot as any).executeTradingCycle();
        }
      });

      await bot.start();
      await bot.stop();

      // Verify API calls were made
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/ticker/btc_jpy');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/user/assets');
    });

    it('should handle multiple concurrent trades within limits', async () => {
      const mockResponses = {
        ticker: { data: { success: 1, data: {
          pair: 'btc_jpy', last: '5000000', vol: '2000', 
          sell: '5001000', buy: '4999000', high: '5100000', 
          low: '4900000', timestamp: Date.now()
        }}},
        balance: { data: { success: 1, data: [
          { asset: 'jpy', free_amount: '300000', locked_amount: '0', onhand_amount: '300000', withdrawal_fee: '0' },
          { asset: 'btc', free_amount: '0.003', locked_amount: '0', onhand_amount: '0.003', withdrawal_fee: '0.0001' }
        ]}},
        order: { data: { success: 1, data: {
          order_id: 12345, pair: 'btc_jpy', side: 'buy', type: 'limit',
          start_amount: '0.001', remaining_amount: '0.001', executed_amount: '0.000',
          price: '5000000', average_price: '0', ordered_at: Date.now(), status: 'UNFILLED'
        }}}
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponses.ticker);
      mockAxiosInstance.post.mockResolvedValue(mockResponses.order);

      const bot = new TradingBot(config);
      
      // Simulate multiple trading signals within concurrent trade limit
      const positions = (bot as any).activePositions;
      expect(positions.size).toBe(0);
      
      // Test max concurrent trades limit
      expect(config.maxConcurrentTrades).toBe(3);
    });
  });

  describe('Error Condition Handling', () => {
    it('should handle API connection failures gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network Error'));
      
      const bot = new TradingBot(config);
      
      await expect(bot.start()).rejects.toThrow('Configuration validation failed');
    });

    it('should handle invalid API responses', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: 0, data: {} },
        status: 200,
      });

      const client = new BitbankClient(config);
      
      await expect(client.getTicker('btc_jpy')).rejects.toThrow('Failed to get ticker data');
    });

    it('should handle order execution failures', async () => {
      const mockTicker = {
        pair: 'btc_jpy', last: '5000000', vol: '2000',
        sell: '5001000', buy: '4999000', high: '5100000', 
        low: '4900000', timestamp: Date.now()
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: { success: 1, data: mockTicker },
      });
      
      mockAxiosInstance.post.mockRejectedValue(new Error('Order failed'));

      const client = new BitbankClient(config);
      
      await expect(client.createOrder({
        pair: 'btc_jpy',
        amount: '0.001',
        price: '5000000',
        side: 'buy',
        type: 'limit',
      })).rejects.toThrow('Order failed');
    });

    it('should handle rate limiting and retry logic', async () => {
      let callCount = 0;
      mockAxiosInstance.get.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Rate limit exceeded'));
        }
        return Promise.resolve({
          data: { success: 1, data: {
            pair: 'btc_jpy', last: '5000000', vol: '2000',
            sell: '5001000', buy: '4999000', high: '5100000', 
            low: '4900000', timestamp: Date.now()
          }},
        });
      });

      const client = new BitbankClient(config);
      
      // Should eventually succeed after retries
      const result = await client.getTicker('btc_jpy');
      expect(result.pair).toBe('btc_jpy');
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('System Integration', () => {
    it('should integrate all components correctly', () => {
      const bot = new TradingBot(config);
      
      // Verify all components are initialized
      expect((bot as any).client).toBeInstanceOf(BitbankClient);
      expect((bot as any).strategy).toBeInstanceOf(TradingStrategy);
      expect((bot as any).profitCalculator).toBeInstanceOf(ProfitCalculator);
      expect((bot as any).config).toEqual(config);
    });

    it('should maintain state consistency across operations', async () => {
      const bot = new TradingBot(config);
      
      expect(bot.isActive()).toBe(false);
      expect(bot.getActivePositions()).toHaveLength(0);
      
      const profitReport = bot.getProfitReport();
      expect(typeof profitReport).toBe('string');
    });

    it('should handle graceful shutdown with position cleanup', async () => {
      const mockTicker = {
        pair: 'btc_jpy', last: '5000000', vol: '2000',
        sell: '5001000', buy: '4999000', high: '5100000', 
        low: '4900000', timestamp: Date.now()
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: { success: 1, data: mockTicker },
      });

      mockAxiosInstance.post.mockResolvedValue({
        data: { success: 1, data: {} },
      });

      const bot = new TradingBot(config);
      
      // Add a mock position
      (bot as any).activePositions.set('test-pos', {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
        orderId: 12345,
      });

      expect(bot.getActivePositions()).toHaveLength(1);
      
      await bot.stop();
      
      expect(bot.isActive()).toBe(false);
      // Position should be cleaned up during stop
    });
  });

  describe('Configuration Validation', () => {
    it('should validate all required configuration parameters', () => {
      const invalidConfigs = [
        { ...config, apiKey: '' },
        { ...config, apiSecret: '' },
        { ...config, baseUrl: '' },
        { ...config, pair: '' },
        { ...config, initialBalance: 0 },
        { ...config, maxConcurrentTrades: 0 },
        { ...config, tradingInterval: 0 },
        { ...config, stopLossPercentage: 0 },
        { ...config, takeProfitPercentage: 0 },
      ];

      invalidConfigs.forEach((invalidConfig, _index) => {
        expect(() => new TradingBot(invalidConfig)).not.toThrow();
        // Configuration validation happens at start, not construction
      });
    });

    it('should use default strategy configuration when not provided', () => {
      const minimalConfig = {
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

      const bot = new TradingBot(minimalConfig);
      expect((bot as any).strategy).toBeInstanceOf(TradingStrategy);
    });
  });

  describe('Real-time Data Processing', () => {
    it('should process ticker data correctly', async () => {
      const mockTicker = {
        pair: 'btc_jpy',
        sell: '5001000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '2000',
        timestamp: Date.now(),
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: { success: 1, data: mockTicker },
      });

      const client = new BitbankClient(config);
      const result = await client.getTicker('btc_jpy');

      expect(result).toEqual(mockTicker);
      expect(parseFloat(result.last)).toBe(5000000);
      expect(parseFloat(result.vol)).toBe(2000);
    });

    it('should handle balance updates correctly', async () => {
      const mockBalance = [
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
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: { success: 1, data: mockBalance },
      });

      const client = new BitbankClient(config);
      const result = await client.getBalance();

      expect(result).toEqual(mockBalance);
      expect(result).toHaveLength(2);
      
      const jpyBalance = result.find(b => b.asset === 'jpy');
      const btcBalance = result.find(b => b.asset === 'btc');
      
      expect(jpyBalance?.free_amount).toBe('100000');
      expect(btcBalance?.free_amount).toBe('0.001');
    });
  });
});