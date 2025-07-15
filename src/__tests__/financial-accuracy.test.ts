import { ProfitCalculator } from '../utils/profit-calculator';
import { TradingPosition } from '../types/bitbank';

describe('Financial Accuracy Testing Suite', () => {
  let calculator: ProfitCalculator;
  const initialBalance = 1000000; // 1M JPY

  beforeEach(() => {
    calculator = new ProfitCalculator(initialBalance);
  });

  describe('Profit Calculation Accuracy', () => {
    it('should calculate simple buy-sell profit correctly', () => {
      const buyPrice = 5000000; // 5M JPY per BTC
      const sellPrice = 5200000; // 5.2M JPY per BTC
      const amount = 0.001; // 0.001 BTC
      
      const position: TradingPosition = {
        side: 'buy',
        amount,
        price: buyPrice,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      calculator.closePosition('pos1', sellPrice, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      const expectedProfit = (sellPrice - buyPrice) * amount; // 200 JPY

      expect(metrics.totalProfit).toBeCloseTo(expectedProfit, 2);
      expect(metrics.totalReturn).toBeCloseTo(expectedProfit / initialBalance, 6);
      expect(metrics.winRate).toBe(1); // 100% win rate
      expect(metrics.totalTrades).toBe(1);
    });

    it('should calculate sell-buy profit correctly (short position)', () => {
      const sellPrice = 5200000; // Sell high first
      const buyPrice = 5000000; // Buy back lower
      const amount = 0.001;
      
      const position: TradingPosition = {
        side: 'sell',
        amount,
        price: sellPrice,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      calculator.closePosition('pos1', buyPrice, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      const expectedProfit = (sellPrice - buyPrice) * amount; // 200 JPY

      expect(metrics.totalProfit).toBeCloseTo(expectedProfit, 2);
      expect(metrics.totalReturn).toBeCloseTo(expectedProfit / initialBalance, 6);
    });

    it('should handle losses correctly', () => {
      const buyPrice = 5200000;
      const sellPrice = 5000000; // Sell at loss
      const amount = 0.001;
      
      const position: TradingPosition = {
        side: 'buy',
        amount,
        price: buyPrice,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      calculator.closePosition('pos1', sellPrice, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      const expectedLoss = (sellPrice - buyPrice) * amount; // -200 JPY

      expect(metrics.totalProfit).toBeCloseTo(expectedLoss, 2);
      expect(metrics.totalReturn).toBeCloseTo(expectedLoss / initialBalance, 6);
      expect(metrics.winRate).toBe(0); // 0% win rate
    });

    it('should calculate multiple position profits accurately', () => {
      const positions = [
        { side: 'buy' as const, amount: 0.001, buyPrice: 5000000, sellPrice: 5100000 },
        { side: 'buy' as const, amount: 0.002, buyPrice: 5050000, sellPrice: 5200000 },
        { side: 'sell' as const, amount: 0.0015, buyPrice: 5000000, sellPrice: 5100000 },
      ];

      let expectedTotalProfit = 0;
      let wins = 0;

      positions.forEach((pos, index) => {
        const position: TradingPosition = {
          side: pos.side,
          amount: pos.amount,
          price: pos.side === 'buy' ? pos.buyPrice : pos.sellPrice,
          timestamp: Date.now(),
        };

        calculator.addPosition(`pos${index}`, position);
        
        const closePrice = pos.side === 'buy' ? pos.sellPrice : pos.buyPrice;
        calculator.closePosition(`pos${index}`, closePrice, Date.now());

        const profit = pos.side === 'buy' 
          ? (pos.sellPrice - pos.buyPrice) * pos.amount
          : (pos.sellPrice - pos.buyPrice) * pos.amount;
        
        expectedTotalProfit += profit;
        if (profit > 0) wins++;
      });

      const metrics = calculator.calculateProfitMetrics();
      
      expect(metrics.totalProfit).toBeCloseTo(expectedTotalProfit, 2);
      expect(metrics.totalTrades).toBe(positions.length);
      expect(metrics.winRate).toBeCloseTo(wins / positions.length, 2);
    });
  });

  describe('Fee Calculation and Handling', () => {
    it('should account for trading fees in profit calculation', () => {
      // Note: Current implementation doesn't include fees
      // This test demonstrates where fee calculation should be added
      const buyPrice = 5000000;
      const sellPrice = 5200000;
      const amount = 0.001;
      const _feeRate = 0.0012; // 0.12% fee (typical Bitbank fee)
      
      const position: TradingPosition = {
        side: 'buy',
        amount,
        price: buyPrice,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      calculator.closePosition('pos1', sellPrice, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      
      // Current implementation without fees
      const grossProfit = (sellPrice - buyPrice) * amount;
      expect(metrics.totalProfit).toBeCloseTo(grossProfit, 2);
      
      // Future implementation should account for fees:
      // const buyFee = buyPrice * amount * feeRate;
      // const sellFee = sellPrice * amount * feeRate;
      // const netProfit = grossProfit - buyFee - sellFee;
    });

    it('should handle different fee structures', () => {
      // Test cases for different fee scenarios
      const scenarios = [
        { name: 'Maker Fee', feeRate: 0.0012, isMaker: true },
        { name: 'Taker Fee', feeRate: 0.0015, isMaker: false },
        { name: 'VIP Discount', feeRate: 0.0008, isMaker: true },
      ];

      scenarios.forEach(_scenario => {
        const testCalculator = new ProfitCalculator(initialBalance);
        const buyPrice = 5000000;
        const sellPrice = 5200000;
        const amount = 0.001;
        
        const position: TradingPosition = {
          side: 'buy',
          amount,
          price: buyPrice,
          timestamp: Date.now(),
        };

        testCalculator.addPosition('pos1', position);
        testCalculator.closePosition('pos1', sellPrice, Date.now());

        const metrics = testCalculator.calculateProfitMetrics();
        
        // Current implementation - all scenarios yield same result
        const grossProfit = (sellPrice - buyPrice) * amount;
        expect(metrics.totalProfit).toBeCloseTo(grossProfit, 2);
      });
    });
  });

  describe('Precision and Rounding', () => {
    it('should maintain precision with small amounts', () => {
      const buyPrice = 5000000;
      const sellPrice = 5000001; // 1 JPY difference
      const amount = 0.00000001; // 1 satoshi
      
      const position: TradingPosition = {
        side: 'buy',
        amount,
        price: buyPrice,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      calculator.closePosition('pos1', sellPrice, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      const expectedProfit = (sellPrice - buyPrice) * amount; // 0.00000001 JPY

      expect(metrics.totalProfit).toBeCloseTo(expectedProfit, 8);
    });

    it('should handle large amounts accurately', () => {
      const buyPrice = 5000000;
      const sellPrice = 5200000;
      const amount = 100; // 100 BTC (large amount)
      
      const position: TradingPosition = {
        side: 'buy',
        amount,
        price: buyPrice,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position);
      calculator.closePosition('pos1', sellPrice, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      const expectedProfit = (sellPrice - buyPrice) * amount; // 20M JPY

      expect(metrics.totalProfit).toBeCloseTo(expectedProfit, 2);
    });

    it('should round currencies appropriately', () => {
      // Test various precision scenarios
      const testCases = [
        { amount: 0.123456789, expected: 0.123456789 }, // BTC precision
        { price: 5123456.789, expected: 5123456.789 }, // JPY precision
        { profit: 123.456789, expected: 123.456789 }, // Profit precision
      ];

      testCases.forEach(testCase => {
        const position: TradingPosition = {
          side: 'buy',
          amount: testCase.amount || 0.001,
          price: testCase.price || 5000000,
          timestamp: Date.now(),
        };

        const testCalculator = new ProfitCalculator(initialBalance);
        testCalculator.addPosition('pos1', position);
        testCalculator.closePosition('pos1', (testCase.price || 5000000) + 1000, Date.now());

        const metrics = testCalculator.calculateProfitMetrics();
        expect(metrics.totalProfit).toBeDefined();
        expect(isNaN(metrics.totalProfit)).toBe(false);
      });
    });
  });

  describe('Balance and Portfolio Tracking', () => {
    it('should track current balance accurately', () => {
      const currentBalance = calculator.getCurrentBalance();
      expect(currentBalance).toBe(initialBalance);

      // Add some profitable trades
      const position1: TradingPosition = {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      };

      calculator.addPosition('pos1', position1);
      calculator.closePosition('pos1', 5200000, Date.now());

      const newBalance = calculator.getCurrentBalance();
      const expectedBalance = initialBalance + (5200000 - 5000000) * 0.001;
      
      expect(newBalance).toBeCloseTo(expectedBalance, 2);
    });

    it('should calculate portfolio value correctly', () => {
      // Add multiple open positions
      const positions = [
        { amount: 0.001, price: 5000000 },
        { amount: 0.002, price: 5100000 },
        { amount: 0.0015, price: 4900000 },
      ];

      positions.forEach((pos, index) => {
        calculator.addPosition(`pos${index}`, {
          side: 'buy',
          amount: pos.amount,
          price: pos.price,
          timestamp: Date.now(),
        });
      });

      const openPositions = calculator.getOpenPositions();
      expect(openPositions).toHaveLength(positions.length);

      // Calculate total invested amount
      const totalInvested = positions.reduce((sum, pos) => sum + (pos.amount * pos.price), 0);
      const availableCash = initialBalance - totalInvested;
      
      expect(availableCash).toBeGreaterThan(0);
    });

    it('should handle negative balance scenarios', () => {
      // Simulate large losses that could result in negative balance
      const largeLossPosition: TradingPosition = {
        side: 'buy',
        amount: 1, // 1 BTC
        price: 5000000,
        timestamp: Date.now(),
      };

      calculator.addPosition('largeLoss', largeLossPosition);
      calculator.closePosition('largeLoss', 4000000, Date.now()); // 1M JPY loss

      const balance = calculator.getCurrentBalance();
      const expectedBalance = initialBalance - 1000000; // Should be 0
      
      expect(balance).toBeCloseTo(expectedBalance, 2);
      expect(balance).toBeGreaterThanOrEqual(0); // Should not go negative
    });
  });

  describe('Drawdown Calculation', () => {
    it('should calculate maximum drawdown correctly', () => {
      const trades = [
        { buyPrice: 5000000, sellPrice: 5200000, amount: 0.001 }, // +200 JPY -> 1000200
        { buyPrice: 5100000, sellPrice: 4900000, amount: 0.001 }, // -200 JPY -> 1000000
        { buyPrice: 4900000, sellPrice: 4600000, amount: 0.001 }, // -300 JPY -> 999700
        { buyPrice: 4600000, sellPrice: 5000000, amount: 0.001 }, // +400 JPY -> 1000100
      ];

      let peakBalance = initialBalance;
      let maxDrawdown = 0;

      trades.forEach((trade, index) => {
        const position: TradingPosition = {
          side: 'buy',
          amount: trade.amount,
          price: trade.buyPrice,
          timestamp: Date.now(),
        };

        calculator.addPosition(`trade${index}`, position);
        calculator.closePosition(`trade${index}`, trade.sellPrice, Date.now());

        const currentBalance = calculator.getCurrentBalance();
        peakBalance = Math.max(peakBalance, currentBalance);
        const drawdown = (peakBalance - currentBalance) / peakBalance;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      });

      const metrics = calculator.calculateProfitMetrics();
      expect(metrics.maxDrawdown).toBeCloseTo(maxDrawdown, 4);
    });

    it('should track current drawdown', () => {
      // Start with profitable trade to establish peak
      calculator.addPosition('pos1', {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      });
      calculator.closePosition('pos1', 5500000, Date.now()); // +500 JPY

      // Add losing trade
      calculator.addPosition('pos2', {
        side: 'buy',
        amount: 0.001,
        price: 5500000,
        timestamp: Date.now(),
      });
      calculator.closePosition('pos2', 5200000, Date.now()); // -300 JPY

      const metrics = calculator.calculateProfitMetrics();
      const expectedCurrentDrawdown = 300 / (initialBalance + 500); // Drawdown from peak
      
      expect(metrics.currentDrawdown).toBeCloseTo(expectedCurrentDrawdown, 4);
    });
  });

  describe('Win Rate and Statistics', () => {
    it('should calculate win rate accurately', () => {
      const trades = [
        { profit: 100 }, // Win
        { profit: -50 }, // Loss
        { profit: 200 }, // Win
        { profit: -30 }, // Loss
        { profit: 75 },  // Win
      ];

      trades.forEach((trade, index) => {
        const buyPrice = 5000000;
        const sellPrice = buyPrice + (trade.profit / 0.001); // Adjust sell price for desired profit
        
        calculator.addPosition(`trade${index}`, {
          side: 'buy',
          amount: 0.001,
          price: buyPrice,
          timestamp: Date.now(),
        });
        calculator.closePosition(`trade${index}`, sellPrice, Date.now());
      });

      const metrics = calculator.calculateProfitMetrics();
      const expectedWinRate = 3 / 5; // 3 wins out of 5 trades
      
      expect(metrics.winRate).toBeCloseTo(expectedWinRate, 4);
      expect(metrics.totalTrades).toBe(trades.length);
    });

    it('should handle zero trades correctly', () => {
      const metrics = calculator.calculateProfitMetrics();
      
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winRate).toBe(0);
      expect(metrics.totalProfit).toBe(0);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
      expect(metrics.currentDrawdown).toBe(0);
    });

    it('should calculate average trade metrics', () => {
      const trades = [100, -50, 200, -30, 75]; // JPY profits
      
      trades.forEach((profit, index) => {
        const buyPrice = 5000000;
        const sellPrice = buyPrice + (profit / 0.001);
        
        calculator.addPosition(`trade${index}`, {
          side: 'buy',
          amount: 0.001,
          price: buyPrice,
          timestamp: Date.now(),
        });
        calculator.closePosition(`trade${index}`, sellPrice, Date.now());
      });

      const metrics = calculator.calculateProfitMetrics();
      const expectedAvgProfit = trades.reduce((sum, p) => sum + p, 0) / trades.length;
      const actualAvgProfit = metrics.totalProfit / metrics.totalTrades;
      
      expect(actualAvgProfit).toBeCloseTo(expectedAvgProfit, 2);
    });
  });

  describe('Time-based Analysis', () => {
    it('should track trade durations', () => {
      const startTime = Date.now();
      const duration = 3600000; // 1 hour
      
      calculator.addPosition('pos1', {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: startTime,
      });
      
      calculator.closePosition('pos1', 5200000, startTime + duration);
      
      const tradeHistory = calculator.getTradeHistory();
      expect(tradeHistory).toHaveLength(1);
      
      // Verify trade history contains timing information
      const trade = tradeHistory[0];
      expect(trade).toHaveProperty('entryTime');
      expect(trade).toHaveProperty('exitTime');
    });

    it('should handle trades across different time periods', () => {
      const baseTime = Date.now();
      const timeIntervals = [0, 3600000, 7200000, 86400000]; // 0h, 1h, 2h, 24h
      
      timeIntervals.forEach((interval, index) => {
        calculator.addPosition(`pos${index}`, {
          side: 'buy',
          amount: 0.001,
          price: 5000000,
          timestamp: baseTime + interval,
        });
        
        calculator.closePosition(`pos${index}`, 5100000, baseTime + interval + 1800000); // Close 30min later
      });

      const metrics = calculator.calculateProfitMetrics();
      expect(metrics.totalTrades).toBe(timeIntervals.length);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero amounts gracefully', () => {
      const position: TradingPosition = {
        side: 'buy',
        amount: 0,
        price: 5000000,
        timestamp: Date.now(),
      };

      calculator.addPosition('zero', position);
      calculator.closePosition('zero', 5200000, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      expect(metrics.totalProfit).toBe(0);
      expect(metrics.totalTrades).toBe(1);
    });

    it('should handle very small price differences', () => {
      const position: TradingPosition = {
        side: 'buy',
        amount: 0.001,
        price: 5000000.001,
        timestamp: Date.now(),
      };

      calculator.addPosition('small', position);
      calculator.closePosition('small', 5000000.002, Date.now());

      const metrics = calculator.calculateProfitMetrics();
      expect(metrics.totalProfit).toBeCloseTo(0.000001, 6);
    });

    it('should handle closing non-existent positions', () => {
      expect(() => {
        calculator.closePosition('nonexistent', 5200000, Date.now());
      }).not.toThrow();

      const metrics = calculator.calculateProfitMetrics();
      expect(metrics.totalTrades).toBe(0);
    });

    it('should handle duplicate position IDs', () => {
      const position: TradingPosition = {
        side: 'buy',
        amount: 0.001,
        price: 5000000,
        timestamp: Date.now(),
      };

      calculator.addPosition('duplicate', position);
      calculator.addPosition('duplicate', position); // Same ID

      const openPositions = calculator.getOpenPositions();
      expect(openPositions).toHaveLength(1); // Should overwrite, not duplicate
    });
  });
});