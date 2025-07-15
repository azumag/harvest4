import { jest } from '@jest/globals';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { ProfitCalculator } from '../utils/profit-calculator';
// import { BitbankClient } from '../api/bitbank-client';
import { TradingBotConfig } from '../bot/trading-bot';
import { BitbankTicker } from '../types/bitbank';

// Extend Jest timeout for performance tests
jest.setTimeout(60000);

describe('Performance Testing Suite', () => {
  let config: TradingStrategyConfig;
  let _botConfig: TradingBotConfig;

  beforeEach(() => {
    config = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8,
    };

    _botConfig = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      baseUrl: 'https://api.bitbank.cc',
      pair: 'btc_jpy',
      initialBalance: 100000,
      maxConcurrentTrades: 3,
      tradingInterval: 30000,
      stopLossPercentage: 2,
      takeProfitPercentage: 4,
      strategy: config,
    };
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

  describe('Latency and Response Time Tests', () => {
    it('should generate trading signals within acceptable time limits', () => {
      const strategy = new TradingStrategy(config);
      
      // Build price history
      for (let i = 0; i < 20; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }
      
      const ticker = createTicker(5020000);
      
      // Measure signal generation time
      const startTime = process.hrtime.bigint();
      const signal = strategy.generateSignal(ticker);
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      expect(signal).toBeDefined();
      expect(durationMs).toBeLessThan(10); // Should complete within 10ms
    });

    it('should process multiple signals efficiently', () => {
      const strategy = new TradingStrategy(config);
      const iterations = 1000;
      
      // Build initial price history
      for (let i = 0; i < 20; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        const price = 5000000 + (i % 100) * 1000;
        const ticker = createTicker(price);
        const signal = strategy.generateSignal(ticker);
        expect(signal).toBeDefined();
      }
      
      const endTime = process.hrtime.bigint();
      const totalDurationMs = Number(endTime - startTime) / 1000000;
      const avgDurationMs = totalDurationMs / iterations;
      
      expect(avgDurationMs).toBeLessThan(1); // Average < 1ms per signal
      expect(totalDurationMs).toBeLessThan(1000); // Total < 1 second
    });

    it('should handle concurrent signal processing', async () => {
      const strategy = new TradingStrategy(config);
      
      // Build price history
      for (let i = 0; i < 20; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }
      
      const concurrentTasks = 50;
      const promises: Promise<any>[] = [];
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < concurrentTasks; i++) {
        const promise = new Promise((resolve) => {
          const ticker = createTicker(5000000 + i * 1000);
          const signal = strategy.generateSignal(ticker);
          resolve(signal);
        });
        promises.push(promise);
      }
      
      const results = await Promise.all(promises);
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000;
      
      expect(results).toHaveLength(concurrentTasks);
      expect(durationMs).toBeLessThan(100); // Should complete within 100ms
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during extended operation', () => {
      const strategy = new TradingStrategy(config);
      const initialMemory = process.memoryUsage();
      
      // Simulate extended operation
      for (let i = 0; i < 10000; i++) {
        const price = 5000000 + (i % 1000) * 100;
        strategy.updatePrice(price);
        
        if (i % 100 === 0) {
          const ticker = createTicker(price);
          strategy.generateSignal(ticker);
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const heapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(heapIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should maintain bounded price history', () => {
      const strategy = new TradingStrategy(config);
      
      // Add many prices to test history bounds
      for (let i = 0; i < 1000; i++) {
        strategy.updatePrice(5000000 + i * 100);
      }
      
      // Price history should be bounded (typically 20 items)
      const historySize = (strategy as any).priceHistory.length;
      expect(historySize).toBeLessThanOrEqual(20);
    });

    it('should efficiently manage profit calculator data', () => {
      const profitCalculator = new ProfitCalculator(100000);
      const initialMemory = process.memoryUsage();
      
      // Add many positions
      for (let i = 0; i < 1000; i++) {
        const position = {
          side: 'buy' as const,
          amount: 0.001,
          price: 5000000 + i * 100,
          timestamp: Date.now(),
        };
        
        profitCalculator.addPosition(`pos_${i}`, position);
        
        // Close some positions
        if (i % 2 === 0) {
          profitCalculator.closePosition(`pos_${i}`, position.price * 1.02, Date.now());
        }
      }
      
      const finalMemory = process.memoryUsage();
      const heapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable
      expect(heapIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });

  describe('Throughput Tests', () => {
    it('should handle high-frequency price updates', () => {
      const strategy = new TradingStrategy(config);
      const updatesPerSecond = 1000;
      const duration = 1; // 1 second test
      
      const startTime = Date.now();
      let updateCount = 0;
      
      while (Date.now() - startTime < duration * 1000) {
        const price = 5000000 + Math.random() * 100000;
        strategy.updatePrice(price);
        updateCount++;
      }
      
      expect(updateCount).toBeGreaterThan(updatesPerSecond * 0.8); // At least 80% of target
    });

    it('should process multiple trading pairs efficiently', () => {
      const pairs = ['btc_jpy', 'eth_jpy', 'xrp_jpy', 'ltc_jpy', 'bcc_jpy'];
      const strategies = pairs.map(() => new TradingStrategy(config));
      
      const startTime = process.hrtime.bigint();
      
      // Process all pairs simultaneously
      for (let i = 0; i < 100; i++) {
        strategies.forEach((strategy, index) => {
          const basePrice = 5000000 * (index + 1); // Different base prices
          strategy.updatePrice(basePrice + i * 1000);
          
          if (i > 20) {
            const ticker = createTicker(basePrice + i * 1000);
            strategy.generateSignal(ticker);
          }
        });
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      expect(durationMs).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Scalability Tests', () => {
    it('should scale with increasing position count', () => {
      const _profitCalculator = new ProfitCalculator(1000000);
      const positionCounts = [10, 50, 100, 500, 1000];
      const timings: number[] = [];
      
      positionCounts.forEach(count => {
        const calculator = new ProfitCalculator(1000000);
        
        // Add positions
        for (let i = 0; i < count; i++) {
          calculator.addPosition(`pos_${i}`, {
            side: 'buy',
            amount: 0.001,
            price: 5000000,
            timestamp: Date.now(),
          });
        }
        
        // Measure metrics calculation time
        const startTime = process.hrtime.bigint();
        calculator.calculateProfitMetrics();
        const endTime = process.hrtime.bigint();
        
        const durationMs = Number(endTime - startTime) / 1000000;
        timings.push(durationMs);
      });
      
      // Performance should scale reasonably (not exponentially)
      const lastTiming = timings[timings.length - 1];
      expect(lastTiming).toBeLessThan(100); // Should complete within 100ms even with 1000 positions
    });

    it('should handle increasing history size efficiently', () => {
      const _strategy = new TradingStrategy(config);
      const historySizes = [10, 20, 50, 100, 200];
      const timings: number[] = [];
      
      historySizes.forEach(size => {
        const testStrategy = new TradingStrategy(config);
        
        // Build history
        for (let i = 0; i < size; i++) {
          testStrategy.updatePrice(5000000 + i * 1000);
        }
        
        // Measure signal generation time
        const startTime = process.hrtime.bigint();
        const ticker = createTicker(5000000 + size * 1000);
        testStrategy.generateSignal(ticker);
        const endTime = process.hrtime.bigint();
        
        const durationMs = Number(endTime - startTime) / 1000000;
        timings.push(durationMs);
      });
      
      // Performance should remain consistent regardless of history size
      // (since history is bounded)
      const maxTiming = Math.max(...timings);
      expect(maxTiming).toBeLessThan(10); // Should stay under 10ms
    });
  });

  describe('Resource Utilization Tests', () => {
    it('should efficiently use CPU during intensive calculations', () => {
      const strategy = new TradingStrategy(config);
      const profitCalculator = new ProfitCalculator(100000);
      
      // Build substantial history
      for (let i = 0; i < 100; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }
      
      // Add many positions
      for (let i = 0; i < 100; i++) {
        profitCalculator.addPosition(`pos_${i}`, {
          side: i % 2 === 0 ? 'buy' : 'sell',
          amount: 0.001 + Math.random() * 0.009,
          price: 5000000 + Math.random() * 100000,
          timestamp: Date.now(),
        });
      }
      
      const startTime = process.hrtime.bigint();
      
      // Perform intensive operations
      for (let i = 0; i < 1000; i++) {
        const ticker = createTicker(5000000 + i * 100);
        strategy.generateSignal(ticker);
        profitCalculator.calculateProfitMetrics();
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      expect(durationMs).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain stable performance under load', () => {
      const strategy = new TradingStrategy(config);
      const measurements: number[] = [];
      const batchSize = 100;
      const batches = 10;
      
      // Build initial history
      for (let i = 0; i < 20; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }
      
      for (let batch = 0; batch < batches; batch++) {
        const batchStartTime = process.hrtime.bigint();
        
        for (let i = 0; i < batchSize; i++) {
          const ticker = createTicker(5000000 + (batch * batchSize + i) * 100);
          strategy.generateSignal(ticker);
        }
        
        const batchEndTime = process.hrtime.bigint();
        const batchDurationMs = Number(batchEndTime - batchStartTime) / 1000000;
        measurements.push(batchDurationMs);
      }
      
      // Performance should be stable across batches
      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxDeviation = Math.max(...measurements.map(m => Math.abs(m - avgDuration)));
      
      expect(maxDeviation / avgDuration).toBeLessThan(0.5); // Deviation should be less than 50%
    });
  });

  describe('Long-Running Operation Tests', () => {
    it('should maintain performance during extended operation', async () => {
      const strategy = new TradingStrategy(config);
      const duration = 5000; // 5 seconds
      const interval = 10; // Every 10ms
      
      const measurements: number[] = [];
      const startTime = Date.now();
      
      while (Date.now() - startTime < duration) {
        const iterationStart = process.hrtime.bigint();
        
        const price = 5000000 + Math.sin((Date.now() - startTime) / 1000) * 100000;
        strategy.updatePrice(price);
        
        const ticker = createTicker(price);
        strategy.generateSignal(ticker);
        
        const iterationEnd = process.hrtime.bigint();
        const iterationDuration = Number(iterationEnd - iterationStart) / 1000000;
        measurements.push(iterationDuration);
        
        await new Promise(resolve => setTimeout(resolve, interval));
      }
      
      // Performance should remain stable over time
      const firstHalf = measurements.slice(0, measurements.length / 2);
      const secondHalf = measurements.slice(measurements.length / 2);
      
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      expect(Math.abs(secondHalfAvg - firstHalfAvg) / firstHalfAvg).toBeLessThan(0.3); // Less than 30% degradation
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle errors efficiently without performance impact', () => {
      const strategy = new TradingStrategy(config);
      
      // Build normal history
      for (let i = 0; i < 20; i++) {
        strategy.updatePrice(5000000 + i * 1000);
      }
      
      const startTime = process.hrtime.bigint();
      
      // Mix normal operations with error conditions
      for (let i = 0; i < 1000; i++) {
        try {
          if (i % 10 === 0) {
            // Simulate error conditions
            const invalidTicker = createTicker(NaN);
            strategy.generateSignal(invalidTicker);
          } else {
            // Normal operation
            const ticker = createTicker(5000000 + i * 100);
            strategy.generateSignal(ticker);
          }
        } catch (error) {
          // Errors should be handled gracefully
        }
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      expect(durationMs).toBeLessThan(1000); // Should complete within 1 second despite errors
    });
  });
});