import { HistoricalDataManager } from '../data/historical-data-manager';
import { BacktestEngine } from './backtest-engine';
import { ParameterOptimizer } from '../optimization/parameter-optimizer';
import { StrategyComparator } from '../comparison/strategy-comparator';
import { PerformanceAnalyzer } from '../analysis/performance-analyzer';
import { TradingStrategy } from '../strategies/trading-strategy';
import { BitbankConfig } from '../types/bitbank';
import { 
  BacktestConfig, 
  BacktestResult, 
  BacktestReport,
  OptimizationConfig,
  OptimizationResult,
  StrategyComparison,
  WalkForwardResult
} from '../types/backtest';

export interface BacktestOrchestatorConfig {
  bitbankConfig: BitbankConfig;
  dataDirectory?: string;
  pair: string;
  timeframe: string;
  startDate: number;
  endDate: number;
  initialBalance: number;
  commission: number;
  slippage: number;
  maxPositionSize: number;
}

export class BacktestOrchestrator {
  private dataManager: HistoricalDataManager;
  private performanceAnalyzer: PerformanceAnalyzer;
  private config: BacktestOrchestatorConfig;
  private backtestConfig: BacktestConfig;

  constructor(config: BacktestOrchestatorConfig) {
    this.config = config;
    this.dataManager = new HistoricalDataManager(
      config.bitbankConfig, 
      config.dataDirectory
    );
    this.performanceAnalyzer = new PerformanceAnalyzer();
    
    this.backtestConfig = {
      startDate: config.startDate,
      endDate: config.endDate,
      initialBalance: config.initialBalance,
      commission: config.commission,
      slippage: config.slippage,
      maxPositionSize: config.maxPositionSize,
      strategy: null // Will be set per test
    };
  }

  async runSimpleBacktest(strategyConfig: any): Promise<BacktestResult> {
    console.log('Running simple backtest...');
    
    const strategy = new TradingStrategy(strategyConfig);
    const engine = new BacktestEngine(this.dataManager, strategy, this.backtestConfig);
    
    const result = await engine.runBacktest(this.config.pair, this.config.timeframe);
    
    console.log('Simple backtest completed');
    console.log(`Total trades: ${result.totalTrades}`);
    console.log(`Win rate: ${(result.winRate * 100).toFixed(2)}%`);
    console.log(`Total return: ${(result.totalReturn * 100).toFixed(2)}%`);
    console.log(`Max drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`Sharpe ratio: ${result.sharpeRatio.toFixed(3)}`);
    
    return result;
  }

  async runComprehensiveBacktest(strategyConfig: any): Promise<BacktestReport> {
    console.log('Running comprehensive backtest...');
    
    const strategy = new TradingStrategy(strategyConfig);
    const engine = new BacktestEngine(this.dataManager, strategy, this.backtestConfig);
    
    const result = await engine.runBacktest(this.config.pair, this.config.timeframe);
    const periodDays = (this.config.endDate - this.config.startDate) / (24 * 60 * 60 * 1000);
    
    const report = this.performanceAnalyzer.generateDetailedReport(result, periodDays);
    
    console.log('Comprehensive backtest completed');
    console.log(`Total trades: ${result.totalTrades}`);
    console.log(`Win rate: ${(result.winRate * 100).toFixed(2)}%`);
    console.log(`Total return: ${(result.totalReturn * 100).toFixed(2)}%`);
    console.log(`Sharpe ratio: ${result.sharpeRatio.toFixed(3)}`);
    console.log(`Max drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%`);
    
    return report;
  }

  async optimizeParameters(optimizationConfig: OptimizationConfig): Promise<OptimizationResult[]> {
    console.log('Starting parameter optimization...');
    
    const optimizer = new ParameterOptimizer(this.dataManager, this.backtestConfig);
    const results = await optimizer.gridSearchOptimization(
      this.config.pair,
      optimizationConfig,
      this.config.timeframe
    );
    
    console.log('Parameter optimization completed');
    console.log(`Best parameters: ${JSON.stringify(results[0]?.parameters, null, 2)}`);
    console.log(`Best score: ${results[0]?.score.toFixed(4)}`);
    
    // Test for overfitting
    const overfittingTest = optimizer.detectOverfitting(results);
    if (overfittingTest.isOverfitted) {
      console.warn('⚠ Potential overfitting detected:');
      overfittingTest.indicators.forEach(indicator => {
        console.warn(`  - ${indicator}`);
      });
    }
    
    return results;
  }

  async runGeneticOptimization(optimizationConfig: OptimizationConfig): Promise<OptimizationResult[]> {
    console.log('Starting genetic algorithm optimization...');
    
    const optimizer = new ParameterOptimizer(this.dataManager, this.backtestConfig);
    const results = await optimizer.geneticOptimization(
      this.config.pair,
      optimizationConfig,
      this.config.timeframe
    );
    
    console.log('Genetic optimization completed');
    console.log(`Best parameters: ${JSON.stringify(results[0]?.parameters, null, 2)}`);
    console.log(`Best score: ${results[0]?.score.toFixed(4)}`);
    
    return results;
  }

  async runWalkForwardAnalysis(
    optimizationConfig: OptimizationConfig,
    inSampleMonths: number = 6,
    outSampleMonths: number = 1
  ): Promise<WalkForwardResult[]> {
    console.log('Starting walk-forward analysis...');
    
    const optimizer = new ParameterOptimizer(this.dataManager, this.backtestConfig);
    const results = await optimizer.walkForwardOptimization(
      this.config.pair,
      optimizationConfig,
      inSampleMonths,
      outSampleMonths,
      this.config.timeframe
    );
    
    console.log('Walk-forward analysis completed');
    
    const avgDegradation = results.reduce((sum, r) => sum + r.degradation, 0) / results.length;
    console.log(`Average degradation: ${(avgDegradation * 100).toFixed(2)}%`);
    
    if (avgDegradation > 0.3) {
      console.warn('⚠ High degradation detected - strategy may not be robust');
    }
    
    return results;
  }

  async compareStrategies(customStrategies?: any[]): Promise<StrategyComparison[]> {
    console.log('Starting strategy comparison...');
    
    const comparator = new StrategyComparator(this.dataManager, this.backtestConfig);
    const strategies = customStrategies || comparator.getDefaultStrategies();
    
    const results = await comparator.compareStrategies(
      strategies,
      this.config.pair,
      this.config.timeframe
    );
    
    console.log('Strategy comparison completed');
    console.log(`Best strategy: ${results[0]?.name}`);
    console.log(`Best score: ${results[0]?.score.toFixed(4)}`);
    
    // Generate and display comparison report
    const report = comparator.generateComparisonReport(results);
    console.log('\n' + report);
    
    return results;
  }

  async compareToBenchmark(strategyConfig: any): Promise<{
    strategy: StrategyComparison;
    buyAndHold: StrategyComparison;
    outperformance: number;
    riskAdjustedOutperformance: number;
  }> {
    console.log('Comparing strategy to buy-and-hold benchmark...');
    
    const comparator = new StrategyComparator(this.dataManager, this.backtestConfig);
    const strategyDefinition = {
      name: 'Custom Strategy',
      config: strategyConfig,
      description: 'User-defined strategy'
    };
    
    const comparison = await comparator.compareToBenchmark(
      strategyDefinition,
      this.config.pair,
      this.config.timeframe
    );
    
    console.log('Benchmark comparison completed');
    console.log(`Strategy return: ${(comparison.strategy.metrics.totalReturn * 100).toFixed(2)}%`);
    console.log(`Buy-and-hold return: ${(comparison.buyAndHold.metrics.totalReturn * 100).toFixed(2)}%`);
    console.log(`Outperformance: ${(comparison.outperformance * 100).toFixed(2)}%`);
    console.log(`Risk-adjusted outperformance: ${comparison.riskAdjustedOutperformance.toFixed(3)}`);
    
    if (comparison.outperformance > 0) {
      console.log('✓ Strategy outperformed buy-and-hold');
    } else {
      console.log('⚠ Strategy underperformed buy-and-hold');
    }
    
    return comparison;
  }

  async runFullAnalysis(
    baseStrategyConfig: any,
    optimizationConfig: OptimizationConfig
  ): Promise<{
    originalBacktest: BacktestResult;
    optimizedParameters: OptimizationResult[];
    optimizedBacktest: BacktestResult;
    walkForwardResults: WalkForwardResult[];
    benchmarkComparison: any;
    robustnessTest: any;
  }> {
    console.log('Starting full analysis...');
    
    // 1. Original backtest
    console.log('\n1. Running original backtest...');
    const originalBacktest = await this.runSimpleBacktest(baseStrategyConfig);
    
    // 2. Parameter optimization
    console.log('\n2. Optimizing parameters...');
    const optimizedParameters = await this.optimizeParameters(optimizationConfig);
    
    // 3. Backtest with optimized parameters
    console.log('\n3. Running backtest with optimized parameters...');
    const optimizedBacktest = await this.runSimpleBacktest(optimizedParameters[0].parameters);
    
    // 4. Walk-forward analysis
    console.log('\n4. Running walk-forward analysis...');
    const walkForwardResults = await this.runWalkForwardAnalysis(optimizationConfig);
    
    // 5. Benchmark comparison
    console.log('\n5. Comparing to benchmark...');
    const benchmarkComparison = await this.compareToBenchmark(optimizedParameters[0].parameters);
    
    // 6. Robustness test
    console.log('\n6. Running robustness test...');
    const optimizer = new ParameterOptimizer(this.dataManager, this.backtestConfig);
    const robustnessTest = await optimizer.robustnessTest(
      this.config.pair,
      optimizedParameters[0].parameters,
      0.1,
      this.config.timeframe
    );
    
    console.log('\nFull analysis completed!');
    console.log('\n=== SUMMARY ===');
    console.log(`Original return: ${(originalBacktest.totalReturn * 100).toFixed(2)}%`);
    console.log(`Optimized return: ${(optimizedBacktest.totalReturn * 100).toFixed(2)}%`);
    console.log(`Improvement: ${((optimizedBacktest.totalReturn - originalBacktest.totalReturn) * 100).toFixed(2)}%`);
    console.log(`Robustness score: ${robustnessTest.robustnessScore.toFixed(3)}`);
    console.log(`Average walk-forward degradation: ${(walkForwardResults.reduce((sum, r) => sum + r.degradation, 0) / walkForwardResults.length * 100).toFixed(2)}%`);
    
    return {
      originalBacktest,
      optimizedParameters,
      optimizedBacktest,
      walkForwardResults,
      benchmarkComparison,
      robustnessTest
    };
  }

  async updateHistoricalData(): Promise<void> {
    console.log('Updating historical data...');
    
    await this.dataManager.updateData(this.config.pair, this.config.timeframe);
    
    console.log('Historical data updated');
  }

  async analyzeDataQuality(): Promise<any> {
    console.log('Analyzing data quality...');
    
    const data = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );
    
    const quality = this.dataManager.analyzeDataQuality(data);
    
    console.log('Data quality analysis completed');
    console.log(`Total data points: ${quality.totalPoints}`);
    console.log(`Missing points: ${quality.missingPoints}`);
    console.log(`Quality score: ${(quality.qualityScore * 100).toFixed(2)}%`);
    
    if (quality.qualityScore < 0.8) {
      console.warn('⚠ Data quality is below 80% - consider improving data source');
    }
    
    return quality;
  }

  async generateReport(
    strategyConfig: any,
    includeOptimization: boolean = false
  ): Promise<string> {
    console.log('Generating comprehensive report...');
    
    const report = ['=== COMPREHENSIVE BACKTEST REPORT ===\n'];
    
    // Configuration
    report.push('CONFIGURATION:');
    report.push(`Pair: ${this.config.pair}`);
    report.push(`Timeframe: ${this.config.timeframe}`);
    report.push(`Period: ${new Date(this.config.startDate).toISOString().split('T')[0]} to ${new Date(this.config.endDate).toISOString().split('T')[0]}`);
    report.push(`Initial Balance: ${this.config.initialBalance.toLocaleString()} JPY`);
    report.push(`Commission: ${(this.config.commission * 100).toFixed(3)}%`);
    report.push(`Slippage: ${(this.config.slippage * 100).toFixed(3)}%`);
    report.push('');
    
    // Data quality
    const dataQuality = await this.analyzeDataQuality();
    report.push('DATA QUALITY:');
    report.push(`Total Points: ${dataQuality.totalPoints.toLocaleString()}`);
    report.push(`Missing Points: ${dataQuality.missingPoints.toLocaleString()}`);
    report.push(`Quality Score: ${(dataQuality.qualityScore * 100).toFixed(2)}%`);
    report.push('');
    
    // Backtest results
    const backtestResult = await this.runComprehensiveBacktest(strategyConfig);
    report.push('BACKTEST RESULTS:');
    report.push(`Total Trades: ${backtestResult.summary.totalTrades}`);
    report.push(`Win Rate: ${(backtestResult.summary.winRate * 100).toFixed(2)}%`);
    report.push(`Total Return: ${(backtestResult.summary.totalReturn * 100).toFixed(2)}%`);
    report.push(`Annualized Return: ${(backtestResult.metrics.annualizedReturn * 100).toFixed(2)}%`);
    report.push(`Sharpe Ratio: ${backtestResult.metrics.sharpeRatio.toFixed(3)}`);
    report.push(`Sortino Ratio: ${backtestResult.metrics.sortinoRatio.toFixed(3)}`);
    report.push(`Maximum Drawdown: ${(backtestResult.metrics.maxDrawdown * 100).toFixed(2)}%`);
    report.push(`Profit Factor: ${backtestResult.metrics.profitFactor.toFixed(2)}`);
    report.push('');
    
    // Benchmark comparison
    const benchmarkComparison = await this.compareToBenchmark(strategyConfig);
    report.push('BENCHMARK COMPARISON:');
    report.push(`Strategy Return: ${(benchmarkComparison.strategy.metrics.totalReturn * 100).toFixed(2)}%`);
    report.push(`Buy-and-Hold Return: ${(benchmarkComparison.buyAndHold.metrics.totalReturn * 100).toFixed(2)}%`);
    report.push(`Outperformance: ${(benchmarkComparison.outperformance * 100).toFixed(2)}%`);
    report.push(`Risk-Adjusted Outperformance: ${benchmarkComparison.riskAdjustedOutperformance.toFixed(3)}`);
    report.push('');
    
    // Optimization if requested
    if (includeOptimization) {
      const optimizationConfig: OptimizationConfig = {
        parameters: {
          buyThreshold: { min: 0.005, max: 0.05, step: 0.005 },
          sellThreshold: { min: 0.005, max: 0.05, step: 0.005 },
          riskTolerance: { min: 0.5, max: 0.95, step: 0.05 }
        },
        objective: 'profit'
      };
      
      const optimizationResults = await this.optimizeParameters(optimizationConfig);
      
      report.push('OPTIMIZATION RESULTS:');
      report.push(`Best Parameters: ${JSON.stringify(optimizationResults[0].parameters, null, 2)}`);
      report.push(`Optimized Score: ${optimizationResults[0].score.toFixed(4)}`);
      report.push('');
    }
    
    report.push('=== END OF REPORT ===');
    
    const finalReport = report.join('\n');
    console.log('Report generated successfully');
    
    return finalReport;
  }

  getConfig(): BacktestOrchestatorConfig {
    return { ...this.config };
  }

  getDataManager(): HistoricalDataManager {
    return this.dataManager;
  }
}