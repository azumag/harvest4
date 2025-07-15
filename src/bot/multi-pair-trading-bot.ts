import { OptimizedBitbankClient } from '../api/optimized-bitbank-client';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { ProfitCalculator } from '../utils/profit-calculator';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { WorkerPool } from '../utils/worker-pool';
import { BitbankConfig, TradingSignal, TradingPosition, BitbankTicker } from '../types/bitbank';

export interface MultiPairTradingConfig extends BitbankConfig {
  pairs: string[];
  strategy: TradingStrategyConfig;
  initialBalance: number;
  maxConcurrentTradesPerPair: number;
  totalMaxConcurrentTrades: number;
  tradingInterval: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  fundAllocationStrategy: 'equal' | 'weighted' | 'dynamic';
  correlationThreshold: number;
  enableCorrelationAnalysis: boolean;
}

interface PairState {
  pair: string;
  strategy: TradingStrategy;
  profitCalculator: ProfitCalculator;
  activePositions: Map<string, TradingPosition>;
  lastTradeTime: number;
  isActive: boolean;
  allocatedFunds: number;
  performance: {
    totalProfit: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
}

interface CorrelationData {
  pair1: string;
  pair2: string;
  correlation: number;
  lastUpdated: number;
}

export class MultiPairTradingBot {
  private client: OptimizedBitbankClient;
  private config: MultiPairTradingConfig;
  private pairStates: Map<string, PairState> = new Map();
  private performanceMonitor: PerformanceMonitor;
  private workerPool: WorkerPool;
  private isRunning = false;
  private tradingInterval: NodeJS.Timeout | null = null;
  private correlationMatrix: Map<string, CorrelationData[]> = new Map();
  private priceHistory: Map<string, number[]> = new Map();
  private readonly MIN_TRADE_INTERVAL = 60000; // 1 minute minimum between trades
  private readonly CORRELATION_HISTORY_SIZE = 100;

  constructor(config: MultiPairTradingConfig) {
    this.config = config;
    this.client = new OptimizedBitbankClient(config);
    this.performanceMonitor = new PerformanceMonitor();
    this.workerPool = new WorkerPool(Math.min(config.pairs.length * 2, 8)); // Adaptive worker pool size

    this.initializePairStates();
    this.setupWorkerTasks();
  }

  private initializePairStates(): void {
    const fundsPerPair = this.calculateInitialFundAllocation();

    for (const pair of this.config.pairs) {
      const pairState: PairState = {
        pair,
        strategy: new TradingStrategy(this.config.strategy),
        profitCalculator: new ProfitCalculator(fundsPerPair),
        activePositions: new Map(),
        lastTradeTime: 0,
        isActive: true,
        allocatedFunds: fundsPerPair,
        performance: {
          totalProfit: 0,
          winRate: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
        },
      };

      this.pairStates.set(pair, pairState);
      this.priceHistory.set(pair, []);
    }
  }

  private calculateInitialFundAllocation(): number {
    switch (this.config.fundAllocationStrategy) {
      case 'equal':
        return this.config.initialBalance / this.config.pairs.length;
      case 'weighted':
        // Implement weighted allocation based on historical performance
        return this.config.initialBalance / this.config.pairs.length;
      case 'dynamic':
        // Start with equal allocation, will be adjusted dynamically
        return this.config.initialBalance / this.config.pairs.length;
      default:
        return this.config.initialBalance / this.config.pairs.length;
    }
  }

  private setupWorkerTasks(): void {
    // Register worker tasks for parallel processing
    this.workerPool.registerProcessor('fetchTicker', async (pair: string) => {
      return await this.client.getTicker(pair);
    });

    this.workerPool.registerProcessor('generateSignal', async (data: { pair: string; ticker: BitbankTicker }) => {
      const pairState = this.pairStates.get(data.pair);
      if (!pairState) throw new Error(`Unknown pair: ${data.pair}`);
      
      return pairState.strategy.generateSignal(data.ticker);
    });

    this.workerPool.registerProcessor('analyzeCorrelation', async (data: { pair1: string; pair2: string }) => {
      return this.calculatePairCorrelation(data.pair1, data.pair2);
    });

    this.workerPool.registerProcessor('updatePerformance', async (pair: string) => {
      return this.updatePairPerformance(pair);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Multi-pair trading bot is already running');
    }

    this.isRunning = true;
    this.workerPool.start();
    
    console.log(`Starting multi-pair trading bot for ${this.config.pairs.length} pairs`);
    
    try {
      await this.validateConfiguration();
      await this.startTradingLoop();
    } catch (error) {
      console.error('Multi-pair trading bot error:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.tradingInterval) {
      clearInterval(this.tradingInterval);
      this.tradingInterval = null;
    }

    await this.workerPool.stop();
    this.performanceMonitor.stop();
    
    // Close all open positions
    await this.closeAllPositions();
    
    console.log('Multi-pair trading bot stopped');
    this.generateFinalReport();
  }

  private async validateConfiguration(): Promise<void> {
    try {
      // Test API connection for all pairs
      const tickerTasks = this.config.pairs.map(pair =>
        () => this.client.getTicker(pair)
      );
      
      await this.performanceMonitor.measureAsync('validatePairs', async () => {
        await Promise.all(tickerTasks.map(task => task()));
      });

      console.log('API connection validated for all pairs');
      
      // Check balance
      const balances = await this.client.getBalance();
      const jpyBalance = balances.find(b => b.asset === 'jpy');
      
      console.log(`Available JPY balance: ${jpyBalance?.free_amount || '0'}`);
      
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error}`);
    }
  }

  private async startTradingLoop(): Promise<void> {
    this.tradingInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.performanceMonitor.measureAsync('tradingCycle', async () => {
          await this.executeTradingCycle();
        });
      } catch (error) {
        console.error('Trading cycle error:', error);
      }
    }, this.config.tradingInterval);
  }

  private async executeTradingCycle(): Promise<void> {
    // 1. Fetch market data for all pairs in parallel
    const tickerTasks = this.config.pairs.map(pair => 
      this.workerPool.executeTask('fetchTicker', pair, 1) // High priority
    );
    
    const tickers = await Promise.all(tickerTasks);
    const pairTickerMap = new Map<string, BitbankTicker>();
    
    this.config.pairs.forEach((pair, index) => {
      pairTickerMap.set(pair, tickers[index]);
      this.updatePriceHistory(pair, parseFloat(tickers[index].last));
    });

    // 2. Update correlations if enabled
    if (this.config.enableCorrelationAnalysis) {
      await this.updateCorrelations();
    }

    // 3. Generate signals for all pairs in parallel
    const signalTasks = this.config.pairs.map(pair => {
      const ticker = pairTickerMap.get(pair)!;
      return this.workerPool.executeTask('generateSignal', { pair, ticker }, 1);
    });
    
    const signals = await Promise.all(signalTasks);

    // 4. Check stop loss and take profit for all pairs
    await this.checkStopLossAndTakeProfitAllPairs(pairTickerMap);

    // 5. Apply correlation filtering and execute signals
    const filteredSignals = this.applyCorrelationFiltering(signals);
    await this.executeSignals(filteredSignals, pairTickerMap);

    // 6. Update performance metrics
    await this.updateAllPairPerformances();

    // 7. Rebalance funds if using dynamic allocation
    if (this.config.fundAllocationStrategy === 'dynamic') {
      await this.rebalanceFunds();
    }

    // 8. Log status
    this.logTradingStatus();
  }

  private updatePriceHistory(pair: string, price: number): void {
    const history = this.priceHistory.get(pair) || [];
    history.push(price);
    
    if (history.length > this.CORRELATION_HISTORY_SIZE) {
      history.shift();
    }
    
    this.priceHistory.set(pair, history);
  }

  private async updateCorrelations(): Promise<void> {
    const pairs = this.config.pairs;
    const correlationTasks: Array<() => Promise<CorrelationData>> = [];

    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        correlationTasks.push(async (): Promise<CorrelationData> => {
          const correlation = await this.workerPool.executeTask('analyzeCorrelation', {
            pair1: pairs[i],
            pair2: pairs[j],
          });
          
          return {
            pair1: pairs[i] || '',
            pair2: pairs[j] || '',
            correlation,
            lastUpdated: Date.now(),
          };
        });
      }
    }

    const correlations = await Promise.all(correlationTasks.map(task => task()));
    
    // Update correlation matrix
    for (const corr of correlations) {
      if (!this.correlationMatrix.has(corr.pair1)) {
        this.correlationMatrix.set(corr.pair1, []);
      }
      this.correlationMatrix.get(corr.pair1)!.push(corr);
    }
  }

  private calculatePairCorrelation(pair1: string, pair2: string): number {
    const history1 = this.priceHistory.get(pair1) || [];
    const history2 = this.priceHistory.get(pair2) || [];
    
    if (history1.length < 20 || history2.length < 20) {
      return 0;
    }

    const minLength = Math.min(history1.length, history2.length);
    const prices1 = history1.slice(-minLength);
    const prices2 = history2.slice(-minLength);

    // Calculate returns
    const returns1 = prices1.slice(1).map((price, i) => {
      const prevPrice = prices1[i] || 0;
      return prevPrice !== 0 ? (price - prevPrice) / prevPrice : 0;
    });
    const returns2 = prices2.slice(1).map((price, i) => {
      const prevPrice = prices2[i] || 0;
      return prevPrice !== 0 ? (price - prevPrice) / prevPrice : 0;
    });

    // Calculate correlation coefficient
    const mean1 = returns1.reduce((sum, r) => sum + r, 0) / returns1.length;
    const mean2 = returns2.reduce((sum, r) => sum + r, 0) / returns2.length;

    let numerator = 0;
    let sumSquares1 = 0;
    let sumSquares2 = 0;

    for (let i = 0; i < returns1.length; i++) {
      const r1 = returns1[i] || 0;
      const r2 = returns2[i] || 0;
      const diff1 = r1 - mean1;
      const diff2 = r2 - mean2;
      numerator += diff1 * diff2;
      sumSquares1 += diff1 * diff1;
      sumSquares2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(sumSquares1 * sumSquares2);
    return denominator > 0 ? numerator / denominator : 0;
  }

  private applyCorrelationFiltering(signals: TradingSignal[]): TradingSignal[] {
    if (!this.config.enableCorrelationAnalysis) {
      return signals;
    }

    const filtered: TradingSignal[] = [];
    const activeTradingPairs: string[] = [];

    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      const pair = this.config.pairs[i];

      if (!signal || !pair) continue;

      if (signal.action === 'hold') {
        filtered.push(signal);
        continue;
      }

      // Check correlation with already selected pairs
      let isCorrelated = false;
      for (const activePair of activeTradingPairs) {
        const correlation = this.getPairCorrelation(pair, activePair);
        if (Math.abs(correlation) > this.config.correlationThreshold) {
          isCorrelated = true;
          break;
        }
      }

      if (!isCorrelated) {
        filtered.push(signal);
        activeTradingPairs.push(pair);
      } else {
        // Replace with hold signal
        filtered.push({
          action: 'hold',
          confidence: signal.confidence,
          price: signal.price,
          amount: 0,
          reason: `Highly correlated with active trading pair (${activeTradingPairs.join(', ')})`,
        });
      }
    }

    return filtered;
  }

  private getPairCorrelation(pair1: string, pair2: string): number {
    const correlations1 = this.correlationMatrix.get(pair1) || [];
    const correlations2 = this.correlationMatrix.get(pair2) || [];

    let found = correlations1.find(c => c.pair2 === pair2);
    if (!found) {
      found = correlations2.find(c => c.pair2 === pair1);
    }

    return found ? found.correlation : 0;
  }

  private async executeSignals(signals: TradingSignal[], _tickerMap: Map<string, BitbankTicker>): Promise<void> {
    // _tickerMap could be used for additional context in future enhancements
    const totalActiveTrades = Array.from(this.pairStates.values())
      .reduce((sum, state) => sum + state.activePositions.size, 0);

    for (let i = 0; i < signals.length && i < this.config.pairs.length; i++) {
      const signal = signals[i];
      const pair = this.config.pairs[i];
      
      if (!signal || !pair) continue;
      
      const pairState = this.pairStates.get(pair);
      if (!pairState) continue;
      if (signal.action === 'hold') continue;

      // Check various constraints
      if (totalActiveTrades >= this.config.totalMaxConcurrentTrades) break;
      if (pairState.activePositions.size >= this.config.maxConcurrentTradesPerPair) continue;

      const now = Date.now();
      if (now - pairState.lastTradeTime < this.MIN_TRADE_INTERVAL) continue;

      await this.executeSignal(signal, pair, pairState);
    }
  }

  private async executeSignal(signal: TradingSignal, pair: string, pairState: PairState): Promise<void> {
    try {
      const orderId = await this.placeOrder(signal, pair);
      if (orderId) {
        const position: TradingPosition = {
          side: signal.action as 'buy' | 'sell',
          amount: signal.amount,
          price: signal.price,
          timestamp: Date.now(),
          orderId,
        };

        const positionId = `${pair}_${signal.action}_${orderId}`;
        pairState.activePositions.set(positionId, position);
        pairState.profitCalculator.addPosition(positionId, position);
        pairState.lastTradeTime = Date.now();

        console.log(`Order placed for ${pair}: ${signal.action} ${signal.amount} at ${signal.price}`);
      }
    } catch (error) {
      console.error(`Order execution error for ${pair}:`, error);
    }
  }

  private async placeOrder(signal: TradingSignal, pair: string): Promise<number | null> {
    try {
      if (signal.action === 'hold') return null;
      
      const order = await this.client.createOrder({
        pair,
        amount: signal.amount.toString(),
        price: signal.price.toString(),
        side: signal.action as 'buy' | 'sell',
        type: 'limit',
      });

      return order.order_id;
    } catch (error) {
      console.error(`Failed to place order for ${pair}:`, error);
      return null;
    }
  }

  private async checkStopLossAndTakeProfitAllPairs(tickerMap: Map<string, BitbankTicker>): Promise<void> {
    const tasks = Array.from(this.pairStates.entries()).map(([pair, pairState]) => {
      const ticker = tickerMap.get(pair);
      if (!ticker) return Promise.resolve();
      
      return this.checkStopLossAndTakeProfit(pair, pairState, parseFloat(ticker.last));
    });

    await Promise.all(tasks);
  }

  private async checkStopLossAndTakeProfit(pair: string, pairState: PairState, currentPrice: number): Promise<void> {
    for (const [positionId, position] of pairState.activePositions) {
      let shouldClose = false;
      let reason = '';

      if (position.side === 'buy') {
        const stopLossPrice = position.price * (1 - this.config.stopLossPercentage / 100);
        const takeProfitPrice = position.price * (1 + this.config.takeProfitPercentage / 100);

        if (currentPrice <= stopLossPrice) {
          shouldClose = true;
          reason = 'Stop loss triggered';
        } else if (currentPrice >= takeProfitPrice) {
          shouldClose = true;
          reason = 'Take profit triggered';
        }
      } else {
        const stopLossPrice = position.price * (1 + this.config.stopLossPercentage / 100);
        const takeProfitPrice = position.price * (1 - this.config.takeProfitPercentage / 100);

        if (currentPrice >= stopLossPrice) {
          shouldClose = true;
          reason = 'Stop loss triggered';
        } else if (currentPrice <= takeProfitPrice) {
          shouldClose = true;
          reason = 'Take profit triggered';
        }
      }

      if (shouldClose) {
        await this.closePosition(pair, pairState, positionId, currentPrice, reason);
      }
    }
  }

  private async closePosition(
    pair: string,
    pairState: PairState,
    positionId: string,
    exitPrice: number,
    reason: string
  ): Promise<void> {
    const position = pairState.activePositions.get(positionId);
    if (!position) return;

    try {
      // Cancel the original order if it's still active
      if (position.orderId) {
        await this.client.cancelOrder(pair, position.orderId);
      }

      // Place market order to close position
      const oppositeAction: 'buy' | 'sell' = position.side === 'buy' ? 'sell' : 'buy';
      await this.client.createOrder({
        pair,
        amount: position.amount.toString(),
        side: oppositeAction,
        type: 'market',
      });

      // Record the trade
      const trade = pairState.profitCalculator.closePosition(positionId, exitPrice, Date.now());
      pairState.activePositions.delete(positionId);

      console.log(`Position closed for ${pair}: ${reason}`);
      if (trade) {
        console.log(`Trade result for ${pair}: ${trade.profit.toFixed(2)} JPY (${(trade.returnRate * 100).toFixed(2)}%)`);
      }
    } catch (error) {
      console.error(`Failed to close position for ${pair}:`, error);
    }
  }

  private async closeAllPositions(): Promise<void> {
    const closeTasks = Array.from(this.pairStates.entries()).map(async ([pair, pairState]) => {
      try {
        const ticker = await this.client.getTicker(pair);
        const currentPrice = parseFloat(ticker.last);

        for (const [positionId] of pairState.activePositions) {
          await this.closePosition(pair, pairState, positionId, currentPrice, 'Bot shutdown');
        }
      } catch (error) {
        console.error(`Error closing positions for ${pair}:`, error);
      }
    });

    await Promise.all(closeTasks);
  }

  private async updateAllPairPerformances(): Promise<void> {
    const tasks = this.config.pairs.map(pair =>
      this.workerPool.executeTask('updatePerformance', pair, 0) // Low priority
    );

    await Promise.all(tasks);
  }

  private updatePairPerformance(pair: string): void {
    const pairState = this.pairStates.get(pair);
    if (!pairState) return;

    const metrics = pairState.profitCalculator.calculateProfitMetrics();
    pairState.performance = {
      totalProfit: metrics.totalProfit,
      winRate: metrics.winRate,
      sharpeRatio: this.calculateSharpeRatio(pair),
      maxDrawdown: metrics.maxDrawdown,
    };
  }

  private calculateSharpeRatio(pair: string): number {
    const pairState = this.pairStates.get(pair);
    if (!pairState) return 0;

    const trades = pairState.profitCalculator.getTradeHistory();
    if (trades.length < 2) return 0;

    const returns = trades.map(trade => trade.returnRate);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  private async rebalanceFunds(): Promise<void> {
    // Implement dynamic fund rebalancing based on performance
    const totalBalance = Array.from(this.pairStates.values())
      .reduce((sum, state) => sum + state.profitCalculator.getCurrentBalance(), 0);

    const performanceWeights = this.calculatePerformanceWeights();
    
    for (const [pair, pairState] of this.pairStates) {
      const newAllocation = totalBalance * performanceWeights.get(pair)!;
      pairState.allocatedFunds = newAllocation;
    }
  }

  private calculatePerformanceWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    const pairs = Array.from(this.pairStates.keys());
    
    // Calculate weights based on Sharpe ratio
    const sharpeRatios = pairs.map(pair => {
      const state = this.pairStates.get(pair);
      return state ? Math.max(0.1, state.performance.sharpeRatio) : 0.1; // Minimum weight
    });
    
    const totalSharpe = sharpeRatios.reduce((sum, s) => sum + s, 0);
    
    pairs.forEach((pair, index) => {
      const ratio = sharpeRatios[index] || 0.1;
      weights.set(pair, ratio / totalSharpe);
    });
    
    return weights;
  }

  private logTradingStatus(): void {
    const workerStats = this.workerPool.getStats();
    const systemMetrics = this.performanceMonitor.getCurrentSystemMetrics();
    
    console.log(`
=== MULTI-PAIR TRADING STATUS ===
Active Pairs: ${this.config.pairs.length}
Worker Pool: ${workerStats.activeWorkers}/${workerStats.workers.length} active
Queue Length: ${workerStats.queueLength}
Memory Usage: ${systemMetrics?.memory.percentage.toFixed(2) || 'N/A'}%

=== PAIR PERFORMANCE ===`);

    for (const [pair, pairState] of this.pairStates) {
      const metrics = pairState.profitCalculator.calculateProfitMetrics();
      console.log(`${pair}:
  Positions: ${pairState.activePositions.size}
  Profit: ${metrics.totalProfit.toFixed(2)} JPY
  Win Rate: ${(metrics.winRate * 100).toFixed(2)}%
  Sharpe: ${pairState.performance.sharpeRatio.toFixed(3)}
  Funds: ${pairState.allocatedFunds.toFixed(2)} JPY`);
    }

    console.log('================================');
  }

  private generateFinalReport(): void {
    console.log('\n=== FINAL TRADING REPORT ===');
    console.log(this.performanceMonitor.generateDetailedReport());

    const totalProfit = Array.from(this.pairStates.values())
      .reduce((sum, state) => sum + state.profitCalculator.getTotalProfit(), 0);

    const totalInitialBalance = Array.from(this.pairStates.values())
      .reduce((sum, state) => sum + state.allocatedFunds, 0);

    const overallReturn = (totalProfit / totalInitialBalance) * 100;

    console.log(`
=== OVERALL PERFORMANCE ===
Total Profit: ${totalProfit.toFixed(2)} JPY
Overall Return: ${overallReturn.toFixed(2)}%
Trading Pairs: ${this.config.pairs.length}
===========================`);
  }

  // Public methods for monitoring
  getOverallStats(): {
    totalProfit: number;
    totalReturn: number;
    activePairs: number;
    totalPositions: number;
    workerPoolStats: any;
    systemMetrics: any;
  } {
    const totalProfit = Array.from(this.pairStates.values())
      .reduce((sum, state) => sum + state.profitCalculator.getTotalProfit(), 0);

    const totalInitialBalance = Array.from(this.pairStates.values())
      .reduce((sum, state) => sum + state.allocatedFunds, 0);

    const totalPositions = Array.from(this.pairStates.values())
      .reduce((sum, state) => sum + state.activePositions.size, 0);

    return {
      totalProfit,
      totalReturn: (totalProfit / totalInitialBalance) * 100,
      activePairs: this.config.pairs.length,
      totalPositions,
      workerPoolStats: this.workerPool.getStats(),
      systemMetrics: this.performanceMonitor.getCurrentSystemMetrics(),
    };
  }

  getPairStats(pair: string): PairState | undefined {
    return this.pairStates.get(pair);
  }

  isActive(): boolean {
    return this.isRunning;
  }
}