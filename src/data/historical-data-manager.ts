import { promises as fs } from 'fs';
import { join } from 'path';
import { BitbankClient } from '../api/bitbank-client';
import { BitbankConfig } from '../types/bitbank';
import {
  HistoricalDataPoint,
  HistoricalDataConfig,
  DataQuality,
  DataGap,
  DataOutlier
} from '../types/backtest';

export class HistoricalDataManager {
  private bitbankClient: BitbankClient;
  private config: HistoricalDataConfig;
  private dataCache: Map<string, HistoricalDataPoint[]> = new Map();
  private readonly DATA_DIR = 'data';
  private readonly CACHE_DIR = 'cache';

  constructor(bitbankConfig: BitbankConfig, config: HistoricalDataConfig) {
    this.bitbankClient = new BitbankClient(bitbankConfig);
    this.config = config;
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.DATA_DIR, { recursive: true });
      await fs.mkdir(this.CACHE_DIR, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async fetchHistoricalData(
    pair: string,
    timeframe: string,
    startDate: number,
    endDate: number
  ): Promise<HistoricalDataPoint[]> {
    const cacheKey = `${pair}_${timeframe}_${startDate}_${endDate}`;
    
    if (this.dataCache.has(cacheKey)) {
      return this.dataCache.get(cacheKey)!;
    }

    const cachedData = await this.loadFromCache(cacheKey);
    if (cachedData) {
      this.dataCache.set(cacheKey, cachedData);
      return cachedData;
    }

    const data = await this.fetchFromBitbank(pair, timeframe, startDate, endDate);
    await this.saveToCache(cacheKey, data);
    this.dataCache.set(cacheKey, data);
    
    return data;
  }

  private async fetchFromBitbank(
    pair: string,
    timeframe: string,
    startDate: number,
    endDate: number
  ): Promise<HistoricalDataPoint[]> {
    const data: HistoricalDataPoint[] = [];
    const intervalMs = this.getIntervalMs(timeframe);
    const maxRetries = this.config.maxRetries || 3;
    const retryDelay = this.config.retryDelay || 1000;

    for (let timestamp = startDate; timestamp <= endDate; timestamp += intervalMs) {
      let retries = 0;
      
      while (retries < maxRetries) {
        try {
          const ticker = await this.bitbankClient.getTicker(pair);
          const price = parseFloat(ticker.last);
          const volume = parseFloat(ticker.vol);
          
          data.push({
            timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
            volume
          });
          
          break;
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            // Failed to fetch data
            break;
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      if (this.config.fetchInterval) {
        await new Promise(resolve => setTimeout(resolve, this.config.fetchInterval));
      }
    }

    return data;
  }

  private getIntervalMs(timeframe: string): number {
    const intervals: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    
    return intervals[timeframe] || intervals['1m']!;
  }

  async loadFromCache(key: string): Promise<HistoricalDataPoint[] | null> {
    try {
      const filePath = join(this.CACHE_DIR, `${key}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async saveToCache(key: string, data: HistoricalDataPoint[]): Promise<void> {
    try {
      const filePath = join(this.CACHE_DIR, `${key}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      // Failed to save to cache
    }
  }

  async exportData(
    data: HistoricalDataPoint[],
    format: 'json' | 'csv',
    filename: string
  ): Promise<string> {
    const filePath = join(this.DATA_DIR, `${filename}.${format}`);
    
    if (format === 'json') {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } else {
      const csvContent = this.convertToCSV(data);
      await fs.writeFile(filePath, csvContent);
    }
    
    return filePath;
  }

  private convertToCSV(data: HistoricalDataPoint[]): string {
    const headers = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
    const rows = data.map(point => [
      point.timestamp,
      point.open,
      point.high,
      point.low,
      point.close,
      point.volume
    ]);
    
    return [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
  }

  analyzeDataQuality(data: HistoricalDataPoint[]): DataQuality {
    const gaps = this.findDataGaps(data);
    const outliers = this.findDataOutliers(data);
    
    const completeness = this.calculateCompleteness(data, gaps);
    const consistency = this.calculateConsistency(data);
    const accuracy = this.calculateAccuracy(data, outliers);
    
    const quality = (completeness + consistency + accuracy) / 3;
    
    return {
      gaps,
      outliers,
      quality,
      completeness,
      consistency,
      accuracy
    };
  }

  private findDataGaps(data: HistoricalDataPoint[]): DataGap[] {
    const gaps: DataGap[] = [];
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    
    for (let i = 1; i < sortedData.length; i++) {
      const current = sortedData[i];
      const previous = sortedData[i - 1];
      const expectedInterval = this.getIntervalMs(this.config.timeframes[0]!);
      const actualInterval = current.timestamp - previous.timestamp;
      
      if (actualInterval > expectedInterval * 1.5) {
        const duration = actualInterval - expectedInterval;
        gaps.push({
          start: previous.timestamp,
          end: current.timestamp,
          duration,
          severity: this.classifyGapSeverity(duration, expectedInterval)
        });
      }
    }
    
    return gaps;
  }

  private findDataOutliers(data: HistoricalDataPoint[]): DataOutlier[] {
    const outliers: DataOutlier[] = [];
    const prices = data.map(d => d.close);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    
    data.forEach(point => {
      const deviation = Math.abs(point.close - mean);
      const zScore = deviation / stdDev;
      
      if (zScore > 3) {
        outliers.push({
          timestamp: point.timestamp,
          value: point.close,
          expectedValue: mean,
          deviation,
          severity: zScore > 5 ? 'critical' : zScore > 4 ? 'major' : 'minor'
        });
      }
    });
    
    return outliers;
  }

  private calculateCompleteness(data: HistoricalDataPoint[], gaps: DataGap[]): number {
    const totalDuration = this.config.endDate - this.config.startDate;
    const gapDuration = gaps.reduce((sum, gap) => sum + gap.duration, 0);
    return Math.max(0, (totalDuration - gapDuration) / totalDuration);
  }

  private calculateConsistency(data: HistoricalDataPoint[]): number {
    let consistentPoints = 0;
    
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      
      if (
        point.high >= point.low &&
        point.high >= point.open &&
        point.high >= point.close &&
        point.low <= point.open &&
        point.low <= point.close &&
        point.volume >= 0
      ) {
        consistentPoints++;
      }
    }
    
    return data.length > 0 ? consistentPoints / data.length : 0;
  }

  private calculateAccuracy(data: HistoricalDataPoint[], outliers: DataOutlier[]): number {
    const criticalOutliers = outliers.filter(o => o.severity === 'critical').length;
    const majorOutliers = outliers.filter(o => o.severity === 'major').length;
    const minorOutliers = outliers.filter(o => o.severity === 'minor').length;
    
    const accuracyScore = 1 - (
      (criticalOutliers * 0.3 + majorOutliers * 0.2 + minorOutliers * 0.1) / data.length
    );
    
    return Math.max(0, accuracyScore);
  }

  private classifyGapSeverity(duration: number, expectedInterval: number): 'minor' | 'major' | 'critical' {
    const ratio = duration / expectedInterval;
    
    if (ratio < 3) return 'minor';
    if (ratio < 10) return 'major';
    return 'critical';
  }

  fillDataGaps(data: HistoricalDataPoint[]): HistoricalDataPoint[] {
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const filledData: HistoricalDataPoint[] = [];
    const intervalMs = this.getIntervalMs(this.config.timeframes[0]!);
    
    for (let i = 0; i < sortedData.length - 1; i++) {
      const current = sortedData[i];
      const next = sortedData[i + 1];
      
      filledData.push(current);
      
      const timeDiff = next.timestamp - current.timestamp;
      const missingPoints = Math.floor(timeDiff / intervalMs) - 1;
      
      if (missingPoints > 0) {
        for (let j = 1; j <= missingPoints; j++) {
          const interpolatedTimestamp = current.timestamp + (j * intervalMs);
          const ratio = j / (missingPoints + 1);
          
          filledData.push({
            timestamp: interpolatedTimestamp,
            open: this.interpolateValue(current.close, next.open, ratio),
            high: Math.max(current.close, next.open),
            low: Math.min(current.close, next.open),
            close: this.interpolateValue(current.close, next.open, ratio),
            volume: this.interpolateValue(current.volume, next.volume, ratio)
          });
        }
      }
    }
    
    if (sortedData.length > 0) {
      filledData.push(sortedData[sortedData.length - 1]);
    }
    
    return filledData;
  }

  private interpolateValue(start: number, end: number, ratio: number): number {
    return start + (end - start) * ratio;
  }

  async clearCache(): Promise<void> {
    this.dataCache.clear();
    try {
      const files = await fs.readdir(this.CACHE_DIR);
      for (const file of files) {
        await fs.unlink(join(this.CACHE_DIR, file));
      }
    } catch (error) {
      // Failed to clear cache
    }
  }

  getDataStatistics(data: HistoricalDataPoint[]): Record<string, number> {
    if (data.length === 0) return {};
    
    const prices = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    
    return {
      totalPoints: data.length,
      startDate: Math.min(...data.map(d => d.timestamp)),
      endDate: Math.max(...data.map(d => d.timestamp)),
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgVolume: volumes.reduce((a, b) => a + b, 0) / volumes.length,
      minVolume: Math.min(...volumes),
      maxVolume: Math.max(...volumes),
      priceVolatility: this.calculateVolatility(prices),
      priceRange: Math.max(...prices) - Math.min(...prices)
    };
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }
}