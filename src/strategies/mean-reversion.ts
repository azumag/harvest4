import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  MeanReversionConfig, 
  AdvancedTradingStrategy, 
  MarketCondition, 
  StrategyPerformance 
} from '../types/advanced-strategies';

export class MeanReversionStrategy implements AdvancedTradingStrategy {
  name = 'Mean Reversion';
  config: MeanReversionConfig;
  
  private priceHistory: number[] = [];
  private positionEntryTime = 0;
  private totalTrades = 0;
  private winningTrades = 0;
  private totalProfit = 0;
  private maxDrawdown = 0;
  private currentDrawdown = 0;
  private lastUpdated = Date.now();
  private lastSignalTime = 0;

  constructor(config: MeanReversionConfig) {
    this.config = config;
  }

  updateMarketData(ticker: BitbankTicker): void {
    const currentPrice = parseFloat(ticker.last);
    this.priceHistory.push(currentPrice);
    
    // Keep only relevant history
    const historySize = Math.max(this.config.params.lookbackPeriod * 2, 100);
    if (this.priceHistory.length > historySize) {
      this.priceHistory.shift();
    }
  }

  generateSignal(ticker: BitbankTicker, marketCondition: MarketCondition): TradingSignal {
    if (!this.config.enabled) {
      return this.createHoldSignal(ticker, 'Strategy disabled');
    }

    const currentPrice = parseFloat(ticker.last);
    
    // Need sufficient data for mean reversion analysis
    if (this.priceHistory.length < this.config.params.lookbackPeriod) {
      return this.createHoldSignal(ticker, 'Insufficient data for mean reversion analysis');
    }
    
    // Mean reversion works best in sideways markets
    if (marketCondition.trend !== 'sideways') {
      return this.createHoldSignal(ticker, 'Trending market - mean reversion strategy inactive');
    }
    
    // Check for maximum holding period
    if (this.positionEntryTime > 0) {
      const holdingTime = Date.now() - this.positionEntryTime;
      if (holdingTime > this.config.params.maxHoldingPeriod * 1000) {
        this.positionEntryTime = 0;
        return this.createHoldSignal(ticker, 'Maximum holding period exceeded');
      }
    }
    
    // Calculate mean reversion signal
    const meanReversionSignal = this.calculateMeanReversionSignal(ticker, currentPrice);
    
    // Check for reversion strength
    if (meanReversionSignal.action !== 'hold') {
      const reversionStrength = this.calculateReversionStrength(currentPrice);
      if (reversionStrength >= this.config.params.minReversionStrength) {
        return meanReversionSignal;
      }
    }
    
    return this.createHoldSignal(ticker, 'No mean reversion opportunity detected');
  }

  private calculateMeanReversionSignal(ticker: BitbankTicker, currentPrice: number): TradingSignal {
    const lookbackPeriod = this.config.params.lookbackPeriod;
    const recentPrices = this.priceHistory.slice(-lookbackPeriod);
    
    // Calculate statistics
    const mean = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / recentPrices.length;
    const stdDev = Math.sqrt(variance);
    
    // Calculate Z-score
    const zScore = (currentPrice - mean) / stdDev;
    const absZScore = Math.abs(zScore);
    
    // Check for oversold condition (price below mean)
    if (zScore < -this.config.params.standardDeviations) {
      const confidence = Math.min(0.9, absZScore / this.config.params.standardDeviations * 0.7);
      
      return {
        action: 'buy',
        confidence,
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `Mean reversion buy: Z-score ${zScore.toFixed(2)}, price ${currentPrice.toFixed(2)} vs mean ${mean.toFixed(2)}`,
      };
    }
    
    // Check for overbought condition (price above mean)
    if (zScore > this.config.params.standardDeviations) {
      const confidence = Math.min(0.9, absZScore / this.config.params.standardDeviations * 0.7);
      
      return {
        action: 'sell',
        confidence,
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `Mean reversion sell: Z-score ${zScore.toFixed(2)}, price ${currentPrice.toFixed(2)} vs mean ${mean.toFixed(2)}`,
      };
    }
    
    return this.createHoldSignal(ticker, `Price within normal range: Z-score ${zScore.toFixed(2)}`);
  }

  private calculateReversionStrength(currentPrice: number): number {
    if (this.priceHistory.length < 20) return 0;
    
    // Calculate different time frame means
    const shortTermMean = this.calculateMean(10);
    const mediumTermMean = this.calculateMean(20);
    const longTermMean = this.calculateMean(this.config.params.lookbackPeriod);
    
    // Calculate how much price deviates from different means
    const shortTermDeviation = Math.abs(currentPrice - shortTermMean) / shortTermMean;
    const mediumTermDeviation = Math.abs(currentPrice - mediumTermMean) / mediumTermMean;
    const longTermDeviation = Math.abs(currentPrice - longTermMean) / longTermMean;
    
    // Average deviation across time frames
    const avgDeviation = (shortTermDeviation + mediumTermDeviation + longTermDeviation) / 3;
    
    // Calculate momentum towards mean
    const momentumTowardsMean = this.calculateMomentumTowardsMean(currentPrice);
    
    // Combine deviation and momentum for reversion strength
    return avgDeviation * 0.7 + momentumTowardsMean * 0.3;
  }

  private calculateMean(period: number): number {
    if (this.priceHistory.length < period) {
      return this.priceHistory[this.priceHistory.length - 1] || 0;
    }
    
    const recentPrices = this.priceHistory.slice(-period);
    return recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
  }

  private calculateMomentumTowardsMean(currentPrice: number): number {
    if (this.priceHistory.length < 5) return 0;
    
    const mean = this.calculateMean(this.config.params.lookbackPeriod);
    const previousPrice = this.priceHistory[this.priceHistory.length - 2];
    
    // Calculate if price is moving towards or away from mean
    const currentDistance = Math.abs(currentPrice - mean);
    const previousDistance = Math.abs(previousPrice - mean);
    
    // Return positive value if moving towards mean, negative if moving away
    return (previousDistance - currentDistance) / mean;
  }

  private calculateBollingerBands(period: number = 20, stdDevMultiplier: number = 2): {
    upper: number;
    middle: number;
    lower: number;
  } {
    if (this.priceHistory.length < period) {
      const currentPrice = this.priceHistory[this.priceHistory.length - 1] || 0;
      return {
        upper: currentPrice * 1.02,
        middle: currentPrice,
        lower: currentPrice * 0.98
      };
    }
    
    const recentPrices = this.priceHistory.slice(-period);
    const mean = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / recentPrices.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: mean + (stdDev * stdDevMultiplier),
      middle: mean,
      lower: mean - (stdDev * stdDevMultiplier)
    };
  }

  private calculateRSI(period: number = 14): number {
    if (this.priceHistory.length < period + 1) {
      return 50; // Neutral RSI
    }
    
    const changes = [];
    for (let i = this.priceHistory.length - period; i < this.priceHistory.length; i++) {
      changes.push(this.priceHistory[i] - this.priceHistory[i - 1]);
    }
    
    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);
    
    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateTradeAmount(price: number, confidence: number): number {
    // Base amount scaled by confidence
    const baseAmount = 0.01; // 0.01 BTC base
    return baseAmount * confidence;
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
      returns.push((this.priceHistory[i] - this.priceHistory[i-1]) / this.priceHistory[i-1]);
    }
    
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

  // Method to track position entry time
  setPositionEntryTime(time: number): void {
    this.positionEntryTime = time;
  }

  // Method to clear position entry time
  clearPositionEntryTime(): void {
    this.positionEntryTime = 0;
  }
}