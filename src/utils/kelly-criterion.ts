export interface TradeResult {
  profit: number;
  isWin: boolean;
}

export interface TradingStatistics {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  profitFactor: number;
}

export class KellyCriterionCalculator {
  private maxKellyPercentage: number = 0.25; // Cap at 25%
  private conservativeScale: number = 0.75;   // Use 75% of Kelly
  private minPositionSize: number = 1000;     // Minimum 1000 JPY
  private maxPositionSize: number = 100000;   // Maximum 100,000 JPY
  private drawdownAdjustment: boolean = false;
  
  private cachedStats: TradingStatistics | undefined;

  constructor() {}

  calculateKellyPercentage(winRate: number, avgWin: number, avgLoss: number): number {
    // Validate inputs
    if (winRate <= 0 || winRate >= 1 || avgWin <= 0 || avgLoss <= 0) {
      return 0;
    }

    // Kelly Criterion: f = (bp - q) / b
    // where:
    // f = fraction of capital to wager
    // b = odds received (avg win / avg loss)
    // p = probability of winning (win rate)
    // q = probability of losing (1 - win rate)
    
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - winRate;
    
    const kelly = (b * p - q) / b;
    
    // Return 0 for negative expectation
    if (kelly <= 0) {
      return 0;
    }
    
    // Cap at maximum allowed percentage
    return Math.min(kelly, this.maxKellyPercentage);
  }

  calculatePositionSize(
    accountBalance: number, 
    winRate: number, 
    avgWin: number, 
    avgLoss: number
  ): number {
    const kellyPercentage = this.calculateKellyPercentage(winRate, avgWin, avgLoss);
    let positionSize = accountBalance * kellyPercentage * this.conservativeScale;
    
    // Apply min/max constraints
    positionSize = Math.max(positionSize, this.minPositionSize);
    positionSize = Math.min(positionSize, this.maxPositionSize);
    
    return Math.round(positionSize);
  }

  calculatePositionSizeWithDrawdown(
    accountBalance: number,
    winRate: number,
    avgWin: number,
    avgLoss: number,
    currentDrawdown: number
  ): number {
    let positionSize = this.calculatePositionSize(accountBalance, winRate, avgWin, avgLoss);
    
    if (this.drawdownAdjustment && currentDrawdown > 0) {
      // Reduce position size based on drawdown severity
      // More severe drawdowns lead to smaller positions
      const adjustmentFactor = Math.max(0.5, 1 - currentDrawdown * 2);
      positionSize *= adjustmentFactor;
    }
    
    return Math.round(positionSize);
  }

  calculateVolatilityAdjustedSize(
    accountBalance: number,
    winRate: number,
    avgWin: number,
    avgLoss: number,
    volatility: number
  ): number {
    let positionSize = this.calculatePositionSize(accountBalance, winRate, avgWin, avgLoss);
    
    // Reduce position size for higher volatility
    // Volatility above 2% starts reducing position size
    if (volatility > 0.02) {
      const volAdjustment = Math.max(0.5, 1 - (volatility - 0.02) * 10);
      positionSize *= volAdjustment;
    }
    
    return Math.round(positionSize);
  }

  updateFromTradeHistory(trades: TradeResult[]): void {
    if (trades.length === 0) {
      this.cachedStats = {
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        totalTrades: 0,
        profitFactor: 0,
      };
      return;
    }

    const winningTrades = trades.filter(trade => trade.isWin);
    const losingTrades = trades.filter(trade => !trade.isWin);
    
    const winRate = winningTrades.length / trades.length;
    
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, trade) => sum + trade.profit, 0) / winningTrades.length
      : 0;
      
    const avgLoss = losingTrades.length > 0 
      ? Math.abs(losingTrades.reduce((sum, trade) => sum + trade.profit, 0) / losingTrades.length)
      : 0;
    
    const totalWins = winningTrades.reduce((sum, trade) => sum + trade.profit, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.profit, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    this.cachedStats = {
      winRate,
      avgWin,
      avgLoss,
      totalTrades: trades.length,
      profitFactor,
    };
  }

  calculateOptimalPositionSize(accountBalance: number): number {
    if (!this.cachedStats) {
      return this.minPositionSize;
    }

    return this.calculatePositionSize(
      accountBalance,
      this.cachedStats.winRate,
      this.cachedStats.avgWin,
      this.cachedStats.avgLoss
    );
  }

  getStatistics(): TradingStatistics {
    return this.cachedStats || {
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      totalTrades: 0,
      profitFactor: 0,
    };
  }

  // Configuration methods
  setMaxKellyPercentage(percentage: number): void {
    this.maxKellyPercentage = Math.max(0, Math.min(1, percentage));
  }

  setConservativeScale(scale: number): void {
    this.conservativeScale = Math.max(0.1, Math.min(1, scale));
  }

  setMinPositionSize(size: number): void {
    this.minPositionSize = Math.max(0, size);
  }

  setMaxPositionSize(size: number): void {
    this.maxPositionSize = Math.max(this.minPositionSize, size);
  }

  setDrawdownAdjustment(enabled: boolean): void {
    this.drawdownAdjustment = enabled;
  }

  // Utility methods
  getMaxKellyPercentage(): number {
    return this.maxKellyPercentage;
  }

  getConservativeScale(): number {
    return this.conservativeScale;
  }

  isPositiveProfitExpectation(): boolean {
    if (!this.cachedStats) return false;
    
    const { winRate, avgWin, avgLoss } = this.cachedStats;
    return (winRate * avgWin) > ((1 - winRate) * avgLoss);
  }

  getExpectedValue(positionSize: number): number {
    if (!this.cachedStats) return 0;
    
    const { winRate, avgWin, avgLoss } = this.cachedStats;
    return (winRate * avgWin - (1 - winRate) * avgLoss) * (positionSize / 1000);
  }

  reset(): void {
    this.cachedStats = undefined;
  }
}