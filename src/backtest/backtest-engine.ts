import { 
  HistoricalCandle, 
  BacktestConfig, 
  BacktestResult, 
  BacktestPosition, 
  BacktestTrade,
  EquityPoint,
  DrawdownPeriod
} from '../types/backtest';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { BitbankTicker, TradingSignal } from '../types/bitbank';

export class BacktestEngine {
  private config: BacktestConfig;
  private strategy: TradingStrategy;
  private currentBalance: number;
  private positions: BacktestPosition[] = [];
  private closedTrades: BacktestTrade[] = [];
  private equity: EquityPoint[] = [];
  private currentCandle: HistoricalCandle | null = null;
  private tradeIdCounter = 0;

  constructor(config: BacktestConfig, strategyConfig: TradingStrategyConfig) {
    this.config = config;
    this.strategy = new TradingStrategy(strategyConfig);
    this.currentBalance = config.initialBalance;
  }

  async runBacktest(historicalData: HistoricalCandle[]): Promise<BacktestResult> {
    this.initializeBacktest();
    
    const sortedData = historicalData
      .filter(candle => 
        candle.timestamp >= this.config.startDate && 
        candle.timestamp <= this.config.endDate
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    if (sortedData.length === 0) {
      throw new Error('No historical data available for the specified period');
    }

    for (const candle of sortedData) {
      this.currentCandle = candle;
      await this.processCandle(candle);
      this.updateEquity(candle.timestamp);
      this.checkStopLossAndTakeProfit(candle);
    }

    // Close any remaining open positions
    this.closeAllPositions();

    return this.generateResult();
  }

  private initializeBacktest(): void {
    this.currentBalance = this.config.initialBalance;
    this.positions = [];
    this.closedTrades = [];
    this.equity = [];
    this.tradeIdCounter = 0;
  }

  private async processCandle(candle: HistoricalCandle): Promise<void> {
    // Convert candle to ticker format for strategy
    const ticker: BitbankTicker = {
      pair: this.config.pair,
      sell: candle.close.toString(),
      buy: candle.close.toString(),
      high: candle.high.toString(),
      low: candle.low.toString(),
      last: candle.close.toString(),
      vol: candle.volume.toString(),
      timestamp: candle.timestamp
    };

    const signal = this.strategy.generateSignal(ticker);
    
    if (signal.action !== 'hold') {
      await this.executeSignal(signal, candle);
    }
  }

  private async executeSignal(signal: TradingSignal, candle: HistoricalCandle): Promise<void> {
    const maxPositions = 3; // Maximum concurrent positions
    
    if (signal.action === 'buy') {
      if (this.positions.filter(p => p.status === 'open').length >= maxPositions) {
        return; // Skip if maximum positions reached
      }
      
      const tradeAmount = Math.min(
        signal.amount,
        this.currentBalance * this.config.maxPositionSize / signal.price
      );
      
      if (tradeAmount * signal.price < 1000) { // Minimum trade size
        return;
      }

      this.executeBuy(signal, candle, tradeAmount);
    } else if (signal.action === 'sell') {
      // Close existing buy positions or open short position
      const openBuyPositions = this.positions.filter(
        p => p.status === 'open' && p.side === 'buy'
      );
      
      if (openBuyPositions.length > 0) {
        // Close the oldest position first
        const positionToClose = openBuyPositions[0];
        this.closePosition(positionToClose, signal.price, candle.timestamp);
      }
    }
  }

  private executeBuy(signal: TradingSignal, candle: HistoricalCandle, amount: number): void {
    const executionPrice = this.calculateExecutionPrice(signal.price, 'buy');
    const commission = amount * executionPrice * this.config.commission;
    const totalCost = amount * executionPrice + commission;
    
    if (totalCost > this.currentBalance) {
      return; // Insufficient funds
    }

    this.currentBalance -= totalCost;

    const position: BacktestPosition = {
      side: 'buy',
      amount,
      entryPrice: executionPrice,
      entryTime: candle.timestamp,
      commission,
      slippage: Math.abs(executionPrice - signal.price),
      status: 'open',
      stopLoss: executionPrice * 0.98, // 2% stop loss
      takeProfit: executionPrice * 1.04 // 4% take profit
    };

    this.positions.push(position);
  }

  private closePosition(position: BacktestPosition, exitPrice: number, exitTime: number): void {
    const executionPrice = this.calculateExecutionPrice(exitPrice, 'sell');
    const commission = position.amount * executionPrice * this.config.commission;
    const grossProceeds = position.amount * executionPrice;
    const netProceeds = grossProceeds - commission;
    
    this.currentBalance += netProceeds;

    // Calculate P&L
    const totalEntryCost = position.amount * position.entryPrice + position.commission;
    const pnl = netProceeds - totalEntryCost;
    
    position.exitPrice = executionPrice;
    position.exitTime = exitTime;
    position.status = 'closed';
    position.pnl = pnl;

    // Create trade record
    const trade: BacktestTrade = {
      id: `trade_${this.tradeIdCounter++}`,
      side: position.side,
      amount: position.amount,
      price: position.entryPrice,
      timestamp: position.entryTime,
      commission: position.commission + commission,
      slippage: position.slippage + Math.abs(executionPrice - exitPrice),
      pnl,
      isWinning: pnl > 0,
      holdingPeriod: exitTime - position.entryTime,
      drawdown: this.calculateCurrentDrawdown()
    };

    this.closedTrades.push(trade);
  }

  private checkStopLossAndTakeProfit(candle: HistoricalCandle): void {
    const openPositions = this.positions.filter(p => p.status === 'open');
    
    for (const position of openPositions) {
      if (position.side === 'buy') {
        // Check stop loss
        if (position.stopLoss && candle.low <= position.stopLoss) {
          this.closePosition(position, position.stopLoss, candle.timestamp);
        }
        // Check take profit
        else if (position.takeProfit && candle.high >= position.takeProfit) {
          this.closePosition(position, position.takeProfit, candle.timestamp);
        }
      }
    }
  }

  private closeAllPositions(): void {
    const openPositions = this.positions.filter(p => p.status === 'open');
    
    for (const position of openPositions) {
      if (this.currentCandle) {
        this.closePosition(position, this.currentCandle.close, this.currentCandle.timestamp);
      }
    }
  }

  private calculateExecutionPrice(signalPrice: number, side: 'buy' | 'sell'): number {
    const slippageMultiplier = side === 'buy' ? (1 + this.config.slippage) : (1 - this.config.slippage);
    return signalPrice * slippageMultiplier;
  }

  private updateEquity(timestamp: number): void {
    const totalEquity = this.calculateTotalEquity();
    const drawdown = this.calculateCurrentDrawdown();
    
    this.equity.push({
      timestamp,
      balance: totalEquity,
      drawdown
    });
  }

  private calculateTotalEquity(): number {
    let totalEquity = this.currentBalance;
    
    // Add value of open positions
    if (this.currentCandle) {
      const openPositions = this.positions.filter(p => p.status === 'open');
      for (const position of openPositions) {
        if (position.side === 'buy') {
          const currentValue = position.amount * this.currentCandle.close;
          totalEquity += currentValue;
        }
      }
    }
    
    return totalEquity;
  }

  private calculateCurrentDrawdown(): number {
    if (this.equity.length === 0) return 0;
    
    const currentEquity = this.calculateTotalEquity();
    const peakEquity = Math.max(...this.equity.map(e => e.balance), currentEquity);
    
    return peakEquity > 0 ? (peakEquity - currentEquity) / peakEquity : 0;
  }

  private generateResult(): BacktestResult {
    const totalTrades = this.closedTrades.length;
    const winningTrades = this.closedTrades.filter(t => t.isWinning).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    
    const profits = this.closedTrades.filter(t => t.isWinning).map(t => t.pnl);
    const losses = this.closedTrades.filter(t => !t.isWinning).map(t => Math.abs(t.pnl));
    
    const totalProfit = profits.reduce((sum, profit) => sum + profit, 0);
    const totalLoss = losses.reduce((sum, loss) => sum + loss, 0);
    
    const finalEquity = this.calculateTotalEquity();
    const totalReturn = (finalEquity - this.config.initialBalance) / this.config.initialBalance;
    
    // Calculate time period for annualized return
    const startDate = new Date(this.config.startDate);
    const endDate = new Date(this.config.endDate);
    const timePeriodYears = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const annualizedReturn = timePeriodYears > 0 ? Math.pow(1 + totalReturn, 1 / timePeriodYears) - 1 : 0;
    
    const maxDrawdown = this.calculateMaxDrawdown();
    const drawdownPeriods = this.calculateDrawdownPeriods();
    const maxDrawdownDuration = drawdownPeriods.length > 0 
      ? Math.max(...drawdownPeriods.map(d => d.duration)) 
      : 0;
    
    const volatility = this.calculateVolatility();
    const sharpeRatio = this.calculateSharpeRatio(annualizedReturn, volatility);
    const sortinoRatio = this.calculateSortinoRatio(annualizedReturn);
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
    
    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalReturn,
      annualizedReturn,
      totalProfit,
      totalLoss,
      profitFactor: totalLoss > 0 ? totalProfit / totalLoss : 0,
      averageWin: profits.length > 0 ? totalProfit / profits.length : 0,
      averageLoss: losses.length > 0 ? totalLoss / losses.length : 0,
      maxDrawdown,
      maxDrawdownDuration,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      volatility,
      maxConsecutiveWins: this.calculateMaxConsecutive(true),
      maxConsecutiveLosses: this.calculateMaxConsecutive(false),
      trades: this.closedTrades,
      equity: this.equity,
      drawdownPeriods
    };
  }

  private calculateMaxDrawdown(): number {
    if (this.equity.length === 0) return 0;
    
    let maxDrawdown = 0;
    let peak = this.equity[0].balance;
    
    for (const point of this.equity) {
      if (point.balance > peak) {
        peak = point.balance;
      }
      
      const drawdown = (peak - point.balance) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateDrawdownPeriods(): DrawdownPeriod[] {
    const periods: DrawdownPeriod[] = [];
    let inDrawdown = false;
    let currentPeriod: Partial<DrawdownPeriod> = {};
    let peak = 0;
    
    for (const point of this.equity) {
      if (point.balance > peak) {
        peak = point.balance;
        
        if (inDrawdown && currentPeriod.trough !== undefined) {
          // End of drawdown period
          periods.push({
            start: currentPeriod.start!,
            end: point.timestamp,
            peak: currentPeriod.peak!,
            trough: currentPeriod.trough,
            duration: point.timestamp - currentPeriod.start!,
            recovery: point.timestamp
          });
          inDrawdown = false;
        }
      } else if (point.balance < peak && !inDrawdown) {
        // Start of new drawdown period
        inDrawdown = true;
        currentPeriod = {
          start: point.timestamp,
          peak,
          trough: point.balance
        };
      } else if (inDrawdown && point.balance < (currentPeriod.trough || Infinity)) {
        currentPeriod.trough = point.balance;
      }
    }
    
    // Handle ongoing drawdown
    if (inDrawdown && currentPeriod.start && currentPeriod.trough !== undefined) {
      periods.push({
        start: currentPeriod.start,
        end: this.equity[this.equity.length - 1].timestamp,
        peak: currentPeriod.peak!,
        trough: currentPeriod.trough,
        duration: this.equity[this.equity.length - 1].timestamp - currentPeriod.start
      });
    }
    
    return periods;
  }

  private calculateVolatility(): number {
    if (this.equity.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < this.equity.length; i++) {
      const returnRate = (this.equity[i].balance - this.equity[i - 1].balance) / this.equity[i - 1].balance;
      returns.push(returnRate);
    }
    
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(252); // Annualized daily volatility
  }

  private calculateSharpeRatio(annualizedReturn: number, volatility: number): number {
    const riskFreeRate = 0.02; // Assume 2% risk-free rate
    return volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;
  }

  private calculateSortinoRatio(annualizedReturn: number): number {
    if (this.equity.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < this.equity.length; i++) {
      const returnRate = (this.equity[i].balance - this.equity[i - 1].balance) / this.equity[i - 1].balance;
      returns.push(returnRate);
    }
    
    const downwardReturns = returns.filter(ret => ret < 0);
    if (downwardReturns.length === 0) return Infinity;
    
    const downwardVariance = downwardReturns.reduce((sum, ret) => sum + ret * ret, 0) / downwardReturns.length;
    const downwardVolatility = Math.sqrt(downwardVariance) * Math.sqrt(252);
    
    const riskFreeRate = 0.02;
    return downwardVolatility > 0 ? (annualizedReturn - riskFreeRate) / downwardVolatility : 0;
  }

  private calculateMaxConsecutive(winning: boolean): number {
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    
    for (const trade of this.closedTrades) {
      if (trade.isWinning === winning) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }
    
    return maxConsecutive;
  }
}