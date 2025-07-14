import { HistoricalDataManager } from '../data/historical-data-manager';
import { BitbankConfig } from '../types/bitbank';
import { HistoricalCandle } from '../types/backtest';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('HistoricalDataManager', () => {
  let dataManager: HistoricalDataManager;
  let bitbankConfig: BitbankConfig;

  beforeEach(() => {
    bitbankConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      baseUrl: 'https://api.bitbank.cc'
    };

    dataManager = new HistoricalDataManager(bitbankConfig);

    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation();
    mockFs.writeFileSync.mockImplementation();
    mockFs.readFileSync.mockReturnValue('[]');
  });

  describe('fetchHistoricalData', () => {
    it('should fetch and return historical data', async () => {
      const startDate = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
      const endDate = Date.now();

      const result = await dataManager.fetchHistoricalData(
        'btc_jpy',
        '1m',
        startDate,
        endDate
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify data structure
      if (result.length > 0) {
        const candle = result[0];
        expect(candle).toHaveProperty('timestamp');
        expect(candle).toHaveProperty('open');
        expect(candle).toHaveProperty('high');
        expect(candle).toHaveProperty('low');
        expect(candle).toHaveProperty('close');
        expect(candle).toHaveProperty('volume');
      }
    });

    it('should use cached data when available', async () => {
      const startDate = Date.now() - 24 * 60 * 60 * 1000;
      const endDate = Date.now();

      // First call
      await dataManager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      
      // Second call should use cache
      const result = await dataManager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      
      expect(result).toBeDefined();
    });

    it('should force refresh when requested', async () => {
      const startDate = Date.now() - 24 * 60 * 60 * 1000;
      const endDate = Date.now();

      const result = await dataManager.fetchHistoricalData(
        'btc_jpy',
        '1m',
        startDate,
        endDate,
        true // force refresh
      );

      expect(result).toBeDefined();
    });
  });

  describe('analyzeDataQuality', () => {
    it('should return quality score of 0 for empty data', () => {
      const report = dataManager.analyzeDataQuality([]);
      
      expect(report.totalCandles).toBe(0);
      expect(report.qualityScore).toBe(0);
      expect(report.missingCandles).toBe(0);
      expect(report.duplicateCandles).toBe(0);
      expect(report.gapsCount).toBe(0);
    });

    it('should detect perfect data quality', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 2000, open: 102, high: 107, low: 98, close: 104, volume: 1100 },
        { timestamp: 3000, open: 104, high: 109, low: 100, close: 106, volume: 1200 }
      ];

      const report = dataManager.analyzeDataQuality(data);
      
      expect(report.totalCandles).toBe(3);
      expect(report.qualityScore).toBeGreaterThan(0.9);
      expect(report.gapsCount).toBe(0);
    });

    it('should detect duplicate candles', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 }, // duplicate
        { timestamp: 2000, open: 102, high: 107, low: 98, close: 104, volume: 1100 }
      ];

      const report = dataManager.analyzeDataQuality(data);
      
      expect(report.duplicateCandles).toBe(1);
      expect(report.qualityScore).toBeLessThan(1);
    });

    it('should detect gaps in data', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 5000, open: 102, high: 107, low: 98, close: 104, volume: 1100 } // large gap
      ];

      const report = dataManager.analyzeDataQuality(data);
      
      expect(report.gapsCount).toBeGreaterThan(0);
      expect(report.missingCandles).toBeGreaterThan(0);
    });
  });

  describe('fillDataGaps', () => {
    it('should return original data if no gaps', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 60000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 120000, open: 102, high: 107, low: 98, close: 104, volume: 1100 }
      ];

      const result = dataManager.fillDataGaps(data);
      
      expect(result.length).toBe(2);
      expect(result).toEqual(data);
    });

    it('should fill gaps with interpolated data', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 60000, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
        { timestamp: 240000, open: 110, high: 115, low: 105, close: 110, volume: 1100 } // 3-minute gap
      ];

      const result = dataManager.fillDataGaps(data);
      
      expect(result.length).toBeGreaterThan(2);
      expect(result[0]).toEqual(data[0]);
      expect(result[result.length - 1]).toEqual(data[1]);
    });

    it('should handle empty data', () => {
      const result = dataManager.fillDataGaps([]);
      expect(result).toEqual([]);
    });

    it('should handle single candle', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 60000, open: 100, high: 105, low: 95, close: 102, volume: 1000 }
      ];

      const result = dataManager.fillDataGaps(data);
      expect(result).toEqual(data);
    });
  });

  describe('exportData', () => {
    it('should export data as JSON by default', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 }
      ];

      const result = dataManager.exportData(data);
      
      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result)).not.toThrow();
      
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should export data as CSV when requested', () => {
      const data: HistoricalCandle[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 2000, open: 102, high: 107, low: 98, close: 104, volume: 1100 }
      ];

      const result = dataManager.exportData(data, 'csv');
      
      expect(typeof result).toBe('string');
      expect(result).toContain('timestamp,open,high,low,close,volume');
      expect(result).toContain('1000,100,105,95,102,1000');
      expect(result).toContain('2000,102,107,98,104,1100');
    });

    it('should handle empty data export', () => {
      const jsonResult = dataManager.exportData([]);
      expect(jsonResult).toBe('[]');

      const csvResult = dataManager.exportData([], 'csv');
      expect(csvResult).toBe('timestamp,open,high,low,close,volume\n');
    });
  });

  describe('data validation', () => {
    it('should filter out invalid candles', async () => {
      // This test would need to access the private processAndValidateData method
      // For now, we test indirectly through fetchHistoricalData
      const startDate = Date.now() - 60 * 60 * 1000; // 1 hour ago
      const endDate = Date.now();

      const result = await dataManager.fetchHistoricalData(
        'btc_jpy',
        '1m',
        startDate,
        endDate
      );

      // All returned candles should be valid
      for (const candle of result) {
        expect(candle.timestamp).toBeGreaterThan(0);
        expect(candle.open).toBeGreaterThan(0);
        expect(candle.high).toBeGreaterThan(0);
        expect(candle.low).toBeGreaterThan(0);
        expect(candle.close).toBeGreaterThan(0);
        expect(candle.volume).toBeGreaterThanOrEqual(0);
        expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
        expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      }
    });
  });

  describe('timeframe detection', () => {
    it('should handle different timeframes correctly', async () => {
      const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
      const startDate = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
      const endDate = Date.now();

      for (const timeframe of timeframes) {
        const result = await dataManager.fetchHistoricalData(
          'btc_jpy',
          timeframe,
          startDate,
          endDate
        );

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });
});