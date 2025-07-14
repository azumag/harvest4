import { 
  BacktestResult, 
  PerformanceMetrics, 
  MarketCondition, 
  HistoricalCandle,
  BacktestTrade,
  EquityPoint
} from '../types/backtest';

export interface PerformanceReport {
  metrics: PerformanceMetrics;
  marketConditions: MarketCondition[];
  tradeAnalysis: TradeAnalysis;
  periodAnalysis: PeriodAnalysis[];
  riskofreturns: RiskReturnAnalysis;
  monthlyReturns: MonthlyReturns[];
  drawdownAnalysis: DrawdownAnalysis;
}

export interface TradeAnalysis {
  averageWinSize: number;
  averageLossSize: number;
  largestWin: number;
  largestLoss: number;
  averageHoldingPeriod: number;
  winningStreaks: number[];
  losingStreaks: number[];
  tradeFrequency: number;
  profitabilityByHour: { [hour: number]: number };
  profitabilityByDayOfWeek: { [day: number]: number };
  profitabilityByMonth: { [month: number]: number };
}

export interface PeriodAnalysis {
  period: string;
  startDate: number;
  endDate: number;
  returns: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  trades: number;
  winRate: number;
}

export interface RiskReturnAnalysis {
  returnDistribution: number[];
  riskMetrics: {
    beta: number;
    alpha: number;
    informationRatio: number;
    trackingError: number;
  };
  tailRisk: {
    var95: number;
    var99: number;
    cvar95: number;
    cvar99: number;
    expectedShortfall: number;
  };
}

export interface MonthlyReturns {
  year: number;
  month: number;
  returns: number;
  trades: number;
  winRate: number;
}

export interface DrawdownAnalysis {
  totalDrawdowns: number;
  averageDrawdown: number;
  averageRecoveryTime: number;
  maxRecoveryTime: number;
  drawdownFrequency: number;
  underWaterPeriods: number;
}

export class PerformanceAnalyzer {
  
  calculateMetrics(result: BacktestResult): PerformanceMetrics {
    const returns = this.calculateReturns(result.equity);
    
    return {
      sharpeRatio: result.sharpeRatio,
      sortinoRatio: result.sortinoRatio,
      calmarRatio: result.calmarRatio,
      maxDrawdown: result.maxDrawdown,
      volatility: result.volatility,
      skewness: this.calculateSkewness(returns),
      kurtosis: this.calculateKurtosis(returns),
      var95: this.calculateVaR(returns, 0.95),
      cvar95: this.calculateCVaR(returns, 0.95),
      ulcerIndex: this.calculateUlcerIndex(result.equity),
      recoveryFactor: this.calculateRecoveryFactor(result),
      profitFactor: result.profitFactor,
      expectedValue: this.calculateExpectedValue(result.trades),
      gainToPainRatio: this.calculateGainToPainRatio(result.equity),
      lakeRatio: this.calculateLakeRatio(result.equity),
      totalReturn: result.totalReturn,
      winRate: result.winRate
    };
  }

  generateReport(
    result: BacktestResult, 
    historicalData: HistoricalCandle[]
  ): PerformanceReport {
    const metrics = this.calculateMetrics(result);
    const marketConditions = this.analyzeMarketConditions(historicalData);
    const tradeAnalysis = this.analyzeTradePatterns(result.trades);
    const periodAnalysis = this.analyzePeriods(result, historicalData);
    const riskReturns = this.analyzeRiskReturns(result);
    const monthlyReturns = this.calculateMonthlyReturns(result);
    const drawdownAnalysis = this.analyzeDrawdowns(result);

    return {
      metrics,
      marketConditions,
      tradeAnalysis,
      periodAnalysis,
      riskofreturns: riskReturns,
      monthlyReturns,
      drawdownAnalysis
    };
  }

  private calculateReturns(equity: EquityPoint[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < equity.length; i++) {
      const current = equity[i];
      const previous = equity[i - 1];
      if (current && previous && previous.balance !== 0) {
        const returnRate = (current.balance - previous.balance) / previous.balance;
        returns.push(returnRate);
      }
    }
    
    return returns;
  }

  private calculateSkewness(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const skewness = returns.reduce((sum, ret) => 
      sum + Math.pow((ret - mean) / stdDev, 3), 0
    ) / returns.length;
    
    return skewness;
  }

  private calculateKurtosis(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const kurtosis = returns.reduce((sum, ret) => 
      sum + Math.pow((ret - mean) / stdDev, 4), 0
    ) / returns.length - 3; // Excess kurtosis
    
    return kurtosis;
  }

  private calculateVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    
    return Math.abs(sortedReturns[index] || 0);
  }

  private calculateCVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    const tailReturns = sortedReturns.slice(0, index + 1);
    
    if (tailReturns.length === 0) return 0;
    
    const cvar = tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length;
    return Math.abs(cvar);
  }

  private calculateUlcerIndex(equity: EquityPoint[]): number {
    if (equity.length === 0) return 0;
    
    const firstPoint = equity[0];
    if (!firstPoint) return 0;
    
    let peak = firstPoint.balance;
    let ulcerSum = 0;
    
    for (const point of equity) {
      if (point.balance > peak) {
        peak = point.balance;
      }
      
      const drawdown = (peak - point.balance) / peak;
      ulcerSum += drawdown * drawdown;
    }
    
    return Math.sqrt(ulcerSum / equity.length);
  }

  private calculateRecoveryFactor(result: BacktestResult): number {
    return result.maxDrawdown > 0 ? result.totalReturn / result.maxDrawdown : 0;
  }

  private calculateExpectedValue(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    
    const totalPnL = trades.reduce((sum, trade) => sum + trade.pnl, 0);
    return totalPnL / trades.length;
  }

  private calculateGainToPainRatio(equity: EquityPoint[]): number {
    if (equity.length === 0) return 0;
    
    const returns = this.calculateReturns(equity);
    const gains = returns.filter(ret => ret > 0).reduce((sum, ret) => sum + ret, 0);
    const pains = Math.abs(returns.filter(ret => ret < 0).reduce((sum, ret) => sum + ret, 0));
    
    return pains > 0 ? gains / pains : 0;
  }

  private calculateLakeRatio(equity: EquityPoint[]): number {
    if (equity.length === 0) return 0;
    
    let peak = equity[0].balance;
    let totalUnderwater = 0;
    let totalPeriods = 0;
    
    for (const point of equity) {
      if (point.balance > peak) {
        peak = point.balance;
      }
      
      if (point.balance < peak) {
        totalUnderwater++;
      }
      totalPeriods++;
    }
    
    return totalPeriods > 0 ? totalUnderwater / totalPeriods : 0;
  }

  private analyzeMarketConditions(historicalData: HistoricalCandle[]): MarketCondition[] {
    const conditions: MarketCondition[] = [];
    const windowSize = 30; // 30-day windows
    
    for (let i = windowSize; i < historicalData.length; i += windowSize) {
      const window = historicalData.slice(i - windowSize, i);
      const startPrice = window[0].close;
      const endPrice = window[window.length - 1].close;
      const returns = (endPrice - startPrice) / startPrice;
      
      // Calculate volatility
      const prices = window.map(candle => candle.close);
      const priceReturns = prices.slice(1).map((price, idx) => 
        (price - prices[idx]) / prices[idx]
      );
      const volatility = this.calculateStandardDeviation(priceReturns);
      
      // Calculate average volume
      const avgVolume = window.reduce((sum, candle) => sum + candle.volume, 0) / window.length;
      
      // Classify market condition
      const trend = returns > 0.05 ? 'bull' : returns < -0.05 ? 'bear' : 'sideways';
      const volClass = volatility > 0.03 ? 'high' : volatility < 0.01 ? 'low' : 'medium';
      const volumeClass = avgVolume > 3000 ? 'high' : avgVolume < 1000 ? 'low' : 'medium';
      
      // Calculate max drawdown for the period
      let peak = window[0].close;
      let maxDD = 0;
      for (const candle of window) {
        if (candle.close > peak) peak = candle.close;
        const dd = (peak - candle.close) / peak;
        maxDD = Math.max(maxDD, dd);
      }
      
      conditions.push({
        period: `${new Date(window[0].timestamp).toISOString().split('T')[0]} to ${new Date(window[window.length - 1].timestamp).toISOString().split('T')[0]}`,
        startDate: window[0].timestamp,
        endDate: window[window.length - 1].timestamp,
        trend,
        volatility: volClass,
        volume: volumeClass,
        returns,
        maxDrawdown: maxDD
      });
    }
    
    return conditions;
  }

  private analyzeTradePatterns(trades: BacktestTrade[]): TradeAnalysis {
    if (trades.length === 0) {
      return {
        averageWinSize: 0,
        averageLossSize: 0,
        largestWin: 0,
        largestLoss: 0,
        averageHoldingPeriod: 0,
        winningStreaks: [],
        losingStreaks: [],
        tradeFrequency: 0,
        profitabilityByHour: {},
        profitabilityByDayOfWeek: {},
        profitabilityByMonth: {}
      };
    }
    
    const wins = trades.filter(t => t.isWinning);
    const losses = trades.filter(t => !t.isWinning);
    
    const averageWinSize = wins.length > 0 ? 
      wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const averageLossSize = losses.length > 0 ? 
      Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
    
    const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
    const largestLoss = losses.length > 0 ? Math.abs(Math.min(...losses.map(t => t.pnl))) : 0;
    
    const averageHoldingPeriod = trades.reduce((sum, t) => sum + t.holdingPeriod, 0) / trades.length;
    
    // Calculate streaks
    const { winningStreaks, losingStreaks } = this.calculateStreaks(trades);
    
    // Calculate trade frequency (trades per day)
    const timeSpan = trades[trades.length - 1].timestamp - trades[0].timestamp;
    const tradeFrequency = trades.length / (timeSpan / (24 * 60 * 60 * 1000));
    
    // Profitability by time patterns
    const profitabilityByHour = this.calculateProfitabilityByTimeUnit(trades, 'hour');
    const profitabilityByDayOfWeek = this.calculateProfitabilityByTimeUnit(trades, 'dayOfWeek');
    const profitabilityByMonth = this.calculateProfitabilityByTimeUnit(trades, 'month');
    
    return {
      averageWinSize,
      averageLossSize,
      largestWin,
      largestLoss,
      averageHoldingPeriod,
      winningStreaks,
      losingStreaks,
      tradeFrequency,
      profitabilityByHour,
      profitabilityByDayOfWeek,
      profitabilityByMonth
    };
  }

  private analyzePeriods(result: BacktestResult, historicalData: HistoricalCandle[]): PeriodAnalysis[] {
    const periods: PeriodAnalysis[] = [];
    const monthlyData = this.groupDataByMonth(historicalData, result.trades);
    
    for (const [period, data] of Object.entries(monthlyData)) {
      const equity = result.equity.filter(e => 
        e.timestamp >= data.startDate && e.timestamp <= data.endDate
      );
      
      if (equity.length < 2) continue;
      
      const returns = (equity[equity.length - 1].balance - equity[0].balance) / equity[0].balance;
      const equityReturns = this.calculateReturns(equity);
      const volatility = this.calculateStandardDeviation(equityReturns);
      const maxDrawdown = Math.max(...equity.map(e => e.drawdown));
      
      const periodTrades = data.trades;
      const winRate = periodTrades.length > 0 ? 
        periodTrades.filter(t => t.isWinning).length / periodTrades.length : 0;
      
      const sharpeRatio = volatility > 0 ? (returns - 0.02 / 12) / volatility : 0; // Monthly risk-free rate
      
      periods.push({
        period,
        startDate: data.startDate,
        endDate: data.endDate,
        returns,
        volatility,
        sharpeRatio,
        maxDrawdown,
        trades: periodTrades.length,
        winRate
      });
    }
    
    return periods;
  }

  private analyzeRiskReturns(result: BacktestResult): RiskReturnAnalysis {
    const returns = this.calculateReturns(result.equity);
    
    return {
      returnDistribution: this.calculateReturnDistribution(returns),
      riskMetrics: {
        beta: this.calculateBeta(returns), // Assuming market returns, simplified
        alpha: 0, // Requires benchmark comparison
        informationRatio: 0, // Requires benchmark comparison
        trackingError: 0 // Requires benchmark comparison
      },
      tailRisk: {
        var95: this.calculateVaR(returns, 0.95),
        var99: this.calculateVaR(returns, 0.99),
        cvar95: this.calculateCVaR(returns, 0.95),
        cvar99: this.calculateCVaR(returns, 0.99),
        expectedShortfall: this.calculateCVaR(returns, 0.95)
      }
    };
  }

  private calculateMonthlyReturns(result: BacktestResult): MonthlyReturns[] {
    const monthlyData: { [key: string]: { equity: EquityPoint[], trades: BacktestTrade[] } } = {};
    
    // Group equity and trades by month
    for (const point of result.equity) {
      const date = new Date(point.timestamp);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (!monthlyData[key]) {
        monthlyData[key] = { equity: [], trades: [] };
      }
      monthlyData[key].equity.push(point);
    }
    
    for (const trade of result.trades) {
      const date = new Date(trade.timestamp);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (monthlyData[key]) {
        monthlyData[key].trades.push(trade);
      }
    }
    
    const monthlyReturns: MonthlyReturns[] = [];
    
    for (const [key, data] of Object.entries(monthlyData)) {
      const [year, month] = key.split('-').map(Number);
      
      if (data.equity.length < 2) continue;
      
      const returns = (data.equity[data.equity.length - 1].balance - data.equity[0].balance) / data.equity[0].balance;
      const trades = data.trades.length;
      const winRate = trades > 0 ? data.trades.filter(t => t.isWinning).length / trades : 0;
      
      monthlyReturns.push({
        year,
        month,
        returns,
        trades,
        winRate
      });
    }
    
    return monthlyReturns.sort((a, b) => a.year - b.year || a.month - b.month);
  }

  private analyzeDrawdowns(result: BacktestResult): DrawdownAnalysis {
    const drawdowns = result.drawdownPeriods;
    
    if (drawdowns.length === 0) {
      return {
        totalDrawdowns: 0,
        averageDrawdown: 0,
        averageRecoveryTime: 0,
        maxRecoveryTime: 0,
        drawdownFrequency: 0,
        underWaterPeriods: 0
      };
    }
    
    const averageDrawdown = drawdowns.reduce((sum, dd) => 
      sum + (dd.peak - dd.trough) / dd.peak, 0
    ) / drawdowns.length;
    
    const recoveryTimes = drawdowns
      .filter(dd => dd.recovery)
      .map(dd => dd.recovery! - dd.end);
    
    const averageRecoveryTime = recoveryTimes.length > 0 ? 
      recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length : 0;
    
    const maxRecoveryTime = recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : 0;
    
    const totalTime = result.equity[result.equity.length - 1].timestamp - result.equity[0].timestamp;
    const drawdownFrequency = drawdowns.length / (totalTime / (30 * 24 * 60 * 60 * 1000)); // per month
    
    const underWaterPeriods = result.equity.filter(e => e.drawdown > 0).length;
    
    return {
      totalDrawdowns: drawdowns.length,
      averageDrawdown,
      averageRecoveryTime,
      maxRecoveryTime,
      drawdownFrequency,
      underWaterPeriods
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  private calculateStreaks(trades: BacktestTrade[]): { winningStreaks: number[], losingStreaks: number[] } {
    const winningStreaks: number[] = [];
    const losingStreaks: number[] = [];
    
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    
    for (const trade of trades) {
      if (trade.isWinning) {
        if (currentLossStreak > 0) {
          losingStreaks.push(currentLossStreak);
          currentLossStreak = 0;
        }
        currentWinStreak++;
      } else {
        if (currentWinStreak > 0) {
          winningStreaks.push(currentWinStreak);
          currentWinStreak = 0;
        }
        currentLossStreak++;
      }
    }
    
    // Don't forget the last streak
    if (currentWinStreak > 0) winningStreaks.push(currentWinStreak);
    if (currentLossStreak > 0) losingStreaks.push(currentLossStreak);
    
    return { winningStreaks, losingStreaks };
  }

  private calculateProfitabilityByTimeUnit(
    trades: BacktestTrade[], 
    unit: 'hour' | 'dayOfWeek' | 'month'
  ): { [key: number]: number } {
    const profitability: { [key: number]: number } = {};
    
    for (const trade of trades) {
      const date = new Date(trade.timestamp);
      let key: number;
      
      switch (unit) {
        case 'hour':
          key = date.getHours();
          break;
        case 'dayOfWeek':
          key = date.getDay();
          break;
        case 'month':
          key = date.getMonth();
          break;
      }
      
      if (!profitability[key]) profitability[key] = 0;
      profitability[key] += trade.pnl;
    }
    
    return profitability;
  }

  private groupDataByMonth(
    historicalData: HistoricalCandle[], 
    trades: BacktestTrade[]
  ): { [key: string]: { startDate: number, endDate: number, trades: BacktestTrade[] } } {
    const monthlyData: { [key: string]: { startDate: number, endDate: number, trades: BacktestTrade[] } } = {};
    
    // Initialize with historical data range
    for (const candle of historicalData) {
      const date = new Date(candle.timestamp);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[key]) {
        monthlyData[key] = {
          startDate: candle.timestamp,
          endDate: candle.timestamp,
          trades: []
        };
      }
      
      monthlyData[key].startDate = Math.min(monthlyData[key].startDate, candle.timestamp);
      monthlyData[key].endDate = Math.max(monthlyData[key].endDate, candle.timestamp);
    }
    
    // Add trades to respective months
    for (const trade of trades) {
      const date = new Date(trade.timestamp);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (monthlyData[key]) {
        monthlyData[key].trades.push(trade);
      }
    }
    
    return monthlyData;
  }

  private calculateReturnDistribution(returns: number[]): number[] {
    // Create histogram bins for return distribution
    const bins = 20;
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const minReturn = sortedReturns[0] || 0;
    const maxReturn = sortedReturns[sortedReturns.length - 1] || 0;
    const binSize = (maxReturn - minReturn) / bins;
    
    const distribution: number[] = new Array(bins).fill(0);
    
    for (const ret of returns) {
      const binIndex = Math.min(Math.floor((ret - minReturn) / binSize), bins - 1);
      distribution[binIndex]++;
    }
    
    return distribution.map(count => count / returns.length);
  }

  private calculateBeta(returns: number[]): number {
    // Simplified beta calculation assuming market return is random walk
    // In practice, you would use actual market index returns
    const marketReturns = returns.map(() => (Math.random() - 0.5) * 0.02); // Mock market returns
    
    if (returns.length !== marketReturns.length || returns.length === 0) return 1;
    
    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const meanMarket = marketReturns.reduce((sum, ret) => sum + ret, 0) / marketReturns.length;
    
    let covariance = 0;
    let marketVariance = 0;
    
    for (let i = 0; i < returns.length; i++) {
      covariance += (returns[i] - meanReturn) * (marketReturns[i] - meanMarket);
      marketVariance += Math.pow(marketReturns[i] - meanMarket, 2);
    }
    
    covariance /= returns.length;
    marketVariance /= returns.length;
    
    return marketVariance > 0 ? covariance / marketVariance : 1;
  }
}