import { ATRCalculator } from '../utils/atr-calculator';

describe('ATRCalculator', () => {
  let calculator: ATRCalculator;

  beforeEach(() => {
    calculator = new ATRCalculator(14); // 14-period ATR
  });

  describe('True Range calculation', () => {
    it('should calculate true range for first candle', () => {
      const candle = { high: 100, low: 95, close: 98 };
      const trueRange = calculator.calculateTrueRange(candle);
      
      // For first candle, TR = High - Low
      expect(trueRange).toBe(5);
    });

    it('should calculate true range considering previous close', () => {
      // First candle
      calculator.addCandle({ high: 100, low: 95, close: 98 });
      
      // Second candle - gap up
      const candle2 = { high: 105, low: 102, close: 104 };
      const trueRange = calculator.calculateTrueRange(candle2, 98);
      
      // TR = max(105-102, |105-98|, |102-98|) = max(3, 7, 4) = 7
      expect(trueRange).toBe(7);
    });

    it('should calculate true range for gap down', () => {
      const candle = { high: 95, low: 90, close: 92 };
      const previousClose = 100;
      const trueRange = calculator.calculateTrueRange(candle, previousClose);
      
      // TR = max(95-90, |95-100|, |90-100|) = max(5, 5, 10) = 10
      expect(trueRange).toBe(10);
    });
  });

  describe('ATR calculation', () => {
    it('should return 0 when no data', () => {
      expect(calculator.getATR()).toBe(0);
    });

    it('should calculate simple average for initial period', () => {
      const candles = [
        { high: 100, low: 95, close: 98 },
        { high: 105, low: 100, close: 103 },
        { high: 108, low: 103, close: 106 },
      ];

      candles.forEach(candle => calculator.addCandle(candle));
      
      const atr = calculator.getATR();
      // Should be average of true ranges: (5 + 7 + 5) / 3 = 5.67
      expect(atr).toBeCloseTo(5.67, 1);
    });

    it('should use exponential moving average after initial period', () => {
      const candles = Array.from({ length: 15 }, (_, i) => ({
        high: 100 + i,
        low: 95 + i,
        close: 98 + i,
      }));

      candles.forEach(candle => calculator.addCandle(candle));
      
      const atr = calculator.getATR();
      expect(atr).toBeGreaterThan(0);
      expect(atr).toBeLessThan(10); // Should be reasonable range
    });

    it('should handle volatile price movements', () => {
      const volatileCandles = [
        { high: 100, low: 95, close: 98 },
        { high: 110, low: 98, close: 105 }, // Gap up
        { high: 108, low: 90, close: 95 },  // Large range
        { high: 100, low: 92, close: 96 },
      ];

      volatileCandles.forEach(candle => calculator.addCandle(candle));
      
      const atr = calculator.getATR();
      expect(atr).toBeGreaterThan(5); // Should reflect higher volatility
    });
  });

  describe('dynamic periods', () => {
    it('should accept different ATR periods', () => {
      const calculator7 = new ATRCalculator(7);
      const calculator21 = new ATRCalculator(21);

      const candles = Array.from({ length: 25 }, () => ({
        high: 100 + Math.random() * 10,
        low: 95 + Math.random() * 5,
        close: 97 + Math.random() * 8,
      }));

      candles.forEach(candle => {
        calculator7.addCandle(candle);
        calculator21.addCandle(candle);
      });

      const atr7 = calculator7.getATR();
      const atr21 = calculator21.getATR();

      expect(atr7).toBeGreaterThan(0);
      expect(atr21).toBeGreaterThan(0);
      // Shorter period typically more reactive
      expect(Math.abs(atr7 - atr21)).toBeGreaterThan(0);
    });
  });

  describe('market data handling', () => {
    it('should handle price gaps correctly', () => {
      calculator.addCandle({ high: 100, low: 95, close: 98 });
      calculator.addCandle({ high: 120, low: 115, close: 118 }); // Big gap up
      
      const atr = calculator.getATR();
      expect(atr).toBeGreaterThan(10); // Should reflect the gap
    });

    it('should maintain historical data correctly', () => {
      const testCandles = [
        { high: 100, low: 95, close: 98 },
        { high: 105, low: 100, close: 103 },
        { high: 108, low: 103, close: 106 },
      ];

      testCandles.forEach(candle => calculator.addCandle(candle));
      
      const history = calculator.getTrueRangeHistory();
      expect(history).toHaveLength(3);
      expect(history[0]).toBe(5); // First TR
    });
  });
});