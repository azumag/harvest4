import { OptimizedBitbankClient } from '../api/optimized-bitbank-client';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { ProfitCalculator } from '../utils/profit-calculator';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { WorkerPool } from '../utils/worker-pool';
import { BitbankConfig, TradingSignal, TradingPosition, BitbankTicker } from '../types/bitbank';

interface MultiPairConfig extends BitbankConfig {
  pairs: string[];
  strategy: TradingStrategyConfig;
  initialBalance: number;
  maxConcurrentTrades: number;
  tradingInterval: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  correlationThreshold: number;
  fundAllocationStrategy: 'equal' | 'performance' | 'volatility';
  rebalanceInterval: number;
}

interface PairMetrics {
  pair: string;
  volume: number;
  volatility: number;
  sharpeRatio: number;
  winRate: number;
  profitability: number;
  correlation: Map<string, number>;
  lastUpdate: number;
}

interface FundAllocation {
  pair: string;
  allocation: number;
  maxTradeAmount: number;
  reason: string;
}

export class MultiPairTradingBot {
  private client: OptimizedBitbankClient;
  private strategies: Map<string, TradingStrategy> = new Map();
  private profitCalculators: Map<string, ProfitCalculator> = new Map();
  private config: MultiPairConfig;
  private performanceMonitor: PerformanceMonitor;
  private workerPool: WorkerPool;
  private isRunning = false;
  private activePositions: Map<string, TradingPosition> = new Map();
  private pairMetrics: Map<string, PairMetrics> = new Map();
  private fundAllocations: Map<string, FundAllocation> = new Map();
  private lastTradeTime = 0;
  private readonly MIN_TRADE_INTERVAL = 60000; // 1 minute minimum between trades
  private rebalanceTimer: NodeJS.Timeout | null = null;

  constructor(config: MultiPairConfig) {
    this.config = config;
    this.client = new OptimizedBitbankClient(config);
    this.performanceMonitor = new PerformanceMonitor();
    this.workerPool = new WorkerPool(4, 30000, 50);

    this.initializePairStrategies();
    this.initializeFundAllocations();
  }

  private initializePairStrategies(): void {
    for (const pair of this.config.pairs) {
      this.strategies.set(pair, new TradingStrategy(this.config.strategy));
      this.profitCalculators.set(pair, new ProfitCalculator(
        this.config.initialBalance / this.config.pairs.length
      ));
      
      this.pairMetrics.set(pair, {
        pair,
        volume: 0,
        volatility: 0,
        sharpeRatio: 0,
        winRate: 0,
        profitability: 0,
        correlation: new Map(),
        lastUpdate: 0,
      });
    }
  }

  private initializeFundAllocations(): void {
    const equalAllocation = 1 / this.config.pairs.length;
    const baseAmount = this.config.initialBalance * equalAllocation;

    for (const pair of this.config.pairs) {
      this.fundAllocations.set(pair, {
        pair,
        allocation: equalAllocation,
        maxTradeAmount: baseAmount * 0.1, // 10% of allocated funds per trade
        reason: 'Initial equal allocation',
      });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Multi-pair trading bot is already running');
    }

    this.isRunning = true;
    console.log(`Starting multi-pair trading bot for ${this.config.pairs.join(', ')}`);

    try {
      await this.validateConfiguration();
      await this.startTradingLoop();
      this.startRebalanceTimer();
    } catch (error) {
      console.error('Multi-pair trading bot error:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('Multi-pair trading bot stopped');

    if (this.rebalanceTimer) {
      clearTimeout(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }

    // Close all open positions
    await this.closeAllPositions();

    // Shutdown worker pool
    await this.workerPool.shutdown();

    // Shutdown client
    await this.client.shutdown();

    // Generate final report
    console.log(this.getPerformanceReport());
  }

  private async validateConfiguration(): Promise<void> {
    try {
      // Test API connection with batch ticker request
      const tickers = await this.client.getBatchTickers(this.config.pairs);
      console.log(`API connection validated for ${tickers.size} pairs`);

      // Check balances
      const balances = await this.client.getBalance();
      const jpyBalance = balances.find(b => b.asset === 'jpy');
      console.log(`JPY Balance: ${jpyBalance?.free_amount || '0'}`);

    } catch (error) {
      throw new Error(`Configuration validation failed: ${error}`);
    }
  }

  private async startTradingLoop(): Promise<void> {
    const tradingLoop = async () => {
      while (this.isRunning) {
        try {
          await this.executeTradingCycle();
          await this.sleep(this.config.tradingInterval);
        } catch (error) {
          console.error('Trading cycle error:', error);
          await this.sleep(5000);
        }
      }
    };

    // Start trading loop in background
    tradingLoop();
  }

  private async executeTradingCycle(): Promise<void> {
    const startTime = Date.now();

    // Collect market data for all pairs concurrently
    const marketDataTasks = this.config.pairs.map(pair => ({
      fn: () => this.client.getTicker(pair),
      priority: 10,
      id: `ticker-${pair}`,
    }));

    const tickers = await this.performanceMonitor.measureAsyncFunction(
      'market_data_collection',
      () => this.workerPool.submitBatch(marketDataTasks)
    );

    // Update pair metrics
    await this.updatePairMetrics(tickers);

    // Generate signals for all pairs concurrently
    const signalTasks = this.config.pairs.map((pair, index) => ({
      fn: () => {
        const ticker = tickers[index];
        if (!ticker) {
          throw new Error(`Ticker for pair ${pair} not found`);
        }
        return this.generateSignalForPair(pair, ticker);
      },
      priority: 9,
      id: `signal-${pair}`,
    }));

    const signals = await this.performanceMonitor.measureAsyncFunction(
      'signal_generation',
      () => this.workerPool.submitBatch(signalTasks)
    );

    // Filter signals based on correlation analysis
    const filteredSignals = await this.filterSignalsByCorrelation(signals);

    // Execute trades
    await this.executeSignals(filteredSignals);

    // Check stop loss and take profit
    await this.checkStopLossAndTakeProfit(tickers);

    // Log trading status
    this.logTradingStatus(filteredSignals);

    this.performanceMonitor.recordMetric('trading_cycle_time', Date.now() - startTime);
  }

  private async updatePairMetrics(tickers: BitbankTicker[]): Promise<void> {
    const updateTasks = this.config.pairs.map((pair, index) => ({
      fn: () => {
        const ticker = tickers[index];
        if (!ticker) {
          throw new Error(`Ticker for pair ${pair} not found`);
        }
        return this.updateSinglePairMetrics(pair, ticker);
      },
      priority: 5,
      id: `metrics-${pair}`,
    }));

    await this.workerPool.submitBatch(updateTasks);
  }

  private async updateSinglePairMetrics(pair: string, ticker: BitbankTicker): Promise<void> {
    const metrics = this.pairMetrics.get(pair);
    const profitCalculator = this.profitCalculators.get(pair);
    
    if (!metrics || !profitCalculator) {
      throw new Error(`Metrics or profit calculator for pair ${pair} not found`);
    }
    
    // Update basic metrics
    metrics.volume = parseFloat(ticker.vol);
    metrics.lastUpdate = Date.now();

    // Calculate volatility from strategy
    const strategy = this.strategies.get(pair);
    if (!strategy) {
      throw new Error(`Strategy for pair ${pair} not found`);
    }
    // Generate signal to update price history (needed for metrics calculation)
    strategy.generateSignal(ticker);
    
    // Update performance metrics
    const profitMetrics = profitCalculator.calculateProfitMetrics();
    metrics.winRate = profitMetrics.winRate;
    metrics.profitability = profitMetrics.totalProfit;
    metrics.sharpeRatio = this.calculateSharpeRatio(pair);
  }

  private calculateSharpeRatio(pair: string): number {
    const profitCalculator = this.profitCalculators.get(pair);
    if (!profitCalculator) {
      return 0;
    }
    const trades = profitCalculator.getTradeHistory();
    
    if (trades.length < 2) return 0;

    const returns = trades.map(t => t.returnRate);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev === 0 ? 0 : avgReturn / stdDev;
  }

  private async generateSignalForPair(pair: string, ticker: BitbankTicker): Promise<TradingSignal & { pair: string }> {
    const strategy = this.strategies.get(pair);
    if (!strategy) {
      throw new Error(`Strategy for pair ${pair} not found`);
    }
    const signal = strategy.generateSignal(ticker);
    
    return {
      ...signal,
      pair,
    };
  }

  private async filterSignalsByCorrelation(
    signals: Array<TradingSignal & { pair: string }>
  ): Promise<Array<TradingSignal & { pair: string }>> {
    const buySignals = signals.filter(s => s.action === 'buy');
    const sellSignals = signals.filter(s => s.action === 'sell');

    // Update correlation matrix
    await this.updateCorrelationMatrix();

    // Filter buy signals to avoid highly correlated pairs
    const filteredBuySignals = this.filterCorrelatedSignals(buySignals);
    const filteredSellSignals = this.filterCorrelatedSignals(sellSignals);

    return [
      ...filteredBuySignals,
      ...filteredSellSignals,
      ...signals.filter(s => s.action === 'hold'),
    ];
  }

  private filterCorrelatedSignals(signals: Array<TradingSignal & { pair: string }>): Array<TradingSignal & { pair: string }> {
    const filteredSignals: Array<TradingSignal & { pair: string }> = [];
    const usedPairs = new Set<string>();

    // Sort by confidence (highest first)
    signals.sort((a, b) => b.confidence - a.confidence);

    for (const signal of signals) {
      if (usedPairs.has(signal.pair)) continue;

      const metrics = this.pairMetrics.get(signal.pair)!;
      let isCorrelated = false;

      for (const usedPair of usedPairs) {
        const correlation = metrics.correlation.get(usedPair) || 0;
        if (Math.abs(correlation) > this.config.correlationThreshold) {
          isCorrelated = true;
          break;
        }
      }

      if (!isCorrelated) {
        filteredSignals.push(signal);
        usedPairs.add(signal.pair);
      }
    }

    return filteredSignals;
  }

  private async updateCorrelationMatrix(): Promise<void> {
    const correlationTasks = this.config.pairs.map(pair1 => ({
      fn: () => this.calculatePairCorrelations(pair1),
      priority: 3,
      id: `correlation-${pair1}`,
    }));

    await this.workerPool.submitBatch(correlationTasks);
  }

  private async calculatePairCorrelations(pair1: string): Promise<void> {
    const metrics1 = this.pairMetrics.get(pair1);
    const calculator1 = this.profitCalculators.get(pair1);
    
    if (!metrics1 || !calculator1) return;
    
    const trades1 = calculator1.getTradeHistory();
    if (trades1.length < 10) return;

    const returns1 = trades1.slice(-20).map(t => t.returnRate);

    for (const pair2 of this.config.pairs) {
      if (pair1 === pair2) continue;

      const calculator2 = this.profitCalculators.get(pair2);
      if (!calculator2) continue;
      
      const trades2 = calculator2.getTradeHistory();
      if (trades2.length < 10) continue;

      const returns2 = trades2.slice(-20).map(t => t.returnRate);
      const correlation = this.calculateCorrelation(returns1, returns2);
      
      metrics1.correlation.set(pair2, correlation);
    }
  }

  private calculateCorrelation(returns1: number[], returns2: number[]): number {
    const minLength = Math.min(returns1.length, returns2.length);
    const r1 = returns1.slice(0, minLength);
    const r2 = returns2.slice(0, minLength);

    if (r1.length < 2) return 0;

    const mean1 = r1.reduce((sum, r) => sum + r, 0) / r1.length;
    const mean2 = r2.reduce((sum, r) => sum + r, 0) / r2.length;

    let numerator = 0;
    let sum1Sq = 0;
    let sum2Sq = 0;

    for (let i = 0; i < r1.length; i++) {
      const val1 = r1[i];
      const val2 = r2[i];
      
      if (val1 === undefined || val2 === undefined) continue;
      
      const diff1 = val1 - mean1;
      const diff2 = val2 - mean2;
      
      numerator += diff1 * diff2;
      sum1Sq += diff1 * diff1;
      sum2Sq += diff2 * diff2;
    }

    const denominator = Math.sqrt(sum1Sq * sum2Sq);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private async executeSignals(signals: Array<TradingSignal & { pair: string }>): Promise<void> {
    const tradingSignals = signals.filter(s => s.action !== 'hold');

    for (const signal of tradingSignals) {
      await this.executeSignalForPair(signal);
    }
  }

  private async executeSignalForPair(signal: TradingSignal & { pair: string }): Promise<void> {
    const now = Date.now();
    
    // Check rate limiting
    if (now - this.lastTradeTime < this.MIN_TRADE_INTERVAL) {
      return;
    }

    // Check maximum concurrent trades
    if (this.activePositions.size >= this.config.maxConcurrentTrades) {
      return;
    }

    // Check fund allocation
    const allocation = this.fundAllocations.get(signal.pair)!;
    if (signal.amount * signal.price > allocation.maxTradeAmount) {
      return;
    }

    try {
      const orderId = await this.placeOrder(signal);
      if (orderId) {
        const position: TradingPosition = {
          side: signal.action as 'buy' | 'sell',
          amount: signal.amount,
          price: signal.price,
          timestamp: now,
          orderId,
        };

        const positionId = `${signal.pair}_${signal.action}_${orderId}`;
        this.activePositions.set(positionId, position);
        
        const profitCalculator = this.profitCalculators.get(signal.pair)!;
        profitCalculator.addPosition(positionId, position);
        
        this.lastTradeTime = now;
        console.log(`Order placed for ${signal.pair}: ${signal.action} ${signal.amount} at ${signal.price}`);
      }
    } catch (error) {
      console.error(`Order execution error for ${signal.pair}:`, error);
    }
  }

  private async placeOrder(signal: TradingSignal & { pair: string }): Promise<number | null> {
    try {
      const order = await this.client.createOrder({
        pair: signal.pair,
        amount: signal.amount.toString(),
        price: signal.price.toString(),
        side: signal.action as 'buy' | 'sell',
        type: 'limit',
      });

      return order.order_id;
    } catch (error) {
      console.error('Failed to place order:', error);
      return null;
    }
  }

  private async checkStopLossAndTakeProfit(tickers: BitbankTicker[]): Promise<void> {
    const checkTasks = Array.from(this.activePositions.entries()).map(([positionId, position]) => ({
      fn: () => this.checkPositionStopLoss(positionId, position, tickers),
      priority: 8,
      id: `stop-check-${positionId}`,
    }));

    await this.workerPool.submitBatch(checkTasks);
  }

  private async checkPositionStopLoss(
    positionId: string,
    position: TradingPosition,
    tickers: BitbankTicker[]
  ): Promise<void> {
    const pair = positionId.split('_')[0];
    if (!pair) return;
    
    const ticker = tickers.find(t => t.pair === pair);
    if (!ticker) return;

    const currentPrice = parseFloat(ticker.last);
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
      await this.closePosition(positionId, currentPrice, reason);
    }
  }

  private async closePosition(positionId: string, exitPrice: number, reason: string): Promise<void> {
    const position = this.activePositions.get(positionId);
    if (!position) return;

    const pair = positionId.split('_')[0];
    if (!pair) return;

    try {
      // Cancel original order if active
      if (position.orderId) {
        await this.client.cancelOrder(pair, position.orderId);
      }

      // Place market order to close position
      const oppositeAction = position.side === 'buy' ? 'sell' : 'buy';
      await this.client.createOrder({
        pair,
        amount: position.amount.toString(),
        side: oppositeAction,
        type: 'market',
      });

      // Record the trade
      const profitCalculator = this.profitCalculators.get(pair);
      if (profitCalculator) {
        const trade = profitCalculator.closePosition(positionId, exitPrice, Date.now());
        this.activePositions.delete(positionId);

        console.log(`Position closed for ${pair}: ${reason}`);
        if (trade) {
          console.log(`Trade result: ${trade.profit.toFixed(2)} JPY (${(trade.returnRate * 100).toFixed(2)}%)`);
        }
      }
    } catch (error) {
      console.error(`Failed to close position for ${pair}:`, error);
    }
  }

  private async closeAllPositions(): Promise<void> {
    const tickers = await this.client.getBatchTickers(this.config.pairs);
    
    for (const [positionId] of this.activePositions) {
      const pair = positionId.split('_')[0];
      if (!pair) continue;
      
      const ticker = tickers.get(pair);
      if (ticker) {
        const currentPrice = parseFloat(ticker.last);
        await this.closePosition(positionId, currentPrice, 'Bot shutdown');
      }
    }
  }

  private startRebalanceTimer(): void {
    this.rebalanceTimer = setInterval(() => {
      this.rebalanceFunds();
    }, this.config.rebalanceInterval);
  }

  private async rebalanceFunds(): Promise<void> {
    console.log('Starting fund rebalancing...');
    
    const newAllocations = await this.calculateOptimalAllocations();
    
    for (const [pair, allocation] of newAllocations) {
      this.fundAllocations.set(pair, allocation);
      console.log(`${pair}: ${(allocation.allocation * 100).toFixed(2)}% allocation, max trade: ${allocation.maxTradeAmount.toFixed(2)} JPY`);
    }
  }

  private async calculateOptimalAllocations(): Promise<Map<string, FundAllocation>> {
    switch (this.config.fundAllocationStrategy) {
      case 'performance':
        return this.calculatePerformanceBasedAllocations();
      case 'volatility':
        return this.calculateVolatilityBasedAllocations();
      default:
        return this.calculateEqualAllocations();
    }
  }

  private calculatePerformanceBasedAllocations(): Map<string, FundAllocation> {
    const allocations = new Map<string, FundAllocation>();
    const metrics = Array.from(this.pairMetrics.values());
    
    // Calculate total Sharpe ratio
    const totalSharpe = metrics.reduce((sum, m) => sum + Math.max(0, m.sharpeRatio), 0);
    
    if (totalSharpe === 0) {
      return this.calculateEqualAllocations();
    }

    for (const metric of metrics) {
      const allocation = Math.max(0, metric.sharpeRatio) / totalSharpe;
      const maxTradeAmount = this.config.initialBalance * allocation * 0.1;
      
      allocations.set(metric.pair, {
        pair: metric.pair,
        allocation,
        maxTradeAmount,
        reason: `Performance-based (Sharpe: ${metric.sharpeRatio.toFixed(3)})`,
      });
    }

    return allocations;
  }

  private calculateVolatilityBasedAllocations(): Map<string, FundAllocation> {
    const allocations = new Map<string, FundAllocation>();
    const metrics = Array.from(this.pairMetrics.values());
    
    // Inverse volatility weighting
    const totalInverseVolatility = metrics.reduce((sum, m) => sum + 1 / (m.volatility + 0.001), 0);

    for (const metric of metrics) {
      const allocation = (1 / (metric.volatility + 0.001)) / totalInverseVolatility;
      const maxTradeAmount = this.config.initialBalance * allocation * 0.1;
      
      allocations.set(metric.pair, {
        pair: metric.pair,
        allocation,
        maxTradeAmount,
        reason: `Volatility-based (Vol: ${metric.volatility.toFixed(4)})`,
      });
    }

    return allocations;
  }

  private calculateEqualAllocations(): Map<string, FundAllocation> {
    const allocations = new Map<string, FundAllocation>();
    const equalAllocation = 1 / this.config.pairs.length;
    const baseAmount = this.config.initialBalance * equalAllocation;

    for (const pair of this.config.pairs) {
      allocations.set(pair, {
        pair,
        allocation: equalAllocation,
        maxTradeAmount: baseAmount * 0.1,
        reason: 'Equal allocation',
      });
    }

    return allocations;
  }

  private logTradingStatus(signals: Array<TradingSignal & { pair: string }>): void {
    const totalProfit = Array.from(this.profitCalculators.values())
      .reduce((sum, calc) => sum + calc.calculateProfitMetrics().totalProfit, 0);

    console.log(`
--- Multi-Pair Trading Status ---
Active Positions: ${this.activePositions.size}
Total Profit: ${totalProfit.toFixed(2)} JPY
Signals: ${signals.filter(s => s.action !== 'hold').length}
Worker Pool: ${this.workerPool.getStats().activeTaskCount} active tasks
Performance: ${this.performanceMonitor.getSystemMetrics().memoryUsage.toFixed(2)}% memory
--------------------------------
    `);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getPerformanceReport(): string {
    const workerStats = this.workerPool.getPerformanceReport();
    const performanceStats = this.performanceMonitor.getPerformanceReport();
    
    const pairReports = this.config.pairs.map(pair => {
      const calculator = this.profitCalculators.get(pair)!;
      const metrics = calculator.calculateProfitMetrics();
      const allocation = this.fundAllocations.get(pair)!;
      
      return `${pair}: ${metrics.totalProfit.toFixed(2)} JPY (${(metrics.winRate * 100).toFixed(2)}% win rate) - ${(allocation.allocation * 100).toFixed(2)}% allocation`;
    }).join('\n');

    return `
=== MULTI-PAIR TRADING PERFORMANCE ===
${pairReports}

${workerStats}

${performanceStats}
=====================================
`;
  }
}