import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { TechnicalIndicators } from '../utils/technical-indicators';

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
  private technicalIndicators: TechnicalIndicators;

  constructor(config: TradingStrategyConfig) {
    this.config = config;
    this.technicalIndicators = new TechnicalIndicators();
  }

  updatePrice(price: number, volume = 0): void {
    this.priceHistory.push(price);
    if (this.priceHistory.length > this.HISTORY_SIZE) {
      this.priceHistory.shift();
    }
    this.technicalIndicators.updatePrice(price, volume);
  }

  generateSignal(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    const volume = parseFloat(ticker.vol);
    this.updatePrice(currentPrice, volume);

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
    
    // Get comprehensive technical analysis
    const analysis = this.technicalIndicators.getComprehensiveAnalysis();
    
    // Calculate traditional indicators for comparison
    const shortMA = this.calculateMovingAverage(5);
    const longMA = this.calculateMovingAverage(20);
    const momentum = this.calculateMomentum();
    const volatility = this.calculateVolatility();
    
    // Generate signals from all indicators
    const signals = this.generateAdvancedSignals(analysis, shortMA, longMA, momentum, volatility, volume);
    
    // Count bullish and bearish signals
    const bullishSignals = signals.filter(s => s.type === 'bullish').length;
    const bearishSignals = signals.filter(s => s.type === 'bearish').length;
    
    const totalSignals = bullishSignals + bearishSignals;
    if (totalSignals === 0) {
      return {
        action: 'hold',
        confidence: 0.5,
        price: currentPrice,
        amount: 0,
        reason: 'No clear signals from technical indicators',
      };
    }
    
    // Determine action based on signal consensus
    if (bullishSignals >= 3 && bullishSignals > bearishSignals) {
      const confidence = this.calculateAdvancedConfidence(analysis, 'buy', volatility);
      return {
        action: 'buy',
        confidence,
        price: currentPrice,
        amount: this.calculateAdvancedTradeAmount(currentPrice, analysis, volatility),
        reason: this.generateTradeReason(signals.filter(s => s.type === 'bullish')),
      };
    } else if (bearishSignals >= 3 && bearishSignals > bullishSignals) {
      const confidence = this.calculateAdvancedConfidence(analysis, 'sell', volatility);
      return {
        action: 'sell',
        confidence,
        price: currentPrice,
        amount: this.calculateAdvancedTradeAmount(currentPrice, analysis, volatility),
        reason: this.generateTradeReason(signals.filter(s => s.type === 'bearish')),
      };
    }

    return {
      action: 'hold',
      confidence: 0.5,
      price: currentPrice,
      amount: 0,
      reason: `Mixed signals: ${bullishSignals} bullish, ${bearishSignals} bearish`,
    };
  }

  private generateAdvancedSignals(analysis: ReturnType<typeof this.technicalIndicators.getComprehensiveAnalysis>, shortMA: number, longMA: number, momentum: number, _volatility: number, _volume: number): Array<{type: 'bullish' | 'bearish', indicator: string, strength: number}> {
    const signals: Array<{type: 'bullish' | 'bearish', indicator: string, strength: number}> = [];
    
    // RSI signals
    if (analysis.rsi.signal === 'buy') {
      signals.push({type: 'bullish', indicator: 'RSI', strength: analysis.rsi.oversold ? 0.8 : 0.6});
    } else if (analysis.rsi.signal === 'sell') {
      signals.push({type: 'bearish', indicator: 'RSI', strength: analysis.rsi.overbought ? 0.8 : 0.6});
    }
    
    // MACD signals
    if (analysis.macd.bullishCrossover) {
      signals.push({type: 'bullish', indicator: 'MACD', strength: 0.8});
    } else if (analysis.macd.bearishCrossover) {
      signals.push({type: 'bearish', indicator: 'MACD', strength: 0.8});
    } else if (analysis.macd.trend === 'bullish') {
      signals.push({type: 'bullish', indicator: 'MACD', strength: 0.5});
    } else if (analysis.macd.trend === 'bearish') {
      signals.push({type: 'bearish', indicator: 'MACD', strength: 0.5});
    }
    
    // Bollinger Bands signals
    if (analysis.bollingerBands.position === 'below') {
      signals.push({type: 'bullish', indicator: 'Bollinger Bands', strength: 0.7});
    } else if (analysis.bollingerBands.position === 'above') {
      signals.push({type: 'bearish', indicator: 'Bollinger Bands', strength: 0.7});
    }
    
    // Volume analysis
    if (analysis.volumeIndicators.volumeSignal === 'high') {
      // High volume confirms trends
      const lastSignal = signals[signals.length - 1];
      if (lastSignal) {
        lastSignal.strength += 0.2;
      }
    }
    
    // Traditional MA crossover
    if (shortMA > longMA && momentum > this.config.buyThreshold) {
      signals.push({type: 'bullish', indicator: 'MA Crossover', strength: 0.6});
    } else if (shortMA < longMA && momentum < -this.config.sellThreshold) {
      signals.push({type: 'bearish', indicator: 'MA Crossover', strength: 0.6});
    }
    
    // Divergence signals
    if (analysis.divergence.type === 'bullish') {
      signals.push({type: 'bullish', indicator: 'Divergence', strength: analysis.divergence.strength});
    } else if (analysis.divergence.type === 'bearish') {
      signals.push({type: 'bearish', indicator: 'Divergence', strength: analysis.divergence.strength});
    }
    
    return signals;
  }

  private calculateAdvancedConfidence(analysis: ReturnType<typeof this.technicalIndicators.getComprehensiveAnalysis>, action: 'buy' | 'sell', volatility: number): number {
    let confidence = 0;
    let factorCount = 0;
    
    // RSI confidence
    if (analysis.rsi.signal === action) {
      confidence += analysis.rsi.oversold || analysis.rsi.overbought ? 0.8 : 0.6;
      factorCount++;
    }
    
    // MACD confidence
    if ((action === 'buy' && analysis.macd.bullishCrossover) || (action === 'sell' && analysis.macd.bearishCrossover)) {
      confidence += 0.8;
      factorCount++;
    }
    
    // Multi-timeframe confidence
    if (analysis.multiTimeframe.consensus === (action === 'buy' ? 'bullish' : 'bearish')) {
      confidence += analysis.multiTimeframe.strength;
      factorCount++;
    }
    
    // Volume confirmation
    if (analysis.volumeIndicators.volumeSignal === 'high') {
      confidence += 0.2;
      factorCount++;
    }
    
    // Volatility adjustment
    confidence *= (1 - Math.min(volatility * 2, 0.5));
    
    return factorCount > 0 ? Math.max(0, Math.min(1, confidence / factorCount)) : 0.5;
  }

  private calculateAdvancedTradeAmount(price: number, analysis: ReturnType<typeof this.technicalIndicators.getComprehensiveAnalysis>, volatility: number): number {
    const baseAmount = this.config.maxTradeAmount / price;
    
    // Volatility adjustment
    const volatilityAdjustment = 1 - Math.min(volatility * 2, 0.5);
    
    // Volume adjustment
    const volumeAdjustment = analysis.volumeIndicators.volumeSignal === 'high' ? 1.2 : 
                           analysis.volumeIndicators.volumeSignal === 'low' ? 0.8 : 1.0;
    
    // Multi-timeframe strength adjustment
    const strengthAdjustment = analysis.multiTimeframe.strength;
    
    return baseAmount * volatilityAdjustment * volumeAdjustment * strengthAdjustment * this.config.riskTolerance;
  }

  private generateTradeReason(signals: Array<{type: 'bullish' | 'bearish', indicator: string, strength: number}>): string {
    const indicators = signals.map(s => s.indicator).join(', ');
    const type = signals[0]?.type || 'neutral';
    const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
    
    return `${type === 'bullish' ? 'Buy' : 'Sell'} signal from ${indicators} (avg strength: ${avgStrength.toFixed(2)})`;
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


  private applyRiskManagement(signal: TradingSignal): TradingSignal {
    if (signal.action === 'hold') {
      return signal;
    }

    // Apply minimum confidence threshold (higher threshold for advanced indicators)
    if (signal.confidence < 0.7) {
      return {
        ...signal,
        action: 'hold',
        amount: 0,
        reason: `${signal.reason} - Confidence too low: ${signal.confidence.toFixed(2)}`,
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