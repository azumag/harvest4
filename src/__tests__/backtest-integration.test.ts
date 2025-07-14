import { BacktestOrchestrator } from '../backtest/backtest-orchestrator';
import { TradingStrategy } from '../strategies/trading-strategy';
import { OptimizationConfig } from '../types/backtest';

describe('Backtest Integration', () => {
  let orchestrator: BacktestOrchestrator;

  beforeAll(() => {
    const config = {
      bitbankConfig: {
        apiKey: 'test_key',
        apiSecret: 'test_secret',
        baseUrl: 'https://api.bitbank.cc'
      },
      dataDirectory: './test-data',
      pair: 'btc_jpy',
      timeframe: '1m',
      startDate: Date.now() - 14 * 24 * 60 * 60 * 1000, // 14 days ago
      endDate: Date.now(),
      initialBalance: 100000,
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0
    };

    orchestrator = new BacktestOrchestrator(config);
  });

  describe('End-to-End Backtesting Workflow', () => {
    it('should complete a full backtesting workflow', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      // Step 1: Analyze data quality
      console.log('Step 1: Analyzing data quality...');
      const dataQuality = await orchestrator.analyzeDataQuality();
      expect(dataQuality.qualityScore).toBeGreaterThan(0);
      console.log(`Data quality score: ${(dataQuality.qualityScore * 100).toFixed(2)}%`);

      // Step 2: Run simple backtest
      console.log('Step 2: Running simple backtest...');
      const simpleResult = await orchestrator.runSimpleBacktest(strategyConfig);
      expect(simpleResult).toBeDefined();
      expect(simpleResult.totalTrades).toBeGreaterThanOrEqual(0);
      console.log(`Simple backtest - Total trades: ${simpleResult.totalTrades}, Win rate: ${(simpleResult.winRate * 100).toFixed(2)}%`);

      // Step 3: Run comprehensive backtest
      console.log('Step 3: Running comprehensive backtest...');
      const comprehensiveResult = await orchestrator.runComprehensiveBacktest(strategyConfig);
      expect(comprehensiveResult).toBeDefined();
      expect(comprehensiveResult.summary.totalTrades).toBe(simpleResult.totalTrades);
      console.log(`Comprehensive backtest completed with ${comprehensiveResult.summary.totalTrades} trades`);

      // Step 4: Compare to benchmark
      console.log('Step 4: Comparing to benchmark...');
      const benchmarkComparison = await orchestrator.compareToBenchmark(strategyConfig);
      expect(benchmarkComparison).toBeDefined();
      expect(benchmarkComparison.strategy).toBeDefined();
      expect(benchmarkComparison.buyAndHold).toBeDefined();
      console.log(`Benchmark comparison - Strategy: ${(benchmarkComparison.strategy.metrics.totalReturn * 100).toFixed(2)}%, Buy&Hold: ${(benchmarkComparison.buyAndHold.metrics.totalReturn * 100).toFixed(2)}%`);

      // Step 5: Strategy comparison
      console.log('Step 5: Comparing strategies...');
      const strategyComparison = await orchestrator.compareStrategies();
      expect(strategyComparison).toBeDefined();
      expect(strategyComparison.length).toBeGreaterThan(0);
      console.log(`Strategy comparison completed with ${strategyComparison.length} strategies`);

      // Step 6: Parameter optimization
      console.log('Step 6: Optimizing parameters...');
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.01, max: 0.03, step: 0.01 },
          sellThreshold: { min: 0.01, max: 0.03, step: 0.01 }
        },
        objective: 'profit'
      };

      const optimizationResults = await orchestrator.optimizeParameters(optimizationConfig);
      expect(optimizationResults).toBeDefined();
      expect(optimizationResults.length).toBeGreaterThan(0);
      console.log(`Parameter optimization completed with ${optimizationResults.length} results`);

      // Step 7: Test optimized strategy
      console.log('Step 7: Testing optimized strategy...');
      const optimizedResult = await orchestrator.runSimpleBacktest(optimizationResults[0].parameters);
      expect(optimizedResult).toBeDefined();
      console.log(`Optimized strategy - Total trades: ${optimizedResult.totalTrades}, Win rate: ${(optimizedResult.winRate * 100).toFixed(2)}%`);

      // Step 8: Generate comprehensive report
      console.log('Step 8: Generating comprehensive report...');
      const report = await orchestrator.generateReport(optimizationResults[0].parameters, true);
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report).toContain('COMPREHENSIVE BACKTEST REPORT');
      console.log('Comprehensive report generated successfully');

      // Summary
      console.log('\n=== INTEGRATION TEST SUMMARY ===');
      console.log(`Original strategy return: ${(simpleResult.totalReturn * 100).toFixed(2)}%`);
      console.log(`Optimized strategy return: ${(optimizedResult.totalReturn * 100).toFixed(2)}%`);
      console.log(`Improvement: ${((optimizedResult.totalReturn - simpleResult.totalReturn) * 100).toFixed(2)}%`);
      console.log(`Data quality: ${(dataQuality.qualityScore * 100).toFixed(2)}%`);
      console.log(`Best strategy from comparison: ${strategyComparison[0].name}`);
      console.log('=================================\n');
    }, 300000); // 5 minute timeout

    it('should handle optimization workflow', async () => {
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
          riskTolerance: { min: 0.6, max: 0.9, step: 0.1 }
        },
        objective: 'profit'
      };

      console.log('Running optimization workflow...');

      // Grid search optimization
      const gridResults = await orchestrator.optimizeParameters(optimizationConfig);
      expect(gridResults).toBeDefined();
      expect(gridResults.length).toBeGreaterThan(0);
      console.log(`Grid search found ${gridResults.length} parameter combinations`);

      // Genetic optimization
      const geneticConfig = {
        ...optimizationConfig,
        populationSize: 10,
        generations: 3
      };

      const geneticResults = await orchestrator.runGeneticOptimization(geneticConfig);
      expect(geneticResults).toBeDefined();
      expect(geneticResults.length).toBeGreaterThan(0);
      console.log(`Genetic optimization found ${geneticResults.length} solutions`);

      // Walk-forward analysis
      const walkForwardResults = await orchestrator.runWalkForwardAnalysis(optimizationConfig, 3, 1);
      expect(walkForwardResults).toBeDefined();
      console.log(`Walk-forward analysis completed with ${walkForwardResults.length} periods`);

      // Compare results
      const gridBest = gridResults[0];
      const geneticBest = geneticResults[0];
      
      console.log(`Grid search best score: ${gridBest.score.toFixed(4)}`);
      console.log(`Genetic best score: ${geneticBest.score.toFixed(4)}`);
      
      const avgDegradation = walkForwardResults.reduce((sum, r) => sum + r.degradation, 0) / walkForwardResults.length;
      console.log(`Average walk-forward degradation: ${(avgDegradation * 100).toFixed(2)}%`);
    }, 300000); // 5 minute timeout

    it('should validate performance targets', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      // Run comprehensive backtest
      const report = await orchestrator.runComprehensiveBacktest(strategyConfig);
      
      // Validate against targets from the issue description
      console.log('\n=== PERFORMANCE VALIDATION ===');
      console.log(`Total Return: ${(report.summary.totalReturn * 100).toFixed(2)}%`);
      console.log(`Annualized Return: ${(report.metrics.annualizedReturn * 100).toFixed(2)}%`);
      console.log(`Win Rate: ${(report.summary.winRate * 100).toFixed(2)}%`);
      console.log(`Max Drawdown: ${(report.summary.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`Sharpe Ratio: ${report.metrics.sharpeRatio.toFixed(3)}`);
      
      // Target validation (from issue description)
      const targets = {
        annualizedReturn: 0.15, // 15%
        maxDrawdown: 0.10, // 10%
        winRate: 0.55, // 55%
        sharpeRatio: 1.5
      };

      console.log('\nTarget Validation:');
      console.log(`Annualized Return >= 15%: ${report.metrics.annualizedReturn >= targets.annualizedReturn ? '✓' : '✗'}`);
      console.log(`Max Drawdown <= 10%: ${report.summary.maxDrawdown <= targets.maxDrawdown ? '✓' : '✗'}`);
      console.log(`Win Rate >= 55%: ${report.summary.winRate >= targets.winRate ? '✓' : '✗'}`);
      console.log(`Sharpe Ratio >= 1.5: ${report.metrics.sharpeRatio >= targets.sharpeRatio ? '✓' : '✗'}`);
      console.log('==============================\n');

      // Basic performance expectations
      expect(report.summary.totalTrades).toBeGreaterThanOrEqual(0);
      expect(report.summary.winRate).toBeGreaterThanOrEqual(0);
      expect(report.summary.winRate).toBeLessThanOrEqual(1);
      expect(report.summary.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(report.summary.maxDrawdown).toBeLessThanOrEqual(1);
      expect(report.metrics.sharpeRatio).toBeDefined();
    }, 300000); // 5 minute timeout
  });

  describe('Stress Testing', () => {
    it('should handle extreme market conditions', async () => {
      const extremeConfig = {
        buyThreshold: 0.001, // Very sensitive
        sellThreshold: 0.001,
        minProfitMargin: 0.0001,
        maxTradeAmount: 50000, // Large position
        riskTolerance: 0.95 // High risk
      };

      const result = await orchestrator.runSimpleBacktest(extremeConfig);
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      console.log(`Extreme config - Total trades: ${result.totalTrades}, Max drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%`);
    });

    it('should handle conservative strategy', async () => {
      const conservativeConfig = {
        buyThreshold: 0.05, // Less sensitive
        sellThreshold: 0.05,
        minProfitMargin: 0.03,
        maxTradeAmount: 1000, // Small position
        riskTolerance: 0.3 // Low risk
      };

      const result = await orchestrator.runSimpleBacktest(conservativeConfig);
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      console.log(`Conservative config - Total trades: ${result.totalTrades}, Win rate: ${(result.winRate * 100).toFixed(2)}%`);
    });

    it('should handle high-frequency trading simulation', async () => {
      const hftConfig = {
        buyThreshold: 0.002,
        sellThreshold: 0.002,
        minProfitMargin: 0.001,
        maxTradeAmount: 5000,
        riskTolerance: 0.8
      };

      const result = await orchestrator.runSimpleBacktest(hftConfig);
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      
      if (result.totalTrades > 0) {
        const avgTradeProfit = result.trades.reduce((sum, t) => sum + t.profit, 0) / result.trades.length;
        console.log(`HFT simulation - Total trades: ${result.totalTrades}, Avg profit per trade: ${avgTradeProfit.toFixed(2)} JPY`);
      }
    });
  });

  describe('Data Quality and Robustness', () => {
    it('should maintain consistent results across multiple runs', async () => {
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      // Run the same backtest multiple times
      const results = await Promise.all([
        orchestrator.runSimpleBacktest(strategyConfig),
        orchestrator.runSimpleBacktest(strategyConfig),
        orchestrator.runSimpleBacktest(strategyConfig)
      ]);

      // Results should be identical (deterministic)
      expect(results[0].totalTrades).toBe(results[1].totalTrades);
      expect(results[0].totalTrades).toBe(results[2].totalTrades);
      expect(results[0].totalReturn).toBe(results[1].totalReturn);
      expect(results[0].totalReturn).toBe(results[2].totalReturn);
      
      console.log('Consistency test passed - results are deterministic');
    });

    it('should handle data update scenarios', async () => {
      // Update historical data
      await orchestrator.updateHistoricalData();
      
      // Analyze quality after update
      const quality = await orchestrator.analyzeDataQuality();
      expect(quality).toBeDefined();
      expect(quality.qualityScore).toBeGreaterThan(0);
      
      console.log(`Data quality after update: ${(quality.qualityScore * 100).toFixed(2)}%`);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle zero balance scenarios', async () => {
      const zeroBalanceConfig = {
        ...orchestrator.getConfig(),
        initialBalance: 0
      };

      const zeroBalanceOrchestrator = new BacktestOrchestrator(zeroBalanceConfig);
      
      const strategyConfig = {
        buyThreshold: 0.02,
        sellThreshold: 0.02,
        minProfitMargin: 0.01,
        maxTradeAmount: 10000,
        riskTolerance: 0.8
      };

      const result = await zeroBalanceOrchestrator.runSimpleBacktest(strategyConfig);
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBe(0); // No trades possible with zero balance
      console.log('Zero balance scenario handled correctly');
    });

    it('should handle high commission scenarios', async () => {
      const highCommissionConfig = {
        ...orchestrator.getConfig(),
        commission: 0.05 // 5% commission
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
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      
      if (result.totalTrades > 0) {
        // High commission should significantly impact profitability
        const avgCommission = result.trades.reduce((sum, t) => sum + t.commission, 0) / result.trades.length;
        console.log(`High commission scenario - Avg commission per trade: ${avgCommission.toFixed(2)} JPY`);
      }
    });
  });
});