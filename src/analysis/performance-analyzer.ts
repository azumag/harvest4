import {
  BacktestResult,
  BacktestTrade,
  PerformanceMetrics,
  MarketCondition,
  MarketConditionPerformance,
  HistoricalDataPoint,
  DrawdownPoint
} from '../types/backtest';

export class PerformanceAnalyzer {
  analyzePerformance(result: BacktestResult): PerformanceMetrics {
    return {
      totalReturn: result.totalReturn,
      annualizedReturn: result.annualizedReturn,
      sharpeRatio: result.sharpeRatio,
      maxDrawdown: result.maxDrawdownPercent,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
      calmarRatio: result.calmarRatio,
      sortinoRatio: result.sortinoRatio,
      var95: result.var95,
      cvar95: result.cvar95,
      ulcerIndex: result.ulcerIndex
    };
  }

  analyzeTradePatterns(trades: BacktestTrade[]): TradeAnalysis {
    const completedTrades = trades.filter(t => t.profit !== undefined);
    
    return {
      totalTrades: completedTrades.length,
      winningTrades: completedTrades.filter(t => t.profit! > 0).length,
      losingTrades: completedTrades.filter(t => t.profit! < 0).length,
      averageWin: this.calculateAverageWin(completedTrades),
      averageLoss: this.calculateAverageLoss(completedTrades),
      largestWin: this.calculateLargestWin(completedTrades),
      largestLoss: this.calculateLargestLoss(completedTrades),
      averageHoldingPeriod: this.calculateAverageHoldingPeriod(completedTrades),
      winStreak: this.calculateWinStreak(completedTrades),
      loseStreak: this.calculateLoseStreak(completedTrades),
      profitDistribution: this.calculateProfitDistribution(completedTrades),
      timeDistribution: this.calculateTimeDistribution(completedTrades),
      exitReasonDistribution: this.calculateExitReasonDistribution(completedTrades)
    };
  }

  private calculateAverageWin(trades: BacktestTrade[]): number {
    const winningTrades = trades.filter(t => t.profit! > 0);
    return winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + t.profit!, 0) / winningTrades.length 
      : 0;
  }

  private calculateAverageLoss(trades: BacktestTrade[]): number {
    const losingTrades = trades.filter(t => t.profit! < 0);
    return losingTrades.length > 0 
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit!, 0) / losingTrades.length)
      : 0;
  }

  private calculateLargestWin(trades: BacktestTrade[]): number {
    const winningTrades = trades.filter(t => t.profit! > 0);
    return winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profit!)) : 0;
  }

  private calculateLargestLoss(trades: BacktestTrade[]): number {
    const losingTrades = trades.filter(t => t.profit! < 0);
    return losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profit!)) : 0;
  }

  private calculateAverageHoldingPeriod(trades: BacktestTrade[]): number {
    const tradesWithHolding = trades.filter(t => t.holdingPeriod !== undefined);
    return tradesWithHolding.length > 0 
      ? tradesWithHolding.reduce((sum, t) => sum + t.holdingPeriod!, 0) / tradesWithHolding.length 
      : 0;
  }

  private calculateWinStreak(trades: BacktestTrade[]): number {
    let maxStreak = 0;
    let currentStreak = 0;
    
    trades.forEach(trade => {
      if (trade.profit! > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    
    return maxStreak;
  }

  private calculateLoseStreak(trades: BacktestTrade[]): number {
    let maxStreak = 0;
    let currentStreak = 0;
    
    trades.forEach(trade => {
      if (trade.profit! < 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    
    return maxStreak;
  }

  private calculateProfitDistribution(trades: BacktestTrade[]): ProfitDistribution {
    const profits = trades.map(t => t.profit!);
    const sortedProfits = [...profits].sort((a, b) => a - b);
    
    return {
      min: sortedProfits[0] ?? 0,
      max: sortedProfits[sortedProfits.length - 1] ?? 0,
      median: this.calculateMedian(sortedProfits),
      mean: profits.reduce((sum, p) => sum + p, 0) / profits.length,
      stdDev: this.calculateStandardDeviation(profits),
      percentiles: {
        p10: this.calculatePercentile(sortedProfits, 0.1),
        p25: this.calculatePercentile(sortedProfits, 0.25),
        p75: this.calculatePercentile(sortedProfits, 0.75),
        p90: this.calculatePercentile(sortedProfits, 0.9)
      }
    };
  }

  private calculateTimeDistribution(trades: BacktestTrade[]): TimeDistribution {
    const hourlyProfits = new Array(24).fill(0);
    const dailyProfits = new Array(7).fill(0);
    const monthlyProfits = new Array(12).fill(0);
    
    trades.forEach(trade => {
      const date = new Date(trade.timestamp);
      const hour = date.getHours();
      const day = date.getDay();
      const month = date.getMonth();
      
      hourlyProfits[hour] += trade.profit!;
      dailyProfits[day] += trade.profit!;
      monthlyProfits[month] += trade.profit!;
    });
    
    return {
      hourlyProfits,
      dailyProfits,
      monthlyProfits,
      bestHour: hourlyProfits.indexOf(Math.max(...hourlyProfits)),
      bestDay: dailyProfits.indexOf(Math.max(...dailyProfits)),
      bestMonth: monthlyProfits.indexOf(Math.max(...monthlyProfits))
    };
  }

  private calculateExitReasonDistribution(trades: BacktestTrade[]): ExitReasonDistribution {
    const distribution = {
      stop_loss: 0,
      take_profit: 0,
      signal: 0,
      end_of_test: 0
    };
    
    trades.forEach(trade => {
      if (trade.exitReason) {
        distribution[trade.exitReason]++;
      }
    });
    
    return distribution;
  }

  private calculateMedian(sortedValues: number[]): number {
    const middle = Math.floor(sortedValues.length / 2);
    
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[middle - 1]! + sortedValues[middle]!) / 2;
    } else {
      return sortedValues[middle]!;
    }
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    const index = Math.floor(percentile * sortedValues.length);
    return sortedValues[index] ?? 0;
  }

  analyzeMarketConditions(
    data: HistoricalDataPoint[],
    result: BacktestResult
  ): MarketConditionPerformance[] {
    const conditions = this.identifyMarketConditions(data);
    const performance: MarketConditionPerformance[] = [];
    
    conditions.forEach(condition => {
      const conditionTrades = result.trades.filter(trade => 
        trade.timestamp >= condition.startDate && trade.timestamp <= condition.endDate
      );
      
      if (conditionTrades.length > 0) {
        const conditionResult = this.createSubResult(conditionTrades, result);
        const metrics = this.analyzePerformance(conditionResult);
        
        performance.push({
          condition,
          metrics,
          relativePerformance: this.calculateRelativePerformance(metrics, result)
        });
      }
    });
    
    return performance;
  }

  private identifyMarketConditions(data: HistoricalDataPoint[]): MarketCondition[] {
    const conditions: MarketCondition[] = [];
    const windowSize = 100; // 100 data points for condition analysis
    
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      const window = data.slice(i, i + windowSize);
      const condition = this.classifyMarketCondition(window);
      conditions.push(condition);
    }
    
    return conditions;
  }

  private classifyMarketCondition(window: HistoricalDataPoint[]): MarketCondition {
    const prices = window.map(d => d.close);
    const startPrice = prices[0]!;
    const endPrice = prices[prices.length - 1]!;
    const trend = (endPrice - startPrice) / startPrice;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
    }
    
    const volatility = this.calculateStandardDeviation(returns);
    const momentum = this.calculateMomentum(prices);
    const avgVolume = window.reduce((sum, d) => sum + d.volume, 0) / window.length;
    
    let condition: 'bull' | 'bear' | 'sideways' | 'volatile' | 'calm';
    
    if (volatility > 0.03) {
      condition = 'volatile';
    } else if (volatility < 0.01) {
      condition = 'calm';
    } else if (trend > 0.05) {
      condition = 'bull';
    } else if (trend < -0.05) {
      condition = 'bear';
    } else {
      condition = 'sideways';
    }
    
    return {
      name: `${condition}_${window[0]!.timestamp}`,
      startDate: window[0]!.timestamp,
      endDate: window[window.length - 1]!.timestamp,
      condition,
      characteristics: {
        volatility,
        trend,
        momentum,
        volume: avgVolume
      }
    };
  }

  private calculateMomentum(prices: number[]): number {
    const period = Math.min(10, prices.length - 1);
    const current = prices[prices.length - 1];
    const previous = prices[prices.length - 1 - period];
    
    return (previous && current && previous > 0) ? (current - previous) / previous : 0;
  }

  private createSubResult(trades: BacktestTrade[], originalResult: BacktestResult): BacktestResult {
    const completedTrades = trades.filter(t => t.profit !== undefined);
    const totalProfit = completedTrades.reduce((sum, t) => sum + t.profit!, 0);
    const winningTrades = completedTrades.filter(t => t.profit! > 0);
    const losingTrades = completedTrades.filter(t => t.profit! < 0);
    
    return {
      ...originalResult,
      trades,
      totalReturn: totalProfit,
      totalReturnPercent: (totalProfit / originalResult.initialBalance) * 100,
      totalTrades: completedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0
    };
  }

  private calculateRelativePerformance(metrics: PerformanceMetrics, overallResult: BacktestResult): number {
    const overallReturn = overallResult.totalReturnPercent;
    return overallReturn > 0 ? (metrics.totalReturn / overallReturn) - 1 : 0;
  }

  generateDetailedReport(result: BacktestResult, data: HistoricalDataPoint[]): PerformanceReport {
    const tradeAnalysis = this.analyzeTradePatterns(result.trades);
    const marketConditions = this.analyzeMarketConditions(data, result);
    const riskMetrics = this.calculateRiskMetrics(result);
    const performanceMetrics = this.analyzePerformance(result);
    
    return {
      summary: {
        totalReturn: result.totalReturn,
        totalReturnPercent: result.totalReturnPercent,
        sharpeRatio: result.sharpeRatio,
        maxDrawdown: result.maxDrawdownPercent,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        totalTrades: result.totalTrades
      },
      tradeAnalysis,
      marketConditions,
      riskMetrics,
      performanceMetrics,
      recommendations: this.generateRecommendations(result, tradeAnalysis)
    };
  }

  private calculateRiskMetrics(result: BacktestResult): RiskMetrics {
    return {
      maxDrawdown: result.maxDrawdownPercent,
      averageDrawdown: this.calculateAverageDrawdown(result.drawdownCurve),
      drawdownRecoveryTime: this.calculateDrawdownRecoveryTime(result.drawdownCurve),
      var95: result.var95,
      cvar95: result.cvar95,
      ulcerIndex: result.ulcerIndex,
      downside_deviation: this.calculateDownsideDeviation(result),
      beta: this.calculateBeta(result),
      alpha: this.calculateAlpha(result)
    };
  }

  private calculateAverageDrawdown(drawdownCurve: DrawdownPoint[]): number {
    const drawdowns = drawdownCurve.filter(d => d.drawdownPercent > 0);
    return drawdowns.length > 0 
      ? drawdowns.reduce((sum, d) => sum + d.drawdownPercent, 0) / drawdowns.length 
      : 0;
  }

  private calculateDrawdownRecoveryTime(drawdownCurve: DrawdownPoint[]): number {
    let maxRecoveryTime = 0;
    let currentRecoveryStart = 0;
    let inDrawdown = false;
    
    drawdownCurve.forEach((point, index) => {
      if (point.drawdownPercent > 0 && !inDrawdown) {
        inDrawdown = true;
        currentRecoveryStart = index;
      } else if (point.drawdownPercent === 0 && inDrawdown) {
        inDrawdown = false;
        const recoveryTime = index - currentRecoveryStart;
        maxRecoveryTime = Math.max(maxRecoveryTime, recoveryTime);
      }
    });
    
    return maxRecoveryTime;
  }

  private calculateDownsideDeviation(result: BacktestResult): number {
    const returns = [];
    for (let i = 1; i < result.equityCurve.length; i++) {
      const currentEquity = result.equityCurve[i]!.equity;
      const previousEquity = result.equityCurve[i - 1]!.equity;
      
      if (previousEquity > 0) {
        returns.push((currentEquity - previousEquity) / previousEquity);
      }
    }
    
    const negativeReturns = returns.filter(r => r < 0);
    
    if (negativeReturns.length === 0) return 0;
    
    const meanNegativeReturn = negativeReturns.reduce((sum, r) => sum + r, 0) / negativeReturns.length;
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r - meanNegativeReturn, 2), 0) / negativeReturns.length;
    
    return Math.sqrt(downsideVariance);
  }

  private calculateBeta(_result: BacktestResult): number {
    // Simplified beta calculation (would need benchmark data for accurate calculation)
    return 1.0;
  }

  private calculateAlpha(result: BacktestResult): number {
    // Simplified alpha calculation (would need benchmark data for accurate calculation)
    return result.annualizedReturn;
  }

  private generateRecommendations(result: BacktestResult, tradeAnalysis: TradeAnalysis): string[] {
    const recommendations: string[] = [];
    
    if (result.winRate < 50) {
      recommendations.push('Consider tightening entry criteria to improve win rate');
    }
    
    if (result.profitFactor < 1.5) {
      recommendations.push('Optimize risk-reward ratio by adjusting stop-loss and take-profit levels');
    }
    
    if (result.maxDrawdownPercent > 20) {
      recommendations.push('Implement stricter risk management to reduce maximum drawdown');
    }
    
    if (result.sharpeRatio < 1.0) {
      recommendations.push('Focus on reducing volatility while maintaining returns');
    }
    
    if (tradeAnalysis.averageHoldingPeriod > 86400000) { // 1 day in milliseconds
      recommendations.push('Consider reducing holding periods to improve capital efficiency');
    }
    
    return recommendations;
  }
}

interface TradeAnalysis {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageHoldingPeriod: number;
  winStreak: number;
  loseStreak: number;
  profitDistribution: ProfitDistribution;
  timeDistribution: TimeDistribution;
  exitReasonDistribution: ExitReasonDistribution;
}

interface ProfitDistribution {
  min: number;
  max: number;
  median: number;
  mean: number;
  stdDev: number;
  percentiles: {
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
}

interface TimeDistribution {
  hourlyProfits: number[];
  dailyProfits: number[];
  monthlyProfits: number[];
  bestHour: number;
  bestDay: number;
  bestMonth: number;
}

interface ExitReasonDistribution {
  stop_loss: number;
  take_profit: number;
  signal: number;
  end_of_test: number;
}

interface RiskMetrics {
  maxDrawdown: number;
  averageDrawdown: number;
  drawdownRecoveryTime: number;
  var95: number;
  cvar95: number;
  ulcerIndex: number;
  downside_deviation: number;
  beta: number;
  alpha: number;
}

interface PerformanceReport {
  summary: {
    totalReturn: number;
    totalReturnPercent: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
  };
  tradeAnalysis: TradeAnalysis;
  marketConditions: MarketConditionPerformance[];
  riskMetrics: RiskMetrics;
  performanceMetrics: PerformanceMetrics;
  recommendations: string[];
}