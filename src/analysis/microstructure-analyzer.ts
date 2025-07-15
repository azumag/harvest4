import { EventEmitter } from 'events';
import {
  TransactionData,
  OrderBookData,
  MarketMicrostructure,
  MarketAlert
} from '../types/bitbank';

interface MicrostructureAnalyzerConfig {
  spreadWindow?: number;
  impactWindow?: number;
  frequencyWindow?: number;
  spreadThreshold?: number;
  impactThreshold?: number;
}

interface SpreadRecord {
  timestamp: number;
  spread: number;
  midPrice: number;
  volume: number;
}

interface TradeImpact {
  timestamp: number;
  priceChange: number;
  volume: number;
  side: 'buy' | 'sell';
}

export class MicrostructureAnalyzer extends EventEmitter {
  private spreadHistory: SpreadRecord[] = [];
  private priceImpacts: TradeImpact[] = [];
  private liquidityProviders: Map<string, { count: number; volume: number }> = new Map();
  private config: MicrostructureAnalyzerConfig;
  private lastOrderBook: OrderBookData | null = null;
  private lastMidPrice = 0;
  private executionTimes: number[] = [];
  private lastAnalysis: MarketMicrostructure | null = null;

  constructor(config: MicrostructureAnalyzerConfig = {}) {
    super();
    this.config = {
      spreadWindow: 100,
      impactWindow: 50,
      frequencyWindow: 300000, // 5 minutes
      spreadThreshold: 0.005, // 0.5%
      impactThreshold: 0.001, // 0.1%
      ...config
    };
  }

  public updateOrderBook(orderBook: OrderBookData): void {
    this.lastOrderBook = orderBook;
    this.recordSpread(orderBook);
    this.updateLiquidityProviders(orderBook);
    
    const analysis = this.analyzeMarketMicrostructure();
    this.checkForAlerts(analysis);
    
    this.lastAnalysis = analysis;
    this.emit('microstructure_analysis', analysis);
  }

  public addTransaction(transaction: TransactionData): void {
    this.recordPriceImpact(transaction);
    this.recordExecutionTime(transaction);
    this.cleanupOldData();
    
    const analysis = this.analyzeMarketMicrostructure();
    this.checkForAlerts(analysis);
    
    this.lastAnalysis = analysis;
    this.emit('microstructure_analysis', analysis);
  }

  private recordSpread(orderBook: OrderBookData): void {
    if (orderBook.asks.length === 0 || orderBook.bids.length === 0) return;
    
    const bestAsk = parseFloat(orderBook.asks[0]?.price);
    const bestBid = parseFloat(orderBook.bids[0]?.price);
    const spread = bestAsk - bestBid;
    const midPrice = (bestAsk + bestBid) / 2;
    
    // Calculate volume at best levels
    const volume = parseFloat(orderBook.asks[0]?.amount) + parseFloat(orderBook.bids[0]?.amount);
    
    const spreadRecord: SpreadRecord = {
      timestamp: Date.now(),
      spread,
      midPrice,
      volume
    };
    
    this.spreadHistory.push(spreadRecord);
    this.lastMidPrice = midPrice;
    
    if (this.spreadHistory.length > this.config.spreadWindow!) {
      this.spreadHistory.shift();
    }
  }

  private recordPriceImpact(transaction: TransactionData): void {
    if (this.lastMidPrice === 0) return;
    
    const tradePrice = parseFloat(transaction.price);
    const priceChange = Math.abs(tradePrice - this.lastMidPrice) / this.lastMidPrice;
    
    const impact: TradeImpact = {
      timestamp: transaction.executed_at,
      priceChange,
      volume: parseFloat(transaction.amount),
      side: transaction.side
    };
    
    this.priceImpacts.push(impact);
    
    if (this.priceImpacts.length > this.config.impactWindow!) {
      this.priceImpacts.shift();
    }
  }

  private recordExecutionTime(transaction: TransactionData): void {
    // In a real implementation, this would compare order submission time to execution time
    // For now, we'll simulate execution time as the time between consecutive transactions
    if (this.executionTimes.length > 0) {
      const lastTime = this.executionTimes[this.executionTimes.length - 1];
      if (lastTime !== undefined) {
        const executionTime = transaction.executed_at - lastTime;
        this.executionTimes.push(executionTime);
      } else {
        this.executionTimes.push(transaction.executed_at);
      }
    } else {
      this.executionTimes.push(transaction.executed_at);
    }
    
    if (this.executionTimes.length > 100) {
      this.executionTimes.shift();
    }
  }

  private updateLiquidityProviders(orderBook: OrderBookData): void {
    // Track price levels and their persistence as a proxy for liquidity providers
    const allPrices = [
      ...orderBook.asks.map(ask => ask.price),
      ...orderBook.bids.map(bid => bid.price)
    ];
    
    for (const price of allPrices) {
      if (this.liquidityProviders.has(price)) {
        const provider = this.liquidityProviders.get(price)!;
        provider.count++;
      } else {
        this.liquidityProviders.set(price, { count: 1, volume: 0 });
      }
    }
    
    // Update volume for existing price levels
    for (const ask of orderBook.asks) {
      if (this.liquidityProviders.has(ask.price)) {
        this.liquidityProviders.get(ask.price)!.volume += parseFloat(ask.amount);
      }
    }
    
    for (const bid of orderBook.bids) {
      if (this.liquidityProviders.has(bid.price)) {
        this.liquidityProviders.get(bid.price)!.volume += parseFloat(bid.amount);
      }
    }
    
    // Clean up old price levels
    if (this.liquidityProviders.size > 1000) {
      const sortedProviders = Array.from(this.liquidityProviders.entries())
        .sort((a, b) => b[1].count - a[1].count);
      
      this.liquidityProviders.clear();
      sortedProviders.slice(0, 500).forEach(([price, data]) => {
        this.liquidityProviders.set(price, data);
      });
    }
  }

  private cleanupOldData(): void {
    const cutoffTime = Date.now() - this.config.frequencyWindow!;
    
    this.spreadHistory = this.spreadHistory.filter(record => 
      record.timestamp > cutoffTime
    );
    
    this.priceImpacts = this.priceImpacts.filter(impact => 
      impact.timestamp > cutoffTime
    );
  }

  private analyzeMarketMicrostructure(): MarketMicrostructure {
    const averageSpread = this.calculateAverageSpread();
    const spreadTrend = this.calculateSpreadTrend();
    const tradeFrequency = this.calculateTradeFrequency();
    const priceImpact = this.calculateAveragePriceImpact();
    const liquidityProviders = this.getLiquidityProviders();
    const executionQuality = this.calculateExecutionQuality();

    return {
      averageSpread,
      spreadTrend,
      tradeFrequency,
      priceImpact,
      liquidityProviders,
      executionQuality
    };
  }

  private calculateAverageSpread(): number {
    if (this.spreadHistory.length === 0) return 0;
    
    const totalSpread = this.spreadHistory.reduce((sum, record) => sum + record.spread, 0);
    return totalSpread / this.spreadHistory.length;
  }

  private calculateSpreadTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.spreadHistory.length < 10) return 'stable';
    
    const recentSpreads = this.spreadHistory.slice(-10);
    const firstHalf = recentSpreads.slice(0, 5);
    const secondHalf = recentSpreads.slice(5);
    
    const firstHalfAvg = firstHalf.reduce((sum, record) => sum + record.spread, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, record) => sum + record.spread, 0) / secondHalf.length;
    
    const change = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
    
    if (change > 0.05) return 'increasing';
    if (change < -0.05) return 'decreasing';
    return 'stable';
  }

  private calculateTradeFrequency(): number {
    if (this.priceImpacts.length < 2) return 0;
    
    const timespan = this.priceImpacts[this.priceImpacts.length - 1]?.timestamp - 
                    this.priceImpacts[0]?.timestamp;
    
    return timespan > 0 ? (this.priceImpacts.length / timespan) * 1000 : 0; // trades per second
  }

  private calculateAveragePriceImpact(): number {
    if (this.priceImpacts.length === 0) return 0;
    
    const totalImpact = this.priceImpacts.reduce((sum, impact) => sum + impact.priceChange, 0);
    return totalImpact / this.priceImpacts.length;
  }

  private getLiquidityProviders(): { [price: string]: { count: number; volume: number } } {
    const result: { [price: string]: { count: number; volume: number } } = {};
    
    // Get top 20 most active price levels
    const sortedProviders = Array.from(this.liquidityProviders.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
    
    for (const [price, data] of sortedProviders) {
      result[price] = { ...data };
    }
    
    return result;
  }

  private calculateExecutionQuality(): number {
    if (this.executionTimes.length < 2) return 0;
    
    // Calculate execution quality based on spread consistency and execution speed
    const spreadVariability = this.calculateSpreadVariability();
    const executionSpeed = this.calculateExecutionSpeed();
    
    // Normalize and combine metrics (0-1 scale, higher is better)
    const spreadScore = Math.max(0, 1 - spreadVariability);
    const speedScore = Math.max(0, 1 - executionSpeed / 10000); // Normalize to 10 seconds
    
    return (spreadScore + speedScore) / 2;
  }

  private calculateSpreadVariability(): number {
    if (this.spreadHistory.length < 2) return 0;
    
    const spreads = this.spreadHistory.map(record => record.spread);
    const mean = spreads.reduce((sum, spread) => sum + spread, 0) / spreads.length;
    const variance = spreads.reduce((sum, spread) => sum + Math.pow(spread - mean, 2), 0) / spreads.length;
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  private calculateExecutionSpeed(): number {
    if (this.executionTimes.length < 2) return 0;
    
    const intervals = [];
    for (let i = 1; i < this.executionTimes.length; i++) {
      const current = this.executionTimes[i];
      const previous = this.executionTimes[i - 1];
      if (current !== undefined && previous !== undefined) {
        intervals.push(current - previous);
      }
    }
    
    return intervals.length > 0 ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : 0;
  }

  private checkForAlerts(analysis: MarketMicrostructure): void {
    // Wide spread alert
    if (analysis.averageSpread > 0 && this.lastMidPrice > 0) {
      const spreadPercent = (analysis.averageSpread / this.lastMidPrice) * 100;
      if (spreadPercent > this.config.spreadThreshold! * 100) {
        this.emitAlert('spread', 'medium', 'Wide spread detected', {
          spread: analysis.averageSpread,
          spreadPercent,
          threshold: this.config.spreadThreshold! * 100
        });
      }
    }

    // High price impact alert
    if (analysis.priceImpact > this.config.impactThreshold!) {
      this.emitAlert('anomaly', 'high', 'High price impact detected', {
        impact: analysis.priceImpact,
        threshold: this.config.impactThreshold
      });
    }

    // Low execution quality alert
    if (analysis.executionQuality < 0.5) {
      this.emitAlert('system', 'medium', 'Low execution quality detected', {
        quality: analysis.executionQuality,
        threshold: 0.5
      });
    }

    // Spread trend alert
    if (analysis.spreadTrend === 'increasing') {
      this.emitAlert('spread', 'low', 'Increasing spread trend detected', {
        trend: analysis.spreadTrend,
        averageSpread: analysis.averageSpread
      });
    }
  }

  private emitAlert(type: MarketAlert['type'], level: MarketAlert['level'], message: string, data?: unknown): void {
    const alert: MarketAlert = {
      type,
      level,
      message,
      timestamp: Date.now(),
      data
    };
    
    this.emit('alert', alert);
  }

  public getAnalysis(): MarketMicrostructure | null {
    return this.lastAnalysis;
  }

  public getSpreadHistory(): SpreadRecord[] {
    return [...this.spreadHistory];
  }

  public getPriceImpacts(): TradeImpact[] {
    return [...this.priceImpacts];
  }

  public getMarketQuality(): {
    spreadStability: number;
    liquidityConsistency: number;
    executionEfficiency: number;
    overallQuality: number;
  } {
    const spreadStability = 1 - this.calculateSpreadVariability();
    const liquidityConsistency = this.calculateLiquidityConsistency();
    const executionEfficiency = this.lastAnalysis?.executionQuality || 0;
    
    const overallQuality = (spreadStability + liquidityConsistency + executionEfficiency) / 3;
    
    return {
      spreadStability,
      liquidityConsistency,
      executionEfficiency,
      overallQuality
    };
  }

  private calculateLiquidityConsistency(): number {
    if (this.spreadHistory.length < 2) return 0;
    
    const volumes = this.spreadHistory.map(record => record.volume);
    const mean = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    const variance = volumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / volumes.length;
    
    return Math.max(0, 1 - (Math.sqrt(variance) / mean));
  }

  public isHealthy(): boolean {
    return (
      this.spreadHistory.length > 0 &&
      this.lastOrderBook !== null &&
      this.lastAnalysis !== null
    );
  }
}