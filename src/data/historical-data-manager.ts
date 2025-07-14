import { BitbankClient } from '../api/bitbank-client';
import { CandleData, HistoricalDataPoint, DataQuality } from '../types/backtest';
import { BitbankConfig } from '../types/bitbank';
import * as fs from 'fs';
import * as path from 'path';

export class HistoricalDataManager {
  private client: BitbankClient;
  private dataDirectory: string;
  private dataCache: Map<string, HistoricalDataPoint[]> = new Map();

  constructor(config: BitbankConfig, dataDirectory: string = './data') {
    this.client = new BitbankClient(config);
    this.dataDirectory = dataDirectory;
    this.ensureDataDirectory();
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDirectory)) {
      fs.mkdirSync(this.dataDirectory, { recursive: true });
    }
  }

  private getDataFilePath(pair: string, timeframe: string): string {
    return path.join(this.dataDirectory, `${pair}_${timeframe}.json`);
  }

  private getCacheKey(pair: string, timeframe: string): string {
    return `${pair}_${timeframe}`;
  }

  async fetchHistoricalData(
    pair: string,
    timeframe: string,
    startDate: number,
    endDate: number
  ): Promise<HistoricalDataPoint[]> {
    const cacheKey = this.getCacheKey(pair, timeframe);
    
    // Check cache first
    if (this.dataCache.has(cacheKey)) {
      const cachedData = this.dataCache.get(cacheKey)!;
      return this.filterDataByDateRange(cachedData, startDate, endDate);
    }

    // Try to load from file
    const filePath = this.getDataFilePath(pair, timeframe);
    if (fs.existsSync(filePath)) {
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.dataCache.set(cacheKey, fileData);
      return this.filterDataByDateRange(fileData, startDate, endDate);
    }

    // Fetch from API (simulated for now since Bitbank API doesn't provide historical data)
    const historicalData = await this.fetchFromAPI(pair, timeframe, startDate, endDate);
    
    // Cache and save to file
    this.dataCache.set(cacheKey, historicalData);
    fs.writeFileSync(filePath, JSON.stringify(historicalData, null, 2));
    
    return historicalData;
  }

  private async fetchFromAPI(
    pair: string,
    timeframe: string,
    startDate: number,
    endDate: number
  ): Promise<HistoricalDataPoint[]> {
    // Since Bitbank doesn't provide historical OHLCV data in their public API,
    // we'll simulate historical data for backtesting purposes
    // In a real implementation, you would integrate with a data provider
    // like CoinGecko, CryptoCompare, or Alpha Vantage
    
    console.log(`Simulating historical data for ${pair} from ${new Date(startDate)} to ${new Date(endDate)}`);
    
    const data: HistoricalDataPoint[] = [];
    const intervalMs = this.getIntervalMs(timeframe);
    
    // Get current price as reference
    const currentTicker = await this.client.getTicker(pair);
    const basePrice = parseFloat(currentTicker.last);
    
    // Generate simulated historical data with realistic price movements
    let currentPrice = basePrice;
    let currentTime = startDate;
    
    while (currentTime <= endDate) {
      // Simulate price movement with some randomness
      const randomFactor = (Math.random() - 0.5) * 0.02; // ±1% random movement
      const trendFactor = Math.sin(currentTime / (24 * 60 * 60 * 1000)) * 0.001; // Daily trend
      
      currentPrice *= (1 + randomFactor + trendFactor);
      
      // Calculate OHLC values
      const open = currentPrice;
      const high = currentPrice * (1 + Math.random() * 0.01);
      const low = currentPrice * (1 - Math.random() * 0.01);
      const close = currentPrice + (Math.random() - 0.5) * currentPrice * 0.005;
      
      currentPrice = close;
      
      // Simulate volume
      const volume = 1000 + Math.random() * 5000;
      
      data.push({
        timestamp: currentTime,
        price: close,
        volume: volume,
        buy: close * 1.001,
        sell: close * 0.999,
        high: high,
        low: low
      });
      
      currentTime += intervalMs;
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
      '1d': 24 * 60 * 60 * 1000,
    };
    
    return intervals[timeframe] || 60 * 1000;
  }

  private filterDataByDateRange(
    data: HistoricalDataPoint[],
    startDate: number,
    endDate: number
  ): HistoricalDataPoint[] {
    return data.filter(point => 
      point.timestamp >= startDate && point.timestamp <= endDate
    );
  }

  async updateData(pair: string, timeframe: string): Promise<void> {
    const cacheKey = this.getCacheKey(pair, timeframe);
    const filePath = this.getDataFilePath(pair, timeframe);
    
    let existingData: HistoricalDataPoint[] = [];
    
    if (fs.existsSync(filePath)) {
      existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    
    // Get the last timestamp from existing data
    const lastTimestamp = existingData.length > 0 
      ? Math.max(...existingData.map(d => d.timestamp))
      : Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
    
    // Fetch new data from the last timestamp to now
    const newData = await this.fetchFromAPI(pair, timeframe, lastTimestamp, Date.now());
    
    // Merge data, avoiding duplicates
    const mergedData = this.mergeData(existingData, newData);
    
    // Update cache and file
    this.dataCache.set(cacheKey, mergedData);
    fs.writeFileSync(filePath, JSON.stringify(mergedData, null, 2));
  }

  private mergeData(
    existingData: HistoricalDataPoint[],
    newData: HistoricalDataPoint[]
  ): HistoricalDataPoint[] {
    const merged = [...existingData];
    const existingTimestamps = new Set(existingData.map(d => d.timestamp));
    
    for (const newPoint of newData) {
      if (!existingTimestamps.has(newPoint.timestamp)) {
        merged.push(newPoint);
      }
    }
    
    // Sort by timestamp
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }

  analyzeDataQuality(data: HistoricalDataPoint[]): DataQuality {
    const totalPoints = data.length;
    let missingPoints = 0;
    let duplicatePoints = 0;
    let invalidPoints = 0;
    const dataGaps: Array<{ start: number; end: number; duration: number }> = [];
    
    if (totalPoints === 0) {
      return {
        totalPoints: 0,
        missingPoints: 0,
        duplicatePoints: 0,
        invalidPoints: 0,
        dataGaps: [],
        qualityScore: 0
      };
    }
    
    // Check for duplicates
    const timestamps = new Set<number>();
    for (const point of data) {
      if (timestamps.has(point.timestamp)) {
        duplicatePoints++;
      } else {
        timestamps.add(point.timestamp);
      }
    }
    
    // Check for invalid data
    for (const point of data) {
      if (point.price <= 0 || point.volume < 0 || isNaN(point.price) || isNaN(point.volume)) {
        invalidPoints++;
      }
    }
    
    // Check for gaps (assuming 1-minute intervals)
    const expectedInterval = 60 * 1000; // 1 minute
    let currentGapStart: number | null = null;
    
    for (let i = 1; i < data.length; i++) {
      const gap = data[i].timestamp - data[i - 1].timestamp;
      
      if (gap > expectedInterval * 2) { // Gap larger than 2 intervals
        if (currentGapStart === null) {
          currentGapStart = data[i - 1].timestamp;
        }
      } else if (currentGapStart !== null) {
        dataGaps.push({
          start: currentGapStart,
          end: data[i - 1].timestamp,
          duration: data[i - 1].timestamp - currentGapStart
        });
        currentGapStart = null;
      }
    }
    
    // Calculate missing points based on expected interval
    const timeSpan = data[data.length - 1].timestamp - data[0].timestamp;
    const expectedPoints = Math.floor(timeSpan / expectedInterval);
    missingPoints = Math.max(0, expectedPoints - totalPoints);
    
    // Calculate quality score (0-1)
    const qualityScore = Math.max(0, 1 - (
      (missingPoints / expectedPoints) * 0.4 +
      (duplicatePoints / totalPoints) * 0.3 +
      (invalidPoints / totalPoints) * 0.3
    ));
    
    return {
      totalPoints,
      missingPoints,
      duplicatePoints,
      invalidPoints,
      dataGaps,
      qualityScore
    };
  }

  fillDataGaps(data: HistoricalDataPoint[]): HistoricalDataPoint[] {
    if (data.length < 2) return data;
    
    const filled: HistoricalDataPoint[] = [];
    const expectedInterval = 60 * 1000; // 1 minute
    
    for (let i = 0; i < data.length - 1; i++) {
      filled.push(data[i]);
      
      const gap = data[i + 1].timestamp - data[i].timestamp;
      
      if (gap > expectedInterval * 1.5) {
        // Fill the gap with interpolated values
        const gapDuration = gap - expectedInterval;
        const intervals = Math.floor(gapDuration / expectedInterval);
        
        for (let j = 1; j <= intervals; j++) {
          const interpolationFactor = j / (intervals + 1);
          const interpolatedTimestamp = data[i].timestamp + (j * expectedInterval);
          
          // Linear interpolation
          const interpolatedPrice = data[i].price + 
            (data[i + 1].price - data[i].price) * interpolationFactor;
          
          filled.push({
            timestamp: interpolatedTimestamp,
            price: interpolatedPrice,
            volume: (data[i].volume + data[i + 1].volume) / 2,
            buy: interpolatedPrice * 1.001,
            sell: interpolatedPrice * 0.999,
            high: interpolatedPrice * 1.002,
            low: interpolatedPrice * 0.998
          });
        }
      }
    }
    
    // Add the last point
    filled.push(data[data.length - 1]);
    
    return filled;
  }

  clearCache(): void {
    this.dataCache.clear();
  }

  getDataInfo(pair: string, timeframe: string): { exists: boolean; points: number; range?: { start: number; end: number } } {
    const cacheKey = this.getCacheKey(pair, timeframe);
    const data = this.dataCache.get(cacheKey);
    
    if (!data || data.length === 0) {
      return { exists: false, points: 0 };
    }
    
    return {
      exists: true,
      points: data.length,
      range: {
        start: data[0].timestamp,
        end: data[data.length - 1].timestamp
      }
    };
  }

  exportData(pair: string, timeframe: string, format: 'json' | 'csv' = 'json'): string {
    const cacheKey = this.getCacheKey(pair, timeframe);
    const data = this.dataCache.get(cacheKey);
    
    if (!data) {
      throw new Error(`No data found for ${pair} ${timeframe}`);
    }
    
    if (format === 'csv') {
      const header = 'timestamp,price,volume,buy,sell,high,low\n';
      const rows = data.map(point => 
        `${point.timestamp},${point.price},${point.volume},${point.buy},${point.sell},${point.high},${point.low}`
      ).join('\n');
      return header + rows;
    }
    
    return JSON.stringify(data, null, 2);
  }
}