import { BacktestOrchestrator } from '../backtest/backtest-orchestrator';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import { BacktestEngineConfig, OptimizationConfig, WalkForwardConfig } from '../types/backtest';
import { HistoricalDataManager } from '../data/historical-data-manager';

// Mock the HistoricalDataManager
jest.mock('../data/historical-data-manager');

describe('BacktestOrchestrator', () => {
  let orchestrator: BacktestOrchestrator;
  let config: BacktestEngineConfig;
  let strategyConfig: TradingStrategyConfig;
  let mockDataManager: jest.Mocked<HistoricalDataManager>;

  beforeEach(() => {
    config = {
      bitbankConfig: {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        baseUrl: 'https://api.bitbank.cc'
      },
      pair: 'btc_jpy',
      timeframe: '1m',
      startDate: Date.now() - 24 * 60 * 60 * 1000,
      endDate: Date.now(),
      initialBalance: 100000,
      commission: 0.001,
      slippage: 0.0005,
      maxPositionSize: 1.0,
      stopLoss: 0.02,
      takeProfit: 0.04,
      riskManagement: {
        maxConcurrentTrades: 3,
        maxDailyLoss: 0.05,
        maxDrawdown: 0.2,
        positionSizing: 'percentage'
      }
    };

    strategyConfig = {
      buyThreshold: 0.02,
      sellThreshold: 0.02,
      minProfitMargin: 0.01,
      maxTradeAmount: 10000,
      riskTolerance: 0.8
    };

    const mockData = Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now() - (100 - i) * 60 * 1000,
      open: 5000000 + Math.sin(i * 0.1) * 50000,
      high: 5000000 + Math.sin(i * 0.1) * 50000 + 10000,
      low: 5000000 + Math.sin(i * 0.1) * 50000 - 10000,
      close: 5000000 + Math.sin(i * 0.1) * 50000 + Math.random() * 20000 - 10000,
      volume: 1000 + Math.random() * 500
    }));

    mockDataManager = {
      fetchHistoricalData: jest.fn().mockResolvedValue(mockData),
      analyzeDataQuality: jest.fn().mockReturnValue({
        gaps: [],
        outliers: [],
        quality: 0.95,
        completeness: 0.98,
        consistency: 0.97,
        accuracy: 0.96
      }),
      fillDataGaps: jest.fn().mockImplementation((data) => data),
      exportData: jest.fn().mockResolvedValue('/path/to/export/file.json'),
      clearCache: jest.fn().mockResolvedValue(undefined),
      getDataStatistics: jest.fn().mockReturnValue({
        totalPoints: 100,
        startDate: Date.now() - 100 * 60 * 1000,
        endDate: Date.now(),
        avgPrice: 5000000,
        minPrice: 4950000,
        maxPrice: 5050000,
        avgVolume: 1250,
        minVolume: 1000,
        maxVolume: 1500,
        priceVolatility: 0.02,
        priceRange: 100000
      })
    } as any;

    (HistoricalDataManager as jest.Mock).mockImplementation(() => mockDataManager);
    
    orchestrator = new BacktestOrchestrator(config);
  });

  describe('runBacktest', () => {
    it('should run backtest successfully', async () => {
      const result = await orchestrator.runBacktest(strategyConfig);

      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('positions');
      expect(result).toHaveProperty('initialBalance');
      expect(result).toHaveProperty('finalBalance');
      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('totalReturnPercent');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('sharpeRatio');
      expect(result).toHaveProperty('equityCurve');

      expect(result.initialBalance).toBe(100000);
      expect(result.finalBalance).toBeGreaterThan(0);
      expect(result.trades).toBeInstanceOf(Array);
      expect(result.positions).toBeInstanceOf(Array);
      expect(result.equityCurve).toBeInstanceOf(Array);

      expect(mockDataManager.fetchHistoricalData).toHaveBeenCalledWith(
        'btc_jpy',
        '1m',
        config.startDate,
        config.endDate
      );
    });

    it('should handle empty data', async () => {
      mockDataManager.fetchHistoricalData.mockResolvedValue([]);

      const result = await orchestrator.runBacktest(strategyConfig);

      expect(result.trades).toHaveLength(0);
      expect(result.positions).toHaveLength(0);
      expect(result.totalTrades).toBe(0);
      expect(result.finalBalance).toBe(config.initialBalance);
    });

    it('should handle data fetching errors', async () => {
      mockDataManager.fetchHistoricalData.mockRejectedValue(new Error('API Error'));

      await expect(orchestrator.runBacktest(strategyConfig))
        .rejects
        .toThrow('API Error');
    });
  });

  describe('optimizeParameters', () => {
    it('should optimize parameters successfully', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 },
          { name: 'sellThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const results = await orchestrator.optimizeParameters(strategyConfig, optimizationConfig);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result).toHaveProperty('parameters');
        expect(result).toHaveProperty('fitness');
        expect(result).toHaveProperty('backtest');
        expect(result).toHaveProperty('metrics');

        expect(result.parameters).toHaveProperty('buyThreshold');
        expect(result.parameters).toHaveProperty('sellThreshold');
        expect(result.metrics).toHaveProperty('return');
        expect(result.metrics).toHaveProperty('sharpeRatio');
        expect(result.metrics).toHaveProperty('maxDrawdown');
      });

      expect(mockDataManager.fetchHistoricalData).toHaveBeenCalled();
    });

    it('should handle optimization errors', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'invalid' as any,
        parameters: [],
        fitnessFunction: 'return'
      };

      await expect(orchestrator.optimizeParameters(strategyConfig, optimizationConfig))
        .rejects
        .toThrow();
    });
  });

  describe('runWalkForwardAnalysis', () => {
    it('should run walk-forward analysis successfully', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const walkForwardConfig: WalkForwardConfig = {
        windowSize: 50,
        stepSize: 20,
        minPeriods: 30,
        optimizationPeriods: 40,
        testPeriods: 10
      };

      const result = await orchestrator.runWalkForwardAnalysis(
        strategyConfig,
        optimizationConfig,
        walkForwardConfig
      );

      expect(result).toHaveProperty('segments');
      expect(result).toHaveProperty('overallMetrics');
      expect(result).toHaveProperty('stability');
      expect(result).toHaveProperty('robustness');

      expect(result.segments).toBeInstanceOf(Array);
      expect(result.overallMetrics).toHaveProperty('totalReturn');
      expect(result.stability).toHaveProperty('consistencyScore');
      expect(result.robustness).toHaveProperty('robustnessScore');

      expect(mockDataManager.fetchHistoricalData).toHaveBeenCalled();
    });

    it('should handle insufficient data for walk-forward', async () => {
      const shortData = Array.from({ length: 10 }, (_, i) => ({
        timestamp: Date.now() - (10 - i) * 60 * 1000,
        open: 5000000,
        high: 5010000,
        low: 4990000,
        close: 5000000,
        volume: 1000
      }));

      mockDataManager.fetchHistoricalData.mockResolvedValue(shortData);

      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const walkForwardConfig: WalkForwardConfig = {
        windowSize: 50,
        stepSize: 20,
        minPeriods: 30,
        optimizationPeriods: 40,
        testPeriods: 10
      };

      const result = await orchestrator.runWalkForwardAnalysis(
        strategyConfig,
        optimizationConfig,
        walkForwardConfig
      );

      expect(result.segments).toHaveLength(0);
    });
  });

  describe('compareStrategies', () => {
    it('should compare strategies successfully', async () => {
      const strategies = [
        { name: 'Strategy A', config: { ...strategyConfig, buyThreshold: 0.01 } },
        { name: 'Strategy B', config: { ...strategyConfig, buyThreshold: 0.03 } },
        { name: 'Strategy C', config: { ...strategyConfig, sellThreshold: 0.01 } }
      ];

      const comparison = await orchestrator.compareStrategies(strategies);

      expect(comparison).toHaveProperty('strategies');
      expect(comparison).toHaveProperty('correlation');
      expect(comparison).toHaveProperty('ranking');
      expect(comparison).toHaveProperty('riskMetrics');
      expect(comparison).toHaveProperty('robustness');

      expect(comparison.strategies).toHaveLength(3);
      expect(comparison.correlation).toBeInstanceOf(Array);
      expect(comparison.correlation).toHaveLength(3);
      expect(comparison.correlation[0]).toHaveLength(3);
      expect(comparison.ranking).toHaveLength(3);

      comparison.strategies.forEach(strategy => {
        expect(strategy).toHaveProperty('name');
        expect(strategy).toHaveProperty('parameters');
        expect(strategy).toHaveProperty('metrics');
        expect(strategy).toHaveProperty('backtest');
        expect(strategy).toHaveProperty('marketConditionPerformance');
      });

      comparison.ranking.forEach((rank, index) => {
        expect(rank).toHaveProperty('name');
        expect(rank).toHaveProperty('rank');
        expect(rank).toHaveProperty('score');
        expect(rank).toHaveProperty('scoreComponents');
        expect(rank.rank).toBe(index + 1);
      });

      expect(mockDataManager.fetchHistoricalData).toHaveBeenCalled();
    });

    it('should handle single strategy comparison', async () => {
      const strategies = [
        { name: 'Single Strategy', config: strategyConfig }
      ];

      const comparison = await orchestrator.compareStrategies(strategies);

      expect(comparison.strategies).toHaveLength(1);
      expect(comparison.ranking).toHaveLength(1);
      expect(comparison.ranking[0]?.rank).toBe(1);
    });
  });

  describe('runFullAnalysis', () => {
    it('should run full analysis successfully', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const walkForwardConfig: WalkForwardConfig = {
        windowSize: 50,
        stepSize: 20,
        minPeriods: 30,
        optimizationPeriods: 40,
        testPeriods: 10
      };

      const result = await orchestrator.runFullAnalysis(
        strategyConfig,
        optimizationConfig,
        walkForwardConfig
      );

      expect(result).toHaveProperty('dataQuality');
      expect(result).toHaveProperty('baselineBacktest');
      expect(result).toHaveProperty('optimizationResults');
      expect(result).toHaveProperty('optimizedBacktest');
      expect(result).toHaveProperty('comparison');
      expect(result).toHaveProperty('walkForwardResult');
      expect(result).toHaveProperty('targetAnalysis');
      expect(result).toHaveProperty('detailedReport');
      expect(result).toHaveProperty('recommendations');

      expect(result.dataQuality).toHaveProperty('quality');
      expect(result.dataQuality.quality).toBe(0.95);

      expect(result.baselineBacktest).toHaveProperty('totalReturnPercent');
      expect(result.optimizationResults).toBeInstanceOf(Array);
      expect(result.optimizedBacktest).toHaveProperty('totalReturnPercent');
      expect(result.comparison).toHaveProperty('strategies');
      expect(result.walkForwardResult).toHaveProperty('segments');

      expect(result.targetAnalysis).toHaveProperty('targets');
      expect(result.targetAnalysis).toHaveProperty('achievements');
      expect(result.targetAnalysis).toHaveProperty('overallScore');
      expect(result.targetAnalysis).toHaveProperty('improvement');

      expect(result.targetAnalysis.targets).toHaveProperty('annualReturn');
      expect(result.targetAnalysis.targets).toHaveProperty('maxDrawdown');
      expect(result.targetAnalysis.targets).toHaveProperty('winRate');
      expect(result.targetAnalysis.targets).toHaveProperty('sharpeRatio');

      expect(result.targetAnalysis.targets.annualReturn).toBe(15);
      expect(result.targetAnalysis.targets.maxDrawdown).toBe(10);
      expect(result.targetAnalysis.targets.winRate).toBe(55);
      expect(result.targetAnalysis.targets.sharpeRatio).toBe(1.5);

      expect(result.detailedReport).toHaveProperty('summary');
      expect(result.detailedReport).toHaveProperty('tradeAnalysis');
      expect(result.detailedReport).toHaveProperty('recommendations');

      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);

      expect(mockDataManager.fetchHistoricalData).toHaveBeenCalled();
      expect(mockDataManager.analyzeDataQuality).toHaveBeenCalled();
      expect(mockDataManager.fillDataGaps).toHaveBeenCalled();
    });

    it('should run full analysis without walk-forward', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const result = await orchestrator.runFullAnalysis(
        strategyConfig,
        optimizationConfig
      );

      expect(result).toHaveProperty('dataQuality');
      expect(result).toHaveProperty('baselineBacktest');
      expect(result).toHaveProperty('optimizationResults');
      expect(result).toHaveProperty('optimizedBacktest');
      expect(result).toHaveProperty('comparison');
      expect(result).toHaveProperty('targetAnalysis');
      expect(result).toHaveProperty('detailedReport');
      expect(result).toHaveProperty('recommendations');

      expect(result.walkForwardResult).toBeUndefined();
    });

    it('should generate appropriate recommendations', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const result = await orchestrator.runFullAnalysis(
        strategyConfig,
        optimizationConfig
      );

      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);

      result.recommendations.forEach(recommendation => {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      });
    });
  });

  describe('utility methods', () => {
    it('should export results successfully', async () => {
      const mockFullResult = {
        dataQuality: { quality: 0.95 },
        baselineBacktest: { totalReturnPercent: 5 },
        optimizationResults: [],
        optimizedBacktest: { totalReturnPercent: 8, trades: [] },
        comparison: { strategies: [] },
        targetAnalysis: { overallScore: 75 },
        detailedReport: { summary: {} },
        recommendations: []
      };

      const filePath = await orchestrator.exportResults(mockFullResult as any, 'json');

      expect(typeof filePath).toBe('string');
      expect(mockDataManager.exportData).toHaveBeenCalled();
    });

    it('should export results as CSV', async () => {
      const mockFullResult = {
        dataQuality: { quality: 0.95 },
        baselineBacktest: { totalReturnPercent: 5 },
        optimizationResults: [],
        optimizedBacktest: { 
          totalReturnPercent: 8, 
          trades: [
            {
              id: 1,
              timestamp: Date.now(),
              side: 'buy',
              price: 5000000,
              amount: 0.01,
              profit: 100,
              profitPercent: 2,
              holdingPeriod: 1000,
              exitReason: 'take_profit'
            }
          ]
        },
        comparison: { strategies: [] },
        targetAnalysis: { overallScore: 75 },
        detailedReport: { summary: {} },
        recommendations: []
      };

      const filePath = await orchestrator.exportResults(mockFullResult as any, 'csv');

      expect(typeof filePath).toBe('string');
      expect(mockDataManager.exportData).toHaveBeenCalled();
    });

    it('should clear cache successfully', async () => {
      await orchestrator.clearCache();

      expect(mockDataManager.clearCache).toHaveBeenCalled();
    });

    it('should get data statistics successfully', async () => {
      const stats = await orchestrator.getDataStatistics();

      expect(stats).toHaveProperty('totalPoints');
      expect(stats).toHaveProperty('avgPrice');
      expect(stats).toHaveProperty('priceVolatility');
      expect(stats['totalPoints']).toBe(100);
      expect(stats['avgPrice']).toBe(5000000);

      expect(mockDataManager.fetchHistoricalData).toHaveBeenCalled();
      expect(mockDataManager.getDataStatistics).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle data quality issues', async () => {
      mockDataManager.analyzeDataQuality.mockReturnValue({
        gaps: [{ start: 1000, end: 2000, duration: 1000, severity: 'major' }],
        outliers: [{ timestamp: 1500, value: 10000000, expectedValue: 5000000, deviation: 5000000, severity: 'critical' }],
        quality: 0.6,
        completeness: 0.8,
        consistency: 0.7,
        accuracy: 0.5
      });

      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'buyThreshold', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      const result = await orchestrator.runFullAnalysis(
        strategyConfig,
        optimizationConfig
      );

      expect(result.dataQuality.quality).toBe(0.6);
      expect(result.dataQuality.gaps).toHaveLength(1);
      expect(result.dataQuality.outliers).toHaveLength(1);
    });

    it('should handle optimization failures gracefully', async () => {
      const optimizationConfig: OptimizationConfig = {
        method: 'grid',
        parameters: [
          { name: 'invalidParameter', min: 0.01, max: 0.03, step: 0.01 }
        ],
        fitnessFunction: 'return'
      };

      // Should not throw an error, but handle gracefully
      const result = await orchestrator.runFullAnalysis(
        strategyConfig,
        optimizationConfig
      );

      expect(result).toHaveProperty('optimizationResults');
      expect(result.optimizationResults).toBeInstanceOf(Array);
    });
  });
});