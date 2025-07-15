
export interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RSIResult {
  rsi: number;
  overbought: boolean;
  oversold: boolean;
  signal: 'buy' | 'sell' | 'hold';
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  bullishCrossover: boolean;
  bearishCrossover: boolean;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface BollingerBandsResult {
  upperBand: number;
  middleBand: number;
  lowerBand: number;
  percentB: number;
  bandwidth: number;
  squeeze: boolean;
  position: 'above' | 'below' | 'middle';
}

export interface VolumeIndicators {
  vwap: number;
  obv: number;
  volumeRateOfChange: number;
  volumeSignal: 'high' | 'low' | 'normal';
}

export interface MultiTimeframeAnalysis {
  timeframes: {
    '1m': TrendAnalysis;
    '5m': TrendAnalysis;
    '15m': TrendAnalysis;
    '1h': TrendAnalysis;
  };
  consensus: 'bullish' | 'bearish' | 'neutral';
  strength: number;
}

export interface TrendAnalysis {
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  signals: string[];
}

export interface DivergenceAnalysis {
  type: 'bullish' | 'bearish' | 'none';
  strength: number;
  description: string;
}

export class TechnicalIndicators {
  private priceHistory: number[] = [];
  private volumeHistory: number[] = [];
  private previousRSI: number[] = [];
  private previousMACD: MACDResult[] = [];
  private previousEMA12: number[] = [];
  private previousEMA26: number[] = [];
  private obvValue = 0;
  private previousClose = 0;

  constructor(private readonly config = {
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    macdFastPeriod: 12,
    macdSlowPeriod: 26,
    macdSignalPeriod: 9,
    bollingerPeriod: 20,
    bollingerStdDev: 2,
    volumePeriod: 20,
  }) {}

  updatePrice(price: number, volume = 0): void {
    this.priceHistory.push(price);
    this.volumeHistory.push(volume);
    
    // Keep only necessary history
    const maxHistory = Math.max(
      this.config.rsiPeriod,
      this.config.macdSlowPeriod,
      this.config.bollingerPeriod,
      this.config.volumePeriod
    ) * 2;
    
    if (this.priceHistory.length > maxHistory) {
      this.priceHistory.shift();
      this.volumeHistory.shift();
    }
  }

  calculateRSI(): RSIResult {
    if (this.priceHistory.length < this.config.rsiPeriod + 1) {
      return {
        rsi: 50,
        overbought: false,
        oversold: false,
        signal: 'hold'
      };
    }

    const changes = this.priceHistory.slice(1).map((price, i) => 
      price - (this.priceHistory[i] || 0)
    );

    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);

    const avgGain = gains.slice(-this.config.rsiPeriod).reduce((a, b) => a + b, 0) / this.config.rsiPeriod;
    const avgLoss = losses.slice(-this.config.rsiPeriod).reduce((a, b) => a + b, 0) / this.config.rsiPeriod;

    if (avgLoss === 0) return { rsi: 100, overbought: true, oversold: false, signal: 'sell' };

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    const overbought = rsi > this.config.rsiOverbought;
    const oversold = rsi < this.config.rsiOversold;
    
    let signal: 'buy' | 'sell' | 'hold' = 'hold';
    if (oversold) signal = 'buy';
    else if (overbought) signal = 'sell';

    return { rsi, overbought, oversold, signal };
  }

  calculateMACD(): MACDResult {
    if (this.priceHistory.length < this.config.macdSlowPeriod) {
      return {
        macd: 0,
        signal: 0,
        histogram: 0,
        bullishCrossover: false,
        bearishCrossover: false,
        trend: 'neutral'
      };
    }

    const ema12 = this.calculateEMA(this.priceHistory, this.config.macdFastPeriod);
    const ema26 = this.calculateEMA(this.priceHistory, this.config.macdSlowPeriod);
    const macd = ema12 - ema26;

    // Store EMA values for signal calculation
    this.previousEMA12.push(ema12);
    this.previousEMA26.push(ema26);
    if (this.previousEMA12.length > this.config.macdSignalPeriod) {
      this.previousEMA12.shift();
      this.previousEMA26.shift();
    }

    const macdLine = this.previousEMA12.map((ema12, i) => ema12 - (this.previousEMA26[i] || 0));
    const signal = this.calculateEMA(macdLine, this.config.macdSignalPeriod);
    const histogram = macd - signal;

    const previousMACD = this.previousMACD[this.previousMACD.length - 1];
    const bullishCrossover = !!(previousMACD && macd > signal && previousMACD.macd <= previousMACD.signal);
    const bearishCrossover = !!(previousMACD && macd < signal && previousMACD.macd >= previousMACD.signal);

    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (macd > signal && histogram > 0) trend = 'bullish';
    else if (macd < signal && histogram < 0) trend = 'bearish';

    const result = { macd, signal, histogram, bullishCrossover, bearishCrossover, trend };
    this.previousMACD.push(result);
    if (this.previousMACD.length > 3) this.previousMACD.shift();

    return result;
  }

  calculateBollingerBands(): BollingerBandsResult {
    if (this.priceHistory.length < this.config.bollingerPeriod) {
      const price = this.priceHistory[this.priceHistory.length - 1] || 0;
      return {
        upperBand: price,
        middleBand: price,
        lowerBand: price,
        percentB: 0.5,
        bandwidth: 0,
        squeeze: false,
        position: 'middle'
      };
    }

    const prices = this.priceHistory.slice(-this.config.bollingerPeriod);
    const middleBand = prices.reduce((a, b) => a + b, 0) / this.config.bollingerPeriod;
    
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - middleBand, 2), 0) / this.config.bollingerPeriod;
    const stdDev = Math.sqrt(variance);

    const upperBand = middleBand + (stdDev * this.config.bollingerStdDev);
    const lowerBand = middleBand - (stdDev * this.config.bollingerStdDev);

    const currentPrice = this.priceHistory[this.priceHistory.length - 1] || 0;
    const percentB = (currentPrice - lowerBand) / (upperBand - lowerBand);
    const bandwidth = (upperBand - lowerBand) / middleBand;

    // Squeeze detection (bandwidth below 0.1 is considered squeeze)
    const squeeze = bandwidth < 0.1;

    let position: 'above' | 'below' | 'middle' = 'middle';
    if (currentPrice > upperBand) position = 'above';
    else if (currentPrice < lowerBand) position = 'below';

    return {
      upperBand,
      middleBand,
      lowerBand,
      percentB,
      bandwidth,
      squeeze,
      position
    };
  }

  calculateVolumeIndicators(): VolumeIndicators {
    if (this.priceHistory.length < 2 || this.volumeHistory.length < 2) {
      return {
        vwap: this.priceHistory[this.priceHistory.length - 1] || 0,
        obv: 0,
        volumeRateOfChange: 0,
        volumeSignal: 'normal'
      };
    }

    // VWAP calculation
    const vwap = this.calculateVWAP();

    // OBV calculation
    const currentClose = this.priceHistory[this.priceHistory.length - 1] || 0;
    const currentVolume = this.volumeHistory[this.volumeHistory.length - 1] || 0;
    
    if (this.previousClose === 0) {
      this.previousClose = currentClose;
    }

    if (currentClose > this.previousClose) {
      this.obvValue += currentVolume;
    } else if (currentClose < this.previousClose) {
      this.obvValue -= currentVolume;
    }
    
    this.previousClose = currentClose;

    // Volume Rate of Change
    const volumeRateOfChange = this.calculateVolumeRateOfChange();

    // Volume Signal
    const avgVolume = this.volumeHistory.slice(-this.config.volumePeriod).reduce((a, b) => a + b, 0) / this.config.volumePeriod;
    let volumeSignal: 'high' | 'low' | 'normal' = 'normal';
    if (currentVolume > avgVolume * 1.5) volumeSignal = 'high';
    else if (currentVolume < avgVolume * 0.5) volumeSignal = 'low';

    return {
      vwap,
      obv: this.obvValue,
      volumeRateOfChange,
      volumeSignal
    };
  }

  calculateMultiTimeframeAnalysis(): MultiTimeframeAnalysis {
    // Simulate different timeframes analysis
    const current = this.analyzeCurrentTrend();
    
    return {
      timeframes: {
        '1m': current,
        '5m': current,
        '15m': current,
        '1h': current
      },
      consensus: current.trend,
      strength: current.strength
    };
  }

  analyzeDivergence(): DivergenceAnalysis {
    if (this.priceHistory.length < 20 || this.previousRSI.length < 10) {
      return {
        type: 'none',
        strength: 0,
        description: 'Insufficient data for divergence analysis'
      };
    }

    const recentPrices = this.priceHistory.slice(-10);
    const recentRSI = this.previousRSI.slice(-10);

    const priceHigh = Math.max(...recentPrices);
    const priceLow = Math.min(...recentPrices);
    const rsiHigh = Math.max(...recentRSI);
    const rsiLow = Math.min(...recentRSI);

    const priceHighIndex = recentPrices.indexOf(priceHigh);
    const priceLowIndex = recentPrices.indexOf(priceLow);
    const rsiHighIndex = recentRSI.indexOf(rsiHigh);
    const rsiLowIndex = recentRSI.indexOf(rsiLow);

    // Bullish divergence: price makes lower low, RSI makes higher low
    if (priceLowIndex > rsiLowIndex && (recentPrices[priceLowIndex] || 0) < (recentPrices[rsiLowIndex] || 0) && 
        (recentRSI[priceLowIndex] || 0) > (recentRSI[rsiLowIndex] || 0)) {
      return {
        type: 'bullish',
        strength: 0.7,
        description: 'Bullish divergence: Price lower low, RSI higher low'
      };
    }

    // Bearish divergence: price makes higher high, RSI makes lower high
    if (priceHighIndex > rsiHighIndex && (recentPrices[priceHighIndex] || 0) > (recentPrices[rsiHighIndex] || 0) && 
        (recentRSI[priceHighIndex] || 0) < (recentRSI[rsiHighIndex] || 0)) {
      return {
        type: 'bearish',
        strength: 0.7,
        description: 'Bearish divergence: Price higher high, RSI lower high'
      };
    }

    return {
      type: 'none',
      strength: 0,
      description: 'No significant divergence detected'
    };
  }

  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = ((values[i] || 0) * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  private calculateVWAP(): number {
    const minLength = Math.min(this.priceHistory.length, this.volumeHistory.length, this.config.volumePeriod);
    
    if (minLength === 0) return 0;

    const prices = this.priceHistory.slice(-minLength);
    const volumes = this.volumeHistory.slice(-minLength);

    const totalVolumePrice = prices.reduce((sum, price, i) => sum + (price * (volumes[i] || 0)), 0);
    const totalVolume = volumes.reduce((sum, volume) => sum + volume, 0);

    return totalVolume > 0 ? totalVolumePrice / totalVolume : (prices[prices.length - 1] || 0);
  }

  private calculateVolumeRateOfChange(): number {
    if (this.volumeHistory.length < 10) return 0;

    const current = this.volumeHistory[this.volumeHistory.length - 1] || 0;
    const previous = this.volumeHistory[this.volumeHistory.length - 10] || 0;

    if (previous === 0) return 0;

    return (current - previous) / previous;
  }

  private analyzeCurrentTrend(): TrendAnalysis {
    const rsi = this.calculateRSI();
    const macd = this.calculateMACD();
    const bb = this.calculateBollingerBands();

    const signals: string[] = [];
    let bullishSignals = 0;
    let bearishSignals = 0;

    // RSI signals
    if (rsi.signal === 'buy') {
      bullishSignals++;
      signals.push('RSI oversold');
    } else if (rsi.signal === 'sell') {
      bearishSignals++;
      signals.push('RSI overbought');
    }

    // MACD signals
    if (macd.bullishCrossover) {
      bullishSignals++;
      signals.push('MACD bullish crossover');
    } else if (macd.bearishCrossover) {
      bearishSignals++;
      signals.push('MACD bearish crossover');
    }

    // Bollinger Bands signals
    if (bb.position === 'below') {
      bullishSignals++;
      signals.push('Price below lower Bollinger Band');
    } else if (bb.position === 'above') {
      bearishSignals++;
      signals.push('Price above upper Bollinger Band');
    }

    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let strength = 0;

    if (bullishSignals > bearishSignals) {
      trend = 'bullish';
      strength = bullishSignals / (bullishSignals + bearishSignals);
    } else if (bearishSignals > bullishSignals) {
      trend = 'bearish';
      strength = bearishSignals / (bullishSignals + bearishSignals);
    } else {
      strength = 0.5;
    }

    return { trend, strength, signals };
  }

  // Public method to get comprehensive analysis
  getComprehensiveAnalysis(): {
    rsi: RSIResult;
    macd: MACDResult;
    bollingerBands: BollingerBandsResult;
    volumeIndicators: VolumeIndicators;
    multiTimeframe: MultiTimeframeAnalysis;
    divergence: DivergenceAnalysis;
  } {
    const rsi = this.calculateRSI();
    this.previousRSI.push(rsi.rsi);
    if (this.previousRSI.length > 20) this.previousRSI.shift();

    return {
      rsi,
      macd: this.calculateMACD(),
      bollingerBands: this.calculateBollingerBands(),
      volumeIndicators: this.calculateVolumeIndicators(),
      multiTimeframe: this.calculateMultiTimeframeAnalysis(),
      divergence: this.analyzeDivergence()
    };
  }
}