import { EventEmitter } from 'events';
import {
  TransactionData,
  VolumeAnalysis,
  MarketAlert
} from '../types/bitbank';

interface VolumeAnalyzerConfig {
  volumeWindow?: number;
  volumeSpikeThreshold?: number;
  profilePeriod?: number;
  twapWindow?: number;
  vwapWindow?: number;
  institutionalThreshold?: number;
}

interface VolumeProfileEntry {
  price: number;
  volume: number;
  transactions: number;
  timestamp: number;
}

export class VolumeAnalyzer extends EventEmitter {
  private transactions: TransactionData[] = [];
  private volumeHistory: number[] = [];
  private volumeProfile: Map<number, VolumeProfileEntry> = new Map();
  private config: VolumeAnalyzerConfig;
  private priceRanges: Map<number, number[]> = new Map();
  private lastAnalysis: VolumeAnalysis | null = null;

  constructor(config: VolumeAnalyzerConfig = {}) {
    super();
    this.config = {
      volumeWindow: 100,
      volumeSpikeThreshold: 2.0,
      profilePeriod: 3600000, // 1 hour
      twapWindow: 300000, // 5 minutes
      vwapWindow: 900000, // 15 minutes
      institutionalThreshold: 5000000, // 5M JPY
      ...config
    };
  }

  public addTransaction(transaction: TransactionData): void {
    this.transactions.push(transaction);
    this.cleanupOldTransactions();
    
    const volume = parseFloat(transaction.amount);
    this.volumeHistory.push(volume);
    
    if (this.volumeHistory.length > this.config.volumeWindow!) {
      this.volumeHistory.shift();
    }
    
    this.updateVolumeProfile(transaction);
    
    const analysis = this.analyzeVolume();
    this.checkForAlerts(analysis);
    
    this.lastAnalysis = analysis;
    this.emit('volume_analysis', analysis);
  }

  private cleanupOldTransactions(): void {
    const cutoffTime = Date.now() - this.config.vwapWindow!;
    this.transactions = this.transactions.filter(tx => tx.executed_at > cutoffTime);
  }

  private updateVolumeProfile(transaction: TransactionData): void {
    const price = parseFloat(transaction.price);
    const volume = parseFloat(transaction.amount);
    const priceLevel = Math.round(price / 1000) * 1000; // Round to nearest 1000 JPY
    
    if (this.volumeProfile.has(priceLevel)) {
      const entry = this.volumeProfile.get(priceLevel)!;
      entry.volume += volume;
      entry.transactions++;
      entry.timestamp = transaction.executed_at;
    } else {
      this.volumeProfile.set(priceLevel, {
        price: priceLevel,
        volume,
        transactions: 1,
        timestamp: transaction.executed_at
      });
    }
    
    // Clean up old profile entries
    const cutoffTime = Date.now() - this.config.profilePeriod!;
    for (const [priceLevel, entry] of this.volumeProfile.entries()) {
      if (entry.timestamp < cutoffTime) {
        this.volumeProfile.delete(priceLevel);
      }
    }
  }

  private analyzeVolume(): VolumeAnalysis {
    const currentVolume = this.calculateCurrentVolume();
    const volumeMA = this.calculateVolumeMA();
    const volumeSpike = this.detectVolumeSpike(currentVolume, volumeMA);
    const volumeProfile = this.getVolumeProfile();
    const twap = this.calculateTWAP();
    const vwap = this.calculateVWAP();
    const institutionalActivity = this.calculateInstitutionalActivity();

    return {
      currentVolume,
      volumeMA,
      volumeSpike,
      volumeProfile,
      twap,
      vwap,
      institutionalActivity
    };
  }

  private calculateCurrentVolume(): number {
    if (this.transactions.length === 0) return 0;
    
    const recentTransactions = this.transactions.filter(tx => 
      tx.executed_at > Date.now() - 60000 // Last minute
    );
    
    return recentTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  }

  private calculateVolumeMA(): number {
    if (this.volumeHistory.length === 0) return 0;
    
    const sum = this.volumeHistory.reduce((acc, vol) => acc + vol, 0);
    return sum / this.volumeHistory.length;
  }

  private detectVolumeSpike(currentVolume: number, volumeMA: number): boolean {
    return currentVolume > volumeMA * this.config.volumeSpikeThreshold!;
  }

  private getVolumeProfile(): { price: number; volume: number }[] {
    return Array.from(this.volumeProfile.values())
      .map(entry => ({ price: entry.price, volume: entry.volume }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 20); // Top 20 price levels
  }

  private calculateTWAP(): number {
    const cutoffTime = Date.now() - this.config.twapWindow!;
    const recentTransactions = this.transactions.filter(tx => tx.executed_at > cutoffTime);
    
    if (recentTransactions.length === 0) return 0;
    
    const timeWeightedSum = recentTransactions.reduce((sum, tx, index) => {
      const price = parseFloat(tx.price);
      const weight = index + 1; // Simple time weight
      return sum + (price * weight);
    }, 0);
    
    const totalWeight = recentTransactions.length * (recentTransactions.length + 1) / 2;
    
    return timeWeightedSum / totalWeight;
  }

  private calculateVWAP(): number {
    const cutoffTime = Date.now() - this.config.vwapWindow!;
    const recentTransactions = this.transactions.filter(tx => tx.executed_at > cutoffTime);
    
    if (recentTransactions.length === 0) return 0;
    
    let totalVolumePrice = 0;
    let totalVolume = 0;
    
    for (const tx of recentTransactions) {
      const price = parseFloat(tx.price);
      const volume = parseFloat(tx.amount);
      totalVolumePrice += price * volume;
      totalVolume += volume;
    }
    
    return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
  }

  private calculateInstitutionalActivity(): number {
    const cutoffTime = Date.now() - this.config.vwapWindow!;
    const recentTransactions = this.transactions.filter(tx => tx.executed_at > cutoffTime);
    
    const largeTransactions = recentTransactions.filter(tx => {
      const tradeValue = parseFloat(tx.price) * parseFloat(tx.amount);
      return tradeValue >= this.config.institutionalThreshold!;
    });
    
    const largeVolume = largeTransactions.reduce((sum, tx) => 
      sum + parseFloat(tx.amount), 0);
    
    const totalVolume = recentTransactions.reduce((sum, tx) => 
      sum + parseFloat(tx.amount), 0);
    
    return totalVolume > 0 ? largeVolume / totalVolume : 0;
  }

  private checkForAlerts(analysis: VolumeAnalysis): void {
    // Volume spike alert
    if (analysis.volumeSpike) {
      this.emitAlert('volume', 'high', 'Volume spike detected', {
        currentVolume: analysis.currentVolume,
        volumeMA: analysis.volumeMA,
        threshold: this.config.volumeSpikeThreshold
      });
    }

    // Institutional activity alert
    if (analysis.institutionalActivity > 0.5) {
      this.emitAlert('volume', 'medium', 'High institutional activity detected', {
        institutionalActivity: analysis.institutionalActivity,
        threshold: 0.5
      });
    }

    // Abnormal TWAP/VWAP divergence
    if (analysis.twap > 0 && analysis.vwap > 0) {
      const divergence = Math.abs(analysis.twap - analysis.vwap) / analysis.vwap;
      if (divergence > 0.01) { // 1% divergence
        this.emitAlert('anomaly', 'medium', 'TWAP/VWAP divergence detected', {
          twap: analysis.twap,
          vwap: analysis.vwap,
          divergence: divergence * 100
        });
      }
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

  public getAnalysis(): VolumeAnalysis | null {
    return this.lastAnalysis;
  }

  public getTransactionHistory(): TransactionData[] {
    return [...this.transactions];
  }

  public getVolumeHistory(): number[] {
    return [...this.volumeHistory];
  }

  public getVolumeStats(): {
    totalTransactions: number;
    totalVolume: number;
    averageTradeSize: number;
    maxTradeSize: number;
    minTradeSize: number;
  } {
    if (this.transactions.length === 0) {
      return {
        totalTransactions: 0,
        totalVolume: 0,
        averageTradeSize: 0,
        maxTradeSize: 0,
        minTradeSize: 0
      };
    }

    const volumes = this.transactions.map(tx => parseFloat(tx.amount));
    const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
    const maxTradeSize = Math.max(...volumes);
    const minTradeSize = Math.min(...volumes);
    const averageTradeSize = totalVolume / volumes.length;

    return {
      totalTransactions: this.transactions.length,
      totalVolume,
      averageTradeSize,
      maxTradeSize,
      minTradeSize
    };
  }

  public detectAnomalousVolume(): {
    isAnomalous: boolean;
    reason: string;
    score: number;
  } {
    const stats = this.getVolumeStats();
    const analysis = this.lastAnalysis;
    
    if (!analysis || stats.totalTransactions < 10) {
      return { isAnomalous: false, reason: 'Insufficient data', score: 0 };
    }

    let anomalyScore = 0;
    const reasons: string[] = [];

    // Check for volume spike
    if (analysis.volumeSpike) {
      anomalyScore += 0.4;
      reasons.push('Volume spike detected');
    }

    // Check for institutional activity
    if (analysis.institutionalActivity > 0.3) {
      anomalyScore += 0.3;
      reasons.push('High institutional activity');
    }

    // Check for unusual trade sizes
    if (stats.maxTradeSize > stats.averageTradeSize * 10) {
      anomalyScore += 0.2;
      reasons.push('Unusually large trade detected');
    }

    // Check for transaction frequency
    const recentTransactions = this.transactions.filter(tx => 
      tx.executed_at > Date.now() - 60000
    );
    
    if (recentTransactions.length > 50) {
      anomalyScore += 0.1;
      reasons.push('High transaction frequency');
    }

    return {
      isAnomalous: anomalyScore > 0.5,
      reason: reasons.join(', '),
      score: anomalyScore
    };
  }

  public isHealthy(): boolean {
    return (
      this.transactions.length > 0 &&
      this.volumeHistory.length > 0 &&
      this.lastAnalysis !== null
    );
  }
}