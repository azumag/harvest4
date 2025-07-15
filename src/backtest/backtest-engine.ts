import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { BitbankTicker } from '../types/bitbank';
import {
  HistoricalDataPoint,
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  BacktestPosition,
  EquityPoint,
  DrawdownPoint,
  MonthlyReturn
} from '../types/backtest';

export class BacktestEngine {
  private config: BacktestConfig;
  private strategy: TradingStrategy;
  private trades: BacktestTrade[] = [];
  private positions: BacktestPosition[] = [];
  private currentBalance: number;
  private equityCurve: EquityPoint[] = [];
  private drawdownCurve: DrawdownPoint[] = [];
  private nextTradeId = 1;
  private nextPositionId = 1;
  private highWaterMark = 0;
  private currentDrawdown = 0;
  private maxDrawdown = 0;
  private maxRunup = 0;
  private currentRunup = 0;

  constructor(config: BacktestConfig, strategyConfig: TradingStrategyConfig) {
    this.config = config;
    this.strategy = new TradingStrategy(strategyConfig);
    this.currentBalance = config.initialBalance;
    this.highWaterMark = config.initialBalance;
  }

  async runBacktest(data: HistoricalDataPoint[]): Promise<BacktestResult> {
    this.reset();
    
    for (const dataPoint of data) {
      await this.processDataPoint(dataPoint);
    }
    
    const lastDataPoint = data[data.length - 1];
    if (lastDataPoint) {
      this.closeAllPositions(lastDataPoint);
    }
    
    return this.generateResult();
  }

  private reset(): void {
    this.trades = [];
    this.positions = [];
    this.currentBalance = this.config.initialBalance;
    this.equityCurve = [];
    this.drawdownCurve = [];
    this.nextTradeId = 1;
    this.nextPositionId = 1;
    this.highWaterMark = this.config.initialBalance;
    this.currentDrawdown = 0;
    this.maxDrawdown = 0;
    this.maxRunup = 0;
    this.currentRunup = 0;
  }

  private async processDataPoint(dataPoint: HistoricalDataPoint): Promise<void> {
    const ticker = this.createTicker(dataPoint);
    
    this.updatePositions(dataPoint);
    this.checkStopLossAndTakeProfit(dataPoint);
    
    const signal = this.strategy.generateSignal(ticker);
    
    if (signal.action === 'buy' && this.canOpenPosition()) {
      await this.openPosition('buy', dataPoint, signal.amount);
    } else if (signal.action === 'sell' && this.canOpenPosition()) {
      await this.openPosition('sell', dataPoint, signal.amount);
    }
    
    this.updateEquityAndDrawdown(dataPoint);
  }

  private createTicker(dataPoint: HistoricalDataPoint): BitbankTicker {
    return {
      pair: this.config.pair,
      sell: dataPoint.close.toString(),
      buy: dataPoint.close.toString(),
      high: dataPoint.high.toString(),
      low: dataPoint.low.toString(),
      last: dataPoint.close.toString(),
      vol: dataPoint.volume.toString(),
      timestamp: dataPoint.timestamp
    };
  }

  private updatePositions(dataPoint: HistoricalDataPoint): void {
    this.positions.forEach(position => {
      if (position.isOpen) {
        const currentPrice = dataPoint.close;
        
        if (position.side === 'buy') {
          position.unrealizedPnl = (currentPrice - position.entryPrice) * position.amount;
        } else {
          position.unrealizedPnl = (position.entryPrice - currentPrice) * position.amount;
        }
      }
    });
  }

  private checkStopLossAndTakeProfit(dataPoint: HistoricalDataPoint): void {
    const openPositions = this.positions.filter(p => p.isOpen);
    
    openPositions.forEach(position => {
      const currentPrice = dataPoint.close;
      let shouldClose = false;
      let exitReason: 'stop_loss' | 'take_profit' | 'signal' | 'end_of_test' = 'signal';
      
      if (position.side === 'buy') {
        if (currentPrice <= position.stopLoss) {
          shouldClose = true;
          exitReason = 'stop_loss';
        } else if (currentPrice >= position.takeProfit) {
          shouldClose = true;
          exitReason = 'take_profit';
        }
      } else {
        if (currentPrice >= position.stopLoss) {
          shouldClose = true;
          exitReason = 'stop_loss';
        } else if (currentPrice <= position.takeProfit) {
          shouldClose = true;
          exitReason = 'take_profit';
        }
      }
      
      if (shouldClose) {
        this.closePosition(position, dataPoint, exitReason);
      }
    });
  }

  private canOpenPosition(): boolean {
    const openPositions = this.positions.filter(p => p.isOpen).length;
    return openPositions < 3; // Max 3 concurrent positions as per CLAUDE.md
  }

  private async openPosition(
    side: 'buy' | 'sell',
    dataPoint: HistoricalDataPoint,
    amount: number
  ): Promise<void> {
    const price = dataPoint.close;
    const slippage = this.calculateSlippage(price, amount);
    const adjustedPrice = side === 'buy' ? price + slippage : price - slippage;
    const commission = this.calculateCommission(adjustedPrice * amount);
    const totalCost = (adjustedPrice * amount) + commission;
    
    if (totalCost > this.currentBalance) {
      return; // Not enough balance
    }
    
    const stopLoss = side === 'buy' 
      ? adjustedPrice * (1 - this.config.stopLoss)
      : adjustedPrice * (1 + this.config.stopLoss);
    
    const takeProfit = side === 'buy'
      ? adjustedPrice * (1 + this.config.takeProfit)
      : adjustedPrice * (1 - this.config.takeProfit);
    
    const trade: BacktestTrade = {
      id: this.nextTradeId++,
      timestamp: dataPoint.timestamp,
      side,
      price: adjustedPrice,
      amount,
      commission,
      slippage,
      stopLoss,
      takeProfit
    };
    
    const position: BacktestPosition = {
      id: this.nextPositionId++,
      side,
      entryPrice: adjustedPrice,
      amount,
      entryTimestamp: dataPoint.timestamp,
      stopLoss,
      takeProfit,
      unrealizedPnl: 0,
      isOpen: true
    };
    
    this.trades.push(trade);
    this.positions.push(position);
    this.currentBalance -= totalCost;
  }

  private closePosition(
    position: BacktestPosition,
    dataPoint: HistoricalDataPoint,
    reason: 'stop_loss' | 'take_profit' | 'signal' | 'end_of_test'
  ): void {
    const exitPrice = dataPoint.close;
    const slippage = this.calculateSlippage(exitPrice, position.amount);
    const adjustedExitPrice = position.side === 'buy' ? exitPrice - slippage : exitPrice + slippage;
    const commission = this.calculateCommission(adjustedExitPrice * position.amount);
    
    let profit: number;
    if (position.side === 'buy') {
      profit = (adjustedExitPrice - position.entryPrice) * position.amount - commission;
    } else {
      profit = (position.entryPrice - adjustedExitPrice) * position.amount - commission;
    }
    
    const profitPercent = (profit / (position.entryPrice * position.amount)) * 100;
    const holdingPeriod = dataPoint.timestamp - position.entryTimestamp;
    
    const trade = this.trades.find(t => t.id === position.id);
    if (trade) {
      trade.exitTimestamp = dataPoint.timestamp;
      trade.exitPrice = adjustedExitPrice;
      trade.exitReason = reason;
      trade.profit = profit;
      trade.profitPercent = profitPercent;
      trade.holdingPeriod = holdingPeriod;
    }
    
    position.isOpen = false;
    position.realizedPnl = profit;
    this.currentBalance += (adjustedExitPrice * position.amount) - commission;
    
    if (position.side === 'sell') {
      this.currentBalance += profit;
    }
  }

  private closeAllPositions(lastDataPoint: HistoricalDataPoint): void {
    const openPositions = this.positions.filter(p => p.isOpen);
    openPositions.forEach(position => {
      this.closePosition(position, lastDataPoint, 'end_of_test');
    });
  }

  private calculateSlippage(price: number, amount: number): number {
    return price * this.config.slippage * Math.min(amount / 1000, 1);
  }

  private calculateCommission(value: number): number {
    return value * this.config.commission;
  }

  private updateEquityAndDrawdown(dataPoint: HistoricalDataPoint): void {
    const unrealizedPnl = this.positions
      .filter(p => p.isOpen)
      .reduce((sum, p) => sum + p.unrealizedPnl, 0);
    
    const currentEquity = this.currentBalance + unrealizedPnl;
    
    if (currentEquity > this.highWaterMark) {
      this.highWaterMark = currentEquity;
      this.currentRunup = currentEquity - this.config.initialBalance;
      this.maxRunup = Math.max(this.maxRunup, this.currentRunup);
      this.currentDrawdown = 0;
    } else {
      this.currentDrawdown = this.highWaterMark - currentEquity;
      this.maxDrawdown = Math.max(this.maxDrawdown, this.currentDrawdown);
    }
    
    const drawdownPercent = this.highWaterMark > 0 ? (this.currentDrawdown / this.highWaterMark) * 100 : 0;
    
    this.equityCurve.push({
      timestamp: dataPoint.timestamp,
      equity: currentEquity,
      drawdown: this.currentDrawdown,
      drawdownPercent
    });
    
    this.drawdownCurve.push({
      timestamp: dataPoint.timestamp,
      drawdown: this.currentDrawdown,
      drawdownPercent,
      underwater: this.currentDrawdown > 0 ? 1 : 0
    });
  }

  private generateResult(): BacktestResult {
    const completedTrades = this.trades.filter(t => t.profit !== undefined);
    const winningTrades = completedTrades.filter(t => t.profit! > 0);
    const losingTrades = completedTrades.filter(t => t.profit! < 0);
    
    const totalProfit = completedTrades.reduce((sum, t) => sum + t.profit!, 0);
    const totalReturn = totalProfit;
    const totalReturnPercent = (totalReturn / this.config.initialBalance) * 100;
    
    const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;
    const averageWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.profit!, 0) / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit!, 0) / losingTrades.length) : 0;
    
    const profitFactor = averageLoss > 0 ? Math.abs(averageWin * winningTrades.length) / Math.abs(averageLoss * losingTrades.length) : 0;
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profit!)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profit!)) : 0;
    
    const averageHoldingPeriod = completedTrades.length > 0 
      ? completedTrades.reduce((sum, t) => sum + (t.holdingPeriod || 0), 0) / completedTrades.length
      : 0;
    
    const returns = this.calculateReturns();
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);
    const calmarRatio = this.calculateCalmarRatio(totalReturnPercent);
    
    const maxDrawdownPercent = this.config.initialBalance > 0 ? (this.maxDrawdown / this.config.initialBalance) * 100 : 0;
    const maxRunupPercent = this.config.initialBalance > 0 ? (this.maxRunup / this.config.initialBalance) * 100 : 0;
    
    const recoveryFactor = this.maxDrawdown > 0 ? totalReturn / this.maxDrawdown : 0;
    const expectancy = winRate > 0 ? (winRate / 100) * averageWin - ((100 - winRate) / 100) * averageLoss : 0;
    
    const monthlyReturns = this.calculateMonthlyReturns();
    const annualizedReturn = this.calculateAnnualizedReturn(totalReturnPercent);
    const annualizedVolatility = this.calculateAnnualizedVolatility(returns);
    
    const var95 = this.calculateVaR(returns, 0.95);
    const var99 = this.calculateVaR(returns, 0.99);
    const cvar95 = this.calculateCVaR(returns, 0.95);
    const cvar99 = this.calculateCVaR(returns, 0.99);
    
    const skewness = this.calculateSkewness(returns);
    const kurtosis = this.calculateKurtosis(returns);
    const ulcerIndex = this.calculateUlcerIndex();
    const gainToPainRatio = this.calculateGainToPainRatio(returns);
    const sterlingRatio = this.calculateSterlingRatio(totalReturnPercent);
    const burkeRatio = this.calculateBurkeRatio(totalReturnPercent);
    const martin_ratio = this.calculateMartinRatio(totalReturnPercent);
    
    return {
      trades: this.trades,
      positions: this.positions,
      initialBalance: this.config.initialBalance,
      finalBalance: this.currentBalance,
      totalReturn,
      totalReturnPercent,
      maxDrawdown: this.maxDrawdown,
      maxDrawdownPercent,
      winRate,
      profitFactor,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      totalTrades: completedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      averageHoldingPeriod,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxRunup: this.maxRunup,
      maxRunupPercent,
      recoveryFactor,
      expectancy,
      equityCurve: this.equityCurve,
      drawdownCurve: this.drawdownCurve,
      monthlyReturns,
      annualizedReturn,
      annualizedVolatility,
      var95,
      var99,
      cvar95,
      cvar99,
      skewness,
      kurtosis,
      ulcerIndex,
      gainToPainRatio,
      sterlingRatio,
      burkeRatio,
      martin_ratio
    };
  }

  private calculateReturns(): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < this.equityCurve.length; i++) {
      const current = this.equityCurve[i];
      const previous = this.equityCurve[i - 1];
      
      if (current && previous) {
        const currentEquity = current.equity;
        const previousEquity = previous.equity;
        
        if (previousEquity > 0) {
          returns.push((currentEquity - previousEquity) / previousEquity);
        }
      }
    }
    
    return returns;
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    return volatility > 0 ? (meanReturn / volatility) * Math.sqrt(252) : 0;
  }

  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const negativeReturns = returns.filter(r => r < 0);
    
    if (negativeReturns.length === 0) return 0;
    
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    
    return downsideDeviation > 0 ? (meanReturn / downsideDeviation) * Math.sqrt(252) : 0;
  }

  private calculateCalmarRatio(totalReturnPercent: number): number {
    const maxDrawdownPercent = this.config.initialBalance > 0 ? (this.maxDrawdown / this.config.initialBalance) * 100 : 0;
    return maxDrawdownPercent > 0 ? totalReturnPercent / maxDrawdownPercent : 0;
  }

  private calculateMonthlyReturns(): MonthlyReturn[] {
    const monthlyReturns: MonthlyReturn[] = [];
    const monthlyEquity = new Map<string, number>();
    
    this.equityCurve.forEach(point => {
      const date = new Date(point.timestamp);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyEquity.set(monthKey, point.equity);
    });
    
    const sortedMonths = Array.from(monthlyEquity.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (let i = 1; i < sortedMonths.length; i++) {
      const currentMonth = sortedMonths[i];
      const previousMonth = sortedMonths[i - 1];
      
      if (currentMonth && previousMonth) {
        const [currentMonthKey, currentEquity] = currentMonth;
        const [, previousEquity] = previousMonth;
        
        const [year, month] = currentMonthKey.split('-').map(Number);
        const returnValue = currentEquity - previousEquity;
        const returnPercent = previousEquity > 0 ? (returnValue / previousEquity) * 100 : 0;
        
        monthlyReturns.push({
          year,
          month,
          return: returnValue,
          returnPercent
        });
      }
    }
    
    return monthlyReturns;
  }

  private calculateAnnualizedReturn(totalReturnPercent: number): number {
    const days = (this.config.endDate - this.config.startDate) / (1000 * 60 * 60 * 24);
    const years = days / 365;
    return years > 0 ? Math.pow(1 + totalReturnPercent / 100, 1 / years) - 1 : 0;
  }

  private calculateAnnualizedVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 252);
  }

  private calculateVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    
    return sortedReturns[index] || 0;
  }

  private calculateCVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    const tailReturns = sortedReturns.slice(0, index);
    
    return tailReturns.length > 0 ? tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length : 0;
  }

  private calculateSkewness(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const skewness = returns.reduce((sum, r) => sum + Math.pow((r - mean) / stdDev, 3), 0) / returns.length;
    
    return skewness;
  }

  private calculateKurtosis(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const kurtosis = returns.reduce((sum, r) => sum + Math.pow((r - mean) / stdDev, 4), 0) / returns.length;
    
    return kurtosis - 3; // Excess kurtosis
  }

  private calculateUlcerIndex(): number {
    if (this.drawdownCurve.length === 0) return 0;
    
    const sumSquaredDrawdowns = this.drawdownCurve.reduce((sum, point) => {
      return sum + Math.pow(point.drawdownPercent, 2);
    }, 0);
    
    return Math.sqrt(sumSquaredDrawdowns / this.drawdownCurve.length);
  }

  private calculateGainToPainRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const totalGain = returns.filter(r => r > 0).reduce((sum, r) => sum + r, 0);
    const totalPain = Math.abs(returns.filter(r => r < 0).reduce((sum, r) => sum + r, 0));
    
    return totalPain > 0 ? totalGain / totalPain : 0;
  }

  private calculateSterlingRatio(totalReturnPercent: number): number {
    const maxDrawdownPercent = this.config.initialBalance > 0 ? (this.maxDrawdown / this.config.initialBalance) * 100 : 0;
    return maxDrawdownPercent > 0 ? totalReturnPercent / (maxDrawdownPercent + 10) : 0;
  }

  private calculateBurkeRatio(totalReturnPercent: number): number {
    if (this.drawdownCurve.length === 0) return 0;
    
    const drawdownSquaredSum = this.drawdownCurve.reduce((sum, point) => {
      return sum + Math.pow(point.drawdownPercent, 2);
    }, 0);
    
    const burkeRatio = drawdownSquaredSum > 0 ? totalReturnPercent / Math.sqrt(drawdownSquaredSum) : 0;
    
    return burkeRatio;
  }

  private calculateMartinRatio(totalReturnPercent: number): number {
    const ulcerIndex = this.calculateUlcerIndex();
    return ulcerIndex > 0 ? totalReturnPercent / ulcerIndex : 0;
  }
}