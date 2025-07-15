import { DynamicRiskManager } from '../utils/dynamic-risk-manager';
import { BitbankTicker } from '../types/bitbank';

describe('DynamicRiskManager', () => {
  let riskManager: DynamicRiskManager;
  let mockTicker: BitbankTicker;

  beforeEach(() => {
    riskManager = new DynamicRiskManager({
      initialBalance: 100000,
      maxDrawdown: 0.15,
      maxPositionSize: 50000,
      minPositionSize: 1000,
      atrPeriod: 14,
    });

    mockTicker = {
      pair: 'btc_jpy',
      sell: '5000000',
      buy: '5000000',
      high: '5100000',
      low: '4900000',
      last: '5000000',
      vol: '100',
      timestamp: Date.now(),
    };
  });

  describe('Market data processing', () => {
    it('should process market data and update ATR', () => {
      riskManager.updateMarketData(mockTicker);
      
      const atr = riskManager.getCurrentATR();
      expect(atr).toBeGreaterThanOrEqual(0);
    });

    it('should accumulate price history for calculations', () => {
      const tickers = [
        { ...mockTicker, last: '5000000', high: '5050000', low: '4950000' },
        { ...mockTicker, last: '5100000', high: '5150000', low: '5050000' },
        { ...mockTicker, last: '5200000', high: '5250000', low: '5150000' },
      ];

      tickers.forEach(ticker => riskManager.updateMarketData(ticker));
      
      const atr = riskManager.getCurrentATR();
      expect(atr).toBeGreaterThan(0);
    });
  });

  describe('Dynamic position sizing', () => {
    it('should calculate position size using Kelly Criterion', () => {
      // Add some trade history
      const trades = [
        { profit: 200, isWin: true },
        { profit: -100, isWin: false },
        { profit: 150, isWin: true },
        { profit: -80, isWin: false },
        { profit: 180, isWin: true },
      ];

      riskManager.updateTradeHistory(trades);
      
      const positionSize = riskManager.calculateOptimalPositionSize(5000000);
      expect(positionSize).toBeGreaterThan(0);
      expect(positionSize).toBeLessThanOrEqual(50000);
    });

    it('should adjust position size based on volatility', () => {
      // Create high volatility scenario
      const volatileTickers = [
        { ...mockTicker, last: '5000000', high: '5200000', low: '4800000' },
        { ...mockTicker, last: '4700000', high: '4900000', low: '4500000' },
        { ...mockTicker, last: '5300000', high: '5500000', low: '5100000' },
      ];

      volatileTickers.forEach(ticker => riskManager.updateMarketData(ticker));

      const trades = [
        { profit: 100, isWin: true },
        { profit: -50, isWin: false },
        { profit: 120, isWin: true },
      ];
      riskManager.updateTradeHistory(trades);

      const highVolSize = riskManager.calculateOptimalPositionSize(5000000);

      // Reset with low volatility data
      const stableTickers = [
        { ...mockTicker, last: '5000000', high: '5010000', low: '4990000' },
        { ...mockTicker, last: '5005000', high: '5015000', low: '4995000' },
        { ...mockTicker, last: '5010000', high: '5020000', low: '5000000' },
      ];

      const newRiskManager = new DynamicRiskManager({
        initialBalance: 100000,
        maxDrawdown: 0.15,
        maxPositionSize: 50000,
        minPositionSize: 1000,
        atrPeriod: 14,
      });

      stableTickers.forEach(ticker => newRiskManager.updateMarketData(ticker));
      newRiskManager.updateTradeHistory(trades);

      const lowVolSize = newRiskManager.calculateOptimalPositionSize(5000000);

      expect(lowVolSize).toBeGreaterThanOrEqual(highVolSize);
    });
  });

  describe('Dynamic stop loss calculation', () => {
    it('should calculate ATR-based stop loss', () => {
      // Build ATR history
      const tickers = Array.from({ length: 15 }, (_, i) => ({
        ...mockTicker,
        last: (5000000 + i * 10000).toString(),
        high: (5050000 + i * 10000).toString(),
        low: (4950000 + i * 10000).toString(),
      }));

      tickers.forEach(ticker => riskManager.updateMarketData(ticker));

      const stopLoss = riskManager.calculateDynamicStopLoss('long', 5200000);
      expect(stopLoss).toBeLessThan(5200000);
      expect(stopLoss).toBeGreaterThan(5000000);
    });

    it('should provide different stop levels for different position types', () => {
      const entryPrice = 5000000;
      
      const longStop = riskManager.calculateDynamicStopLoss('long', entryPrice);
      const shortStop = riskManager.calculateDynamicStopLoss('short', entryPrice);

      expect(longStop).toBeLessThan(entryPrice);
      expect(shortStop).toBeGreaterThan(entryPrice);
    });
  });

  describe('Dynamic take profit calculation', () => {
    it('should calculate take profit based on ATR', () => {
      const entryPrice = 5000000;
      
      const takeProfit = riskManager.calculateDynamicTakeProfit('long', entryPrice);
      expect(takeProfit).toBeGreaterThan(entryPrice);
    });

    it('should adjust take profit based on market volatility', () => {
      const entryPrice = 5000000;
      
      // High volatility should lead to wider take profit targets
      const highVolTickers = Array.from({ length: 10 }, (_, i) => ({
        ...mockTicker,
        last: (5000000 + (i % 2 === 0 ? 100000 : -100000)).toString(),
        high: (5150000 + (i % 2 === 0 ? 100000 : -100000)).toString(),
        low: (4850000 + (i % 2 === 0 ? 100000 : -100000)).toString(),
      }));

      highVolTickers.forEach(ticker => riskManager.updateMarketData(ticker));
      
      const highVolTP = riskManager.calculateDynamicTakeProfit('long', entryPrice);
      
      // Compare with low volatility scenario
      const newRiskManager = new DynamicRiskManager({
        initialBalance: 100000,
        maxDrawdown: 0.15,
        maxPositionSize: 50000,
        minPositionSize: 1000,
        atrPeriod: 14,
      });

      const lowVolTickers = Array.from({ length: 10 }, (_, i) => ({
        ...mockTicker,
        last: (5000000 + i * 1000).toString(),
        high: (5005000 + i * 1000).toString(),
        low: (4995000 + i * 1000).toString(),
      }));

      lowVolTickers.forEach(ticker => newRiskManager.updateMarketData(ticker));
      
      const lowVolTP = newRiskManager.calculateDynamicTakeProfit('long', entryPrice);

      expect(highVolTP - entryPrice).toBeGreaterThan(lowVolTP - entryPrice);
    });
  });

  describe('Risk-reward optimization', () => {
    it('should optimize risk-reward ratio', () => {
      const entryPrice = 5000000;
      
      const riskReward = riskManager.calculateOptimalRiskReward('long', entryPrice);
      
      expect(riskReward.stopLoss).toBeLessThan(entryPrice);
      expect(riskReward.takeProfit).toBeGreaterThan(entryPrice);
      expect(riskReward.ratio).toBeGreaterThan(1); // Should have positive expectation
    });

    it('should suggest position size for given risk-reward', () => {
      const entryPrice = 5000000;
      const accountBalance = 100000;
      
      const suggestion = riskManager.suggestOptimalTrade('long', entryPrice, accountBalance);
      
      expect(suggestion.positionSize).toBeGreaterThan(0);
      expect(suggestion.positionSize).toBeLessThanOrEqual(50000);
      expect(suggestion.stopLoss).toBeLessThan(entryPrice);
      expect(suggestion.takeProfit).toBeGreaterThan(entryPrice);
    });
  });

  describe('Portfolio risk management', () => {
    it('should track portfolio risk metrics', () => {
      const positions = [
        { id: 'pos1', side: 'long' as const, size: 10000, entryPrice: 5000000, currentPrice: 5100000 },
        { id: 'pos2', side: 'short' as const, size: 8000, entryPrice: 4800000, currentPrice: 4750000 },
      ];

      positions.forEach(pos => {
        riskManager.addPosition(pos.id, pos.side, pos.size, pos.entryPrice);
        riskManager.updatePositionPrice(pos.id, pos.currentPrice);
      });

      const portfolioRisk = riskManager.calculatePortfolioRisk();
      
      expect(portfolioRisk.totalExposure).toBeGreaterThan(0);
      expect(portfolioRisk.unrealizedPnL).toBeDefined();
      expect(portfolioRisk.maxDrawdownRisk).toBeDefined();
    });

    it('should enforce maximum drawdown limits', () => {
      // Simulate significant losses
      riskManager.updateCurrentBalance(85000); // 15% drawdown
      
      const isAtLimit = riskManager.isAtMaxDrawdown();
      expect(isAtLimit).toBe(true);
      
      const newPositionSize = riskManager.calculateOptimalPositionSize(5000000);
      expect(newPositionSize).toBe(0); // Should not allow new positions
    });

    it('should provide position correlation analysis', () => {
      const positions = [
        { id: 'pos1', side: 'long' as const, size: 10000, entryPrice: 5000000 },
        { id: 'pos2', side: 'long' as const, size: 8000, entryPrice: 5050000 },
        { id: 'pos3', side: 'short' as const, size: 5000, entryPrice: 4900000 },
      ];

      positions.forEach(pos => {
        riskManager.addPosition(pos.id, pos.side, pos.size, pos.entryPrice);
      });

      const correlation = riskManager.calculatePositionCorrelation();
      expect(correlation.netExposure).toBeDefined();
      expect(correlation.longExposure).toBeGreaterThan(0);
      expect(correlation.shortExposure).toBeGreaterThan(0);
    });
  });

  describe('Market regime detection', () => {
    it('should detect trending market', () => {
      // Simulate strong uptrend - more aggressive movement to meet trend strength threshold
      const trendingTickers = Array.from({ length: 20 }, (_, i) => ({
        ...mockTicker,
        last: (5000000 + i * 150000).toString(), // Increased increment to ensure trend strength > 0.1
        high: (5100000 + i * 150000).toString(),
        low: (4900000 + i * 150000).toString(),
      }));

      trendingTickers.forEach(ticker => riskManager.updateMarketData(ticker));
      
      const regime = riskManager.detectMarketRegime();
      expect(regime.type).toBe('trending');
      expect(regime.direction).toBe('up');
    });

    it('should detect ranging market', () => {
      // Simulate range-bound market
      const rangingTickers = Array.from({ length: 20 }, (_, i) => ({
        ...mockTicker,
        last: (5000000 + (i % 4 - 2) * 25000).toString(),
        high: (5050000 + (i % 4 - 2) * 25000).toString(),
        low: (4950000 + (i % 4 - 2) * 25000).toString(),
      }));

      rangingTickers.forEach(ticker => riskManager.updateMarketData(ticker));
      
      const regime = riskManager.detectMarketRegime();
      expect(regime.type).toBe('ranging');
    });

    it('should adjust risk parameters based on market regime', () => {
      const entryPrice = 5000000;
      
      // Test trending market risk parameters
      const trendingTickers = Array.from({ length: 15 }, (_, i) => ({
        ...mockTicker,
        last: (5000000 + i * 30000).toString(),
        high: (5050000 + i * 30000).toString(),
        low: (4950000 + i * 30000).toString(),
      }));

      trendingTickers.forEach(ticker => riskManager.updateMarketData(ticker));
      
      const trendingParams = riskManager.getRegimeAdjustedParameters('long', entryPrice);
      
      // Reset for ranging market
      const newRiskManager = new DynamicRiskManager({
        initialBalance: 100000,
        maxDrawdown: 0.15,
        maxPositionSize: 50000,
        minPositionSize: 1000,
        atrPeriod: 14,
      });

      const rangingTickers = Array.from({ length: 15 }, (_, i) => ({
        ...mockTicker,
        last: (5000000 + (i % 6 - 3) * 10000).toString(),
        high: (5050000 + (i % 6 - 3) * 10000).toString(),
        low: (4950000 + (i % 6 - 3) * 10000).toString(),
      }));

      rangingTickers.forEach(ticker => newRiskManager.updateMarketData(ticker));
      
      const rangingParams = newRiskManager.getRegimeAdjustedParameters('long', entryPrice);

      // Trending markets typically allow wider stops and targets
      expect(trendingParams.stopDistance).toBeGreaterThanOrEqual(rangingParams.stopDistance);
    });
  });
});