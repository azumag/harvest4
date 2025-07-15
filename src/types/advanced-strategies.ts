import { TradingSignal, BitbankTicker } from './bitbank';

export interface AdvancedStrategyConfig {
  name: string;
  enabled: boolean;
  weight: number;
  params: Record<string, unknown>;
}

export interface GridTradingConfig extends AdvancedStrategyConfig {
  params: {
    priceRange: number;
    gridLevels: number;
    quantityPerLevel: number;
    rebalanceThreshold: number;
  };
}

export interface ArbitrageConfig extends AdvancedStrategyConfig {
  params: {
    minSpread: number;
    maxRiskPerTrade: number;
    exchangeDelayMs: number;
  };
}

export interface MarketMakingConfig extends AdvancedStrategyConfig {
  params: {
    bidSpread: number;
    askSpread: number;
    maxInventory: number;
    requoteThreshold: number;
  };
}

export interface MomentumConfig extends AdvancedStrategyConfig {
  params: {
    lookbackPeriod: number;
    momentumThreshold: number;
    volumeConfirmation: boolean;
    breakoutFactor: number;
  };
}

export interface MeanReversionConfig extends AdvancedStrategyConfig {
  params: {
    lookbackPeriod: number;
    standardDeviations: number;
    minReversionStrength: number;
    maxHoldingPeriod: number;
  };
}

export interface MachineLearningConfig extends AdvancedStrategyConfig {
  params: {
    features: string[];
    modelType: 'linear' | 'svm' | 'random_forest';
    trainingPeriod: number;
    retrainInterval: number;
    predictionHorizon: number;
  };
}

export interface MarketCondition {
  trend: 'bullish' | 'bearish' | 'sideways';
  volatility: 'low' | 'medium' | 'high';
  volume: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface StrategyPerformance {
  name: string;
  totalTrades: number;
  winRate: number;
  averageProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  lastUpdated: number;
}

export interface AdvancedTradingStrategy {
  name: string;
  config: AdvancedStrategyConfig;
  
  updateMarketData(ticker: BitbankTicker): void;
  generateSignal(ticker: BitbankTicker, marketCondition: MarketCondition): TradingSignal;
  updatePerformance(profit: number, tradeResult: 'win' | 'loss'): void;
  getPerformanceMetrics(): StrategyPerformance;
  isEnabled(): boolean;
  getWeight(): number;
}

export interface PortfolioAllocation {
  strategyName: string;
  weight: number;
  allocatedAmount: number;
  currentPositions: number;
  expectedReturn: number;
  riskLevel: number;
}

export interface MarketAnalysis {
  condition: MarketCondition;
  recommendedStrategies: string[];
  riskLevel: number;
  expectedVolatility: number;
  timestamp: number;
}