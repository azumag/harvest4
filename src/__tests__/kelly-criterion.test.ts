import { KellyCriterionCalculator } from '../utils/kelly-criterion';

describe('KellyCriterionCalculator', () => {
  let calculator: KellyCriterionCalculator;

  beforeEach(() => {
    calculator = new KellyCriterionCalculator();
  });

  describe('Kelly Criterion calculation', () => {
    it('should calculate Kelly percentage correctly', () => {
      const winRate = 0.6; // 60% win rate
      const avgWin = 100;   // Average win: 100 JPY
      const avgLoss = 50;   // Average loss: 50 JPY
      
      // Temporarily remove the cap for this test
      calculator.setMaxKellyPercentage(1.0);
      const kellyPercentage = calculator.calculateKellyPercentage(winRate, avgWin, avgLoss);
      
      // Kelly = (p * (b + 1) - 1) / b
      // where p = win rate, b = avg win / avg loss
      // Kelly = (0.6 * (2 + 1) - 1) / 2 = (1.8 - 1) / 2 = 0.4 = 40%
      expect(kellyPercentage).toBeCloseTo(0.4, 2);
    });

    it('should return 0 for negative expectation', () => {
      const winRate = 0.4; // 40% win rate
      const avgWin = 50;    // Average win: 50 JPY
      const avgLoss = 100;  // Average loss: 100 JPY
      
      const kellyPercentage = calculator.calculateKellyPercentage(winRate, avgWin, avgLoss);
      
      // Negative expectation should result in 0 position size
      expect(kellyPercentage).toBe(0);
    });

    it('should handle edge case of zero average loss', () => {
      const winRate = 0.8;
      const avgWin = 100;
      const avgLoss = 0;
      
      const kellyPercentage = calculator.calculateKellyPercentage(winRate, avgWin, avgLoss);
      
      // Should handle division by zero gracefully
      expect(kellyPercentage).toBe(0);
    });

    it('should cap Kelly percentage to maximum allowed', () => {
      const winRate = 0.9; // Very high win rate
      const avgWin = 1000; // Very high win
      const avgLoss = 10;  // Very low loss
      
      calculator.setMaxKellyPercentage(0.25); // Cap at 25%
      const kellyPercentage = calculator.calculateKellyPercentage(winRate, avgWin, avgLoss);
      
      expect(kellyPercentage).toBeLessThanOrEqual(0.25);
    });
  });

  describe('Position size calculation', () => {
    it('should calculate optimal position size', () => {
      const accountBalance = 100000; // 100,000 JPY
      const winRate = 0.6;
      const avgWin = 200;
      const avgLoss = 100;
      
      // Remove cap and set conservative scale to 1.0 for this test
      calculator.setMaxKellyPercentage(1.0);
      calculator.setConservativeScale(1.0);
      
      const positionSize = calculator.calculatePositionSize(
        accountBalance, 
        winRate, 
        avgWin, 
        avgLoss
      );
      
      // Kelly = 40%, so position size should be 40,000 JPY
      expect(positionSize).toBeCloseTo(40000, 0);
    });

    it('should apply conservative scaling factor', () => {
      const accountBalance = 100000;
      const winRate = 0.7;
      const avgWin = 150;
      const avgLoss = 75;
      
      calculator.setConservativeScale(0.5); // Use 50% of Kelly
      const positionSize = calculator.calculatePositionSize(
        accountBalance, 
        winRate, 
        avgWin, 
        avgLoss
      );
      
      const fullKelly = calculator.calculateKellyPercentage(winRate, avgWin, avgLoss);
      const expectedSize = accountBalance * fullKelly * 0.5;
      
      expect(positionSize).toBeCloseTo(expectedSize, 0);
    });

    it('should respect minimum position size', () => {
      const accountBalance = 10000; // Small account
      const winRate = 0.55;
      const avgWin = 50;
      const avgLoss = 45;
      
      calculator.setMinPositionSize(1000); // Minimum 1000 JPY
      const positionSize = calculator.calculatePositionSize(
        accountBalance, 
        winRate, 
        avgWin, 
        avgLoss
      );
      
      expect(positionSize).toBeGreaterThanOrEqual(1000);
    });

    it('should respect maximum position size', () => {
      const accountBalance = 1000000; // Large account
      const winRate = 0.8;
      const avgWin = 500;
      const avgLoss = 100;
      
      calculator.setMaxPositionSize(50000); // Maximum 50,000 JPY
      const positionSize = calculator.calculatePositionSize(
        accountBalance, 
        winRate, 
        avgWin, 
        avgLoss
      );
      
      expect(positionSize).toBeLessThanOrEqual(50000);
    });
  });

  describe('Historical data integration', () => {
    it('should update statistics from trade history', () => {
      const trades = [
        { profit: 100, isWin: true },
        { profit: -50, isWin: false },
        { profit: 150, isWin: true },
        { profit: -75, isWin: false },
        { profit: 200, isWin: true },
      ];
      
      calculator.updateFromTradeHistory(trades);
      
      const stats = calculator.getStatistics();
      expect(stats.winRate).toBeCloseTo(0.6, 2); // 3 wins out of 5
      expect(stats.avgWin).toBeCloseTo(150, 0);   // (100 + 150 + 200) / 3
      expect(stats.avgLoss).toBeCloseTo(62.5, 1); // (50 + 75) / 2
    });

    it('should handle empty trade history', () => {
      calculator.updateFromTradeHistory([]);
      
      const stats = calculator.getStatistics();
      expect(stats.winRate).toBe(0);
      expect(stats.avgWin).toBe(0);
      expect(stats.avgLoss).toBe(0);
    });

    it('should handle all winning trades', () => {
      const trades = [
        { profit: 100, isWin: true },
        { profit: 150, isWin: true },
        { profit: 200, isWin: true },
      ];
      
      calculator.updateFromTradeHistory(trades);
      
      const stats = calculator.getStatistics();
      expect(stats.winRate).toBe(1.0);
      expect(stats.avgWin).toBeCloseTo(150, 0);
      expect(stats.avgLoss).toBe(0);
    });

    it('should calculate position size from historical data', () => {
      const trades = [
        { profit: 200, isWin: true },
        { profit: -100, isWin: false },
        { profit: 150, isWin: true },
        { profit: -80, isWin: false },
        { profit: 180, isWin: true },
      ];
      
      calculator.updateFromTradeHistory(trades);
      
      const accountBalance = 100000;
      const positionSize = calculator.calculateOptimalPositionSize(accountBalance);
      
      expect(positionSize).toBeGreaterThan(0);
      expect(positionSize).toBeLessThanOrEqual(accountBalance);
    });
  });

  describe('Risk management features', () => {
    it('should reduce position size during drawdown periods', () => {
      calculator.setDrawdownAdjustment(true);
      
      const accountBalance = 100000;
      const currentDrawdown = 0.15; // 15% drawdown
      
      const normalSize = calculator.calculatePositionSize(accountBalance, 0.6, 100, 50);
      const adjustedSize = calculator.calculatePositionSizeWithDrawdown(
        accountBalance, 
        0.6, 
        100, 
        50, 
        currentDrawdown
      );
      
      expect(adjustedSize).toBeLessThan(normalSize);
    });

    it('should provide volatility-adjusted position sizing', () => {
      const accountBalance = 100000;
      const winRate = 0.6;
      const avgWin = 100;
      const avgLoss = 50;
      
      const lowVolSize = calculator.calculateVolatilityAdjustedSize(
        accountBalance, winRate, avgWin, avgLoss, 0.01 // 1% volatility
      );
      
      const highVolSize = calculator.calculateVolatilityAdjustedSize(
        accountBalance, winRate, avgWin, avgLoss, 0.05 // 5% volatility
      );
      
      expect(lowVolSize).toBeGreaterThan(highVolSize);
    });
  });
});