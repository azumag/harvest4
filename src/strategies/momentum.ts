import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  MomentumConfig, 
  AdvancedTradingStrategy, 
  MarketCondition, 
  StrategyPerformance 
} from '../types/advanced-strategies';

export class MomentumStrategy implements AdvancedTradingStrategy {
  name = 'Momentum';
  config: MomentumConfig;
  
  private priceHistory: number[] = [];
  private volumeHistory: number[] = [];
  private momentumHistory: number[] = [];
  private totalTrades = 0;
  private winningTrades = 0;
  private totalProfit = 0;
  private maxDrawdown = 0;
  private currentDrawdown = 0;
  private lastUpdated = Date.now();
  private lastSignalTime = 0;

  constructor(config: MomentumConfig) {
    this.config = config;
  }

  updateMarketData(ticker: BitbankTicker): void {
    const currentPrice = parseFloat(ticker.last);
    const currentVolume = parseFloat(ticker.vol);
    
    this.priceHistory.push(currentPrice);
    this.volumeHistory.push(currentVolume);
    
    // Keep only relevant history
    const historySize = Math.max(this.config.params.lookbackPeriod * 2, 50);
    if (this.priceHistory.length > historySize) {
      this.priceHistory.shift();
      this.volumeHistory.shift();
    }
    
    // Calculate and store momentum
    const momentum = this.calculateMomentum();
    this.momentumHistory.push(momentum);
    
    if (this.momentumHistory.length > historySize) {
      this.momentumHistory.shift();
    }
  }

  generateSignal(ticker: BitbankTicker, marketCondition: MarketCondition): TradingSignal {
    if (!this.config.enabled) {
      return this.createHoldSignal(ticker, 'Strategy disabled');
    }

    const currentPrice = parseFloat(ticker.last);
    const currentVolume = parseFloat(ticker.vol);
    
    // Need sufficient data for momentum analysis
    if (this.priceHistory.length < this.config.params.lookbackPeriod) {
      return this.createHoldSignal(ticker, 'Insufficient data for momentum analysis');
    }
    
    // Momentum works best in trending markets
    if (marketCondition.trend === 'sideways') {
      return this.createHoldSignal(ticker, 'Sideways market - momentum strategy inactive');
    }
    
    // Check for breakout signals
    const breakoutSignal = this.checkBreakout(ticker, currentPrice, currentVolume);
    if (breakoutSignal.action !== 'hold') {
      return breakoutSignal;
    }
    
    // Check for momentum continuation signals
    const momentumSignal = this.checkMomentumContinuation(ticker, currentPrice, currentVolume);
    if (momentumSignal.action !== 'hold') {
      return momentumSignal;
    }
    
    return this.createHoldSignal(ticker, 'No momentum signal detected');
  }

  private calculateMomentum(): number {
    if (this.priceHistory.length < this.config.params.lookbackPeriod) {
      return 0;
    }
    
    const current = this.priceHistory[this.priceHistory.length - 1];
    const previous = this.priceHistory[this.priceHistory.length - this.config.params.lookbackPeriod];
    
    return (current - previous) / previous;
  }

  private calculateRateOfChange(period: number): number {
    if (this.priceHistory.length < period) {
      return 0;
    }
    
    const current = this.priceHistory[this.priceHistory.length - 1];
    const previous = this.priceHistory[this.priceHistory.length - period];
    
    return (current - previous) / previous;
  }

  private calculateRelativeStrengthIndex(period: number = 14): number {
    if (this.priceHistory.length < period + 1) {
      return 50; // Neutral RSI
    }
    
    const gains = [];
    const losses = [];
    
    for (let i = this.priceHistory.length - period; i < this.priceHistory.length; i++) {
      const change = this.priceHistory[i] - this.priceHistory[i - 1];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }
    
    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private checkBreakout(ticker: BitbankTicker, currentPrice: number, currentVolume: number): TradingSignal {
    if (this.priceHistory.length < 20) {
      return this.createHoldSignal(ticker, 'Insufficient data for breakout analysis');
    }
    
    // Calculate resistance and support levels
    const recentPrices = this.priceHistory.slice(-20);
    const resistance = Math.max(...recentPrices);
    const support = Math.min(...recentPrices);
    
    // Calculate average volume
    const avgVolume = this.volumeHistory.slice(-10).reduce((sum, vol) => sum + vol, 0) / 10;
    
    const momentum = this.calculateMomentum();
    const rsi = this.calculateRelativeStrengthIndex();
    
    // Bullish breakout
    if (currentPrice > resistance * (1 + this.config.params.breakoutFactor) && 
        momentum > this.config.params.momentumThreshold) {
      
      let confidence = 0.6;
      
      // Increase confidence with volume confirmation
      if (this.config.params.volumeConfirmation && currentVolume > avgVolume * 1.5) {
        confidence += 0.2;
      }
      
      // Adjust confidence based on RSI
      if (rsi < 70) {
        confidence += 0.1;
      }
      
      return {
        action: 'buy',
        confidence: Math.min(confidence, 0.9),
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `Bullish breakout: Price ${currentPrice.toFixed(2)} above resistance ${resistance.toFixed(2)}, momentum ${(momentum * 100).toFixed(2)}%`,
      };
    }
    
    // Bearish breakout
    if (currentPrice < support * (1 - this.config.params.breakoutFactor) && 
        momentum < -this.config.params.momentumThreshold) {
      
      let confidence = 0.6;
      
      // Increase confidence with volume confirmation
      if (this.config.params.volumeConfirmation && currentVolume > avgVolume * 1.5) {
        confidence += 0.2;
      }
      
      // Adjust confidence based on RSI
      if (rsi > 30) {
        confidence += 0.1;
      }
      
      return {
        action: 'sell',
        confidence: Math.min(confidence, 0.9),
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `Bearish breakout: Price ${currentPrice.toFixed(2)} below support ${support.toFixed(2)}, momentum ${(momentum * 100).toFixed(2)}%`,
      };
    }
    
    return this.createHoldSignal(ticker, 'No breakout detected');
  }

  private checkMomentumContinuation(ticker: BitbankTicker, currentPrice: number, currentVolume: number): TradingSignal {
    if (this.momentumHistory.length < 5) {
      return this.createHoldSignal(ticker, 'Insufficient momentum history');
    }
    
    const currentMomentum = this.calculateMomentum();
    const avgMomentum = this.momentumHistory.slice(-5).reduce((sum, m) => sum + m, 0) / 5;
    
    // Check if momentum is accelerating
    const momentumAcceleration = currentMomentum - avgMomentum;
    
    // Rate limiting to prevent overtrading
    const timeSinceLastSignal = Date.now() - this.lastSignalTime;
    if (timeSinceLastSignal < 60000) { // 1 minute minimum
      return this.createHoldSignal(ticker, 'Rate limiting active');
    }
    
    // Strong positive momentum continuation
    if (currentMomentum > this.config.params.momentumThreshold && 
        momentumAcceleration > 0.001) {
      
      const confidence = Math.min(0.8, Math.abs(currentMomentum) * 5);
      this.lastSignalTime = Date.now();
      
      return {
        action: 'buy',
        confidence,
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `Momentum continuation: ${(currentMomentum * 100).toFixed(2)}% momentum, accelerating`,
      };
    }
    
    // Strong negative momentum continuation
    if (currentMomentum < -this.config.params.momentumThreshold && 
        momentumAcceleration < -0.001) {
      
      const confidence = Math.min(0.8, Math.abs(currentMomentum) * 5);
      this.lastSignalTime = Date.now();
      
      return {
        action: 'sell',
        confidence,
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `Momentum continuation: ${(currentMomentum * 100).toFixed(2)}% momentum, accelerating`,
      };
    }
    
    return this.createHoldSignal(ticker, 'Momentum not strong enough');
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
}