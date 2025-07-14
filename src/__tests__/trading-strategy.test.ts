import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { BitbankTicker } from '../types/bitbank';

interface TradingStrategyTestable extends TradingStrategy {
  priceHistory: number[];
  volumeHistory: number[];
  calculateMovingAverage: (period: number) => number;
  calculateMomentum: () => number;
  calculateVolatility: () => number;
}

describe('TradingStrategy', () => {
  let strategy: TradingStrategy;
  let config: TradingStrategyConfig;

  beforeEach(() => {
    config = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8,
    };
    strategy = new TradingStrategy(config);
  });

  const createMockTicker = (price: string, volume = '1500'): BitbankTicker => ({
    pair: 'btc_jpy',
    sell: (parseFloat(price) + 1000).toString(),
    buy: (parseFloat(price) - 1000).toString(),
    high: (parseFloat(price) + 2000).toString(),
    low: (parseFloat(price) - 2000).toString(),
    last: price,
    vol: volume,
    timestamp: Date.now(),
  });

  describe('price history management', () => {
    it('should maintain price history correctly', () => {
      const prices = [5000000, 5010000, 5020000, 5030000, 5040000];
      
      prices.forEach(price => {
        strategy.updatePrice(price);
      });

      // Access private property for testing
      const priceHistory = (strategy as TradingStrategyTestable).priceHistory;
      expect(priceHistory).toHaveLength(5);
      expect(priceHistory[priceHistory.length - 1]).toBe(5040000);
    });

    it('should limit price history to maximum size', () => {
      // Add more than HISTORY_SIZE (20) prices
      for (let i = 0; i < 25; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }

      const priceHistory = (strategy as TradingStrategyTestable).priceHistory;
      expect(priceHistory).toHaveLength(20);
      expect(priceHistory[0]).toBe(5005000); // First 5 should be removed
    });
  });

  describe('signal generation', () => {
    it('should return hold signal with insufficient price history', () => {
      const ticker = createMockTicker('5000000');
      
      // Add only a few prices
      for (let i = 0; i < 5; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }

      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toBe('Insufficient price history');
    });

    it('should generate buy signal for upward trend', () => {
      // Create upward trend with stronger momentum
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(5000000 + i * 15000); // Increasing price by 15000 each time
      }
      
      prices.forEach(price => strategy.updatePrice(price));

      const ticker = createMockTicker('5210000', '2000');
      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('buy');
      expect(signal.confidence).toBeGreaterThan(0.6);
      expect(signal.amount).toBeGreaterThan(0);
      expect(signal.reason).toContain('Bullish trend detected');
    });

    it('should generate sell signal for downward trend', () => {
      // Create downward trend with stronger momentum
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(5200000 - i * 15000); // Decreasing price by 15000 each time
      }
      
      prices.forEach(price => strategy.updatePrice(price));

      const ticker = createMockTicker('5050000', '2000');
      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('sell');
      expect(signal.confidence).toBeGreaterThan(0.6);
      expect(signal.amount).toBeGreaterThan(0);
      expect(signal.reason).toContain('Bearish trend detected');
    });

    it('should generate hold signal for sideways market', () => {
      // Create sideways market
      const basePrice = 5000000;
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(basePrice + (Math.random() - 0.5) * 5000); // Random walk
      }
      
      prices.forEach(price => strategy.updatePrice(price));

      const ticker = createMockTicker(basePrice.toString());
      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toBe('No clear trend detected');
    });
  });

  describe('risk management', () => {
    it('should reject low confidence signals', () => {
      // Create weak upward trend but with sufficient volume
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(5000000 + i * 8000); // Small increase but enough to trigger signal
      }
      
      prices.forEach(price => strategy.updatePrice(price));

      const ticker = createMockTicker('5112000', '1500'); // Sufficient volume
      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Confidence too low');
    });

    it('should reject trades with low expected profit', () => {
      const lowProfitConfig: TradingStrategyConfig = {
        ...config,
        maxTradeAmount: 50, // Very small trade amount
      };
      
      const lowProfitStrategy = new TradingStrategy(lowProfitConfig);
      
      // Create strong upward trend
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(5000000 + i * 20000);
      }
      
      prices.forEach(price => lowProfitStrategy.updatePrice(price));

      const ticker = createMockTicker('5280000', '5000');
      const signal = lowProfitStrategy.generateSignal(ticker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Expected profit too low');
    });

    it('should adjust trade amount based on volatility', () => {
      // Create high volatility prices
      const prices = [5000000, 5100000, 4900000, 5200000, 4800000];
      for (let i = 0; i < 3; i++) {
        prices.forEach(price => strategy.updatePrice(price));
      }

      const ticker = createMockTicker('5300000', '3000');
      const signal = strategy.generateSignal(ticker);

      if (signal.action !== 'hold') {
        // High volatility should reduce trade amount
        expect(signal.amount).toBeLessThan(config.maxTradeAmount / parseFloat(ticker.last));
      }
    });
  });

  describe('technical indicators', () => {
    it('should calculate moving averages correctly', () => {
      const prices = [5000000, 5010000, 5020000, 5030000, 5040000];
      prices.forEach(price => strategy.updatePrice(price));

      const shortMA = (strategy as TradingStrategyTestable).calculateMovingAverage(3);
      const longMA = (strategy as TradingStrategyTestable).calculateMovingAverage(5);

      expect(shortMA).toBeCloseTo(5030000); // Average of last 3
      expect(longMA).toBeCloseTo(5020000); // Average of all 5
    });

    it('should calculate momentum correctly', () => {
      const basePrices = [5000000, 5010000, 5020000, 5030000, 5040000];
      const trendPrices = [5050000, 5060000, 5070000, 5080000, 5090000];
      
      [...basePrices, ...trendPrices].forEach(price => strategy.updatePrice(price));

      const momentum = (strategy as TradingStrategyTestable).calculateMomentum();
      
      // Current (5090000) vs 10 periods ago (5000000)
      const expected = (5090000 - 5000000) / 5000000;
      expect(momentum).toBeCloseTo(expected);
    });

    it('should calculate volatility correctly', () => {
      const prices = [5000000, 5100000, 4900000, 5200000, 4800000];
      for (let i = 0; i < 3; i++) {
        prices.forEach(price => strategy.updatePrice(price));
      }

      const volatility = (strategy as TradingStrategyTestable).calculateVolatility();
      
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(1);
    });
  });
});