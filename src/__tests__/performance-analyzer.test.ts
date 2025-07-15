import { PerformanceAnalyzer } from '../analysis/performance-analyzer';
import {
  BacktestResult,
  BacktestTrade,
  HistoricalDataPoint,
  EquityPoint,
  DrawdownPoint,
  MonthlyReturn
} from '../types/backtest';

describe('PerformanceAnalyzer', () => {
  let analyzer: PerformanceAnalyzer;
  let mockBacktestResult: BacktestResult;
  let mockHistoricalData: HistoricalDataPoint[];

  beforeEach(() => {
    analyzer = new PerformanceAnalyzer();

    const mockEquityCurve: EquityPoint[] = [
      { timestamp: 1000, equity: 100000, drawdown: 0, drawdownPercent: 0 },
      { timestamp: 2000, equity: 102000, drawdown: 0, drawdownPercent: 0 },
      { timestamp: 3000, equity: 98000, drawdown: 4000, drawdownPercent: 4 },
      { timestamp: 4000, equity: 105000, drawdown: 0, drawdownPercent: 0 },
      { timestamp: 5000, equity: 110000, drawdown: 0, drawdownPercent: 0 }
    ];

    const mockDrawdownCurve: DrawdownPoint[] = [
      { timestamp: 1000, drawdown: 0, drawdownPercent: 0, underwater: 0 },
      { timestamp: 2000, drawdown: 0, drawdownPercent: 0, underwater: 0 },
      { timestamp: 3000, drawdown: 4000, drawdownPercent: 4, underwater: 1 },
      { timestamp: 4000, drawdown: 0, drawdownPercent: 0, underwater: 0 },
      { timestamp: 5000, drawdown: 0, drawdownPercent: 0, underwater: 0 }
    ];

    const mockTrades: BacktestTrade[] = [
      {
        id: 1,
        timestamp: 1000,
        side: 'buy',
        price: 5000000,
        amount: 0.01,
        commission: 50,
        slippage: 25,
        stopLoss: 4900000,
        takeProfit: 5200000,
        exitTimestamp: 2000,
        exitPrice: 5100000,
        exitReason: 'take_profit',
        profit: 1000,
        profitPercent: 2.0,
        holdingPeriod: 1000
      },
      {
        id: 2,
        timestamp: 2500,
        side: 'sell',
        price: 5100000,
        amount: 0.01,
        commission: 51,
        slippage: 26,
        stopLoss: 5200000,
        takeProfit: 4900000,
        exitTimestamp: 3500,
        exitPrice: 4950000,
        exitReason: 'take_profit',
        profit: 1500,
        profitPercent: 2.9,
        holdingPeriod: 1000
      },
      {
        id: 3,
        timestamp: 4000,
        side: 'buy',
        price: 4950000,
        amount: 0.01,
        commission: 49.5,
        slippage: 24.75,
        stopLoss: 4851000,
        takeProfit: 5148000,
        exitTimestamp: 4500,
        exitPrice: 4800000,
        exitReason: 'stop_loss',
        profit: -150,
        profitPercent: -3.0,
        holdingPeriod: 500
      }
    ];

    const mockMonthlyReturns: MonthlyReturn[] = [
      { year: 2023, month: 0, return: 2000, returnPercent: 2.0 },
      { year: 2023, month: 1, return: -4000, returnPercent: -3.9 },
      { year: 2023, month: 2, return: 7000, returnPercent: 7.1 },
      { year: 2023, month: 3, return: 5000, returnPercent: 4.8 }
    ];

    mockBacktestResult = {
      trades: mockTrades,
      positions: [],
      initialBalance: 100000,
      finalBalance: 110000,
      totalReturn: 10000,
      totalReturnPercent: 10.0,
      maxDrawdown: 4000,
      maxDrawdownPercent: 4.0,
      winRate: 66.67,
      profitFactor: 1.67,
      averageWin: 1250,
      averageLoss: 150,
      largestWin: 1500,
      largestLoss: -150,
      totalTrades: 3,
      winningTrades: 2,
      losingTrades: 1,
      averageHoldingPeriod: 833,
      sharpeRatio: 1.2,
      sortinoRatio: 1.5,
      calmarRatio: 2.5,
      maxRunup: 10000,
      maxRunupPercent: 10.0,
      recoveryFactor: 2.5,
      expectancy: 783.33,
      equityCurve: mockEquityCurve,
      drawdownCurve: mockDrawdownCurve,
      monthlyReturns: mockMonthlyReturns,
      annualizedReturn: 12.0,
      annualizedVolatility: 0.15,
      var95: -0.05,
      var99: -0.08,
      cvar95: -0.07,
      cvar99: -0.10,
      skewness: 0.5,
      kurtosis: 0.2,
      ulcerIndex: 2.0,
      gainToPainRatio: 1.8,
      sterlingRatio: 0.9,
      burkeRatio: 1.1,
      martin_ratio: 1.3
    };

    mockHistoricalData = [
      {
        timestamp: 1000,
        open: 5000000,
        high: 5010000,
        low: 4990000,
        close: 5005000,
        volume: 1000
      },
      {
        timestamp: 2000,
        open: 5005000,
        high: 5020000,
        low: 5000000,
        close: 5015000,
        volume: 1200
      },
      {
        timestamp: 3000,
        open: 5015000,
        high: 5030000,
        low: 5010000,
        close: 4980000,
        volume: 1100
      },
      {
        timestamp: 4000,
        open: 4980000,
        high: 5000000,
        low: 4970000,
        close: 4990000,
        volume: 1300
      },
      {
        timestamp: 5000,
        open: 4990000,
        high: 5010000,
        low: 4985000,
        close: 5000000,
        volume: 1150
      }
    ];
  });

  describe('analyzePerformance', () => {
    it('should analyze performance metrics correctly', () => {
      const metrics = analyzer.analyzePerformance(mockBacktestResult);

      expect(metrics).toHaveProperty('totalReturn');
      expect(metrics).toHaveProperty('annualizedReturn');
      expect(metrics).toHaveProperty('sharpeRatio');
      expect(metrics).toHaveProperty('maxDrawdown');
      expect(metrics).toHaveProperty('winRate');
      expect(metrics).toHaveProperty('profitFactor');
      expect(metrics).toHaveProperty('calmarRatio');
      expect(metrics).toHaveProperty('sortinoRatio');
      expect(metrics).toHaveProperty('var95');
      expect(metrics).toHaveProperty('cvar95');
      expect(metrics).toHaveProperty('ulcerIndex');

      expect(metrics.totalReturn).toBe(10000);
      expect(metrics.annualizedReturn).toBe(12.0);
      expect(metrics.sharpeRatio).toBe(1.2);
      expect(metrics.maxDrawdown).toBe(4.0);
      expect(metrics.winRate).toBe(66.67);
      expect(metrics.profitFactor).toBe(1.67);
      expect(metrics.calmarRatio).toBe(2.5);
      expect(metrics.sortinoRatio).toBe(1.5);
      expect(metrics.var95).toBe(-0.05);
      expect(metrics.cvar95).toBe(-0.07);
      expect(metrics.ulcerIndex).toBe(2.0);
    });
  });

  describe('analyzeTradePatterns', () => {
    it('should analyze trade patterns correctly', () => {
      const analysis = analyzer.analyzeTradePatterns(mockBacktestResult.trades);

      expect(analysis).toHaveProperty('totalTrades');
      expect(analysis).toHaveProperty('winningTrades');
      expect(analysis).toHaveProperty('losingTrades');
      expect(analysis).toHaveProperty('averageWin');
      expect(analysis).toHaveProperty('averageLoss');
      expect(analysis).toHaveProperty('largestWin');
      expect(analysis).toHaveProperty('largestLoss');
      expect(analysis).toHaveProperty('averageHoldingPeriod');
      expect(analysis).toHaveProperty('winStreak');
      expect(analysis).toHaveProperty('loseStreak');
      expect(analysis).toHaveProperty('profitDistribution');
      expect(analysis).toHaveProperty('timeDistribution');
      expect(analysis).toHaveProperty('exitReasonDistribution');

      expect(analysis.totalTrades).toBe(3);
      expect(analysis.winningTrades).toBe(2);
      expect(analysis.losingTrades).toBe(1);
      expect(analysis.averageWin).toBe(1250);
      expect(analysis.averageLoss).toBe(150);
      expect(analysis.largestWin).toBe(1500);
      expect(analysis.largestLoss).toBe(-150);
      expect(analysis.averageHoldingPeriod).toBe(833.33);
      expect(analysis.winStreak).toBe(2);
      expect(analysis.loseStreak).toBe(1);
    });

    it('should calculate profit distribution correctly', () => {
      const analysis = analyzer.analyzeTradePatterns(mockBacktestResult.trades);
      const distribution = analysis.profitDistribution;

      expect(distribution).toHaveProperty('min');
      expect(distribution).toHaveProperty('max');
      expect(distribution).toHaveProperty('median');
      expect(distribution).toHaveProperty('mean');
      expect(distribution).toHaveProperty('stdDev');
      expect(distribution).toHaveProperty('percentiles');

      expect(distribution.min).toBe(-150);
      expect(distribution.max).toBe(1500);
      expect(distribution.median).toBe(1000);
      expect(distribution.mean).toBe((1000 + 1500 - 150) / 3);
      expect(distribution.stdDev).toBeGreaterThan(0);

      expect(distribution.percentiles).toHaveProperty('p10');
      expect(distribution.percentiles).toHaveProperty('p25');
      expect(distribution.percentiles).toHaveProperty('p75');
      expect(distribution.percentiles).toHaveProperty('p90');
    });

    it('should calculate time distribution correctly', () => {
      const analysis = analyzer.analyzeTradePatterns(mockBacktestResult.trades);
      const distribution = analysis.timeDistribution;

      expect(distribution).toHaveProperty('hourlyProfits');
      expect(distribution).toHaveProperty('dailyProfits');
      expect(distribution).toHaveProperty('monthlyProfits');
      expect(distribution).toHaveProperty('bestHour');
      expect(distribution).toHaveProperty('bestDay');
      expect(distribution).toHaveProperty('bestMonth');

      expect(distribution.hourlyProfits).toHaveLength(24);
      expect(distribution.dailyProfits).toHaveLength(7);
      expect(distribution.monthlyProfits).toHaveLength(12);
      expect(distribution.bestHour).toBeGreaterThanOrEqual(0);
      expect(distribution.bestHour).toBeLessThan(24);
      expect(distribution.bestDay).toBeGreaterThanOrEqual(0);
      expect(distribution.bestDay).toBeLessThan(7);
      expect(distribution.bestMonth).toBeGreaterThanOrEqual(0);
      expect(distribution.bestMonth).toBeLessThan(12);
    });

    it('should calculate exit reason distribution correctly', () => {
      const analysis = analyzer.analyzeTradePatterns(mockBacktestResult.trades);
      const distribution = analysis.exitReasonDistribution;

      expect(distribution).toHaveProperty('stop_loss');
      expect(distribution).toHaveProperty('take_profit');
      expect(distribution).toHaveProperty('signal');
      expect(distribution).toHaveProperty('end_of_test');

      expect(distribution.stop_loss).toBe(1);
      expect(distribution.take_profit).toBe(2);
      expect(distribution.signal).toBe(0);
      expect(distribution.end_of_test).toBe(0);
    });

    it('should handle empty trades array', () => {
      const analysis = analyzer.analyzeTradePatterns([]);

      expect(analysis.totalTrades).toBe(0);
      expect(analysis.winningTrades).toBe(0);
      expect(analysis.losingTrades).toBe(0);
      expect(analysis.averageWin).toBe(0);
      expect(analysis.averageLoss).toBe(0);
      expect(analysis.largestWin).toBe(0);
      expect(analysis.largestLoss).toBe(0);
      expect(analysis.averageHoldingPeriod).toBe(0);
      expect(analysis.winStreak).toBe(0);
      expect(analysis.loseStreak).toBe(0);
    });
  });

  describe('analyzeMarketConditions', () => {
    it('should analyze market conditions correctly', () => {
      const marketConditions = analyzer.analyzeMarketConditions(mockHistoricalData, mockBacktestResult);

      expect(marketConditions).toBeInstanceOf(Array);
      
      marketConditions.forEach(condition => {
        expect(condition).toHaveProperty('condition');
        expect(condition).toHaveProperty('metrics');
        expect(condition).toHaveProperty('relativePerformance');

        expect(condition.condition).toHaveProperty('name');
        expect(condition.condition).toHaveProperty('startDate');
        expect(condition.condition).toHaveProperty('endDate');
        expect(condition.condition).toHaveProperty('condition');
        expect(condition.condition).toHaveProperty('characteristics');

        expect(condition.condition.condition).toMatch(/^(bull|bear|sideways|volatile|calm)$/);
        expect(condition.condition.characteristics).toHaveProperty('volatility');
        expect(condition.condition.characteristics).toHaveProperty('trend');
        expect(condition.condition.characteristics).toHaveProperty('momentum');
        expect(condition.condition.characteristics).toHaveProperty('volume');

        expect(condition.metrics).toHaveProperty('totalReturn');
        expect(condition.metrics).toHaveProperty('winRate');
        expect(condition.metrics).toHaveProperty('maxDrawdown');
        expect(condition.relativePerformance).toBeGreaterThan(-1);
      });
    });

    it('should handle empty historical data', () => {
      const marketConditions = analyzer.analyzeMarketConditions([], mockBacktestResult);

      expect(marketConditions).toBeInstanceOf(Array);
      expect(marketConditions).toHaveLength(0);
    });

    it('should classify market conditions correctly', () => {
      // Create data with clear trends
      const bullishData: HistoricalDataPoint[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i * 1000,
        open: 5000000 + i * 10000,
        high: 5010000 + i * 10000,
        low: 4990000 + i * 10000,
        close: 5005000 + i * 10000,
        volume: 1000
      }));

      const marketConditions = analyzer.analyzeMarketConditions(bullishData, mockBacktestResult);

      expect(marketConditions).toBeInstanceOf(Array);
      if (marketConditions.length > 0) {
        // Should detect bullish trend
        expect(marketConditions[0]?.condition.condition).toBe('bull');
      }
    });
  });

  describe('generateDetailedReport', () => {
    it('should generate detailed report correctly', () => {
      const report = analyzer.generateDetailedReport(mockBacktestResult, mockHistoricalData);

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('tradeAnalysis');
      expect(report).toHaveProperty('marketConditions');
      expect(report).toHaveProperty('riskMetrics');
      expect(report).toHaveProperty('performanceMetrics');
      expect(report).toHaveProperty('recommendations');

      expect(report.summary).toHaveProperty('totalReturn');
      expect(report.summary).toHaveProperty('totalReturnPercent');
      expect(report.summary).toHaveProperty('sharpeRatio');
      expect(report.summary).toHaveProperty('maxDrawdown');
      expect(report.summary).toHaveProperty('winRate');
      expect(report.summary).toHaveProperty('profitFactor');
      expect(report.summary).toHaveProperty('totalTrades');

      expect(report.tradeAnalysis).toHaveProperty('totalTrades');
      expect(report.tradeAnalysis).toHaveProperty('winningTrades');
      expect(report.tradeAnalysis).toHaveProperty('losingTrades');

      expect(report.marketConditions).toBeInstanceOf(Array);
      expect(report.recommendations).toBeInstanceOf(Array);

      expect(report.riskMetrics).toHaveProperty('maxDrawdown');
      expect(report.riskMetrics).toHaveProperty('var95');
      expect(report.riskMetrics).toHaveProperty('cvar95');
      expect(report.riskMetrics).toHaveProperty('ulcerIndex');

      expect(report.performanceMetrics).toHaveProperty('totalReturn');
      expect(report.performanceMetrics).toHaveProperty('sharpeRatio');
      expect(report.performanceMetrics).toHaveProperty('maxDrawdown');
    });

    it('should generate appropriate recommendations', () => {
      const lowPerformanceResult = {
        ...mockBacktestResult,
        winRate: 30,
        profitFactor: 0.8,
        maxDrawdownPercent: 25,
        sharpeRatio: 0.5
      };

      const report = analyzer.generateDetailedReport(lowPerformanceResult, mockHistoricalData);

      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.recommendations.length).toBeGreaterThan(0);

      // Should recommend improvements for low performance
      expect(report.recommendations.some(r => r.includes('win rate'))).toBe(true);
      expect(report.recommendations.some(r => r.includes('risk-reward'))).toBe(true);
      expect(report.recommendations.some(r => r.includes('drawdown'))).toBe(true);
      expect(report.recommendations.some(r => r.includes('volatility'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle zero trades', () => {
      const emptyResult = {
        ...mockBacktestResult,
        trades: [],
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0
      };

      const metrics = analyzer.analyzePerformance(emptyResult);
      const tradeAnalysis = analyzer.analyzeTradePatterns(emptyResult.trades);

      expect(metrics).toHaveProperty('totalReturn');
      expect(tradeAnalysis.totalTrades).toBe(0);
      expect(tradeAnalysis.winningTrades).toBe(0);
      expect(tradeAnalysis.losingTrades).toBe(0);
    });

    it('should handle NaN and infinite values', () => {
      const invalidResult = {
        ...mockBacktestResult,
        sharpeRatio: NaN,
        profitFactor: Infinity,
        maxDrawdownPercent: -Infinity
      };

      const metrics = analyzer.analyzePerformance(invalidResult);

      expect(metrics).toHaveProperty('totalReturn');
      expect(metrics).toHaveProperty('sharpeRatio');
      expect(metrics).toHaveProperty('profitFactor');
      expect(metrics).toHaveProperty('maxDrawdown');
    });

    it('should handle single trade', () => {
      const singleTrade = mockBacktestResult.trades.slice(0, 1);
      const analysis = analyzer.analyzeTradePatterns(singleTrade);

      expect(analysis.totalTrades).toBe(1);
      expect(analysis.winningTrades).toBe(1);
      expect(analysis.losingTrades).toBe(0);
      expect(analysis.averageWin).toBe(1000);
      expect(analysis.averageLoss).toBe(0);
      expect(analysis.winStreak).toBe(1);
      expect(analysis.loseStreak).toBe(0);
    });
  });
});