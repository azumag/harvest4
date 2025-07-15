import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  MarketMakingConfig, 
  AdvancedTradingStrategy, 
  MarketCondition, 
  StrategyPerformance 
} from '../types/advanced-strategies';

export class MarketMakingStrategy implements AdvancedTradingStrategy {
  name = 'Market Making';
  config: MarketMakingConfig;
  
  private priceHistory: number[] = [];
  private inventory = 0;
  private maxInventory: number;
  private totalTrades = 0;
  private winningTrades = 0;
  private totalProfit = 0;
  private maxDrawdown = 0;
  private currentDrawdown = 0;
  private lastUpdated = Date.now();
  private lastQuoteTime = 0;
  private bidPrice = 0;
  private askPrice = 0;

  constructor(config: MarketMakingConfig) {
    this.config = config;
    this.maxInventory = config.params.maxInventory;
  }

  updateMarketData(ticker: BitbankTicker): void {
    const currentPrice = parseFloat(ticker.last);
    this.priceHistory.push(currentPrice);
    
    // Keep only recent history for efficiency
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }
    
    // Update quotes if necessary
    this.updateQuotes(ticker);
  }

  generateSignal(ticker: BitbankTicker, marketCondition: MarketCondition): TradingSignal {
    if (!this.config.enabled) {
      return this.createHoldSignal(ticker, 'Strategy disabled');
    }

    const currentPrice = parseFloat(ticker.last);
    
    // Market making works best in low volatility environments
    if (marketCondition.volatility === 'high') {
      return this.createHoldSignal(ticker, 'High volatility - unsuitable for market making');
    }
    
    // Check if we need to adjust inventory
    if (this.needsInventoryAdjustment(currentPrice)) {
      return this.generateInventoryAdjustmentSignal(ticker);
    }
    
    // Generate market making signal
    return this.generateMarketMakingSignal(ticker, currentPrice);
  }

  private updateQuotes(ticker: BitbankTicker): void {
    const currentTime = Date.now();
    const currentPrice = parseFloat(ticker.last);
    
    // Update quotes based on requote threshold
    if (currentTime - this.lastQuoteTime > 1000 || this.shouldRequote(currentPrice)) {
      const spread = this.calculateOptimalSpread(ticker);
      
      this.bidPrice = currentPrice * (1 - spread / 2);
      this.askPrice = currentPrice * (1 + spread / 2);
      
      this.lastQuoteTime = currentTime;
    }
  }

  private shouldRequote(currentPrice: number): boolean {
    if (this.bidPrice === 0 || this.askPrice === 0) return true;
    
    const midPrice = (this.bidPrice + this.askPrice) / 2;
    const priceMove = Math.abs(currentPrice - midPrice) / midPrice;
    
    return priceMove > this.config.params.requoteThreshold;
  }

  private calculateOptimalSpread(ticker: BitbankTicker): number {
    const baseSpread = (this.config.params.bidSpread + this.config.params.askSpread) / 2;
    const volume = parseFloat(ticker.vol);
    const volatility = this.calculateVolatility();
    
    // Adjust spread based on market conditions
    let adjustedSpread = baseSpread;
    
    // Increase spread in low volume
    if (volume < 1000) {
      adjustedSpread *= 1.5;
    }
    
    // Increase spread in high volatility
    if (volatility > 0.02) {
      adjustedSpread *= (1 + volatility * 10);
    }
    
    // Adjust spread based on inventory
    const inventoryRatio = Math.abs(this.inventory) / this.maxInventory;
    if (inventoryRatio > 0.7) {
      adjustedSpread *= (1 + inventoryRatio);
    }
    
    return Math.max(adjustedSpread, 0.001); // Minimum 0.1% spread
  }

  private generateMarketMakingSignal(ticker: BitbankTicker, _currentPrice: number): TradingSignal {
    // const _currentTime = Date.now();
    
    // Determine which side to quote based on inventory
    const inventoryRatio = this.inventory / this.maxInventory;
    
    // If we have too much inventory, focus on selling
    if (inventoryRatio > 0.5) {
      return {
        action: 'sell',
        confidence: 0.7,
        price: this.askPrice,
        amount: Math.min(Math.abs(this.inventory), this.config.params.maxInventory * 0.1),
        reason: `Market making sell: reducing inventory (${this.inventory.toFixed(4)} BTC)`,
      };
    }
    
    // If we have low inventory, focus on buying
    if (inventoryRatio < -0.5) {
      return {
        action: 'buy',
        confidence: 0.7,
        price: this.bidPrice,
        amount: Math.min(this.maxInventory * 0.1, this.maxInventory - Math.abs(this.inventory)),
        reason: `Market making buy: building inventory (${this.inventory.toFixed(4)} BTC)`,
      };
    }
    
    // Normal market making - alternate between bid and ask
    const shouldBuy = Math.random() > 0.5;
    
    if (shouldBuy && this.inventory < this.maxInventory) {
      return {
        action: 'buy',
        confidence: 0.6,
        price: this.bidPrice,
        amount: this.maxInventory * 0.05, // 5% of max inventory
        reason: `Market making buy at ${this.bidPrice.toFixed(2)}`,
      };
    } else if (!shouldBuy && this.inventory > -this.maxInventory) {
      return {
        action: 'sell',
        confidence: 0.6,
        price: this.askPrice,
        amount: this.maxInventory * 0.05, // 5% of max inventory
        reason: `Market making sell at ${this.askPrice.toFixed(2)}`,
      };
    }
    
    return this.createHoldSignal(ticker, 'Inventory at capacity');
  }

  private needsInventoryAdjustment(_currentPrice: number): boolean {
    const inventoryRatio = Math.abs(this.inventory) / this.maxInventory;
    return inventoryRatio > 0.8;
  }

  private generateInventoryAdjustmentSignal(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    
    // If we have too much long inventory, sell at market
    if (this.inventory > this.maxInventory * 0.8) {
      return {
        action: 'sell',
        confidence: 0.9,
        price: currentPrice * 0.999, // Slightly below market for quick execution
        amount: Math.abs(this.inventory) * 0.3, // Sell 30% of excess
        reason: `Inventory adjustment: reducing long position (${this.inventory.toFixed(4)} BTC)`,
      };
    }
    
    // If we have too much short inventory, buy at market
    if (this.inventory < -this.maxInventory * 0.8) {
      return {
        action: 'buy',
        confidence: 0.9,
        price: currentPrice * 1.001, // Slightly above market for quick execution
        amount: Math.abs(this.inventory) * 0.3, // Buy 30% to cover
        reason: `Inventory adjustment: covering short position (${this.inventory.toFixed(4)} BTC)`,
      };
    }
    
    return this.createHoldSignal(ticker, 'Inventory within acceptable range');
  }

  private calculateVolatility(): number {
    if (this.priceHistory.length < 20) return 0;
    
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      const current = this.priceHistory[i];
      const previous = this.priceHistory[i-1];
      if (current && previous && previous !== 0) {
        returns.push((current - previous) / previous);
      }
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
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

  // Method to update inventory when trades are executed
  updateInventory(amount: number, side: 'buy' | 'sell'): void {
    if (side === 'buy') {
      this.inventory += amount;
    } else {
      this.inventory -= amount;
    }
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

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getWeight(): number {
    return this.config.weight;
  }

  // Getter for current inventory level
  getCurrentInventory(): number {
    return this.inventory;
  }
}