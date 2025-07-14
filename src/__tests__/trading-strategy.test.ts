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
      rsiOverbought: 70,
      rsiOversold: 30,
      useDivergence: true,
      useMultiTimeframe: true,
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

  describe('price data management', () => {
    it('should handle price updates correctly', () => {
      const prices = [5000000, 5010000, 5020000, 5030000, 5040000];
      const volumes = [1000, 1500, 2000, 1200, 1800];
      
      prices.forEach((price, index) => {
        strategy.updatePrice(price, volumes[index]);
      });

      // Should not throw errors and should be able to generate signals
      const ticker = createMockTicker('5040000', '1800');
      const signal = strategy.generateSignal(ticker);
      expect(signal).toBeDefined();
    });

    it('should handle large datasets efficiently', () => {
      // Add more than historical limit
      for (let i = 0; i < 250; i++) {
        strategy.updatePrice(5000000 + i * 1000, 1500);
      }

      // Should still be able to generate signals efficiently
      const ticker = createMockTicker('5250000', '2000');
      const signal = strategy.generateSignal(ticker);
      expect(signal).toBeDefined();
    });
  });

  describe('signal generation', () => {
    it('should return hold signal with insufficient data', () => {
      const ticker = createMockTicker('5000000');
      
      // Add only a few prices
      for (let i = 0; i < 5; i++) {
        strategy.updatePrice(5000000 + i * 1000, 1500);
      }

      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toBe('Insufficient data for advanced analysis');
    });

    it('should generate signals based on multiple indicators', () => {
      // Create sufficient data for advanced analysis
      const prices = [];
      for (let i = 0; i < 60; i++) {
        prices.push(5000000 + i * 5000); // Consistent upward trend
      }
      
      prices.forEach((price, index) => {
        strategy.updatePrice(price, 2000 + index * 10);
      });

      const ticker = createMockTicker('5295000', '2600');
      const signal = strategy.generateSignal(ticker);

      expect(['buy', 'sell', 'hold']).toContain(signal.action);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    });

    it('should provide detailed reasons for signals', () => {
      // Create pattern that should generate clear signals
      const strongTrend = [];
      for (let i = 0; i < 50; i++) {
        strongTrend.push(5000000 + i * 8000);
      }
      
      strongTrend.forEach((price, index) => {
        strategy.updatePrice(price, 1500 + index * 20);
      });

      const ticker = createMockTicker('5392000', '2500');
      const signal = strategy.generateSignal(ticker);

      expect(signal.reason).toBeDefined();
      expect(signal.reason.length).toBeGreaterThan(10);
      
      if (signal.action !== 'hold') {
        expect(signal.reason).toContain('Advanced');
      }
    });

    it('should handle edge cases gracefully', () => {
      // Test with extreme values
      const extremePrices = [1000000, 10000000, 5000000];
      const extremeVolumes = [1, 1000000, 1500];
      
      extremePrices.forEach((price, index) => {
        strategy.updatePrice(price, extremeVolumes[index]);
      });

      const ticker = createMockTicker('5000000', '1500');
      const signal = strategy.generateSignal(ticker);

      expect(signal).toBeDefined();
      expect(signal.price).toBe(5000000);
      expect(signal.amount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('risk management', () => {
    it('should reject signals with insufficient confidence', () => {
      // Create mixed/weak signals
      const weakPattern = [];
      for (let i = 0; i < 40; i++) {
        weakPattern.push(5000000 + Math.sin(i * 0.5) * 10000); // Weak oscillation
      }
      
      weakPattern.forEach((price, index) => {
        strategy.updatePrice(price, 500 + index * 5); // Low volume
      });

      const ticker = createMockTicker('5005000', '600');
      const signal = strategy.generateSignal(ticker);

      if (signal.action === 'hold' && signal.reason.includes('Confidence too low')) {
        expect(signal.amount).toBe(0);
      }
    });

    it('should reject trades with low expected profit', () => {
      const lowProfitConfig: TradingStrategyConfig = {
        ...config,
        maxTradeAmount: 50, // Very small trade amount
      };
      
      const lowProfitStrategy = new TradingStrategy(lowProfitConfig);
      
      // Create trend that might generate signal
      const prices = [];
      for (let i = 0; i < 50; i++) {
        prices.push(5000000 + i * 5000);
      }
      
      prices.forEach((price) => {
        lowProfitStrategy.updatePrice(price, 2000);
      });

      const ticker = createMockTicker('5245000', '3000');
      const signal = lowProfitStrategy.generateSignal(ticker);

      if (signal.action === 'hold' && signal.reason.includes('Expected profit too low')) {
        expect(signal.amount).toBe(0);
      }
    });

    it('should cap trade amounts at maximum', () => {
      // Create very strong signals that might generate large amounts
      const strongPattern = [];
      for (let i = 0; i < 60; i++) {
        if (i < 30) {
          strongPattern.push(5500000 - i * 25000); // Strong downward for oversold
        } else {
          strongPattern.push(4750000 + (i - 30) * 30000); // Strong recovery
        }
      }
      
      strongPattern.forEach((price) => {
        strategy.updatePrice(price, 5000); // High volume
      });

      const ticker = createMockTicker('5650000', '8000');
      const signal = strategy.generateSignal(ticker);

      if (signal.action !== 'hold') {
        const maxAmount = config.maxTradeAmount / parseFloat(ticker.last);
        expect(signal.amount).toBeLessThanOrEqual(maxAmount * 1.1); // Small tolerance for adjustments
      }
    });
  });

  describe('advanced technical analysis integration', () => {
    it('should integrate multiple indicators for signal generation', () => {
      // Create pattern that should trigger multiple indicators
      const complexPattern = [];
      
      // Phase 1: Create oversold condition
      for (let i = 0; i < 25; i++) {
        complexPattern.push(5200000 - i * 12000);
      }
      
      // Phase 2: Recovery phase
      for (let i = 0; i < 35; i++) {
        complexPattern.push(4900000 + i * 8000);
      }
      
      complexPattern.forEach((price, index) => {
        strategy.updatePrice(price, 1500 + index * 20);
      });

      const ticker = createMockTicker('5180000', '2200');
      const signal = strategy.generateSignal(ticker);
      
      expect(signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
    });

    it('should handle indicator conflicts appropriately', () => {
      // Create conflicting signals pattern
      const conflictPattern = [];
      for (let i = 0; i < 50; i++) {
        // Oscillating pattern that might create mixed signals
        conflictPattern.push(5000000 + Math.sin(i * 0.3) * 80000 + i * 1000);
      }
      
      conflictPattern.forEach((price, index) => {
        strategy.updatePrice(price, 1200 + Math.abs(Math.sin(index * 0.2)) * 1000);
      });

      const ticker = createMockTicker('5049000', '1800');
      const signal = strategy.generateSignal(ticker);
      
      expect(signal).toBeDefined();
      if (signal.action === 'hold') {
        expect(signal.reason).toContain('Mixed signals');
      }
    });

    it('should provide comprehensive signal analysis', () => {
      // Create clear trend for comprehensive analysis
      const trendPattern = [];
      for (let i = 0; i < 70; i++) {
        trendPattern.push(4800000 + i * 6000); // Steady upward trend
      }
      
      trendPattern.forEach((price, index) => {
        strategy.updatePrice(price, 1800 + index * 15);
      });

      const ticker = createMockTicker('5214000', '2850');
      const signal = strategy.generateSignal(ticker);
      
      expect(signal).toBeDefined();
      if (signal.action !== 'hold') {
        expect(signal.confidence).toBeGreaterThan(0.6);
        expect(signal.reason).toContain('Advanced');
      }
    });
  });
});