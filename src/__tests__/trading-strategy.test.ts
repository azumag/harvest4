import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { BitbankTicker } from '../types/bitbank';

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

  const createMockTicker = (price: string, volume: string = '1500'): BitbankTicker => ({
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
      const priceHistory = (strategy as any).priceHistory;
      expect(priceHistory).toHaveLength(5);
      expect(priceHistory[priceHistory.length - 1]).toBe(5040000);
    });

    it('should limit price history to maximum size', () => {
      // Add more than HISTORY_SIZE (20) prices
      for (let i = 0; i < 25; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }

      const priceHistory = (strategy as any).priceHistory;
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
      // Create upward trend with stronger momentum (>2%)
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(5000000 + i * 50000); // More aggressive increasing price for >2% momentum
      }
      
      prices.forEach(price => strategy.updatePrice(price));

      const ticker = createMockTicker('5700000', '2000'); // Higher final price
      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('buy');
      expect(signal.confidence).toBeGreaterThan(0.6);
      expect(signal.amount).toBeGreaterThan(0);
      expect(signal.reason).toContain('Bullish trend detected');
    });

    it('should generate sell signal for downward trend', () => {
      // Create downward trend with stronger negative momentum (>2%)
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(5200000 - i * 50000); // More aggressive decreasing price for >2% negative momentum
      }
      
      prices.forEach(price => strategy.updatePrice(price));

      const ticker = createMockTicker('4500000', '2000'); // Lower final price
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
      // Create trend that generates a signal but with low confidence due to high volatility
      const prices = [];
      // Create strong upward trend first
      for (let i = 0; i < 10; i++) {
        prices.push(5000000 + i * 30000); // Strong increase for momentum
      }
      // Add volatility to reduce confidence
      for (let i = 0; i < 5; i++) {
        prices.push(5300000 + (i % 2 === 0 ? 100000 : -100000)); // High volatility
      }
      
      prices.forEach(price => strategy.updatePrice(price));

      const ticker = createMockTicker('5400000', '2000'); // Good volume but high volatility
      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Confidence too low');
    });

    it('should reject trades with low expected profit', () => {
      const lowProfitConfig: TradingStrategyConfig = {
        ...config,
        maxTradeAmount: 50, // Very small trade amount to generate very low expected profit
      };
      
      const lowProfitStrategy = new TradingStrategy(lowProfitConfig);
      
      // Create strong upward trend that will generate a buy signal
      const prices = [];
      for (let i = 0; i < 15; i++) {
        prices.push(5000000 + i * 50000); // Strong upward trend
      }
      
      prices.forEach(price => lowProfitStrategy.updatePrice(price));

      const ticker = createMockTicker('5700000', '5000'); // High volume, strong trend
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

      const shortMA = (strategy as any).calculateMovingAverage(3);
      const longMA = (strategy as any).calculateMovingAverage(5);

      expect(shortMA).toBeCloseTo(5030000); // Average of last 3
      expect(longMA).toBeCloseTo(5020000); // Average of all 5
    });

    it('should calculate momentum correctly', () => {
      const basePrices = [5000000, 5010000, 5020000, 5030000, 5040000];
      const trendPrices = [5050000, 5060000, 5070000, 5080000, 5090000];
      
      [...basePrices, ...trendPrices].forEach(price => strategy.updatePrice(price));

      const momentum = (strategy as any).calculateMomentum();
      
      // Current (5090000) vs 10 periods ago (5000000)
      const expected = (5090000 - 5000000) / 5000000;
      expect(momentum).toBeCloseTo(expected);
    });

    it('should calculate volatility correctly', () => {
      const prices = [5000000, 5100000, 4900000, 5200000, 4800000];
      for (let i = 0; i < 3; i++) {
        prices.forEach(price => strategy.updatePrice(price));
      }

      const volatility = (strategy as any).calculateVolatility();
      
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(1);
    });
  });
});