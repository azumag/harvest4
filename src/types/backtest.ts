export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalDataPoint {
  timestamp: number;
  price: number;
  volume: number;
  buy: number;
  sell: number;
  high: number;
  low: number;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  side: 'buy' | 'sell';
  amount: number;
  profit: number;
  commission: number;
  slippage: number;
  reason: string;
}

export interface BacktestConfig {
  startDate: number;
  endDate: number;
  initialBalance: number;
  commission: number;
  slippage: number;
  maxPositionSize: number;
  strategy: any;
}

export interface OptimizationResult {
  parameters: Record<string, any>;
  result: BacktestResult;
  score: number;
}

export interface ParameterRange {
  min: number;
  max: number;
  step: number;
}

export interface OptimizationConfig {
  parameters: Record<string, ParameterRange>;
  objective: 'profit' | 'sharpe' | 'winRate' | 'drawdown';
  populationSize?: number;
  generations?: number;
  crossoverRate?: number;
  mutationRate?: number;
}

export interface DataQuality {
  totalPoints: number;
  missingPoints: number;
  duplicatePoints: number;
  invalidPoints: number;
  dataGaps: Array<{ start: number; end: number; duration: number }>;
  qualityScore: number;
}

export interface MarketCondition {
  period: { start: number; end: number };
  trend: 'bullish' | 'bearish' | 'sideways';
  volatility: 'low' | 'medium' | 'high';
  volume: 'low' | 'medium' | 'high';
  characteristics: string[];
}

export interface WalkForwardResult {
  inSamplePeriod: { start: number; end: number };
  outSamplePeriod: { start: number; end: number };
  inSampleResult: BacktestResult;
  outSampleResult: BacktestResult;
  parameters: Record<string, any>;
  degradation: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  beta: number;
  alpha: number;
  informationRatio: number;
  trackingError: number;
}

export interface StrategyComparison {
  name: string;
  result: BacktestResult;
  metrics: PerformanceMetrics;
  rank: number;
  score: number;
}

export interface BacktestReport {
  summary: BacktestResult;
  metrics: PerformanceMetrics;
  marketConditions: MarketCondition[];
  monthlyReturns: Array<{ month: string; return: number }>;
  yearlyReturns: Array<{ year: number; return: number }>;
  drawdownPeriods: Array<{ start: number; end: number; depth: number; duration: number }>;
  tradeDistribution: {
    profitable: number;
    unprofitable: number;
    breakeven: number;
    profitDistribution: number[];
    lossDistribution: number[];
  };
  riskMetrics: {
    valueAtRisk: number;
    conditionalVaR: number;
    skewness: number;
    kurtosis: number;
    tailRatio: number;
  };
}