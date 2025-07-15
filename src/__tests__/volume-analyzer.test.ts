import { VolumeAnalyzer } from '../analysis/volume-analyzer';
import { TransactionData } from '../types/bitbank';

describe('VolumeAnalyzer', () => {
  let volumeAnalyzer: VolumeAnalyzer;
  let mockTransactionData: TransactionData;

  beforeEach(() => {
    volumeAnalyzer = new VolumeAnalyzer({
      volumeWindow: 10,
      volumeSpikeThreshold: 2.0,
      twapWindow: 300000,
      vwapWindow: 900000,
      institutionalThreshold: 1000000,
    });

    mockTransactionData = {
      transaction_id: 12345,
      side: 'buy',
      price: '5000000',
      amount: '0.1',
      executed_at: Date.now(),
    };
  });

  describe('Transaction Processing', () => {
    it('should add transaction and emit analysis', () => {
      const analysisListener = jest.fn();
      volumeAnalyzer.on('volume_analysis', analysisListener);

      volumeAnalyzer.addTransaction(mockTransactionData);

      expect(analysisListener).toHaveBeenCalledWith(
        expect.objectContaining({
          currentVolume: expect.any(Number),
          volumeMA: expect.any(Number),
          volumeSpike: expect.any(Boolean),
          volumeProfile: expect.any(Array),
          twap: expect.any(Number),
          vwap: expect.any(Number),
          institutionalActivity: expect.any(Number),
        })
      );
    });

    it('should maintain volume history within window size', () => {
      // Add more transactions than window size
      for (let i = 0; i < 15; i++) {
        const transaction = {
          ...mockTransactionData,
          transaction_id: i,
          executed_at: Date.now() + i * 1000,
        };
        volumeAnalyzer.addTransaction(transaction);
      }

      const volumeHistory = volumeAnalyzer.getVolumeHistory();
      expect(volumeHistory.length).toBe(10); // Should be limited to window size
    });

    it('should clean up old transactions', () => {
      const oldTransaction = {
        ...mockTransactionData,
        executed_at: Date.now() - 1000000, // 1000 seconds ago
      };

      volumeAnalyzer.addTransaction(oldTransaction);
      
      // Add recent transaction to trigger cleanup
      volumeAnalyzer.addTransaction(mockTransactionData);

      const transactions = volumeAnalyzer.getTransactionHistory();
      expect(transactions.length).toBe(1);
      expect(transactions[0].executed_at).toBe(mockTransactionData.executed_at);
    });
  });

  describe('Volume Analysis', () => {
    beforeEach(() => {
      // Add some base transactions
      for (let i = 0; i < 5; i++) {
        const transaction = {
          ...mockTransactionData,
          transaction_id: i,
          amount: '0.1',
          executed_at: Date.now() - (5 - i) * 60000,
        };
        volumeAnalyzer.addTransaction(transaction);
      }
    });

    it('should calculate current volume correctly', () => {
      const analysis = volumeAnalyzer.getAnalysis();
      
      // Current volume should be sum of transactions in last minute
      expect(analysis?.currentVolume).toBeGreaterThan(0);
    });

    it('should calculate volume moving average', () => {
      const analysis = volumeAnalyzer.getAnalysis();
      
      expect(analysis?.volumeMA).toBe(0.1); // All transactions have 0.1 volume
    });

    it('should detect volume spikes', () => {
      // Add a large transaction to trigger spike
      const largeTransaction = {
        ...mockTransactionData,
        amount: '1.0', // Much larger than previous 0.1
        executed_at: Date.now(),
      };

      volumeAnalyzer.addTransaction(largeTransaction);
      const analysis = volumeAnalyzer.getAnalysis();

      expect(analysis?.volumeSpike).toBe(true);
    });

    it('should build volume profile correctly', () => {
      const analysis = volumeAnalyzer.getAnalysis();
      
      expect(analysis?.volumeProfile).toBeInstanceOf(Array);
      expect(analysis?.volumeProfile.length).toBeGreaterThan(0);
      expect(analysis?.volumeProfile[0]).toHaveProperty('price');
      expect(analysis?.volumeProfile[0]).toHaveProperty('volume');
    });
  });

  describe('TWAP Calculation', () => {
    it('should calculate TWAP correctly', () => {
      const transactions = [
        { ...mockTransactionData, price: '5000000', executed_at: Date.now() - 120000 },
        { ...mockTransactionData, price: '5010000', executed_at: Date.now() - 60000 },
        { ...mockTransactionData, price: '5020000', executed_at: Date.now() },
      ];

      transactions.forEach(tx => volumeAnalyzer.addTransaction(tx));
      const analysis = volumeAnalyzer.getAnalysis();

      // TWAP should be weighted average of prices over time
      expect(analysis?.twap).toBeGreaterThan(0);
      expect(analysis?.twap).toBeGreaterThan(5000000);
      expect(analysis?.twap).toBeLessThan(5020000);
    });

    it('should return 0 for TWAP with no transactions', () => {
      const freshAnalyzer = new VolumeAnalyzer();
      const analysis = freshAnalyzer.getAnalysis();

      expect(analysis?.twap).toBe(0);
    });
  });

  describe('VWAP Calculation', () => {
    it('should calculate VWAP correctly', () => {
      const transactions = [
        { ...mockTransactionData, price: '5000000', amount: '0.1' },
        { ...mockTransactionData, price: '5010000', amount: '0.2' },
        { ...mockTransactionData, price: '5020000', amount: '0.1' },
      ];

      transactions.forEach(tx => volumeAnalyzer.addTransaction(tx));
      const analysis = volumeAnalyzer.getAnalysis();

      // VWAP should be volume-weighted average: (5000000*0.1 + 5010000*0.2 + 5020000*0.1) / 0.4
      const expectedVWAP = (5000000 * 0.1 + 5010000 * 0.2 + 5020000 * 0.1) / 0.4;
      expect(analysis?.vwap).toBeCloseTo(expectedVWAP, 0);
    });

    it('should return 0 for VWAP with no volume', () => {
      const freshAnalyzer = new VolumeAnalyzer();
      const analysis = freshAnalyzer.getAnalysis();

      expect(analysis?.vwap).toBe(0);
    });
  });

  describe('Institutional Activity Analysis', () => {
    it('should detect institutional activity', () => {
      const institutionalTransaction = {
        ...mockTransactionData,
        price: '5000000',
        amount: '0.5', // 0.5 * 5000000 = 2500000 > 1000000 threshold
      };

      volumeAnalyzer.addTransaction(institutionalTransaction);
      const analysis = volumeAnalyzer.getAnalysis();

      expect(analysis?.institutionalActivity).toBeGreaterThan(0);
    });

    it('should calculate institutional activity ratio correctly', () => {
      const transactions = [
        { ...mockTransactionData, price: '5000000', amount: '0.5' }, // Institutional
        { ...mockTransactionData, price: '5000000', amount: '0.01' }, // Retail
        { ...mockTransactionData, price: '5000000', amount: '0.01' }, // Retail
      ];

      transactions.forEach(tx => volumeAnalyzer.addTransaction(tx));
      const analysis = volumeAnalyzer.getAnalysis();

      // Institutional ratio should be 0.5 / 0.52 ≈ 0.96
      expect(analysis?.institutionalActivity).toBeCloseTo(0.96, 1);
    });
  });

  describe('Alert System', () => {
    let alertListener: jest.Mock;

    beforeEach(() => {
      alertListener = jest.fn();
      volumeAnalyzer.on('alert', alertListener);
    });

    it('should emit volume spike alert', () => {
      // Add base volume
      volumeAnalyzer.addTransaction(mockTransactionData);
      
      // Add spike transaction
      const spikeTransaction = {
        ...mockTransactionData,
        amount: '1.0',
        executed_at: Date.now(),
      };
      volumeAnalyzer.addTransaction(spikeTransaction);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'volume',
          level: 'high',
          message: 'Volume spike detected',
        })
      );
    });

    it('should emit institutional activity alert', () => {
      const institutionalTransaction = {
        ...mockTransactionData,
        amount: '1.0', // Large enough to trigger institutional threshold
      };

      volumeAnalyzer.addTransaction(institutionalTransaction);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'volume',
          level: 'medium',
          message: 'High institutional activity detected',
        })
      );
    });

    it('should emit TWAP/VWAP divergence alert', () => {
      // Create transactions that would cause divergence
      const transactions = [
        { ...mockTransactionData, price: '5000000', amount: '0.01' },
        { ...mockTransactionData, price: '5100000', amount: '1.0' }, // Large volume at higher price
      ];

      transactions.forEach(tx => volumeAnalyzer.addTransaction(tx));

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'anomaly',
          level: 'medium',
          message: 'TWAP/VWAP divergence detected',
        })
      );
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect anomalous volume patterns', () => {
      // Add normal transactions
      for (let i = 0; i < 5; i++) {
        volumeAnalyzer.addTransaction({
          ...mockTransactionData,
          transaction_id: i,
          amount: '0.1',
        });
      }

      // Add anomalous transaction
      volumeAnalyzer.addTransaction({
        ...mockTransactionData,
        amount: '2.0', // Much larger than normal
      });

      const anomaly = volumeAnalyzer.detectAnomalousVolume();
      expect(anomaly.isAnomalous).toBe(true);
      expect(anomaly.score).toBeGreaterThan(0.5);
    });

    it('should not detect anomalies with insufficient data', () => {
      const anomaly = volumeAnalyzer.detectAnomalousVolume();
      expect(anomaly.isAnomalous).toBe(false);
      expect(anomaly.reason).toBe('Insufficient data');
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const transactions = [
        { ...mockTransactionData, amount: '0.1' },
        { ...mockTransactionData, amount: '0.2' },
        { ...mockTransactionData, amount: '0.05' },
      ];

      transactions.forEach(tx => volumeAnalyzer.addTransaction(tx));
    });

    it('should calculate volume statistics correctly', () => {
      const stats = volumeAnalyzer.getVolumeStats();

      expect(stats.totalTransactions).toBe(3);
      expect(stats.totalVolume).toBe(0.35);
      expect(stats.averageTradeSize).toBeCloseTo(0.1167, 3);
      expect(stats.maxTradeSize).toBe(0.2);
      expect(stats.minTradeSize).toBe(0.05);
    });

    it('should return empty stats for no transactions', () => {
      const freshAnalyzer = new VolumeAnalyzer();
      const stats = freshAnalyzer.getVolumeStats();

      expect(stats.totalTransactions).toBe(0);
      expect(stats.totalVolume).toBe(0);
      expect(stats.averageTradeSize).toBe(0);
      expect(stats.maxTradeSize).toBe(0);
      expect(stats.minTradeSize).toBe(0);
    });
  });

  describe('Health Monitoring', () => {
    it('should return false for unhealthy state initially', () => {
      expect(volumeAnalyzer.isHealthy()).toBe(false);
    });

    it('should return true for healthy state after transactions', () => {
      volumeAnalyzer.addTransaction(mockTransactionData);
      expect(volumeAnalyzer.isHealthy()).toBe(true);
    });
  });
});