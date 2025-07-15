import { BacktestEngine } from '../backtest/backtest-engine';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import { BacktestConfig, HistoricalDataPoint } from '../types/backtest';

describe('BacktestEngine', () => {
  let backtestConfig: BacktestConfig;
  let strategyConfig: TradingStrategyConfig;
  let testData: HistoricalDataPoint[];

  beforeEach(() => {
    backtestConfig = {
      startDate: Date.now() - 24 * 60 * 60 * 1000,
      endDate: Date.now(),
      initialBalance: 100000,
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0,
      stopLoss: 0.02,
      takeProfit: 0.04,
      pair: 'btc_jpy',
      timeframe: '1m'
    };

    strategyConfig = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8
    };

    testData = [
      {
        timestamp: Date.now() - 60 * 60 * 1000,
        open: 5000000,
        high: 5010000,
        low: 4990000,
        close: 5005000,
        volume: 1000
      },
      {
        timestamp: Date.now() - 59 * 60 * 1000,
        open: 5005000,
        high: 5020000,
        low: 5000000,
        close: 5015000,
        volume: 1200
      },
      {
        timestamp: Date.now() - 58 * 60 * 1000,
        open: 5015000,
        high: 5030000,
        low: 5010000,
        close: 5025000,
        volume: 1100
      },
      {
        timestamp: Date.now() - 57 * 60 * 1000,
        open: 5025000,
        high: 5040000,
        low: 5020000,
        close: 5035000,
        volume: 1300
      },
      {
        timestamp: Date.now() - 56 * 60 * 1000,
        open: 5035000,
        high: 5050000,
        low: 5030000,
        close: 5045000,
        volume: 1150
      }
    ];
  });

  describe('runBacktest', () => {
    it('should run backtest successfully', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('positions');
      expect(result).toHaveProperty('initialBalance');
      expect(result).toHaveProperty('finalBalance');
      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('totalReturnPercent');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('maxDrawdownPercent');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('profitFactor');
      expect(result).toHaveProperty('sharpeRatio');
      expect(result).toHaveProperty('equityCurve');
      expect(result).toHaveProperty('drawdownCurve');

      expect(result.initialBalance).toBe(100000);
      expect(result.finalBalance).toBeGreaterThan(0);
      expect(result.trades).toBeInstanceOf(Array);
      expect(result.positions).toBeInstanceOf(Array);
      expect(result.equityCurve).toBeInstanceOf(Array);
      expect(result.drawdownCurve).toBeInstanceOf(Array);
    });

    it('should handle empty data', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest([]);

      expect(result.trades).toHaveLength(0);
      expect(result.positions).toHaveLength(0);
      expect(result.totalTrades).toBe(0);
      expect(result.finalBalance).toBe(backtestConfig.initialBalance);
    });

    it('should calculate performance metrics correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
      expect(result.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
      
      if (result.totalTrades > 0) {
        expect(result.averageWin).toBeGreaterThanOrEqual(0);
        expect(result.averageLoss).toBeGreaterThanOrEqual(0);
        expect(result.winningTrades + result.losingTrades).toBe(result.totalTrades);
      }
    });

    it('should respect stop loss and take profit', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      
      // Create data with large price movements to trigger stop loss/take profit
      const volatileData: HistoricalDataPoint[] = [
        {
          timestamp: Date.now() - 60 * 60 * 1000,
          open: 5000000,
          high: 5010000,
          low: 4990000,
          close: 5000000,
          volume: 1000
        },
        {
          timestamp: Date.now() - 59 * 60 * 1000,
          open: 5000000,
          high: 5300000, // +6% should trigger take profit
          low: 5000000,
          close: 5300000,
          volume: 1200
        },
        {
          timestamp: Date.now() - 58 * 60 * 1000,
          open: 5300000,
          high: 5300000,
          low: 4600000, // -8% should trigger stop loss
          close: 4600000,
          volume: 1100
        }
      ];

      const result = await engine.runBacktest(volatileData);

      if (result.trades.length > 0) {
        const tradesWithExitReason = result.trades.filter(t => t.exitReason);
        expect(tradesWithExitReason.length).toBeGreaterThan(0);
        
        const stopLossTrades = tradesWithExitReason.filter(t => t.exitReason === 'stop_loss');
        const takeProfitTrades = tradesWithExitReason.filter(t => t.exitReason === 'take_profit');
        
        expect(stopLossTrades.length + takeProfitTrades.length).toBeGreaterThan(0);
      }
    });

    it('should apply commission and slippage correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      if (result.trades.length > 0) {
        result.trades.forEach(trade => {
          expect(trade.commission).toBeGreaterThan(0);
          expect(trade.slippage).toBeGreaterThan(0);
          
          // Commission should be based on trade value
          const expectedCommission = trade.price * trade.amount * backtestConfig.commission;
          expect(trade.commission).toBeCloseTo(expectedCommission, 2);
        });
      }
    });

    it('should limit concurrent positions', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      // Check that at no point there were more than 3 concurrent positions
      let maxConcurrentPositions = 0;
      let currentPositions = 0;

      result.trades.forEach(trade => {
        if (trade.exitTimestamp) {
          currentPositions++;
          maxConcurrentPositions = Math.max(maxConcurrentPositions, currentPositions);
        }
        if (trade.exitTimestamp) {
          currentPositions--;
        }
      });

      expect(maxConcurrentPositions).toBeLessThanOrEqual(3);
    });

    it('should calculate equity curve correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.equityCurve).toBeInstanceOf(Array);
      expect(result.equityCurve.length).toBeGreaterThan(0);

      // First equity point should be initial balance
      expect(result.equityCurve[0]?.equity).toBe(backtestConfig.initialBalance);

      // Each equity point should have required properties
      result.equityCurve.forEach(point => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('equity');
        expect(point).toHaveProperty('drawdown');
        expect(point).toHaveProperty('drawdownPercent');
        
        expect(point.equity).toBeGreaterThan(0);
        expect(point.drawdown).toBeGreaterThanOrEqual(0);
        expect(point.drawdownPercent).toBeGreaterThanOrEqual(0);
      });
    });

    it('should calculate drawdown curve correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.drawdownCurve).toBeInstanceOf(Array);
      expect(result.drawdownCurve.length).toBeGreaterThan(0);

      result.drawdownCurve.forEach(point => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('drawdown');
        expect(point).toHaveProperty('drawdownPercent');
        expect(point).toHaveProperty('underwater');
        
        expect(point.drawdown).toBeGreaterThanOrEqual(0);
        expect(point.drawdownPercent).toBeGreaterThanOrEqual(0);
        expect(point.underwater).toBeGreaterThanOrEqual(0);
        expect(point.underwater).toBeLessThanOrEqual(1);
      });
    });

    it('should calculate risk metrics correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.var95).toBeLessThanOrEqual(0); // VaR should be negative
      expect(result.var99).toBeLessThanOrEqual(0); // VaR should be negative
      expect(result.cvar95).toBeLessThanOrEqual(0); // CVaR should be negative
      expect(result.cvar99).toBeLessThanOrEqual(0); // CVaR should be negative

      expect(result.skewness).toBeGreaterThan(-10); // Reasonable skewness range
      expect(result.skewness).toBeLessThan(10);
      expect(result.kurtosis).toBeGreaterThan(-10); // Reasonable kurtosis range
      expect(result.kurtosis).toBeLessThan(10);

      expect(result.ulcerIndex).toBeGreaterThanOrEqual(0);
      expect(result.gainToPainRatio).toBeGreaterThanOrEqual(0);
      expect(result.sterlingRatio).toBeGreaterThanOrEqual(0);
      expect(result.burkeRatio).toBeGreaterThanOrEqual(0);
      expect(result.martin_ratio).toBeGreaterThanOrEqual(0);
    });

    it('should handle different timeframes', async () => {
      const configs = [
        { ...backtestConfig, timeframe: '1m' },
        { ...backtestConfig, timeframe: '5m' },
        { ...backtestConfig, timeframe: '1h' }
      ];

      for (const config of configs) {
        const engine = new BacktestEngine(config, strategyConfig);
        const result = await engine.runBacktest(testData);

        expect(result).toHaveProperty('trades');
        expect(result).toHaveProperty('totalReturn');
        expect(result.initialBalance).toBe(config.initialBalance);
      }
    });
  });

  describe('risk management', () => {
    it('should not exceed initial balance', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      // Final balance should not be negative (assuming no leverage)
      expect(result.finalBalance).toBeGreaterThanOrEqual(0);
    });

    it('should handle insufficient balance', async () => {
      const lowBalanceConfig = {
        ...backtestConfig,
        initialBalance: 100 // Very low balance
      };

      const engine = new BacktestEngine(lowBalanceConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      // Should not create trades if balance is insufficient
      expect(result.finalBalance).toBeGreaterThanOrEqual(0);
    });

    it('should calculate position sizing correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      if (result.trades.length > 0) {
        result.trades.forEach(trade => {
          const positionValue = trade.price * trade.amount;
          const positionSize = positionValue / backtestConfig.initialBalance;
          
          // Position should not exceed max position size
          expect(positionSize).toBeLessThanOrEqual(backtestConfig.maxPositionSize);
        });
      }
    });
  });

  describe('performance calculations', () => {
    it('should calculate Sharpe ratio correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.sharpeRatio).toBeGreaterThan(-5); // Reasonable range
      expect(result.sharpeRatio).toBeLessThan(5);
    });

    it('should calculate Sortino ratio correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.sortinoRatio).toBeGreaterThan(-5); // Reasonable range
      expect(result.sortinoRatio).toBeLessThan(5);
    });

    it('should calculate Calmar ratio correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.calmarRatio).toBeGreaterThanOrEqual(0);
      
      if (result.maxDrawdownPercent > 0) {
        expect(result.calmarRatio).toBe(result.totalReturnPercent / result.maxDrawdownPercent);
      }
    });

    it('should calculate monthly returns correctly', async () => {
      const engine = new BacktestEngine(backtestConfig, strategyConfig);
      const result = await engine.runBacktest(testData);

      expect(result.monthlyReturns).toBeInstanceOf(Array);
      
      result.monthlyReturns.forEach(monthlyReturn => {
        expect(monthlyReturn).toHaveProperty('year');
        expect(monthlyReturn).toHaveProperty('month');
        expect(monthlyReturn).toHaveProperty('return');
        expect(monthlyReturn).toHaveProperty('returnPercent');
        
        expect(monthlyReturn.year).toBeGreaterThan(2020);
        expect(monthlyReturn.month).toBeGreaterThanOrEqual(0);
        expect(monthlyReturn.month).toBeLessThanOrEqual(11);
      });
    });
  });
});