import { BacktestEngine } from '../backtest/backtest-engine';
import { PerformanceAnalyzer } from '../analysis/performance-analyzer';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import {
  HistoricalDataPoint,
  BacktestConfig,
  StrategyComparison,
  StrategyPerformance,
  StrategyRanking,
  RiskComparison,
  RobustnessComparison,
  MonteCarloResult,
  SensitivityAnalysis,
  PerformanceMetrics,
  MarketConditionPerformance
} from '../types/backtest';

export class StrategyComparator {
  private data: HistoricalDataPoint[];
  private backtestConfig: BacktestConfig;
  private performanceAnalyzer: PerformanceAnalyzer;

  constructor(data: HistoricalDataPoint[], backtestConfig: BacktestConfig) {
    this.data = data;
    this.backtestConfig = backtestConfig;
    this.performanceAnalyzer = new PerformanceAnalyzer();
  }

  async compareStrategies(
    strategies: Array<{ name: string; config: TradingStrategyConfig }>
  ): Promise<StrategyComparison> {
    console.log(`Comparing ${strategies.length} strategies...`);
    
    const strategyPerformances: StrategyPerformance[] = [];
    
    for (const strategy of strategies) {
      console.log(`Backtesting strategy: ${strategy.name}`);
      
      const backtest = new BacktestEngine(this.backtestConfig, strategy.config);
      const result = await backtest.runBacktest(this.data);
      
      const metrics = this.performanceAnalyzer.analyzePerformance(result);
      const marketConditionPerformance = this.performanceAnalyzer.analyzeMarketConditions(this.data, result);
      
      strategyPerformances.push({
        name: strategy.name,
        parameters: strategy.config,
        metrics,
        backtest: result,
        marketConditionPerformance
      });
    }
    
    const correlation = this.calculateCorrelationMatrix(strategyPerformances);
    const ranking = this.rankStrategies(strategyPerformances);
    const riskMetrics = this.calculateRiskComparison(strategyPerformances);
    const robustness = await this.calculateRobustnessComparison(strategyPerformances);
    
    return {
      strategies: strategyPerformances,
      correlation,
      ranking,
      riskMetrics,
      robustness
    };
  }

  private calculateCorrelationMatrix(strategies: StrategyPerformance[]): number[][] {
    const n = strategies.length;
    const correlation: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          correlation[i][j] = 1.0;
        } else {
          const returns1 = this.calculateDailyReturns(strategies[i].backtest.equityCurve);
          const returns2 = this.calculateDailyReturns(strategies[j].backtest.equityCurve);
          correlation[i][j] = this.pearsonCorrelation(returns1, returns2);
        }
      }
    }
    
    return correlation;
  }

  private calculateDailyReturns(equityCurve: any[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < equityCurve.length; i++) {
      const current = equityCurve[i].equity;
      const previous = equityCurve[i - 1].equity;
      
      if (previous > 0) {
        returns.push((current - previous) / previous);
      }
    }
    
    return returns;
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;
    
    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);
    
    const sumX = xSlice.reduce((sum, val) => sum + val, 0);
    const sumY = ySlice.reduce((sum, val) => sum + val, 0);
    const sumXY = xSlice.reduce((sum, val, i) => sum + val * ySlice[i], 0);
    const sumX2 = xSlice.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = ySlice.reduce((sum, val) => sum + val * val, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  private rankStrategies(strategies: StrategyPerformance[]): StrategyRanking[] {
    const rankings: StrategyRanking[] = [];
    
    strategies.forEach((strategy, index) => {
      const returnScore = this.normalizeScore(strategy.metrics.totalReturn, strategies.map(s => s.metrics.totalReturn));
      const riskScore = 1 - this.normalizeScore(strategy.metrics.maxDrawdown, strategies.map(s => s.metrics.maxDrawdown));
      const consistencyScore = this.normalizeScore(strategy.metrics.winRate, strategies.map(s => s.metrics.winRate));
      const robustnessScore = this.normalizeScore(strategy.metrics.sharpeRatio, strategies.map(s => s.metrics.sharpeRatio));
      
      const totalScore = (returnScore * 0.3) + (riskScore * 0.25) + (consistencyScore * 0.2) + (robustnessScore * 0.25);
      
      rankings.push({
        name: strategy.name,
        rank: 0, // Will be set after sorting
        score: totalScore,
        scoreComponents: {
          return: returnScore,
          risk: riskScore,
          consistency: consistencyScore,
          robustness: robustnessScore
        }
      });
    });
    
    rankings.sort((a, b) => b.score - a.score);
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
    });
    
    return rankings;
  }

  private normalizeScore(value: number, values: number[]): number {
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    if (max === min) return 0.5;
    
    return (value - min) / (max - min);
  }

  private calculateRiskComparison(strategies: StrategyPerformance[]): RiskComparison {
    const n = strategies.length;
    const correlationMatrix = this.calculateCorrelationMatrix(strategies);
    
    const individualRisks = strategies.map(s => s.metrics.maxDrawdown);
    const avgCorrelation = this.calculateAverageCorrelation(correlationMatrix);
    
    const portfolioRisk = this.calculatePortfolioRisk(individualRisks, avgCorrelation);
    const diversificationBenefit = 1 - (portfolioRisk / Math.max(...individualRisks));
    
    const portfolioMetrics = this.calculatePortfolioMetrics(strategies);
    
    return {
      correlationMatrix,
      diversificationBenefit,
      portfolioMetrics,
      individualRisks,
      portfolioRisk
    };
  }

  private calculateAverageCorrelation(correlationMatrix: number[][]): number {
    let sum = 0;
    let count = 0;
    
    for (let i = 0; i < correlationMatrix.length; i++) {
      for (let j = i + 1; j < correlationMatrix[i].length; j++) {
        sum += correlationMatrix[i][j];
        count++;
      }
    }
    
    return count > 0 ? sum / count : 0;
  }

  private calculatePortfolioRisk(individualRisks: number[], avgCorrelation: number): number {
    const n = individualRisks.length;
    const avgRisk = individualRisks.reduce((sum, risk) => sum + risk, 0) / n;
    
    return Math.sqrt(avgRisk * avgRisk * (1 + (n - 1) * avgCorrelation));
  }

  private calculatePortfolioMetrics(strategies: StrategyPerformance[]): PerformanceMetrics {
    const n = strategies.length;
    const weight = 1 / n; // Equal weighting
    
    const totalReturn = strategies.reduce((sum, s) => sum + s.metrics.totalReturn * weight, 0);
    const annualizedReturn = strategies.reduce((sum, s) => sum + s.metrics.annualizedReturn * weight, 0);
    const sharpeRatio = strategies.reduce((sum, s) => sum + s.metrics.sharpeRatio * weight, 0);
    const maxDrawdown = Math.max(...strategies.map(s => s.metrics.maxDrawdown));
    const winRate = strategies.reduce((sum, s) => sum + s.metrics.winRate * weight, 0);
    const profitFactor = strategies.reduce((sum, s) => sum + s.metrics.profitFactor * weight, 0);
    const calmarRatio = strategies.reduce((sum, s) => sum + s.metrics.calmarRatio * weight, 0);
    const sortinoRatio = strategies.reduce((sum, s) => sum + s.metrics.sortinoRatio * weight, 0);
    const var95 = strategies.reduce((sum, s) => sum + s.metrics.var95 * weight, 0);
    const cvar95 = strategies.reduce((sum, s) => sum + s.metrics.cvar95 * weight, 0);
    const ulcerIndex = strategies.reduce((sum, s) => sum + s.metrics.ulcerIndex * weight, 0);
    
    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      calmarRatio,
      sortinoRatio,
      var95,
      cvar95,
      ulcerIndex
    };
  }

  private async calculateRobustnessComparison(strategies: StrategyPerformance[]): Promise<RobustnessComparison> {
    const strategyNames = strategies.map(s => s.name);
    const whiteRealityCheck = strategies.map(s => this.calculateWhiteRealityCheck(s));
    const monteCarloAnalysis = await this.performMonteCarloAnalysis(strategies);
    const sensitivity = await this.performSensitivityAnalysis(strategies);
    
    return {
      strategies: strategyNames,
      whiteRealityCheck,
      monteCarloAnalysis,
      sensitivity
    };
  }

  private calculateWhiteRealityCheck(strategy: StrategyPerformance): number {
    const returns = this.calculateDailyReturns(strategy.backtest.equityCurve);
    const positiveReturns = returns.filter(r => r > 0).length;
    const totalReturns = returns.length;
    
    return totalReturns > 0 ? positiveReturns / totalReturns : 0;
  }

  private async performMonteCarloAnalysis(strategies: StrategyPerformance[]): Promise<MonteCarloResult[]> {
    const results: MonteCarloResult[] = [];
    const simulations = 1000;
    
    for (const strategy of strategies) {
      const returns = this.calculateDailyReturns(strategy.backtest.equityCurve);
      const originalReturn = strategy.metrics.totalReturn;
      
      const simulationResults: number[] = [];
      
      for (let i = 0; i < simulations; i++) {
        const shuffledReturns = this.shuffleArray([...returns]);
        const simulatedReturn = this.calculateCumulativeReturn(shuffledReturns);
        simulationResults.push(simulatedReturn);
      }
      
      simulationResults.sort((a, b) => a - b);
      
      const betterThanOriginal = simulationResults.filter(r => r > originalReturn).length;
      const pValue = betterThanOriginal / simulations;
      
      const confidence95Index = Math.floor(0.95 * simulations);
      const confidence99Index = Math.floor(0.99 * simulations);
      
      results.push({
        strategy: strategy.name,
        originalReturn,
        simulationResults,
        pValue,
        confidence95: [
          simulationResults[Math.floor(0.025 * simulations)],
          simulationResults[confidence95Index]
        ],
        confidence99: [
          simulationResults[Math.floor(0.005 * simulations)],
          simulationResults[confidence99Index]
        ]
      });
    }
    
    return results;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private calculateCumulativeReturn(returns: number[]): number {
    let cumulativeReturn = 1;
    
    for (const ret of returns) {
      cumulativeReturn *= (1 + ret);
    }
    
    return (cumulativeReturn - 1) * 100;
  }

  private async performSensitivityAnalysis(strategies: StrategyPerformance[]): Promise<SensitivityAnalysis[]> {
    const results: SensitivityAnalysis[] = [];
    
    for (const strategy of strategies) {
      const parameters = Object.keys(strategy.parameters);
      
      for (const param of parameters) {
        const originalValue = strategy.parameters[param as keyof TradingStrategyConfig] as number;
        const values: number[] = [];
        const returns: number[] = [];
        
        // Test parameter sensitivity with ±20% variations
        for (let i = -20; i <= 20; i += 5) {
          const variation = i / 100;
          const newValue = originalValue * (1 + variation);
          values.push(newValue);
          
          const modifiedConfig = {
            ...strategy.parameters,
            [param]: newValue
          };
          
          try {
            const backtest = new BacktestEngine(this.backtestConfig, modifiedConfig);
            const result = await backtest.runBacktest(this.data);
            returns.push(result.totalReturnPercent);
          } catch (error) {
            returns.push(0);
          }
        }
        
        const sensitivity = this.calculateSensitivity(values, returns);
        const stability = this.calculateStability(returns);
        
        results.push({
          strategy: strategy.name,
          parameter: param,
          values,
          returns,
          sensitivity,
          stability
        });
      }
    }
    
    return results;
  }

  private calculateSensitivity(values: number[], returns: number[]): number {
    if (values.length !== returns.length || values.length < 2) return 0;
    
    const correlation = this.pearsonCorrelation(values, returns);
    return Math.abs(correlation);
  }

  private calculateStability(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? 1 / (1 + stdDev) : 1;
  }

  async compareToBenchmark(
    strategies: StrategyPerformance[],
    benchmarkType: 'buy_and_hold' | 'market_index' = 'buy_and_hold'
  ): Promise<BenchmarkComparison> {
    const benchmark = await this.createBenchmark(benchmarkType);
    
    const comparisons: StrategyBenchmarkComparison[] = [];
    
    for (const strategy of strategies) {
      const alpha = strategy.metrics.totalReturn - benchmark.metrics.totalReturn;
      const beta = this.calculateBeta(strategy, benchmark);
      const informationRatio = this.calculateInformationRatio(strategy, benchmark);
      const trackingError = this.calculateTrackingError(strategy, benchmark);
      
      comparisons.push({
        strategy: strategy.name,
        alpha,
        beta,
        informationRatio,
        trackingError,
        outperformance: alpha > 0,
        riskAdjustedOutperformance: strategy.metrics.sharpeRatio > benchmark.metrics.sharpeRatio
      });
    }
    
    return {
      benchmark,
      comparisons,
      summary: this.createBenchmarkSummary(comparisons)
    };
  }

  private async createBenchmark(benchmarkType: 'buy_and_hold' | 'market_index'): Promise<StrategyPerformance> {
    if (benchmarkType === 'buy_and_hold') {
      return this.createBuyAndHoldBenchmark();
    } else {
      throw new Error('Market index benchmark not implemented');
    }
  }

  private async createBuyAndHoldBenchmark(): Promise<StrategyPerformance> {
    const startPrice = this.data[0].close;
    const endPrice = this.data[this.data.length - 1].close;
    const totalReturn = ((endPrice - startPrice) / startPrice) * 100;
    
    const equityCurve = this.data.map(point => ({
      timestamp: point.timestamp,
      equity: (point.close / startPrice) * this.backtestConfig.initialBalance,
      drawdown: 0,
      drawdownPercent: 0
    }));
    
    const maxEquity = Math.max(...equityCurve.map(e => e.equity));
    const minEquity = Math.min(...equityCurve.map(e => e.equity));
    const maxDrawdown = ((maxEquity - minEquity) / maxEquity) * 100;
    
    const returns = this.calculateDailyReturns(equityCurve);
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance * 252);
    const sharpeRatio = volatility > 0 ? (meanReturn * 252) / volatility : 0;
    
    return {
      name: 'Buy and Hold',
      parameters: {} as TradingStrategyConfig,
      metrics: {
        totalReturn,
        annualizedReturn: totalReturn,
        sharpeRatio,
        maxDrawdown,
        winRate: totalReturn > 0 ? 100 : 0,
        profitFactor: totalReturn > 0 ? Infinity : 0,
        calmarRatio: maxDrawdown > 0 ? totalReturn / maxDrawdown : 0,
        sortinoRatio: sharpeRatio,
        var95: 0,
        cvar95: 0,
        ulcerIndex: 0
      },
      backtest: {
        equityCurve,
        totalReturnPercent: totalReturn,
        maxDrawdownPercent: maxDrawdown,
        sharpeRatio,
        totalTrades: 1,
        winRate: totalReturn > 0 ? 100 : 0
      } as any,
      marketConditionPerformance: []
    };
  }

  private calculateBeta(strategy: StrategyPerformance, benchmark: StrategyPerformance): number {
    const strategyReturns = this.calculateDailyReturns(strategy.backtest.equityCurve);
    const benchmarkReturns = this.calculateDailyReturns(benchmark.backtest.equityCurve);
    
    const covariance = this.calculateCovariance(strategyReturns, benchmarkReturns);
    const benchmarkVariance = this.calculateVariance(benchmarkReturns);
    
    return benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;
  }

  private calculateInformationRatio(strategy: StrategyPerformance, benchmark: StrategyPerformance): number {
    const strategyReturns = this.calculateDailyReturns(strategy.backtest.equityCurve);
    const benchmarkReturns = this.calculateDailyReturns(benchmark.backtest.equityCurve);
    
    const trackingError = this.calculateTrackingError(strategy, benchmark);
    const excessReturn = strategy.metrics.totalReturn - benchmark.metrics.totalReturn;
    
    return trackingError > 0 ? excessReturn / trackingError : 0;
  }

  private calculateTrackingError(strategy: StrategyPerformance, benchmark: StrategyPerformance): number {
    const strategyReturns = this.calculateDailyReturns(strategy.backtest.equityCurve);
    const benchmarkReturns = this.calculateDailyReturns(benchmark.backtest.equityCurve);
    
    const differences = strategyReturns.map((ret, i) => ret - (benchmarkReturns[i] || 0));
    const variance = this.calculateVariance(differences);
    
    return Math.sqrt(variance * 252);
  }

  private calculateCovariance(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    const meanX = x.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
    
    let covariance = 0;
    for (let i = 0; i < n; i++) {
      covariance += (x[i] - meanX) * (y[i] - meanY);
    }
    
    return covariance / n;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  private createBenchmarkSummary(comparisons: StrategyBenchmarkComparison[]): BenchmarkSummary {
    const outperformingStrategies = comparisons.filter(c => c.outperformance).length;
    const riskAdjustedOutperforming = comparisons.filter(c => c.riskAdjustedOutperformance).length;
    const averageAlpha = comparisons.reduce((sum, c) => sum + c.alpha, 0) / comparisons.length;
    const averageBeta = comparisons.reduce((sum, c) => sum + c.beta, 0) / comparisons.length;
    const averageInformationRatio = comparisons.reduce((sum, c) => sum + c.informationRatio, 0) / comparisons.length;
    
    return {
      outperformingStrategies,
      riskAdjustedOutperforming,
      averageAlpha,
      averageBeta,
      averageInformationRatio,
      totalStrategies: comparisons.length
    };
  }
}

interface BenchmarkComparison {
  benchmark: StrategyPerformance;
  comparisons: StrategyBenchmarkComparison[];
  summary: BenchmarkSummary;
}

interface StrategyBenchmarkComparison {
  strategy: string;
  alpha: number;
  beta: number;
  informationRatio: number;
  trackingError: number;
  outperformance: boolean;
  riskAdjustedOutperformance: boolean;
}

interface BenchmarkSummary {
  outperformingStrategies: number;
  riskAdjustedOutperforming: number;
  averageAlpha: number;
  averageBeta: number;
  averageInformationRatio: number;
  totalStrategies: number;
}