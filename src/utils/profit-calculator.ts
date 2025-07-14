import { TradingPosition, ProfitCalculation } from '../types/bitbank';

export interface TradeRecord {
  id: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  buyTimestamp: number;
  sellTimestamp: number;
  profit: number;
  returnRate: number;
}

export class ProfitCalculator {
  private trades: TradeRecord[] = [];
  private openPositions: Map<string, TradingPosition> = new Map();
  private initialBalance: number;
  private currentBalance: number;
  private maxBalance: number;

  constructor(initialBalance: number) {
    this.initialBalance = initialBalance;
    this.currentBalance = initialBalance;
    this.maxBalance = initialBalance;
  }

  addPosition(id: string, position: TradingPosition): void {
    this.openPositions.set(id, position);
  }

  closePosition(id: string, exitPrice: number, exitTimestamp: number): TradeRecord | null {
    const position = this.openPositions.get(id);
    if (!position) {
      return null;
    }

    const trade: TradeRecord = {
      id,
      buyPrice: position.side === 'buy' ? position.price : exitPrice,
      sellPrice: position.side === 'sell' ? position.price : exitPrice,
      amount: position.amount,
      buyTimestamp: position.side === 'buy' ? position.timestamp : exitTimestamp,
      sellTimestamp: position.side === 'sell' ? position.timestamp : exitTimestamp,
      profit: 0,
      returnRate: 0,
    };

    // Calculate profit
    if (position.side === 'buy') {
      trade.profit = (exitPrice - position.price) * position.amount;
    } else {
      trade.profit = (position.price - exitPrice) * position.amount;
    }

    // Calculate return rate
    const investment = position.price * position.amount;
    trade.returnRate = trade.profit / investment;

    this.trades.push(trade);
    this.openPositions.delete(id);
    
    // Update balance
    this.currentBalance += trade.profit;
    this.maxBalance = Math.max(this.maxBalance, this.currentBalance);

    return trade;
  }

  calculateProfitMetrics(): ProfitCalculation {
    const totalProfit = this.trades.reduce((sum, trade) => sum + trade.profit, 0);
    const totalReturn = (this.currentBalance - this.initialBalance) / this.initialBalance;
    
    const winningTrades = this.trades.filter(trade => trade.profit > 0);
    const winRate = this.trades.length > 0 ? winningTrades.length / this.trades.length : 0;
    
    const currentDrawdown = (this.maxBalance - this.currentBalance) / this.maxBalance;
    const maxDrawdown = this.calculateMaxDrawdown();

    return {
      totalProfit,
      totalReturn,
      winRate,
      totalTrades: this.trades.length,
      currentDrawdown,
      maxDrawdown,
    };
  }

  private calculateMaxDrawdown(): number {
    if (this.trades.length === 0) return 0;

    let maxDrawdown = 0;
    let peak = this.initialBalance;
    let runningBalance = this.initialBalance;

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

  getTradeHistory(): TradeRecord[] {
    return [...this.trades];
  }

  getOpenPositions(): TradingPosition[] {
    return Array.from(this.openPositions.values());
  }

  getCurrentBalance(): number {
    return this.currentBalance;
  }

  getTotalProfit(): number {
    return this.currentBalance - this.initialBalance;
  }

  getProfitPercentage(): number {
    return ((this.currentBalance - this.initialBalance) / this.initialBalance) * 100;
  }

  getAverageTradeProfit(): number {
    if (this.trades.length === 0) return 0;
    return this.trades.reduce((sum, trade) => sum + trade.profit, 0) / this.trades.length;
  }

  getBestTrade(): TradeRecord | null {
    if (this.trades.length === 0) return null;
    return this.trades.reduce((best, current) => 
      current.profit > best.profit ? current : best
    );
  }

  getWorstTrade(): TradeRecord | null {
    if (this.trades.length === 0) return null;
    return this.trades.reduce((worst, current) => 
      current.profit < worst.profit ? current : worst
    );
  }

  getWinningStreak(): number {
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

  getLosingStreak(): number {
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

  reset(): void {
    this.trades = [];
    this.openPositions.clear();
    this.currentBalance = this.initialBalance;
    this.maxBalance = this.initialBalance;
  }

  getPerformanceReport(): string {
    const metrics = this.calculateProfitMetrics();
    const bestTrade = this.getBestTrade();
    const worstTrade = this.getWorstTrade();

    return `
=== PROFIT CALCULATION REPORT ===
Total Profit: ${metrics.totalProfit.toFixed(2)} JPY
Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%
Win Rate: ${(metrics.winRate * 100).toFixed(2)}%
Total Trades: ${metrics.totalTrades}
Current Balance: ${this.currentBalance.toFixed(2)} JPY
Current Drawdown: ${(metrics.currentDrawdown * 100).toFixed(2)}%
Max Drawdown: ${(metrics.maxDrawdown * 100).toFixed(2)}%

Best Trade: ${bestTrade ? bestTrade.profit.toFixed(2) : 'N/A'} JPY
Worst Trade: ${worstTrade ? worstTrade.profit.toFixed(2) : 'N/A'} JPY
Average Trade: ${this.getAverageTradeProfit().toFixed(2)} JPY

Winning Streak: ${this.getWinningStreak()}
Losing Streak: ${this.getLosingStreak()}
=================================
    `.trim();
  }
}