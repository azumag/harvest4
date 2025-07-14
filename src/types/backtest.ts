export interface HistoricalCandle {
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
  pair: string;
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
  commission: number;
  slippage: number;
  maxPositionSize: number;
}

export interface BacktestPosition {
  side: 'buy' | 'sell';
  amount: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: number;
  exitTime?: number;
  commission: number;
  slippage: number;
  pnl?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'open' | 'closed';
}

export interface BacktestTrade {
  id: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number;
  commission: number;
  slippage: number;
  pnl: number;
  isWinning: boolean;
  holdingPeriod: number;
  drawdown: number;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  annualizedReturn: number;
  totalProfit: number;
  totalLoss: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  volatility: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  trades: BacktestTrade[];
  equity: EquityPoint[];
  drawdownPeriods: DrawdownPeriod[];
}

export interface EquityPoint {
  timestamp: number;
  balance: number;
  drawdown: number;
}

export interface DrawdownPeriod {
  start: number;
  end: number;
  peak: number;
  trough: number;
  duration: number;
  recovery?: number;
}

export interface PerformanceMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  volatility: number;
  skewness: number;
  kurtosis: number;
  var95: number;
  cvar95: number;
  ulcerIndex: number;
  recoveryFactor: number;
  profitFactor: number;
  expectedValue: number;
  gainToPainRatio: number;
  lakeRatio: number;
  totalReturn: number;
  winRate: number;
}

export interface OptimizationConfig {
  parameters: { [key: string]: number[] };
  metric: keyof PerformanceMetrics;
  direction: 'maximize' | 'minimize';
  walkForward?: {
    enabled: boolean;
    trainingPeriod: number;
    testingPeriod: number;
    reoptimizationFrequency: number;
  };
  genetic?: {
    enabled: boolean;
    populationSize: number;
    generations: number;
    mutationRate: number;
    crossoverRate: number;
  };
}

export interface OptimizationResult {
  bestParameters: { [key: string]: number };
  bestScore: number;
  allResults: Array<{
    parameters: { [key: string]: number };
    score: number;
    backtest: BacktestResult;
  }>;
  convergence: number[];
  overfittingScore: number;
  robustnessScore: number;
}

export interface MarketCondition {
  period: string;
  startDate: number;
  endDate: number;
  trend: 'bull' | 'bear' | 'sideways';
  volatility: 'low' | 'medium' | 'high';
  volume: 'low' | 'medium' | 'high';
  returns: number;
  maxDrawdown: number;
}

export interface StrategyComparison {
  strategies: Array<{
    name: string;
    results: BacktestResult;
    metrics: PerformanceMetrics;
  }>;
  ranking: Array<{
    name: string;
    score: number;
    rank: number;
  }>;
  correlation: { [key: string]: { [key: string]: number } };
  benchmark: {
    name: string;
    results: BacktestResult;
    metrics: PerformanceMetrics;
  };
}