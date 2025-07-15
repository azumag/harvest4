import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  GridTradingConfig, 
  AdvancedTradingStrategy, 
  MarketCondition, 
  StrategyPerformance 
} from '../types/advanced-strategies';

export class GridTradingStrategy implements AdvancedTradingStrategy {
  name = 'Grid Trading';
  config: GridTradingConfig;
  
  private priceHistory: number[] = [];
  private gridLevels: Array<{ price: number; side: 'buy' | 'sell'; filled: boolean }> = [];
  private basePrice = 0;
  private totalTrades = 0;
  private winningTrades = 0;
  private totalProfit = 0;
  private maxDrawdown = 0;
  private currentDrawdown = 0;
  private lastUpdated = Date.now();

  constructor(config: GridTradingConfig) {
    this.config = config;
  }

  updateMarketData(ticker: BitbankTicker): void {
    const currentPrice = parseFloat(ticker.last);
    this.priceHistory.push(currentPrice);
    
    // Keep only recent history for efficiency
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }

    // Initialize base price if not set
    if (this.basePrice === 0) {
      this.basePrice = currentPrice;
      this.initializeGridLevels();
    }

    // Check if we need to rebalance the grid
    if (this.shouldRebalanceGrid(currentPrice)) {
      this.rebalanceGrid(currentPrice);
    }
  }

  generateSignal(ticker: BitbankTicker, marketCondition: MarketCondition): TradingSignal {
    if (!this.config.enabled) {
      return this.createHoldSignal(ticker, 'Strategy disabled');
    }

    const currentPrice = parseFloat(ticker.last);
    
    // Grid trading works best in sideways markets
    if (marketCondition.trend === 'sideways') {
      return this.generateGridSignal(ticker, currentPrice);
    }

    // In trending markets, adjust strategy
    if (marketCondition.trend === 'bullish') {
      return this.generateTrendFollowingSignal(ticker, currentPrice, 'buy');
    } else if (marketCondition.trend === 'bearish') {
      return this.generateTrendFollowingSignal(ticker, currentPrice, 'sell');
    }

    return this.createHoldSignal(ticker, 'Waiting for favorable market conditions');
  }

  private generateGridSignal(ticker: BitbankTicker, currentPrice: number): TradingSignal {
    // Find the nearest grid levels
    const nearestBuyLevel = this.findNearestGridLevel(currentPrice, 'buy');
    const nearestSellLevel = this.findNearestGridLevel(currentPrice, 'sell');

    // Check if we're near a buy level
    if (nearestBuyLevel && !nearestBuyLevel.filled) {
      const priceDiff = Math.abs(currentPrice - nearestBuyLevel.price);
      const threshold = nearestBuyLevel.price * 0.002; // 0.2% threshold
      
      if (priceDiff <= threshold) {
        return {
          action: 'buy',
          confidence: 0.8,
          price: nearestBuyLevel.price,
          amount: this.config.params.quantityPerLevel,
          reason: `Grid buy at level ${nearestBuyLevel.price.toFixed(2)}`,
        };
      }
    }

    // Check if we're near a sell level
    if (nearestSellLevel && !nearestSellLevel.filled) {
      const priceDiff = Math.abs(currentPrice - nearestSellLevel.price);
      const threshold = nearestSellLevel.price * 0.002; // 0.2% threshold
      
      if (priceDiff <= threshold) {
        return {
          action: 'sell',
          confidence: 0.8,
          price: nearestSellLevel.price,
          amount: this.config.params.quantityPerLevel,
          reason: `Grid sell at level ${nearestSellLevel.price.toFixed(2)}`,
        };
      }
    }

    return this.createHoldSignal(ticker, 'Waiting for grid level activation');
  }

  private generateTrendFollowingSignal(ticker: BitbankTicker, currentPrice: number, direction: 'buy' | 'sell'): TradingSignal {
    // In trending markets, bias the grid towards the trend direction
    const biasedAmount = this.config.params.quantityPerLevel * 1.2; // 20% more aggressive
    
    if (direction === 'buy') {
      // Look for buy opportunities below current price
      const buyLevel = this.findNearestGridLevel(currentPrice, 'buy');
      if (buyLevel && !buyLevel.filled) {
        return {
          action: 'buy',
          confidence: 0.7,
          price: buyLevel.price,
          amount: biasedAmount,
          reason: `Trend-following grid buy at ${buyLevel.price.toFixed(2)}`,
        };
      }
    } else {
      // Look for sell opportunities above current price
      const sellLevel = this.findNearestGridLevel(currentPrice, 'sell');
      if (sellLevel && !sellLevel.filled) {
        return {
          action: 'sell',
          confidence: 0.7,
          price: sellLevel.price,
          amount: biasedAmount,
          reason: `Trend-following grid sell at ${sellLevel.price.toFixed(2)}`,
        };
      }
    }

    return this.createHoldSignal(ticker, 'No suitable grid level for trend following');
  }

  private initializeGridLevels(): void {
    this.gridLevels = [];
    const { priceRange, gridLevels } = this.config.params;
    const levelSpacing = (priceRange * 2) / gridLevels;
    
    // Create grid levels above and below base price
    for (let i = 0; i < gridLevels; i++) {
      const offset = (i - Math.floor(gridLevels / 2)) * levelSpacing;
      const price = this.basePrice + offset;
      
      if (price > 0) {
        this.gridLevels.push({
          price,
          side: offset > 0 ? 'sell' : 'buy',
          filled: false,
        });
      }
    }
  }

  private shouldRebalanceGrid(currentPrice: number): boolean {
    const priceChange = Math.abs(currentPrice - this.basePrice) / this.basePrice;
    return priceChange > this.config.params.rebalanceThreshold;
  }

  private rebalanceGrid(currentPrice: number): void {
    // Update base price and reinitialize grid
    this.basePrice = currentPrice;
    this.initializeGridLevels();
  }

  private findNearestGridLevel(currentPrice: number, side: 'buy' | 'sell'): { price: number; side: 'buy' | 'sell'; filled: boolean } | null {
    const levelsSameSide = this.gridLevels.filter(level => level.side === side);
    
    if (levelsSameSide.length === 0) return null;
    
    let nearest = levelsSameSide[0];
    if (!nearest) return null;
    
    let minDistance = Math.abs(currentPrice - nearest.price);
    
    for (const level of levelsSameSide) {
      const distance = Math.abs(currentPrice - level.price);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = level;
      }
    }
    
    return nearest;
  }

  private createHoldSignal(ticker: BitbankTicker, reason: string): TradingSignal {
    return {
      action: 'hold',
      confidence: 0.5,
      price: parseFloat(ticker.last),
      amount: 0,
      reason,
    };
  }

  updatePerformance(profit: number, tradeResult: 'win' | 'loss'): void {
    this.totalTrades++;
    this.totalProfit += profit;
    
    if (tradeResult === 'win') {
      this.winningTrades++;
    }
    
    // Update drawdown
    if (profit < 0) {
      this.currentDrawdown += Math.abs(profit);
      this.maxDrawdown = Math.max(this.maxDrawdown, this.currentDrawdown);
    } else {
      this.currentDrawdown = Math.max(0, this.currentDrawdown - profit);
    }
    
    this.lastUpdated = Date.now();
  }

  getPerformanceMetrics(): StrategyPerformance {
    return {
      name: this.name,
      totalTrades: this.totalTrades,
      winRate: this.totalTrades > 0 ? this.winningTrades / this.totalTrades : 0,
      averageProfit: this.totalTrades > 0 ? this.totalProfit / this.totalTrades : 0,
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.maxDrawdown,
      lastUpdated: this.lastUpdated,
    };
  }

  private calculateSharpeRatio(): number {
    if (this.totalTrades < 10) return 0;
    
    // Simplified Sharpe ratio calculation
    const averageReturn = this.totalProfit / this.totalTrades;
    const volatility = this.calculateVolatility();
    
    return volatility > 0 ? averageReturn / volatility : 0;
  }

  private calculateVolatility(): number {
    if (this.priceHistory.length < 20) return 0;
    
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      const current = this.priceHistory[i];
      const previous = this.priceHistory[i-1];
      if (current !== undefined && previous !== undefined && previous !== 0) {
        returns.push((current - previous) / previous);
      }
    }
    
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getWeight(): number {
    return this.config.weight;
  }
}