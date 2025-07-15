export interface Candle {
  high: number;
  low: number;
  close: number;
}

export class ATRCalculator {
  private period: number;
  private trueRanges: number[] = [];
  private candles: Candle[] = [];
  private atr = 0;

  constructor(period = 14) {
    this.period = period;
  }

  addCandle(candle: Candle): void {
    const previousClose = this.candles.length > 0 
      ? this.candles[this.candles.length - 1]?.close 
      : undefined;
    
    const trueRange = this.calculateTrueRange(candle, previousClose);
    this.trueRanges.push(trueRange);
    this.candles.push(candle);

    // Limit history to prevent memory issues
    if (this.trueRanges.length > this.period * 2) {
      this.trueRanges.shift();
      this.candles.shift();
    }

    this.updateATR();
  }

  calculateTrueRange(candle: Candle, previousClose?: number): number {
    const { high, low } = candle;
    
    if (previousClose === undefined) {
      // First candle: TR = High - Low
      return high - low;
    }

    // TR = max(High - Low, |High - PreviousClose|, |Low - PreviousClose|)
    const range1 = high - low;
    const range2 = Math.abs(high - previousClose);
    const range3 = Math.abs(low - previousClose);

    return Math.max(range1, range2, range3);
  }

  private updateATR(): void {
    if (this.trueRanges.length === 0) {
      this.atr = 0;
      return;
    }

    if (this.trueRanges.length <= this.period) {
      // Use simple moving average for initial period
      const sum = this.trueRanges.reduce((acc, tr) => acc + tr, 0);
      this.atr = sum / this.trueRanges.length;
    } else {
      // Use exponential moving average (Wilder's smoothing)
      // ATR = ((Previous ATR * (period - 1)) + Current TR) / period
      const currentTR = this.trueRanges[this.trueRanges.length - 1];
      if (currentTR !== undefined) {
        this.atr = ((this.atr * (this.period - 1)) + currentTR) / this.period;
      }
    }
  }

  getATR(): number {
    return this.atr;
  }

  getTrueRangeHistory(): number[] {
    return [...this.trueRanges];
  }

  getPeriod(): number {
    return this.period;
  }

  getCurrentCandle(): Candle | undefined {
    return this.candles.length > 0 
      ? this.candles[this.candles.length - 1] 
      : undefined;
  }

  reset(): void {
    this.trueRanges = [];
    this.candles = [];
    this.atr = 0;
  }

  // Calculate ATR as percentage of current price
  getATRPercentage(): number {
    const currentCandle = this.getCurrentCandle();
    if (!currentCandle || this.atr === 0) {
      return 0;
    }
    
    return (this.atr / currentCandle.close) * 100;
  }

  // Get volatility classification based on ATR
  getVolatilityLevel(): 'low' | 'medium' | 'high' {
    const atrPercentage = this.getATRPercentage();
    
    if (atrPercentage < 1) return 'low';
    if (atrPercentage < 3) return 'medium';
    return 'high';
  }
}