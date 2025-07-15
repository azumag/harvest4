import { BitbankTicker, TradingSignal } from '../types/bitbank';

export interface TradingStrategyConfig {
  buyThreshold: number;
  sellThreshold: number;
  minProfitMargin: number;
  maxTradeAmount: number;
  riskTolerance: number;
}

interface CalculationCache {
  shortMA: number;
  longMA: number;
  momentum: number;
  volatility: number;
  lastUpdate: number;
  isValid: boolean;
}

export class TradingStrategy {
  private config: TradingStrategyConfig;
  private priceHistory: Float64Array;
  private currentIndex = 0;
  private isFull = false;
  private readonly HISTORY_SIZE = 20;
  
  // Caching system for expensive calculations
  private cache: CalculationCache = {
    shortMA: 0,
    longMA: 0,
    momentum: 0,
    volatility: 0,
    lastUpdate: 0,
    isValid: false
  };
  
  // Running sums for incremental calculations
  private shortSum = 0;
  private longSum = 0;
  private sumOfSquares = 0;

  constructor(config: TradingStrategyConfig) {
    this.config = config;
    this.priceHistory = new Float64Array(this.HISTORY_SIZE);
  }

  updatePrice(price: number): void {
    const oldPrice = this.priceHistory[this.currentIndex] || 0;
    this.priceHistory[this.currentIndex] = price;
    
    // Update running sums for incremental calculations
    if (this.isFull && oldPrice > 0) {
      // Remove old values from sums
      this.longSum -= oldPrice;
      this.sumOfSquares -= oldPrice * oldPrice;
      
      if (this.currentIndex >= this.HISTORY_SIZE - 5) {
        this.shortSum -= oldPrice;
      }
    }
    
    // Add new values to sums
    this.longSum += price;
    this.sumOfSquares += price * price;
    
    if (this.getDataLength() >= 5) {
      this.shortSum += price;
      if (this.getDataLength() > 5) {
        const oldShortIndex = (this.currentIndex - 5 + this.HISTORY_SIZE) % this.HISTORY_SIZE;
        if (this.isFull || oldShortIndex < this.currentIndex) {
          const oldShortPrice = this.priceHistory[oldShortIndex] || 0;
          this.shortSum -= oldShortPrice;
        }
      }
    }
    
    // Move to next position
    this.currentIndex = (this.currentIndex + 1) % this.HISTORY_SIZE;
    if (!this.isFull && this.currentIndex === 0) {
      this.isFull = true;
    }
    
    // Invalidate cache
    this.cache.isValid = false;
  }

  private getDataLength(): number {
    return this.isFull ? this.HISTORY_SIZE : this.currentIndex;
  }

  generateSignal(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    this.updatePrice(currentPrice);

    if (this.getDataLength() < 10) {
      return {
        action: 'hold',
        confidence: 0,
        price: currentPrice,
        amount: 0,
        reason: 'Insufficient price history',
      };
    }

    // Update cache if needed
    this.updateCache();

    const signal = this.analyzeMarketConditions(ticker);
    return this.applyRiskManagement(signal);
  }

  private updateCache(): void {
    if (this.cache.isValid) {
      return;
    }

    const dataLength = this.getDataLength();
    
    // Calculate moving averages using cached sums
    this.cache.shortMA = dataLength >= 5 ? this.shortSum / 5 : 0;
    this.cache.longMA = dataLength >= 20 ? this.longSum / Math.min(dataLength, 20) : 0;
    
    // Calculate momentum
    if (dataLength >= 10) {
      const currentIndex = this.isFull ? (this.currentIndex - 1 + this.HISTORY_SIZE) % this.HISTORY_SIZE : this.currentIndex - 1;
      const pastIndex = this.isFull ? (this.currentIndex - 10 + this.HISTORY_SIZE) % this.HISTORY_SIZE : Math.max(0, this.currentIndex - 10);
      const current = this.priceHistory[currentIndex] || 0;
      const previous = this.priceHistory[pastIndex] || 0;
      this.cache.momentum = previous > 0 ? (current - previous) / previous : 0;
    } else {
      this.cache.momentum = 0;
    }
    
    // Calculate volatility using cached sum of squares
    if (dataLength >= 10) {
      const count = Math.min(dataLength, 10);
      const mean = this.getRecentAverage(10);
      const variance = (this.getRecentSumOfSquares(10) - count * mean * mean) / count;
      this.cache.volatility = mean > 0 ? Math.sqrt(Math.max(0, variance)) / mean : 0;
    } else {
      this.cache.volatility = 0;
    }

    this.cache.lastUpdate = Date.now();
    this.cache.isValid = true;
  }

  private getRecentAverage(period: number): number {
    const dataLength = this.getDataLength();
    if (dataLength < period) return 0;
    
    let sum = 0;
    const count = Math.min(period, dataLength);
    for (let i = 0; i < count; i++) {
      const index = this.isFull ? 
        (this.currentIndex - 1 - i + this.HISTORY_SIZE) % this.HISTORY_SIZE :
        Math.max(0, this.currentIndex - 1 - i);
      sum += this.priceHistory[index] || 0;
    }
    return sum / count;
  }

  private getRecentSumOfSquares(period: number): number {
    const dataLength = this.getDataLength();
    if (dataLength < period) return 0;
    
    let sum = 0;
    const count = Math.min(period, dataLength);
    for (let i = 0; i < count; i++) {
      const index = this.isFull ? 
        (this.currentIndex - 1 - i + this.HISTORY_SIZE) % this.HISTORY_SIZE :
        Math.max(0, this.currentIndex - 1 - i);
      const price = this.priceHistory[index] || 0;
      sum += price * price;
    }
    return sum;
  }

  private analyzeMarketConditions(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    const volume = parseFloat(ticker.vol);
    
    // Use cached values for performance
    const shortMA = this.cache.shortMA;
    const longMA = this.cache.longMA;
    const momentum = this.cache.momentum;
    const volatility = this.cache.volatility;
    
    // Determine signal based on multiple indicators
    if (this.shouldBuy(currentPrice, shortMA, longMA, momentum, volatility, volume)) {
      return {
        action: 'buy',
        confidence: this.calculateConfidence('buy', momentum, volatility),
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, volatility),
        reason: 'Bullish trend detected: Short MA > Long MA, positive momentum',
      };
    } else if (this.shouldSell(currentPrice, shortMA, longMA, momentum, volatility, volume)) {
      return {
        action: 'sell',
        confidence: this.calculateConfidence('sell', momentum, volatility),
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, volatility),
        reason: 'Bearish trend detected: Short MA < Long MA, negative momentum',
      };
    }

    return {
      action: 'hold',
      confidence: 0.5,
      price: currentPrice,
      amount: 0,
      reason: 'No clear trend detected',
    };
  }

  private shouldBuy(
    _currentPrice: number,
    shortMA: number,
    longMA: number,
    momentum: number,
    _volatility: number,
    volume: number
  ): boolean {
    return (
      shortMA > longMA && // Upward trend
      momentum > this.config.buyThreshold && // Positive momentum
      _volatility < 0.1 && // Low volatility for safer entry
      volume > 1000 // Sufficient volume
    );
  }

  private shouldSell(
    _currentPrice: number,
    shortMA: number,
    longMA: number,
    momentum: number,
    _volatility: number,
    volume: number
  ): boolean {
    return (
      shortMA < longMA && // Downward trend
      momentum < -this.config.sellThreshold && // Negative momentum
      volume > 1000 // Sufficient volume
    );
  }

  private calculateConfidence(_action: 'buy' | 'sell', momentum: number, volatility: number): number {
    let confidence = Math.abs(momentum) * 10;
    
    // Reduce confidence for high volatility
    confidence *= (1 - volatility);
    
    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  private calculateTradeAmount(price: number, volatility: number): number {
    // Adjust trade amount based on volatility and risk tolerance
    const baseAmount = this.config.maxTradeAmount / price;
    const volatilityAdjustment = 1 - Math.min(volatility * 2, 0.5);
    
    return baseAmount * volatilityAdjustment * this.config.riskTolerance;
  }

  private applyRiskManagement(signal: TradingSignal): TradingSignal {
    if (signal.action === 'hold') {
      return signal;
    }

    // Apply minimum confidence threshold
    if (signal.confidence < 0.6) {
      return {
        ...signal,
        action: 'hold',
        amount: 0,
        reason: `${signal.reason} - Confidence too low: ${signal.confidence}`,
      };
    }

    // Apply minimum profit margin check
    const expectedProfit = signal.amount * signal.price * this.config.minProfitMargin;
    if (expectedProfit < 100) { // Minimum 100 JPY profit
      return {
        ...signal,
        action: 'hold',
        amount: 0,
        reason: `${signal.reason} - Expected profit too low: ${expectedProfit} JPY`,
      };
    }

    return signal;
  }
}