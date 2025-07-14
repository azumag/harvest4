import { BacktestEngine } from '../backtest/backtest-engine';
import { HistoricalDataManager } from '../data/historical-data-manager';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { PerformanceAnalyzer } from '../analysis/performance-analyzer';
import { 
  BacktestResult, 
  BacktestConfig, 
  StrategyComparison, 
  PerformanceMetrics 
} from '../types/backtest';

export interface StrategyDefinition {
  name: string;
  config: TradingStrategyConfig;
  description: string;
}

export class StrategyComparator {
  private dataManager: HistoricalDataManager;
  private baseConfig: BacktestConfig;
  private analyzer: PerformanceAnalyzer;

  constructor(dataManager: HistoricalDataManager, baseConfig: BacktestConfig) {
    this.dataManager = dataManager;
    this.baseConfig = baseConfig;
    this.analyzer = new PerformanceAnalyzer();
  }

  async compareStrategies(
    strategies: StrategyDefinition[],
    pair: string,
    timeframe: string = '1m'
  ): Promise<StrategyComparison[]> {
    console.log(`Comparing ${strategies.length} strategies...`);
    
    const comparisons: StrategyComparison[] = [];
    
    for (let i = 0; i < strategies.length; i++) {
      const strategyDef = strategies[i];
      console.log(`Testing strategy: ${strategyDef.name}`);
      
      try {
        const strategy = new TradingStrategy(strategyDef.config);
        const engine = new BacktestEngine(this.dataManager, strategy, this.baseConfig);
        
        const result = await engine.runBacktest(pair, timeframe);
        const periodDays = (this.baseConfig.endDate - this.baseConfig.startDate) / (24 * 60 * 60 * 1000);
        const metrics = this.analyzer.calculatePerformanceMetrics(result, periodDays);
        
        const score = this.calculateCompositeScore(metrics);
        
        comparisons.push({
          name: strategyDef.name,
          result,
          metrics,
          rank: 0, // Will be set after sorting
          score
        });
        
        console.log(`${strategyDef.name} completed. Score: ${score.toFixed(3)}`);
      } catch (error) {
        console.error(`Error testing strategy ${strategyDef.name}:`, error);
      }
    }
    
    // Sort by score and assign ranks
    comparisons.sort((a, b) => b.score - a.score);
    comparisons.forEach((comp, index) => {
      comp.rank = index + 1;
    });
    
    console.log('Strategy comparison completed');
    return comparisons;
  }

  async compareToBenchmark(
    strategy: StrategyDefinition,
    pair: string,
    timeframe: string = '1m'
  ): Promise<{
    strategy: StrategyComparison;
    buyAndHold: StrategyComparison;
    outperformance: number;
    riskAdjustedOutperformance: number;
  }> {
    console.log(`Comparing ${strategy.name} to buy-and-hold benchmark...`);
    
    // Test the strategy
    const tradingStrategy = new TradingStrategy(strategy.config);
    const engine = new BacktestEngine(this.dataManager, tradingStrategy, this.baseConfig);
    const strategyResult = await engine.runBacktest(pair, timeframe);
    
    // Create buy-and-hold benchmark
    const buyAndHoldResult = await this.createBuyAndHoldBenchmark(pair, timeframe);
    
    const periodDays = (this.baseConfig.endDate - this.baseConfig.startDate) / (24 * 60 * 60 * 1000);
    
    const strategyMetrics = this.analyzer.calculatePerformanceMetrics(strategyResult, periodDays);
    const benchmarkMetrics = this.analyzer.calculatePerformanceMetrics(buyAndHoldResult, periodDays);
    
    const strategyComparison: StrategyComparison = {
      name: strategy.name,
      result: strategyResult,
      metrics: strategyMetrics,
      rank: 1,
      score: this.calculateCompositeScore(strategyMetrics)
    };
    
    const buyAndHoldComparison: StrategyComparison = {
      name: 'Buy and Hold',
      result: buyAndHoldResult,
      metrics: benchmarkMetrics,
      rank: 2,
      score: this.calculateCompositeScore(benchmarkMetrics)
    };
    
    const outperformance = strategyMetrics.totalReturn - benchmarkMetrics.totalReturn;
    const riskAdjustedOutperformance = strategyMetrics.sharpeRatio - benchmarkMetrics.sharpeRatio;
    
    return {
      strategy: strategyComparison,
      buyAndHold: buyAndHoldComparison,
      outperformance,
      riskAdjustedOutperformance
    };
  }

  private async createBuyAndHoldBenchmark(pair: string, timeframe: string): Promise<BacktestResult> {
    // Get historical data
    const historicalData = await this.dataManager.fetchHistoricalData(
      pair,
      timeframe,
      this.baseConfig.startDate,
      this.baseConfig.endDate
    );
    
    if (historicalData.length === 0) {
      throw new Error('No historical data available for buy-and-hold benchmark');
    }
    
    // Calculate buy-and-hold return
    const startPrice = historicalData[0].price;
    const endPrice = historicalData[historicalData.length - 1].price;
    const shares = this.baseConfig.initialBalance / startPrice;
    const finalValue = shares * endPrice;
    const totalReturn = (finalValue - this.baseConfig.initialBalance) / this.baseConfig.initialBalance;
    const totalProfit = finalValue - this.baseConfig.initialBalance;
    
    // Create a single trade representing the buy-and-hold strategy
    const buyAndHoldTrade = {
      id: 'buy_and_hold',
      entryTime: historicalData[0].timestamp,
      exitTime: historicalData[historicalData.length - 1].timestamp,
      entryPrice: startPrice,
      exitPrice: endPrice,
      side: 'buy' as const,
      amount: shares,
      profit: totalProfit,
      commission: 0,
      slippage: 0,
      reason: 'Buy and hold strategy'
    };
    
    // Calculate metrics
    const maxDrawdown = this.calculateBuyAndHoldMaxDrawdown(historicalData, startPrice, shares);
    
    return {
      totalTrades: 1,
      winningTrades: totalProfit > 0 ? 1 : 0,
      losingTrades: totalProfit <= 0 ? 1 : 0,
      winRate: totalProfit > 0 ? 1 : 0,
      totalProfit,
      totalReturn,
      maxDrawdown,
      sharpeRatio: this.calculateBuyAndHoldSharpe(historicalData, startPrice, shares),
      profitFactor: totalProfit > 0 ? Infinity : 0,
      averageWin: totalProfit > 0 ? totalProfit : 0,
      averageLoss: totalProfit <= 0 ? Math.abs(totalProfit) : 0,
      largestWin: totalProfit > 0 ? totalProfit : 0,
      largestLoss: totalProfit <= 0 ? Math.abs(totalProfit) : 0,
      consecutiveWins: totalProfit > 0 ? 1 : 0,
      consecutiveLosses: totalProfit <= 0 ? 1 : 0,
      trades: [buyAndHoldTrade]
    };
  }

  private calculateBuyAndHoldMaxDrawdown(
    historicalData: any[],
    initialPrice: number,
    shares: number
  ): number {
    const initialValue = shares * initialPrice;
    let maxValue = initialValue;
    let maxDrawdown = 0;
    
    for (const dataPoint of historicalData) {
      const currentValue = shares * dataPoint.price;
      
      if (currentValue > maxValue) {
        maxValue = currentValue;
      }
      
      const drawdown = (maxValue - currentValue) / maxValue;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateBuyAndHoldSharpe(
    historicalData: any[],
    initialPrice: number,
    shares: number
  ): number {
    if (historicalData.length < 2) return 0;
    
    const returns: number[] = [];
    let previousValue = shares * initialPrice;
    
    for (let i = 1; i < historicalData.length; i++) {
      const currentValue = shares * historicalData[i].price;
      const return_ = (currentValue - previousValue) / previousValue;
      returns.push(return_);
      previousValue = currentValue;
    }
    
    if (returns.length < 2) return 0;
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    return stdDev === 0 ? 0 : avgReturn / stdDev;
  }

  private calculateCompositeScore(metrics: PerformanceMetrics): number {
    // Composite score balancing return, risk, and consistency
    const returnScore = Math.max(0, metrics.totalReturn) * 0.3;
    const sharpeScore = Math.max(0, metrics.sharpeRatio) * 0.25;
    const winRateScore = metrics.winRate * 0.2;
    const drawdownScore = Math.max(0, 1 - metrics.maxDrawdown) * 0.15;
    const profitFactorScore = Math.min(5, metrics.profitFactor) / 5 * 0.1;
    
    return returnScore + sharpeScore + winRateScore + drawdownScore + profitFactorScore;
  }

  getDefaultStrategies(): StrategyDefinition[] {
    return [
      {
        name: 'Conservative',
        config: {
          buyThreshold: 0.01,
          sellThreshold: 0.01,
          minProfitMargin: 0.02,
          maxTradeAmount: 5000,
          riskTolerance: 0.5
        },
        description: 'Conservative strategy with low risk and small position sizes'
      },
      {
        name: 'Moderate',
        config: {
          buyThreshold: 0.02,
          sellThreshold: 0.02,
          minProfitMargin: 0.01,
          maxTradeAmount: 10000,
          riskTolerance: 0.7
        },
        description: 'Moderate strategy balancing risk and return'
      },
      {
        name: 'Aggressive',
        config: {
          buyThreshold: 0.03,
          sellThreshold: 0.03,
          minProfitMargin: 0.005,
          maxTradeAmount: 20000,
          riskTolerance: 0.9
        },
        description: 'Aggressive strategy with higher risk tolerance'
      },
      {
        name: 'Scalping',
        config: {
          buyThreshold: 0.005,
          sellThreshold: 0.005,
          minProfitMargin: 0.002,
          maxTradeAmount: 3000,
          riskTolerance: 0.6
        },
        description: 'High-frequency scalping strategy'
      },
      {
        name: 'Trend Following',
        config: {
          buyThreshold: 0.04,
          sellThreshold: 0.04,
          minProfitMargin: 0.015,
          maxTradeAmount: 15000,
          riskTolerance: 0.8
        },
        description: 'Strategy focused on following strong trends'
      }
    ];
  }

  generateComparisonReport(comparisons: StrategyComparison[]): string {
    const report = ['=== STRATEGY COMPARISON REPORT ===\n'];
    
    // Summary table
    report.push('PERFORMANCE SUMMARY:');
    report.push('Rank | Strategy      | Return   | Sharpe  | Win Rate | Max DD  | Score');
    report.push('-----|---------------|----------|---------|----------|---------|-------');
    
    for (const comp of comparisons) {
      const rank = comp.rank.toString().padStart(4);
      const name = comp.name.padEnd(13);
      const return_ = (comp.metrics.totalReturn * 100).toFixed(1).padStart(7) + '%';
      const sharpe = comp.metrics.sharpeRatio.toFixed(2).padStart(7);
      const winRate = (comp.metrics.winRate * 100).toFixed(1).padStart(7) + '%';
      const maxDD = (comp.metrics.maxDrawdown * 100).toFixed(1).padStart(6) + '%';
      const score = comp.score.toFixed(3).padStart(7);
      
      report.push(`${rank} | ${name} | ${return_} | ${sharpe} | ${winRate} | ${maxDD} | ${score}`);
    }
    
    report.push('\n');
    
    // Detailed analysis
    report.push('DETAILED ANALYSIS:\n');
    
    for (const comp of comparisons) {
      report.push(`${comp.rank}. ${comp.name.toUpperCase()}`);
      report.push(`   Total Return: ${(comp.metrics.totalReturn * 100).toFixed(2)}%`);
      report.push(`   Annualized Return: ${(comp.metrics.annualizedReturn * 100).toFixed(2)}%`);
      report.push(`   Sharpe Ratio: ${comp.metrics.sharpeRatio.toFixed(3)}`);
      report.push(`   Sortino Ratio: ${comp.metrics.sortinoRatio.toFixed(3)}`);
      report.push(`   Win Rate: ${(comp.metrics.winRate * 100).toFixed(1)}%`);
      report.push(`   Profit Factor: ${comp.metrics.profitFactor.toFixed(2)}`);
      report.push(`   Max Drawdown: ${(comp.metrics.maxDrawdown * 100).toFixed(2)}%`);
      report.push(`   Total Trades: ${comp.result.totalTrades}`);
      report.push(`   Average Win: ${comp.result.averageWin.toFixed(2)} JPY`);
      report.push(`   Average Loss: ${comp.result.averageLoss.toFixed(2)} JPY`);
      report.push(`   Largest Win: ${comp.result.largestWin.toFixed(2)} JPY`);
      report.push(`   Largest Loss: ${comp.result.largestLoss.toFixed(2)} JPY`);
      report.push('');
    }
    
    // Best strategy recommendation
    if (comparisons.length > 0) {
      const best = comparisons[0];
      report.push('RECOMMENDATION:');
      report.push(`Best performing strategy: ${best.name}`);
      report.push(`This strategy achieved a ${(best.metrics.totalReturn * 100).toFixed(2)}% return`);
      report.push(`with a Sharpe ratio of ${best.metrics.sharpeRatio.toFixed(3)}`);
      report.push(`and a maximum drawdown of ${(best.metrics.maxDrawdown * 100).toFixed(2)}%`);
      
      if (best.metrics.sharpeRatio > 1.5) {
        report.push('✓ Excellent risk-adjusted returns');
      } else if (best.metrics.sharpeRatio > 1.0) {
        report.push('✓ Good risk-adjusted returns');
      } else {
        report.push('⚠ Consider risk management improvements');
      }
      
      if (best.metrics.maxDrawdown < 0.1) {
        report.push('✓ Low maximum drawdown');
      } else if (best.metrics.maxDrawdown < 0.2) {
        report.push('⚠ Moderate maximum drawdown');
      } else {
        report.push('⚠ High maximum drawdown - review risk controls');
      }
    }
    
    report.push('\n=== END OF REPORT ===');
    
    return report.join('\n');
  }

  async monthlyPerformanceComparison(
    strategies: StrategyDefinition[],
    pair: string,
    timeframe: string = '1m'
  ): Promise<Map<string, Array<{ month: string; return: number }>>> {
    const monthlyPerformance = new Map<string, Array<{ month: string; return: number }>>();
    
    for (const strategy of strategies) {
      const tradingStrategy = new TradingStrategy(strategy.config);
      const engine = new BacktestEngine(this.dataManager, tradingStrategy, this.baseConfig);
      const result = await engine.runBacktest(pair, timeframe);
      
      const monthlyReturns = this.calculateMonthlyReturns(result.trades);
      monthlyPerformance.set(strategy.name, monthlyReturns);
    }
    
    return monthlyPerformance;
  }

  private calculateMonthlyReturns(trades: any[]): Array<{ month: string; return: number }> {
    const monthlyReturns: Map<string, number> = new Map();
    
    for (const trade of trades) {
      const date = new Date(trade.entryTime);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const currentReturn = monthlyReturns.get(month) || 0;
      const tradeReturn = trade.profit / (trade.amount * trade.entryPrice);
      monthlyReturns.set(month, currentReturn + tradeReturn);
    }
    
    return Array.from(monthlyReturns.entries()).map(([month, return_]) => ({
      month,
      return: return_
    }));
  }

  correlationAnalysis(comparisons: StrategyComparison[]): Map<string, Map<string, number>> {
    const correlations = new Map<string, Map<string, number>>();
    
    for (let i = 0; i < comparisons.length; i++) {
      const strategy1 = comparisons[i];
      const correlationMap = new Map<string, number>();
      
      for (let j = 0; j < comparisons.length; j++) {
        const strategy2 = comparisons[j];
        
        if (i === j) {
          correlationMap.set(strategy2.name, 1.0);
        } else {
          const correlation = this.calculateCorrelation(
            strategy1.result.trades,
            strategy2.result.trades
          );
          correlationMap.set(strategy2.name, correlation);
        }
      }
      
      correlations.set(strategy1.name, correlationMap);
    }
    
    return correlations;
  }

  private calculateCorrelation(trades1: any[], trades2: any[]): number {
    // Simplified correlation calculation based on monthly returns
    const returns1 = this.calculateMonthlyReturns(trades1);
    const returns2 = this.calculateMonthlyReturns(trades2);
    
    // Find common months
    const commonMonths = returns1
      .filter(r1 => returns2.find(r2 => r2.month === r1.month))
      .map(r => r.month);
    
    if (commonMonths.length < 2) return 0;
    
    const values1 = commonMonths.map(month => 
      returns1.find(r => r.month === month)?.return || 0
    );
    const values2 = commonMonths.map(month => 
      returns2.find(r => r.month === month)?.return || 0
    );
    
    const mean1 = values1.reduce((sum, v) => sum + v, 0) / values1.length;
    const mean2 = values2.reduce((sum, v) => sum + v, 0) / values2.length;
    
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;
    
    for (let i = 0; i < values1.length; i++) {
      const diff1 = values1[i] - mean1;
      const diff2 = values2[i] - mean2;
      
      numerator += diff1 * diff2;
      denominator1 += diff1 * diff1;
      denominator2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(denominator1 * denominator2);
    return denominator === 0 ? 0 : numerator / denominator;
  }
}