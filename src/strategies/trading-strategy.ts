import { BitbankTicker, TradingSignal } from '../types/bitbank';

export interface TradingStrategyConfig {
  buyThreshold: number;
  sellThreshold: number;
  minProfitMargin: number;
  maxTradeAmount: number;
  riskTolerance: number;
}

interface CachedCalculation {
  value: number;
  timestamp: number;
  priceIndex: number;
}

export class TradingStrategy {
  private config: TradingStrategyConfig;
  private priceHistory: Float64Array;
  private currentIndex = 0;
  private filled = false;
  private readonly HISTORY_SIZE = 20;
  private readonly CACHE_TTL = 1000; // 1 second cache TTL

  // Optimized caching for calculations
  private shortMACache: CachedCalculation = { value: 0, timestamp: 0, priceIndex: -1 };
  private longMACache: CachedCalculation = { value: 0, timestamp: 0, priceIndex: -1 };
  private momentumCache: CachedCalculation = { value: 0, timestamp: 0, priceIndex: -1 };
  private volatilityCache: CachedCalculation = { value: 0, timestamp: 0, priceIndex: -1 };

  // Incremental calculation state
  private shortMASum = 0;
  private longMASum = 0;
  private shortPeriodCount = 0;
  private longPeriodCount = 0;

  constructor(config: TradingStrategyConfig) {
    this.config = config;
    this.priceHistory = new Float64Array(this.HISTORY_SIZE);
  }

  updatePrice(price: number): void {
    const oldPrice = this.priceHistory[this.currentIndex];
    this.priceHistory[this.currentIndex] = price;
    
    // Update incremental sums for moving averages
    this.updateIncrementalSums(price, oldPrice);
    
    this.currentIndex = (this.currentIndex + 1) % this.HISTORY_SIZE;
    if (this.currentIndex === 0) {
      this.filled = true;
    }
    
    // Invalidate caches when new price is added
    this.invalidateCaches();
  }

  private updateIncrementalSums(newPrice: number, oldPrice: number | undefined): void {
    // Update short MA sum (5 periods)
    const shortPeriod = 5;
    if (this.getHistoryLength() >= shortPeriod) {
      this.shortMASum += newPrice - (this.filled && oldPrice !== undefined ? oldPrice : 0);
      this.shortPeriodCount = Math.min(shortPeriod, this.getHistoryLength());
    } else {
      this.shortMASum += newPrice;
      this.shortPeriodCount = this.getHistoryLength();
    }

    // Update long MA sum (20 periods)
    if (this.getHistoryLength() >= this.HISTORY_SIZE) {
      this.longMASum += newPrice - (this.filled && oldPrice !== undefined ? oldPrice : 0);
      this.longPeriodCount = this.HISTORY_SIZE;
    } else {
      this.longMASum += newPrice;
      this.longPeriodCount = this.getHistoryLength();
    }
  }

  private getHistoryLength(): number {
    return this.filled ? this.HISTORY_SIZE : this.currentIndex;
  }

  private invalidateCaches(): void {
    this.shortMACache.timestamp = 0;
    this.longMACache.timestamp = 0;
    this.momentumCache.timestamp = 0;
    this.volatilityCache.timestamp = 0;
  }

  generateSignal(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    this.updatePrice(currentPrice);

    if (this.getHistoryLength() < 10) {
      return {
        action: 'hold',
        confidence: 0,
        price: currentPrice,
        amount: 0,
        reason: 'Insufficient price history',
      };
    }

    const signal = this.analyzeMarketConditions(ticker);
    return this.applyRiskManagement(signal);
  }

  private analyzeMarketConditions(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    const volume = parseFloat(ticker.vol);
    
    // Calculate moving averages
    const shortMA = this.calculateMovingAverage(5);
    const longMA = this.calculateMovingAverage(20);
    
    // Calculate price momentum
    const momentum = this.calculateMomentum();
    
    // Calculate volatility
    const volatility = this.calculateVolatility();
    
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
    volatility: number,
    volume: number
  ): boolean {
    return (
      shortMA > longMA && // Upward trend
      momentum > this.config.buyThreshold && // Positive momentum
      volatility < 0.1 && // Low volatility for safer entry
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

  private calculateMovingAverage(period: number): number {
    const now = Date.now();
    
    // Use optimized incremental calculation for standard periods
    if (period === 5) {
      if (this.isCacheValid(this.shortMACache, now)) {
        return this.shortMACache.value;
      }
      
      if (this.shortPeriodCount === 0) {
        return 0;
      }
      
      const result = this.shortMASum / this.shortPeriodCount;
      this.shortMACache = { value: result, timestamp: now, priceIndex: this.currentIndex };
      return result;
    }
    
    if (period === 20) {
      if (this.isCacheValid(this.longMACache, now)) {
        return this.longMACache.value;
      }
      
      if (this.longPeriodCount === 0) {
        return 0;
      }
      
      const result = this.longMASum / this.longPeriodCount;
      this.longMACache = { value: result, timestamp: now, priceIndex: this.currentIndex };
      return result;
    }
    
    // Fallback for other periods
    return this.calculateMovingAverageDirect(period);
  }

  private calculateMovingAverageDirect(period: number): number {
    const historyLength = this.getHistoryLength();
    if (historyLength < period) {
      return this.getCurrentPrice();
    }
    
    let sum = 0;
    const actualPeriod = Math.min(period, historyLength);
    
    for (let i = 0; i < actualPeriod; i++) {
      const index = (this.currentIndex - 1 - i + this.HISTORY_SIZE) % this.HISTORY_SIZE;
      sum += this.priceHistory[index] || 0;
    }
    
    return sum / actualPeriod;
  }

  private getCurrentPrice(): number {
    if (this.currentIndex === 0 && !this.filled) {
      return 0;
    }
    const lastIndex = (this.currentIndex - 1 + this.HISTORY_SIZE) % this.HISTORY_SIZE;
    return this.priceHistory[lastIndex] || 0;
  }

  private isCacheValid(cache: CachedCalculation, now: number): boolean {
    return cache.timestamp > 0 && 
           (now - cache.timestamp) < this.CACHE_TTL &&
           cache.priceIndex === this.currentIndex;
  }

  private calculateMomentum(): number {
    const now = Date.now();
    
    if (this.isCacheValid(this.momentumCache, now)) {
      return this.momentumCache.value;
    }
    
    const historyLength = this.getHistoryLength();
    if (historyLength < 10) return 0;
    
    const current = this.getCurrentPrice();
    const previousIndex = (this.currentIndex - 10 + this.HISTORY_SIZE) % this.HISTORY_SIZE;
    const previous = this.priceHistory[previousIndex];
    
    if (!current || !previous || previous === 0) return 0;
    
    const result = (current - previous) / previous;
    this.momentumCache = { value: result, timestamp: now, priceIndex: this.currentIndex };
    return result;
  }

  private calculateVolatility(): number {
    const now = Date.now();
    
    if (this.isCacheValid(this.volatilityCache, now)) {
      return this.volatilityCache.value;
    }
    
    const historyLength = this.getHistoryLength();
    if (historyLength < 10) return 0;
    
    const mean = this.calculateMovingAverage(10);
    if (mean === 0) return 0;
    
    let variance = 0;
    const period = Math.min(10, historyLength);
    
    for (let i = 0; i < period; i++) {
      const index = (this.currentIndex - 1 - i + this.HISTORY_SIZE) % this.HISTORY_SIZE;
      const price = this.priceHistory[index] || 0;
      variance += Math.pow(price - mean, 2);
    }
    
    variance /= period;
    const result = Math.sqrt(variance) / mean;
    this.volatilityCache = { value: result, timestamp: now, priceIndex: this.currentIndex };
    return result;
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