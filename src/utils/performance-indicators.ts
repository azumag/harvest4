export interface TradePerformance {
  entryDate: number;
  exitDate: number;
  pnl: number;
  returnRate: number;
}

export interface TradeAnalysis {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  largestWin: number;
  largestLoss: number;
  averageHoldingPeriod: number;
}

export interface DrawdownInfo {
  drawdown: number;
  peak: number;
  trough: number;
  peakDate?: number;
  troughDate?: number;
  duration?: number;
}

export interface PortfolioStatistics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  var95: number;
  var99: number;
}

export interface RollingMetrics {
  rollingSharpe: number[];
  rollingVolatility: number[];
  rollingSortino: number[];
}

export class PerformanceIndicators {
  private readonly TRADING_DAYS_PER_YEAR = 252;
  private readonly RISK_FREE_RATE = 0.001; // Default 0.1% risk-free rate

  // Sharpe Ratio Calculation
  calculateSharpeRatio(returns: number[], riskFreeRate: number = this.RISK_FREE_RATE): number {
    if (returns.length === 0) return 0;

    const excessReturns = returns.map(r => r - riskFreeRate);
    const avgExcessReturn = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;
    const volatility = this.calculateVolatility(excessReturns);

    return volatility === 0 ? 0 : avgExcessReturn / volatility;
  }

  // Sortino Ratio (only considers downside volatility)
  calculateSortinoRatio(returns: number[], riskFreeRate: number = this.RISK_FREE_RATE): number {
    if (returns.length === 0) return 0;

    const excessReturns = returns.map(r => r - riskFreeRate);
    const avgExcessReturn = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;
    
    const negativeReturns = excessReturns.filter(r => r < 0);
    if (negativeReturns.length === 0) return Infinity;

    const downsideVolatility = this.calculateVolatility(negativeReturns);
    return downsideVolatility === 0 ? 0 : avgExcessReturn / downsideVolatility;
  }

  // Value at Risk Calculation (Historical method)
  calculateVaR(returns: number[], confidenceLevel: number): number {
    if (returns.length === 0) return 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    
    return sortedReturns[index] || 0;
  }

  // Parametric VaR (assumes normal distribution)
  calculateParametricVaR(returns: number[], confidenceLevel: number): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const volatility = this.calculateVolatility(returns);
    
    // Z-score for confidence level (e.g., 1.645 for 95%, 2.326 for 99%)
    const zScore = this.getZScore(confidenceLevel);
    
    return mean - (zScore * volatility);
  }

  private getZScore(confidenceLevel: number): number {
    // Approximate Z-scores for common confidence levels
    if (confidenceLevel >= 0.99) return 2.326;
    if (confidenceLevel >= 0.975) return 1.96;
    if (confidenceLevel >= 0.95) return 1.645;
    if (confidenceLevel >= 0.90) return 1.282;
    return 1.645; // Default to 95%
  }

  // Maximum Drawdown Calculation
  calculateMaxDrawdown(portfolioValues: number[]): DrawdownInfo {
    if (portfolioValues.length === 0) {
      return { drawdown: 0, peak: 0, trough: 0 };
    }

    let maxDrawdown = 0;
    let peak = portfolioValues[0] || 0;
    let trough = portfolioValues[0] || 0;
    let peakIndex = 0;
    let troughIndex = 0;

    for (let i = 1; i < portfolioValues.length; i++) {
      const currentValue = portfolioValues[i];
      
      if (currentValue !== undefined && currentValue > peak) {
        peak = currentValue;
        peakIndex = i;
      }
      
      if (currentValue !== undefined && peak > 0) {
        const drawdown = (peak - currentValue) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          trough = currentValue;
          troughIndex = i;
        }
      }
    }

    return {
      drawdown: maxDrawdown,
      peak,
      trough,
      peakDate: peakIndex,
      troughDate: troughIndex,
      duration: troughIndex - peakIndex,
    };
  }

  // Current Drawdown (from recent peak)
  calculateCurrentDrawdown(portfolioValues: number[]): number {
    if (portfolioValues.length === 0) return 0;

    const currentValue = portfolioValues[portfolioValues.length - 1];
    const peak = Math.max(...portfolioValues);
    
    return peak > 0 && currentValue !== undefined ? (peak - currentValue) / peak : 0;
  }

  // Calmar Ratio (Annual return / Max Drawdown)
  calculateCalmarRatio(annualizedReturn: number, portfolioValues: number[]): number {
    const maxDrawdown = this.calculateMaxDrawdown(portfolioValues).drawdown;
    return maxDrawdown === 0 ? Infinity : annualizedReturn / maxDrawdown;
  }

  // Information Ratio (excess return vs benchmark / tracking error)
  calculateInformationRatio(portfolioReturns: number[], benchmarkReturns: number[]): number {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
      return 0;
    }

    const excessReturns = portfolioReturns.map((r, i) => r - (benchmarkReturns[i] || 0));
    const avgExcessReturn = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;
    const trackingError = this.calculateVolatility(excessReturns);

    return trackingError === 0 ? 0 : avgExcessReturn / trackingError;
  }

  // Return Calculations
  calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const current = prices[i];
      const previous = prices[i - 1];
      if (current !== undefined && previous !== undefined && previous !== 0) {
        returns.push((current - previous) / previous);
      }
    }
    return returns;
  }

  annualizeReturn(totalReturn: number, periods: number): number {
    const periodsPerYear = this.TRADING_DAYS_PER_YEAR / periods;
    return Math.pow(1 + totalReturn, periodsPerYear) - 1;
  }

  calculateCAGR(startValue: number, endValue: number, years: number): number {
    if (startValue <= 0 || years <= 0) return 0;
    return Math.pow(endValue / startValue, 1 / years) - 1;
  }

  // Volatility Calculation (Standard Deviation)
  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  // Trade Analysis
  analyzeTrades(trades: TradePerformance[]): TradeAnalysis {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        largestWin: 0,
        largestLoss: 0,
        averageHoldingPeriod: 0,
      };
    }

    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalWinPnL = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLossPnL = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    
    const avgWin = winningTrades.length > 0 ? totalWinPnL / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLossPnL / losingTrades.length : 0;
    
    const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : Infinity;
    
    const { maxConsecutiveWins, maxConsecutiveLosses } = this.calculateConsecutiveStats(trades);
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;
    
    const avgHoldingPeriod = trades.reduce((sum, t) => sum + (t.exitDate - t.entryDate), 0) / trades.length;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: winningTrades.length / trades.length,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      largestWin,
      largestLoss,
      averageHoldingPeriod: avgHoldingPeriod / (1000 * 60 * 60 * 24), // Convert to days
    };
  }

  private calculateConsecutiveStats(trades: TradePerformance[]): { maxConsecutiveWins: number; maxConsecutiveLosses: number } {
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const trade of trades) {
      if (trade.pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      } else if (trade.pnl < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      }
    }

    return { maxConsecutiveWins, maxConsecutiveLosses };
  }

  // Portfolio Statistics
  calculatePortfolioStatistics(portfolioValues: number[], returns: number[]): PortfolioStatistics {
    if (portfolioValues.length < 2 || returns.length === 0) {
      return {
        totalReturn: 0,
        annualizedReturn: 0,
        volatility: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        calmarRatio: 0,
        var95: 0,
        var99: 0,
      };
    }

    const startValue = portfolioValues[0];
    const endValue = portfolioValues[portfolioValues.length - 1];
    
    if (startValue === undefined || endValue === undefined || startValue === 0) {
      return {
        totalReturn: 0,
        annualizedReturn: 0,
        volatility: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        calmarRatio: 0,
        var95: 0,
        var99: 0,
      };
    }
    
    const totalReturn = (endValue - startValue) / startValue;
    const periods = portfolioValues.length - 1;
    const annualizedReturn = this.annualizeReturn(totalReturn, periods);
    
    const volatility = this.calculateVolatility(returns);
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);
    
    const maxDrawdownInfo = this.calculateMaxDrawdown(portfolioValues);
    const calmarRatio = this.calculateCalmarRatio(annualizedReturn, portfolioValues);
    
    const var95 = this.calculateVaR(returns, 0.95);
    const var99 = this.calculateVaR(returns, 0.99);

    return {
      totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdownInfo.drawdown,
      calmarRatio,
      var95,
      var99,
    };
  }

  // Rolling Metrics
  calculateRollingMetrics(returns: number[], windowSize: number): RollingMetrics {
    const rollingSharpe: number[] = [];
    const rollingVolatility: number[] = [];
    const rollingSortino: number[] = [];

    for (let i = windowSize - 1; i < returns.length; i++) {
      const windowReturns = returns.slice(i - windowSize + 1, i + 1);
      
      rollingSharpe.push(this.calculateSharpeRatio(windowReturns));
      rollingVolatility.push(this.calculateVolatility(windowReturns));
      rollingSortino.push(this.calculateSortinoRatio(windowReturns));
    }

    return {
      rollingSharpe,
      rollingVolatility,
      rollingSortino,
    };
  }

  // Utility Methods
  calculateBeta(portfolioReturns: number[], marketReturns: number[]): number {
    if (portfolioReturns.length !== marketReturns.length || portfolioReturns.length === 0) {
      return 0;
    }

    const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const marketMean = marketReturns.reduce((sum, r) => sum + r, 0) / marketReturns.length;
    
    let covariance = 0;
    let marketVariance = 0;

    for (let i = 0; i < portfolioReturns.length; i++) {
      const portfolioReturn = portfolioReturns[i];
      const marketReturn = marketReturns[i];
      
      if (portfolioReturn !== undefined && marketReturn !== undefined) {
        const portfolioDeviation = portfolioReturn - portfolioMean;
        const marketDeviation = marketReturn - marketMean;
        
        covariance += portfolioDeviation * marketDeviation;
        marketVariance += marketDeviation * marketDeviation;
      }
    }

    covariance /= portfolioReturns.length;
    marketVariance /= marketReturns.length;

    return marketVariance === 0 ? 0 : covariance / marketVariance;
  }

  calculateCorrelation(returns1: number[], returns2: number[]): number {
    if (returns1.length !== returns2.length || returns1.length === 0) {
      return 0;
    }

    const mean1 = returns1.reduce((sum, r) => sum + r, 0) / returns1.length;
    const mean2 = returns2.reduce((sum, r) => sum + r, 0) / returns2.length;
    
    let numerator = 0;
    let sum1 = 0;
    let sum2 = 0;

    for (let i = 0; i < returns1.length; i++) {
      const return1 = returns1[i];
      const return2 = returns2[i];
      
      if (return1 !== undefined && return2 !== undefined) {
        const dev1 = return1 - mean1;
        const dev2 = return2 - mean2;
        
        numerator += dev1 * dev2;
        sum1 += dev1 * dev1;
        sum2 += dev2 * dev2;
      }
    }

    const denominator = Math.sqrt(sum1 * sum2);
    return denominator === 0 ? 0 : numerator / denominator;
  }
}