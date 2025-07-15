import { EventEmitter } from 'events';
import {
  OrderBookData,
  DepthDiffData,
  OrderBookEntry,
  OrderBookAnalysis,
  MarketAlert
} from '../types/bitbank';

interface OrderBookManagerConfig {
  maxDepth?: number;
  largeOrderThreshold?: number;
  spreadAlertThreshold?: number;
  imbalanceAlertThreshold?: number;
}

export class OrderBookManager extends EventEmitter {
  private orderBook: OrderBookData | null = null;
  private config: OrderBookManagerConfig;
  private sequenceId = 0;
  private lastUpdateTime = 0;
  private priceHistory: number[] = [];
  private spreadHistory: number[] = [];

  constructor(config: OrderBookManagerConfig = {}) {
    super();
    this.config = {
      maxDepth: 100,
      largeOrderThreshold: 1000000, // 1M JPY
      spreadAlertThreshold: 0.005, // 0.5%
      imbalanceAlertThreshold: 0.7, // 70%
      ...config
    };
  }

  public updateOrderBook(data: OrderBookData): void {
    if (!this.isValidSequence(data.sequence_id)) {
      return;
    }

    this.orderBook = {
      ...data,
      asks: this.sortAsks(data.asks.slice(0, this.config.maxDepth!)),
      bids: this.sortBids(data.bids.slice(0, this.config.maxDepth!))
    };

    this.sequenceId = data.sequence_id;
    this.lastUpdateTime = Date.now();
    this.updatePriceHistory();
    
    const analysis = this.analyzeOrderBook();
    this.checkForAlerts(analysis);
    
    this.emit('orderbook_updated', this.orderBook);
    this.emit('orderbook_analysis', analysis);
  }

  public applyDepthDiff(diff: DepthDiffData): void {
    if (!this.orderBook || !this.isValidSequence(diff.sequence_id)) {
      return;
    }

    // Apply ask updates
    diff.asks.forEach(entry => {
      if (parseFloat(entry.amount) === 0) {
        this.removeOrderBookEntry(this.orderBook!.asks, entry.price);
      } else {
        this.updateOrderBookEntry(this.orderBook!.asks, entry);
      }
    });

    // Apply bid updates
    diff.bids.forEach(entry => {
      if (parseFloat(entry.amount) === 0) {
        this.removeOrderBookEntry(this.orderBook!.bids, entry.price);
      } else {
        this.updateOrderBookEntry(this.orderBook!.bids, entry);
      }
    });

    // Re-sort and trim to max depth
    this.orderBook.asks = this.sortAsks(this.orderBook.asks).slice(0, this.config.maxDepth!);
    this.orderBook.bids = this.sortBids(this.orderBook.bids).slice(0, this.config.maxDepth!);
    
    this.sequenceId = diff.sequence_id;
    this.lastUpdateTime = Date.now();
    this.updatePriceHistory();
    
    const analysis = this.analyzeOrderBook();
    this.checkForAlerts(analysis);
    
    this.emit('orderbook_updated', this.orderBook);
    this.emit('orderbook_analysis', analysis);
  }

  private isValidSequence(newSequenceId: number): boolean {
    if (this.sequenceId === 0) {
      return true; // First update
    }
    
    if (newSequenceId <= this.sequenceId) {
      this.emitAlert('system', 'low', 'Out of order sequence received', {
        expected: this.sequenceId + 1,
        received: newSequenceId
      });
      return false;
    }
    
    if (newSequenceId > this.sequenceId + 1) {
      this.emitAlert('system', 'medium', 'Sequence gap detected', {
        expected: this.sequenceId + 1,
        received: newSequenceId,
        gap: newSequenceId - this.sequenceId - 1
      });
    }
    
    return true;
  }

  private sortAsks(asks: OrderBookEntry[]): OrderBookEntry[] {
    return asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  }

  private sortBids(bids: OrderBookEntry[]): OrderBookEntry[] {
    return bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  }

  private updateOrderBookEntry(entries: OrderBookEntry[], newEntry: OrderBookEntry): void {
    const index = entries.findIndex(entry => entry.price === newEntry.price);
    if (index >= 0) {
      entries[index] = newEntry;
    } else {
      entries.push(newEntry);
    }
  }

  private removeOrderBookEntry(entries: OrderBookEntry[], price: string): void {
    const index = entries.findIndex(entry => entry.price === price);
    if (index >= 0) {
      entries.splice(index, 1);
    }
  }

  private updatePriceHistory(): void {
    if (!this.orderBook) return;

    const midPrice = this.calculateMidPrice();
    this.priceHistory.push(midPrice);
    
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }

    const spread = this.calculateSpread();
    this.spreadHistory.push(spread);
    
    if (this.spreadHistory.length > 100) {
      this.spreadHistory.shift();
    }
  }

  private calculateMidPrice(): number {
    if (!this.orderBook || this.orderBook.asks.length === 0 || this.orderBook.bids.length === 0) {
      return 0;
    }

    const bestAsk = parseFloat(this.orderBook.asks[0].price);
    const bestBid = parseFloat(this.orderBook.bids[0].price);
    
    return (bestAsk + bestBid) / 2;
  }

  private calculateSpread(): number {
    if (!this.orderBook || this.orderBook.asks.length === 0 || this.orderBook.bids.length === 0) {
      return 0;
    }

    const bestAsk = parseFloat(this.orderBook.asks[0].price);
    const bestBid = parseFloat(this.orderBook.bids[0].price);
    
    return bestAsk - bestBid;
  }

  private analyzeOrderBook(): OrderBookAnalysis {
    if (!this.orderBook) {
      return this.getEmptyAnalysis();
    }

    const midPrice = this.calculateMidPrice();
    const spread = this.calculateSpread();
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    const totalBidVolume = this.orderBook.bids.reduce((sum, bid) => 
      sum + parseFloat(bid.amount), 0);
    const totalAskVolume = this.orderBook.asks.reduce((sum, ask) => 
      sum + parseFloat(ask.amount), 0);

    const imbalance = totalBidVolume + totalAskVolume > 0 
      ? (totalBidVolume - totalAskVolume) / (totalBidVolume + totalAskVolume) 
      : 0;

    const supportLevel = this.findSupportLevel();
    const resistanceLevel = this.findResistanceLevel();
    const liquidityDepth = this.calculateLiquidityDepth();
    const largeOrders = this.findLargeOrders();

    return {
      bidAskSpread: spread,
      bidAskSpreadPercent: spreadPercent,
      midPrice,
      totalBidVolume,
      totalAskVolume,
      orderBookImbalance: imbalance,
      supportLevel,
      resistanceLevel,
      liquidityDepth,
      largeOrderThreshold: this.config.largeOrderThreshold!,
      largeOrders
    };
  }

  private findSupportLevel(): number {
    if (!this.orderBook || this.orderBook.bids.length === 0) return 0;

    // Find the price level with the highest cumulative volume
    let maxVolume = 0;
    let supportLevel = 0;
    let cumulativeVolume = 0;

    for (const bid of this.orderBook.bids) {
      cumulativeVolume += parseFloat(bid.amount);
      if (cumulativeVolume > maxVolume) {
        maxVolume = cumulativeVolume;
        supportLevel = parseFloat(bid.price);
      }
    }

    return supportLevel;
  }

  private findResistanceLevel(): number {
    if (!this.orderBook || this.orderBook.asks.length === 0) return 0;

    // Find the price level with the highest cumulative volume
    let maxVolume = 0;
    let resistanceLevel = 0;
    let cumulativeVolume = 0;

    for (const ask of this.orderBook.asks) {
      cumulativeVolume += parseFloat(ask.amount);
      if (cumulativeVolume > maxVolume) {
        maxVolume = cumulativeVolume;
        resistanceLevel = parseFloat(ask.price);
      }
    }

    return resistanceLevel;
  }

  private calculateLiquidityDepth(): number {
    if (!this.orderBook) return 0;

    const midPrice = this.calculateMidPrice();
    const threshold = midPrice * 0.01; // 1% from mid price

    let depth = 0;
    
    // Count bids within threshold
    for (const bid of this.orderBook.bids) {
      if (midPrice - parseFloat(bid.price) <= threshold) {
        depth += parseFloat(bid.amount);
      }
    }
    
    // Count asks within threshold
    for (const ask of this.orderBook.asks) {
      if (parseFloat(ask.price) - midPrice <= threshold) {
        depth += parseFloat(ask.amount);
      }
    }

    return depth;
  }

  private findLargeOrders(): { bids: OrderBookEntry[]; asks: OrderBookEntry[] } {
    if (!this.orderBook) {
      return { bids: [], asks: [] };
    }

    const largeBids = this.orderBook.bids.filter(bid => 
      parseFloat(bid.amount) * parseFloat(bid.price) >= this.config.largeOrderThreshold!
    );
    
    const largeAsks = this.orderBook.asks.filter(ask => 
      parseFloat(ask.amount) * parseFloat(ask.price) >= this.config.largeOrderThreshold!
    );

    return { bids: largeBids, asks: largeAsks };
  }

  private checkForAlerts(analysis: OrderBookAnalysis): void {
    // Spread alert
    if (analysis.bidAskSpreadPercent > this.config.spreadAlertThreshold! * 100) {
      this.emitAlert('spread', 'medium', 'Wide bid-ask spread detected', {
        spread: analysis.bidAskSpread,
        spreadPercent: analysis.bidAskSpreadPercent,
        threshold: this.config.spreadAlertThreshold! * 100
      });
    }

    // Imbalance alert
    if (Math.abs(analysis.orderBookImbalance) > this.config.imbalanceAlertThreshold!) {
      this.emitAlert('anomaly', 'medium', 'Order book imbalance detected', {
        imbalance: analysis.orderBookImbalance,
        threshold: this.config.imbalanceAlertThreshold,
        direction: analysis.orderBookImbalance > 0 ? 'buy_heavy' : 'sell_heavy'
      });
    }

    // Large order alert
    if (analysis.largeOrders.bids.length > 0 || analysis.largeOrders.asks.length > 0) {
      this.emitAlert('volume', 'high', 'Large orders detected', {
        largeBids: analysis.largeOrders.bids.length,
        largeAsks: analysis.largeOrders.asks.length,
        threshold: this.config.largeOrderThreshold
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

  private getEmptyAnalysis(): OrderBookAnalysis {
    return {
      bidAskSpread: 0,
      bidAskSpreadPercent: 0,
      midPrice: 0,
      totalBidVolume: 0,
      totalAskVolume: 0,
      orderBookImbalance: 0,
      supportLevel: 0,
      resistanceLevel: 0,
      liquidityDepth: 0,
      largeOrderThreshold: this.config.largeOrderThreshold!,
      largeOrders: { bids: [], asks: [] }
    };
  }

  public getOrderBook(): OrderBookData | null {
    return this.orderBook;
  }

  public getAnalysis(): OrderBookAnalysis {
    return this.analyzeOrderBook();
  }

  public isHealthy(): boolean {
    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdateTime;
    
    return (
      this.orderBook !== null &&
      timeSinceUpdate < 30000 && // Updated within last 30 seconds
      this.orderBook.asks.length > 0 &&
      this.orderBook.bids.length > 0
    );
  }
}