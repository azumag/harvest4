import { 
  BacktestResult, 
  BacktestTrade, 
  PerformanceMetrics,
  MarketCondition,
  BacktestReport
} from '../types/backtest';

export class PerformanceAnalyzer {
  private riskFreeRate: number = 0.02; // 2% annual risk-free rate
  private benchmarkReturn: number = 0.10; // 10% annual benchmark return

  calculatePerformanceMetrics(result: BacktestResult, periodDays: number): PerformanceMetrics {
    const annualizedReturn = this.calculateAnnualizedReturn(result.totalReturn, periodDays);
    const volatility = this.calculateVolatility(result.trades);
    const sharpeRatio = this.calculateSharpeRatio(annualizedReturn, volatility);
    const sortinoRatio = this.calculateSortinoRatio(result.trades, periodDays);
    const calmarRatio = this.calculateCalmarRatio(annualizedReturn, result.maxDrawdown);
    const profitFactor = this.calculateProfitFactor(result.trades);
    const expectancy = this.calculateExpectancy(result.trades);
    const beta = this.calculateBeta(result.trades);
    const alpha = this.calculateAlpha(annualizedReturn, beta);
    const informationRatio = this.calculateInformationRatio(result.trades);
    const trackingError = this.calculateTrackingError(result.trades);

    return {
      totalReturn: result.totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: result.maxDrawdown,
      calmarRatio,
      winRate: result.winRate,
      profitFactor,
      expectancy,
      beta,
      alpha,
      informationRatio,
      trackingError
    };
  }

  private calculateAnnualizedReturn(totalReturn: number, periodDays: number): number {
    if (periodDays <= 0) return 0;
    const years = periodDays / 365;
    return Math.pow(1 + totalReturn, 1 / years) - 1;
  }

  private calculateVolatility(trades: BacktestTrade[]): number {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.profit / (t.amount * t.entryPrice));
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
  }

  private calculateSharpeRatio(annualizedReturn: number, volatility: number): number {
    if (volatility === 0) return 0;
    return (annualizedReturn - this.riskFreeRate) / volatility;
  }

  private calculateSortinoRatio(trades: BacktestTrade[], periodDays: number): number {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.profit / (t.amount * t.entryPrice));
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    // Calculate downside deviation
    const negativeReturns = returns.filter(r => r < 0);
    if (negativeReturns.length === 0) return Infinity;
    
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252);
    
    const annualizedReturn = this.calculateAnnualizedReturn(avgReturn, periodDays);
    return (annualizedReturn - this.riskFreeRate) / downsideDeviation;
  }

  private calculateCalmarRatio(annualizedReturn: number, maxDrawdown: number): number {
    if (maxDrawdown === 0) return Infinity;
    return annualizedReturn / maxDrawdown;
  }

  private calculateProfitFactor(trades: BacktestTrade[]): number {
    const grossProfit = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));
    
    return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
  }

  private calculateExpectancy(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit < 0);
    
    const winRate = winningTrades.length / trades.length;
    const lossRate = losingTrades.length / trades.length;
    
    const avgWin = winningTrades.length > 0 ? 
      winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length : 0;
    
    const avgLoss = losingTrades.length > 0 ? 
      losingTrades.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losingTrades.length : 0;
    
    return (winRate * avgWin) - (lossRate * avgLoss);
  }

  private calculateBeta(trades: BacktestTrade[]): number {
    // Simplified beta calculation - in reality you'd need market data
    const returns = trades.map(t => t.profit / (t.amount * t.entryPrice));
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    // Simulate market returns (this should be actual market data)
    const marketReturns = returns.map(() => (Math.random() - 0.5) * 0.02);
    const avgMarketReturn = marketReturns.reduce((sum, r) => sum + r, 0) / marketReturns.length;
    
    if (returns.length !== marketReturns.length) return 1;
    
    let covariance = 0;
    let marketVariance = 0;
    
    for (let i = 0; i < returns.length; i++) {
      covariance += (returns[i] - avgReturn) * (marketReturns[i] - avgMarketReturn);
      marketVariance += Math.pow(marketReturns[i] - avgMarketReturn, 2);
    }
    
    return marketVariance === 0 ? 1 : covariance / marketVariance;
  }

  private calculateAlpha(annualizedReturn: number, beta: number): number {
    return annualizedReturn - (this.riskFreeRate + beta * (this.benchmarkReturn - this.riskFreeRate));
  }

  private calculateInformationRatio(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    
    const returns = trades.map(t => t.profit / (t.amount * t.entryPrice));
    const benchmarkReturns = returns.map(() => this.benchmarkReturn / 252);
    
    const activeReturns = returns.map((r, i) => r - (benchmarkReturns[i] || 0));
    const avgActiveReturn = activeReturns.reduce((sum, r) => sum + r, 0) / activeReturns.length;
    
    if (activeReturns.length < 2) return 0;
    
    const trackingError = this.calculateTrackingError(trades);
    return trackingError === 0 ? 0 : avgActiveReturn / trackingError;
  }

  private calculateTrackingError(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    
    const returns = trades.map(t => t.profit / (t.amount * t.entryPrice));
    const benchmarkReturns = returns.map(() => this.benchmarkReturn / 252);
    
    const activeReturns = returns.map((r, i) => r - (benchmarkReturns[i] || 0));
    const avgActiveReturn = activeReturns.reduce((sum, r) => sum + r, 0) / activeReturns.length;
    
    if (activeReturns.length < 2) return 0;
    
    const variance = activeReturns.reduce((sum, r) => sum + Math.pow(r - avgActiveReturn, 2), 0) / (activeReturns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252);
  }

  analyzeMarketConditions(trades: BacktestTrade[]): MarketCondition[] {
    const conditions: MarketCondition[] = [];
    
    if (trades.length === 0) return conditions;
    
    const sortedTrades = [...trades].sort((a, b) => a.entryTime - b.entryTime);
    const totalPeriod = sortedTrades[sortedTrades.length - 1].exitTime - sortedTrades[0].entryTime;
    const periodSize = totalPeriod / 10; // Divide into 10 periods
    
    for (let i = 0; i < 10; i++) {
      const periodStart = sortedTrades[0].entryTime + (i * periodSize);
      const periodEnd = periodStart + periodSize;
      
      const periodTrades = sortedTrades.filter(t => 
        t.entryTime >= periodStart && t.entryTime < periodEnd
      );
      
      if (periodTrades.length === 0) continue;
      
      const avgReturn = periodTrades.reduce((sum, t) => sum + t.profit, 0) / periodTrades.length;
      const volatility = this.calculatePeriodVolatility(periodTrades);
      const volume = periodTrades.reduce((sum, t) => sum + t.amount, 0) / periodTrades.length;
      
      const trend = this.determineTrend(periodTrades);
      const volatilityLevel = this.determineVolatilityLevel(volatility);
      const volumeLevel = this.determineVolumeLevel(volume);
      
      conditions.push({
        period: { start: periodStart, end: periodEnd },
        trend,
        volatility: volatilityLevel,
        volume: volumeLevel,
        characteristics: this.determineCharacteristics(periodTrades, avgReturn, volatility)
      });
    }
    
    return conditions;
  }

  private calculatePeriodVolatility(trades: BacktestTrade[]): number {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.profit / (t.amount * t.entryPrice));
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance);
  }

  private determineTrend(trades: BacktestTrade[]): 'bullish' | 'bearish' | 'sideways' {
    const priceChanges = trades.map(t => t.exitPrice - t.entryPrice);
    const avgPriceChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
    
    if (avgPriceChange > 0.005) return 'bullish';
    if (avgPriceChange < -0.005) return 'bearish';
    return 'sideways';
  }

  private determineVolatilityLevel(volatility: number): 'low' | 'medium' | 'high' {
    if (volatility < 0.01) return 'low';
    if (volatility < 0.03) return 'medium';
    return 'high';
  }

  private determineVolumeLevel(volume: number): 'low' | 'medium' | 'high' {
    if (volume < 0.01) return 'low';
    if (volume < 0.1) return 'medium';
    return 'high';
  }

  private determineCharacteristics(trades: BacktestTrade[], avgReturn: number, volatility: number): string[] {
    const characteristics: string[] = [];
    
    if (avgReturn > 0.01) characteristics.push('High profitability');
    if (avgReturn < -0.01) characteristics.push('High losses');
    if (volatility > 0.03) characteristics.push('High volatility');
    if (volatility < 0.01) characteristics.push('Low volatility');
    
    const winRate = trades.filter(t => t.profit > 0).length / trades.length;
    if (winRate > 0.7) characteristics.push('High win rate');
    if (winRate < 0.3) characteristics.push('Low win rate');
    
    return characteristics;
  }

  generateDetailedReport(result: BacktestResult, periodDays: number): BacktestReport {
    const metrics = this.calculatePerformanceMetrics(result, periodDays);
    const marketConditions = this.analyzeMarketConditions(result.trades);
    
    return {
      summary: result,
      metrics,
      marketConditions,
      monthlyReturns: this.calculateMonthlyReturns(result.trades),
      yearlyReturns: this.calculateYearlyReturns(result.trades),
      drawdownPeriods: this.calculateDrawdownPeriods(result.trades),
      tradeDistribution: this.calculateTradeDistribution(result.trades),
      riskMetrics: this.calculateRiskMetrics(result.trades)
    };
  }

  private calculateMonthlyReturns(trades: BacktestTrade[]): Array<{ month: string; return: number }> {
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

  private calculateYearlyReturns(trades: BacktestTrade[]): Array<{ year: number; return: number }> {
    const yearlyReturns: Map<number, number> = new Map();
    
    for (const trade of trades) {
      const year = new Date(trade.entryTime).getFullYear();
      
      const currentReturn = yearlyReturns.get(year) || 0;
      const tradeReturn = trade.profit / (trade.amount * trade.entryPrice);
      yearlyReturns.set(year, currentReturn + tradeReturn);
    }
    
    return Array.from(yearlyReturns.entries()).map(([year, return_]) => ({
      year,
      return: return_
    }));
  }

  private calculateDrawdownPeriods(trades: BacktestTrade[]): Array<{ start: number; end: number; depth: number; duration: number }> {
    const drawdownPeriods: Array<{ start: number; end: number; depth: number; duration: number }> = [];
    
    if (trades.length === 0) return drawdownPeriods;
    
    let peak = 0;
    let currentDrawdown = 0;
    let drawdownStart = 0;
    let runningBalance = 0;
    
    for (const trade of trades) {
      runningBalance += trade.profit;
      
      if (runningBalance > peak) {
        // New peak - end current drawdown if any
        if (currentDrawdown > 0) {
          drawdownPeriods.push({
            start: drawdownStart,
            end: trade.entryTime,
            depth: currentDrawdown,
            duration: trade.entryTime - drawdownStart
          });
        }
        
        peak = runningBalance;
        currentDrawdown = 0;
      } else {
        // In drawdown
        const drawdown = (peak - runningBalance) / peak;
        if (currentDrawdown === 0) {
          drawdownStart = trade.entryTime;
        }
        currentDrawdown = Math.max(currentDrawdown, drawdown);
      }
    }
    
    return drawdownPeriods;
  }

  private calculateTradeDistribution(trades: BacktestTrade[]): {
    profitable: number;
    unprofitable: number;
    breakeven: number;
    profitDistribution: number[];
    lossDistribution: number[];
  } {
    const profitable = trades.filter(t => t.profit > 0).length;
    const unprofitable = trades.filter(t => t.profit < 0).length;
    const breakeven = trades.filter(t => t.profit === 0).length;
    
    const profits = trades.filter(t => t.profit > 0).map(t => t.profit);
    const losses = trades.filter(t => t.profit < 0).map(t => Math.abs(t.profit));
    
    return {
      profitable,
      unprofitable,
      breakeven,
      profitDistribution: this.createDistribution(profits),
      lossDistribution: this.createDistribution(losses)
    };
  }

  private createDistribution(values: number[]): number[] {
    if (values.length === 0) return [];
    
    const sorted = values.sort((a, b) => a - b);
    const min = sorted[0] || 0;
    const max = sorted[sorted.length - 1] || 0;
    const buckets = 10;
    const bucketSize = (max - min) / buckets;
    
    const distribution = new Array(buckets).fill(0);
    
    for (const value of values) {
      const bucketIndex = Math.min(Math.floor((value - min) / bucketSize), buckets - 1);
      distribution[bucketIndex]++;
    }
    
    return distribution;
  }

  private calculateRiskMetrics(trades: BacktestTrade[]): {
    valueAtRisk: number;
    conditionalVaR: number;
    skewness: number;
    kurtosis: number;
    tailRatio: number;
  } {
    const returns = trades.map(t => t.profit / (t.amount * t.entryPrice));
    
    return {
      valueAtRisk: this.calculateVaR(returns, 0.05),
      conditionalVaR: this.calculateCVaR(returns, 0.05),
      skewness: this.calculateSkewness(returns),
      kurtosis: this.calculateKurtosis(returns),
      tailRatio: this.calculateTailRatio(returns)
    };
  }

  private calculateVaR(returns: number[], confidence: number): number {
    const sorted = returns.sort((a, b) => a - b);
    const index = Math.floor(returns.length * confidence);
    return sorted[index] || 0;
  }

  private calculateCVaR(returns: number[], confidence: number): number {
    const sorted = returns.sort((a, b) => a - b);
    const index = Math.floor(returns.length * confidence);
    const tailReturns = sorted.slice(0, index);
    
    if (tailReturns.length === 0) return 0;
    return tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;
  }

  private calculateSkewness(returns: number[]): number {
    if (returns.length < 3) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const skewness = returns.reduce((sum, r) => sum + Math.pow((r - mean) / stdDev, 3), 0) / returns.length;
    return skewness;
  }

  private calculateKurtosis(returns: number[]): number {
    if (returns.length < 4) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const kurtosis = returns.reduce((sum, r) => sum + Math.pow((r - mean) / stdDev, 4), 0) / returns.length;
    return kurtosis - 3; // Excess kurtosis
  }

  private calculateTailRatio(returns: number[]): number {
    const sorted = returns.sort((a, b) => b - a);
    const topDecile = sorted.slice(0, Math.floor(sorted.length * 0.1));
    const bottomDecile = sorted.slice(-Math.floor(sorted.length * 0.1));
    
    if (topDecile.length === 0 || bottomDecile.length === 0) return 0;
    
    const avgTop = topDecile.reduce((sum, r) => sum + r, 0) / topDecile.length;
    const avgBottom = bottomDecile.reduce((sum, r) => sum + r, 0) / bottomDecile.length;
    
    return avgBottom === 0 ? 0 : avgTop / Math.abs(avgBottom);
  }
}