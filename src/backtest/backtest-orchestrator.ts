import { 
  BacktestConfig, 
  OptimizationConfig, 
  BacktestResult,
  OptimizationResult,
  StrategyComparison
} from '../types/backtest';
import { BitbankConfig } from '../types/bitbank';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import { HistoricalDataManager } from '../data/historical-data-manager';
import { BacktestEngine } from './backtest-engine';
import { PerformanceAnalyzer, PerformanceReport } from '../analysis/performance-analyzer';
import { ParameterOptimizer } from '../optimization/parameter-optimizer';
import { StrategyComparator, StrategyDefinition, ComparisonConfig } from '../comparison/strategy-comparator';

export interface OrchestratorConfig {
  bitbankConfig: BitbankConfig;
  pair: string;
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
  startDate: number;
  endDate: number;
  initialBalance: number;
  commission: number;
  slippage: number;
  maxPositionSize: number;
}

export interface FullAnalysisResult {
  backtest: BacktestResult;
  performanceReport: PerformanceReport;
  optimization?: OptimizationResult;
  comparison?: StrategyComparison;
  dataQuality: {
    totalCandles: number;
    qualityScore: number;
    gaps: number;
  };
  summary: {
    meetsTargets: boolean;
    targetAnalysis: {
      annualReturn: { target: number; actual: number; met: boolean };
      maxDrawdown: { target: number; actual: number; met: boolean };
      winRate: { target: number; actual: number; met: boolean };
      sharpeRatio: { target: number; actual: number; met: boolean };
    };
    recommendation: string;
  };
}

export class BacktestOrchestrator {
  private config: OrchestratorConfig;
  private dataManager: HistoricalDataManager;
  private performanceAnalyzer: PerformanceAnalyzer;
  private optimizer: ParameterOptimizer;
  private comparator: StrategyComparator;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.dataManager = new HistoricalDataManager(config.bitbankConfig);
    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.optimizer = new ParameterOptimizer();
    this.comparator = new StrategyComparator();
  }

  async runFullAnalysis(
    strategyConfig: TradingStrategyConfig,
    optimizationConfig?: OptimizationConfig,
    comparisonStrategies?: StrategyDefinition[]
  ): Promise<FullAnalysisResult> {
    console.log('Starting comprehensive backtest analysis...');
    
    // Step 1: Fetch and validate historical data
    console.log('Fetching historical data...');
    const historicalData = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );

    const dataQualityReport = this.dataManager.analyzeDataQuality(historicalData);
    console.log(`Data quality score: ${(dataQualityReport.qualityScore * 100).toFixed(1)}%`);

    if (dataQualityReport.qualityScore < 0.8) {
      console.log('Data quality is low, filling gaps...');
      const filledData = this.dataManager.fillDataGaps(historicalData);
      historicalData.splice(0, historicalData.length, ...filledData);
    }

    // Step 2: Create backtest configuration
    const backtestConfig: BacktestConfig = {
      startDate: this.config.startDate,
      endDate: this.config.endDate,
      initialBalance: this.config.initialBalance,
      pair: this.config.pair,
      timeframe: this.config.timeframe,
      commission: this.config.commission,
      slippage: this.config.slippage,
      maxPositionSize: this.config.maxPositionSize
    };

    // Step 3: Run initial backtest
    console.log('Running initial backtest...');
    const engine = new BacktestEngine(backtestConfig, strategyConfig);
    const initialBacktest = await engine.runBacktest(historicalData);

    // Step 4: Generate performance report
    console.log('Generating performance report...');
    const performanceReport = this.performanceAnalyzer.generateReport(
      initialBacktest,
      historicalData
    );

    // Step 5: Run optimization if requested
    let optimization: OptimizationResult | undefined;
    let finalBacktest = initialBacktest;

    if (optimizationConfig) {
      console.log('Running parameter optimization...');
      optimization = await this.optimizer.optimizeParameters(
        backtestConfig,
        historicalData,
        optimizationConfig
      );

      // Run backtest with optimized parameters
      const optimizedStrategyConfig = {
        ...strategyConfig,
        ...optimization.bestParameters
      };
      
      const optimizedEngine = new BacktestEngine(backtestConfig, optimizedStrategyConfig);
      finalBacktest = await optimizedEngine.runBacktest(historicalData);
      
      console.log(`Optimization complete. Best score: ${optimization.bestScore.toFixed(4)}`);
    }

    // Step 6: Run strategy comparison if requested
    let comparison: StrategyComparison | undefined;

    if (comparisonStrategies && comparisonStrategies.length > 0) {
      console.log('Running strategy comparison...');
      
      const comparisonConfig: ComparisonConfig = {
        strategies: [
          { name: 'Current Strategy', config: strategyConfig },
          ...comparisonStrategies
        ],
        benchmark: { name: 'Buy & Hold', type: 'buy_and_hold' },
        metrics: ['sharpeRatio', 'maxDrawdown', 'totalReturn', 'winRate'],
        rankingMetric: 'sharpeRatio',
        includeCorrelation: true
      };

      comparison = await this.comparator.compareStrategies(
        backtestConfig,
        historicalData,
        comparisonConfig
      );
    }

    // Step 7: Analyze performance against targets
    const summary = this.analyzeTradingTargets(finalBacktest);

    const result: FullAnalysisResult = {
      backtest: finalBacktest,
      performanceReport,
      dataQuality: {
        totalCandles: dataQualityReport.totalCandles,
        qualityScore: dataQualityReport.qualityScore,
        gaps: dataQualityReport.gapsCount
      },
      summary
    };

    if (optimization) {
      result.optimization = optimization;
    }
    
    if (comparison) {
      result.comparison = comparison;
    }

    return result;
  }

  async runQuickBacktest(strategyConfig: TradingStrategyConfig): Promise<BacktestResult> {
    console.log('Running quick backtest...');

    const historicalData = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );

    const backtestConfig: BacktestConfig = {
      startDate: this.config.startDate,
      endDate: this.config.endDate,
      initialBalance: this.config.initialBalance,
      pair: this.config.pair,
      timeframe: this.config.timeframe,
      commission: this.config.commission,
      slippage: this.config.slippage,
      maxPositionSize: this.config.maxPositionSize
    };

    const engine = new BacktestEngine(backtestConfig, strategyConfig);
    return await engine.runBacktest(historicalData);
  }

  async optimizeStrategyParameters(
    baseStrategyConfig: TradingStrategyConfig,
    optimizationConfig: OptimizationConfig
  ): Promise<{
    originalResult: BacktestResult;
    optimizedResult: BacktestResult;
    optimization: OptimizationResult;
    improvement: {
      returnImprovement: number;
      sharpeImprovement: number;
      drawdownImprovement: number;
    };
  }> {
    console.log('Running strategy optimization analysis...');

    const historicalData = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );

    const backtestConfig: BacktestConfig = {
      startDate: this.config.startDate,
      endDate: this.config.endDate,
      initialBalance: this.config.initialBalance,
      pair: this.config.pair,
      timeframe: this.config.timeframe,
      commission: this.config.commission,
      slippage: this.config.slippage,
      maxPositionSize: this.config.maxPositionSize
    };

    // Run original backtest
    const originalEngine = new BacktestEngine(backtestConfig, baseStrategyConfig);
    const originalResult = await originalEngine.runBacktest(historicalData);

    // Run optimization
    const optimization = await this.optimizer.optimizeParameters(
      backtestConfig,
      historicalData,
      optimizationConfig
    );

    // Run optimized backtest
    const optimizedStrategyConfig = {
      ...baseStrategyConfig,
      ...optimization.bestParameters
    };
    
    const optimizedEngine = new BacktestEngine(backtestConfig, optimizedStrategyConfig);
    const optimizedResult = await optimizedEngine.runBacktest(historicalData);

    // Calculate improvements
    const improvement = {
      returnImprovement: optimizedResult.totalReturn - originalResult.totalReturn,
      sharpeImprovement: optimizedResult.sharpeRatio - originalResult.sharpeRatio,
      drawdownImprovement: originalResult.maxDrawdown - optimizedResult.maxDrawdown
    };

    return {
      originalResult,
      optimizedResult,
      optimization,
      improvement
    };
  }

  async compareMultipleStrategies(strategies: StrategyDefinition[]): Promise<StrategyComparison> {
    console.log(`Comparing ${strategies.length} strategies...`);

    const historicalData = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );

    const backtestConfig: BacktestConfig = {
      startDate: this.config.startDate,
      endDate: this.config.endDate,
      initialBalance: this.config.initialBalance,
      pair: this.config.pair,
      timeframe: this.config.timeframe,
      commission: this.config.commission,
      slippage: this.config.slippage,
      maxPositionSize: this.config.maxPositionSize
    };

    const comparisonConfig: ComparisonConfig = {
      strategies,
      benchmark: { name: 'Buy & Hold', type: 'buy_and_hold' },
      metrics: ['sharpeRatio', 'maxDrawdown', 'totalReturn', 'winRate', 'profitFactor'],
      rankingMetric: 'sharpeRatio',
      includeCorrelation: true
    };

    return await this.comparator.compareStrategies(
      backtestConfig,
      historicalData,
      comparisonConfig
    );
  }

  async generateMarketAnalysisReport(): Promise<{
    marketConditions: Array<{
      period: string;
      trend: 'bull' | 'bear' | 'sideways';
      volatility: 'low' | 'medium' | 'high';
      recommendation: string;
    }>;
    overallMarketAssessment: string;
    tradingRecommendations: string[];
  }> {
    console.log('Generating market analysis report...');

    const historicalData = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );

    // Create a dummy backtest result for market analysis
    const dummyBacktest: BacktestResult = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalReturn: 0,
      annualizedReturn: 0,
      totalProfit: 0,
      totalLoss: 0,
      profitFactor: 0,
      averageWin: 0,
      averageLoss: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      volatility: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      trades: [],
      equity: [],
      drawdownPeriods: []
    };

    const report = this.performanceAnalyzer.generateReport(dummyBacktest, historicalData);
    
    const marketConditions = report.marketConditions.map(condition => ({
      period: condition.period,
      trend: condition.trend,
      volatility: condition.volatility,
      recommendation: this.getMarketRecommendation(condition)
    }));

    const bullishPeriods = marketConditions.filter(c => c.trend === 'bull').length;
    const bearishPeriods = marketConditions.filter(c => c.trend === 'bear').length;
    const sidewaysPeriods = marketConditions.filter(c => c.trend === 'sideways').length;

    const overallMarketAssessment = this.generateOverallAssessment(
      bullishPeriods,
      bearishPeriods,
      sidewaysPeriods
    );

    const tradingRecommendations = this.generateTradingRecommendations(marketConditions);

    return {
      marketConditions,
      overallMarketAssessment,
      tradingRecommendations
    };
  }

  private analyzeTradingTargets(result: BacktestResult): {
    meetsTargets: boolean;
    targetAnalysis: {
      annualReturn: { target: number; actual: number; met: boolean };
      maxDrawdown: { target: number; actual: number; met: boolean };
      winRate: { target: number; actual: number; met: boolean };
      sharpeRatio: { target: number; actual: number; met: boolean };
    };
    recommendation: string;
  } {
    // Targets from Issue #23
    const targets = {
      annualReturn: 0.15, // 15%
      maxDrawdown: 0.10,  // 10%
      winRate: 0.55,      // 55%
      sharpeRatio: 1.5    // 1.5
    };

    const targetAnalysis = {
      annualReturn: {
        target: targets.annualReturn,
        actual: result.annualizedReturn,
        met: result.annualizedReturn >= targets.annualReturn
      },
      maxDrawdown: {
        target: targets.maxDrawdown,
        actual: result.maxDrawdown,
        met: result.maxDrawdown <= targets.maxDrawdown
      },
      winRate: {
        target: targets.winRate,
        actual: result.winRate,
        met: result.winRate >= targets.winRate
      },
      sharpeRatio: {
        target: targets.sharpeRatio,
        actual: result.sharpeRatio,
        met: result.sharpeRatio >= targets.sharpeRatio
      }
    };

    const metTargets = Object.values(targetAnalysis).filter(t => t.met).length;
    const meetsTargets = metTargets >= 3; // Meet at least 3 out of 4 targets

    let recommendation = '';
    if (meetsTargets) {
      recommendation = `Strategy meets ${metTargets}/4 performance targets. Ready for live trading with careful monitoring.`;
    } else {
      recommendation = `Strategy meets only ${metTargets}/4 targets. Consider optimization or strategy refinement before live deployment.`;
    }

    return {
      meetsTargets,
      targetAnalysis,
      recommendation
    };
  }

  private getMarketRecommendation(condition: {
    trend: 'bull' | 'bear' | 'sideways';
    volatility: 'low' | 'medium' | 'high';
  }): string {
    if (condition.trend === 'bull' && condition.volatility === 'low') {
      return 'Ideal conditions for trend-following strategies';
    } else if (condition.trend === 'bull' && condition.volatility === 'high') {
      return 'Bullish but volatile - use smaller position sizes';
    } else if (condition.trend === 'bear' && condition.volatility === 'low') {
      return 'Bearish trend - consider short strategies or reduced exposure';
    } else if (condition.trend === 'bear' && condition.volatility === 'high') {
      return 'High risk period - minimal trading recommended';
    } else if (condition.trend === 'sideways' && condition.volatility === 'low') {
      return 'Range-bound market - mean reversion strategies may work';
    } else {
      return 'Choppy market conditions - exercise caution';
    }
  }

  private generateOverallAssessment(
    bullish: number,
    bearish: number,
    sideways: number
  ): string {
    const total = bullish + bearish + sideways;
    
    if (bullish > bearish && bullish > sideways) {
      return `Market shows predominantly bullish character (${((bullish/total)*100).toFixed(0)}% of periods). Trend-following strategies likely to perform well.`;
    } else if (bearish > bullish && bearish > sideways) {
      return `Market shows predominantly bearish character (${((bearish/total)*100).toFixed(0)}% of periods). Defensive strategies and short positions may be favorable.`;
    } else {
      return `Market shows mixed or sideways character (${((sideways/total)*100).toFixed(0)}% sideways periods). Range-bound strategies may be more effective.`;
    }
  }

  private generateTradingRecommendations(marketConditions: Array<{
    trend: 'bull' | 'bear' | 'sideways';
    volatility: 'low' | 'medium' | 'high';
  }>): string[] {
    const recommendations: string[] = [];
    
    const highVolPeriods = marketConditions.filter(c => c.volatility === 'high').length;
    const totalPeriods = marketConditions.length;
    
    if (highVolPeriods / totalPeriods > 0.3) {
      recommendations.push('Consider implementing dynamic position sizing based on volatility');
      recommendations.push('Use wider stop-losses during high volatility periods');
    }
    
    const bullishPeriods = marketConditions.filter(c => c.trend === 'bull').length;
    if (bullishPeriods / totalPeriods > 0.6) {
      recommendations.push('Long-biased strategies are likely to outperform');
      recommendations.push('Consider trend-following indicators for entry signals');
    }
    
    const sidewaysPeriods = marketConditions.filter(c => c.trend === 'sideways').length;
    if (sidewaysPeriods / totalPeriods > 0.5) {
      recommendations.push('Implement mean-reversion strategies for ranging markets');
      recommendations.push('Use oscillators like RSI or Bollinger Bands for entry signals');
    }
    
    recommendations.push('Always maintain strict risk management regardless of market conditions');
    recommendations.push('Consider periodic strategy re-optimization based on changing market dynamics');
    
    return recommendations;
  }
}