import { HistoricalDataManager } from '../data/historical-data-manager';
import { BitbankConfig } from '../types/bitbank';
import { HistoricalDataPoint } from '../types/backtest';
import * as fs from 'fs';
import * as path from 'path';

describe('HistoricalDataManager', () => {
  let manager: HistoricalDataManager;
  let testDataDir: string;

  beforeEach(() => {
    const bitbankConfig: BitbankConfig = {
      apiKey: 'test_key',
      apiSecret: 'test_secret',
      baseUrl: 'https://api.bitbank.cc'
    };

    testDataDir = './test-data';
    manager = new HistoricalDataManager(bitbankConfig, testDataDir);
  });

  afterEach(() => {
    // Clean up test data directory
    if (fs.existsSync(testDataDir)) {
      const files = fs.readdirSync(testDataDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testDataDir, file));
      });
      fs.rmdirSync(testDataDir);
    }
  });

  describe('constructor', () => {
    it('should create data directory if it does not exist', () => {
      expect(fs.existsSync(testDataDir)).toBe(true);
    });

    it('should initialize with correct configuration', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('fetchHistoricalData', () => {
    it('should fetch historical data for given period', async () => {
      const startDate = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
      const endDate = Date.now();
      
      const data = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      
      // Check data structure
      data.forEach(point => {
        expect(point.timestamp).toBeDefined();
        expect(point.price).toBeGreaterThan(0);
        expect(point.volume).toBeGreaterThanOrEqual(0);
        expect(point.buy).toBeGreaterThan(0);
        expect(point.sell).toBeGreaterThan(0);
        expect(point.high).toBeGreaterThan(0);
        expect(point.low).toBeGreaterThan(0);
        expect(point.timestamp).toBeGreaterThanOrEqual(startDate);
        expect(point.timestamp).toBeLessThanOrEqual(endDate);
      });
    });

    it('should cache data after first fetch', async () => {
      const startDate = Date.now() - 60 * 60 * 1000; // 1 hour ago
      const endDate = Date.now();
      
      const data1 = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      const data2 = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      
      expect(data1).toEqual(data2);
    });

    it('should save data to file', async () => {
      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();
      
      await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      
      const filePath = path.join(testDataDir, 'btc_jpy_1m.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should handle empty date range', async () => {
      const startDate = Date.now();
      const endDate = Date.now() - 1000; // End before start
      
      const data = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('updateData', () => {
    it('should update existing data', async () => {
      const startDate = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      const endDate = Date.now() - 60 * 60 * 1000; // 1 hour ago
      
      // Initial fetch
      const initialData = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      
      // Update with new data
      await manager.updateData('btc_jpy', '1m');
      
      // Fetch again to see updated data
      const updatedData = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, Date.now());
      
      expect(updatedData.length).toBeGreaterThanOrEqual(initialData.length);
    });
  });

  describe('analyzeDataQuality', () => {
    it('should analyze data quality correctly', async () => {
      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();
      
      const data = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      const quality = manager.analyzeDataQuality(data);
      
      expect(quality).toBeDefined();
      expect(quality.totalPoints).toBe(data.length);
      expect(quality.qualityScore).toBeGreaterThanOrEqual(0);
      expect(quality.qualityScore).toBeLessThanOrEqual(1);
      expect(quality.missingPoints).toBeGreaterThanOrEqual(0);
      expect(quality.duplicatePoints).toBeGreaterThanOrEqual(0);
      expect(quality.invalidPoints).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(quality.dataGaps)).toBe(true);
    });

    it('should handle empty data', () => {
      const quality = manager.analyzeDataQuality([]);
      
      expect(quality.totalPoints).toBe(0);
      expect(quality.qualityScore).toBe(0);
      expect(quality.missingPoints).toBe(0);
      expect(quality.duplicatePoints).toBe(0);
      expect(quality.invalidPoints).toBe(0);
      expect(quality.dataGaps).toHaveLength(0);
    });

    it('should detect invalid data points', () => {
      const invalidData: HistoricalDataPoint[] = [
        {
          timestamp: Date.now(),
          price: -100, // Invalid negative price
          volume: 1000,
          buy: 50000,
          sell: 49000,
          high: 51000,
          low: 48000
        },
        {
          timestamp: Date.now() + 60000,
          price: NaN, // Invalid NaN price
          volume: 1000,
          buy: 50000,
          sell: 49000,
          high: 51000,
          low: 48000
        }
      ];

      const quality = manager.analyzeDataQuality(invalidData);
      
      expect(quality.invalidPoints).toBeGreaterThan(0);
      expect(quality.qualityScore).toBeLessThan(1);
    });
  });

  describe('fillDataGaps', () => {
    it('should fill gaps in data', () => {
      const gappedData: HistoricalDataPoint[] = [
        {
          timestamp: Date.now(),
          price: 50000,
          volume: 1000,
          buy: 50100,
          sell: 49900,
          high: 50200,
          low: 49800
        },
        {
          timestamp: Date.now() + 5 * 60 * 1000, // 5 minute gap
          price: 50500,
          volume: 1200,
          buy: 50600,
          sell: 50400,
          high: 50700,
          low: 50300
        }
      ];

      const filledData = manager.fillDataGaps(gappedData);
      
      expect(filledData.length).toBeGreaterThan(gappedData.length);
    });

    it('should handle data without gaps', () => {
      const continuousData: HistoricalDataPoint[] = [
        {
          timestamp: Date.now(),
          price: 50000,
          volume: 1000,
          buy: 50100,
          sell: 49900,
          high: 50200,
          low: 49800
        },
        {
          timestamp: Date.now() + 60 * 1000, // 1 minute later
          price: 50100,
          volume: 1100,
          buy: 50200,
          sell: 50000,
          high: 50300,
          low: 49900
        }
      ];

      const filledData = manager.fillDataGaps(continuousData);
      
      expect(filledData.length).toBe(continuousData.length);
    });
  });

  describe('getDataInfo', () => {
    it('should return correct data info', async () => {
      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();
      
      const data = await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      const info = manager.getDataInfo('btc_jpy', '1m');
      
      expect(info.exists).toBe(true);
      expect(info.points).toBe(data.length);
      expect(info.range).toBeDefined();
      expect(info.range!.start).toBeDefined();
      expect(info.range!.end).toBeDefined();
    });

    it('should handle non-existent data', () => {
      const info = manager.getDataInfo('non_existent', '1m');
      
      expect(info.exists).toBe(false);
      expect(info.points).toBe(0);
      expect(info.range).toBeUndefined();
    });
  });

  describe('exportData', () => {
    it('should export data in JSON format', async () => {
      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();
      
      await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      const exportedData = manager.exportData('btc_jpy', '1m', 'json');
      
      expect(typeof exportedData).toBe('string');
      expect(() => JSON.parse(exportedData)).not.toThrow();
    });

    it('should export data in CSV format', async () => {
      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();
      
      await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      const exportedData = manager.exportData('btc_jpy', '1m', 'csv');
      
      expect(typeof exportedData).toBe('string');
      expect(exportedData).toContain('timestamp,price,volume');
    });

    it('should throw error for non-existent data', () => {
      expect(() => {
        manager.exportData('non_existent', '1m');
      }).toThrow();
    });
  });

  describe('clearCache', () => {
    it('should clear cached data', async () => {
      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();
      
      await manager.fetchHistoricalData('btc_jpy', '1m', startDate, endDate);
      let info = manager.getDataInfo('btc_jpy', '1m');
      expect(info.exists).toBe(true);
      
      manager.clearCache();
      info = manager.getDataInfo('btc_jpy', '1m');
      expect(info.exists).toBe(false);
    });
  });
});