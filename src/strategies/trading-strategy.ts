import { BitbankTicker, TradingSignal, RealtimeMarketData } from '../types/bitbank';

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

  generateSignal(ticker: BitbankTicker, realtimeData?: RealtimeMarketData): TradingSignal {
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

    const signal = realtimeData 
      ? this.analyzeMarketConditionsWithRealtimeData(ticker, realtimeData)
      : this.analyzeMarketConditions(ticker);
    
    return this.applyRiskManagement(signal, realtimeData);
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

  private analyzeMarketConditionsWithRealtimeData(ticker: BitbankTicker, realtimeData: RealtimeMarketData): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    const volume = parseFloat(ticker.vol);
    
    // Calculate moving averages
    const shortMA = this.calculateMovingAverage(5);
    const longMA = this.calculateMovingAverage(20);
    
    // Calculate price momentum
    const momentum = this.calculateMomentum();
    
    // Calculate volatility
    const volatility = this.calculateVolatility();
    
    // Enhanced analysis with real-time data
    const orderBookAnalysis = realtimeData.analysis.orderBook;
    
    // Determine signal based on multiple indicators including real-time data
    if (this.shouldBuyWithRealtimeData(currentPrice, shortMA, longMA, momentum, volatility, volume, realtimeData)) {
      const enhancedConfidence = this.calculateEnhancedConfidence('buy', momentum, volatility, realtimeData);
      const optimizedAmount = this.calculateOptimizedTradeAmount(currentPrice, volatility, realtimeData);
      
      return {
        action: 'buy',
        confidence: enhancedConfidence,
        price: orderBookAnalysis.midPrice > 0 ? orderBookAnalysis.midPrice : currentPrice,
        amount: optimizedAmount,
        reason: this.generateEnhancedReason('buy', momentum, realtimeData),
      };
    } else if (this.shouldSellWithRealtimeData(currentPrice, shortMA, longMA, momentum, volatility, volume, realtimeData)) {
      const enhancedConfidence = this.calculateEnhancedConfidence('sell', momentum, volatility, realtimeData);
      const optimizedAmount = this.calculateOptimizedTradeAmount(currentPrice, volatility, realtimeData);
      
      return {
        action: 'sell',
        confidence: enhancedConfidence,
        price: orderBookAnalysis.midPrice > 0 ? orderBookAnalysis.midPrice : currentPrice,
        amount: optimizedAmount,
        reason: this.generateEnhancedReason('sell', momentum, realtimeData),
      };
    }

    return {
      action: 'hold',
      confidence: 0.5,
      price: currentPrice,
      amount: 0,
      reason: 'No clear trend detected with real-time analysis',
    };
  }

  private shouldBuyWithRealtimeData(
    currentPrice: number,
    shortMA: number,
    longMA: number,
    momentum: number,
    volatility: number,
    volume: number,
    realtimeData: RealtimeMarketData
  ): boolean {
    const orderBook = realtimeData.analysis.orderBook;
    const volumeAnalysis = realtimeData.analysis.volume;
    const microstructure = realtimeData.analysis.microstructure;
    
    // Basic technical analysis
    const basicConditions = (
      shortMA > longMA && // Upward trend
      momentum > this.config.buyThreshold && // Positive momentum
      volatility < 0.1 && // Low volatility for safer entry
      volume > 1000 // Sufficient volume
    );
    
    // Enhanced conditions with real-time data
    const enhancedConditions = (
      orderBook.orderBookImbalance > 0.1 && // Buy pressure
      orderBook.bidAskSpreadPercent < 0.5 && // Reasonable spread
      !volumeAnalysis.volumeSpike && // No abnormal volume spike
      microstructure.executionQuality > 0.5 && // Good execution quality
      orderBook.liquidityDepth > 0.5 // Adequate liquidity
    );
    
    return basicConditions && enhancedConditions;
  }

  private shouldSellWithRealtimeData(
    currentPrice: number,
    shortMA: number,
    longMA: number,
    momentum: number,
    volatility: number,
    volume: number,
    realtimeData: RealtimeMarketData
  ): boolean {
    const orderBook = realtimeData.analysis.orderBook;
    const volumeAnalysis = realtimeData.analysis.volume;
    const microstructure = realtimeData.analysis.microstructure;
    
    // Basic technical analysis
    const basicConditions = (
      shortMA < longMA && // Downward trend
      momentum < -this.config.sellThreshold && // Negative momentum
      volume > 1000 // Sufficient volume
    );
    
    // Enhanced conditions with real-time data
    const enhancedConditions = (
      orderBook.orderBookImbalance < -0.1 && // Sell pressure
      orderBook.bidAskSpreadPercent < 0.5 && // Reasonable spread
      !volumeAnalysis.volumeSpike && // No abnormal volume spike
      microstructure.executionQuality > 0.5 && // Good execution quality
      orderBook.liquidityDepth > 0.5 // Adequate liquidity
    );
    
    return basicConditions && enhancedConditions;
  }

  private calculateEnhancedConfidence(
    action: 'buy' | 'sell',
    momentum: number,
    volatility: number,
    realtimeData: RealtimeMarketData
  ): number {
    let baseConfidence = Math.abs(momentum) * 10;
    
    // Reduce confidence for high volatility
    baseConfidence *= (1 - volatility);
    
    // Adjust confidence based on real-time data
    const orderBook = realtimeData.analysis.orderBook;
    const microstructure = realtimeData.analysis.microstructure;
    
    // Boost confidence for strong order book signals
    if (action === 'buy' && orderBook.orderBookImbalance > 0.2) {
      baseConfidence *= 1.2;
    } else if (action === 'sell' && orderBook.orderBookImbalance < -0.2) {
      baseConfidence *= 1.2;
    }
    
    // Adjust for execution quality
    baseConfidence *= microstructure.executionQuality;
    
    // Adjust for spread
    if (orderBook.bidAskSpreadPercent > 0.5) {
      baseConfidence *= 0.8;
    }
    
    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, baseConfidence));
  }

  private calculateOptimizedTradeAmount(
    price: number,
    volatility: number,
    realtimeData: RealtimeMarketData
  ): number {
    // Base amount calculation
    const baseAmount = this.config.maxTradeAmount / price;
    const volatilityAdjustment = 1 - Math.min(volatility * 2, 0.5);
    
    // Adjust based on liquidity
    const liquidityAdjustment = Math.min(realtimeData.analysis.orderBook.liquidityDepth, 1);
    
    // Adjust based on execution quality
    const executionAdjustment = realtimeData.analysis.microstructure.executionQuality;
    
    return baseAmount * volatilityAdjustment * liquidityAdjustment * executionAdjustment * this.config.riskTolerance;
  }

  private generateEnhancedReason(action: 'buy' | 'sell', momentum: number, realtimeData: RealtimeMarketData): string {
    const orderBook = realtimeData.analysis.orderBook;
    const volume = realtimeData.analysis.volume;
    
    const reasons = [];
    
    if (action === 'buy') {
      reasons.push('Bullish trend detected');
      if (orderBook.orderBookImbalance > 0.1) reasons.push('Strong buy pressure');
      if (volume.institutionalActivity > 0.3) reasons.push('Institutional buying');
    } else {
      reasons.push('Bearish trend detected');
      if (orderBook.orderBookImbalance < -0.1) reasons.push('Strong sell pressure');
      if (volume.institutionalActivity > 0.3) reasons.push('Institutional selling');
    }
    
    if (orderBook.bidAskSpreadPercent < 0.2) reasons.push('Tight spread');
    if (orderBook.liquidityDepth > 1) reasons.push('High liquidity');
    
    return reasons.join(', ');
  }

  private applyRiskManagement(signal: TradingSignal, realtimeData?: RealtimeMarketData): TradingSignal {
    if (signal.action === 'hold') {
      return signal;
    }

    // Apply minimum confidence threshold (higher for real-time data)
    const minConfidence = realtimeData ? 0.7 : 0.6;
    if (signal.confidence < minConfidence) {
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

    // Additional risk checks for real-time data
    if (realtimeData) {
      const orderBook = realtimeData.analysis.orderBook;
      
      // Check for excessive spread
      if (orderBook.bidAskSpreadPercent > 1.0) {
        return {
          ...signal,
          action: 'hold',
          amount: 0,
          reason: `${signal.reason} - Spread too wide: ${orderBook.bidAskSpreadPercent.toFixed(2)}%`,
        };
      }
      
      // Check for adequate liquidity
      if (orderBook.liquidityDepth < 0.1) {
        return {
          ...signal,
          action: 'hold',
          amount: 0,
          reason: `${signal.reason} - Insufficient liquidity: ${orderBook.liquidityDepth}`,
        };
      }
    }

    return signal;
  }
}