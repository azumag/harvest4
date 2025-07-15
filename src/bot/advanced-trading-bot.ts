import { BitbankClient } from '../api/bitbank-client';
import { StrategyManager, StrategyManagerConfig } from '../strategies/strategy-manager';
import { ProfitCalculator } from '../utils/profit-calculator';
import { BitbankConfig, TradingSignal, TradingPosition, BitbankTicker } from '../types/bitbank';

export interface AdvancedTradingBotConfig extends BitbankConfig {
  pair: string;
  initialBalance: number;
  maxConcurrentTrades: number;
  tradingInterval: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  strategyManager: StrategyManagerConfig;
}

export class AdvancedTradingBot {
  private client: BitbankClient;
  private strategyManager: StrategyManager;
  private profitCalculator: ProfitCalculator;
  private config: AdvancedTradingBotConfig;
  private isRunning = false;
  private activePositions: Map<string, TradingPosition> = new Map();
  private lastTradeTime = 0;
  private readonly MIN_TRADE_INTERVAL = 60000; // 1 minute minimum between trades
  private tradeHistory: Array<{
    timestamp: number;
    signal: TradingSignal;
    strategy: string;
    result: 'pending' | 'success' | 'failed';
    profit?: number;
  }> = [];

  constructor(config: AdvancedTradingBotConfig) {
    this.config = config;
    this.client = new BitbankClient(config);
    this.strategyManager = new StrategyManager(config.strategyManager);
    this.profitCalculator = new ProfitCalculator(config.initialBalance);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Advanced trading bot is already running');
    }

    this.isRunning = true;
    console.log(`Starting advanced trading bot for ${this.config.pair}`);
    console.log('Active strategies:', this.getEnabledStrategies());
    
    try {
      await this.validateConfiguration();
      await this.initializeStrategies();
      await this.tradingLoop();
    } catch (error) {
      console.error('Advanced trading bot error:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('Advanced trading bot stopped');
    
    // Close all open positions
    await this.closeAllPositions();
    
    // Generate final report
    console.log(this.generateFinalReport());
  }

  private async validateConfiguration(): Promise<void> {
    try {
      // Test API connection
      await this.client.getTicker(this.config.pair);
      console.log('API connection validated');
      
      // Check balance
      const balances = await this.client.getBalance();
      const jpyBalance = balances.find(b => b.asset === 'jpy');
      const btcBalance = balances.find(b => b.asset === 'btc');
      
      console.log('Current balances:');
      console.log(`JPY: ${jpyBalance?.free_amount || '0'}`);
      console.log(`BTC: ${btcBalance?.free_amount || '0'}`);
      
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error}`);
    }
  }

  private async initializeStrategies(): Promise<void> {
    console.log('Initializing trading strategies...');
    
    // Get initial market data to warm up strategies
    const ticker = await this.client.getTicker(this.config.pair);
    this.strategyManager.updateMarketData(ticker);
    
    console.log('Strategy initialization complete');
  }

  private async tradingLoop(): Promise<void> {
    let cycleCount = 0;
    
    while (this.isRunning) {
      try {
        cycleCount++;
        await this.executeTradingCycle();
        
        // Log market summary every 10 cycles
        if (cycleCount % 10 === 0) {
          this.logMarketSummary();
        }
        
        // Generate performance report every 100 cycles
        if (cycleCount % 100 === 0) {
          this.logPerformanceReport();
        }
        
        await this.sleep(this.config.tradingInterval);
      } catch (error) {
        console.error('Trading cycle error:', error);
        await this.sleep(5000); // Wait 5 seconds before retry
      }
    }
  }

  private async executeTradingCycle(): Promise<void> {
    // Get current market data
    const ticker = await this.client.getTicker(this.config.pair);
    
    // Update strategy manager with new data
    this.strategyManager.updateMarketData(ticker);
    
    // Check stop loss and take profit for existing positions
    await this.checkStopLossAndTakeProfit(ticker);
    
    // Generate combined signal from all strategies
    const combinedSignal = this.strategyManager.generateCombinedSignal(ticker);
    
    // Execute trades based on combined signal
    await this.executeSignal(combinedSignal);
    
    // Log current status
    this.logTradingStatus(combinedSignal);
  }

  private async executeSignal(signal: TradingSignal): Promise<void> {
    if (signal.action === 'hold') {
      return;
    }

    // Check rate limiting
    const now = Date.now();
    if (now - this.lastTradeTime < this.MIN_TRADE_INTERVAL) {
      return;
    }

    // Check maximum concurrent trades
    if (this.activePositions.size >= this.config.maxConcurrentTrades) {
      return;
    }

    // Record the trade attempt
    const tradeRecord: {
      timestamp: number;
      signal: TradingSignal;
      strategy: string;
      result: 'pending' | 'success' | 'failed';
      profit?: number;
    } = {
      timestamp: now,
      signal,
      strategy: 'Combined',
      result: 'pending'
    };
    this.tradeHistory.push(tradeRecord);

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

        const positionId = `${signal.action}_${orderId}`;
        this.activePositions.set(positionId, position);
        this.profitCalculator.addPosition(positionId, position);
        
        this.lastTradeTime = now;
        tradeRecord.result = 'success';
        
        console.log(`Order placed: ${signal.action} ${signal.amount.toFixed(4)} BTC at ${signal.price.toFixed(2)} JPY`);
        console.log(`Signal confidence: ${(signal.confidence * 100).toFixed(1)}%`);
        console.log(`Reason: ${signal.reason}`);
      } else {
        tradeRecord.result = 'failed';
      }
    } catch (error) {
      console.error('Order execution error:', error);
      tradeRecord.result = 'failed';
    }
  }

  private async placeOrder(signal: TradingSignal): Promise<number | null> {
    try {
      const order = await this.client.createOrder({
        pair: this.config.pair,
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

  private async checkStopLossAndTakeProfit(ticker: BitbankTicker): Promise<void> {
    const currentPrice = parseFloat(ticker.last);

    for (const [positionId, position] of this.activePositions) {
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
  }

  private async closePosition(positionId: string, exitPrice: number, reason: string): Promise<void> {
    const position = this.activePositions.get(positionId);
    if (!position) {
      return;
    }

    try {
      // Cancel the original order if it's still active
      if (position.orderId) {
        await this.client.cancelOrder(this.config.pair, position.orderId);
      }

      // Place market order to close position
      const oppositeAction = position.side === 'buy' ? 'sell' : 'buy';
      await this.client.createOrder({
        pair: this.config.pair,
        amount: position.amount.toString(),
        side: oppositeAction,
        type: 'market',
      });

      // Record the trade
      const trade = this.profitCalculator.closePosition(positionId, exitPrice, Date.now());
      this.activePositions.delete(positionId);

      // Update strategy performance
      if (trade) {
        const tradeResult = trade.profit > 0 ? 'win' : 'loss';
        // Note: In a real implementation, you'd track which strategy generated the signal
        // For now, we'll update all strategies
        this.updateAllStrategiesPerformance(trade.profit, tradeResult);
      }

      console.log(`Position closed: ${reason}`);
      if (trade) {
        console.log(`Trade result: ${trade.profit.toFixed(2)} JPY (${(trade.returnRate * 100).toFixed(2)}%)`);
      }
    } catch (error) {
      console.error('Failed to close position:', error);
    }
  }

  private updateAllStrategiesPerformance(profit: number, tradeResult: 'win' | 'loss'): void {
    // In a real implementation, you'd track which strategy generated each signal
    // For now, we'll update all active strategies
    const enabledStrategies = this.getEnabledStrategies();
    enabledStrategies.forEach(strategyName => {
      this.strategyManager.updateStrategyPerformance(strategyName, profit, tradeResult);
    });
  }

  private async closeAllPositions(): Promise<void> {
    const ticker = await this.client.getTicker(this.config.pair);
    const currentPrice = parseFloat(ticker.last);

    for (const [positionId] of this.activePositions) {
      await this.closePosition(positionId, currentPrice, 'Bot shutdown');
    }
  }

  private logTradingStatus(signal: TradingSignal): void {
    const metrics = this.profitCalculator.calculateProfitMetrics();
    const portfolioSummary = this.strategyManager.getPortfolioSummary();
    
    console.log(`
--- Advanced Trading Status ---
Signal: ${signal.action} (${(signal.confidence * 100).toFixed(1)}% confidence)
Reason: ${signal.reason}
Active Positions: ${this.activePositions.size}
Total Profit: ${metrics.totalProfit.toFixed(2)} JPY
Win Rate: ${(metrics.winRate * 100).toFixed(2)}%
Total Trades: ${metrics.totalTrades}
Current Balance: ${this.profitCalculator.getCurrentBalance().toFixed(2)} JPY
Active Strategies: ${portfolioSummary.activeStrategies}
Market Condition: ${portfolioSummary.marketCondition.trend} (${portfolioSummary.marketCondition.volatility} volatility)
-----------------------------
    `);
  }

  private logMarketSummary(): void {
    const marketSummary = this.strategyManager.getMarketSummary();
    const marketAnalysis = this.strategyManager.getMarketAnalysis();
    
    console.log(`
--- Market Summary ---
Current Price: ${marketSummary.currentPrice.toFixed(2)} JPY
24h Change: ${(marketSummary.priceChange24h * 100).toFixed(2)}%
Volatility: ${(marketSummary.volatility * 100).toFixed(2)}%
Volume: ${marketSummary.volume24h.toFixed(2)}
Trend: ${marketSummary.trend}
Recommended Strategies: ${marketAnalysis.recommendedStrategies.join(', ')}
Risk Level: ${(marketAnalysis.riskLevel * 100).toFixed(1)}%
--------------------
    `);
  }

  private logPerformanceReport(): void {
    const portfolioSummary = this.strategyManager.getPortfolioSummary();
    const bestStrategy = this.strategyManager.getBestPerformingStrategy();
    
    console.log(`
--- Performance Report ---
Total Allocated Capital: ${portfolioSummary.totalAllocatedCapital.toFixed(2)} JPY
Active Strategies: ${portfolioSummary.activeStrategies}
Best Performing Strategy: ${bestStrategy?.name || 'None'} (${bestStrategy ? (bestStrategy.performance.winRate * 100).toFixed(1) : 0}% win rate)

Strategy Performance:
${portfolioSummary.performanceMetrics.map(perf => 
  `${perf.name}: ${perf.totalTrades} trades, ${(perf.winRate * 100).toFixed(1)}% win rate, ${perf.averageProfit.toFixed(2)} avg profit`
).join('\n')}
------------------------
    `);
  }

  private generateFinalReport(): string {
    const metrics = this.profitCalculator.calculateProfitMetrics();
    const portfolioSummary = this.strategyManager.getPortfolioSummary();
    const recommendations = this.strategyManager.getStrategyRecommendations();
    
    return `
=== FINAL TRADING REPORT ===
Trading Pair: ${this.config.pair}
Initial Balance: ${this.config.initialBalance.toFixed(2)} JPY
Final Balance: ${this.profitCalculator.getCurrentBalance().toFixed(2)} JPY
Total Profit: ${metrics.totalProfit.toFixed(2)} JPY
Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%
Win Rate: ${(metrics.winRate * 100).toFixed(2)}%
Total Trades: ${metrics.totalTrades}
Max Drawdown: ${metrics.maxDrawdown.toFixed(2)} JPY

Strategy Performance:
${portfolioSummary.performanceMetrics.map(perf => 
  `- ${perf.name}: ${perf.totalTrades} trades, ${(perf.winRate * 100).toFixed(1)}% win rate, ${perf.averageProfit.toFixed(2)} avg profit`
).join('\n')}

Recommendations:
${recommendations.map(rec => `- ${rec.strategy}: ${rec.reason}`).join('\n')}

===========================
    `;
  }

  private getEnabledStrategies(): string[] {
    const portfolioSummary = this.strategyManager.getPortfolioSummary();
    return portfolioSummary.performanceMetrics
      .filter(perf => this.strategyManager.getStrategy(perf.name)?.isEnabled())
      .map(perf => perf.name);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public methods for monitoring and control
  getProfitReport(): string {
    return this.generateFinalReport();
  }

  getActivePositions(): TradingPosition[] {
    return Array.from(this.activePositions.values());
  }

  getPortfolioSummary(): any {
    return this.strategyManager.getPortfolioSummary();
  }

  getStrategyRecommendations(): any {
    return this.strategyManager.getStrategyRecommendations();
  }

  enableStrategy(strategyName: string, enabled: boolean): void {
    this.strategyManager.enableStrategy(strategyName, enabled);
  }

  updateStrategyWeight(strategyName: string, weight: number): void {
    this.strategyManager.updateStrategyWeight(strategyName, weight);
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getTradeHistory(): any[] {
    return this.tradeHistory;
  }
}