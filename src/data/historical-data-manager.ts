import { HistoricalCandle, BacktestConfig } from '../types/backtest';
import { BitbankClient } from '../api/bitbank-client';
import { BitbankConfig } from '../types/bitbank';
import * as fs from 'fs';
import * as path from 'path';

export interface DataQualityReport {
  totalCandles: number;
  missingCandles: number;
  duplicateCandles: number;
  gapsCount: number;
  gaps: Array<{ start: number; end: number; duration: number }>;
  qualityScore: number;
}

export class HistoricalDataManager {
  private bitbankClient: BitbankClient;
  private dataCache: Map<string, HistoricalCandle[]> = new Map();
  private readonly DATA_DIR = './data/historical';

  constructor(bitbankConfig: BitbankConfig) {
    this.bitbankClient = new BitbankClient(bitbankConfig);
    this.ensureDataDirectory();
  }

  async fetchHistoricalData(
    pair: string,
    timeframe: string,
    startDate: number,
    endDate: number,
    forceRefresh = false
  ): Promise<HistoricalCandle[]> {
    const cacheKey = `${pair}_${timeframe}_${startDate}_${endDate}`;
    
    if (!forceRefresh && this.dataCache.has(cacheKey)) {
      return this.dataCache.get(cacheKey)!;
    }

    const filePath = this.getDataFilePath(pair, timeframe, startDate, endDate);
    
    if (!forceRefresh && fs.existsSync(filePath)) {
      const cachedData = this.loadFromFile(filePath);
      this.dataCache.set(cacheKey, cachedData);
      return cachedData;
    }

    const data = await this.fetchFromBitbank(pair, timeframe, startDate, endDate);
    const processedData = this.processAndValidateData(data);
    
    this.saveToFile(filePath, processedData);
    this.dataCache.set(cacheKey, processedData);
    
    return processedData;
  }

  private async fetchFromBitbank(
    pair: string,
    timeframe: string,
    startDate: number,
    endDate: number
  ): Promise<HistoricalCandle[]> {
    const candles: HistoricalCandle[] = [];
    const intervalMs = this.getIntervalMs(timeframe);
    const maxCandlesPerRequest = 1000;
    
    let currentStart = startDate;
    
    while (currentStart < endDate) {
      const requestEnd = Math.min(
        currentStart + (maxCandlesPerRequest * intervalMs),
        endDate
      );
      
      try {
        // Mock implementation - replace with actual Bitbank API call
        // const response = await this.bitbankClient.getCandlestickData(
        //   pair, timeframe, currentStart, requestEnd
        // );
        
        // For now, generate mock data for testing
        const mockCandles = this.generateMockData(currentStart, requestEnd, intervalMs);
        candles.push(...mockCandles);
        
        currentStart = requestEnd;
        
        // Rate limiting
        await this.sleep(100);
      } catch (error) {
        throw new Error(`Failed to fetch data from Bitbank: ${error}`);
      }
    }
    
    return candles.sort((a, b) => a.timestamp - b.timestamp);
  }

  private generateMockData(
    startTime: number,
    endTime: number,
    intervalMs: number
  ): HistoricalCandle[] {
    const candles: HistoricalCandle[] = [];
    let currentTime = startTime;
    let currentPrice = 4000000; // Starting price around 4M JPY for BTC
    
    while (currentTime < endTime) {
      const volatility = 0.02;
      const trend = (Math.random() - 0.5) * 0.001;
      const noise = (Math.random() - 0.5) * volatility;
      
      const priceChange = currentPrice * (trend + noise);
      const open = currentPrice;
      const close = currentPrice + priceChange;
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = 1000 + Math.random() * 5000;
      
      candles.push({
        timestamp: currentTime,
        open,
        high,
        low,
        close,
        volume
      });
      
      currentPrice = close;
      currentTime += intervalMs;
    }
    
    return candles;
  }

  analyzeDataQuality(data: HistoricalCandle[]): DataQualityReport {
    if (data.length === 0) {
      return {
        totalCandles: 0,
        missingCandles: 0,
        duplicateCandles: 0,
        gapsCount: 0,
        gaps: [],
        qualityScore: 0
      };
    }

    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const timeframe = this.detectTimeframe(sortedData);
    const expectedInterval = this.getIntervalMs(timeframe);
    
    let missingCandles = 0;
    let duplicateCandles = 0;
    const gaps: Array<{ start: number; end: number; duration: number }> = [];
    const timestampSet = new Set<number>();
    
    for (let i = 0; i < sortedData.length; i++) {
      const current = sortedData[i];
      
      // Check for duplicates
      if (timestampSet.has(current.timestamp)) {
        duplicateCandles++;
      } else {
        timestampSet.add(current.timestamp);
      }
      
      // Check for gaps
      if (i > 0) {
        const previous = sortedData[i - 1];
        const timeDiff = current.timestamp - previous.timestamp;
        
        if (timeDiff > expectedInterval * 1.5) {
          const missingCount = Math.floor(timeDiff / expectedInterval) - 1;
          missingCandles += missingCount;
          
          if (missingCount > 0) {
            gaps.push({
              start: previous.timestamp,
              end: current.timestamp,
              duration: timeDiff
            });
          }
        }
      }
    }
    
    const totalExpectedCandles = Math.floor(
      (sortedData[sortedData.length - 1].timestamp - sortedData[0].timestamp) / expectedInterval
    ) + 1;
    
    const qualityScore = Math.max(0, 
      (totalExpectedCandles - missingCandles - duplicateCandles) / totalExpectedCandles
    );
    
    return {
      totalCandles: sortedData.length,
      missingCandles,
      duplicateCandles,
      gapsCount: gaps.length,
      gaps,
      qualityScore
    };
  }

  fillDataGaps(data: HistoricalCandle[]): HistoricalCandle[] {
    if (data.length < 2) return data;
    
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const timeframe = this.detectTimeframe(sortedData);
    const expectedInterval = this.getIntervalMs(timeframe);
    const filledData: HistoricalCandle[] = [];
    
    for (let i = 0; i < sortedData.length; i++) {
      filledData.push(sortedData[i]);
      
      if (i < sortedData.length - 1) {
        const current = sortedData[i];
        const next = sortedData[i + 1];
        const timeDiff = next.timestamp - current.timestamp;
        
        if (timeDiff > expectedInterval * 1.5) {
          // Fill gap with interpolated data
          const missingCount = Math.floor(timeDiff / expectedInterval) - 1;
          
          for (let j = 1; j <= missingCount; j++) {
            const interpolatedTimestamp = current.timestamp + (j * expectedInterval);
            const ratio = j / (missingCount + 1);
            
            // Linear interpolation for prices
            const interpolatedPrice = current.close + (next.open - current.close) * ratio;
            
            filledData.push({
              timestamp: interpolatedTimestamp,
              open: interpolatedPrice,
              high: interpolatedPrice * (1 + Math.random() * 0.005),
              low: interpolatedPrice * (1 - Math.random() * 0.005),
              close: interpolatedPrice,
              volume: (current.volume + next.volume) / 2
            });
          }
        }
      }
    }
    
    return filledData.sort((a, b) => a.timestamp - b.timestamp);
  }

  exportData(data: HistoricalCandle[], format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const header = 'timestamp,open,high,low,close,volume\n';
      const rows = data.map(candle => 
        `${candle.timestamp},${candle.open},${candle.high},${candle.low},${candle.close},${candle.volume}`
      ).join('\n');
      return header + rows;
    }
    
    return JSON.stringify(data, null, 2);
  }

  private detectTimeframe(data: HistoricalCandle[]): string {
    if (data.length < 2) return '1m';
    
    const intervals = [];
    for (let i = 1; i < Math.min(10, data.length); i++) {
      intervals.push(data[i].timestamp - data[i - 1].timestamp);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    if (avgInterval <= 70000) return '1m'; // 1 minute + buffer
    if (avgInterval <= 350000) return '5m'; // 5 minutes + buffer
    if (avgInterval <= 950000) return '15m'; // 15 minutes + buffer
    if (avgInterval <= 1900000) return '30m'; // 30 minutes + buffer
    if (avgInterval <= 3700000) return '1h'; // 1 hour + buffer
    if (avgInterval <= 14800000) return '4h'; // 4 hours + buffer
    return '1d'; // 1 day
  }

  private getIntervalMs(timeframe: string): number {
    const intervals: { [key: string]: number } = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    return intervals[timeframe] || intervals['1m'];
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.DATA_DIR)) {
      fs.mkdirSync(this.DATA_DIR, { recursive: true });
    }
  }

  private getDataFilePath(
    pair: string,
    timeframe: string,
    startDate: number,
    endDate: number
  ): string {
    return path.join(
      this.DATA_DIR,
      `${pair}_${timeframe}_${startDate}_${endDate}.json`
    );
  }

  private saveToFile(filePath: string, data: HistoricalCandle[]): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  private loadFromFile(filePath: string): HistoricalCandle[] {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }

  private processAndValidateData(data: HistoricalCandle[]): HistoricalCandle[] {
    // Remove invalid data points
    const validData = data.filter(candle => 
      candle.timestamp > 0 &&
      candle.open > 0 &&
      candle.high > 0 &&
      candle.low > 0 &&
      candle.close > 0 &&
      candle.volume >= 0 &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close)
    );
    
    // Sort by timestamp and remove duplicates
    const uniqueData = validData
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((candle, index, array) => 
        index === 0 || candle.timestamp !== array[index - 1].timestamp
      );
    
    return uniqueData;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}