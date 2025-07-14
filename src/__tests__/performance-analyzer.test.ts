import { PerformanceAnalyzer } from '../analysis/performance-analyzer';
import { BacktestResult, HistoricalCandle, BacktestTrade, EquityPoint } from '../types/backtest';

describe('PerformanceAnalyzer', () => {
  let analyzer: PerformanceAnalyzer;
  let mockBacktestResult: BacktestResult;
  let mockHistoricalData: HistoricalCandle[];

  beforeEach(() => {
    analyzer = new PerformanceAnalyzer();

    // Create mock backtest result
    mockBacktestResult = createMockBacktestResult();
    mockHistoricalData = createMockHistoricalData();
  });

  describe('calculateMetrics', () => {
    it('should calculate all performance metrics', () => {
      const metrics = analyzer.calculateMetrics(mockBacktestResult);

      expect(metrics).toHaveProperty('sharpeRatio');
      expect(metrics).toHaveProperty('sortinoRatio');
      expect(metrics).toHaveProperty('calmarRatio');
      expect(metrics).toHaveProperty('maxDrawdown');
      expect(metrics).toHaveProperty('volatility');
      expect(metrics).toHaveProperty('skewness');
      expect(metrics).toHaveProperty('kurtosis');
      expect(metrics).toHaveProperty('var95');
      expect(metrics).toHaveProperty('cvar95');
      expect(metrics).toHaveProperty('ulcerIndex');
      expect(metrics).toHaveProperty('recoveryFactor');
      expect(metrics).toHaveProperty('profitFactor');
      expect(metrics).toHaveProperty('expectedValue');
      expect(metrics).toHaveProperty('gainToPainRatio');
      expect(metrics).toHaveProperty('lakeRatio');

      // All metrics should be finite numbers
      Object.values(metrics).forEach(value => {
        expect(typeof value).toBe('number');
        expect(isFinite(value)).toBe(true);
      });
    });

    it('should handle zero volatility case', () => {
      const flatResult = createFlatBacktestResult();
      const metrics = analyzer.calculateMetrics(flatResult);

      expect(metrics.volatility).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
    });

    it('should calculate skewness correctly', () => {
      const metrics = analyzer.calculateMetrics(mockBacktestResult);
      
      expect(typeof metrics.skewness).toBe('number');
      expect(isFinite(metrics.skewness)).toBe(true);
    });

    it('should calculate kurtosis correctly', () => {
      const metrics = analyzer.calculateMetrics(mockBacktestResult);
      
      expect(typeof metrics.kurtosis).toBe('number');
      expect(isFinite(metrics.kurtosis)).toBe(true);
    });

    it('should calculate VaR and CVaR', () => {
      const metrics = analyzer.calculateMetrics(mockBacktestResult);
      
      expect(metrics.var95).toBeGreaterThanOrEqual(0);
      expect(metrics.cvar95).toBeGreaterThanOrEqual(0);
      expect(metrics.cvar95).toBeGreaterThanOrEqual(metrics.var95);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive performance report', () => {
      const report = analyzer.generateReport(mockBacktestResult, mockHistoricalData);

      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('marketConditions');
      expect(report).toHaveProperty('tradeAnalysis');
      expect(report).toHaveProperty('periodAnalysis');
      expect(report).toHaveProperty('riskofreturns');
      expect(report).toHaveProperty('monthlyReturns');
      expect(report).toHaveProperty('drawdownAnalysis');
    });

    it('should analyze market conditions', () => {
      const report = analyzer.generateReport(mockBacktestResult, mockHistoricalData);

      expect(Array.isArray(report.marketConditions)).toBe(true);
      
      if (report.marketConditions.length > 0) {
        const condition = report.marketConditions[0];
        expect(condition).toHaveProperty('period');
        expect(condition).toHaveProperty('trend');
        expect(condition).toHaveProperty('volatility');
        expect(condition).toHaveProperty('volume');
        if (condition) {
          expect(['bull', 'bear', 'sideways']).toContain(condition.trend);
          expect(['low', 'medium', 'high']).toContain(condition.volatility);
          expect(['low', 'medium', 'high']).toContain(condition.volume);
        }
      }
    });

    it('should analyze trade patterns', () => {
      const report = analyzer.generateReport(mockBacktestResult, mockHistoricalData);

      expect(report.tradeAnalysis).toHaveProperty('averageWinSize');
      expect(report.tradeAnalysis).toHaveProperty('averageLossSize');
      expect(report.tradeAnalysis).toHaveProperty('largestWin');
      expect(report.tradeAnalysis).toHaveProperty('largestLoss');
      expect(report.tradeAnalysis).toHaveProperty('averageHoldingPeriod');
      expect(report.tradeAnalysis).toHaveProperty('winningStreaks');
      expect(report.tradeAnalysis).toHaveProperty('losingStreaks');
      expect(report.tradeAnalysis).toHaveProperty('tradeFrequency');
    });

    it('should handle empty trades gracefully', () => {
      const emptyResult = { ...mockBacktestResult, trades: [] };
      const report = analyzer.generateReport(emptyResult, mockHistoricalData);

      expect(report.tradeAnalysis.averageWinSize).toBe(0);
      expect(report.tradeAnalysis.averageLossSize).toBe(0);
      expect(report.tradeAnalysis.largestWin).toBe(0);
      expect(report.tradeAnalysis.largestLoss).toBe(0);
    });
  });

  describe('risk calculations', () => {
    it('should calculate risk metrics correctly', () => {
      const report = analyzer.generateReport(mockBacktestResult, mockHistoricalData);

      expect(report.riskofreturns).toHaveProperty('returnDistribution');
      expect(report.riskofreturns).toHaveProperty('riskMetrics');
      expect(report.riskofreturns).toHaveProperty('tailRisk');

      expect(Array.isArray(report.riskofreturns.returnDistribution)).toBe(true);
      expect(report.riskofreturns.tailRisk.var95).toBeGreaterThanOrEqual(0);
      expect(report.riskofreturns.tailRisk.cvar95).toBeGreaterThanOrEqual(0);
    });

    it('should calculate drawdown analysis', () => {
      const report = analyzer.generateReport(mockBacktestResult, mockHistoricalData);

      expect(report.drawdownAnalysis).toHaveProperty('totalDrawdowns');
      expect(report.drawdownAnalysis).toHaveProperty('averageDrawdown');
      expect(report.drawdownAnalysis).toHaveProperty('averageRecoveryTime');
      expect(report.drawdownAnalysis).toHaveProperty('maxRecoveryTime');
      expect(report.drawdownAnalysis).toHaveProperty('drawdownFrequency');
      expect(report.drawdownAnalysis).toHaveProperty('underWaterPeriods');

      expect(report.drawdownAnalysis.totalDrawdowns).toBeGreaterThanOrEqual(0);
      expect(report.drawdownAnalysis.averageDrawdown).toBeGreaterThanOrEqual(0);
    });
  });

  describe('period analysis', () => {
    it('should analyze performance by periods', () => {
      const report = analyzer.generateReport(mockBacktestResult, mockHistoricalData);

      expect(Array.isArray(report.periodAnalysis)).toBe(true);
      
      if (report.periodAnalysis.length > 0) {
        const period = report.periodAnalysis[0];
        expect(period).toHaveProperty('period');
        expect(period).toHaveProperty('returns');
        expect(period).toHaveProperty('volatility');
        expect(period).toHaveProperty('sharpeRatio');
        expect(period).toHaveProperty('maxDrawdown');
        expect(period).toHaveProperty('trades');
        expect(period).toHaveProperty('winRate');
      }
    });

    it('should calculate monthly returns', () => {
      const report = analyzer.generateReport(mockBacktestResult, mockHistoricalData);

      expect(Array.isArray(report.monthlyReturns)).toBe(true);
      
      if (report.monthlyReturns.length > 0) {
        const monthly = report.monthlyReturns[0];
        expect(monthly).toHaveProperty('year');
        expect(monthly).toHaveProperty('month');
        expect(monthly).toHaveProperty('returns');
        expect(monthly).toHaveProperty('trades');
        expect(monthly).toHaveProperty('winRate');
        
        if (monthly) {
          expect(monthly.year).toBeGreaterThan(2020);
          expect(monthly.month).toBeGreaterThanOrEqual(0);
          expect(monthly.month).toBeLessThanOrEqual(11);
          expect(monthly.winRate).toBeGreaterThanOrEqual(0);
          expect(monthly.winRate).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty equity data', () => {
      const emptyEquityResult = { ...mockBacktestResult, equity: [] };
      const metrics = analyzer.calculateMetrics(emptyEquityResult);

      expect(metrics.volatility).toBe(0);
      expect(metrics.skewness).toBe(0);
      expect(metrics.kurtosis).toBe(0);
    });

    it('should handle single equity point', () => {
      const singleEquityResult = {
        ...mockBacktestResult,
        equity: [{ timestamp: Date.now(), balance: 100000, drawdown: 0 }]
      };
      const metrics = analyzer.calculateMetrics(singleEquityResult);

      expect(metrics.volatility).toBe(0);
    });

    it('should handle zero trades', () => {
      const noTradesResult = { ...mockBacktestResult, trades: [], totalTrades: 0 };
      const report = analyzer.generateReport(noTradesResult, mockHistoricalData);

      expect(report.tradeAnalysis.tradeFrequency).toBe(0);
      expect(report.tradeAnalysis.winningStreaks).toEqual([]);
      expect(report.tradeAnalysis.losingStreaks).toEqual([]);
    });
  });
});

// Helper functions
function createMockBacktestResult(): BacktestResult {
  const trades: BacktestTrade[] = [
    {
      id: 'trade_1',
      side: 'buy',
      amount: 0.01,
      price: 4000000,
      timestamp: Date.now() - 24 * 60 * 60 * 1000,
      commission: 40,
      slippage: 20,
      pnl: 5000,
      isWinning: true,
      holdingPeriod: 60 * 60 * 1000, // 1 hour
      drawdown: 0.02
    },
    {
      id: 'trade_2',
      side: 'buy',
      amount: 0.015,
      price: 4050000,
      timestamp: Date.now() - 20 * 60 * 60 * 1000,
      commission: 60,
      slippage: 30,
      pnl: -2000,
      isWinning: false,
      holdingPeriod: 2 * 60 * 60 * 1000, // 2 hours
      drawdown: 0.05
    },
    {
      id: 'trade_3',
      side: 'buy',
      amount: 0.012,
      price: 3980000,
      timestamp: Date.now() - 16 * 60 * 60 * 1000,
      commission: 48,
      slippage: 24,
      pnl: 8000,
      isWinning: true,
      holdingPeriod: 3 * 60 * 60 * 1000, // 3 hours
      drawdown: 0.01
    }
  ];

  const equity: EquityPoint[] = [];
  let balance = 100000;
  let peak = balance;
  
  for (let i = 0; i < 100; i++) {
    const timestamp = Date.now() - (100 - i) * 60 * 60 * 1000;
    balance += (Math.random() - 0.5) * 1000; // Random walk
    
    if (balance > peak) peak = balance;
    const drawdown = (peak - balance) / peak;
    
    equity.push({ timestamp, balance, drawdown });
  }

  return {
    totalTrades: trades.length,
    winningTrades: trades.filter(t => t.isWinning).length,
    losingTrades: trades.filter(t => !t.isWinning).length,
    winRate: trades.filter(t => t.isWinning).length / trades.length,
    totalReturn: 0.11, // 11% return
    annualizedReturn: 0.15, // 15% annualized
    totalProfit: 13000,
    totalLoss: 2000,
    profitFactor: 6.5,
    averageWin: 6500,
    averageLoss: 2000,
    maxDrawdown: 0.08,
    maxDrawdownDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    sharpeRatio: 1.8,
    sortinoRatio: 2.2,
    calmarRatio: 1.875,
    volatility: 0.12,
    maxConsecutiveWins: 2,
    maxConsecutiveLosses: 1,
    trades,
    equity,
    drawdownPeriods: [
      {
        start: Date.now() - 48 * 60 * 60 * 1000,
        end: Date.now() - 24 * 60 * 60 * 1000,
        peak: 105000,
        trough: 97000,
        duration: 24 * 60 * 60 * 1000,
        recovery: Date.now() - 12 * 60 * 60 * 1000
      }
    ]
  };
}

function createFlatBacktestResult(): BacktestResult {
  const equity: EquityPoint[] = [];
  const balance = 100000;
  
  for (let i = 0; i < 100; i++) {
    const timestamp = Date.now() - (100 - i) * 60 * 60 * 1000;
    equity.push({ timestamp, balance, drawdown: 0 });
  }

  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalReturn: 0,
    annualizedReturn: 0,
    totalProfit: 0,
    totalLoss: 0,
    profitFactor: 0,
    averageWin: 0,
    averageLoss: 0,
    maxDrawdown: 0,
    maxDrawdownDuration: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    volatility: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    trades: [],
    equity,
    drawdownPeriods: []
  };
}

function createMockHistoricalData(): HistoricalCandle[] {
  const data: HistoricalCandle[] = [];
  let currentPrice = 4000000;
  let currentTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago

  for (let i = 0; i < 30 * 24; i++) { // 30 days of hourly data
    const volatility = 0.02;
    const priceChange = currentPrice * (Math.random() - 0.5) * volatility;
    
    const open = currentPrice;
    const close = currentPrice + priceChange;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = 1000 + Math.random() * 5000;

    data.push({
      timestamp: currentTime,
      open,
      high,
      low,
      close,
      volume
    });

    currentPrice = close;
    currentTime += 60 * 60 * 1000; // 1 hour intervals
  }

  return data;
}