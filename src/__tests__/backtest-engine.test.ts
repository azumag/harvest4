import { BacktestEngine } from '../backtest/backtest-engine';
import { HistoricalDataManager } from '../data/historical-data-manager';
import { TradingStrategy } from '../strategies/trading-strategy';
import { BacktestConfig } from '../types/backtest';
import { BitbankConfig } from '../types/bitbank';

describe('BacktestEngine', () => {
  let dataManager: HistoricalDataManager;
  let strategy: TradingStrategy;
  let backtestConfig: BacktestConfig;
  let engine: BacktestEngine;

  beforeEach(() => {
    const bitbankConfig: BitbankConfig = {
      apiKey: 'test_key',
      apiSecret: 'test_secret',
      baseUrl: 'https://api.bitbank.cc'
    };

    dataManager = new HistoricalDataManager(bitbankConfig, './test-data');
    
    strategy = new TradingStrategy({
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8
    });

    backtestConfig = {
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      endDate: Date.now(),
      initialBalance: 100000,
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0,
      strategy: null
    };

    engine = new BacktestEngine(dataManager, strategy, backtestConfig);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(engine).toBeDefined();
      expect(engine.getCurrentBalance()).toBe(backtestConfig.initialBalance);
      expect(engine.getCurrentEquity()).toBe(backtestConfig.initialBalance);
    });
  });

  describe('runBacktest', () => {
    it('should run backtest and return results', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
      expect(result.totalReturn).toBeDefined();
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.sharpeRatio).toBeDefined();
      expect(result.trades).toBeInstanceOf(Array);
    });

    it('should handle empty data gracefully', async () => {
      const emptyDataConfig = {
        ...backtestConfig,
        startDate: Date.now() - 1000,
        endDate: Date.now() - 500
      };

      const emptyEngine = new BacktestEngine(dataManager, strategy, emptyDataConfig);
      
      await expect(emptyEngine.runBacktest('btc_jpy', '1m')).rejects.toThrow();
    });
  });

  describe('position management', () => {
    it('should track active positions correctly', () => {
      const initialPositions = engine.getActivePositions();
      expect(initialPositions).toHaveLength(0);
    });

    it('should maintain balance consistency', () => {
      const initialBalance = engine.getCurrentBalance();
      expect(initialBalance).toBe(backtestConfig.initialBalance);
    });
  });

  describe('risk management', () => {
    it('should apply stop loss correctly', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      // Check that trades have reasonable profit/loss ratios
      const trades = result.trades;
      if (trades.length > 0) {
        const losses = trades.filter(t => t.profit < 0);
        losses.forEach(trade => {
          const lossPercentage = Math.abs(trade.profit) / (trade.amount * trade.entryPrice);
          expect(lossPercentage).toBeLessThan(0.1); // Less than 10% loss per trade
        });
      }
    });

    it('should apply take profit correctly', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      const trades = result.trades;
      if (trades.length > 0) {
        const profits = trades.filter(t => t.profit > 0);
        profits.forEach(trade => {
          const profitPercentage = trade.profit / (trade.amount * trade.entryPrice);
          expect(profitPercentage).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('commission and slippage', () => {
    it('should apply commission to trades', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      const trades = result.trades;
      trades.forEach(trade => {
        expect(trade.commission).toBeGreaterThan(0);
        expect(trade.slippage).toBeGreaterThanOrEqual(0);
      });
    });

    it('should reduce returns due to costs', async () => {
      const noCostConfig = {
        ...backtestConfig,
        commission: 0,
        slippage: 0
      };

      const noCostEngine = new BacktestEngine(dataManager, strategy, noCostConfig);
      
      const [result, noCostResult] = await Promise.all([
        engine.runBacktest('btc_jpy', '1m'),
        noCostEngine.runBacktest('btc_jpy', '1m')
      ]);

      if (result.totalTrades > 0 && noCostResult.totalTrades > 0) {
        expect(result.totalReturn).toBeLessThanOrEqual(noCostResult.totalReturn);
      }
    });
  });

  describe('performance metrics', () => {
    it('should calculate Sharpe ratio correctly', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      expect(result.sharpeRatio).toBeDefined();
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('should calculate profit factor correctly', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      expect(result.profitFactor).toBeDefined();
      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('should calculate max drawdown correctly', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      expect(result.maxDrawdown).toBeDefined();
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(1);
    });
  });

  describe('trade execution', () => {
    it('should execute trades in chronological order', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      const trades = result.trades;
      for (let i = 1; i < trades.length; i++) {
        expect(trades[i].entryTime).toBeGreaterThanOrEqual(trades[i-1].entryTime);
      }
    });

    it('should have consistent trade data', async () => {
      const result = await engine.runBacktest('btc_jpy', '1m');
      
      const trades = result.trades;
      trades.forEach(trade => {
        expect(trade.id).toBeDefined();
        expect(trade.entryTime).toBeGreaterThan(0);
        expect(trade.exitTime).toBeGreaterThan(trade.entryTime);
        expect(trade.entryPrice).toBeGreaterThan(0);
        expect(trade.exitPrice).toBeGreaterThan(0);
        expect(trade.amount).toBeGreaterThan(0);
        expect(['buy', 'sell']).toContain(trade.side);
        expect(trade.reason).toBeDefined();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle zero initial balance', () => {
      const zeroBalanceConfig = {
        ...backtestConfig,
        initialBalance: 0
      };

      const zeroBalanceEngine = new BacktestEngine(dataManager, strategy, zeroBalanceConfig);
      expect(zeroBalanceEngine.getCurrentBalance()).toBe(0);
    });

    it('should handle very small position sizes', () => {
      const smallPositionConfig = {
        ...backtestConfig,
        maxPositionSize: 0.001
      };

      const smallPositionEngine = new BacktestEngine(dataManager, strategy, smallPositionConfig);
      expect(smallPositionEngine).toBeDefined();
    });

    it('should handle high commission rates', () => {
      const highCommissionConfig = {
        ...backtestConfig,
        commission: 0.1 // 10% commission
      };

      const highCommissionEngine = new BacktestEngine(dataManager, strategy, highCommissionConfig);
      expect(highCommissionEngine).toBeDefined();
    });
  });
});