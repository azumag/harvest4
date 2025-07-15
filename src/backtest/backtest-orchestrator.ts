import { HistoricalDataManager } from '../data/historical-data-manager';
import { BacktestEngine } from './backtest-engine';
import { PerformanceAnalyzer } from '../analysis/performance-analyzer';
import { ParameterOptimizer } from '../optimization/parameter-optimizer';
import { StrategyComparator } from '../comparison/strategy-comparator';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import {
  BacktestEngineConfig,
  HistoricalDataConfig,
  OptimizationConfig,
  WalkForwardConfig,
  BacktestResult,
  OptimizationResult,
  WalkForwardResult,
  StrategyComparison,
  DataQuality
} from '../types/backtest';
import { PerformanceReport } from '../analysis/performance-analyzer';

export class BacktestOrchestrator {
  private dataManager: HistoricalDataManager;
  private performanceAnalyzer: PerformanceAnalyzer;
  private config: BacktestEngineConfig;

  constructor(config: BacktestEngineConfig) {
    this.config = config;
    
    const dataConfig: HistoricalDataConfig = {
      pair: config.pair,
      timeframes: [config.timeframe],
      startDate: config.startDate,
      endDate: config.endDate,
      source: 'bitbank',
      maxRetries: 3,
      retryDelay: 1000,
      fetchInterval: 500
    };
    
    this.dataManager = new HistoricalDataManager(config.bitbankConfig, dataConfig);
    this.performanceAnalyzer = new PerformanceAnalyzer();
  }

  async runBacktest(strategyConfig: TradingStrategyConfig): Promise<BacktestResult> {
    const data = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );
    
    const backtestConfig = this.createBacktestConfig();
    const backtest = new BacktestEngine(backtestConfig, strategyConfig);
    
    const result = await backtest.runBacktest(data);
    
    return result;
  }

  async optimizeParameters(
    baseStrategy: TradingStrategyConfig,
    optimizationConfig: OptimizationConfig
  ): Promise<OptimizationResult[]> {
    const data = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );
    
    const backtestConfig = this.createBacktestConfig();
    const optimizer = new ParameterOptimizer(data, backtestConfig);
    
    const results = await optimizer.optimize(baseStrategy, optimizationConfig);
    
    return results;
  }

  async runWalkForwardAnalysis(
    baseStrategy: TradingStrategyConfig,
    optimizationConfig: OptimizationConfig,
    walkForwardConfig: WalkForwardConfig
  ): Promise<WalkForwardResult> {
    const data = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );
    
    const backtestConfig = this.createBacktestConfig();
    const optimizer = new ParameterOptimizer(data, backtestConfig);
    
    const result = await optimizer.walkForwardAnalysis(
      baseStrategy,
      optimizationConfig,
      walkForwardConfig
    );
    
    return result;
  }

  async compareStrategies(
    strategies: Array<{ name: string; config: TradingStrategyConfig }>
  ): Promise<StrategyComparison> {
    const data = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );
    
    const backtestConfig = this.createBacktestConfig();
    const comparator = new StrategyComparator(data, backtestConfig);
    
    const comparison = await comparator.compareStrategies(strategies);
    
    return comparison;
  }

  async runFullAnalysis(
    baseStrategy: TradingStrategyConfig,
    optimizationConfig: OptimizationConfig,
    walkForwardConfig?: WalkForwardConfig
  ): Promise<FullAnalysisResult> {
    const data = await this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    );
    
    const dataQuality = this.dataManager.analyzeDataQuality(data);
    const filledData = this.dataManager.fillDataGaps(data);
    
    const baselineBacktest = await this.runBacktest(baseStrategy);
    const optimizationResults = await this.optimizeParameters(baseStrategy, optimizationConfig);
    
    const bestStrategy = optimizationResults[0];
    if (!bestStrategy) {
      throw new Error('No optimization results found');
    }
    
    const optimizedStrategyConfig: TradingStrategyConfig = {
      buyThreshold: bestStrategy.parameters['buyThreshold'] || 0.02,
      sellThreshold: bestStrategy.parameters['sellThreshold'] || 0.02,
      minProfitMargin: bestStrategy.parameters['minProfitMargin'] || 0.01,
      maxTradeAmount: bestStrategy.parameters['maxTradeAmount'] || 10000,
      riskTolerance: bestStrategy.parameters['riskTolerance'] || 0.8
    };
    
    const optimizedBacktest = await this.runBacktest(optimizedStrategyConfig);
    
    const strategies = [
      { name: 'Baseline', config: baseStrategy },
      { name: 'Optimized', config: optimizedStrategyConfig }
    ];
    
    const comparison = await this.compareStrategies(strategies);
    
    let walkForwardResult: WalkForwardResult | undefined;
    if (walkForwardConfig) {
      walkForwardResult = await this.runWalkForwardAnalysis(
        optimizedStrategyConfig,
        optimizationConfig,
        walkForwardConfig
      );
    }
    
    const targetAnalysis = this.analyzeTargetAchievement(
      optimizedBacktest,
      baselineBacktest,
      walkForwardResult
    );
    
    const detailedReport = this.performanceAnalyzer.generateDetailedReport(optimizedBacktest, filledData);
    
    return {
      dataQuality,
      baselineBacktest,
      optimizationResults,
      optimizedBacktest,
      comparison,
      walkForwardResult,
      targetAnalysis,
      detailedReport,
      recommendations: this.generateRecommendations(
        optimizedBacktest,
        targetAnalysis,
        walkForwardResult
      )
    };
  }

  private createBacktestConfig() {
    return {
      startDate: this.config.startDate,
      endDate: this.config.endDate,
      initialBalance: this.config.initialBalance,
      commission: this.config.commission,
      slippage: this.config.slippage,
      maxPositionSize: this.config.maxPositionSize,
      stopLoss: this.config.stopLoss || 0.02,
      takeProfit: this.config.takeProfit || 0.04,
      pair: this.config.pair,
      timeframe: this.config.timeframe
    };
  }

  private analyzeTargetAchievement(
    optimizedResult: BacktestResult,
    baselineResult: BacktestResult,
    walkForwardResult?: WalkForwardResult
  ): TargetAnalysis {
    const targets = {
      annualReturn: 15, // 15%
      maxDrawdown: 10, // 10%
      winRate: 55, // 55%
      sharpeRatio: 1.5 // 1.5
    };
    
    const achievements = {
      annualReturn: Math.min(100, (optimizedResult.annualizedReturn / targets.annualReturn) * 100),
      maxDrawdown: Math.min(100, ((targets.maxDrawdown / Math.max(optimizedResult.maxDrawdownPercent, 0.1)) * 100)),
      winRate: Math.min(100, (optimizedResult.winRate / targets.winRate) * 100),
      sharpeRatio: Math.min(100, (optimizedResult.sharpeRatio / targets.sharpeRatio) * 100)
    };
    
    const overallScore = Object.values(achievements).reduce((sum, score) => sum + score, 0) / 4;
    
    const improvement = {
      annualReturn: optimizedResult.annualizedReturn - baselineResult.annualizedReturn,
      maxDrawdown: baselineResult.maxDrawdownPercent - optimizedResult.maxDrawdownPercent,
      winRate: optimizedResult.winRate - baselineResult.winRate,
      sharpeRatio: optimizedResult.sharpeRatio - baselineResult.sharpeRatio
    };
    
    return {
      targets,
      achievements,
      overallScore,
      improvement,
      robustness: walkForwardResult?.robustness.robustnessScore || 0,
      stability: walkForwardResult?.stability.consistencyScore || 0
    };
  }

  private generateRecommendations(
    result: BacktestResult,
    targetAnalysis: TargetAnalysis,
    walkForwardResult?: WalkForwardResult
  ): string[] {
    const recommendations: string[] = [];
    
    if (targetAnalysis.achievements.annualReturn < 80) {
      recommendations.push('Consider more aggressive position sizing or alternative entry/exit criteria to improve returns');
    }
    
    if (targetAnalysis.achievements.maxDrawdown < 80) {
      recommendations.push('Implement stricter risk management rules to reduce maximum drawdown');
    }
    
    if (targetAnalysis.achievements.winRate < 80) {
      recommendations.push('Refine entry signals to improve win rate - consider additional confirmation indicators');
    }
    
    if (targetAnalysis.achievements.sharpeRatio < 80) {
      recommendations.push('Focus on risk-adjusted returns - consider volatility-based position sizing');
    }
    
    if (walkForwardResult && walkForwardResult.stability.consistencyScore < 0.7) {
      recommendations.push('Strategy shows parameter instability - consider more robust parameter ranges');
    }
    
    if (walkForwardResult && walkForwardResult.robustness.robustnessScore < 0.6) {
      recommendations.push('Strategy may be overfit - consider simpler models or longer optimization periods');
    }
    
    if (result.profitFactor < 1.5) {
      recommendations.push('Profit factor is low - adjust risk-reward ratio or filter trades more selectively');
    }
    
    if (result.totalTrades < 10) {
      recommendations.push('Low trade frequency - consider shorter timeframes or more sensitive signals');
    }
    
    if (result.totalTrades > 1000) {
      recommendations.push('High trade frequency - consider transaction costs and slippage impact');
    }
    
    return recommendations;
  }

  async exportResults(
    results: FullAnalysisResult,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backtest_results_${timestamp}`;
    
    if (format === 'json') {
      return this.dataManager.exportData(
        results as Record<string, unknown>,
        'json',
        filename
      );
    } else {
      const csvData = this.convertResultsToCSV(results);
      return this.dataManager.exportData(csvData, 'csv', filename);
    }
  }

  private convertResultsToCSV(results: FullAnalysisResult): Record<string, unknown>[] {
    const csvData: Record<string, unknown>[] = [];
    
    results.optimizedBacktest.trades.forEach(trade => {
      csvData.push({
        trade_id: trade.id,
        timestamp: new Date(trade.timestamp).toISOString(),
        side: trade.side,
        price: trade.price,
        amount: trade.amount,
        profit: trade.profit || 0,
        profit_percent: trade.profitPercent || 0,
        holding_period: trade.holdingPeriod || 0,
        exit_reason: trade.exitReason || 'none'
      });
    });
    
    return csvData;
  }

  async clearCache(): Promise<void> {
    await this.dataManager.clearCache();
  }

  getDataStatistics(): Promise<Record<string, number>> {
    return this.dataManager.fetchHistoricalData(
      this.config.pair,
      this.config.timeframe,
      this.config.startDate,
      this.config.endDate
    ).then(data => this.dataManager.getDataStatistics(data));
  }
}

interface FullAnalysisResult {
  dataQuality: DataQuality;
  baselineBacktest: BacktestResult;
  optimizationResults: OptimizationResult[];
  optimizedBacktest: BacktestResult;
  comparison: StrategyComparison;
  walkForwardResult?: WalkForwardResult;
  targetAnalysis: TargetAnalysis;
  detailedReport: PerformanceReport;
  recommendations: string[];
}

interface TargetAnalysis {
  targets: {
    annualReturn: number;
    maxDrawdown: number;
    winRate: number;
    sharpeRatio: number;
  };
  achievements: {
    annualReturn: number;
    maxDrawdown: number;
    winRate: number;
    sharpeRatio: number;
  };
  overallScore: number;
  improvement: {
    annualReturn: number;
    maxDrawdown: number;
    winRate: number;
    sharpeRatio: number;
  };
  robustness: number;
  stability: number;
}