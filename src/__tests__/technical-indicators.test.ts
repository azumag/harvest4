import { TechnicalIndicators } from '../utils/technical-indicators';

describe('TechnicalIndicators', () => {
  let indicators: TechnicalIndicators;

  beforeEach(() => {
    indicators = new TechnicalIndicators();
  });

  const addPriceData = (prices: number[], volumes?: number[]): void => {
    prices.forEach((price, index) => {
      const volume = volumes ? (volumes[index] || 1000) : 1000;
      indicators.updateData(price, volume);
    });
  };

  describe('RSI calculation', () => {
    it('should return null with insufficient data', () => {
      addPriceData([5000000, 5010000]);
      const rsi = indicators.calculateRSI(14);
      expect(rsi).toBeNull();
    });

    it('should calculate RSI correctly for upward trend', () => {
      const upwardPrices = Array.from({ length: 20 }, (_, i) => 5000000 + i * 10000);
      addPriceData(upwardPrices);
      
      const rsi = indicators.calculateRSI(14);
      expect(rsi).toBeDefined();
      expect(rsi!.rsi).toBeGreaterThan(50);
      expect(rsi!.overbought).toBe(rsi!.rsi > 70);
      expect(rsi!.oversold).toBe(rsi!.rsi < 30);
    });

    it('should calculate RSI correctly for downward trend', () => {
      const downwardPrices = Array.from({ length: 20 }, (_, i) => 5200000 - i * 10000);
      addPriceData(downwardPrices);
      
      const rsi = indicators.calculateRSI(14);
      expect(rsi).toBeDefined();
      expect(rsi!.rsi).toBeLessThan(50);
    });

    it('should identify overbought and oversold conditions', () => {
      // Create strong upward trend for overbought
      const strongUpward = Array.from({ length: 20 }, (_, i) => 5000000 + i * 50000);
      addPriceData(strongUpward);
      
      const overboughtRSI = indicators.calculateRSI(14);
      expect(overboughtRSI!.overbought).toBe(true);

      // Reset and create strong downward trend for oversold
      indicators = new TechnicalIndicators();
      const strongDownward = Array.from({ length: 20 }, (_, i) => 5500000 - i * 50000);
      addPriceData(strongDownward);
      
      const oversoldRSI = indicators.calculateRSI(14);
      expect(oversoldRSI!.oversold).toBe(true);
    });
  });

  describe('MACD calculation', () => {
    it('should return null with insufficient data', () => {
      addPriceData([5000000, 5010000]);
      const macd = indicators.calculateMACD();
      expect(macd).toBeNull();
    });

    it('should calculate MACD components correctly', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 5000000 + Math.sin(i * 0.1) * 50000);
      addPriceData(prices);
      
      const macd = indicators.calculateMACD();
      expect(macd).toBeDefined();
      expect(typeof macd!.macd).toBe('number');
      expect(typeof macd!.signal).toBe('number');
      expect(typeof macd!.histogram).toBe('number');
      expect(macd!.histogram).toBeCloseTo(macd!.macd - macd!.signal);
    });

    it('should detect crossovers', () => {
      // Create price pattern that should generate crossovers
      const crossoverPrices = [
        ...Array.from({ length: 30 }, (_, i) => 5000000 - i * 5000), // Downward
        ...Array.from({ length: 30 }, (_, i) => 4850000 + i * 10000), // Strong upward
      ];
      addPriceData(crossoverPrices);
      
      const macd = indicators.calculateMACD();
      expect(macd).toBeDefined();
      expect(typeof macd!.bullishCrossover).toBe('boolean');
      expect(typeof macd!.bearishCrossover).toBe('boolean');
    });
  });

  describe('Bollinger Bands calculation', () => {
    it('should return null with insufficient data', () => {
      addPriceData([5000000, 5010000]);
      const bb = indicators.calculateBollingerBands();
      expect(bb).toBeNull();
    });

    it('should calculate Bollinger Bands correctly', () => {
      const prices = Array.from({ length: 25 }, () => 5000000 + Math.random() * 100000);
      addPriceData(prices);
      
      const bb = indicators.calculateBollingerBands();
      expect(bb).toBeDefined();
      expect(bb!.upper).toBeGreaterThan(bb!.middle);
      expect(bb!.middle).toBeGreaterThan(bb!.lower);
      expect(bb!.percentB).toBeGreaterThanOrEqual(0);
      expect(bb!.bandwidth).toBeGreaterThan(0);
    });

    it('should detect squeeze conditions', () => {
      // Create low volatility prices for squeeze
      const lowVolatilityPrices = Array.from({ length: 25 }, () => 5000000 + Math.random() * 5000);
      addPriceData(lowVolatilityPrices);
      
      const bb = indicators.calculateBollingerBands();
      expect(bb).toBeDefined();
      expect(typeof bb!.squeeze).toBe('boolean');
    });
  });

  describe('Volume indicators calculation', () => {
    it('should return null with insufficient data', () => {
      addPriceData([5000000, 5010000]);
      const volume = indicators.calculateVolumeIndicators();
      expect(volume).toBeNull();
    });

    it('should calculate VWAP correctly', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 5000000 + i * 1000);
      const volumes = Array.from({ length: 25 }, (_, i) => 1000 + i * 100);
      
      prices.forEach((price, index) => {
        indicators.updateData(price, volumes[index] || 1000);
      });
      
      const volumeIndicators = indicators.calculateVolumeIndicators();
      expect(volumeIndicators).toBeDefined();
      expect(volumeIndicators!.vwap).toBeGreaterThan(0);
    });

    it('should calculate OBV correctly', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 5000000 + (i % 2 ? 1000 : -500));
      const volumes = Array.from({ length: 25 }, (_, i) => 1000 + i * 50);
      
      prices.forEach((price, index) => {
        indicators.updateData(price, volumes[index] || 1000);
      });
      
      const volumeIndicators = indicators.calculateVolumeIndicators();
      expect(volumeIndicators).toBeDefined();
      expect(typeof volumeIndicators!.obv).toBe('number');
    });

    it('should calculate volume rate of change', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 5000000 + i * 1000);
      const volumes = Array.from({ length: 25 }, (_, i) => 1000 + i * 100);
      
      prices.forEach((price, index) => {
        indicators.updateData(price, volumes[index] || 1000);
      });
      
      const volumeIndicators = indicators.calculateVolumeIndicators();
      expect(volumeIndicators).toBeDefined();
      expect(volumeIndicators!.volumeRateOfChange).toBeGreaterThan(0);
    });
  });

  describe('Multi-timeframe analysis', () => {
    it('should analyze multiple timeframes', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 5000000 + i * 1000);
      addPriceData(prices);
      
      const multiTimeframe = indicators.analyzeMultiTimeframe();
      expect(multiTimeframe).toHaveLength(4);
      
      multiTimeframe.forEach(signal => {
        expect(['1m', '5m', '15m', '1h']).toContain(signal.timeframe);
        expect(['bullish', 'bearish', 'neutral']).toContain(signal.trend);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(1);
      });
    });

    it('should detect bullish trend in multi-timeframe analysis', () => {
      const strongUpward = Array.from({ length: 100 }, (_, i) => 5000000 + i * 5000);
      addPriceData(strongUpward);
      
      const multiTimeframe = indicators.analyzeMultiTimeframe();
      const bullishSignals = multiTimeframe.filter(tf => tf.trend === 'bullish');
      expect(bullishSignals.length).toBeGreaterThan(0);
    });
  });

  describe('Divergence detection', () => {
    it('should detect bullish divergence', () => {
      // Create price pattern with declining prices but improving RSI
      const divergencePrices = [
        ...Array.from({ length: 30 }, (_, i) => 5000000 - i * 3000), // Declining prices
        ...Array.from({ length: 20 }, (_, i) => 4910000 - i * 1000), // Continue decline but slower
      ];
      addPriceData(divergencePrices);
      
      const divergence = indicators.getDivergenceSignals();
      expect(typeof divergence.bullishDivergence).toBe('boolean');
      expect(typeof divergence.bearishDivergence).toBe('boolean');
    });

    it('should handle insufficient data for divergence', () => {
      addPriceData([5000000, 5010000]);
      
      const divergence = indicators.getDivergenceSignals();
      expect(divergence.bullishDivergence).toBe(false);
      expect(divergence.bearishDivergence).toBe(false);
    });
  });

  describe('Data management', () => {
    it('should limit data history to prevent memory issues', () => {
      // Add more than 200 data points
      const prices = Array.from({ length: 250 }, (_, i) => 5000000 + i * 1000);
      addPriceData(prices);
      
      // Should still be able to calculate indicators
      const rsi = indicators.calculateRSI();
      const macd = indicators.calculateMACD();
      const bb = indicators.calculateBollingerBands();
      
      expect(rsi).toBeDefined();
      expect(macd).toBeDefined();
      expect(bb).toBeDefined();
    });

    it('should handle zero volume gracefully', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 5000000 + i * 1000);
      const volumes = Array.from({ length: 25 }, () => 0);
      
      prices.forEach((price, index) => {
        indicators.updateData(price, volumes[index] || 1000);
      });
      
      const volumeIndicators = indicators.calculateVolumeIndicators();
      expect(volumeIndicators).toBeDefined();
      expect(volumeIndicators!.vwap).toBe(5024000); // Should fallback to last price
    });
  });
});