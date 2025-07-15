import { BitbankTicker, TradingSignal } from '../types/bitbank';

export interface TradingStrategyConfig {
  buyThreshold: number;
  sellThreshold: number;
  minProfitMargin: number;
  maxTradeAmount: number;
  riskTolerance: number;
}

export class TradingStrategy {
  private config: TradingStrategyConfig;
  private priceHistory: number[] = [];
  private readonly HISTORY_SIZE = 20;

  constructor(config: TradingStrategyConfig) {
    this.config = config;
  }

  updatePrice(price: number): void {
    this.priceHistory.push(price);
    if (this.priceHistory.length > this.HISTORY_SIZE) {
      this.priceHistory.shift();
    }
  }

  generateSignal(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    this.updatePrice(currentPrice);

    if (this.priceHistory.length < 10) {
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
    if (this.priceHistory.length < period) {
      return this.priceHistory[this.priceHistory.length - 1] || 0;
    }
    
    const sum = this.priceHistory.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateMomentum(): number {
    if (this.priceHistory.length < 10) return 0;
    
    const current = this.priceHistory[this.priceHistory.length - 1];
    const previous = this.priceHistory[this.priceHistory.length - 10];
    
    if (!current || !previous || previous === 0) return 0;
    
    return (current - previous) / previous;
  }

  private calculateVolatility(): number {
    if (this.priceHistory.length < 10) return 0;
    
    const mean = this.calculateMovingAverage(10);
    const variance = this.priceHistory.slice(-10)
      .reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / 10;
    
    return Math.sqrt(variance) / mean;
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
    const MIN_PROFIT_JPY = 100; // Minimum 100 JPY profit threshold
    const expectedProfit = signal.amount * signal.price * this.config.minProfitMargin;
    if (expectedProfit < MIN_PROFIT_JPY) {
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