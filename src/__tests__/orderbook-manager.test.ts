import { OrderBookManager } from '../api/orderbook-manager';
import { OrderBookData, DepthDiffData } from '../types/bitbank';

describe('OrderBookManager', () => {
  let orderBookManager: OrderBookManager;
  let mockOrderBookData: OrderBookData;

  beforeEach(() => {
    orderBookManager = new OrderBookManager({
      maxDepth: 50,
      largeOrderThreshold: 500000,
      spreadAlertThreshold: 0.01,
      imbalanceAlertThreshold: 0.6,
    });

    mockOrderBookData = {
      asks: [
        { price: '5000000', amount: '0.1' },
        { price: '5001000', amount: '0.2' },
        { price: '5002000', amount: '0.15' },
      ],
      bids: [
        { price: '4999000', amount: '0.15' },
        { price: '4998000', amount: '0.25' },
        { price: '4997000', amount: '0.1' },
      ],
      asks_over: '0',
      bids_under: '0',
      asks_count: 3,
      bids_count: 3,
      sequence_id: 1,
      timestamp: Date.now(),
    };
  });

  describe('Order Book Updates', () => {
    it('should update order book with new data', () => {
      const updatedListener = jest.fn();
      const analysisListener = jest.fn();

      orderBookManager.on('orderbook_updated', updatedListener);
      orderBookManager.on('orderbook_analysis', analysisListener);

      orderBookManager.updateOrderBook(mockOrderBookData);

      expect(updatedListener).toHaveBeenCalledWith(mockOrderBookData);
      expect(analysisListener).toHaveBeenCalledWith(
        expect.objectContaining({
          midPrice: expect.any(Number),
          bidAskSpread: expect.any(Number),
          totalBidVolume: expect.any(Number),
          totalAskVolume: expect.any(Number),
        })
      );
    });

    it('should sort asks in ascending order', () => {
      const unsortedData = {
        ...mockOrderBookData,
        asks: [
          { price: '5002000', amount: '0.15' },
          { price: '5000000', amount: '0.1' },
          { price: '5001000', amount: '0.2' },
        ],
      };

      orderBookManager.updateOrderBook(unsortedData);
      const orderBook = orderBookManager.getOrderBook();

      expect(orderBook?.asks[0].price).toBe('5000000');
      expect(orderBook?.asks[1].price).toBe('5001000');
      expect(orderBook?.asks[2].price).toBe('5002000');
    });

    it('should sort bids in descending order', () => {
      const unsortedData = {
        ...mockOrderBookData,
        bids: [
          { price: '4997000', amount: '0.1' },
          { price: '4999000', amount: '0.15' },
          { price: '4998000', amount: '0.25' },
        ],
      };

      orderBookManager.updateOrderBook(unsortedData);
      const orderBook = orderBookManager.getOrderBook();

      expect(orderBook?.bids[0].price).toBe('4999000');
      expect(orderBook?.bids[1].price).toBe('4998000');
      expect(orderBook?.bids[2].price).toBe('4997000');
    });

    it('should reject out-of-order sequence updates', () => {
      const alertListener = jest.fn();
      orderBookManager.on('alert', alertListener);

      // First update
      orderBookManager.updateOrderBook(mockOrderBookData);

      // Try to update with older sequence
      const olderData = { ...mockOrderBookData, sequence_id: 0 };
      orderBookManager.updateOrderBook(olderData);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system',
          level: 'low',
          message: 'Out of order sequence received',
        })
      );
    });
  });

  describe('Depth Diff Updates', () => {
    it('should apply depth differences correctly', () => {
      // Set initial order book
      orderBookManager.updateOrderBook(mockOrderBookData);

      const depthDiff: DepthDiffData = {
        asks: [
          { price: '5000000', amount: '0.05' }, // Update existing
          { price: '5003000', amount: '0.1' },  // Add new
        ],
        bids: [
          { price: '4999000', amount: '0' },    // Remove existing
          { price: '4996000', amount: '0.2' },  // Add new
        ],
        sequence_id: 2,
        timestamp: Date.now(),
      };

      orderBookManager.applyDepthDiff(depthDiff);
      const orderBook = orderBookManager.getOrderBook();

      // Check ask updates
      expect(orderBook?.asks.find(a => a.price === '5000000')?.amount).toBe('0.05');
      expect(orderBook?.asks.find(a => a.price === '5003000')?.amount).toBe('0.1');

      // Check bid updates
      expect(orderBook?.bids.find(b => b.price === '4999000')).toBeUndefined();
      expect(orderBook?.bids.find(b => b.price === '4996000')?.amount).toBe('0.2');
    });

    it('should remove entries with zero amount', () => {
      orderBookManager.updateOrderBook(mockOrderBookData);

      const depthDiff: DepthDiffData = {
        asks: [{ price: '5000000', amount: '0' }],
        bids: [{ price: '4999000', amount: '0' }],
        sequence_id: 2,
        timestamp: Date.now(),
      };

      orderBookManager.applyDepthDiff(depthDiff);
      const orderBook = orderBookManager.getOrderBook();

      expect(orderBook?.asks.find(a => a.price === '5000000')).toBeUndefined();
      expect(orderBook?.bids.find(b => b.price === '4999000')).toBeUndefined();
    });
  });

  describe('Order Book Analysis', () => {
    beforeEach(() => {
      orderBookManager.updateOrderBook(mockOrderBookData);
    });

    it('should calculate mid price correctly', () => {
      const analysis = orderBookManager.getAnalysis();
      
      // Mid price should be between best ask (5000000) and best bid (4999000)
      expect(analysis.midPrice).toBe(4999500);
    });

    it('should calculate bid-ask spread correctly', () => {
      const analysis = orderBookManager.getAnalysis();
      
      expect(analysis.bidAskSpread).toBe(1000);
      expect(analysis.bidAskSpreadPercent).toBeCloseTo(0.02, 2);
    });

    it('should calculate total volumes correctly', () => {
      const analysis = orderBookManager.getAnalysis();
      
      expect(analysis.totalAskVolume).toBe(0.45); // 0.1 + 0.2 + 0.15
      expect(analysis.totalBidVolume).toBe(0.5);  // 0.15 + 0.25 + 0.1
    });

    it('should calculate order book imbalance correctly', () => {
      const analysis = orderBookManager.getAnalysis();
      
      // Imbalance = (0.5 - 0.45) / (0.5 + 0.45) = 0.05 / 0.95 ≈ 0.0526
      expect(analysis.orderBookImbalance).toBeCloseTo(0.0526, 3);
    });

    it('should detect large orders', () => {
      const largeOrderData = {
        ...mockOrderBookData,
        asks: [
          { price: '5000000', amount: '0.2' }, // 0.2 * 5000000 = 1000000 > 500000
        ],
        bids: [
          { price: '4999000', amount: '0.15' }, // 0.15 * 4999000 = 749850 > 500000
        ],
      };

      orderBookManager.updateOrderBook(largeOrderData);
      const analysis = orderBookManager.getAnalysis();

      expect(analysis.largeOrders.asks).toHaveLength(1);
      expect(analysis.largeOrders.bids).toHaveLength(1);
    });
  });

  describe('Alert System', () => {
    let alertListener: jest.Mock;

    beforeEach(() => {
      alertListener = jest.fn();
      orderBookManager.on('alert', alertListener);
    });

    it('should emit spread alert for wide spreads', () => {
      const wideSpreadData = {
        ...mockOrderBookData,
        asks: [{ price: '5100000', amount: '0.1' }],
        bids: [{ price: '4900000', amount: '0.1' }],
      };

      orderBookManager.updateOrderBook(wideSpreadData);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'spread',
          level: 'medium',
          message: 'Wide bid-ask spread detected',
        })
      );
    });

    it('should emit imbalance alert for heavy imbalance', () => {
      const imbalancedData = {
        ...mockOrderBookData,
        asks: [{ price: '5000000', amount: '0.1' }],
        bids: [
          { price: '4999000', amount: '1.0' },
          { price: '4998000', amount: '1.0' },
        ],
      };

      orderBookManager.updateOrderBook(imbalancedData);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'anomaly',
          level: 'medium',
          message: 'Order book imbalance detected',
        })
      );
    });

    it('should emit large order alert', () => {
      const largeOrderData = {
        ...mockOrderBookData,
        asks: [{ price: '5000000', amount: '1.0' }], // 1.0 * 5000000 = 5000000 > 500000
      };

      orderBookManager.updateOrderBook(largeOrderData);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'volume',
          level: 'high',
          message: 'Large orders detected',
        })
      );
    });
  });

  describe('Health Monitoring', () => {
    it('should return false for unhealthy state initially', () => {
      expect(orderBookManager.isHealthy()).toBe(false);
    });

    it('should return true for healthy state after update', () => {
      orderBookManager.updateOrderBook(mockOrderBookData);
      expect(orderBookManager.isHealthy()).toBe(true);
    });

    it('should return false for stale data', async () => {
      orderBookManager.updateOrderBook(mockOrderBookData);
      
      // Wait for data to become stale (> 30 seconds)
      jest.advanceTimersByTime(35000);
      
      expect(orderBookManager.isHealthy()).toBe(false);
    });
  });

  describe('Support and Resistance Levels', () => {
    it('should identify support levels correctly', () => {
      const supportData = {
        ...mockOrderBookData,
        bids: [
          { price: '4999000', amount: '0.5' },
          { price: '4998000', amount: '0.3' },
          { price: '4997000', amount: '0.2' },
        ],
      };

      orderBookManager.updateOrderBook(supportData);
      const analysis = orderBookManager.getAnalysis();

      // Support should be at the price with highest cumulative volume
      expect(analysis.supportLevel).toBe(4997000);
    });

    it('should identify resistance levels correctly', () => {
      const resistanceData = {
        ...mockOrderBookData,
        asks: [
          { price: '5000000', amount: '0.2' },
          { price: '5001000', amount: '0.3' },
          { price: '5002000', amount: '0.5' },
        ],
      };

      orderBookManager.updateOrderBook(resistanceData);
      const analysis = orderBookManager.getAnalysis();

      // Resistance should be at the price with highest cumulative volume
      expect(analysis.resistanceLevel).toBe(5002000);
    });
  });

  describe('Liquidity Analysis', () => {
    it('should calculate liquidity depth correctly', () => {
      orderBookManager.updateOrderBook(mockOrderBookData);
      const analysis = orderBookManager.getAnalysis();

      // Liquidity depth should include orders within 1% of mid price
      expect(analysis.liquidityDepth).toBeGreaterThan(0);
    });
  });
});