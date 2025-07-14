import { ParameterOptimizer } from '../optimization/parameter-optimizer';
import { HistoricalDataManager } from '../data/historical-data-manager';
import { BacktestConfig, OptimizationConfig } from '../types/backtest';
import { BitbankConfig } from '../types/bitbank';

describe('ParameterOptimizer', () => {
  let optimizer: ParameterOptimizer;
  let dataManager: HistoricalDataManager;
  let backtestConfig: BacktestConfig;

  beforeEach(() => {
    const bitbankConfig: BitbankConfig = {
      apiKey: 'test_key',
      apiSecret: 'test_secret',
      baseUrl: 'https://api.bitbank.cc'
    };

    dataManager = new HistoricalDataManager(bitbankConfig, './test-data');
    
    backtestConfig = {
      startDate: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      endDate: Date.now(),
      initialBalance: 100000,
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0,
      strategy: null
    };

    optimizer = new ParameterOptimizer(dataManager, backtestConfig);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(optimizer).toBeDefined();
    });
  });

  describe('gridSearchOptimization', () => {
    it('should perform grid search optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.03, step: 0.01 },
          sellThreshold: { min: 0.01, max: 0.03, step: 0.01 }
        },
        objective: 'profit'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check that results are sorted by score
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i-1].score);
      }
      
      // Check result structure
      results.forEach(result => {
        expect(result.parameters).toBeDefined();
        expect(result.result).toBeDefined();
        expect(result.score).toBeDefined();
        expect(typeof result.score).toBe('number');
      });
    });

    it('should handle different objectives', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.02, step: 0.01 }
        },
        objective: 'sharpe'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle single parameter optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          riskTolerance: { min: 0.5, max: 0.9, step: 0.2 }
        },
        objective: 'profit'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('geneticOptimization', () => {
    it('should perform genetic optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.05, step: 0.005 },
          sellThreshold: { min: 0.01, max: 0.05, step: 0.005 }
        },
        objective: 'profit',
        populationSize: 10,
        generations: 3
      };

      const results = await optimizer.geneticOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10);
      
      // Check that results are sorted by score
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i-1].score);
      }
    });

    it('should handle custom population size and generations', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.03, step: 0.01 }
        },
        objective: 'profit',
        populationSize: 5,
        generations: 2
      };

      const results = await optimizer.geneticOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('walkForwardOptimization', () => {
    it('should perform walk-forward optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.03, step: 0.01 },
          sellThreshold: { min: 0.01, max: 0.03, step: 0.01 }
        },
        objective: 'profit'
      };

      const results = await optimizer.walkForwardOptimization(
        'btc_jpy',
        optimizationConfig,
        3, // 3 months in-sample
        1, // 1 month out-of-sample
        '1m'
      );
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      results.forEach(result => {
        expect(result.inSamplePeriod).toBeDefined();
        expect(result.outSamplePeriod).toBeDefined();
        expect(result.inSampleResult).toBeDefined();
        expect(result.outSampleResult).toBeDefined();
        expect(result.parameters).toBeDefined();
        expect(result.degradation).toBeDefined();
        expect(typeof result.degradation).toBe('number');
      });
    });

    it('should handle different period sizes', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.02, step: 0.01 }
        },
        objective: 'profit'
      };

      const results = await optimizer.walkForwardOptimization(
        'btc_jpy',
        optimizationConfig,
        1, // 1 month in-sample
        1, // 1 month out-of-sample
        '1m'
      );
      
      expect(results).toBeDefined();
    });
  });

  describe('detectOverfitting', () => {
    it('should detect overfitting indicators', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.05, step: 0.005 }
        },
        objective: 'profit'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      const overfittingTest = optimizer.detectOverfitting(results);
      
      expect(overfittingTest).toBeDefined();
      expect(overfittingTest.isOverfitted).toBeDefined();
      expect(typeof overfittingTest.isOverfitted).toBe('boolean');
      expect(overfittingTest.confidence).toBeDefined();
      expect(overfittingTest.confidence).toBeGreaterThanOrEqual(0);
      expect(overfittingTest.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(overfittingTest.indicators)).toBe(true);
    });

    it('should handle insufficient data', () => {
      const overfittingTest = optimizer.detectOverfitting([]);
      
      expect(overfittingTest.isOverfitted).toBe(false);
      expect(overfittingTest.confidence).toBe(0);
      expect(overfittingTest.indicators).toContain('Insufficient data');
    });
  });

  describe('robustnessTest', () => {
    it('should test parameter robustness', async () => {
      const parameters = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        riskTolerance: 0.8
      };

      const robustnessTest = await optimizer.robustnessTest('btc_jpy', parameters, 0.1, '1m');
      
      expect(robustnessTest).toBeDefined();
      expect(robustnessTest.originalScore).toBeDefined();
      expect(typeof robustnessTest.originalScore).toBe('number');
      expect(Array.isArray(robustnessTest.perturbedScores)).toBe(true);
      expect(robustnessTest.perturbedScores.length).toBeGreaterThan(0);
      expect(robustnessTest.robustnessScore).toBeDefined();
      expect(robustnessTest.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(typeof robustnessTest.isRobust).toBe('boolean');
    });

    it('should handle different perturbation levels', async () => {
      const parameters = {
        buyThreshold: 0.02,
        sellThreshold: 0.02
      };

      const robustnessTest = await optimizer.robustnessTest('btc_jpy', parameters, 0.05, '1m');
      
      expect(robustnessTest).toBeDefined();
      expect(robustnessTest.robustnessScore).toBeDefined();
    });
  });

  describe('parameter validation', () => {
    it('should handle invalid parameter ranges', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.05, max: 0.01, step: 0.01 } // Invalid: min > max
        },
        objective: 'profit'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });

    it('should handle zero step size', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.02, step: 0 } // Invalid: zero step
        },
        objective: 'profit'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
    });
  });

  describe('objective functions', () => {
    it('should handle profit objective', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.02, step: 0.01 }
        },
        objective: 'profit'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle sharpe objective', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.02, step: 0.01 }
        },
        objective: 'sharpe'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle winRate objective', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.02, step: 0.01 }
        },
        objective: 'winRate'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle drawdown objective', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.02, step: 0.01 }
        },
        objective: 'drawdown'
      };

      const results = await optimizer.gridSearchOptimization('btc_jpy', optimizationConfig, '1m');
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });
});