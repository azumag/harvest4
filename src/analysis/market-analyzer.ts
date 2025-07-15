import { BitbankTicker } from '../types/bitbank';
import { MarketCondition, MarketAnalysis } from '../types/advanced-strategies';

export class MarketAnalyzer {
  private priceHistory: number[] = [];
  private volumeHistory: number[] = [];
  private tickerHistory: BitbankTicker[] = [];
  private readonly HISTORY_SIZE = 100;

  updateMarketData(ticker: BitbankTicker): void {
    const currentPrice = parseFloat(ticker.last);
    const currentVolume = parseFloat(ticker.vol);
    
    this.priceHistory.push(currentPrice);
    this.volumeHistory.push(currentVolume);
    this.tickerHistory.push(ticker);
    
    // Keep only recent history
    if (this.priceHistory.length > this.HISTORY_SIZE) {
      this.priceHistory.shift();
      this.volumeHistory.shift();
      this.tickerHistory.shift();
    }
  }

  analyzeMarket(): MarketAnalysis {
    if (this.priceHistory.length < 20) {
      return {
        condition: {
          trend: 'sideways',
          volatility: 'medium',
          volume: 'medium',
          confidence: 0.5
        },
        recommendedStrategies: ['Grid Trading'],
        riskLevel: 0.5,
        expectedVolatility: 0.02,
        timestamp: Date.now()
      };
    }

    const trend = this.detectTrend();
    const volatility = this.detectVolatility();
    const volume = this.detectVolume();
    const confidence = this.calculateConfidence();

    const condition: MarketCondition = {
      trend,
      volatility,
      volume,
      confidence
    };

    const recommendedStrategies = this.recommendStrategies(condition);
    const riskLevel = this.calculateRiskLevel(condition);
    const expectedVolatility = this.calculateExpectedVolatility();

    return {
      condition,
      recommendedStrategies,
      riskLevel,
      expectedVolatility,
      timestamp: Date.now()
    };
  }

  private detectTrend(): 'bullish' | 'bearish' | 'sideways' {
    if (this.priceHistory.length < 50) return 'sideways';

    // Calculate multiple moving averages
    const shortMA = this.calculateMovingAverage(5);
    const mediumMA = this.calculateMovingAverage(20);
    const longMA = this.calculateMovingAverage(50);

    // Calculate trend strength
    const shortTrend = (shortMA - mediumMA) / mediumMA;
    const mediumTrend = (mediumMA - longMA) / longMA;
    
    // Calculate price momentum
    const momentum = this.calculateMomentum(20);
    
    // Determine trend direction
    const trendThreshold = 0.01; // 1% threshold
    
    if (shortTrend > trendThreshold && mediumTrend > 0 && momentum > 0) {
      return 'bullish';
    } else if (shortTrend < -trendThreshold && mediumTrend < 0 && momentum < 0) {
      return 'bearish';
    } else {
      return 'sideways';
    }
  }

  private detectVolatility(): 'low' | 'medium' | 'high' {
    if (this.priceHistory.length < 20) return 'medium';

    const volatility = this.calculateVolatility(20);
    
    // Volatility thresholds (these can be adjusted based on historical data)
    if (volatility < 0.01) {
      return 'low';
    } else if (volatility > 0.03) {
      return 'high';
    } else {
      return 'medium';
    }
  }

  private detectVolume(): 'low' | 'medium' | 'high' {
    if (this.volumeHistory.length < 20) return 'medium';

    const currentVolume = this.volumeHistory[this.volumeHistory.length - 1];
    const avgVolume = this.calculateVolumeAverage(20);
    const volumeRatio = currentVolume / avgVolume;

    if (volumeRatio < 0.7) {
      return 'low';
    } else if (volumeRatio > 1.5) {
      return 'high';
    } else {
      return 'medium';
    }
  }

  private calculateConfidence(): number {
    if (this.priceHistory.length < 20) return 0.5;

    // Calculate confidence based on multiple factors
    let confidence = 0.5;

    // Factor 1: Trend consistency
    const trendConsistency = this.calculateTrendConsistency();
    confidence += trendConsistency * 0.3;

    // Factor 2: Volume confirmation
    const volumeConfirmation = this.calculateVolumeConfirmation();
    confidence += volumeConfirmation * 0.2;

    // Factor 3: Data quality (more data = higher confidence)
    const dataQuality = Math.min(1, this.priceHistory.length / 50);
    confidence += dataQuality * 0.1;

    // Factor 4: Volatility stability
    const volatilityStability = this.calculateVolatilityStability();
    confidence += volatilityStability * 0.2;

    return Math.max(0.3, Math.min(1, confidence));
  }

  private calculateTrendConsistency(): number {
    if (this.priceHistory.length < 10) return 0;

    const recentPrices = this.priceHistory.slice(-10);
    let upCount = 0;
    let downCount = 0;

    for (let i = 1; i < recentPrices.length; i++) {
      if (recentPrices[i] > recentPrices[i - 1]) {
        upCount++;
      } else {
        downCount++;
      }
    }

    // Return consistency score (0 to 1)
    return Math.max(upCount, downCount) / (recentPrices.length - 1);
  }

  private calculateVolumeConfirmation(): number {
    if (this.volumeHistory.length < 10) return 0;

    const recentVolumes = this.volumeHistory.slice(-10);
    const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    const currentVolume = recentVolumes[recentVolumes.length - 1];

    // Volume confirmation score based on current volume vs average
    const volumeRatio = currentVolume / avgVolume;
    return Math.min(1, volumeRatio / 2); // Normalize to 0-1
  }

  private calculateVolatilityStability(): number {
    if (this.priceHistory.length < 20) return 0;

    // Calculate volatility over different periods
    const shortVolatility = this.calculateVolatility(10);
    const longVolatility = this.calculateVolatility(20);

    // Stability is inversely related to volatility difference
    const volatilityDifference = Math.abs(shortVolatility - longVolatility);
    return Math.max(0, 1 - volatilityDifference * 50);
  }

  private recommendStrategies(condition: MarketCondition): string[] {
    const strategies: string[] = [];

    // Recommend strategies based on market condition
    if (condition.trend === 'bullish') {
      strategies.push('Momentum');
      if (condition.volatility === 'low') {
        strategies.push('Grid Trading');
      }
    } else if (condition.trend === 'bearish') {
      strategies.push('Momentum');
      strategies.push('Mean Reversion');
    } else { // sideways
      strategies.push('Grid Trading');
      strategies.push('Mean Reversion');
      if (condition.volatility === 'low') {
        strategies.push('Market Making');
      }
    }

    // Always consider arbitrage if conditions are right
    if (condition.volatility === 'medium' || condition.volatility === 'high') {
      strategies.push('Arbitrage');
    }

    // ML strategy can work in any condition but better with more data
    if (condition.confidence > 0.7) {
      strategies.push('Machine Learning');
    }

    return strategies;
  }

  private calculateRiskLevel(condition: MarketCondition): number {
    let riskLevel = 0.5; // Base risk level

    // Adjust based on volatility
    if (condition.volatility === 'high') {
      riskLevel += 0.3;
    } else if (condition.volatility === 'low') {
      riskLevel -= 0.2;
    }

    // Adjust based on trend
    if (condition.trend === 'sideways') {
      riskLevel -= 0.1;
    }

    // Adjust based on volume
    if (condition.volume === 'low') {
      riskLevel += 0.1;
    }

    // Adjust based on confidence
    riskLevel += (1 - condition.confidence) * 0.2;

    return Math.max(0.1, Math.min(0.9, riskLevel));
  }

  private calculateExpectedVolatility(): number {
    if (this.priceHistory.length < 20) return 0.02;

    // Calculate recent volatility
    const recentVolatility = this.calculateVolatility(20);
    
    // Exponential moving average of volatility for better prediction
    const shorterVolatility = this.calculateVolatility(10);
    
    // Weighted average: more weight to recent volatility
    return (recentVolatility * 0.7) + (shorterVolatility * 0.3);
  }

  private calculateMovingAverage(period: number): number {
    if (this.priceHistory.length < period) {
      return this.priceHistory[this.priceHistory.length - 1] || 0;
    }
    
    const sum = this.priceHistory.slice(-period).reduce((sum, price) => sum + price, 0);
    return sum / period;
  }

  private calculateMomentum(period: number): number {
    if (this.priceHistory.length < period) return 0;
    
    const current = this.priceHistory[this.priceHistory.length - 1];
    const previous = this.priceHistory[this.priceHistory.length - period];
    
    return (current - previous) / previous;
  }

  private calculateVolatility(period: number): number {
    if (this.priceHistory.length < period) return 0;
    
    const recentPrices = this.priceHistory.slice(-period);
    const mean = recentPrices.reduce((sum, price) => sum + price, 0) / period;
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
    
    return Math.sqrt(variance) / mean;
  }

  private calculateVolumeAverage(period: number): number {
    if (this.volumeHistory.length < period) {
      return this.volumeHistory[this.volumeHistory.length - 1] || 0;
    }
    
    const sum = this.volumeHistory.slice(-period).reduce((sum, vol) => sum + vol, 0);
    return sum / period;
  }

  // Additional analysis methods
  getMarketSummary(): {
    currentPrice: number;
    priceChange24h: number;
    volatility: number;
    volume24h: number;
    trend: string;
  } {
    if (this.priceHistory.length === 0) {
      return {
        currentPrice: 0,
        priceChange24h: 0,
        volatility: 0,
        volume24h: 0,
        trend: 'unknown'
      };
    }

    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    const priceChange24h = this.priceHistory.length > 1 ? 
      (currentPrice - this.priceHistory[0]) / this.priceHistory[0] : 0;
    const volatility = this.calculateVolatility(20);
    const volume24h = this.volumeHistory[this.volumeHistory.length - 1] || 0;
    const trend = this.detectTrend();

    return {
      currentPrice,
      priceChange24h,
      volatility,
      volume24h,
      trend
    };
  }

  getCurrentMarketCondition(): MarketCondition {
    return {
      trend: this.detectTrend(),
      volatility: this.detectVolatility(),
      volume: this.detectVolume(),
      confidence: this.calculateConfidence()
    };
  }
}