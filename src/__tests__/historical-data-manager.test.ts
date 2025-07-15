import { HistoricalDataManager } from '../data/historical-data-manager';
import { BitbankClient } from '../api/bitbank-client';
import { BitbankConfig } from '../types/bitbank';
import { HistoricalDataConfig, HistoricalDataPoint } from '../types/backtest';

// Mock the BitbankClient
jest.mock('../api/bitbank-client');

describe('HistoricalDataManager', () => {
  let dataManager: HistoricalDataManager;
  let mockBitbankClient: jest.Mocked<BitbankClient>;
  let bitbankConfig: BitbankConfig;
  let dataConfig: HistoricalDataConfig;

  beforeEach(() => {
    bitbankConfig = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      baseUrl: 'https://api.bitbank.cc'
    };

    dataConfig = {
      pair: 'btc_jpy',
      timeframes: ['1m', '5m', '1h'],
      startDate: Date.now() - 24 * 60 * 60 * 1000,
      endDate: Date.now(),
      source: 'bitbank',
      maxRetries: 3,
      retryDelay: 1000,
      fetchInterval: 500
    };

    mockBitbankClient = {
      getTicker: jest.fn()
    } as any;

    (BitbankClient as jest.Mock).mockImplementation(() => mockBitbankClient);
    
    dataManager = new HistoricalDataManager(bitbankConfig, dataConfig);
  });

  describe('fetchHistoricalData', () => {
    it('should fetch historical data successfully', async () => {
      const mockTicker = {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5010000',
        low: '4980000',
        last: '5000000',
        vol: '1000',
        timestamp: Date.now()
      };

      mockBitbankClient.getTicker.mockResolvedValue(mockTicker);

      const startDate = Date.now() - 60 * 60 * 1000; // 1 hour ago
      const endDate = Date.now();

      const result = await dataManager.fetchHistoricalData('btc_jpy', '1h', startDate, endDate);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      
      const firstPoint = result[0];
      expect(firstPoint).toHaveProperty('timestamp');
      expect(firstPoint).toHaveProperty('open');
      expect(firstPoint).toHaveProperty('high');
      expect(firstPoint).toHaveProperty('low');
      expect(firstPoint).toHaveProperty('close');
      expect(firstPoint).toHaveProperty('volume');
      
      expect(firstPoint?.open).toBe(5000000);
      expect(firstPoint?.close).toBe(5000000);
      expect(firstPoint?.volume).toBe(1000);
    });

    it('should handle API errors gracefully', async () => {
      mockBitbankClient.getTicker.mockRejectedValue(new Error('API Error'));

      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();

      const result = await dataManager.fetchHistoricalData('btc_jpy', '1h', startDate, endDate);

      expect(result).toBeInstanceOf(Array);
      // Should return empty array or partial data on error
    });

    it('should respect rate limiting', async () => {
      const mockTicker = {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5010000',
        low: '4980000',
        last: '5000000',
        vol: '1000',
        timestamp: Date.now()
      };

      mockBitbankClient.getTicker.mockResolvedValue(mockTicker);

      const startDate = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
      const endDate = Date.now();

      const startTime = Date.now();
      await dataManager.fetchHistoricalData('btc_jpy', '1h', startDate, endDate);
      const endTime = Date.now();

      // Should take at least some time due to rate limiting
      expect(endTime - startTime).toBeGreaterThan(1000);
    });
  });

  describe('analyzeDataQuality', () => {
    it('should analyze data quality correctly', () => {
      const testData: HistoricalDataPoint[] = [
        {
          timestamp: 1000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000
        },
        {
          timestamp: 2000,
          open: 102,
          high: 108,
          low: 100,
          close: 105,
          volume: 1200
        },
        {
          timestamp: 3000,
          open: 105,
          high: 110,
          low: 103,
          close: 107,
          volume: 1100
        }
      ];

      const quality = dataManager.analyzeDataQuality(testData);

      expect(quality).toHaveProperty('gaps');
      expect(quality).toHaveProperty('outliers');
      expect(quality).toHaveProperty('quality');
      expect(quality).toHaveProperty('completeness');
      expect(quality).toHaveProperty('consistency');
      expect(quality).toHaveProperty('accuracy');

      expect(quality.quality).toBeGreaterThan(0);
      expect(quality.quality).toBeLessThanOrEqual(1);
      expect(quality.completeness).toBeGreaterThan(0);
      expect(quality.consistency).toBeGreaterThan(0);
      expect(quality.accuracy).toBeGreaterThan(0);
    });

    it('should detect data gaps', () => {
      const testData: HistoricalDataPoint[] = [
        {
          timestamp: 1000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000
        },
        {
          timestamp: 10000, // Large gap
          open: 102,
          high: 108,
          low: 100,
          close: 105,
          volume: 1200
        }
      ];

      const quality = dataManager.analyzeDataQuality(testData);

      expect(quality.gaps.length).toBeGreaterThan(0);
      expect(quality.gaps[0]).toHaveProperty('start');
      expect(quality.gaps[0]).toHaveProperty('end');
      expect(quality.gaps[0]).toHaveProperty('duration');
      expect(quality.gaps[0]).toHaveProperty('severity');
    });

    it('should detect outliers', () => {
      const testData: HistoricalDataPoint[] = [
        {
          timestamp: 1000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000
        },
        {
          timestamp: 2000,
          open: 102,
          high: 108,
          low: 100,
          close: 105,
          volume: 1200
        },
        {
          timestamp: 3000,
          open: 105,
          high: 110,
          low: 103,
          close: 10000, // Outlier
          volume: 1100
        }
      ];

      const quality = dataManager.analyzeDataQuality(testData);

      expect(quality.outliers.length).toBeGreaterThan(0);
      expect(quality.outliers[0]).toHaveProperty('timestamp');
      expect(quality.outliers[0]).toHaveProperty('value');
      expect(quality.outliers[0]).toHaveProperty('expectedValue');
      expect(quality.outliers[0]).toHaveProperty('deviation');
      expect(quality.outliers[0]).toHaveProperty('severity');
    });
  });

  describe('fillDataGaps', () => {
    it('should fill gaps in data', () => {
      const testData: HistoricalDataPoint[] = [
        {
          timestamp: 1000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000
        },
        {
          timestamp: 4000, // Gap of 3 seconds
          open: 105,
          high: 110,
          low: 103,
          close: 107,
          volume: 1100
        }
      ];

      const filledData = dataManager.fillDataGaps(testData);

      expect(filledData.length).toBeGreaterThan(testData.length);
      
      // Check that interpolated points have reasonable values
      const interpolatedPoint = filledData[1];
      expect(interpolatedPoint?.close).toBeGreaterThan(102);
      expect(interpolatedPoint?.close).toBeLessThan(107);
    });

    it('should handle empty data', () => {
      const testData: HistoricalDataPoint[] = [];
      const filledData = dataManager.fillDataGaps(testData);

      expect(filledData).toEqual([]);
    });

    it('should handle single data point', () => {
      const testData: HistoricalDataPoint[] = [
        {
          timestamp: 1000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000
        }
      ];

      const filledData = dataManager.fillDataGaps(testData);

      expect(filledData).toEqual(testData);
    });
  });

  describe('getDataStatistics', () => {
    it('should calculate statistics correctly', () => {
      const testData: HistoricalDataPoint[] = [
        {
          timestamp: 1000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000
        },
        {
          timestamp: 2000,
          open: 102,
          high: 108,
          low: 100,
          close: 105,
          volume: 1200
        },
        {
          timestamp: 3000,
          open: 105,
          high: 110,
          low: 103,
          close: 107,
          volume: 1100
        }
      ];

      const stats = dataManager.getDataStatistics(testData);

      expect(stats).toHaveProperty('totalPoints');
      expect(stats).toHaveProperty('startDate');
      expect(stats).toHaveProperty('endDate');
      expect(stats).toHaveProperty('avgPrice');
      expect(stats).toHaveProperty('minPrice');
      expect(stats).toHaveProperty('maxPrice');
      expect(stats).toHaveProperty('avgVolume');
      expect(stats).toHaveProperty('minVolume');
      expect(stats).toHaveProperty('maxVolume');
      expect(stats).toHaveProperty('priceVolatility');
      expect(stats).toHaveProperty('priceRange');

      expect(stats['totalPoints']).toBe(3);
      expect(stats['startDate']).toBe(1000);
      expect(stats['endDate']).toBe(3000);
      expect(stats['avgPrice']).toBe((102 + 105 + 107) / 3);
      expect(stats['minPrice']).toBe(102);
      expect(stats['maxPrice']).toBe(107);
      expect(stats['avgVolume']).toBe((1000 + 1200 + 1100) / 3);
      expect(stats['minVolume']).toBe(1000);
      expect(stats['maxVolume']).toBe(1200);
      expect(stats['priceRange']).toBe(5);
    });

    it('should handle empty data', () => {
      const testData: HistoricalDataPoint[] = [];
      const stats = dataManager.getDataStatistics(testData);

      expect(stats).toEqual({});
    });
  });

  describe('caching', () => {
    it('should cache data correctly', async () => {
      const mockTicker = {
        pair: 'btc_jpy',
        sell: '5000000',
        buy: '4999000',
        high: '5010000',
        low: '4980000',
        last: '5000000',
        vol: '1000',
        timestamp: Date.now()
      };

      mockBitbankClient.getTicker.mockResolvedValue(mockTicker);

      const startDate = Date.now() - 60 * 60 * 1000;
      const endDate = Date.now();

      // First call should hit the API
      const result1 = await dataManager.fetchHistoricalData('btc_jpy', '1h', startDate, endDate);
      
      // Second call should use cache
      const result2 = await dataManager.fetchHistoricalData('btc_jpy', '1h', startDate, endDate);

      expect(result1).toEqual(result2);
      // API should only be called once due to caching
      expect(mockBitbankClient.getTicker).toHaveBeenCalledTimes(1);
    });

    it('should clear cache correctly', async () => {
      await dataManager.clearCache();
      
      // Should not throw error
      expect(true).toBe(true);
    });
  });
});