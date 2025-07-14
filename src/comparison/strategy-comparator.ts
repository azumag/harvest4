import { 
  StrategyComparison, 
  BacktestResult, 
  HistoricalCandle,
  BacktestConfig,
  PerformanceMetrics
} from '../types/backtest';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import { BacktestEngine } from '../backtest/backtest-engine';
import { PerformanceAnalyzer } from '../analysis/performance-analyzer';

export interface StrategyDefinition {
  name: string;
  config: TradingStrategyConfig;
  description?: string;
}

export interface BenchmarkStrategy {
  name: string;
  type: 'buy_and_hold' | 'random_walk' | 'dollar_cost_averaging';
  config?: any;
}

export interface ComparisonConfig {
  strategies: StrategyDefinition[];
  benchmark: BenchmarkStrategy;
  metrics: (keyof PerformanceMetrics)[];
  rankingMetric: keyof PerformanceMetrics;
  includeCorrelation: boolean;
}

export class StrategyComparator {
  private performanceAnalyzer: PerformanceAnalyzer;

  constructor() {
    this.performanceAnalyzer = new PerformanceAnalyzer();
  }

  async compareStrategies(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    comparisonConfig: ComparisonConfig
  ): Promise<StrategyComparison> {
    console.log(`Comparing ${comparisonConfig.strategies.length} strategies...`);

    // Run backtests for all strategies
    const strategyResults = await Promise.all(
      comparisonConfig.strategies.map(async (strategy) => {
        const engine = new BacktestEngine(backtestConfig, strategy.config);
        const backtest = await engine.runBacktest(historicalData);
        const metrics = this.performanceAnalyzer.calculateMetrics(backtest);

        return {
          name: strategy.name,
          results: backtest,
          metrics
        };
      })
    );

    // Run benchmark strategy
    const benchmarkResult = await this.runBenchmarkStrategy(
      backtestConfig,
      historicalData,
      comparisonConfig.benchmark
    );
    const benchmarkMetrics = this.performanceAnalyzer.calculateMetrics(benchmarkResult);

    // Calculate rankings
    const ranking = this.calculateRankings(strategyResults, comparisonConfig.rankingMetric);

    // Calculate correlations if requested
    const correlation = comparisonConfig.includeCorrelation
      ? this.calculateCorrelations(strategyResults)
      : {};

    return {
      strategies: strategyResults,
      ranking,
      correlation,
      benchmark: {
        name: comparisonConfig.benchmark.name,
        results: benchmarkResult,
        metrics: benchmarkMetrics
      }
    };
  }

  async runMultiStrategyAnalysis(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    strategies: StrategyDefinition[]
  ): Promise<{
    individualResults: Array<{
      name: string;
      results: BacktestResult;
      metrics: PerformanceMetrics;
    }>;
    portfolioResults: BacktestResult;
    diversificationBenefit: number;
  }> {
    // Run individual strategy backtests
    const individualResults = await Promise.all(
      strategies.map(async (strategy) => {
        const engine = new BacktestEngine(backtestConfig, strategy.config);
        const backtest = await engine.runBacktest(historicalData);
        const metrics = this.performanceAnalyzer.calculateMetrics(backtest);

        return {
          name: strategy.name,
          results: backtest,
          metrics
        };
      })
    );

    // Create portfolio by equally weighting strategies
    const portfolioResults = this.createPortfolioResult(individualResults, backtestConfig);
    
    // Calculate diversification benefit
    const avgIndividualReturn = individualResults.reduce(
      (sum, result) => sum + result.results.totalReturn, 0
    ) / individualResults.length;
    
    const diversificationBenefit = portfolioResults.totalReturn - avgIndividualReturn;

    return {
      individualResults,
      portfolioResults,
      diversificationBenefit
    };
  }

  generatePerformanceMatrix(
    strategies: Array<{
      name: string;
      results: BacktestResult;
      metrics: PerformanceMetrics;
    }>,
    selectedMetrics: (keyof PerformanceMetrics)[]
  ): { [strategyName: string]: { [metric: string]: number } } {
    const matrix: { [strategyName: string]: { [metric: string]: number } } = {};

    for (const strategy of strategies) {
      matrix[strategy.name] = {};
      
      for (const metric of selectedMetrics) {
        matrix[strategy.name][metric] = strategy.metrics[metric];
      }
    }

    return matrix;
  }

  calculateStrategyScores(
    strategies: Array<{
      name: string;
      results: BacktestResult;
      metrics: PerformanceMetrics;
    }>,
    weights: { [metric in keyof PerformanceMetrics]?: number }
  ): Array<{
    name: string;
    score: number;
    weightedMetrics: { [metric: string]: number };
  }> {
    // Normalize metrics to 0-1 scale
    const normalizedMetrics = this.normalizeMetrics(strategies);
    
    const scores = strategies.map((strategy, index) => {
      let score = 0;
      const weightedMetrics: { [metric: string]: number } = {};
      
      for (const [metric, weight] of Object.entries(weights)) {
        const normalizedValue = normalizedMetrics[index][metric as keyof PerformanceMetrics];
        const weightedValue = normalizedValue * (weight || 0);
        
        score += weightedValue;
        weightedMetrics[metric] = weightedValue;
      }
      
      return {
        name: strategy.name,
        score,
        weightedMetrics
      };
    });

    return scores.sort((a, b) => b.score - a.score);
  }

  private async runBenchmarkStrategy(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    benchmark: BenchmarkStrategy
  ): Promise<BacktestResult> {
    switch (benchmark.type) {
      case 'buy_and_hold':
        return this.runBuyAndHoldStrategy(backtestConfig, historicalData);
      
      case 'dollar_cost_averaging':
        return this.runDollarCostAveragingStrategy(backtestConfig, historicalData);
      
      case 'random_walk':
        return this.runRandomWalkStrategy(backtestConfig, historicalData);
      
      default:
        throw new Error(`Unknown benchmark strategy: ${benchmark.type}`);
    }
  }

  private async runBuyAndHoldStrategy(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[]
  ): Promise<BacktestResult> {
    const sortedData = historicalData
      .filter(candle => 
        candle.timestamp >= backtestConfig.startDate && 
        candle.timestamp <= backtestConfig.endDate
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    if (sortedData.length === 0) {
      throw new Error('No historical data available for benchmark');
    }

    const startPrice = sortedData[0].close;
    const endPrice = sortedData[sortedData.length - 1].close;
    const totalReturn = (endPrice - startPrice) / startPrice;
    
    const shares = backtestConfig.initialBalance / startPrice;
    const finalValue = shares * endPrice;
    
    // Create mock result for buy and hold
    return {
      totalTrades: 1,
      winningTrades: totalReturn > 0 ? 1 : 0,
      losingTrades: totalReturn > 0 ? 0 : 1,
      winRate: totalReturn > 0 ? 1 : 0,
      totalReturn,
      annualizedReturn: this.calculateAnnualizedReturn(totalReturn, backtestConfig),
      totalProfit: Math.max(0, finalValue - backtestConfig.initialBalance),
      totalLoss: Math.max(0, backtestConfig.initialBalance - finalValue),
      profitFactor: totalReturn > 0 ? Infinity : 0,
      averageWin: totalReturn > 0 ? finalValue - backtestConfig.initialBalance : 0,
      averageLoss: totalReturn < 0 ? backtestConfig.initialBalance - finalValue : 0,
      maxDrawdown: this.calculateBuyHoldMaxDrawdown(sortedData, startPrice),
      maxDrawdownDuration: 0,
      sharpeRatio: 0, // Simplified
      sortinoRatio: 0, // Simplified
      calmarRatio: 0, // Simplified
      volatility: this.calculateBuyHoldVolatility(sortedData),
      maxConsecutiveWins: totalReturn > 0 ? 1 : 0,
      maxConsecutiveLosses: totalReturn < 0 ? 1 : 0,
      trades: [],
      equity: this.generateBuyHoldEquity(sortedData, shares),
      drawdownPeriods: []
    };
  }

  private async runDollarCostAveragingStrategy(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[]
  ): Promise<BacktestResult> {
    const sortedData = historicalData
      .filter(candle => 
        candle.timestamp >= backtestConfig.startDate && 
        candle.timestamp <= backtestConfig.endDate
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    const monthlyInvestment = backtestConfig.initialBalance / 12; // Spread over 12 months
    let totalShares = 0;
    let totalInvested = 0;
    const equity = [];

    // Invest monthly
    for (let i = 0; i < sortedData.length; i += Math.floor(sortedData.length / 12)) {
      if (i < sortedData.length && totalInvested < backtestConfig.initialBalance) {
        const candle = sortedData[i];
        const investmentAmount = Math.min(monthlyInvestment, backtestConfig.initialBalance - totalInvested);
        const shares = investmentAmount / candle.close;
        
        totalShares += shares;
        totalInvested += investmentAmount;
      }
    }

    const finalPrice = sortedData[sortedData.length - 1].close;
    const finalValue = totalShares * finalPrice;
    const totalReturn = (finalValue - backtestConfig.initialBalance) / backtestConfig.initialBalance;

    // Generate equity curve
    for (const candle of sortedData) {
      const currentValue = totalShares * candle.close + (backtestConfig.initialBalance - totalInvested);
      equity.push({
        timestamp: candle.timestamp,
        balance: currentValue,
        drawdown: 0 // Simplified
      });
    }

    return {
      totalTrades: 12,
      winningTrades: totalReturn > 0 ? 12 : 0,
      losingTrades: totalReturn > 0 ? 0 : 12,
      winRate: totalReturn > 0 ? 1 : 0,
      totalReturn,
      annualizedReturn: this.calculateAnnualizedReturn(totalReturn, backtestConfig),
      totalProfit: Math.max(0, finalValue - backtestConfig.initialBalance),
      totalLoss: Math.max(0, backtestConfig.initialBalance - finalValue),
      profitFactor: totalReturn > 0 ? Infinity : 0,
      averageWin: totalReturn > 0 ? (finalValue - backtestConfig.initialBalance) / 12 : 0,
      averageLoss: totalReturn < 0 ? (backtestConfig.initialBalance - finalValue) / 12 : 0,
      maxDrawdown: 0.1, // Simplified
      maxDrawdownDuration: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      volatility: 0.15, // Simplified
      maxConsecutiveWins: totalReturn > 0 ? 12 : 0,
      maxConsecutiveLosses: totalReturn < 0 ? 12 : 0,
      trades: [],
      equity,
      drawdownPeriods: []
    };
  }

  private async runRandomWalkStrategy(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[]
  ): Promise<BacktestResult> {
    // Simple random walk: 50% chance to buy/sell on each signal
    const randomTrades = Math.floor(Math.random() * 50) + 10; // 10-60 random trades
    const randomReturn = (Math.random() - 0.5) * 0.4; // -20% to +20% random return

    return {
      totalTrades: randomTrades,
      winningTrades: Math.floor(randomTrades * 0.5),
      losingTrades: Math.floor(randomTrades * 0.5),
      winRate: 0.5,
      totalReturn: randomReturn,
      annualizedReturn: this.calculateAnnualizedReturn(randomReturn, backtestConfig),
      totalProfit: Math.max(0, backtestConfig.initialBalance * randomReturn),
      totalLoss: Math.max(0, -backtestConfig.initialBalance * randomReturn),
      profitFactor: 1.0,
      averageWin: Math.max(0, backtestConfig.initialBalance * randomReturn) / Math.max(1, Math.floor(randomTrades * 0.5)),
      averageLoss: Math.max(0, -backtestConfig.initialBalance * randomReturn) / Math.max(1, Math.floor(randomTrades * 0.5)),
      maxDrawdown: 0.15,
      maxDrawdownDuration: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      volatility: 0.2,
      maxConsecutiveWins: 3,
      maxConsecutiveLosses: 3,
      trades: [],
      equity: [],
      drawdownPeriods: []
    };
  }

  private calculateRankings(
    strategies: Array<{
      name: string;
      results: BacktestResult;
      metrics: PerformanceMetrics;
    }>,
    rankingMetric: keyof PerformanceMetrics
  ): Array<{
    name: string;
    score: number;
    rank: number;
  }> {
    const rankings = strategies
      .map(strategy => ({
        name: strategy.name,
        score: strategy.metrics[rankingMetric]
      }))
      .sort((a, b) => b.score - a.score) // Descending order (higher is better)
      .map((item, index) => ({
        ...item,
        rank: index + 1
      }));

    return rankings;
  }

  private calculateCorrelations(
    strategies: Array<{
      name: string;
      results: BacktestResult;
      metrics: PerformanceMetrics;
    }>
  ): { [key: string]: { [key: string]: number } } {
    const correlations: { [key: string]: { [key: string]: number } } = {};

    for (let i = 0; i < strategies.length; i++) {
      const strategy1 = strategies[i];
      correlations[strategy1.name] = {};

      for (let j = 0; j < strategies.length; j++) {
        const strategy2 = strategies[j];

        if (i === j) {
          correlations[strategy1.name][strategy2.name] = 1.0;
        } else {
          const correlation = this.calculateReturnCorrelation(
            strategy1.results.equity,
            strategy2.results.equity
          );
          correlations[strategy1.name][strategy2.name] = correlation;
        }
      }
    }

    return correlations;
  }

  private calculateReturnCorrelation(
    equity1: Array<{ timestamp: number; balance: number; drawdown: number }>,
    equity2: Array<{ timestamp: number; balance: number; drawdown: number }>
  ): number {
    if (equity1.length < 2 || equity2.length < 2) return 0;

    // Calculate returns for both strategies
    const returns1 = [];
    const returns2 = [];

    const minLength = Math.min(equity1.length, equity2.length);

    for (let i = 1; i < minLength; i++) {
      const return1 = (equity1[i].balance - equity1[i - 1].balance) / equity1[i - 1].balance;
      const return2 = (equity2[i].balance - equity2[i - 1].balance) / equity2[i - 1].balance;
      
      returns1.push(return1);
      returns2.push(return2);
    }

    // Calculate Pearson correlation coefficient
    return this.pearsonCorrelation(returns1, returns2);
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = x[i] - meanX;
      const yDiff = y[i] - meanY;

      numerator += xDiff * yDiff;
      sumXSquared += xDiff * xDiff;
      sumYSquared += yDiff * yDiff;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private createPortfolioResult(
    individualResults: Array<{
      name: string;
      results: BacktestResult;
      metrics: PerformanceMetrics;
    }>,
    backtestConfig: BacktestConfig
  ): BacktestResult {
    if (individualResults.length === 0) {
      throw new Error('No individual results provided for portfolio creation');
    }

    // Equal weight allocation
    const weight = 1 / individualResults.length;
    const portfolioEquity = [];

    // Find common time points
    const maxLength = Math.max(...individualResults.map(r => r.results.equity.length));

    for (let i = 0; i < maxLength; i++) {
      let totalBalance = 0;
      let count = 0;
      let timestamp = 0;

      for (const result of individualResults) {
        if (i < result.results.equity.length) {
          totalBalance += result.results.equity[i].balance * weight;
          timestamp = result.results.equity[i].timestamp;
          count++;
        }
      }

      if (count > 0) {
        portfolioEquity.push({
          timestamp,
          balance: totalBalance,
          drawdown: 0 // Calculate separately
        });
      }
    }

    // Calculate portfolio metrics
    const initialBalance = backtestConfig.initialBalance;
    const finalBalance = portfolioEquity[portfolioEquity.length - 1].balance;
    const totalReturn = (finalBalance - initialBalance) / initialBalance;

    // Combine trades from all strategies
    const allTrades = individualResults.flatMap(r => r.results.trades);
    const winningTrades = allTrades.filter(t => t.isWinning).length;

    return {
      totalTrades: allTrades.length,
      winningTrades,
      losingTrades: allTrades.length - winningTrades,
      winRate: allTrades.length > 0 ? winningTrades / allTrades.length : 0,
      totalReturn,
      annualizedReturn: this.calculateAnnualizedReturn(totalReturn, backtestConfig),
      totalProfit: Math.max(0, finalBalance - initialBalance),
      totalLoss: Math.max(0, initialBalance - finalBalance),
      profitFactor: 1.0, // Simplified
      averageWin: 0, // Simplified
      averageLoss: 0, // Simplified
      maxDrawdown: this.calculateMaxDrawdownFromEquity(portfolioEquity),
      maxDrawdownDuration: 0, // Simplified
      sharpeRatio: 0, // Would need to recalculate
      sortinoRatio: 0, // Would need to recalculate
      calmarRatio: 0, // Would need to recalculate
      volatility: 0, // Would need to recalculate
      maxConsecutiveWins: 0, // Simplified
      maxConsecutiveLosses: 0, // Simplified
      trades: allTrades,
      equity: portfolioEquity,
      drawdownPeriods: []
    };
  }

  private normalizeMetrics(
    strategies: Array<{
      name: string;
      results: BacktestResult;
      metrics: PerformanceMetrics;
    }>
  ): PerformanceMetrics[] {
    const metricNames = Object.keys(strategies[0].metrics) as (keyof PerformanceMetrics)[];
    const normalized: PerformanceMetrics[] = [];

    // Find min/max for each metric
    const ranges: { [key in keyof PerformanceMetrics]?: { min: number; max: number } } = {};

    for (const metric of metricNames) {
      const values = strategies.map(s => s.metrics[metric]);
      ranges[metric] = {
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    // Normalize each strategy's metrics
    for (const strategy of strategies) {
      const normalizedMetrics = {} as PerformanceMetrics;

      for (const metric of metricNames) {
        const range = ranges[metric]!;
        const value = strategy.metrics[metric];
        
        // Min-max normalization to 0-1 scale
        normalizedMetrics[metric] = range.max > range.min 
          ? (value - range.min) / (range.max - range.min)
          : 0;
      }

      normalized.push(normalizedMetrics);
    }

    return normalized;
  }

  private calculateAnnualizedReturn(totalReturn: number, config: BacktestConfig): number {
    const timePeriodYears = (config.endDate - config.startDate) / (365.25 * 24 * 60 * 60 * 1000);
    return timePeriodYears > 0 ? Math.pow(1 + totalReturn, 1 / timePeriodYears) - 1 : 0;
  }

  private calculateBuyHoldMaxDrawdown(data: HistoricalCandle[], startPrice: number): number {
    let peak = startPrice;
    let maxDrawdown = 0;

    for (const candle of data) {
      if (candle.close > peak) {
        peak = candle.close;
      }
      
      const drawdown = (peak - candle.close) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private calculateBuyHoldVolatility(data: HistoricalCandle[]): number {
    if (data.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < data.length; i++) {
      const returnRate = (data[i].close - data[i - 1].close) / data[i - 1].close;
      returns.push(returnRate);
    }

    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  private generateBuyHoldEquity(
    data: HistoricalCandle[],
    shares: number
  ): Array<{ timestamp: number; balance: number; drawdown: number }> {
    const equity = [];
    let peak = data[0].close * shares;

    for (const candle of data) {
      const balance = shares * candle.close;
      if (balance > peak) peak = balance;
      
      const drawdown = (peak - balance) / peak;

      equity.push({
        timestamp: candle.timestamp,
        balance,
        drawdown
      });
    }

    return equity;
  }

  private calculateMaxDrawdownFromEquity(
    equity: Array<{ timestamp: number; balance: number; drawdown: number }>
  ): number {
    let peak = equity[0]?.balance || 0;
    let maxDrawdown = 0;

    for (const point of equity) {
      if (point.balance > peak) {
        peak = point.balance;
      }
      
      const drawdown = peak > 0 ? (peak - point.balance) / peak : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }
}