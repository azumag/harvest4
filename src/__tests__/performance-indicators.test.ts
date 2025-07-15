import { PerformanceIndicators, TradePerformance } from '../utils/performance-indicators';

describe('PerformanceIndicators', () => {
  let indicators: PerformanceIndicators;

  beforeEach(() => {
    indicators = new PerformanceIndicators();
  });

  describe('Sharpe Ratio calculation', () => {
    it('should calculate Sharpe ratio correctly', () => {
      const returns = [0.01, 0.02, -0.01, 0.03, 0.015, -0.005, 0.02, 0.01];
      const riskFreeRate = 0.001; // 0.1% risk-free rate

      const sharpeRatio = indicators.calculateSharpeRatio(returns, riskFreeRate);
      
      expect(sharpeRatio).toBeGreaterThan(0);
      expect(sharpeRatio).toBeLessThan(5); // Should be reasonable
    });

    it('should handle negative Sharpe ratio', () => {
      const returns = [-0.01, -0.02, 0.005, -0.015, -0.01];
      const riskFreeRate = 0.002;

      const sharpeRatio = indicators.calculateSharpeRatio(returns, riskFreeRate);
      
      expect(sharpeRatio).toBeLessThan(0);
    });

    it('should handle zero volatility', () => {
      const returns = [0.01, 0.01, 0.01, 0.01]; // No volatility
      const riskFreeRate = 0.005;

      const sharpeRatio = indicators.calculateSharpeRatio(returns, riskFreeRate);
      
      expect(sharpeRatio).toBe(0); // Should handle division by zero
    });
  });

  describe('Value at Risk (VaR) calculation', () => {
    it('should calculate VaR at 95% confidence level', () => {
      const returns = [0.02, 0.01, -0.015, 0.03, -0.02, 0.005, -0.01, 0.025, -0.005, 0.015];
      
      const var95 = indicators.calculateVaR(returns, 0.95);
      
      expect(var95).toBeLessThan(0); // VaR should be negative (loss)
      expect(var95).toBeGreaterThan(-0.1); // Should be reasonable
    });

    it('should calculate VaR at 99% confidence level', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.1);
      
      const var99 = indicators.calculateVaR(returns, 0.99);
      const var95 = indicators.calculateVaR(returns, 0.95);
      
      expect(var99).toBeLessThan(var95); // 99% VaR should be more extreme
    });

    it('should use parametric method for normal distribution', () => {
      const returns = [0.01, -0.01, 0.015, -0.005, 0.012, -0.008, 0.011, -0.003];
      
      const varParametric = indicators.calculateParametricVaR(returns, 0.95);
      
      expect(typeof varParametric).toBe('number');
      expect(varParametric).toBeLessThan(0.02); // Should be reasonable
    });
  });

  describe('Maximum Drawdown calculation', () => {
    it('should calculate maximum drawdown correctly', () => {
      const portfolioValues = [100000, 105000, 103000, 108000, 102000, 110000, 95000, 98000, 105000];
      
      const maxDrawdown = indicators.calculateMaxDrawdown(portfolioValues);
      
      expect(maxDrawdown.drawdown).toBeGreaterThan(0);
      expect(maxDrawdown.drawdown).toBeLessThanOrEqual(1);
      expect(maxDrawdown.peak).toBeDefined();
      expect(maxDrawdown.trough).toBeDefined();
    });

    it('should handle portfolio with only gains', () => {
      const portfolioValues = [100000, 105000, 110000, 115000, 120000];
      
      const maxDrawdown = indicators.calculateMaxDrawdown(portfolioValues);
      
      expect(maxDrawdown.drawdown).toBe(0);
    });

    it('should calculate current drawdown', () => {
      const portfolioValues = [100000, 120000, 110000, 105000]; // Peak at 120k, current at 105k
      
      const currentDrawdown = indicators.calculateCurrentDrawdown(portfolioValues);
      
      expect(currentDrawdown).toBeCloseTo(0.125, 3); // (120k - 105k) / 120k = 12.5%
    });
  });

  describe('Return calculations', () => {
    it('should calculate periodic returns', () => {
      const prices = [100, 105, 102, 108, 110];
      
      const returns = indicators.calculateReturns(prices);
      
      expect(returns).toHaveLength(4);
      expect(returns[0]).toBeCloseTo(0.05, 3); // (105-100)/100
      expect(returns[1]).toBeCloseTo(-0.0286, 3); // (102-105)/105
    });

    it('should calculate annualized return', () => {
      const totalReturn = 0.15; // 15% total return
      const periods = 252; // Daily periods in a year
      
      const annualizedReturn = indicators.annualizeReturn(totalReturn, periods);
      
      expect(annualizedReturn).toBeGreaterThan(0);
      expect(annualizedReturn).toBeLessThan(1); // Should be reasonable
    });

    it('should calculate compound annual growth rate (CAGR)', () => {
      const startValue = 100000;
      const endValue = 150000;
      const years = 2;
      
      const cagr = indicators.calculateCAGR(startValue, endValue, years);
      
      expect(cagr).toBeCloseTo(0.225, 3); // Approximately 22.5%
    });
  });

  describe('Risk-adjusted metrics', () => {
    it('should calculate Sortino ratio', () => {
      const returns = [0.02, 0.01, -0.015, 0.03, -0.02, 0.005, 0.025];
      const riskFreeRate = 0.001;
      
      const sortinoRatio = indicators.calculateSortinoRatio(returns, riskFreeRate);
      
      expect(typeof sortinoRatio).toBe('number');
      expect(sortinoRatio).toBeGreaterThan(0);
    });

    it('should calculate Calmar ratio', () => {
      const portfolioValues = [100000, 105000, 103000, 110000, 108000, 115000];
      const annualizedReturn = 0.12;
      
      const calmarRatio = indicators.calculateCalmarRatio(annualizedReturn, portfolioValues);
      
      expect(typeof calmarRatio).toBe('number');
      expect(calmarRatio).toBeGreaterThan(0);
    });

    it('should calculate information ratio', () => {
      const portfolioReturns = [0.02, 0.015, 0.008, 0.025, 0.012];
      const benchmarkReturns = [0.015, 0.01, 0.005, 0.02, 0.008];
      
      const informationRatio = indicators.calculateInformationRatio(portfolioReturns, benchmarkReturns);
      
      expect(typeof informationRatio).toBe('number');
    });
  });

  describe('Trade analysis', () => {
    it('should analyze trade performance', () => {
      const trades: TradePerformance[] = [
        { entryDate: Date.now() - 86400000, exitDate: Date.now(), pnl: 500, returnRate: 0.025 },
        { entryDate: Date.now() - 172800000, exitDate: Date.now() - 86400000, pnl: -200, returnRate: -0.01 },
        { entryDate: Date.now() - 259200000, exitDate: Date.now() - 172800000, pnl: 800, returnRate: 0.04 },
        { entryDate: Date.now() - 345600000, exitDate: Date.now() - 259200000, pnl: 150, returnRate: 0.0075 },
      ];

      const analysis = indicators.analyzeTrades(trades);

      expect(analysis.totalTrades).toBe(4);
      expect(analysis.winningTrades).toBe(3);
      expect(analysis.losingTrades).toBe(1);
      expect(analysis.winRate).toBeCloseTo(0.75, 2);
      expect(analysis.totalPnL).toBe(1250);
      expect(analysis.avgWin).toBeCloseTo(483.33, 2);
      expect(analysis.avgLoss).toBe(200);
      expect(analysis.profitFactor).toBeCloseTo(7.25, 2);
    });

    it('should calculate consecutive wins and losses', () => {
      const trades: TradePerformance[] = [
        { entryDate: 1, exitDate: 2, pnl: 100, returnRate: 0.01 },
        { entryDate: 2, exitDate: 3, pnl: 150, returnRate: 0.015 },
        { entryDate: 3, exitDate: 4, pnl: 200, returnRate: 0.02 },
        { entryDate: 4, exitDate: 5, pnl: -100, returnRate: -0.01 },
        { entryDate: 5, exitDate: 6, pnl: -50, returnRate: -0.005 },
        { entryDate: 6, exitDate: 7, pnl: 300, returnRate: 0.03 },
      ];

      const analysis = indicators.analyzeTrades(trades);

      expect(analysis.maxConsecutiveWins).toBe(3);
      expect(analysis.maxConsecutiveLosses).toBe(2);
    });
  });

  describe('Portfolio metrics', () => {
    it('should calculate portfolio statistics', () => {
      const portfolioValues = [100000, 102000, 105000, 103000, 107000, 109000, 106000, 110000];
      const returns = indicators.calculateReturns(portfolioValues);

      const stats = indicators.calculatePortfolioStatistics(portfolioValues, returns);

      expect(stats.totalReturn).toBeGreaterThan(0);
      expect(stats.volatility).toBeGreaterThan(0);
      expect(stats.sharpeRatio).toBeDefined();
      expect(stats.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(stats.calmarRatio).toBeDefined();
    });

    it('should track rolling metrics', () => {
      const returns = Array.from({ length: 50 }, (_, i) => (Math.sin(i / 10) + Math.random() - 0.5) * 0.02);
      const windowSize = 20;

      const rollingMetrics = indicators.calculateRollingMetrics(returns, windowSize);

      expect(rollingMetrics.rollingSharpe).toHaveLength(returns.length - windowSize + 1);
      expect(rollingMetrics.rollingVolatility).toHaveLength(returns.length - windowSize + 1);
      expect(rollingMetrics.rollingSortino).toHaveLength(returns.length - windowSize + 1);
    });
  });
});