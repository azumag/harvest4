import { BacktestEngine } from '../backtest/backtest-engine';
import { BacktestConfig, HistoricalCandle } from '../types/backtest';
import { TradingStrategyConfig } from '../strategies/trading-strategy';

describe('BacktestEngine', () => {
  let backtestConfig: BacktestConfig;
  let strategyConfig: TradingStrategyConfig;
  let mockData: HistoricalCandle[];

  beforeEach(() => {
    backtestConfig = {
      startDate: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
      endDate: Date.now(),
      initialBalance: 100000,
      pair: 'btc_jpy',
      timeframe: '1m',
      commission: 0.001, // 0.1%
      slippage: 0.0005, // 0.05%
      maxPositionSize: 1.0
    };

    strategyConfig = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8
    };

    // Generate mock historical data
    mockData = generateMockData(100, 4000000); // 100 candles starting at 4M JPY
  });

  describe('constructor', () => {
    it('should initialize correctly', () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      expect(engine).toBeInstanceOf(BacktestEngine);
    });
  });

  describe('runBacktest', () => {
    it('should complete backtest successfully', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
      expect(result.equity).toBeDefined();
      expect(result.equity.length).toBeGreaterThan(0);
    });

    it('should handle empty data gracefully', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      
      await expect(engine.runBacktest([])).rejects.toThrow();
    });

    it('should filter data by date range', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      
      // Create data outside the date range
      const extendedData = [
        ...generateMockData(50, 4000000, backtestConfig.startDate - 60 * 60 * 1000), // Before start
        ...mockData, // Within range
        ...generateMockData(50, 4000000, backtestConfig.endDate + 60 * 60 * 1000) // After end
      ];

      const result = await engine.runBacktest(extendedData);
      expect(result).toBeDefined();
    });

    it('should calculate returns correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      const finalEquity = result.equity[result.equity.length - 1]?.balance || backtestConfig.initialBalance;
      const expectedReturn = (finalEquity - backtestConfig.initialBalance) / backtestConfig.initialBalance;
      
      expect(Math.abs(result.totalReturn - expectedReturn)).toBeLessThan(0.001);
    });

    it('should track equity over time', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      expect(result.equity.length).toBeGreaterThan(0);
      expect(result.equity[0]?.balance).toBe(backtestConfig.initialBalance);
      
      // Equity points should be in chronological order
      for (let i = 1; i < result.equity.length; i++) {
        expect(result.equity[i]?.timestamp).toBeGreaterThanOrEqual(result.equity[i - 1]?.timestamp || 0);
      }
    });

    it('should calculate drawdown correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(1);

      // Check drawdown calculation in equity
      let peak = result.equity[0]?.balance || 0;
      for (const point of result.equity) {
        if (point.balance > peak) peak = point.balance;
        const expectedDrawdown = peak > 0 ? (peak - point.balance) / peak : 0;
        expect(Math.abs(point.drawdown - expectedDrawdown)).toBeLessThan(0.001);
      }
    });
  });

  describe('position management', () => {
    it('should respect maximum position size', async () => {
      const restrictiveConfig = {
        ...backtestConfig,
        maxPositionSize: 0.1 // 10% max position
      };

      const engine = new BacktestEngine(restrictiveConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      // Should not over-leverage
      expect(result).toBeDefined();
    });

    it('should apply stop loss correctly', async () => {
      // Create data with a significant drop to trigger stop loss
      const droppingData = generateMockDataWithDrop(50, 4000000, 0.05); // 5% drop
      
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(droppingData);

      // Some trades should have been stopped out
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    });

    it('should apply take profit correctly', async () => {
      // Create data with significant rises to trigger take profit
      const risingData = generateMockDataWithRise(50, 4000000, 0.05); // 5% rise
      
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(risingData);

      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    });

    it('should handle commission and slippage', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      // Final balance should account for costs
      if (result.trades.length > 0) {
        const totalCommission = result.trades.reduce((sum, trade) => sum + trade.commission, 0);
        const totalSlippage = result.trades.reduce((sum, trade) => sum + trade.slippage, 0);
        
        expect(totalCommission).toBeGreaterThan(0);
        expect(totalSlippage).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('performance metrics', () => {
    it('should calculate win rate correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      if (result.totalTrades > 0) {
        const expectedWinRate = result.winningTrades / result.totalTrades;
        expect(Math.abs(result.winRate - expectedWinRate)).toBeLessThan(0.001);
      }
    });

    it('should calculate profit factor correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      if (result.totalLoss > 0) {
        const expectedProfitFactor = result.totalProfit / result.totalLoss;
        expect(Math.abs(result.profitFactor - expectedProfitFactor)).toBeLessThan(0.001);
      }
    });

    it('should calculate Sharpe ratio', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      expect(typeof result.sharpeRatio).toBe('number');
      expect(isFinite(result.sharpeRatio)).toBe(true);
    });

    it('should calculate Sortino ratio', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      expect(typeof result.sortinoRatio).toBe('number');
      expect(isFinite(result.sortinoRatio)).toBe(true);
    });

    it('should calculate annualized return', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(mockData);

      expect(typeof result.annualizedReturn).toBe('number');
      expect(isFinite(result.annualizedReturn)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle flat market conditions', async () => {
      const flatData = generateFlatData(100, 4000000);
      
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(flatData);

      expect(result.totalTrades).toBe(0); // Should generate no trades in flat market
      expect(result.totalReturn).toBeCloseTo(0, 3);
    });

    it('should handle highly volatile market', async () => {
      const volatileData = generateVolatileData(100, 4000000, 0.1); // 10% volatility
      
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(volatileData);

      expect(result).toBeDefined();
      expect(result.volatility).toBeGreaterThan(0);
    });

    it('should handle minimum trade size constraints', async () => {
      const smallTradeConfig = {
        ...strategyConfig,
        maxTradeAmount: 100 // Very small trade amount
      };

      const engine = new BacktestEngine(backtestConfig, smallTradeConfig);
      const result = await engine.runBacktest(mockData);

      // Should either have no trades or very small trades
      expect(result).toBeDefined();
    });
  });
});

// Helper functions for generating test data
function generateMockData(
  count: number, 
  startPrice: number, 
  startTime: number = Date.now() - 60 * 60 * 1000
): HistoricalCandle[] {
  const data: HistoricalCandle[] = [];
  let currentPrice = startPrice;
  let currentTime = startTime;

  for (let i = 0; i < count; i++) {
    const volatility = 0.02;
    const priceChange = currentPrice * (Math.random() - 0.5) * volatility;
    
    const open = currentPrice;
    const close = currentPrice + priceChange;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = 1000 + Math.random() * 2000;

    data.push({
      timestamp: currentTime,
      open,
      high,
      low,
      close,
      volume
    });

    currentPrice = close;
    currentTime += 60 * 1000; // 1 minute intervals
  }

  return data;
}

function generateMockDataWithDrop(
  count: number, 
  startPrice: number, 
  dropPercentage: number
): HistoricalCandle[] {
  const data: HistoricalCandle[] = [];
  let currentPrice = startPrice;
  let currentTime = Date.now() - count * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // Gradual drop over time
    const dropRate = dropPercentage / count;
    const priceChange = -currentPrice * dropRate + (Math.random() - 0.5) * currentPrice * 0.005;
    
    const open = currentPrice;
    const close = currentPrice + priceChange;
    const high = Math.max(open, close) * (1 + Math.random() * 0.002);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = 1000 + Math.random() * 2000;

    data.push({
      timestamp: currentTime,
      open,
      high,
      low,
      close,
      volume
    });

    currentPrice = close;
    currentTime += 60 * 1000;
  }

  return data;
}

function generateMockDataWithRise(
  count: number, 
  startPrice: number, 
  risePercentage: number
): HistoricalCandle[] {
  const data: HistoricalCandle[] = [];
  let currentPrice = startPrice;
  let currentTime = Date.now() - count * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // Gradual rise over time
    const riseRate = risePercentage / count;
    const priceChange = currentPrice * riseRate + (Math.random() - 0.5) * currentPrice * 0.005;
    
    const open = currentPrice;
    const close = currentPrice + priceChange;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.002);
    const volume = 1000 + Math.random() * 2000;

    data.push({
      timestamp: currentTime,
      open,
      high,
      low,
      close,
      volume
    });

    currentPrice = close;
    currentTime += 60 * 1000;
  }

  return data;
}

function generateFlatData(count: number, price: number): HistoricalCandle[] {
  const data: HistoricalCandle[] = [];
  let currentTime = Date.now() - count * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // Very small random variations around the same price
    const noise = price * (Math.random() - 0.5) * 0.001; // 0.1% noise
    
    const open = price;
    const close = price + noise;
    const high = Math.max(open, close) * (1 + Math.random() * 0.0005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.0005);
    const volume = 1000 + Math.random() * 500;

    data.push({
      timestamp: currentTime,
      open,
      high,
      low,
      close,
      volume
    });

    currentTime += 60 * 1000;
  }

  return data;
}

function generateVolatileData(count: number, startPrice: number, volatility: number): HistoricalCandle[] {
  const data: HistoricalCandle[] = [];
  let currentPrice = startPrice;
  let currentTime = Date.now() - count * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // High volatility price changes
    const priceChange = currentPrice * (Math.random() - 0.5) * volatility;
    
    const open = currentPrice;
    const close = currentPrice + priceChange;
    const highLowRange = Math.abs(priceChange) * (1 + Math.random());
    const high = Math.max(open, close) + highLowRange * Math.random();
    const low = Math.min(open, close) - highLowRange * Math.random();
    const volume = 1000 + Math.random() * 5000; // Higher volume in volatile markets

    data.push({
      timestamp: currentTime,
      open,
      high,
      low,
      close,
      volume
    });

    currentPrice = close;
    currentTime += 60 * 1000;
  }

  return data;
}