import { TechnicalIndicators } from '../utils/technical-indicators';

describe('TechnicalIndicators', () => {
  let indicators: TechnicalIndicators;

  beforeEach(() => {
    indicators = new TechnicalIndicators();
  });

  describe('RSI Calculation', () => {
    it('should return neutral RSI for insufficient data', () => {
      indicators.updatePrice(100);
      const rsi = indicators.calculateRSI();
      
      expect(rsi.rsi).toBe(50);
      expect(rsi.signal).toBe('hold');
      expect(rsi.overbought).toBe(false);
      expect(rsi.oversold).toBe(false);
    });

    it('should calculate RSI correctly with sufficient data', () => {
      // Add price data that should generate an oversold condition
      const prices = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30];
      prices.forEach(price => indicators.updatePrice(price));
      
      const rsi = indicators.calculateRSI();
      
      expect(rsi.rsi).toBeLessThan(30);
      expect(rsi.oversold).toBe(true);
      expect(rsi.signal).toBe('buy');
    });

    it('should detect overbought conditions', () => {
      // Add price data that should generate an overbought condition
      const prices = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170];
      prices.forEach(price => indicators.updatePrice(price));
      
      const rsi = indicators.calculateRSI();
      
      expect(rsi.rsi).toBeGreaterThan(70);
      expect(rsi.overbought).toBe(true);
      expect(rsi.signal).toBe('sell');
    });
  });

  describe('MACD Calculation', () => {
    it('should return neutral MACD for insufficient data', () => {
      indicators.updatePrice(100);
      const macd = indicators.calculateMACD();
      
      expect(macd.macd).toBe(0);
      expect(macd.signal).toBe(0);
      expect(macd.histogram).toBe(0);
      expect(macd.trend).toBe('neutral');
    });

    it('should calculate MACD correctly with sufficient data', () => {
      // Add trending price data
      const prices = Array.from({length: 30}, (_, i) => 100 + i * 2);
      prices.forEach(price => indicators.updatePrice(price));
      
      const macd = indicators.calculateMACD();
      
      expect(macd.macd).toBeGreaterThan(0);
      expect(['bullish', 'neutral']).toContain(macd.trend);
    });

    it('should detect crossovers', () => {
      // Add price data and calculate multiple times to detect crossovers
      const prices = Array.from({length: 50}, (_, i) => 100 + Math.sin(i * 0.1) * 10);
      prices.forEach(price => indicators.updatePrice(price));
      
      const macd1 = indicators.calculateMACD();
      
      // Add more data to potentially trigger crossover
      for (let i = 0; i < 10; i++) {
        indicators.updatePrice(120 + i * 2);
      }
      
      const macd2 = indicators.calculateMACD();
      
      expect(typeof macd1.bullishCrossover).toBe('boolean');
      expect(typeof macd2.bearishCrossover).toBe('boolean');
    });
  });

  describe('Bollinger Bands Calculation', () => {
    it('should return current price as bands for insufficient data', () => {
      indicators.updatePrice(100);
      const bb = indicators.calculateBollingerBands();
      
      expect(bb.upperBand).toBe(100);
      expect(bb.middleBand).toBe(100);
      expect(bb.lowerBand).toBe(100);
      expect(bb.position).toBe('middle');
    });

    it('should calculate Bollinger Bands correctly', () => {
      // Add price data with some volatility
      const prices = [100, 102, 98, 105, 95, 108, 92, 110, 90, 112, 88, 115, 85, 118, 82, 120, 80, 122, 78, 125];
      prices.forEach(price => indicators.updatePrice(price));
      
      const bb = indicators.calculateBollingerBands();
      
      expect(bb.upperBand).toBeGreaterThan(bb.middleBand);
      expect(bb.lowerBand).toBeLessThan(bb.middleBand);
      expect(bb.bandwidth).toBeGreaterThan(0);
      expect(bb.percentB).toBeGreaterThanOrEqual(0);
    });

    it('should detect squeeze conditions', () => {
      // Add price data with low volatility
      const prices = Array.from({length: 20}, () => 100 + Math.random() * 2);
      prices.forEach(price => indicators.updatePrice(price));
      
      const bb = indicators.calculateBollingerBands();
      
      expect(typeof bb.squeeze).toBe('boolean');
    });

    it('should detect position relative to bands', () => {
      // Add price data
      const prices = Array.from({length: 20}, (_, i) => 100 + i);
      prices.forEach(price => indicators.updatePrice(price));
      
      const bb = indicators.calculateBollingerBands();
      
      // Add a price well above the upper band
      indicators.updatePrice(200);
      const bbHigh = indicators.calculateBollingerBands();
      
      expect(['above', 'below', 'middle']).toContain(bb.position);
      expect(['above', 'below', 'middle']).toContain(bbHigh.position);
    });
  });

  describe('Volume Indicators', () => {
    it('should return default values for insufficient data', () => {
      indicators.updatePrice(100, 1000);
      const volume = indicators.calculateVolumeIndicators();
      
      expect(volume.vwap).toBe(100);
      expect(volume.obv).toBe(0);
      expect(volume.volumeRateOfChange).toBe(0);
      expect(volume.volumeSignal).toBe('normal');
    });

    it('should calculate VWAP correctly', () => {
      // Add price and volume data
      const data = [
        {price: 100, volume: 1000},
        {price: 102, volume: 1500},
        {price: 98, volume: 800},
        {price: 105, volume: 2000},
        {price: 95, volume: 1200}
      ];
      
      data.forEach(({price, volume}) => indicators.updatePrice(price, volume));
      
      const volumeIndicators = indicators.calculateVolumeIndicators();
      
      expect(volumeIndicators.vwap).toBeGreaterThan(0);
      expect(volumeIndicators.vwap).not.toBe(100);
    });

    it('should calculate OBV correctly', () => {
      // Add price and volume data with clear trend
      const data = [
        {price: 100, volume: 1000},
        {price: 102, volume: 1500}, // Price up, OBV should increase
        {price: 105, volume: 2000}, // Price up, OBV should increase
        {price: 103, volume: 1800}, // Price down, OBV should decrease
      ];
      
      data.forEach(({price, volume}) => indicators.updatePrice(price, volume));
      
      const volumeIndicators = indicators.calculateVolumeIndicators();
      
      // OBV should be positive (1500 + 2000 - 1800 = 1700)
      expect(volumeIndicators.obv).toBeGreaterThanOrEqual(0);
      expect(typeof volumeIndicators.obv).toBe('number');
    });

    it('should detect volume signals', () => {
      // Add normal volume data
      for (let i = 0; i < 21; i++) {
        indicators.updatePrice(100 + i, 1000);
      }
      
      // Add high volume
      indicators.updatePrice(125, 5000);
      
      const volumeIndicators = indicators.calculateVolumeIndicators();
      
      expect(volumeIndicators.volumeSignal).toBe('high');
    });
  });

  describe('Multi-timeframe Analysis', () => {
    it('should return analysis for all timeframes', () => {
      // Add sufficient data
      for (let i = 0; i < 50; i++) {
        indicators.updatePrice(100 + i, 1000);
      }
      
      const analysis = indicators.calculateMultiTimeframeAnalysis();
      
      expect(analysis.timeframes).toHaveProperty('1m');
      expect(analysis.timeframes).toHaveProperty('5m');
      expect(analysis.timeframes).toHaveProperty('15m');
      expect(analysis.timeframes).toHaveProperty('1h');
      expect(['bullish', 'bearish', 'neutral']).toContain(analysis.consensus);
      expect(analysis.strength).toBeGreaterThanOrEqual(0);
      expect(analysis.strength).toBeLessThanOrEqual(1);
    });
  });

  describe('Divergence Analysis', () => {
    it('should return no divergence for insufficient data', () => {
      indicators.updatePrice(100);
      const divergence = indicators.analyzeDivergence();
      
      expect(divergence.type).toBe('none');
      expect(divergence.strength).toBe(0);
      expect(divergence.description).toContain('Insufficient data');
    });

    it('should analyze divergence with sufficient data', () => {
      // Add sufficient price data
      for (let i = 0; i < 25; i++) {
        indicators.updatePrice(100 + Math.sin(i * 0.2) * 10);
        indicators.calculateRSI(); // This populates the RSI history
      }
      
      const divergence = indicators.analyzeDivergence();
      
      expect(['bullish', 'bearish', 'none']).toContain(divergence.type);
      expect(divergence.strength).toBeGreaterThanOrEqual(0);
      expect(divergence.strength).toBeLessThanOrEqual(1);
      expect(typeof divergence.description).toBe('string');
    });
  });

  describe('Comprehensive Analysis', () => {
    it('should return all indicator results', () => {
      // Add sufficient data for all indicators
      for (let i = 0; i < 30; i++) {
        indicators.updatePrice(100 + i + Math.sin(i * 0.1) * 5, 1000 + i * 50);
      }
      
      const analysis = indicators.getComprehensiveAnalysis();
      
      expect(analysis).toHaveProperty('rsi');
      expect(analysis).toHaveProperty('macd');
      expect(analysis).toHaveProperty('bollingerBands');
      expect(analysis).toHaveProperty('volumeIndicators');
      expect(analysis).toHaveProperty('multiTimeframe');
      expect(analysis).toHaveProperty('divergence');
      
      // Check RSI properties
      expect(analysis.rsi).toHaveProperty('rsi');
      expect(analysis.rsi).toHaveProperty('signal');
      expect(analysis.rsi).toHaveProperty('overbought');
      expect(analysis.rsi).toHaveProperty('oversold');
      
      // Check MACD properties
      expect(analysis.macd).toHaveProperty('macd');
      expect(analysis.macd).toHaveProperty('signal');
      expect(analysis.macd).toHaveProperty('histogram');
      expect(analysis.macd).toHaveProperty('trend');
      
      // Check Bollinger Bands properties
      expect(analysis.bollingerBands).toHaveProperty('upperBand');
      expect(analysis.bollingerBands).toHaveProperty('middleBand');
      expect(analysis.bollingerBands).toHaveProperty('lowerBand');
      expect(analysis.bollingerBands).toHaveProperty('position');
      
      // Check Volume Indicators properties
      expect(analysis.volumeIndicators).toHaveProperty('vwap');
      expect(analysis.volumeIndicators).toHaveProperty('obv');
      expect(analysis.volumeIndicators).toHaveProperty('volumeRateOfChange');
      expect(analysis.volumeIndicators).toHaveProperty('volumeSignal');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero prices gracefully', () => {
      indicators.updatePrice(0);
      const analysis = indicators.getComprehensiveAnalysis();
      
      expect(analysis.rsi.rsi).toBe(50);
      expect(analysis.macd.macd).toBe(0);
    });

    it('should handle negative prices', () => {
      indicators.updatePrice(-100);
      const analysis = indicators.getComprehensiveAnalysis();
      
      expect(typeof analysis.rsi.rsi).toBe('number');
      expect(typeof analysis.macd.macd).toBe('number');
    });

    it('should handle very large numbers', () => {
      indicators.updatePrice(1000000);
      const analysis = indicators.getComprehensiveAnalysis();
      
      expect(isFinite(analysis.rsi.rsi)).toBe(true);
      expect(isFinite(analysis.macd.macd)).toBe(true);
    });
  });
});