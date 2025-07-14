import { HistoricalDataManager } from '../data/historical-data-manager';
import { TradingStrategy } from '../strategies/trading-strategy';
import { 
  BacktestResult, 
  BacktestTrade, 
  BacktestConfig, 
  HistoricalDataPoint 
} from '../types/backtest';
import { TradingSignal, BitbankTicker } from '../types/bitbank';

export interface BacktestPosition {
  id: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  entryTime: number;
  stopLoss?: number;
  takeProfit?: number;
}

export class BacktestEngine {
  private dataManager: HistoricalDataManager;
  private strategy: TradingStrategy;
  private config: BacktestConfig;
  private trades: BacktestTrade[] = [];
  private positions: BacktestPosition[] = [];
  private balance: number;
  private equity: number;
  private maxEquity: number;
  private currentTime: number = 0;
  private tradeCounter: number = 0;

  constructor(
    dataManager: HistoricalDataManager,
    strategy: TradingStrategy,
    config: BacktestConfig
  ) {
    this.dataManager = dataManager;
    this.strategy = strategy;
    this.config = config;
    this.balance = config.initialBalance;
    this.equity = config.initialBalance;
    this.maxEquity = config.initialBalance;
  }

  async runBacktest(pair: string, timeframe: string = '1m'): Promise<BacktestResult> {
    console.log(`Starting backtest for ${pair} from ${new Date(this.config.startDate)} to ${new Date(this.config.endDate)}`);
    
    // Reset state
    this.reset();
    
    // Fetch historical data
    const historicalData = await this.dataManager.fetchHistoricalData(
      pair,
      timeframe,
      this.config.startDate,
      this.config.endDate
    );
    
    if (historicalData.length === 0) {
      throw new Error('No historical data available for the specified period');
    }
    
    console.log(`Processing ${historicalData.length} data points`);
    
    // Process each data point
    for (let i = 0; i < historicalData.length; i++) {
      const dataPoint = historicalData[i];
      this.currentTime = dataPoint.timestamp;
      
      // Update strategy with current price
      this.strategy.updatePrice(dataPoint.price);
      
      // Check stop loss and take profit for existing positions
      this.checkStopLossAndTakeProfit(dataPoint);
      
      // Generate trading signal
      const ticker = this.createTickerFromDataPoint(dataPoint);
      const signal = this.strategy.generateSignal(ticker);
      
      // Execute signal if valid
      if (signal.action !== 'hold' && this.canExecuteSignal(signal)) {
        await this.executeSignal(signal, dataPoint);
      }
      
      // Update equity
      this.updateEquity(dataPoint);
      
      // Log progress periodically
      if (i % 1000 === 0) {
        console.log(`Progress: ${((i / historicalData.length) * 100).toFixed(1)}%`);
      }
    }
    
    // Close any remaining positions
    this.closeAllPositions(historicalData[historicalData.length - 1]);
    
    // Calculate and return results
    const result = this.calculateResults();
    console.log(`Backtest completed. Total trades: ${result.totalTrades}, Win rate: ${(result.winRate * 100).toFixed(2)}%`);
    
    return result;
  }

  private reset(): void {
    this.trades = [];
    this.positions = [];
    this.balance = this.config.initialBalance;
    this.equity = this.config.initialBalance;
    this.maxEquity = this.config.initialBalance;
    this.tradeCounter = 0;
  }

  private createTickerFromDataPoint(dataPoint: HistoricalDataPoint): BitbankTicker {
    return {
      pair: 'btc_jpy',
      sell: dataPoint.sell.toString(),
      buy: dataPoint.buy.toString(),
      high: dataPoint.high.toString(),
      low: dataPoint.low.toString(),
      last: dataPoint.price.toString(),
      vol: dataPoint.volume.toString(),
      timestamp: dataPoint.timestamp
    };
  }

  private canExecuteSignal(signal: TradingSignal): boolean {
    // Check if we have enough balance
    const requiredBalance = signal.amount * signal.price;
    if (requiredBalance > this.balance) {
      return false;
    }
    
    // Check position size limits
    if (signal.amount > this.config.maxPositionSize) {
      return false;
    }
    
    // Check if we're not over-leveraged
    const currentPositionValue = this.positions.reduce((sum, pos) => 
      sum + (pos.amount * pos.entryPrice), 0
    );
    
    if (currentPositionValue + requiredBalance > this.config.initialBalance * 3) {
      return false;
    }
    
    return true;
  }

  private async executeSignal(signal: TradingSignal, dataPoint: HistoricalDataPoint): Promise<void> {
    const tradeId = `trade_${++this.tradeCounter}`;
    
    // Calculate actual execution price with slippage
    const slippageMultiplier = signal.action === 'buy' ? 1 + this.config.slippage : 1 - this.config.slippage;
    const executionPrice = signal.price * slippageMultiplier;
    
    // Calculate commission
    const commission = signal.amount * executionPrice * this.config.commission;
    
    // Create position
    const position: BacktestPosition = {
      id: tradeId,
      side: signal.action,
      entryPrice: executionPrice,
      amount: signal.amount,
      entryTime: this.currentTime,
      stopLoss: this.calculateStopLoss(signal.action, executionPrice),
      takeProfit: this.calculateTakeProfit(signal.action, executionPrice)
    };
    
    this.positions.push(position);
    
    // Update balance
    this.balance -= (signal.amount * executionPrice + commission);
    
    console.log(`${signal.action.toUpperCase()} executed: ${signal.amount} at ${executionPrice} (${signal.reason})`);
  }

  private calculateStopLoss(side: 'buy' | 'sell', price: number): number {
    const stopLossPercent = 0.02; // 2% stop loss
    return side === 'buy' ? price * (1 - stopLossPercent) : price * (1 + stopLossPercent);
  }

  private calculateTakeProfit(side: 'buy' | 'sell', price: number): number {
    const takeProfitPercent = 0.04; // 4% take profit
    return side === 'buy' ? price * (1 + takeProfitPercent) : price * (1 - takeProfitPercent);
  }

  private checkStopLossAndTakeProfit(dataPoint: HistoricalDataPoint): void {
    const positionsToClose: BacktestPosition[] = [];
    
    for (const position of this.positions) {
      let shouldClose = false;
      let reason = '';
      
      if (position.side === 'buy') {
        if (position.stopLoss && dataPoint.price <= position.stopLoss) {
          shouldClose = true;
          reason = 'Stop loss triggered';
        } else if (position.takeProfit && dataPoint.price >= position.takeProfit) {
          shouldClose = true;
          reason = 'Take profit triggered';
        }
      } else {
        if (position.stopLoss && dataPoint.price >= position.stopLoss) {
          shouldClose = true;
          reason = 'Stop loss triggered';
        } else if (position.takeProfit && dataPoint.price <= position.takeProfit) {
          shouldClose = true;
          reason = 'Take profit triggered';
        }
      }
      
      if (shouldClose) {
        positionsToClose.push(position);
        this.closePosition(position, dataPoint.price, reason);
      }
    }
    
    // Remove closed positions
    this.positions = this.positions.filter(pos => 
      !positionsToClose.find(closed => closed.id === pos.id)
    );
  }

  private closePosition(position: BacktestPosition, exitPrice: number, reason: string): void {
    // Calculate actual exit price with slippage
    const slippageMultiplier = position.side === 'buy' ? 1 - this.config.slippage : 1 + this.config.slippage;
    const actualExitPrice = exitPrice * slippageMultiplier;
    
    // Calculate commission
    const commission = position.amount * actualExitPrice * this.config.commission;
    
    // Calculate profit/loss
    let profit: number;
    if (position.side === 'buy') {
      profit = (actualExitPrice - position.entryPrice) * position.amount - commission;
    } else {
      profit = (position.entryPrice - actualExitPrice) * position.amount - commission;
    }
    
    // Update balance
    this.balance += (position.amount * actualExitPrice - commission);
    
    // Create trade record
    const trade: BacktestTrade = {
      id: position.id,
      entryTime: position.entryTime,
      exitTime: this.currentTime,
      entryPrice: position.entryPrice,
      exitPrice: actualExitPrice,
      side: position.side,
      amount: position.amount,
      profit: profit,
      commission: commission,
      slippage: Math.abs(actualExitPrice - exitPrice),
      reason: reason
    };
    
    this.trades.push(trade);
    
    console.log(`Position closed: ${position.side} ${position.amount} at ${actualExitPrice}, P&L: ${profit.toFixed(2)} (${reason})`);
  }

  private closeAllPositions(lastDataPoint: HistoricalDataPoint): void {
    for (const position of this.positions) {
      this.closePosition(position, lastDataPoint.price, 'End of backtest');
    }
    this.positions = [];
  }

  private updateEquity(dataPoint: HistoricalDataPoint): void {
    // Calculate unrealized P&L
    let unrealizedPnL = 0;
    
    for (const position of this.positions) {
      if (position.side === 'buy') {
        unrealizedPnL += (dataPoint.price - position.entryPrice) * position.amount;
      } else {
        unrealizedPnL += (position.entryPrice - dataPoint.price) * position.amount;
      }
    }
    
    this.equity = this.balance + unrealizedPnL;
    this.maxEquity = Math.max(this.maxEquity, this.equity);
  }

  private calculateResults(): BacktestResult {
    const winningTrades = this.trades.filter(t => t.profit > 0);
    const losingTrades = this.trades.filter(t => t.profit < 0);
    
    const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
    const totalReturn = (this.balance - this.config.initialBalance) / this.config.initialBalance;
    
    const maxDrawdown = this.calculateMaxDrawdown();
    const sharpeRatio = this.calculateSharpeRatio();
    const profitFactor = this.calculateProfitFactor();
    
    const averageWin = winningTrades.length > 0 ? 
      winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length : 0;
    
    const averageLoss = losingTrades.length > 0 ? 
      losingTrades.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losingTrades.length : 0;
    
    const largestWin = winningTrades.length > 0 ? 
      Math.max(...winningTrades.map(t => t.profit)) : 0;
    
    const largestLoss = losingTrades.length > 0 ? 
      Math.max(...losingTrades.map(t => Math.abs(t.profit))) : 0;
    
    return {
      totalTrades: this.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: this.trades.length > 0 ? winningTrades.length / this.trades.length : 0,
      totalProfit,
      totalReturn,
      maxDrawdown,
      sharpeRatio,
      profitFactor,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      consecutiveWins: this.calculateConsecutiveWins(),
      consecutiveLosses: this.calculateConsecutiveLosses(),
      trades: [...this.trades]
    };
  }

  private calculateMaxDrawdown(): number {
    if (this.trades.length === 0) return 0;
    
    let maxDrawdown = 0;
    let peak = this.config.initialBalance;
    let runningBalance = this.config.initialBalance;
    
    for (const trade of this.trades) {
      runningBalance += trade.profit;
      
      if (runningBalance > peak) {
        peak = runningBalance;
      }
      
      const drawdown = (peak - runningBalance) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateSharpeRatio(): number {
    if (this.trades.length < 2) return 0;
    
    const returns = this.trades.map(t => t.profit / this.config.initialBalance);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    return stdDev === 0 ? 0 : avgReturn / stdDev;
  }

  private calculateProfitFactor(): number {
    const grossProfit = this.trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(this.trades.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));
    
    return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
  }

  private calculateConsecutiveWins(): number {
    let maxStreak = 0;
    let currentStreak = 0;
    
    for (const trade of this.trades) {
      if (trade.profit > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    
    return maxStreak;
  }

  private calculateConsecutiveLosses(): number {
    let maxStreak = 0;
    let currentStreak = 0;
    
    for (const trade of this.trades) {
      if (trade.profit < 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    
    return maxStreak;
  }

  getTrades(): BacktestTrade[] {
    return [...this.trades];
  }

  getCurrentBalance(): number {
    return this.balance;
  }

  getCurrentEquity(): number {
    return this.equity;
  }

  getActivePositions(): BacktestPosition[] {
    return [...this.positions];
  }
}