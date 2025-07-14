export interface PriceData {
  price: number;
  volume: number;
  timestamp: number;
}

export interface RSIResult {
  rsi: number;
  overbought: boolean;
  oversold: boolean;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  bullishCrossover: boolean;
  bearishCrossover: boolean;
}

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
  bandwidth: number;
  squeeze: boolean;
}

export interface VolumeIndicatorsResult {
  vwap: number;
  obv: number;
  volumeRateOfChange: number;
}

export interface MultiTimeframeSignal {
  timeframe: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number;
}

export class TechnicalIndicators {
  private priceHistory: PriceData[] = [];
  private previousMACDHistogram = 0;
  private previousOBV = 0;

  updateData(price: number, volume: number, timestamp: number = Date.now()): void {
    this.priceHistory.push({ price, volume, timestamp });
    
    if (this.priceHistory.length > 200) {
      this.priceHistory.shift();
    }
  }

  calculateRSI(period = 14): RSIResult | null {
    if (this.priceHistory.length < period + 1) {
      return null;
    }

    const prices = this.priceHistory.slice(-period - 1);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i]!.price - prices[i - 1]!.price;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) {
      return {
        rsi: 100,
        overbought: true,
        oversold: false,
      };
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return {
      rsi,
      overbought: rsi > 70,
      oversold: rsi < 30,
    };
  }

  calculateMACD(fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDResult | null {
    if (this.priceHistory.length < slowPeriod) {
      return null;
    }

    const fastEMA = this.calculateEMA(fastPeriod);
    const slowEMA = this.calculateEMA(slowPeriod);

    if (fastEMA === null || slowEMA === null) {
      return null;
    }

    const macd = fastEMA - slowEMA;
    const signal = this.calculateMACDSignal(signalPeriod);
    
    if (signal === null) {
      return null;
    }

    const histogram = macd - signal;

    const bullishCrossover = this.previousMACDHistogram <= 0 && histogram > 0;
    const bearishCrossover = this.previousMACDHistogram >= 0 && histogram < 0;

    this.previousMACDHistogram = histogram;

    return {
      macd,
      signal,
      histogram,
      bullishCrossover,
      bearishCrossover,
    };
  }

  calculateBollingerBands(period = 20, standardDeviations = 2): BollingerBandsResult | null {
    if (this.priceHistory.length < period) {
      return null;
    }

    const prices = this.priceHistory.slice(-period).map(d => d.price);
    const sma = prices.reduce((sum, price) => sum + price, 0) / period;

    const variance = prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    const upper = sma + (standardDeviations * standardDeviation);
    const lower = sma - (standardDeviations * standardDeviation);
    const currentPrice = this.priceHistory[this.priceHistory.length - 1]!.price;

    const percentB = (currentPrice - lower) / (upper - lower);
    const bandwidth = (upper - lower) / sma;

    const squeeze = bandwidth < 0.1;

    return {
      upper,
      middle: sma,
      lower,
      percentB,
      bandwidth,
      squeeze,
    };
  }

  calculateVolumeIndicators(period = 20): VolumeIndicatorsResult | null {
    if (this.priceHistory.length < period) {
      return null;
    }

    const vwap = this.calculateVWAP(period);
    const obv = this.calculateOBV();
    const volumeRateOfChange = this.calculateVolumeRateOfChange(period);

    return {
      vwap,
      obv,
      volumeRateOfChange,
    };
  }

  analyzeMultiTimeframe(): MultiTimeframeSignal[] {
    const signals: MultiTimeframeSignal[] = [];

    const timeframes = [
      { name: '1m', periods: 60 },
      { name: '5m', periods: 12 }, 
      { name: '15m', periods: 4 },
      { name: '1h', periods: 1 },
    ];

    for (const timeframe of timeframes) {
      const trend = this.analyzeTrendForTimeframe(timeframe.periods);
      signals.push({
        timeframe: timeframe.name,
        trend: trend.trend,
        strength: trend.strength,
      });
    }

    return signals;
  }

  private calculateEMA(period: number): number | null {
    if (this.priceHistory.length < period) {
      return null;
    }

    const multiplier = 2 / (period + 1);
    const prices = this.priceHistory.slice(-period);
    
    let ema = prices[0]!.price;
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i]!.price * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  private calculateMACDSignal(signalPeriod: number): number | null {
    if (this.priceHistory.length < signalPeriod + 26) {
      return null;
    }

    const macdValues: number[] = [];
    for (let i = 26; i <= this.priceHistory.length; i++) {
      const subset = this.priceHistory.slice(0, i);
      const tempIndicator = new TechnicalIndicators();
      subset.forEach(data => tempIndicator.updateData(data.price, data.volume, data.timestamp));
      
      const fastEMA = tempIndicator.calculateEMA(12);
      const slowEMA = tempIndicator.calculateEMA(26);
      
      if (fastEMA !== null && slowEMA !== null) {
        macdValues.push(fastEMA - slowEMA);
      }
    }

    if (macdValues.length < signalPeriod) {
      return null;
    }

    const multiplier = 2 / (signalPeriod + 1);
    let signal = macdValues[0]!;
    
    for (let i = 1; i < macdValues.length; i++) {
      signal = (macdValues[i]! * multiplier) + (signal * (1 - multiplier));
    }

    return signal;
  }

  private calculateVWAP(period: number): number {
    const data = this.priceHistory.slice(-period);
    let totalPriceVolume = 0;
    let totalVolume = 0;

    for (const point of data) {
      totalPriceVolume += point.price * point.volume;
      totalVolume += point.volume;
    }

    return totalVolume > 0 ? totalPriceVolume / totalVolume : data[data.length - 1]!.price;
  }

  private calculateOBV(): number {
    if (this.priceHistory.length < 2) {
      return 0;
    }

    const current = this.priceHistory[this.priceHistory.length - 1]!;
    const previous = this.priceHistory[this.priceHistory.length - 2]!;

    if (current.price > previous.price) {
      this.previousOBV += current.volume;
    } else if (current.price < previous.price) {
      this.previousOBV -= current.volume;
    }

    return this.previousOBV;
  }

  private calculateVolumeRateOfChange(period: number): number {
    if (this.priceHistory.length < period + 1) {
      return 0;
    }

    const currentVolume = this.priceHistory[this.priceHistory.length - 1]!.volume;
    const previousVolume = this.priceHistory[this.priceHistory.length - period - 1]!.volume;

    if (previousVolume === 0) {
      return 0;
    }

    return (currentVolume - previousVolume) / previousVolume;
  }

  private analyzeTrendForTimeframe(aggregationPeriods: number): { trend: 'bullish' | 'bearish' | 'neutral'; strength: number } {
    if (this.priceHistory.length < aggregationPeriods * 10) {
      return { trend: 'neutral', strength: 0 };
    }

    const shortMA = this.calculateMovingAverage(aggregationPeriods * 5);
    const longMA = this.calculateMovingAverage(aggregationPeriods * 10);

    if (shortMA === null || longMA === null) {
      return { trend: 'neutral', strength: 0 };
    }

    const difference = (shortMA - longMA) / longMA;
    const strength = Math.min(Math.abs(difference) * 100, 1);

    if (difference > 0.01) {
      return { trend: 'bullish', strength };
    } else if (difference < -0.01) {
      return { trend: 'bearish', strength };
    } else {
      return { trend: 'neutral', strength };
    }
  }

  private calculateMovingAverage(period: number): number | null {
    if (this.priceHistory.length < period) {
      return null;
    }

    const prices = this.priceHistory.slice(-period).map(d => d.price);
    return prices.reduce((sum, price) => sum + price, 0) / period;
  }

  getDivergenceSignals(): { bullishDivergence: boolean; bearishDivergence: boolean } {
    const rsi = this.calculateRSI();
    if (!rsi || this.priceHistory.length < 20) {
      return { bullishDivergence: false, bearishDivergence: false };
    }

    const recentPrices = this.priceHistory.slice(-10).map(d => d.price);
    const priceDirection = recentPrices[recentPrices.length - 1]! - recentPrices[0]!;
    
    const rsiValues: number[] = [];
    for (let i = this.priceHistory.length - 10; i < this.priceHistory.length; i++) {
      const subset = this.priceHistory.slice(0, i + 1);
      const tempIndicator = new TechnicalIndicators();
      subset.forEach(data => tempIndicator.updateData(data.price, data.volume, data.timestamp));
      const tempRSI = tempIndicator.calculateRSI();
      if (tempRSI) {
        rsiValues.push(tempRSI.rsi);
      }
    }

    if (rsiValues.length < 2) {
      return { bullishDivergence: false, bearishDivergence: false };
    }

    const rsiDirection = rsiValues[rsiValues.length - 1]! - rsiValues[0]!;

    const bullishDivergence = priceDirection < 0 && rsiDirection > 0 && Math.abs(priceDirection) > 0.02;
    const bearishDivergence = priceDirection > 0 && rsiDirection < 0 && Math.abs(priceDirection) > 0.02;

    return { bullishDivergence, bearishDivergence };
  }
}