import { TrailingStopManager } from '../utils/trailing-stop';

describe('TrailingStopManager', () => {
  let trailingStop: TrailingStopManager;

  beforeEach(() => {
    trailingStop = new TrailingStopManager();
  });

  describe('Long position trailing stop', () => {
    it('should create trailing stop for long position', () => {
      const entryPrice = 5000000; // 5M JPY
      const initialStopDistance = 0.02; // 2%
      
      trailingStop.createTrailingStop('long_pos_1', 'long', entryPrice, initialStopDistance);
      
      const stopLevel = trailingStop.getCurrentStopLevel('long_pos_1');
      expect(stopLevel).toBeCloseTo(4900000, 0); // 2% below entry
    });

    it('should update trailing stop when price moves favorably', () => {
      const entryPrice = 5000000;
      const initialStopDistance = 0.02;
      
      trailingStop.createTrailingStop('long_pos_1', 'long', entryPrice, initialStopDistance);
      
      // Price moves up 5%
      const newPrice = 5250000;
      trailingStop.updateTrailingStop('long_pos_1', newPrice);
      
      const stopLevel = trailingStop.getCurrentStopLevel('long_pos_1');
      expect(stopLevel).toBeCloseTo(5145000, 0); // 2% below new high
    });

    it('should not lower stop level when price moves against position', () => {
      const entryPrice = 5000000;
      const initialStopDistance = 0.02;
      
      trailingStop.createTrailingStop('long_pos_1', 'long', entryPrice, initialStopDistance);
      
      // Price moves up first
      trailingStop.updateTrailingStop('long_pos_1', 5200000);
      const stopAfterUp = trailingStop.getCurrentStopLevel('long_pos_1');
      
      // Price moves down
      trailingStop.updateTrailingStop('long_pos_1', 5100000);
      const stopAfterDown = trailingStop.getCurrentStopLevel('long_pos_1');
      
      expect(stopAfterDown).toBe(stopAfterUp); // Should not change
    });

    it('should trigger stop when price hits stop level', () => {
      const entryPrice = 5000000;
      const initialStopDistance = 0.02;
      
      trailingStop.createTrailingStop('long_pos_1', 'long', entryPrice, initialStopDistance);
      
      const isTriggered = trailingStop.checkStopTrigger('long_pos_1', 4890000);
      expect(isTriggered).toBe(true);
    });
  });

  describe('Short position trailing stop', () => {
    it('should create trailing stop for short position', () => {
      const entryPrice = 5000000;
      const initialStopDistance = 0.02;
      
      trailingStop.createTrailingStop('short_pos_1', 'short', entryPrice, initialStopDistance);
      
      const stopLevel = trailingStop.getCurrentStopLevel('short_pos_1');
      expect(stopLevel).toBeCloseTo(5100000, 0); // 2% above entry
    });

    it('should update trailing stop when price moves favorably', () => {
      const entryPrice = 5000000;
      const initialStopDistance = 0.02;
      
      trailingStop.createTrailingStop('short_pos_1', 'short', entryPrice, initialStopDistance);
      
      // Price moves down 5%
      const newPrice = 4750000;
      trailingStop.updateTrailingStop('short_pos_1', newPrice);
      
      const stopLevel = trailingStop.getCurrentStopLevel('short_pos_1');
      expect(stopLevel).toBeCloseTo(4845000, 0); // 2% above new low
    });

    it('should trigger stop when price hits stop level', () => {
      const entryPrice = 5000000;
      const initialStopDistance = 0.02;
      
      trailingStop.createTrailingStop('short_pos_1', 'short', entryPrice, initialStopDistance);
      
      const isTriggered = trailingStop.checkStopTrigger('short_pos_1', 5110000);
      expect(isTriggered).toBe(true);
    });
  });

  describe('ATR-based trailing stop', () => {
    it('should create ATR-based trailing stop', () => {
      const entryPrice = 5000000;
      const atrValue = 50000; // 50K JPY ATR
      const atrMultiplier = 2.0;
      
      trailingStop.createATRTrailingStop('atr_pos_1', 'long', entryPrice, atrValue, atrMultiplier);
      
      const stopLevel = trailingStop.getCurrentStopLevel('atr_pos_1');
      expect(stopLevel).toBeCloseTo(4900000, 0); // 2 * ATR below entry
    });

    it('should update ATR stop distance when ATR changes', () => {
      const entryPrice = 5000000;
      const initialATR = 50000;
      const atrMultiplier = 2.0;
      
      trailingStop.createATRTrailingStop('atr_pos_1', 'long', entryPrice, initialATR, atrMultiplier);
      
      // ATR increases (more volatile market)
      const newATR = 75000;
      trailingStop.updateATRDistance('atr_pos_1', newATR);
      
      // Price moves up
      trailingStop.updateTrailingStop('atr_pos_1', 5200000);
      
      const stopLevel = trailingStop.getCurrentStopLevel('atr_pos_1');
      // Should use new ATR: 5200000 - (2 * 75000) = 5050000
      expect(stopLevel).toBeCloseTo(5050000, 0);
    });
  });

  describe('Stepped trailing stop', () => {
    it('should implement stepped trailing stop', () => {
      const entryPrice = 5000000;
      const steps = [
        { profitThreshold: 0.02, stopDistance: 0.015 }, // At 2% profit, tighten to 1.5%
        { profitThreshold: 0.05, stopDistance: 0.01 },  // At 5% profit, tighten to 1%
        { profitThreshold: 0.10, stopDistance: 0.005 }, // At 10% profit, tighten to 0.5%
      ];
      
      trailingStop.createSteppedTrailingStop('stepped_pos_1', 'long', entryPrice, 0.02, steps);
      
      // Price at 3% profit
      trailingStop.updateTrailingStop('stepped_pos_1', 5150000);
      let stopLevel = trailingStop.getCurrentStopLevel('stepped_pos_1');
      expect(stopLevel).toBeCloseTo(5072750, 0); // 1.5% below current price
      
      // Price at 6% profit
      trailingStop.updateTrailingStop('stepped_pos_1', 5300000);
      stopLevel = trailingStop.getCurrentStopLevel('stepped_pos_1');
      expect(stopLevel).toBeCloseTo(5247000, 0); // 1% below current price
    });
  });

  describe('Position management', () => {
    it('should handle multiple positions', () => {
      trailingStop.createTrailingStop('pos_1', 'long', 5000000, 0.02);
      trailingStop.createTrailingStop('pos_2', 'short', 4800000, 0.025);
      
      const activePoisitions = trailingStop.getActivePositions();
      expect(activePoisitions).toHaveLength(2);
      expect(activePoisitions).toContain('pos_1');
      expect(activePoisitions).toContain('pos_2');
    });

    it('should remove position when stop is triggered', () => {
      trailingStop.createTrailingStop('pos_1', 'long', 5000000, 0.02);
      
      // Trigger the stop
      trailingStop.checkStopTrigger('pos_1', 4890000);
      
      const activePositions = trailingStop.getActivePositions();
      expect(activePositions).not.toContain('pos_1');
    });

    it('should close position manually', () => {
      trailingStop.createTrailingStop('pos_1', 'long', 5000000, 0.02);
      
      trailingStop.closePosition('pos_1');
      
      const activePositions = trailingStop.getActivePositions();
      expect(activePositions).not.toContain('pos_1');
    });

    it('should get position information', () => {
      const entryPrice = 5000000;
      const stopDistance = 0.02;
      
      trailingStop.createTrailingStop('pos_1', 'long', entryPrice, stopDistance);
      trailingStop.updateTrailingStop('pos_1', 5100000);
      
      const posInfo = trailingStop.getPositionInfo('pos_1');
      expect(posInfo).toBeDefined();
      expect(posInfo?.entryPrice).toBe(entryPrice);
      expect(posInfo?.side).toBe('long');
      expect(posInfo?.currentPrice).toBe(5100000);
    });
  });

  describe('Advanced features', () => {
    it('should calculate unrealized profit', () => {
      trailingStop.createTrailingStop('pos_1', 'long', 5000000, 0.02);
      trailingStop.updateTrailingStop('pos_1', 5200000);
      
      const profit = trailingStop.getUnrealizedProfit('pos_1', 0.01); // 0.01 BTC position
      expect(profit).toBeCloseTo(2000, 0); // 200K JPY * 0.01 BTC = 2000 JPY
    });

    it('should calculate profit percentage', () => {
      trailingStop.createTrailingStop('pos_1', 'long', 5000000, 0.02);
      trailingStop.updateTrailingStop('pos_1', 5250000);
      
      const profitPct = trailingStop.getProfitPercentage('pos_1');
      expect(profitPct).toBeCloseTo(0.05, 3); // 5% profit
    });

    it('should handle breakeven stop adjustment', () => {
      const entryPrice = 5000000;
      
      trailingStop.createTrailingStop('pos_1', 'long', entryPrice, 0.02);
      
      // Price moves up significantly
      trailingStop.updateTrailingStop('pos_1', 5300000);
      
      // Move to breakeven
      trailingStop.moveToBreakeven('pos_1');
      
      const stopLevel = trailingStop.getCurrentStopLevel('pos_1');
      expect(stopLevel).toBeCloseTo(entryPrice, 0);
    });

    it('should support partial position closing', () => {
      trailingStop.createTrailingStop('pos_1', 'long', 5000000, 0.02);
      
      // Close 50% at 5200000
      trailingStop.addPartialClose('pos_1', 5200000, 0.5);
      
      const partialCloses = trailingStop.getPartialCloses('pos_1');
      expect(partialCloses).toHaveLength(1);
      expect(partialCloses[0]?.price).toBe(5200000);
      expect(partialCloses[0]?.percentage).toBe(0.5);
    });
  });
});