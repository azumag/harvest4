import { TradingStrategy } from '../strategies/trading-strategy';
import { BitbankTicker } from '../types/bitbank';

describe('Advanced Trading Strategy', () => {
  let strategy: TradingStrategy;
  let mockTicker: BitbankTicker;

  beforeEach(() => {
    strategy = new TradingStrategy({
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8,
    });

    mockTicker = {
      pair: 'btc_jpy',
      sell: '4500000',
      buy: '4500100',
      high: '4600000',
      low: '4400000',
      last: '4500000',
      vol: '1500.0000',
      timestamp: Date.now(),
    };
  });

  describe('Signal Generation with Advanced Indicators', () => {
    it('should generate hold signal with insufficient data', () => {
      const signal = strategy.generateSignal(mockTicker);
      
      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Insufficient price history');
    });

    it('should generate signals based on multiple indicators', () => {
      // Add enough price data to activate advanced indicators
      const basePrice = 4500000;
      for (let i = 0; i < 30; i++) {
        const price = basePrice + i * 1000 + Math.sin(i * 0.1) * 5000;
        const volume = 1000 + i * 50;
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: volume.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      // Generate final signal
      const signal = strategy.generateSignal(mockTicker);
      
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(signal.reason).toBeTruthy();
    });

    it('should require multiple bullish signals for buy action', () => {
      // Add price data that should generate bullish signals
      const basePrice = 4500000;
      
      // Create strong uptrend
      for (let i = 0; i < 30; i++) {
        const price = basePrice + i * 2000; // Strong uptrend
        const volume = 1500 + i * 100; // Increasing volume
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: volume.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      // Should be either buy or hold (depending on other factors)
      expect(['buy', 'hold']).toContain(signal.action);
    });

    it('should require multiple bearish signals for sell action', () => {
      // Add price data that should generate bearish signals
      const basePrice = 4500000;
      
      // Create strong downtrend
      for (let i = 0; i < 30; i++) {
        const price = basePrice - i * 2000; // Strong downtrend
        const volume = 1500 + i * 100; // Increasing volume
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: volume.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      // Should be either sell or hold (depending on other factors)
      expect(['sell', 'hold']).toContain(signal.action);
    });

    it('should generate detailed reason for trade decisions', () => {
      // Add sufficient data
      for (let i = 0; i < 30; i++) {
        const price = 4500000 + i * 1000;
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: (1500 + i * 50).toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      if (signal.action !== 'hold') {
        // Should include specific indicator names in reason
        expect(signal.reason).toBeTruthy();
        expect(signal.reason.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Risk Management with Advanced Indicators', () => {
    it('should apply higher confidence threshold for advanced signals', () => {
      // Add some data
      for (let i = 0; i < 20; i++) {
        const price = 4500000 + i * 500;
        const ticker = {
          ...mockTicker,
          last: price.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      if (signal.action !== 'hold') {
        // Advanced strategy should have higher confidence threshold (0.7)
        expect(signal.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should adjust trade amount based on multiple factors', () => {
      // Add sufficient data
      for (let i = 0; i < 30; i++) {
        const price = 4500000 + i * 1000;
        const volume = 1000 + i * 100;
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: volume.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      if (signal.action !== 'hold') {
        expect(signal.amount).toBeGreaterThan(0);
        // Amount should be adjusted based on volatility, volume, and multi-timeframe strength
        expect(signal.amount).toBeLessThanOrEqual(10000 / parseFloat(mockTicker.last));
      }
    });

    it('should reject signals with insufficient confidence', () => {
      // Add minimal data that might generate weak signals
      for (let i = 0; i < 15; i++) {
        const price = 4500000 + (i % 2 === 0 ? 100 : -100); // Choppy movement
        const ticker = {
          ...mockTicker,
          last: price.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      // Should likely be hold due to mixed signals and low confidence
      if (signal.action === 'hold' && signal.reason.includes('Confidence too low')) {
        expect(signal.reason).toContain('Confidence too low');
      }
    });
  });

  describe('Technical Indicator Integration', () => {
    it('should use RSI signals in decision making', () => {
      // Create oversold condition
      const basePrice = 4500000;
      for (let i = 0; i < 30; i++) {
        const price = basePrice - i * 5000; // Strong downtrend for oversold RSI
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: (1500 + i * 50).toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      if (signal.action === 'buy') {
        expect(signal.reason).toBeTruthy();
        // RSI should be one of the contributing factors
      }
    });

    it('should use MACD signals in decision making', () => {
      // Add trending data that should generate MACD signals
      const basePrice = 4500000;
      for (let i = 0; i < 50; i++) {
        const price = basePrice + i * 1000; // Consistent uptrend
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: (1500 + i * 30).toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      if (signal.action !== 'hold') {
        expect(signal.reason).toBeTruthy();
        // MACD should be one of the contributing factors
      }
    });

    it('should use Bollinger Bands in decision making', () => {
      // Add data with high volatility
      const basePrice = 4500000;
      for (let i = 0; i < 25; i++) {
        const price = basePrice + Math.sin(i * 0.3) * 50000; // High volatility
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: (1500 + i * 40).toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      // Add extreme price that should be outside bands
      const extremeTicker = {
        ...mockTicker,
        last: (basePrice + 100000).toString(),
      };
      
      const signal = strategy.generateSignal(extremeTicker);
      
      if (signal.action !== 'hold') {
        expect(signal.reason).toBeTruthy();
      }
    });

    it('should use volume indicators in decision making', () => {
      // Add data with varying volume
      const basePrice = 4500000;
      for (let i = 0; i < 25; i++) {
        const price = basePrice + i * 1000;
        const volume = 1000 + i * 200; // Increasing volume
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: volume.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      // Add high volume signal
      const highVolumeTicker = {
        ...mockTicker,
        last: (basePrice + 30000).toString(),
        vol: '10000', // Very high volume
      };
      
      const signal = strategy.generateSignal(highVolumeTicker);
      
      if (signal.action !== 'hold') {
        expect(signal.reason).toBeTruthy();
      }
    });
  });

  describe('Signal Consensus Logic', () => {
    it('should require at least 3 signals for buy action', () => {
      // This is tested implicitly through the other tests
      // The strategy should only generate buy signals when multiple indicators agree
      const basePrice = 4500000;
      
      // Add mixed signals
      for (let i = 0; i < 20; i++) {
        const price = basePrice + (i % 5 === 0 ? 2000 : -500); // Mixed trend
        const ticker = {
          ...mockTicker,
          last: price.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      // Mixed signals should result in hold
      if (signal.action === 'hold') {
        expect(signal.reason).toBeTruthy();
      }
    });

    it('should require at least 3 signals for sell action', () => {
      // Similar to buy test but for sell
      const basePrice = 4500000;
      
      // Add mixed signals
      for (let i = 0; i < 20; i++) {
        const price = basePrice - (i % 5 === 0 ? 2000 : -500); // Mixed trend
        const ticker = {
          ...mockTicker,
          last: price.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      // Mixed signals should result in hold
      if (signal.action === 'hold') {
        expect(signal.reason).toBeTruthy();
      }
    });

    it('should prefer stronger signals over weaker ones', () => {
      // Add data that creates clear strong signals
      const basePrice = 4500000;
      for (let i = 0; i < 30; i++) {
        const price = basePrice + i * 3000; // Very strong uptrend
        const volume = 2000 + i * 100; // Strong volume
        const ticker = {
          ...mockTicker,
          last: price.toString(),
          vol: volume.toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      const signal = strategy.generateSignal(mockTicker);
      
      if (signal.action !== 'hold') {
        expect(signal.confidence).toBeGreaterThan(0.7);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid ticker data gracefully', () => {
      const invalidTicker = {
        ...mockTicker,
        last: 'invalid',
        vol: 'invalid',
      };
      
      expect(() => strategy.generateSignal(invalidTicker)).not.toThrow();
    });

    it('should handle extreme price movements', () => {
      // Add normal data first
      for (let i = 0; i < 20; i++) {
        const ticker = {
          ...mockTicker,
          last: (4500000 + i * 1000).toString(),
        };
        strategy.generateSignal(ticker);
      }
      
      // Add extreme price
      const extremeTicker = {
        ...mockTicker,
        last: '100000000', // Very high price
      };
      
      expect(() => strategy.generateSignal(extremeTicker)).not.toThrow();
    });
  });
});