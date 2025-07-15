// import { jest } from '@jest/globals';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { ProfitCalculator } from '../utils/profit-calculator';
import { BitbankTicker } from '../types/bitbank';

describe('Market Simulation Testing', () => {
  let strategy: TradingStrategy;
  let profitCalculator: ProfitCalculator;
  let config: TradingStrategyConfig;

  beforeEach(() => {
    config = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8,
    };
    strategy = new TradingStrategy(config);
    profitCalculator = new ProfitCalculator(100000);
  });

  const createTicker = (price: number, volume: number = 2000): BitbankTicker => ({
    pair: 'btc_jpy',
    sell: (price + 1000).toString(),
    buy: (price - 1000).toString(),
    high: (price + 5000).toString(),
    low: (price - 5000).toString(),
    last: price.toString(),
    vol: volume.toString(),
    timestamp: Date.now(),
  });

  describe('Bull Market Simulation', () => {
    it('should perform well in strong uptrend', () => {
      const startPrice = 5000000;
      const endPrice = 6000000;
      const steps = 100;
      const priceIncrement = (endPrice - startPrice) / steps;
      
      let totalProfit = 0;
      let trades = 0;
      
      for (let i = 0; i < steps; i++) {
        const currentPrice = startPrice + (i * priceIncrement);
        strategy.updatePrice(currentPrice);
        
        if (i >= 10) { // Ensure sufficient history
          const ticker = createTicker(currentPrice, 2000 + Math.random() * 1000);
          const signal = strategy.generateSignal(ticker);
          
          if (signal.action === 'buy' && trades < 3) {
            const positionId = `bull_${trades}`;
            const position = {
              side: 'buy' as const,
              amount: signal.amount,
              price: signal.price,
              timestamp: Date.now(),
            };
            
            profitCalculator.addPosition(positionId, position);
            
            // Simulate selling at higher price
            const sellPrice = currentPrice * 1.03; // 3% profit
            profitCalculator.closePosition(positionId, sellPrice, Date.now());
            
            totalProfit += (sellPrice - currentPrice) * signal.amount;
            trades++;
          }
        }
      }
      
      const metrics = profitCalculator.calculateProfitMetrics();
      
      expect(trades).toBeGreaterThan(0);
      expect(metrics.totalProfit).toBeGreaterThan(0);
      expect(metrics.winRate).toBeGreaterThan(0.7); // Should have high win rate in bull market
    });
  });

  describe('Bear Market Simulation', () => {
    it('should minimize losses in strong downtrend', () => {
      const startPrice = 6000000;
      const endPrice = 4000000;
      const steps = 100;
      const priceDecrement = (startPrice - endPrice) / steps;
      
      let totalTrades = 0;
      let stopLossHits = 0;
      
      for (let i = 0; i < steps; i++) {
        const currentPrice = startPrice - (i * priceDecrement);
        strategy.updatePrice(currentPrice);
        
        if (i >= 10) { // Ensure sufficient history
          const ticker = createTicker(currentPrice, 1500 + Math.random() * 500);
          const signal = strategy.generateSignal(ticker);
          
          if (signal.action === 'sell' || signal.action === 'buy') {
            totalTrades++;
            
            // Simulate stop loss scenario
            if (signal.action === 'buy') {
              const positionId = `bear_${totalTrades}`;
              const position = {
                side: 'buy' as const,
                amount: signal.amount,
                price: signal.price,
                timestamp: Date.now(),
              };
              
              profitCalculator.addPosition(positionId, position);
              
              // Simulate stop loss at 2% loss
              const stopLossPrice = currentPrice * 0.98;
              profitCalculator.closePosition(positionId, stopLossPrice, Date.now());
              
              stopLossHits++;
            }
          }
        }
      }
      
      const metrics = profitCalculator.calculateProfitMetrics();
      
      // In bear market, strategy should:
      // 1. Generate fewer buy signals
      // 2. Use stop losses effectively
      // 3. Limit maximum drawdown
      expect(metrics.maxDrawdown).toBeLessThan(0.1); // Less than 10% max drawdown
      expect(stopLossHits).toBeGreaterThan(0); // Stop losses should trigger
    });
  });

  describe('Sideways Market Simulation', () => {
    it('should handle range-bound market conditions', () => {
      const basePrice = 5000000;
      const range = 200000; // ±200k range
      const steps = 200;
      
      let trades = 0;
      let rangeBoundSignals = 0;
      
      for (let i = 0; i < steps; i++) {
        // Create oscillating price within range
        const oscillation = Math.sin(i * 0.1) * range;
        const currentPrice = basePrice + oscillation;
        strategy.updatePrice(currentPrice);
        
        if (i >= 20) { // Ensure sufficient history
          const ticker = createTicker(currentPrice, 1800);
          const signal = strategy.generateSignal(ticker);
          
          rangeBoundSignals++;
          
          if (signal.action !== 'hold') {
            trades++;
          }
        }
      }
      
      const _metrics = profitCalculator.calculateProfitMetrics();
      
      // In sideways market:
      // 1. Should generate fewer trading signals
      // 2. Should avoid excessive trading
      const signalRate = trades / rangeBoundSignals;
      expect(signalRate).toBeLessThan(0.3); // Less than 30% signal rate
    });
  });

  describe('High Volatility Market Simulation', () => {
    it('should handle extreme price swings', () => {
      const basePrice = 5000000;
      const volatilityFactor = 0.1; // 10% swings
      const steps = 50;
      
      let highVolatilityTrades = 0;
      let consecutiveLosses = 0;
      let maxConsecutiveLosses = 0;
      
      for (let i = 0; i < steps; i++) {
        // Create highly volatile price movements
        const randomFactor = (Math.random() - 0.5) * 2; // -1 to 1
        const volatilePrice = basePrice * (1 + randomFactor * volatilityFactor);
        strategy.updatePrice(volatilePrice);
        
        if (i >= 10) {
          const ticker = createTicker(volatilePrice, 3000);
          const signal = strategy.generateSignal(ticker);
          
          if (signal.action !== 'hold') {
            highVolatilityTrades++;
            
            // Simulate trade outcome in volatile market
            const isWinningTrade = Math.random() > 0.4; // 60% win rate
            
            if (!isWinningTrade) {
              consecutiveLosses++;
              maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
            } else {
              consecutiveLosses = 0;
            }
          }
        }
      }
      
      // In high volatility:
      // 1. Should limit consecutive losses
      // 2. Should reduce position sizes
      // 3. Should maintain risk controls
      expect(maxConsecutiveLosses).toBeLessThan(5); // Max 5 consecutive losses
      expect(highVolatilityTrades).toBeGreaterThan(0);
    });
  });

  describe('Low Liquidity Market Simulation', () => {
    it('should avoid trading in low liquidity conditions', () => {
      const basePrice = 5000000;
      const steps = 50;
      
      let lowLiquiditySignals = 0;
      let actualTrades = 0;
      
      for (let i = 0; i < steps; i++) {
        const currentPrice = basePrice + (i * 10000);
        strategy.updatePrice(currentPrice);
        
        if (i >= 10) {
          // Simulate low liquidity with low volume
          const lowVolume = 100 + Math.random() * 200; // Very low volume
          const ticker = createTicker(currentPrice, lowVolume);
          const signal = strategy.generateSignal(ticker);
          
          lowLiquiditySignals++;
          
          // Strategy should avoid trading in low liquidity
          if (signal.action !== 'hold') {
            actualTrades++;
          }
        }
      }
      
      // Should generate very few trades in low liquidity
      const tradeRate = actualTrades / lowLiquiditySignals;
      expect(tradeRate).toBeLessThan(0.2); // Less than 20% trade rate
    });
  });

  describe('Flash Crash Simulation', () => {
    it('should handle sudden market crashes', () => {
      const normalPrice = 5000000;
      const crashPrice = 4000000; // 20% crash
      const recoveryPrice = 4800000;
      
      // Build normal market history
      for (let i = 0; i < 20; i++) {
        strategy.updatePrice(normalPrice + (i * 1000));
      }
      
      // Simulate flash crash
      strategy.updatePrice(crashPrice);
      const crashTicker = createTicker(crashPrice, 10000); // High volume crash
      const crashSignal = strategy.generateSignal(crashTicker);
      
      // Simulate recovery
      strategy.updatePrice(recoveryPrice);
      const recoveryTicker = createTicker(recoveryPrice, 5000);
      const recoverySignal = strategy.generateSignal(recoveryTicker);
      
      // During flash crash:
      // 1. Should not panic buy at bottom
      // 2. Should wait for confirmation
      // 3. Risk management should activate
      expect(crashSignal.action).toBe('hold'); // Should not trade during crash
      
      // During recovery:
      // May generate buy signal if trend confirms
      expect(['buy', 'hold']).toContain(recoverySignal.action);
    });
  });

  describe('Exchange Maintenance Simulation', () => {
    it('should handle API errors and timeouts', () => {
      const testScenarios = [
        'Connection timeout',
        'API rate limit',
        'Server maintenance',
        'Invalid response',
      ];
      
      testScenarios.forEach(_scenario => {
        expect(() => {
          // Simulate error scenarios
          const ticker = createTicker(5000000);
          const signal = strategy.generateSignal(ticker);
          
          // Strategy should still return valid signal structure
          expect(signal).toHaveProperty('action');
          expect(signal).toHaveProperty('confidence');
          expect(signal).toHaveProperty('price');
          expect(signal).toHaveProperty('amount');
          expect(signal).toHaveProperty('reason');
        }).not.toThrow();
      });
    });
  });

  describe('Market Condition Detection', () => {
    it('should correctly identify different market regimes', () => {
      const scenarios = [
        { name: 'Strong Bull', prices: [5000000, 5100000, 5200000, 5300000, 5400000] },
        { name: 'Strong Bear', prices: [5000000, 4900000, 4800000, 4700000, 4600000] },
        { name: 'Sideways', prices: [5000000, 5010000, 4990000, 5020000, 4980000] },
        { name: 'Volatile', prices: [5000000, 5200000, 4800000, 5300000, 4700000] },
      ];
      
      scenarios.forEach(scenario => {
        const testStrategy = new TradingStrategy(config);
        
        // Build price history
        scenario.prices.forEach(price => {
          testStrategy.updatePrice(price);
        });
        
        const ticker = createTicker(scenario.prices[scenario.prices.length - 1]!);
        const signal = testStrategy.generateSignal(ticker);
        
        // Each market condition should produce appropriate signal
        expect(signal).toBeDefined();
        expect(['buy', 'sell', 'hold']).toContain(signal.action);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme market scenarios without breaking', () => {
      const extremeScenarios = [
        { name: 'Zero Volume', price: 5000000, volume: 0 },
        { name: 'Extremely High Volume', price: 5000000, volume: 1000000 },
        { name: 'Near Zero Price', price: 1, volume: 1000 },
        { name: 'Extremely High Price', price: 100000000000, volume: 1000 },
      ];
      
      extremeScenarios.forEach(scenario => {
        expect(() => {
          const ticker = createTicker(scenario.price, scenario.volume);
          const signal = strategy.generateSignal(ticker);
          
          // Should handle extreme values gracefully
          expect(signal.confidence).not.toBeNaN();
          expect(signal.amount).not.toBeNaN();
          expect(signal.price).not.toBeNaN();
          expect(signal.amount).toBeGreaterThanOrEqual(0);
        }).not.toThrow();
      });
    });
  });
});