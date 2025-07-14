import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  TechnicalIndicators, 
  RSIResult, 
  MACDResult, 
  BollingerBandsResult, 
  VolumeIndicatorsResult,
  MultiTimeframeSignal 
} from '../utils/technical-indicators';

export interface TradingStrategyConfig {
  buyThreshold: number;
  sellThreshold: number;
  minProfitMargin: number;
  maxTradeAmount: number;
  riskTolerance: number;
  rsiOverbought: number;
  rsiOversold: number;
  useDivergence: boolean;
  useMultiTimeframe: boolean;
}

export class TradingStrategy {
  private config: TradingStrategyConfig;
  private technicalIndicators: TechnicalIndicators;

  constructor(config: TradingStrategyConfig) {
    this.config = {
      ...config,
      rsiOverbought: config.rsiOverbought || 70,
      rsiOversold: config.rsiOversold || 30,
      useDivergence: config.useDivergence !== false,
      useMultiTimeframe: config.useMultiTimeframe !== false,
    };
    this.technicalIndicators = new TechnicalIndicators();
  }

  updatePrice(price: number, volume = 1000): void {
    this.technicalIndicators.updateData(price, volume);
  }

  generateSignal(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    const volume = parseFloat(ticker.vol);
    this.updatePrice(currentPrice, volume);

    const signal = this.analyzeAdvancedMarketConditions(ticker);
    return this.applyAdvancedRiskManagement(signal);
  }

  private analyzeAdvancedMarketConditions(ticker: BitbankTicker): TradingSignal {
    const currentPrice = parseFloat(ticker.last);
    const volume = parseFloat(ticker.vol);

    const rsi = this.technicalIndicators.calculateRSI();
    const macd = this.technicalIndicators.calculateMACD();
    const bollinger = this.technicalIndicators.calculateBollingerBands();
    const volumeIndicators = this.technicalIndicators.calculateVolumeIndicators();
    const multiTimeframe = this.config.useMultiTimeframe ? 
      this.technicalIndicators.analyzeMultiTimeframe() : [];
    const divergence = this.config.useDivergence ? 
      this.technicalIndicators.getDivergenceSignals() : 
      { bullishDivergence: false, bearishDivergence: false };

    if (!rsi || !macd || !bollinger || !volumeIndicators) {
      return {
        action: 'hold',
        confidence: 0,
        price: currentPrice,
        amount: 0,
        reason: 'Insufficient data for advanced analysis',
      };
    }

    const signals = this.evaluateAllSignals(
      rsi, macd, bollinger, volumeIndicators, multiTimeframe, divergence, currentPrice, volume
    );

    if (signals.buySignals >= 3 && signals.sellSignals === 0) {
      return {
        action: 'buy',
        confidence: this.calculateAdvancedConfidence(signals, 'buy'),
        price: currentPrice,
        amount: this.calculateAdvancedTradeAmount(currentPrice, bollinger, volumeIndicators),
        reason: this.generateSignalReason(signals, 'buy'),
      };
    } else if (signals.sellSignals >= 3 && signals.buySignals === 0) {
      return {
        action: 'sell',
        confidence: this.calculateAdvancedConfidence(signals, 'sell'),
        price: currentPrice,
        amount: this.calculateAdvancedTradeAmount(currentPrice, bollinger, volumeIndicators),
        reason: this.generateSignalReason(signals, 'sell'),
      };
    }

    return {
      action: 'hold',
      confidence: 0.5,
      price: currentPrice,
      amount: 0,
      reason: `Mixed signals: ${signals.buySignals} buy, ${signals.sellSignals} sell`,
    };
  }

  private evaluateAllSignals(
    rsi: RSIResult,
    macd: MACDResult,
    bollinger: BollingerBandsResult,
    volumeIndicators: VolumeIndicatorsResult,
    multiTimeframe: MultiTimeframeSignal[],
    divergence: { bullishDivergence: boolean; bearishDivergence: boolean },
    currentPrice: number,
    volume: number
  ): { buySignals: number; sellSignals: number; reasons: string[] } {
    let buySignals = 0;
    let sellSignals = 0;
    const reasons: string[] = [];

    // RSI Analysis
    if (rsi.oversold) {
      buySignals++;
      reasons.push('RSI oversold');
    } else if (rsi.overbought) {
      sellSignals++;
      reasons.push('RSI overbought');
    }

    // MACD Analysis
    if (macd.bullishCrossover && macd.macd > macd.signal) {
      buySignals++;
      reasons.push('MACD bullish crossover');
    } else if (macd.bearishCrossover && macd.macd < macd.signal) {
      sellSignals++;
      reasons.push('MACD bearish crossover');
    }

    // Bollinger Bands Analysis
    if (currentPrice <= bollinger.lower && !bollinger.squeeze) {
      buySignals++;
      reasons.push('Price at Bollinger lower band');
    } else if (currentPrice >= bollinger.upper && !bollinger.squeeze) {
      sellSignals++;
      reasons.push('Price at Bollinger upper band');
    }

    // Volume Analysis
    if (currentPrice > volumeIndicators.vwap && volume > 1000) {
      buySignals++;
      reasons.push('Price above VWAP with volume');
    } else if (currentPrice < volumeIndicators.vwap && volume > 1000) {
      sellSignals++;
      reasons.push('Price below VWAP with volume');
    }

    // Multi-timeframe Analysis
    const bullishTimeframes = multiTimeframe.filter(tf => tf.trend === 'bullish').length;
    const bearishTimeframes = multiTimeframe.filter(tf => tf.trend === 'bearish').length;
    
    if (bullishTimeframes >= 3) {
      buySignals++;
      reasons.push('Multi-timeframe bullish alignment');
    } else if (bearishTimeframes >= 3) {
      sellSignals++;
      reasons.push('Multi-timeframe bearish alignment');
    }

    // Divergence Analysis
    if (divergence.bullishDivergence) {
      buySignals++;
      reasons.push('Bullish divergence detected');
    } else if (divergence.bearishDivergence) {
      sellSignals++;
      reasons.push('Bearish divergence detected');
    }

    return { buySignals, sellSignals, reasons };
  }

  private calculateAdvancedConfidence(
    signals: { buySignals: number; sellSignals: number },
    action: 'buy' | 'sell'
  ): number {
    const totalSignals = signals.buySignals + signals.sellSignals;
    const actionSignals = action === 'buy' ? signals.buySignals : signals.sellSignals;
    
    if (totalSignals === 0) return 0.5;
    
    const baseConfidence = actionSignals / Math.max(totalSignals, 6);
    return Math.max(0.6, Math.min(0.95, baseConfidence));
  }

  private calculateAdvancedTradeAmount(
    price: number,
    bollinger: BollingerBandsResult,
    volumeIndicators: VolumeIndicatorsResult
  ): number {
    const baseAmount = this.config.maxTradeAmount / price;
    
    // Adjust for volatility (bandwidth)
    const volatilityAdjustment = 1 - Math.min(bollinger.bandwidth * 2, 0.5);
    
    // Adjust for volume
    const volumeAdjustment = volumeIndicators.volumeRateOfChange > 0 ? 1.1 : 0.9;
    
    return baseAmount * volatilityAdjustment * volumeAdjustment * this.config.riskTolerance;
  }

  private generateSignalReason(
    signals: { buySignals: number; sellSignals: number; reasons: string[] },
    action: 'buy' | 'sell'
  ): string {
    const actionReasons = signals.reasons.filter(reason => 
      (action === 'buy' && (reason.includes('oversold') || reason.includes('bullish') || reason.includes('lower'))) ||
      (action === 'sell' && (reason.includes('overbought') || reason.includes('bearish') || reason.includes('upper')))
    );
    
    return `Advanced ${action} signal: ${actionReasons.join(', ')}`;
  }

  private applyAdvancedRiskManagement(signal: TradingSignal): TradingSignal {
    if (signal.action === 'hold') {
      return signal;
    }

    // Apply minimum confidence threshold
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
    if (expectedProfit < 100) {
      return {
        ...signal,
        action: 'hold',
        amount: 0,
        reason: `${signal.reason} - Expected profit too low: ${expectedProfit.toFixed(0)} JPY`,
      };
    }

    // Apply maximum position size
    const maxAmount = this.config.maxTradeAmount / signal.price;
    if (signal.amount > maxAmount) {
      return {
        ...signal,
        amount: maxAmount,
        reason: `${signal.reason} - Amount capped at maximum`,
      };
    }

    return signal;
  }
}