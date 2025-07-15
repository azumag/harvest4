import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  ArbitrageConfig, 
  AdvancedTradingStrategy, 
  MarketCondition, 
  StrategyPerformance 
} from '../types/advanced-strategies';

export class ArbitrageStrategy implements AdvancedTradingStrategy {
  name = 'Arbitrage';
  config: ArbitrageConfig;
  
  private priceHistory: Array<{ price: number; timestamp: number; exchange: string }> = [];
  private arbitrageOpportunities: Array<{
    buyPrice: number;
    sellPrice: number;
    spread: number;
    timestamp: number;
  }> = [];
  private totalTrades = 0;
  private winningTrades = 0;
  private totalProfit = 0;
  private maxDrawdown = 0;
  private currentDrawdown = 0;
  private lastUpdated = Date.now();

  constructor(config: ArbitrageConfig) {
    this.config = config;
  }

  updateMarketData(ticker: BitbankTicker): void {
    const currentPrice = parseFloat(ticker.last);
    const timestamp = Date.now();
    
    // Add current price to history
    this.priceHistory.push({
      price: currentPrice,
      timestamp,
      exchange: 'bitbank'
    });
    
    // Keep only recent history (last 5 minutes)
    const fiveMinutesAgo = timestamp - 5 * 60 * 1000;
    this.priceHistory = this.priceHistory.filter(p => p.timestamp > fiveMinutesAgo);
    
    // Simulate additional exchange data for arbitrage opportunities
    this.simulateExchangeData(currentPrice, timestamp);
    
    // Detect arbitrage opportunities
    this.detectArbitrageOpportunities();
  }

  generateSignal(ticker: BitbankTicker, _marketCondition: MarketCondition): TradingSignal {
    if (!this.config.enabled) {
      return this.createHoldSignal(ticker, 'Strategy disabled');
    }

    const currentPrice = parseFloat(ticker.last);
    
    // Find the best arbitrage opportunity
    const opportunity = this.findBestArbitrageOpportunity(currentPrice);
    
    if (opportunity) {
      return this.generateArbitrageSignal(ticker, opportunity);
    }

    // Statistical arbitrage: look for mean reversion opportunities
    const statisticalSignal = this.generateStatisticalArbitrageSignal(ticker, currentPrice);
    if (statisticalSignal.action !== 'hold') {
      return statisticalSignal;
    }

    return this.createHoldSignal(ticker, 'No arbitrage opportunities detected');
  }

  private simulateExchangeData(basePrice: number, timestamp: number): void {
    // Simulate price data from other exchanges with realistic spreads
    const exchanges = ['coincheck', 'liquid', 'zaif'];
    
    for (const exchange of exchanges) {
      // Add some random variation to simulate different exchange prices
      const variation = (Math.random() - 0.5) * 0.01; // ±0.5% variation
      const price = basePrice * (1 + variation);
      
      this.priceHistory.push({
        price,
        timestamp,
        exchange
      });
    }
  }

  private detectArbitrageOpportunities(): void {
    const currentTime = Date.now();
    const recentPrices = this.priceHistory.filter(p => currentTime - p.timestamp < 30000); // Last 30 seconds
    
    if (recentPrices.length < 2) return;
    
    // Group by exchange
    const exchangePrices = new Map<string, number>();
    for (const price of recentPrices) {
      if (!exchangePrices.has(price.exchange) || price.timestamp > recentPrices.find(p => p.exchange === price.exchange)!.timestamp) {
        exchangePrices.set(price.exchange, price.price);
      }
    }
    
    // Find arbitrage opportunities between exchanges
    const prices = Array.from(exchangePrices.values());
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    const spread = (maxPrice - minPrice) / minPrice;
    
    if (spread > this.config.params.minSpread) {
      this.arbitrageOpportunities.push({
        buyPrice: minPrice,
        sellPrice: maxPrice,
        spread,
        timestamp: currentTime
      });
    }
    
    // Keep only recent opportunities
    this.arbitrageOpportunities = this.arbitrageOpportunities.filter(
      opp => currentTime - opp.timestamp < 60000 // Last 1 minute
    );
  }

  private findBestArbitrageOpportunity(_currentPrice: number): any {
    if (this.arbitrageOpportunities.length === 0) return null;
    
    // Find the opportunity with the highest spread
    const best = this.arbitrageOpportunities.reduce((best, current) => 
      current.spread > best.spread ? current : best
    );
    
    // Check if the opportunity is still viable
    const timeSince = Date.now() - best.timestamp;
    if (timeSince > this.config.params.exchangeDelayMs) {
      return null;
    }
    
    return best;
  }

  private generateArbitrageSignal(ticker: BitbankTicker, opportunity: any): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    
    // Determine if we should buy or sell based on current price vs arbitrage prices
    if (currentPrice <= opportunity.buyPrice * 1.001) { // 0.1% tolerance
      return {
        action: 'buy',
        confidence: Math.min(0.9, opportunity.spread * 10),
        price: opportunity.buyPrice,
        amount: this.config.params.maxRiskPerTrade / opportunity.buyPrice,
        reason: `Arbitrage buy opportunity: ${(opportunity.spread * 100).toFixed(2)}% spread`,
      };
    } else if (currentPrice >= opportunity.sellPrice * 0.999) { // 0.1% tolerance
      return {
        action: 'sell',
        confidence: Math.min(0.9, opportunity.spread * 10),
        price: opportunity.sellPrice,
        amount: this.config.params.maxRiskPerTrade / opportunity.sellPrice,
        reason: `Arbitrage sell opportunity: ${(opportunity.spread * 100).toFixed(2)}% spread`,
      };
    }
    
    return this.createHoldSignal(ticker, 'Arbitrage opportunity expired');
  }

  private generateStatisticalArbitrageSignal(ticker: BitbankTicker, currentPrice: number): TradingSignal {
    if (this.priceHistory.length < 50) {
      return this.createHoldSignal(ticker, 'Insufficient data for statistical arbitrage');
    }
    
    // Calculate moving average and standard deviation
    const recentPrices = this.priceHistory
      .filter(p => p.exchange === 'bitbank')
      .slice(-50)
      .map(p => p.price);
    
    const mean = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / recentPrices.length;
    const stdDev = Math.sqrt(variance);
    
    // Z-score based signals
    const zScore = (currentPrice - mean) / stdDev;
    
    // Buy when price is significantly below mean
    if (zScore < -2) {
      return {
        action: 'buy',
        confidence: Math.min(0.8, Math.abs(zScore) / 3),
        price: currentPrice,
        amount: this.config.params.maxRiskPerTrade / currentPrice,
        reason: `Statistical arbitrage buy: Z-score ${zScore.toFixed(2)}`,
      };
    }
    
    // Sell when price is significantly above mean
    if (zScore > 2) {
      return {
        action: 'sell',
        confidence: Math.min(0.8, Math.abs(zScore) / 3),
        price: currentPrice,
        amount: this.config.params.maxRiskPerTrade / currentPrice,
        reason: `Statistical arbitrage sell: Z-score ${zScore.toFixed(2)}`,
      };
    }
    
    return this.createHoldSignal(ticker, 'Price within normal range');
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
    
    const prices = this.priceHistory
      .filter(p => p.exchange === 'bitbank')
      .slice(-20)
      .map(p => p.price);
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const current = prices[i];
      const previous = prices[i-1];
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