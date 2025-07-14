import { BacktestOrchestrator, BacktestOrchestatorConfig } from '../backtest/backtest-orchestrator';
import { OptimizationConfig } from '../types/backtest';

describe('BacktestOrchestrator', () => {
  let orchestrator: BacktestOrchestrator;
  let config: BacktestOrchestatorConfig;

  beforeEach(() => {
    config = {
      bitbankConfig: {
        apiKey: 'test_key',
        apiSecret: 'test_secret',
        baseUrl: 'https://api.bitbank.cc'
      },
      dataDirectory: './test-data',
      pair: 'btc_jpy',
      timeframe: '1m',
      startDate: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      endDate: Date.now(),
      initialBalance: 100000,
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0
    };

    orchestrator = new BacktestOrchestrator(config);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getConfig()).toEqual(config);
    });

    it('should initialize data manager', () => {
      const dataManager = orchestrator.getDataManager();
      expect(dataManager).toBeDefined();
    });
  });

  describe('runSimpleBacktest', () => {
    it('should run a simple backtest', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const result = await orchestrator.runSimpleBacktest(strategyConfig);
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
      expect(result.totalReturn).toBeDefined();
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.sharpeRatio).toBeDefined();
      expect(Array.isArray(result.trades)).toBe(true);
    });

    it('should handle different strategy configurations', async () => {
      const aggressiveConfig = {
        buyThreshold: 0.005,
        sellThreshold: 0.005,
        minProfitMargin: 0.002,
        maxTradeAmount: 20000,
        riskTolerance: 0.9
      };

      const result = await orchestrator.runSimpleBacktest(aggressiveConfig);
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runComprehensiveBacktest', () => {
    it('should run a comprehensive backtest', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const report = await orchestrator.runComprehensiveBacktest(strategyConfig);
      
      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.marketConditions).toBeDefined();
      expect(Array.isArray(report.monthlyReturns)).toBe(true);
      expect(Array.isArray(report.yearlyReturns)).toBe(true);
      expect(Array.isArray(report.drawdownPeriods)).toBe(true);
      expect(report.tradeDistribution).toBeDefined();
      expect(report.riskMetrics).toBeDefined();
    });
  });

  describe('optimizeParameters', () => {
    it('should optimize parameters', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.03, step: 0.01 },
          sellThreshold: { min: 0.01, max: 0.03, step: 0.01 }
        },
        objective: 'profit'
      };

      const results = await orchestrator.optimizeParameters(optimizationConfig);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check that results are sorted by score
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i-1].score);
      }
    });
  });

  describe('runGeneticOptimization', () => {
    it('should run genetic optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.05, step: 0.005 },
          sellThreshold: { min: 0.01, max: 0.05, step: 0.005 }
        },
        objective: 'profit',
        populationSize: 5,
        generations: 2
      };

      const results = await orchestrator.runGeneticOptimization(optimizationConfig);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('runWalkForwardAnalysis', () => {
    it('should run walk-forward analysis', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.03, step: 0.01 }
        },
        objective: 'profit'
      };

      const results = await orchestrator.runWalkForwardAnalysis(optimizationConfig, 3, 1);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      results.forEach(result => {
        expect(result.inSamplePeriod).toBeDefined();
        expect(result.outSamplePeriod).toBeDefined();
        expect(result.inSampleResult).toBeDefined();
        expect(result.outSampleResult).toBeDefined();
        expect(result.parameters).toBeDefined();
        expect(result.degradation).toBeDefined();
      });
    });
  });

  describe('compareStrategies', () => {
    it('should compare default strategies', async () => {
      const results = await orchestrator.compareStrategies();
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check that results are ranked
      for (let i = 0; i < results.length; i++) {
        expect(results[i].rank).toBe(i + 1);
      }
      
      // Check result structure
      results.forEach(result => {
        expect(result.name).toBeDefined();
        expect(result.result).toBeDefined();
        expect(result.metrics).toBeDefined();
        expect(result.score).toBeDefined();
      });
    });

    it('should compare custom strategies', async () => {
      const customStrategies = [
        {
          name: 'Conservative Test',
          config: {
            buyThreshold: 0.01,
            sellThreshold: 0.01,
            minProfitMargin: 0.02,
            maxTradeAmount: 5000,
            riskTolerance: 0.5
          },
          description: 'Conservative test strategy'
        },
        {
          name: 'Aggressive Test',
          config: {
            buyThreshold: 0.05,
            sellThreshold: 0.05,
            minProfitMargin: 0.005,
            maxTradeAmount: 20000,
            riskTolerance: 0.9
          },
          description: 'Aggressive test strategy'
        }
      ];

      const results = await orchestrator.compareStrategies(customStrategies);
      
      expect(results).toBeDefined();
      expect(results.length).toBe(2);
      expect(results[0].name).toBe('Conservative Test');
      expect(results[1].name).toBe('Aggressive Test');
    });
  });

  describe('compareToBenchmark', () => {
    it('should compare strategy to buy-and-hold benchmark', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const comparison = await orchestrator.compareToBenchmark(strategyConfig);
      
      expect(comparison).toBeDefined();
      expect(comparison.strategy).toBeDefined();
      expect(comparison.buyAndHold).toBeDefined();
      expect(comparison.outperformance).toBeDefined();
      expect(comparison.riskAdjustedOutperformance).toBeDefined();
      expect(typeof comparison.outperformance).toBe('number');
      expect(typeof comparison.riskAdjustedOutperformance).toBe('number');
    });
  });

  describe('runFullAnalysis', () => {
    it('should run full analysis', async () => {
      const baseStrategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.03, step: 0.01 },
          sellThreshold: { min: 0.01, max: 0.03, step: 0.01 }
        },
        objective: 'profit'
      };

      const analysis = await orchestrator.runFullAnalysis(baseStrategyConfig, optimizationConfig);
      
      expect(analysis).toBeDefined();
      expect(analysis.originalBacktest).toBeDefined();
      expect(analysis.optimizedParameters).toBeDefined();
      expect(analysis.optimizedBacktest).toBeDefined();
      expect(analysis.walkForwardResults).toBeDefined();
      expect(analysis.benchmarkComparison).toBeDefined();
      expect(analysis.robustnessTest).toBeDefined();
    });
  });

  describe('updateHistoricalData', () => {
    it('should update historical data', async () => {
      await expect(orchestrator.updateHistoricalData()).resolves.not.toThrow();
    });
  });

  describe('analyzeDataQuality', () => {
    it('should analyze data quality', async () => {
      const quality = await orchestrator.analyzeDataQuality();
      
      expect(quality).toBeDefined();
      expect(quality.totalPoints).toBeDefined();
      expect(quality.missingPoints).toBeDefined();
      expect(quality.qualityScore).toBeDefined();
      expect(quality.qualityScore).toBeGreaterThanOrEqual(0);
      expect(quality.qualityScore).toBeLessThanOrEqual(1);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const report = await orchestrator.generateReport(strategyConfig);
      
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report).toContain('COMPREHENSIVE BACKTEST REPORT');
      expect(report).toContain('CONFIGURATION');
      expect(report).toContain('DATA QUALITY');
      expect(report).toContain('BACKTEST RESULTS');
      expect(report).toContain('BENCHMARK COMPARISON');
    });

    it('should generate report with optimization', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const report = await orchestrator.generateReport(strategyConfig, true);
      
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report).toContain('OPTIMIZATION RESULTS');
    });
  });

  describe('error handling', () => {
    it('should handle invalid strategy config', async () => {
      const invalidConfig = {
        buyThreshold: -0.01, // Invalid negative threshold
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      await expect(orchestrator.runSimpleBacktest(invalidConfig)).resolves.toBeDefined();
    });

    it('should handle invalid optimization config', async () => {
      const invalidOptimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.05, max: 0.01, step: 0.01 } // Invalid: min > max
        },
        objective: 'profit'
      };

      const results = await orchestrator.optimizeParameters(invalidOptimizationConfig);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should handle different timeframes', async () => {
      const fiveMinConfig = {
        ...config,
        timeframe: '5m'
      };

      const fiveMinOrchestrator = new BacktestOrchestrator(fiveMinConfig);
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const result = await fiveMinOrchestrator.runSimpleBacktest(strategyConfig);
      
      expect(result).toBeDefined();
    });

    it('should handle different pairs', async () => {
      const ethConfig = {
        ...config,
        pair: 'eth_jpy'
      };

      const ethOrchestrator = new BacktestOrchestrator(ethConfig);
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const result = await ethOrchestrator.runSimpleBacktest(strategyConfig);
      
      expect(result).toBeDefined();
    });

    it('should handle different commission rates', async () => {
      const highCommissionConfig = {
        ...config,
        commission: 0.01 // 1% commission
      };

      const highCommissionOrchestrator = new BacktestOrchestrator(highCommissionConfig);
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const result = await highCommissionOrchestrator.runSimpleBacktest(strategyConfig);
      
      expect(result).toBeDefined();
    });
  });
});