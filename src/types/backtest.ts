// Import types as needed

export interface HistoricalDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestConfig {
  startDate: number;
  endDate: number;
  initialBalance: number;
  commission: number;
  slippage: number;
  maxPositionSize: number;
  stopLoss: number;
  takeProfit: number;
  pair: string;
  timeframe: string;
}

export interface BacktestTrade {
  id: number;
  timestamp: number;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  commission: number;
  slippage: number;
  stopLoss?: number;
  takeProfit?: number;
  exitTimestamp?: number;
  exitPrice?: number;
  exitReason?: 'stop_loss' | 'take_profit' | 'signal' | 'end_of_test';
  profit?: number;
  profitPercent?: number;
  holdingPeriod?: number;
}

export interface BacktestPosition {
  id: number;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  entryTimestamp: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  realizedPnl?: number;
  isOpen: boolean;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  positions: BacktestPosition[];
  initialBalance: number;
  finalBalance: number;
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageHoldingPeriod: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxRunup: number;
  maxRunupPercent: number;
  recoveryFactor: number;
  expectancy: number;
  equityCurve: EquityPoint[];
  drawdownCurve: DrawdownPoint[];
  monthlyReturns: MonthlyReturn[];
  annualizedReturn: number;
  annualizedVolatility: number;
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  skewness: number;
  kurtosis: number;
  ulcerIndex: number;
  gainToPainRatio: number;
  sterlingRatio: number;
  burkeRatio: number;
  martin_ratio: number;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
}

export interface DrawdownPoint {
  timestamp: number;
  drawdown: number;
  drawdownPercent: number;
  underwater: number;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
  returnPercent: number;
}

export interface OptimizationParameter {
  name: string;
  min: number;
  max: number;
  step: number;
  current?: number;
}

export interface OptimizationResult {
  parameters: Record<string, number>;
  fitness: number;
  backtest: BacktestResult;
  metrics: {
    return: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    calmarRatio: number;
  };
}

export interface OptimizationConfig {
  method: 'grid' | 'genetic' | 'random';
  parameters: OptimizationParameter[];
  fitnessFunction: 'return' | 'sharpe' | 'calmar' | 'profit_factor' | 'composite';
  maxIterations?: number;
  populationSize?: number;
  mutationRate?: number;
  crossoverRate?: number;
  eliteSize?: number;
  convergenceThreshold?: number;
  parallelism?: number;
}

export interface WalkForwardConfig {
  windowSize: number;
  stepSize: number;
  minPeriods: number;
  optimizationPeriods: number;
  testPeriods: number;
}

export interface WalkForwardResult {
  segments: WalkForwardSegment[];
  overallMetrics: PerformanceMetrics;
  stability: StabilityMetrics;
  robustness: RobustnessMetrics;
}

export interface WalkForwardSegment {
  startDate: number;
  endDate: number;
  optimizationPeriod: [number, number];
  testPeriod: [number, number];
  bestParameters: Record<string, number>;
  inSampleResult: BacktestResult;
  outOfSampleResult: BacktestResult;
  degradation: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  calmarRatio: number;
  sortinoRatio: number;
  var95: number;
  cvar95: number;
  ulcerIndex: number;
}

export interface StabilityMetrics {
  parameterStability: number;
  performanceStability: number;
  returnStability: number;
  drawdownStability: number;
  consistencyScore: number;
}

export interface RobustnessMetrics {
  monteCarloPValue: number;
  permutationPValue: number;
  whiteRealityCheck: number;
  overfittingIndex: number;
  robustnessScore: number;
}

export interface MarketCondition {
  name: string;
  startDate: number;
  endDate: number;
  condition: 'bull' | 'bear' | 'sideways' | 'volatile' | 'calm';
  characteristics: {
    volatility: number;
    trend: number;
    momentum: number;
    volume: number;
  };
}

export interface StrategyComparison {
  strategies: StrategyPerformance[];
  correlation: number[][];
  ranking: StrategyRanking[];
  riskMetrics: RiskComparison;
  robustness: RobustnessComparison;
}

export interface StrategyPerformance {
  name: string;
  parameters: Record<string, number>;
  metrics: PerformanceMetrics;
  backtest: BacktestResult;
  marketConditionPerformance: MarketConditionPerformance[];
}

export interface StrategyRanking {
  name: string;
  rank: number;
  score: number;
  scoreComponents: {
    return: number;
    risk: number;
    consistency: number;
    robustness: number;
  };
}

export interface MarketConditionPerformance {
  condition: MarketCondition;
  metrics: PerformanceMetrics;
  relativePerformance: number;
}

export interface RiskComparison {
  correlationMatrix: number[][];
  diversificationBenefit: number;
  portfolioMetrics: PerformanceMetrics;
  individualRisks: number[];
  portfolioRisk: number;
}

export interface RobustnessComparison {
  strategies: string[];
  whiteRealityCheck: number[];
  monteCarloAnalysis: MonteCarloResult[];
  sensitivity: SensitivityAnalysis[];
}

export interface MonteCarloResult {
  strategy: string;
  originalReturn: number;
  simulationResults: number[];
  pValue: number;
  confidence95: [number, number];
  confidence99: [number, number];
}

export interface SensitivityAnalysis {
  strategy: string;
  parameter: string;
  values: number[];
  returns: number[];
  sensitivity: number;
  stability: number;
}

export interface DataQuality {
  gaps: DataGap[];
  outliers: DataOutlier[];
  quality: number;
  completeness: number;
  consistency: number;
  accuracy: number;
}

export interface DataGap {
  start: number;
  end: number;
  duration: number;
  severity: 'minor' | 'major' | 'critical';
}

export interface DataOutlier {
  timestamp: number;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: 'minor' | 'major' | 'critical';
}

export interface BacktestEngineConfig {
  bitbankConfig: {
    apiKey: string;
    apiSecret: string;
    baseUrl: string;
  };
  pair: string;
  timeframe: string;
  startDate: number;
  endDate: number;
  initialBalance: number;
  commission: number;
  slippage: number;
  maxPositionSize: number;
  stopLoss: number;
  takeProfit: number;
  riskManagement: {
    maxConcurrentTrades: number;
    maxDailyLoss: number;
    maxDrawdown: number;
    positionSizing: 'fixed' | 'percentage' | 'volatility' | 'kelly';
  };
}

export interface HistoricalDataConfig {
  pair: string;
  timeframes: string[];
  startDate: number;
  endDate: number;
  source: 'bitbank' | 'file' | 'cache';
  cachePath?: string;
  fetchInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
}