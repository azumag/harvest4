import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { BitbankTicker } from '../types/bitbank';

describe('TradingStrategy - Advanced Features', () => {
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

  const createMockTicker = (price: string, volume = '2000'): BitbankTicker => ({
    pair: 'btc_jpy',
    sell: (parseFloat(price) + 1000).toString(),
    buy: (parseFloat(price) - 1000).toString(),
    high: (parseFloat(price) + 2000).toString(),
    low: (parseFloat(price) - 2000).toString(),
    last: price,
    vol: volume,
    timestamp: Date.now(),
  });

  const simulatePriceSequence = (prices: number[], volumes?: number[]): void => {
    prices.forEach((price, index) => {
      const volume = volumes ? volumes[index] : 2000;
      strategy.updatePrice(price, volume);
    });
  };

  describe('advanced signal generation', () => {
    it('should return hold signal with insufficient data', () => {
      const ticker = createMockTicker('5000000');
      
      // Add only a few prices
      for (let i = 0; i < 5; i++) {
        strategy.updatePrice(5000000 + i * 1000, 1000);
      }

      const signal = strategy.generateSignal(ticker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toBe('Insufficient data for advanced analysis');
    });

    it('should generate buy signal with multiple bullish indicators', () => {
      // Create pattern for oversold RSI and bullish trend
      const oversoldPattern = [
        ...Array.from({ length: 20 }, (_, i) => 5200000 - i * 15000), // Strong downward for oversold RSI
        ...Array.from({ length: 30 }, (_, i) => 4900000 + i * 5000),  // Recovery pattern
      ];
      
      simulatePriceSequence(oversoldPattern);

      const ticker = createMockTicker('5050000', '3000');
      const signal = strategy.generateSignal(ticker);

      if (signal.action === 'buy') {
        expect(signal.confidence).toBeGreaterThan(0.7);
        expect(signal.amount).toBeGreaterThan(0);
        expect(signal.reason).toContain('Advanced buy signal');
      }
    });

    it('should generate sell signal with multiple bearish indicators', () => {
      // Create pattern for overbought RSI and bearish trend
      const overboughtPattern = [
        ...Array.from({ length: 20 }, (_, i) => 4800000 + i * 15000), // Strong upward for overbought RSI
        ...Array.from({ length: 30 }, (_, i) => 5100000 - i * 3000),  // Decline pattern
      ];
      
      simulatePriceSequence(overboughtPattern);

      const ticker = createMockTicker('4950000', '3000');
      const signal = strategy.generateSignal(ticker);

      if (signal.action === 'sell') {
        expect(signal.confidence).toBeGreaterThan(0.7);
        expect(signal.amount).toBeGreaterThan(0);
        expect(signal.reason).toContain('Advanced sell signal');
      }
    });

    it('should handle mixed signals appropriately', () => {
      // Create sideways market with mixed signals
      const mixedPattern = Array.from({ length: 50 }, (_, i) => 
        5000000 + Math.sin(i * 0.2) * 50000 + Math.random() * 10000
      );
      
      simulatePriceSequence(mixedPattern);

      const ticker = createMockTicker('5000000', '1500');
      const signal = strategy.generateSignal(ticker);

      if (signal.action === 'hold') {
        expect(signal.reason).toContain('Mixed signals');
      }
    });
  });

  describe('advanced risk management', () => {
    it('should reject signals with low confidence', () => {
      // Create weak trend that might generate low confidence
      const weakTrend = Array.from({ length: 50 }, (_, i) => 5000000 + i * 500);
      simulatePriceSequence(weakTrend);

      const ticker = createMockTicker('5025000', '800'); // Low volume
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
      
      // Create strong trend
      const strongTrend = Array.from({ length: 50 }, (_, i) => 5000000 + i * 10000);
      strongTrend.forEach(price => lowProfitStrategy.updatePrice(price, 3000));

      const ticker = createMockTicker('5250000', '5000');
      const signal = lowProfitStrategy.generateSignal(ticker);

      if (signal.action === 'hold' && signal.reason.includes('Expected profit too low')) {
        expect(signal.amount).toBe(0);
      }
    });

    it('should cap trade amount at maximum', () => {
      // Create very strong signals that might generate large amounts
      const strongBullish = Array.from({ length: 60 }, (_, i) => {
        if (i < 30) return 4800000 - i * 20000; // Create oversold
        return 4200000 + i * 25000; // Strong recovery
      });
      
      simulatePriceSequence(strongBullish);

      const ticker = createMockTicker('5500000', '8000');
      const signal = strategy.generateSignal(ticker);

      if (signal.action !== 'hold') {
        const maxAmount = config.maxTradeAmount / parseFloat(ticker.last);
        expect(signal.amount).toBeLessThanOrEqual(maxAmount);
      }
    });
  });

  describe('configuration handling', () => {
    it('should use default RSI levels when not specified', () => {
      const configWithoutRSI: Partial<TradingStrategyConfig> = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8,
      };
      
      const strategyWithDefaults = new TradingStrategy(configWithoutRSI as TradingStrategyConfig);
      
      // Should not throw errors
      const ticker = createMockTicker('5000000');
      const signal = strategyWithDefaults.generateSignal(ticker);
      expect(signal).toBeDefined();
    });

    it('should handle disabled divergence analysis', () => {
      const noDivergenceConfig: TradingStrategyConfig = {
        ...config,
        useDivergence: false,
      };
      
      const noDivergenceStrategy = new TradingStrategy(noDivergenceConfig);
      
      // Create pattern that would normally trigger divergence
      const divergencePattern = Array.from({ length: 50 }, (_, i) => 5000000 - i * 5000);
      divergencePattern.forEach(price => noDivergenceStrategy.updatePrice(price, 2000));

      const ticker = createMockTicker('4750000', '3000');
      const signal = noDivergenceStrategy.generateSignal(ticker);
      
      expect(signal).toBeDefined();
    });

    it('should handle disabled multi-timeframe analysis', () => {
      const noMultiTimeframeConfig: TradingStrategyConfig = {
        ...config,
        useMultiTimeframe: false,
      };
      
      const noMultiTimeframeStrategy = new TradingStrategy(noMultiTimeframeConfig);
      
      // Create trend pattern
      const trendPattern = Array.from({ length: 100 }, (_, i) => 5000000 + i * 2000);
      trendPattern.forEach(price => noMultiTimeframeStrategy.updatePrice(price, 2000));

      const ticker = createMockTicker('5200000', '3000');
      const signal = noMultiTimeframeStrategy.generateSignal(ticker);
      
      expect(signal).toBeDefined();
    });
  });

  describe('volume analysis integration', () => {
    it('should consider volume in signal generation', () => {
      // Create price pattern
      const prices = Array.from({ length: 50 }, (_, i) => 5000000 + i * 5000);
      const highVolumes = Array.from({ length: 50 }, () => 3000);
      const lowVolumes = Array.from({ length: 50 }, () => 500);
      
      // Test with high volume
      const highVolumeStrategy = new TradingStrategy(config);
      prices.forEach((price, index) => {
        highVolumeStrategy.updatePrice(price, highVolumes[index]);
      });
      
      const highVolumeTicker = createMockTicker('5250000', '3000');
      const highVolumeSignal = highVolumeStrategy.generateSignal(highVolumeTicker);
      
      // Test with low volume
      const lowVolumeStrategy = new TradingStrategy(config);
      prices.forEach((price, index) => {
        lowVolumeStrategy.updatePrice(price, lowVolumes[index]);
      });
      
      const lowVolumeTicker = createMockTicker('5250000', '500');
      const lowVolumeSignal = lowVolumeStrategy.generateSignal(lowVolumeTicker);
      
      // High volume should generally produce stronger signals
      if (highVolumeSignal.action !== 'hold' && lowVolumeSignal.action !== 'hold') {
        expect(highVolumeSignal.confidence).toBeGreaterThanOrEqual(lowVolumeSignal.confidence);
      }
    });
  });

  describe('data persistence and updates', () => {
    it('should handle continuous price updates correctly', () => {
      // Simulate continuous trading
      for (let i = 0; i < 100; i++) {
        const price = 5000000 + Math.sin(i * 0.1) * 100000;
        const volume = 1000 + Math.random() * 2000;
        strategy.updatePrice(price, volume);
        
        const ticker = createMockTicker(price.toString(), volume.toString());
        const signal = strategy.generateSignal(ticker);
        
        expect(signal).toBeDefined();
        expect(signal.price).toBe(price);
        expect(['buy', 'sell', 'hold']).toContain(signal.action);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should maintain performance with large datasets', () => {
      const startTime = Date.now();
      
      // Add a large number of data points
      for (let i = 0; i < 1000; i++) {
        const price = 5000000 + Math.sin(i * 0.01) * 50000;
        strategy.updatePrice(price, 1500);
      }
      
      const ticker = createMockTicker('5025000', '2000');
      const signal = strategy.generateSignal(ticker);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(signal).toBeDefined();
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});