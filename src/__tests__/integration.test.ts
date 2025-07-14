import { jest } from '@jest/globals';
import { createTradingBotConfig } from '../index';

describe('Integration Tests', () => {
  describe('createTradingBotConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create config with environment variables', () => {
      process.env.BB_API_KEY = 'test-api-key';
      process.env.BB_API_SECRET = 'test-api-secret';

      const config = createTradingBotConfig();

      expect(config.apiKey).toBe('test-api-key');
      expect(config.apiSecret).toBe('test-api-secret');
      expect(config.baseUrl).toBe('https://api.bitbank.cc');
      expect(config.pair).toBe('btc_jpy');
      expect(config.initialBalance).toBe(100000);
      expect(config.maxConcurrentTrades).toBe(3);
      expect(config.tradingInterval).toBe(30000);
      expect(config.stopLossPercentage).toBe(2);
      expect(config.takeProfitPercentage).toBe(4);
    });

    it('should throw error when API key is missing', () => {
      process.env.BB_API_SECRET = 'test-api-secret';
      delete process.env.BB_API_KEY;

      expect(() => createTradingBotConfig()).toThrow(
        'Missing required environment variables: BB_API_KEY and BB_API_SECRET'
      );
    });

    it('should throw error when API secret is missing', () => {
      process.env['BB_API_KEY'] = 'test-api-key';
      delete process.env['BB_API_SECRET'];

      expect(() => createTradingBotConfig()).toThrow(
        'Missing required environment variables: BB_API_KEY and BB_API_SECRET'
      );
    });

    it('should throw error when both API credentials are missing', () => {
      delete process.env['BB_API_KEY'];
      delete process.env['BB_API_SECRET'];

      expect(() => createTradingBotConfig()).toThrow(
        'Missing required environment variables: BB_API_KEY and BB_API_SECRET'
      );
    });

    it('should have correct strategy configuration', () => {
      process.env['BB_API_KEY'] = 'test-api-key';
      process.env['BB_API_SECRET'] = 'test-api-secret';

      const config = createTradingBotConfig();

      expect(config.strategy.buyThreshold).toBe(0.02);
      expect(config.strategy.sellThreshold).toBe(0.02);
      expect(config.strategy.minProfitMargin).toBe(0.01);
      expect(config.strategy.maxTradeAmount).toBe(10000);
      expect(config.strategy.riskTolerance).toBe(0.8);
    });

    it('should have correct risk management settings', () => {
      process.env['BB_API_KEY'] = 'test-api-key';
      process.env['BB_API_SECRET'] = 'test-api-secret';

      const config = createTradingBotConfig();

      expect(config.stopLossPercentage).toBe(2);
      expect(config.takeProfitPercentage).toBe(4);
      expect(config.maxConcurrentTrades).toBe(3);
    });
  });

  describe('Application Flow', () => {
    beforeEach(() => {
      process.env['BB_API_KEY'] = 'test-api-key';
      process.env['BB_API_SECRET'] = 'test-api-secret';
    });

    it('should create trading bot with valid configuration', () => {
      const config = createTradingBotConfig();
      
      // Verify configuration is complete and valid
      expect(config.apiKey).toBeDefined();
      expect(config.apiSecret).toBeDefined();
      expect(config.baseUrl).toBeDefined();
      expect(config.pair).toBeDefined();
      expect(config.initialBalance).toBeGreaterThan(0);
      expect(config.maxConcurrentTrades).toBeGreaterThan(0);
      expect(config.tradingInterval).toBeGreaterThan(0);
      expect(config.stopLossPercentage).toBeGreaterThan(0);
      expect(config.takeProfitPercentage).toBeGreaterThan(0);
      
      // Verify strategy configuration
      expect(config.strategy.buyThreshold).toBeGreaterThan(0);
      expect(config.strategy.sellThreshold).toBeGreaterThan(0);
      expect(config.strategy.minProfitMargin).toBeGreaterThan(0);
      expect(config.strategy.maxTradeAmount).toBeGreaterThan(0);
      expect(config.strategy.riskTolerance).toBeGreaterThan(0);
      expect(config.strategy.riskTolerance).toBeLessThanOrEqual(1);
    });
  });
});