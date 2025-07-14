import { BacktestOrchestrator, OrchestratorConfig } from '../backtest/backtest-orchestrator';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import { OptimizationConfig } from '../types/backtest';
import { BitbankConfig } from '../types/bitbank';

describe('Backtest Integration Tests', () => {
  let orchestrator: BacktestOrchestrator;
  let config: OrchestratorConfig;
  let strategyConfig: TradingStrategyConfig;

  beforeEach(() => {
    const bitbankConfig: BitbankConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      baseUrl: 'https://api.bitbank.cc'
    };

    config = {
      bitbankConfig,
      pair: 'btc_jpy',
      timeframe: '1m',
      startDate: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      endDate: Date.now(),
      initialBalance: 100000,
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0
    };

    strategyConfig = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8
    };

    orchestrator = new BacktestOrchestrator(config);
  });

  describe('Full Analysis Workflow', () => {
    it('should run complete backtest analysis', async () => {
      const result = await orchestrator.runFullAnalysis(strategyConfig);

      // Verify main components
      expect(result).toBeDefined();
      expect(result.backtest).toBeDefined();
      expect(result.performanceReport).toBeDefined();
      expect(result.dataQuality).toBeDefined();
      expect(result.summary).toBeDefined();

      // Verify backtest results
      expect(result.backtest.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.backtest.winRate).toBeGreaterThanOrEqual(0);
      expect(result.backtest.winRate).toBeLessThanOrEqual(1);
      expect(result.backtest.equity.length).toBeGreaterThan(0);

      // Verify performance report
      expect(result.performanceReport.metrics).toBeDefined();
      expect(result.performanceReport.tradeAnalysis).toBeDefined();
      expect(result.performanceReport.marketConditions).toBeDefined();
      expect(Array.isArray(result.performanceReport.marketConditions)).toBe(true);

      // Verify data quality
      expect(result.dataQuality.totalCandles).toBeGreaterThan(0);
      expect(result.dataQuality.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.dataQuality.qualityScore).toBeLessThanOrEqual(1);

      // Verify summary analysis
      expect(result.summary.targetAnalysis).toBeDefined();
      expect(result.summary.targetAnalysis.annualReturn).toBeDefined();
      expect(result.summary.targetAnalysis.maxDrawdown).toBeDefined();
      expect(result.summary.targetAnalysis.winRate).toBeDefined();
      expect(result.summary.targetAnalysis.sharpeRatio).toBeDefined();
      expect(typeof result.summary.meetsTargets).toBe('boolean');
      expect(typeof result.summary.recommendation).toBe('string');
    }, 30000);

    it('should run analysis with optimization', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.015, 0.02, 0.025],
          sellThreshold: [0.015, 0.02, 0.025],
          riskTolerance: [0.7, 0.8, 0.9]
        },
        metric: 'sharpeRatio',
        direction: 'maximize'
      };

      const result = await orchestrator.runFullAnalysis(
        strategyConfig,
        optimizationConfig
      );

      expect(result.optimization).toBeDefined();
      expect(result.optimization!.bestParameters).toBeDefined();
      expect(result.optimization!.bestScore).toBeDefined();
      expect(result.optimization!.allResults.length).toBeGreaterThan(0);
      expect(result.optimization!.overfittingScore).toBeGreaterThanOrEqual(0);
      expect(result.optimization!.robustnessScore).toBeGreaterThanOrEqual(0);

      // The final backtest should use optimized parameters
      expect(result.backtest).toBeDefined();
    }, 60000);

    it('should run analysis with strategy comparison', async () => {
      const comparisonStrategies = [
        {
          name: 'Conservative Strategy',
          config: {
            buyThreshold: 0.01,
            sellThreshold: 0.01,
            minProfitMargin: 0.005,
            maxTradeAmount: 5000,
            riskTolerance: 0.6
          }
        },
        {
          name: 'Aggressive Strategy',
          config: {
            buyThreshold: 0.03,
            sellThreshold: 0.03,
            minProfitMargin: 0.02,
            maxTradeAmount: 20000,
            riskTolerance: 1.0
          }
        }
      ];

      const result = await orchestrator.runFullAnalysis(
        strategyConfig,
        undefined,
        comparisonStrategies
      );

      expect(result.comparison).toBeDefined();
      expect(result.comparison!.strategies.length).toBe(3); // Original + 2 comparison strategies
      expect(result.comparison!.benchmark).toBeDefined();
      expect(result.comparison!.ranking.length).toBe(3);
      expect(result.comparison!.correlation).toBeDefined();

      // Verify strategy names
      const strategyNames = result.comparison!.strategies.map(s => s.name);
      expect(strategyNames).toContain('Current Strategy');
      expect(strategyNames).toContain('Conservative Strategy');
      expect(strategyNames).toContain('Aggressive Strategy');

      // Verify benchmark
      expect(result.comparison!.benchmark.name).toBe('Buy & Hold');
    }, 45000);
  });

  describe('Individual Components', () => {
    it('should run quick backtest', async () => {
      const result = await orchestrator.runQuickBacktest(strategyConfig);

      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.equity.length).toBeGreaterThan(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    }, 15000);

    it('should optimize strategy parameters', async () => {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: [0.01, 0.02, 0.03],
          sellThreshold: [0.01, 0.02, 0.03]
        },
        metric: 'totalReturn',
        direction: 'maximize'
      };

      const result = await orchestrator.optimizeStrategyParameters(
        strategyConfig,
        optimizationConfig
      );

      expect(result.originalResult).toBeDefined();
      expect(result.optimizedResult).toBeDefined();
      expect(result.optimization).toBeDefined();
      expect(result.improvement).toBeDefined();

      expect(result.improvement.returnImprovement).toBeDefined();
      expect(result.improvement.sharpeImprovement).toBeDefined();
      expect(result.improvement.drawdownImprovement).toBeDefined();

      expect(typeof result.improvement.returnImprovement).toBe('number');
      expect(typeof result.improvement.sharpeImprovement).toBe('number');
      expect(typeof result.improvement.drawdownImprovement).toBe('number');
    }, 45000);

    it('should compare multiple strategies', async () => {
      const strategies = [
        {
          name: 'Strategy A',
          config: { ...strategyConfig, buyThreshold: 0.015, sellThreshold: 0.015 }
        },
        {
          name: 'Strategy B',
          config: { ...strategyConfig, buyThreshold: 0.025, sellThreshold: 0.025 }
        },
        {
          name: 'Strategy C',
          config: { ...strategyConfig, riskTolerance: 0.6 }
        }
      ];

      const result = await orchestrator.compareMultipleStrategies(strategies);

      expect(result.strategies.length).toBe(3);
      expect(result.benchmark).toBeDefined();
      expect(result.ranking.length).toBe(3);

      // Verify rankings are properly ordered
      for (let i = 1; i < result.ranking.length; i++) {
        expect(result.ranking[i]?.rank).toBeGreaterThan(result.ranking[i - 1]?.rank || 0);
        expect(result.ranking[i]?.score).toBeLessThanOrEqual(result.ranking[i - 1]?.score || Infinity);
      }
    }, 35000);

    it('should generate market analysis report', async () => {
      const result = await orchestrator.generateMarketAnalysisReport();

      expect(result.marketConditions).toBeDefined();
      expect(Array.isArray(result.marketConditions)).toBe(true);
      expect(result.overallMarketAssessment).toBeDefined();
      expect(typeof result.overallMarketAssessment).toBe('string');
      expect(result.tradingRecommendations).toBeDefined();
      expect(Array.isArray(result.tradingRecommendations)).toBe(true);

      if (result.marketConditions.length > 0) {
        const condition = result.marketConditions[0];
        if (condition) {
          expect(condition.period).toBeDefined();
          expect(['bull', 'bear', 'sideways']).toContain(condition.trend);
          expect(['low', 'medium', 'high']).toContain(condition.volatility);
          expect(typeof condition.recommendation).toBe('string');
        }
      }
    }, 20000);
  });

  describe('Target Achievement Analysis', () => {
    it('should correctly identify when targets are met', async () => {
      // Use a strategy configuration that's likely to meet targets
      const goodStrategyConfig = {
        ...strategyConfig,
        buyThreshold: 0.015,
        sellThreshold: 0.015,
        riskTolerance: 0.7
      };

      const result = await orchestrator.runFullAnalysis(goodStrategyConfig);

      expect(result.summary.targetAnalysis.annualReturn.target).toBe(0.15);
      expect(result.summary.targetAnalysis.maxDrawdown.target).toBe(0.10);
      expect(result.summary.targetAnalysis.winRate.target).toBe(0.55);
      expect(result.summary.targetAnalysis.sharpeRatio.target).toBe(1.5);

      // Check that actual values are reasonable
      expect(result.summary.targetAnalysis.annualReturn.actual).toBeGreaterThan(-1);
      expect(result.summary.targetAnalysis.maxDrawdown.actual).toBeGreaterThanOrEqual(0);
      expect(result.summary.targetAnalysis.winRate.actual).toBeGreaterThanOrEqual(0);
      expect(result.summary.targetAnalysis.winRate.actual).toBeLessThanOrEqual(1);

      // Each target should have a boolean 'met' field
      expect(typeof result.summary.targetAnalysis.annualReturn.met).toBe('boolean');
      expect(typeof result.summary.targetAnalysis.maxDrawdown.met).toBe('boolean');
      expect(typeof result.summary.targetAnalysis.winRate.met).toBe('boolean');
      expect(typeof result.summary.targetAnalysis.sharpeRatio.met).toBe('boolean');

      expect(typeof result.summary.meetsTargets).toBe('boolean');
      expect(result.summary.recommendation.length).toBeGreaterThan(0);
    }, 25000);

    it('should provide appropriate recommendations', async () => {
      const result = await orchestrator.runFullAnalysis(strategyConfig);

      expect(typeof result.summary.recommendation).toBe('string');
      expect(result.summary.recommendation.length).toBeGreaterThan(20);

      if (result.summary.meetsTargets) {
        expect(result.summary.recommendation).toContain('Ready for live trading');
      } else {
        expect(result.summary.recommendation).toContain('optimization');
      }
    }, 20000);
  });

  describe('Error Handling', () => {
    it('should handle invalid timeframe gracefully', async () => {
      const invalidConfig = {
        ...config,
        timeframe: 'invalid' as any
      };

      const invalidOrchestrator = new BacktestOrchestrator(invalidConfig);

      // Should either handle gracefully or throw a descriptive error
      await expect(async () => {
        await invalidOrchestrator.runQuickBacktest(strategyConfig);
      }).rejects.toThrow();
    }, 10000);

    it('should handle future dates gracefully', async () => {
      const futureConfig = {
        ...config,
        startDate: Date.now() + 24 * 60 * 60 * 1000, // Tomorrow
        endDate: Date.now() + 2 * 24 * 60 * 60 * 1000 // Day after tomorrow
      };

      const futureOrchestrator = new BacktestOrchestrator(futureConfig);

      // Should handle future dates gracefully
      const result = await futureOrchestrator.runQuickBacktest(strategyConfig);
      expect(result).toBeDefined();
    }, 15000);

    it('should handle very short time periods', async () => {
      const shortConfig = {
        ...config,
        startDate: Date.now() - 60 * 60 * 1000, // 1 hour ago
        endDate: Date.now()
      };

      const shortOrchestrator = new BacktestOrchestrator(shortConfig);
      const result = await shortOrchestrator.runQuickBacktest(strategyConfig);

      expect(result).toBeDefined();
      // May have zero trades due to short period, which is acceptable
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    }, 10000);
  });

  describe('Performance Validation', () => {
    it('should complete full analysis in reasonable time', async () => {
      const startTime = Date.now();

      const result = await orchestrator.runFullAnalysis(strategyConfig);

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    }, 35000);

    it('should handle multiple concurrent analyses', async () => {
      const promise1 = orchestrator.runQuickBacktest(strategyConfig);
      const promise2 = orchestrator.runQuickBacktest({
        ...strategyConfig,
        buyThreshold: 0.025
      });
      const promise3 = orchestrator.runQuickBacktest({
        ...strategyConfig,
        sellThreshold: 0.025
      });

      const results = await Promise.all([promise1, promise2, promise3]);

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      });
    }, 25000);
  });
});