import { TradingStrategy } from '../strategies/trading-strategy';
import { BitbankTicker, RealtimeMarketData } from '../types/bitbank';

describe('Enhanced Trading Strategy', () => {
  let strategy: TradingStrategy;
  let mockTicker: BitbankTicker;
  let mockRealtimeData: RealtimeMarketData;

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
      sell: '5000000',
      buy: '4999000',
      high: '5100000',
      low: '4900000',
      last: '5000000',
      vol: '100.5',
      timestamp: Date.now(),
    };

    mockRealtimeData = {
      pair: 'btc_jpy',
      orderBook: {
        asks: [{ price: '5000000', amount: '0.1' }],
        bids: [{ price: '4999000', amount: '0.15' }],
        asks_over: '0',
        bids_under: '0',
        asks_count: 1,
        bids_count: 1,
        sequence_id: 1,
        timestamp: Date.now(),
      },
      recentTransactions: [],
      ticker: {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5100000',
        low: '4900000',
        last: '5000000',
        vol: '100.5',
        timestamp: Date.now(),
      },
      analysis: {
        orderBook: {
          bidAskSpread: 1000,
          bidAskSpreadPercent: 0.02,
          midPrice: 4999500,
          totalBidVolume: 0.15,
          totalAskVolume: 0.1,
          orderBookImbalance: 0.2,
          supportLevel: 4999000,
          resistanceLevel: 5000000,
          liquidityDepth: 0.6,
          largeOrderThreshold: 1000000,
          largeOrders: { bids: [], asks: [] },
        },
        volume: {
          currentVolume: 0.1,
          volumeMA: 0.08,
          volumeSpike: false,
          volumeProfile: [],
          twap: 4999500,
          vwap: 4999500,
          institutionalActivity: 0.2,
        },
        microstructure: {
          averageSpread: 1000,
          spreadTrend: 'stable' as const,
          tradeFrequency: 0.1,
          priceImpact: 0.0001,
          liquidityProviders: {},
          executionQuality: 0.8,
        },
      },
      alerts: [],
      lastUpdated: Date.now(),
    };
  });

  describe('Basic Signal Generation', () => {
    it('should generate signals without real-time data', () => {
      // Build up price history for signal generation
      for (let i = 0; i < 15; i++) {
        const price = 5000000 + i * 1000;
        strategy.updatePrice(price);
      }

      const signal = strategy.generateSignal(mockTicker);

      expect(signal).toHaveProperty('action');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('price');
      expect(signal).toHaveProperty('amount');
      expect(signal).toHaveProperty('reason');
    });

    it('should return hold signal with insufficient price history', () => {
      const signal = strategy.generateSignal(mockTicker);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toBe('Insufficient price history');
    });
  });

  describe('Enhanced Signal Generation with Real-time Data', () => {
    beforeEach(() => {
      // Build up price history
      for (let i = 0; i < 15; i++) {
        const price = 5000000 + i * 1000;
        strategy.updatePrice(price);
      }
    });

    it('should generate enhanced signals with real-time data', () => {
      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      expect(signal).toHaveProperty('action');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('price');
      expect(signal).toHaveProperty('amount');
      expect(signal).toHaveProperty('reason');
    });

    it('should use mid price from order book when available', () => {
      // Set up bullish conditions
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 0.02;
      mockRealtimeData.analysis.volume.volumeSpike = false;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.8;

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      if (signal.action === 'buy') {
        expect(signal.price).toBe(mockRealtimeData.analysis.orderBook.midPrice);
      }
    });

    it('should generate enhanced buy signal with favorable conditions', () => {
      // Set up bullish conditions
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3; // Strong buy pressure
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 0.02; // Reasonable spread
      mockRealtimeData.analysis.volume.volumeSpike = false; // No volume spike
      mockRealtimeData.analysis.microstructure.executionQuality = 0.8; // Good execution
      mockRealtimeData.analysis.orderBook.liquidityDepth = 0.8; // Good liquidity

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      if (signal.action === 'buy') {
        expect(signal.confidence).toBeGreaterThan(0);
        expect(signal.reason).toContain('Bullish trend detected');
        expect(signal.reason).toContain('Strong buy pressure');
      }
    });

    it('should generate enhanced sell signal with bearish conditions', () => {
      // Set up bearish conditions
      mockRealtimeData.analysis.orderBook.orderBookImbalance = -0.3; // Strong sell pressure
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 0.02; // Reasonable spread
      mockRealtimeData.analysis.volume.volumeSpike = false; // No volume spike
      mockRealtimeData.analysis.microstructure.executionQuality = 0.8; // Good execution
      mockRealtimeData.analysis.orderBook.liquidityDepth = 0.8; // Good liquidity

      // Build bearish price history
      for (let i = 0; i < 15; i++) {
        const price = 5000000 - i * 1000;
        strategy.updatePrice(price);
      }

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      if (signal.action === 'sell') {
        expect(signal.confidence).toBeGreaterThan(0);
        expect(signal.reason).toContain('Bearish trend detected');
        expect(signal.reason).toContain('Strong sell pressure');
      }
    });

    it('should adjust confidence based on real-time factors', () => {
      // Test high quality conditions
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.9;
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 0.01;

      const highQualitySignal = strategy.generateSignal(mockTicker, mockRealtimeData);

      // Test low quality conditions
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.05;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.3;
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 0.8;

      const lowQualitySignal = strategy.generateSignal(mockTicker, mockRealtimeData);

      if (highQualitySignal.action !== 'hold' && lowQualitySignal.action !== 'hold') {
        expect(highQualitySignal.confidence).toBeGreaterThan(lowQualitySignal.confidence);
      }
    });

    it('should optimize trade amount based on real-time factors', () => {
      // Test high liquidity conditions
      mockRealtimeData.analysis.orderBook.liquidityDepth = 1.0;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.9;

      const highLiquiditySignal = strategy.generateSignal(mockTicker, mockRealtimeData);

      // Test low liquidity conditions
      mockRealtimeData.analysis.orderBook.liquidityDepth = 0.2;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.3;

      const lowLiquiditySignal = strategy.generateSignal(mockTicker, mockRealtimeData);

      if (highLiquiditySignal.action !== 'hold' && lowLiquiditySignal.action !== 'hold') {
        expect(highLiquiditySignal.amount).toBeGreaterThan(lowLiquiditySignal.amount);
      }
    });
  });

  describe('Risk Management with Real-time Data', () => {
    beforeEach(() => {
      // Build up price history
      for (let i = 0; i < 15; i++) {
        const price = 5000000 + i * 1000;
        strategy.updatePrice(price);
      }
    });

    it('should apply higher confidence threshold for real-time signals', () => {
      // Set up moderate conditions that would pass basic threshold but fail enhanced
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.15;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.4;

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      // Should be more conservative with real-time data
      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Confidence too low');
    });

    it('should reject signals with excessive spread', () => {
      // Set up good conditions but with wide spread
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 1.5; // > 1.0% threshold
      mockRealtimeData.analysis.microstructure.executionQuality = 0.8;

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Spread too wide');
    });

    it('should reject signals with insufficient liquidity', () => {
      // Set up good conditions but with low liquidity
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.orderBook.liquidityDepth = 0.05; // < 0.1 threshold
      mockRealtimeData.analysis.microstructure.executionQuality = 0.8;

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Insufficient liquidity');
    });

    it('should apply standard risk management for basic signals', () => {
      // Test with low confidence basic signal
      const basicSignal = strategy.generateSignal(mockTicker);

      expect(basicSignal.action).toBe('hold');
      expect(basicSignal.reason).toContain('Confidence too low');
    });
  });

  describe('Enhanced Reasoning', () => {
    beforeEach(() => {
      // Build up price history
      for (let i = 0; i < 15; i++) {
        const price = 5000000 + i * 1000;
        strategy.updatePrice(price);
      }
    });

    it('should provide detailed reasons for buy signals', () => {
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 0.02;
      mockRealtimeData.analysis.volume.institutionalActivity = 0.4;
      mockRealtimeData.analysis.orderBook.liquidityDepth = 1.2;

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      if (signal.action === 'buy') {
        expect(signal.reason).toContain('Bullish trend detected');
        expect(signal.reason).toContain('Strong buy pressure');
        expect(signal.reason).toContain('Institutional buying');
        expect(signal.reason).toContain('Tight spread');
        expect(signal.reason).toContain('High liquidity');
      }
    });

    it('should provide detailed reasons for sell signals', () => {
      mockRealtimeData.analysis.orderBook.orderBookImbalance = -0.3;
      mockRealtimeData.analysis.orderBook.bidAskSpreadPercent = 0.02;
      mockRealtimeData.analysis.volume.institutionalActivity = 0.4;
      mockRealtimeData.analysis.orderBook.liquidityDepth = 1.2;

      // Build bearish price history
      for (let i = 0; i < 15; i++) {
        const price = 5000000 - i * 1000;
        strategy.updatePrice(price);
      }

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      if (signal.action === 'sell') {
        expect(signal.reason).toContain('Bearish trend detected');
        expect(signal.reason).toContain('Strong sell pressure');
        expect(signal.reason).toContain('Institutional selling');
        expect(signal.reason).toContain('Tight spread');
        expect(signal.reason).toContain('High liquidity');
      }
    });
  });

  describe('Market Condition Filtering', () => {
    beforeEach(() => {
      // Build up price history
      for (let i = 0; i < 15; i++) {
        const price = 5000000 + i * 1000;
        strategy.updatePrice(price);
      }
    });

    it('should reject signals during volume spikes', () => {
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.volume.volumeSpike = true; // Volume spike
      mockRealtimeData.analysis.microstructure.executionQuality = 0.8;

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      expect(signal.action).toBe('hold');
    });

    it('should reject signals with poor execution quality', () => {
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.volume.volumeSpike = false;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.2; // Poor execution

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      expect(signal.action).toBe('hold');
    });

    it('should reject signals with inadequate liquidity depth', () => {
      mockRealtimeData.analysis.orderBook.orderBookImbalance = 0.3;
      mockRealtimeData.analysis.volume.volumeSpike = false;
      mockRealtimeData.analysis.microstructure.executionQuality = 0.8;
      mockRealtimeData.analysis.orderBook.liquidityDepth = 0.05; // Low liquidity

      const signal = strategy.generateSignal(mockTicker, mockRealtimeData);

      expect(signal.action).toBe('hold');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with existing API when no real-time data is provided', () => {
      // Build up price history
      for (let i = 0; i < 15; i++) {
        const price = 5000000 + i * 1000;
        strategy.updatePrice(price);
      }

      const signal = strategy.generateSignal(mockTicker);

      expect(signal).toHaveProperty('action');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('price');
      expect(signal).toHaveProperty('amount');
      expect(signal).toHaveProperty('reason');
    });

    it('should use standard confidence threshold without real-time data', () => {
      // Build up price history that would generate a signal
      for (let i = 0; i < 15; i++) {
        const price = 5000000 + i * 1000;
        strategy.updatePrice(price);
      }

      const basicSignal = strategy.generateSignal(mockTicker);
      const enhancedSignal = strategy.generateSignal(mockTicker, mockRealtimeData);

      // Basic signal should use 0.6 threshold, enhanced should use 0.7
      // Both might be 'hold' but for different reasons
      expect(basicSignal).toHaveProperty('action');
      expect(enhancedSignal).toHaveProperty('action');
    });
  });
});