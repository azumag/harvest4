import { ParameterOptimizer } from '../optimization/parameter-optimizer';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import {
  BacktestConfig,
  HistoricalDataPoint,
  OptimizationConfig,
  WalkForwardConfig
} from '../types/backtest';

describe('ParameterOptimizer', () => {
  let optimizer: ParameterOptimizer;
  let backtestConfig: BacktestConfig;
  let baseStrategy: TradingStrategyConfig;
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

    baseStrategy = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8
    };

    testData = Array.from({ length: 50 }, (_, i) => ({
      timestamp: Date.now() - (50 - i) * 60 * 1000,
      open: 5000000 + Math.sin(i * 0.1) * 50000,
      high: 5000000 + Math.sin(i * 0.1) * 50000 + 10000,
      low: 5000000 + Math.sin(i * 0.1) * 50000 - 10000,
      close: 5000000 + Math.sin(i * 0.1) * 50000 + Math.random() * 20000 - 10000,
      volume: 1000 + Math.random() * 500
    }));

    optimizer = new ParameterOptimizer(testData, backtestConfig);
  });

  describe('gridSearchOptimization', () => {
    it('should perform grid search optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 },
          { name: 'sellThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBe(3 * 3); // 3 values for each parameter

      results.forEach(result => {
        expect(result).toHaveProperty('parameters');
        expect(result).toHaveProperty('fitness');
        expect(result).toHaveProperty('backtest');
        expect(result).toHaveProperty('metrics');

        expect(result.parameters).toHaveProperty('buyThreshold');
        expect(result.parameters).toHaveProperty('sellThreshold');
        expect(result.parameters['buyThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['buyThreshold']).toBeLessThanOrEqual(0.03);
        expect(result.parameters['sellThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['sellThreshold']).toBeLessThanOrEqual(0.03);

        expect(result.fitness).toBeGreaterThan(-Infinity);
        expect(result.metrics).toHaveProperty('return');
        expect(result.metrics).toHaveProperty('sharpeRatio');
        expect(result.metrics).toHaveProperty('maxDrawdown');
        expect(result.metrics).toHaveProperty('winRate');
        expect(result.metrics).toHaveProperty('profitFactor');
        expect(result.metrics).toHaveProperty('calmarRatio');
      });

      // Results should be sorted by fitness (best first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]?.fitness ?? 0).toBeGreaterThanOrEqual(results[i]?.fitness ?? 0);
      }
    });

    it('should handle single parameter optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.02, step: 0.005 }
        ],
        fitnessFunction: 'sharpe'
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(3); // (0.02 - 0.01) / 0.005 + 1

      results.forEach(result => {
        expect(result.parameters).toHaveProperty('buyThreshold');
        expect(result.parameters['buyThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['buyThreshold']).toBeLessThanOrEqual(0.02);
      });
    });

    it('should handle different fitness functions', async () => {
      const fitnessOptions = ['return', 'sharpe', 'calmar', 'profit_factor', 'composite'];

      for (const fitness of fitnessOptions) {
        const optimizationConfig: OptimizationConfig = {
          method: 'grid',
          parameters: [
            { name: 'buyThreshold', min: 0.01, max: 0.02, step: 0.01 }
          ],
          fitnessFunction: fitness as any
        };

        const results = await optimizer.optimize(baseStrategy, optimizationConfig);

        expect(results).toBeInstanceOf(Array);
        expect(results.length).toBeGreaterThan(0);
        
        results.forEach(result => {
          expect(result.fitness).toBeGreaterThan(-Infinity);
        });
      }
    });
  });

  describe('geneticAlgorithmOptimization', () => {
    it('should perform genetic algorithm optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'genetic',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.05, step: 0.001 },
          { name: 'sellThreshold', min: 0.01, max: 0.05, step: 0.001 }
        ],
        fitnessFunction: 'composite',
        maxIterations: 5,
        populationSize: 10,
        mutationRate: 0.1,
        crossoverRate: 0.8,
        eliteSize: 2
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(10); // Population size

      results.forEach(result => {
        expect(result).toHaveProperty('parameters');
        expect(result).toHaveProperty('fitness');
        expect(result).toHaveProperty('backtest');
        expect(result).toHaveProperty('metrics');

        expect(result.parameters).toHaveProperty('buyThreshold');
        expect(result.parameters).toHaveProperty('sellThreshold');
        expect(result.parameters['buyThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['buyThreshold']).toBeLessThanOrEqual(0.05);
        expect(result.parameters['sellThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['sellThreshold']).toBeLessThanOrEqual(0.05);

        expect(result.fitness).toBeGreaterThan(-Infinity);
      });

      // Results should be sorted by fitness (best first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]?.fitness ?? 0).toBeGreaterThanOrEqual(results[i]?.fitness ?? 0);
      }
    });

    it('should handle convergence', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'genetic',
        parameters: [
          { name: 'buyThreshold', min: 0.02, max: 0.021, step: 0.0001 } // Very narrow range
        ],
        fitnessFunction: 'return',
        maxIterations: 20,
        populationSize: 5,
        convergenceThreshold: 0.001
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(5); // Population size

      // Should converge quickly due to narrow parameter range
      const fitnessValues = results.map(r => r.fitness);
      const maxFitness = Math.max(...fitnessValues);
      const minFitness = Math.min(...fitnessValues);
      const fitnessRange = maxFitness - minFitness;

      expect(fitnessRange).toBeLessThan(1); // Should converge to similar fitness values
    });

    it('should handle multiple parameters', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'genetic',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.05, step: 0.001 },
          { name: 'sellThreshold', min: 0.01, max: 0.05, step: 0.001 },
          { name: 'minProfitMargin', min: 0.005, max: 0.02, step: 0.001 },
          { name: 'riskTolerance', min: 0.5, max: 1.0, step: 0.1 }
        ],
        fitnessFunction: 'composite',
        maxIterations: 3,
        populationSize: 8
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(8);

      results.forEach(result => {
        expect(result.parameters).toHaveProperty('buyThreshold');
        expect(result.parameters).toHaveProperty('sellThreshold');
        expect(result.parameters).toHaveProperty('minProfitMargin');
        expect(result.parameters).toHaveProperty('riskTolerance');

        expect(result.parameters['buyThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['buyThreshold']).toBeLessThanOrEqual(0.05);
        expect(result.parameters['sellThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['sellThreshold']).toBeLessThanOrEqual(0.05);
        expect(result.parameters['minProfitMargin']).toBeGreaterThanOrEqual(0.005);
        expect(result.parameters['minProfitMargin']).toBeLessThanOrEqual(0.02);
        expect(result.parameters['riskTolerance']).toBeGreaterThanOrEqual(0.5);
        expect(result.parameters['riskTolerance']).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe('randomSearchOptimization', () => {
    it('should perform random search optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'random',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.05, step: 0.001 },
          { name: 'sellThreshold', min: 0.01, max: 0.05, step: 0.001 }
        ],
        fitnessFunction: 'return',
        maxIterations: 10
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(10);

      results.forEach(result => {
        expect(result).toHaveProperty('parameters');
        expect(result).toHaveProperty('fitness');
        expect(result).toHaveProperty('backtest');
        expect(result).toHaveProperty('metrics');

        expect(result.parameters).toHaveProperty('buyThreshold');
        expect(result.parameters).toHaveProperty('sellThreshold');
        expect(result.parameters['buyThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['buyThreshold']).toBeLessThanOrEqual(0.05);
        expect(result.parameters['sellThreshold']).toBeGreaterThanOrEqual(0.01);
        expect(result.parameters['sellThreshold']).toBeLessThanOrEqual(0.05);
      });

      // Results should be sorted by fitness (best first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]?.fitness ?? 0).toBeGreaterThanOrEqual(results[i]?.fitness ?? 0);
      }
    });

    it('should generate diverse parameter combinations', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'random',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.05, step: 0.001 }
        ],
        fitnessFunction: 'return',
        maxIterations: 20
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);

      const thresholdValues = results.map(r => r.parameters['buyThreshold']);
      const uniqueValues = [...new Set(thresholdValues)];

      // Should generate diverse parameter values
      expect(uniqueValues.length).toBeGreaterThan(10);
    });
  });

  describe('walkForwardAnalysis', () => {
    it('should perform walk-forward analysis', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return',
        maxIterations: 5
      };

      const walkForwardConfig: WalkForwardConfig = {
        windowSize: 30,
        stepSize: 10,
        minPeriods: 15,
        optimizationPeriods: 20,
        testPeriods: 10
      };

      const result = await optimizer.walkForwardAnalysis(
        baseStrategy,
        optimizationConfig,
        walkForwardConfig
      );

      expect(result).toHaveProperty('segments');
      expect(result).toHaveProperty('overallMetrics');
      expect(result).toHaveProperty('stability');
      expect(result).toHaveProperty('robustness');

      expect(result.segments).toBeInstanceOf(Array);
      expect(result.segments.length).toBeGreaterThan(0);

      result.segments.forEach(segment => {
        expect(segment).toHaveProperty('startDate');
        expect(segment).toHaveProperty('endDate');
        expect(segment).toHaveProperty('optimizationPeriod');
        expect(segment).toHaveProperty('testPeriod');
        expect(segment).toHaveProperty('bestParameters');
        expect(segment).toHaveProperty('inSampleResult');
        expect(segment).toHaveProperty('outOfSampleResult');
        expect(segment).toHaveProperty('degradation');

        expect(segment.optimizationPeriod).toHaveLength(2);
        expect(segment.testPeriod).toHaveLength(2);
        expect(segment.bestParameters).toHaveProperty('buyThreshold');
        expect(segment.inSampleResult).toHaveProperty('totalReturnPercent');
        expect(segment.outOfSampleResult).toHaveProperty('totalReturnPercent');
        expect(segment.degradation).toBeGreaterThan(-1000); // Reasonable degradation range
        expect(segment.degradation).toBeLessThan(1000);
      });

      expect(result.overallMetrics).toHaveProperty('totalReturn');
      expect(result.overallMetrics).toHaveProperty('sharpeRatio');
      expect(result.overallMetrics).toHaveProperty('maxDrawdown');

      expect(result.stability).toHaveProperty('parameterStability');
      expect(result.stability).toHaveProperty('performanceStability');
      expect(result.stability).toHaveProperty('consistencyScore');
      expect(result.stability.parameterStability).toBeGreaterThanOrEqual(0);
      expect(result.stability.parameterStability).toBeLessThanOrEqual(1);
      expect(result.stability.performanceStability).toBeGreaterThanOrEqual(0);
      expect(result.stability.performanceStability).toBeLessThanOrEqual(1);
      expect(result.stability.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(result.stability.consistencyScore).toBeLessThanOrEqual(1);

      expect(result.robustness).toHaveProperty('overfittingIndex');
      expect(result.robustness).toHaveProperty('robustnessScore');
      expect(result.robustness.overfittingIndex).toBeGreaterThanOrEqual(0);
      expect(result.robustness.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(result.robustness.robustnessScore).toBeLessThanOrEqual(1);
    });

    it('should handle insufficient data', async () => {
      const shortData = testData.slice(0, 10); // Very short data
      const shortOptimizer = new ParameterOptimizer(shortData, backtestConfig);

      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const walkForwardConfig: WalkForwardConfig = {
        windowSize: 20,
        stepSize: 5,
        minPeriods: 10,
        optimizationPeriods: 15,
        testPeriods: 5
      };

      const result = await shortOptimizer.walkForwardAnalysis(
        baseStrategy,
        optimizationConfig,
        walkForwardConfig
      );

      expect(result).toHaveProperty('segments');
      expect(result.segments).toBeInstanceOf(Array);
      // Should handle insufficient data gracefully
    });
  });

  describe('overfitting detection', () => {
    it('should detect overfitting', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const optimizationResults = await optimizer.optimize(baseStrategy, optimizationConfig);
      const validationData = testData.slice(0, 25); // Use first half for validation

      const overfittingAnalysis = optimizer.detectOverfitting(
        optimizationResults,
        validationData
      );

      expect(overfittingAnalysis).toHaveProperty('overfittingScore');
      expect(overfittingAnalysis).toHaveProperty('avgDegradation');
      expect(overfittingAnalysis).toHaveProperty('correlations');
      expect(overfittingAnalysis).toHaveProperty('degradations');
      expect(overfittingAnalysis).toHaveProperty('recommendation');

      expect(overfittingAnalysis.overfittingScore).toBeGreaterThanOrEqual(0);
      expect(overfittingAnalysis.overfittingScore).toBeLessThanOrEqual(1);
      expect(overfittingAnalysis.correlations).toBeInstanceOf(Array);
      expect(overfittingAnalysis.degradations).toBeInstanceOf(Array);
      expect(overfittingAnalysis.recommendation).toMatch(/overfitting/i);
    });
  });

  describe('error handling', () => {
    it('should handle invalid optimization method', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'invalid' as any,
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      await expect(optimizer.optimize(baseStrategy, optimizationConfig))
        .rejects
        .toThrow('Unsupported optimization method: invalid');
    });

    it('should handle empty parameter list', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [],
        fitnessFunction: 'return'
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1); // Should return single result with no parameters to optimize
    });

    it('should handle invalid parameter ranges', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.05, max: 0.01, step: 0.01 } // Invalid range (min > max)
        ],
        fitnessFunction: 'return'
      };

      const results = await optimizer.optimize(baseStrategy, optimizationConfig);
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0); // Should return empty results for invalid range
    });
  });

  describe('performance', () => {
    it('should complete optimization in reasonable time', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const startTime = Date.now();
      const results = await optimizer.optimize(baseStrategy, optimizationConfig);
      const endTime = Date.now();

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    it('should handle large parameter spaces efficiently', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'random',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.1, step: 0.001 },
          { name: 'sellThreshold', min: 0.01, max: 0.1, step: 0.001 }
        ],
        fitnessFunction: 'return',
        maxIterations: 20 // Limit iterations for performance
      };

      const startTime = Date.now();
      const results = await optimizer.optimize(baseStrategy, optimizationConfig);
      const endTime = Date.now();

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(20);
      expect(endTime - startTime).toBeLessThan(60000); // Should complete within 60 seconds
    });
  });
});