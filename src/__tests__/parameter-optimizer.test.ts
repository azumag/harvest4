import { ParameterOptimizer } from '../optimization/parameter-optimizer';
import { 
  BacktestConfig, 
  OptimizationConfig, 
  HistoricalCandle,
  OptimizationResult 
} from '../types/backtest';
import { TradingStrategyConfig } from '../strategies/trading-strategy';

describe('ParameterOptimizer', () => {
  let optimizer: ParameterOptimizer;
  let backtestConfig: BacktestConfig;
  let mockHistoricalData: HistoricalCandle[];

  beforeEach(() => {
    optimizer = new ParameterOptimizer();

    backtestConfig = {
      startDate: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      endDate: Date.now(),
      initialBalance: 100000,
      pair: 'btc_jpy',
      timeframe: '1m',
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0
    };

    mockHistoricalData = generateMockData(100, 4000000);
  });

  describe('optimizeParameters', () => {
    it('should run grid search optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.02, 0.03],
          sellThreshold: [0.01, 0.02, 0.03],
          riskTolerance: [0.7, 0.8, 0.9]
        },
        metric: 'sharpeRatio',
        direction: 'maximize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.bestParameters).toBeDefined();
      expect(result.bestScore).toBeDefined();
      expect(result.allResults).toBeDefined();
      expect(result.allResults.length).toBeGreaterThan(0);
      expect(result.overfittingScore).toBeGreaterThanOrEqual(0);
      expect(result.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(result.robustnessScore).toBeLessThanOrEqual(1);

      // Check that best parameters are from the parameter space
      expect(optimizationConfig.parameters.buyThreshold).toContain(result.bestParameters.buyThreshold);
      expect(optimizationConfig.parameters.sellThreshold).toContain(result.bestParameters.sellThreshold);
      expect(optimizationConfig.parameters.riskTolerance).toContain(result.bestParameters.riskTolerance);
    }, 30000); // Increase timeout for optimization

    it('should run genetic algorithm optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.015, 0.02, 0.025, 0.03],
          sellThreshold: [0.01, 0.015, 0.02, 0.025, 0.03],
          riskTolerance: [0.6, 0.7, 0.8, 0.9]
        },
        metric: 'totalReturn',
        direction: 'maximize',
        genetic: {
          enabled: true,
          populationSize: 10,
          generations: 5,
          mutationRate: 0.1,
          crossoverRate: 0.8
        }
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.convergence).toBeDefined();
      expect(result.convergence.length).toBe(5); // 5 generations
      expect(result.allResults.length).toBeGreaterThan(0);

      // Genetic algorithm should explore the parameter space
      expect(result.bestParameters).toBeDefined();
      expect(typeof result.bestScore).toBe('number');
      expect(isFinite(result.bestScore)).toBe(true);
    }, 45000); // Longer timeout for genetic algorithm

    it('should handle minimize direction', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.02],
          sellThreshold: [0.01, 0.02]
        },
        metric: 'maxDrawdown',
        direction: 'minimize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.bestScore).toBeGreaterThanOrEqual(0); // Drawdown should be positive
      
      // Results should be sorted in ascending order for minimize
      for (let i = 1; i < result.allResults.length; i++) {
        expect(result.allResults[i].score).toBeGreaterThanOrEqual(result.allResults[i - 1].score);
      }
    }, 20000);

    it('should calculate overfitting score', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04], // Many parameters
          sellThreshold: [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04]
        },
        metric: 'sharpeRatio',
        direction: 'maximize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result.overfittingScore).toBeGreaterThanOrEqual(0);
      expect(typeof result.overfittingScore).toBe('number');
      expect(isFinite(result.overfittingScore)).toBe(true);
    }, 30000);

    it('should calculate robustness score', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.015, 0.02, 0.025, 0.03],
          sellThreshold: [0.01, 0.015, 0.02, 0.025, 0.03],
          riskTolerance: [0.7, 0.8, 0.9]
        },
        metric: 'sharpeRatio',
        direction: 'maximize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(result.robustnessScore).toBeLessThanOrEqual(1);
      expect(typeof result.robustnessScore).toBe('number');
      expect(isFinite(result.robustnessScore)).toBe(true);
    }, 25000);
  });

  describe('walk-forward analysis', () => {
    it('should run walk-forward analysis when enabled', async () => {
      // Create longer historical data for walk-forward
      const longerData = generateMockData(500, 4000000); // 500 periods

      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.02],
          sellThreshold: [0.01, 0.02]
        },
        metric: 'totalReturn',
        direction: 'maximize',
        walkForward: {
          enabled: true,
          trainingPeriod: 0.6, // 60% for training
          testingPeriod: 0.2,  // 20% for testing
          reoptimizationFrequency: 0.3 // Reoptimize every 30% of data
        }
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        longerData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.bestParameters).toBeDefined();
      
      // Walk-forward should produce results
      expect(result.allResults.length).toBeGreaterThan(0);
    }, 60000); // Very long timeout for walk-forward analysis
  });

  describe('genetic algorithm components', () => {
    it('should handle small population size', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.02, 0.03],
          sellThreshold: [0.01, 0.02, 0.03]
        },
        metric: 'winRate',
        direction: 'maximize',
        genetic: {
          enabled: true,
          populationSize: 3, // Very small population
          generations: 3,
          mutationRate: 0.2,
          crossoverRate: 0.6
        }
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.convergence.length).toBe(3);
    }, 20000);

    it('should handle high mutation rate', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.02, 0.03, 0.04],
          sellThreshold: [0.01, 0.02, 0.03, 0.04]
        },
        metric: 'totalReturn',
        direction: 'maximize',
        genetic: {
          enabled: true,
          populationSize: 8,
          generations: 3,
          mutationRate: 0.8, // High mutation rate
          crossoverRate: 0.5
        }
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.bestParameters).toBeDefined();
    }, 25000);
  });

  describe('edge cases', () => {
    it('should handle single parameter value', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.02], // Single value
          sellThreshold: [0.02]  // Single value
        },
        metric: 'sharpeRatio',
        direction: 'maximize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.allResults.length).toBe(1);
      expect(result.bestParameters.buyThreshold).toBe(0.02);
      expect(result.bestParameters.sellThreshold).toBe(0.02);
    }, 10000);

    it('should handle invalid backtest results gracefully', async () => {
      // Use very short data that might cause backtest failures
      const shortData = generateMockData(3, 4000000);

      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.001, 0.002], // Very small thresholds
          sellThreshold: [0.001, 0.002]
        },
        metric: 'sharpeRatio',
        direction: 'maximize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        shortData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      // Some combinations might fail, but should still return results
      expect(result.allResults.length).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should handle empty parameter space', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {}, // Empty parameters
        metric: 'sharpeRatio',
        direction: 'maximize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      expect(result).toBeDefined();
      expect(result.allResults.length).toBeGreaterThanOrEqual(0);
    }, 10000);
  });

  describe('performance', () => {
    it('should complete small optimization in reasonable time', async () => {
      const startTime = Date.now();

      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.02],
          sellThreshold: [0.01, 0.02]
        },
        metric: 'totalReturn',
        direction: 'maximize'
      };

      const result = await optimizer.optimizeParameters(
        backtestConfig,
        mockHistoricalData,
        optimizationConfig
      );

      const duration = Date.now() - startTime;
      
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
    }, 20000);
  });
});

// Helper function to generate mock data
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
    const trend = (Math.random() - 0.5) * 0.001; // Small trend component
    const noise = (Math.random() - 0.5) * volatility;
    
    const priceChange = currentPrice * (trend + noise);
    const open = currentPrice;
    const close = currentPrice + priceChange;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
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