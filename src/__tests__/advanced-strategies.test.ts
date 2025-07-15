import { GridTradingStrategy } from '../strategies/grid-trading';
import { ArbitrageStrategy } from '../strategies/arbitrage';
import { MarketMakingStrategy } from '../strategies/market-making';
import { MomentumStrategy } from '../strategies/momentum';
import { MeanReversionStrategy } from '../strategies/mean-reversion';
import { MachineLearningStrategy } from '../strategies/machine-learning';
import { StrategyManager } from '../strategies/strategy-manager';
import { MarketAnalyzer } from '../analysis/market-analyzer';
import { BitbankTicker } from '../types/bitbank';
import { 
  GridTradingConfig, 
  ArbitrageConfig, 
  MarketMakingConfig, 
  MomentumConfig, 
  MeanReversionConfig, 
  MachineLearningConfig 
} from '../types/advanced-strategies';

describe('Advanced Trading Strategies', () => {
  let mockTicker: BitbankTicker;
  let mockMarketCondition: any;

  beforeEach(() => {
    mockTicker = {
      pair: 'btc_jpy',
      sell: '5000000',
      buy: '4999000',
      high: '5100000',
      low: '4900000',
      last: '5000000',
      vol: '100.5',
      timestamp: Date.now()
    };

    mockMarketCondition = {
      trend: 'sideways',
      volatility: 'medium',
      volume: 'medium',
      confidence: 0.7
    };
  });

  describe('GridTradingStrategy', () => {
    let gridStrategy: GridTradingStrategy;
    let gridConfig: GridTradingConfig;

    beforeEach(() => {
      gridConfig = {
        name: 'Grid Trading',
        enabled: true,
        weight: 0.2,
        params: {
          priceRange: 100000,
          gridLevels: 10,
          quantityPerLevel: 0.01,
          rebalanceThreshold: 0.05
        }
      };

      gridStrategy = new GridTradingStrategy(gridConfig);
    });

    test('should initialize with correct configuration', () => {
      expect(gridStrategy.name).toBe('Grid Trading');
      expect(gridStrategy.isEnabled()).toBe(true);
      expect(gridStrategy.getWeight()).toBe(0.2);
    });

    test('should update market data', () => {
      gridStrategy.updateMarketData(mockTicker);
      
      const signal = gridStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
    });

    test('should generate grid signals in sideways market', () => {
      // Update with multiple price points to establish grid
      for (let i = 0; i < 50; i++) {
        const price = 5000000 + (Math.random() - 0.5) * 50000;
        const ticker = { ...mockTicker, last: price.toString() };
        gridStrategy.updateMarketData(ticker);
      }

      const signal = gridStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal).toBeDefined();
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    });

    test('should track performance metrics', () => {
      gridStrategy.updatePerformance(100, 'win');
      gridStrategy.updatePerformance(-50, 'loss');

      const metrics = gridStrategy.getPerformanceMetrics();
      expect(metrics.totalTrades).toBe(2);
      expect(metrics.winRate).toBe(0.5);
      expect(metrics.averageProfit).toBe(25); // (100 - 50) / 2
    });
  });

  describe('ArbitrageStrategy', () => {
    let arbitrageStrategy: ArbitrageStrategy;
    let arbitrageConfig: ArbitrageConfig;

    beforeEach(() => {
      arbitrageConfig = {
        name: 'Arbitrage',
        enabled: true,
        weight: 0.15,
        params: {
          minSpread: 0.002,
          maxRiskPerTrade: 10000,
          exchangeDelayMs: 1000
        }
      };

      arbitrageStrategy = new ArbitrageStrategy(arbitrageConfig);
    });

    test('should initialize with correct configuration', () => {
      expect(arbitrageStrategy.name).toBe('Arbitrage');
      expect(arbitrageStrategy.isEnabled()).toBe(true);
      expect(arbitrageStrategy.getWeight()).toBe(0.15);
    });

    test('should generate arbitrage signals', () => {
      // Update with market data to establish price history
      for (let i = 0; i < 30; i++) {
        arbitrageStrategy.updateMarketData(mockTicker);
      }

      const signal = arbitrageStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
    });

    test('should detect statistical arbitrage opportunities', () => {
      // Create price history with significant deviation
      const prices = [5000000, 5010000, 5020000, 5030000, 5040000, 5050000, 4950000]; // Last price is low
      
      prices.forEach(price => {
        const ticker = { ...mockTicker, last: price.toString() };
        arbitrageStrategy.updateMarketData(ticker);
      });

      const signal = arbitrageStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal).toBeDefined();
    });
  });

  describe('MarketMakingStrategy', () => {
    let marketMakingStrategy: MarketMakingStrategy;
    let marketMakingConfig: MarketMakingConfig;

    beforeEach(() => {
      marketMakingConfig = {
        name: 'Market Making',
        enabled: true,
        weight: 0.25,
        params: {
          bidSpread: 0.001,
          askSpread: 0.001,
          maxInventory: 0.1,
          requoteThreshold: 0.005
        }
      };

      marketMakingStrategy = new MarketMakingStrategy(marketMakingConfig);
    });

    test('should initialize with correct configuration', () => {
      expect(marketMakingStrategy.name).toBe('Market Making');
      expect(marketMakingStrategy.isEnabled()).toBe(true);
      expect(marketMakingStrategy.getWeight()).toBe(0.25);
    });

    test('should generate market making signals', () => {
      // Update with stable market data
      for (let i = 0; i < 20; i++) {
        const price = 5000000 + (Math.random() - 0.5) * 10000; // Low volatility
        const ticker = { ...mockTicker, last: price.toString() };
        marketMakingStrategy.updateMarketData(ticker);
      }

      const signal = marketMakingStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
    });

    test('should avoid high volatility markets', () => {
      const highVolatilityCondition = {
        ...mockMarketCondition,
        volatility: 'high'
      };

      const signal = marketMakingStrategy.generateSignal(mockTicker, highVolatilityCondition);
      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('High volatility');
    });
  });

  describe('MomentumStrategy', () => {
    let momentumStrategy: MomentumStrategy;
    let momentumConfig: MomentumConfig;

    beforeEach(() => {
      momentumConfig = {
        name: 'Momentum',
        enabled: true,
        weight: 0.2,
        params: {
          lookbackPeriod: 20,
          momentumThreshold: 0.02,
          volumeConfirmation: true,
          breakoutFactor: 0.01
        }
      };

      momentumStrategy = new MomentumStrategy(momentumConfig);
    });

    test('should initialize with correct configuration', () => {
      expect(momentumStrategy.name).toBe('Momentum');
      expect(momentumStrategy.isEnabled()).toBe(true);
      expect(momentumStrategy.getWeight()).toBe(0.2);
    });

    test('should generate momentum signals in trending markets', () => {
      // Create bullish trend
      const basePrice = 5000000;
      for (let i = 0; i < 30; i++) {
        const price = basePrice + (i * 1000); // Upward trend
        const ticker = { ...mockTicker, last: price.toString() };
        momentumStrategy.updateMarketData(ticker);
      }

      const bullishCondition = { ...mockMarketCondition, trend: 'bullish' };
      const signal = momentumStrategy.generateSignal(mockTicker, bullishCondition);
      
      expect(signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
    });

    test('should avoid sideways markets', () => {
      const signal = momentumStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Sideways market');
    });
  });

  describe('MeanReversionStrategy', () => {
    let meanReversionStrategy: MeanReversionStrategy;
    let meanReversionConfig: MeanReversionConfig;

    beforeEach(() => {
      meanReversionConfig = {
        name: 'Mean Reversion',
        enabled: true,
        weight: 0.15,
        params: {
          lookbackPeriod: 20,
          standardDeviations: 2,
          minReversionStrength: 0.5,
          maxHoldingPeriod: 3600000 // 1 hour
        }
      };

      meanReversionStrategy = new MeanReversionStrategy(meanReversionConfig);
    });

    test('should initialize with correct configuration', () => {
      expect(meanReversionStrategy.name).toBe('Mean Reversion');
      expect(meanReversionStrategy.isEnabled()).toBe(true);
      expect(meanReversionStrategy.getWeight()).toBe(0.15);
    });

    test('should generate mean reversion signals', () => {
      // Create price history with mean reversion opportunity
      const basePrice = 5000000;
      
      // First, establish a mean around basePrice
      for (let i = 0; i < 25; i++) {
        const price = basePrice + (Math.random() - 0.5) * 20000;
        const ticker = { ...mockTicker, last: price.toString() };
        meanReversionStrategy.updateMarketData(ticker);
      }

      // Then add an extreme price (potential reversion opportunity)
      const extremePrice = basePrice + 150000; // Significantly above mean
      const extremeTicker = { ...mockTicker, last: extremePrice.toString() };
      meanReversionStrategy.updateMarketData(extremeTicker);

      const signal = meanReversionStrategy.generateSignal(extremeTicker, mockMarketCondition);
      expect(signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
    });

    test('should work best in sideways markets', () => {
      const signal = meanReversionStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal).toBeDefined();
      // Should not immediately reject sideways markets
    });
  });

  describe('MachineLearningStrategy', () => {
    let mlStrategy: MachineLearningStrategy;
    let mlConfig: MachineLearningConfig;

    beforeEach(() => {
      mlConfig = {
        name: 'Machine Learning',
        enabled: true,
        weight: 0.3,
        params: {
          features: ['price_ma_5', 'price_ma_10', 'volume_ma_5', 'rsi_14'],
          modelType: 'linear',
          trainingPeriod: 100,
          retrainInterval: 3600, // 1 hour
          predictionHorizon: 5
        }
      };

      mlStrategy = new MachineLearningStrategy(mlConfig);
    });

    test('should initialize with correct configuration', () => {
      expect(mlStrategy.name).toBe('Machine Learning');
      expect(mlStrategy.isEnabled()).toBe(true);
      expect(mlStrategy.getWeight()).toBe(0.3);
    });

    test('should collect training data', () => {
      // Provide sufficient data for feature extraction
      for (let i = 0; i < 60; i++) {
        const price = 5000000 + (Math.random() - 0.5) * 100000;
        const volume = 100 + (Math.random() - 0.5) * 50;
        const ticker = { ...mockTicker, last: price.toString(), vol: volume.toString() };
        mlStrategy.updateMarketData(ticker);
      }

      const signal = mlStrategy.generateSignal(mockTicker, mockMarketCondition);
      expect(signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
    });

    test('should return model info', () => {
      const modelInfo = mlStrategy.getModelInfo();
      expect(modelInfo).toBeDefined();
      expect(modelInfo.features).toEqual(mlConfig.params.features);
      expect(typeof modelInfo.trained).toBe('boolean');
      expect(typeof modelInfo.accuracy).toBe('number');
    });
  });

  describe('MarketAnalyzer', () => {
    let marketAnalyzer: MarketAnalyzer;

    beforeEach(() => {
      marketAnalyzer = new MarketAnalyzer();
    });

    test('should analyze market conditions', () => {
      // Provide market data
      for (let i = 0; i < 30; i++) {
        const price = 5000000 + (Math.random() - 0.5) * 100000;
        const ticker = { ...mockTicker, last: price.toString() };
        marketAnalyzer.updateMarketData(ticker);
      }

      const analysis = marketAnalyzer.analyzeMarket();
      expect(analysis).toBeDefined();
      expect(analysis.condition).toBeDefined();
      expect(['bullish', 'bearish', 'sideways']).toContain(analysis.condition.trend);
      expect(['low', 'medium', 'high']).toContain(analysis.condition.volatility);
      expect(['low', 'medium', 'high']).toContain(analysis.condition.volume);
      expect(analysis.recommendedStrategies).toBeDefined();
      expect(Array.isArray(analysis.recommendedStrategies)).toBe(true);
    });

    test('should provide market summary', () => {
      for (let i = 0; i < 20; i++) {
        const price = 5000000 + i * 1000;
        const ticker = { ...mockTicker, last: price.toString() };
        marketAnalyzer.updateMarketData(ticker);
      }

      const summary = marketAnalyzer.getMarketSummary();
      expect(summary).toBeDefined();
      expect(typeof summary.currentPrice).toBe('number');
      expect(typeof summary.priceChange24h).toBe('number');
      expect(typeof summary.volatility).toBe('number');
      expect(typeof summary.volume24h).toBe('number');
      expect(typeof summary.trend).toBe('string');
    });
  });

  describe('StrategyManager', () => {
    let strategyManager: StrategyManager;
    let strategyConfig: any;

    beforeEach(() => {
      strategyConfig = {
        totalCapital: 1000000,
        maxConcurrentStrategies: 3,
        rebalanceInterval: 3600,
        performanceWindowSize: 100,
        minStrategyWeight: 0.05,
        maxStrategyWeight: 0.5,
        strategies: {
          gridTrading: {
            name: 'Grid Trading',
            enabled: true,
            weight: 0.2,
            params: {
              priceRange: 100000,
              gridLevels: 10,
              quantityPerLevel: 0.01,
              rebalanceThreshold: 0.05
            }
          },
          arbitrage: {
            name: 'Arbitrage',
            enabled: true,
            weight: 0.15,
            params: {
              minSpread: 0.002,
              maxRiskPerTrade: 10000,
              exchangeDelayMs: 1000
            }
          },
          marketMaking: {
            name: 'Market Making',
            enabled: true,
            weight: 0.25,
            params: {
              bidSpread: 0.001,
              askSpread: 0.001,
              maxInventory: 0.1,
              requoteThreshold: 0.005
            }
          },
          momentum: {
            name: 'Momentum',
            enabled: true,
            weight: 0.2,
            params: {
              lookbackPeriod: 20,
              momentumThreshold: 0.02,
              volumeConfirmation: true,
              breakoutFactor: 0.01
            }
          },
          meanReversion: {
            name: 'Mean Reversion',
            enabled: true,
            weight: 0.15,
            params: {
              lookbackPeriod: 20,
              standardDeviations: 2,
              minReversionStrength: 0.5,
              maxHoldingPeriod: 3600000
            }
          },
          machineLearning: {
            name: 'Machine Learning',
            enabled: true,
            weight: 0.3,
            params: {
              features: ['price_ma_5', 'price_ma_10', 'volume_ma_5', 'rsi_14'],
              modelType: 'linear',
              trainingPeriod: 100,
              retrainInterval: 3600,
              predictionHorizon: 5
            }
          }
        }
      };

      strategyManager = new StrategyManager(strategyConfig);
    });

    test('should initialize with all strategies', () => {
      const summary = strategyManager.getPortfolioSummary();
      expect(summary.performanceMetrics).toHaveLength(6);
      expect(summary.totalAllocatedCapital).toBe(1000000);
    });

    test('should generate combined signals', () => {
      // Provide market data
      for (let i = 0; i < 30; i++) {
        const price = 5000000 + (Math.random() - 0.5) * 50000;
        const ticker = { ...mockTicker, last: price.toString() };
        strategyManager.updateMarketData(ticker);
      }

      const combinedSignal = strategyManager.generateCombinedSignal(mockTicker);
      expect(combinedSignal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(combinedSignal.action);
      expect(combinedSignal.confidence).toBeGreaterThanOrEqual(0);
      expect(combinedSignal.confidence).toBeLessThanOrEqual(1);
    });

    test('should provide strategy recommendations', () => {
      const recommendations = strategyManager.getStrategyRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
      
      recommendations.forEach(rec => {
        expect(rec).toHaveProperty('strategy');
        expect(rec).toHaveProperty('reason');
        expect(rec).toHaveProperty('weight');
      });
    });

    test('should track best performing strategy', () => {
      // Simulate some performance
      strategyManager.updateStrategyPerformance('Grid Trading', 100, 'win');
      strategyManager.updateStrategyPerformance('Arbitrage', 50, 'win');
      strategyManager.updateStrategyPerformance('Momentum', -20, 'loss');

      const bestStrategy = strategyManager.getBestPerformingStrategy();
      expect(bestStrategy).toBeDefined();
      expect(bestStrategy?.name).toBeDefined();
      expect(bestStrategy?.performance).toBeDefined();
    });

    test('should enable/disable strategies', () => {
      strategyManager.enableStrategy('Grid Trading', false);
      const gridStrategy = strategyManager.getStrategy('Grid Trading');
      expect(gridStrategy?.isEnabled()).toBe(false);

      strategyManager.enableStrategy('Grid Trading', true);
      expect(gridStrategy?.isEnabled()).toBe(true);
    });

    test('should update strategy weights', () => {
      strategyManager.updateStrategyWeight('Grid Trading', 0.3);
      const summary = strategyManager.getPortfolioSummary();
      const gridAllocation = summary.allocations.find(a => a.strategyName === 'Grid Trading');
      expect(gridAllocation?.weight).toBe(0.3);
    });
  });
});