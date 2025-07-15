import { ProfitCalculator } from '../utils/profit-calculator';
import { TradingPosition } from '../types/bitbank';

describe('ProfitCalculator', () => {
  let calculator: ProfitCalculator;
  const initialBalance = 100000;

  beforeEach(() => {
    calculator = new ProfitCalculator(initialBalance);
  });

  describe('initialization', () => {
    it('should initialize with correct balance', () => {
      expect(calculator.getCurrentBalance()).toBe(initialBalance);
      expect(calculator.getTotalProfit()).toBe(0);
      expect(calculator.getProfitPercentage()).toBe(0);
    });
  });

  describe('position management', () => {
    it('should add and track positions', () => {
      const position: TradingPosition = {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      const openPositions = calculator.getOpenPositions();

      expect(openPositions).toHaveLength(1);
      expect(openPositions[0]).toEqual(position);
    });

    it('should close positions and calculate profit for buy orders', () => {
      const position: TradingPosition = {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      
      const exitPrice = 5100000;
      const exitTimestamp = Date.now();
      const trade = calculator.closePosition('pos1', exitPrice, exitTimestamp);

      expect(trade).toBeDefined();
      expect(trade?.profit).toBe(100); // (5100000 - 5000000) * 0.001
      expect(trade?.returnRate).toBeCloseTo(0.02); // 100 / 5000
      expect(calculator.getCurrentBalance()).toBe(initialBalance + 100);
    });

    it('should close positions and calculate profit for sell orders', () => {
      const position: TradingPosition = {
        side: 'sell',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      
      const exitPrice = 4900000;
      const exitTimestamp = Date.now();
      const trade = calculator.closePosition('pos1', exitPrice, exitTimestamp);

      expect(trade).toBeDefined();
      expect(trade?.profit).toBe(100); // (5000000 - 4900000) * 0.001
      expect(trade?.returnRate).toBeCloseTo(0.02); // 100 / 5000
      expect(calculator.getCurrentBalance()).toBe(initialBalance + 100);
    });
  });

  describe('profit metrics calculation', () => {
    beforeEach(() => {
      // Add winning trade
      calculator.addPosition('win1', {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      });
      calculator.closePosition('win1', 5100000, Date.now());

      // Add losing trade
      calculator.addPosition('lose1', {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      });
      calculator.closePosition('lose1', 4900000, Date.now());
    });

    it('should calculate correct profit metrics', () => {
      const metrics = calculator.calculateProfitMetrics();

      expect(metrics.totalProfit).toBe(0); // 100 - 100 = 0
      expect(metrics.totalReturn).toBe(0); // No net change
      expect(metrics.winRate).toBe(0.5); // 1 win out of 2 trades
      expect(metrics.totalTrades).toBe(2);
    });

    it('should track winning and losing streaks', () => {
      expect(calculator.getWinningStreak()).toBe(1);
      expect(calculator.getLosingStreak()).toBe(1);
    });

    it('should identify best and worst trades', () => {
      const bestTrade = calculator.getBestTrade();
      const worstTrade = calculator.getWorstTrade();

      expect(bestTrade?.profit).toBe(100);
      expect(worstTrade?.profit).toBe(-100);
    });
  });

  describe('drawdown calculation', () => {
    it('should calculate maximum drawdown correctly', () => {
      const positions = [
        { side: 'buy' as const, amount: 0.001, price: 5000000, timestamp: Date.now() },
        { side: 'buy' as const, amount: 0.001, price: 5000000, timestamp: Date.now() },
        { side: 'buy' as const, amount: 0.001, price: 5000000, timestamp: Date.now() },
      ];

      const exitPrices = [5200000, 4800000, 4600000]; // +200, -200, -400

      positions.forEach((pos, i) => {
        calculator.addPosition(`pos${i}`, pos);
        const exitPrice = exitPrices[i];
        if (exitPrice !== undefined) {
          calculator.closePosition(`pos${i}`, exitPrice, Date.now());
        }
      });

      const metrics = calculator.calculateProfitMetrics();
      
      // After first trade: 100200 (peak)
      // After second trade: 100000 (drawdown: 200/100200)
      // After third trade: 99600 (drawdown: 600/100200)
      expect(metrics.maxDrawdown).toBeCloseTo(600 / 100200, 3);
    });
  });

  describe('performance report', () => {
    it('should generate comprehensive performance report', () => {
      calculator.addPosition('pos1', {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      });
      calculator.closePosition('pos1', 5100000, Date.now());

      const report = calculator.getPerformanceReport();

      expect(report).toContain('PROFIT CALCULATION REPORT');
      expect(report).toContain('Total Profit: 100.00 JPY');
      expect(report).toContain('Win Rate: 100.00%');
      expect(report).toContain('Total Trades: 1');
    });
  });

  describe('reset functionality', () => {
    it('should reset all data to initial state', () => {
      calculator.addPosition('pos1', {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      });
      calculator.closePosition('pos1', 5100000, Date.now());

      calculator.reset();

      expect(calculator.getCurrentBalance()).toBe(initialBalance);
      expect(calculator.getTotalProfit()).toBe(0);
      expect(calculator.getTradeHistory()).toHaveLength(0);
      expect(calculator.getOpenPositions()).toHaveLength(0);
    });
  });
});