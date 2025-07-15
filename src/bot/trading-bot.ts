import { BitbankClient } from '../api/bitbank-client';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { ProfitCalculator } from '../utils/profit-calculator';
import { MarketMonitor } from '../monitoring/market-monitor';
import { BitbankConfig, TradingSignal, TradingPosition, BitbankTicker, RealtimeMarketData, MarketAlert } from '../types/bitbank';

export interface TradingBotConfig extends BitbankConfig {
  pair: string;
  strategy: TradingStrategyConfig;
  initialBalance: number;
  maxConcurrentTrades: number;
  tradingInterval: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  enableRealtimeMonitoring?: boolean;
  marketMonitorConfig?: {
    orderBookConfig?: any;
    volumeConfig?: any;
    microstructureConfig?: any;
    alertThresholds?: any;
  };
}

export class TradingBot {
  private client: BitbankClient;
  private strategy: TradingStrategy;
  private profitCalculator: ProfitCalculator;
  private marketMonitor: MarketMonitor | null = null;
  private config: TradingBotConfig;
  private isRunning = false;
  private activePositions: Map<string, TradingPosition> = new Map();
  private lastTradeTime = 0;
  private readonly MIN_TRADE_INTERVAL = 60000; // 1 minute minimum between trades
  private currentMarketData: RealtimeMarketData | null = null;
  private criticalAlerts: MarketAlert[] = [];

  constructor(config: TradingBotConfig) {
    this.config = config;
    this.client = new BitbankClient(config);
    this.strategy = new TradingStrategy(config.strategy);
    this.profitCalculator = new ProfitCalculator(config.initialBalance);
    
    // Initialize market monitor if real-time monitoring is enabled
    if (config.enableRealtimeMonitoring) {
      this.marketMonitor = new MarketMonitor({
        pair: config.pair,
        ...config.marketMonitorConfig
      });
      this.setupMarketMonitorHandlers();
    }
  }

  private setupMarketMonitorHandlers(): void {
    if (!this.marketMonitor) return;

    this.marketMonitor.on('data_updated', (data: RealtimeMarketData) => {
      this.currentMarketData = data;
      this.processRealtimeData(data);
    });

    this.marketMonitor.on('alert', (alert: MarketAlert) => {
      this.handleMarketAlert(alert);
    });

    this.marketMonitor.on('connected', () => {
      console.log('Market monitor connected');
    });

    this.marketMonitor.on('disconnected', () => {
      console.log('Market monitor disconnected');
    });

    this.marketMonitor.on('error', (error: any) => {
      console.error('Market monitor error:', error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Trading bot is already running');
    }

    this.isRunning = true;
    console.log(`Starting trading bot for ${this.config.pair}`);
    
    try {
      await this.validateConfiguration();
      
      // Start market monitor if enabled
      if (this.marketMonitor) {
        await this.marketMonitor.start();
        console.log('Real-time market monitoring enabled');
      }
      
      await this.tradingLoop();
    } catch (error) {
      console.error('Trading bot error:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('Trading bot stopped');
    
    // Stop market monitor
    if (this.marketMonitor) {
      this.marketMonitor.stop();
    }
    
    // Close all open positions
    await this.closeAllPositions();
    
    // Generate final report
    console.log(this.profitCalculator.getPerformanceReport());
  }

  private processRealtimeData(data: RealtimeMarketData): void {
    // Process real-time market data for enhanced trading decisions
    if (this.shouldProcessRealtimeSignal(data)) {
      this.generateEnhancedSignal(data);
    }
  }

  private shouldProcessRealtimeSignal(data: RealtimeMarketData): boolean {
    // Only process if we have sufficient data and no critical alerts
    return (
      data.analysis.orderBook.midPrice > 0 &&
      data.analysis.volume.currentVolume > 0 &&
      this.criticalAlerts.length === 0
    );
  }

  private generateEnhancedSignal(data: RealtimeMarketData): void {
    // Convert real-time data to ticker format for strategy
    const ticker: BitbankTicker = {
      pair: data.pair,
      sell: data.ticker.sell,
      buy: data.ticker.buy,
      high: data.ticker.high,
      low: data.ticker.low,
      last: data.ticker.last,
      vol: data.ticker.vol,
      timestamp: data.ticker.timestamp
    };

    // Generate signal with enhanced data
    const signal = this.strategy.generateSignal(ticker, data);
    
    // Execute signal with real-time context
    this.executeSignalWithContext(signal, data);
  }

  private handleMarketAlert(alert: MarketAlert): void {
    console.log(`Market Alert [${alert.level}]: ${alert.message}`);
    
    // Handle critical alerts
    if (alert.level === 'critical') {
      this.criticalAlerts.push(alert);
      
      // Pause trading for critical alerts
      if (alert.type === 'system') {
        console.log('Trading paused due to critical system alert');
        return;
      }
      
      // Close positions on critical market alerts
      if (alert.type === 'anomaly' || alert.type === 'breakout') {
        this.handleCriticalMarketAlert(alert);
      }
    }
    
    // Clean up old alerts
    this.criticalAlerts = this.criticalAlerts.filter(a => 
      Date.now() - a.timestamp < 300000 // Keep alerts for 5 minutes
    );
  }

  private async handleCriticalMarketAlert(alert: MarketAlert): Promise<void> {
    console.log(`Handling critical market alert: ${alert.message}`);
    
    // Consider closing positions based on alert type
    if (alert.type === 'anomaly' && this.activePositions.size > 0) {
      console.log('Market anomaly detected - reviewing positions');
      // Could implement position review logic here
    }
  }

  private async executeSignalWithContext(signal: TradingSignal, marketData: RealtimeMarketData): Promise<void> {
    // Enhanced signal execution with real-time market context
    if (signal.action === 'hold') {
      return;
    }

    // Additional checks based on real-time data
    if (!this.isMarketConditionsFavorable(marketData)) {
      console.log('Market conditions not favorable for trading');
      return;
    }

    // Use original execution logic
    await this.executeSignal(signal);
  }

  private isMarketConditionsFavorable(data: RealtimeMarketData): boolean {
    const orderBook = data.analysis.orderBook;
    const volume = data.analysis.volume;
    const microstructure = data.analysis.microstructure;
    
    // Check spread is not too wide
    if (orderBook.bidAskSpreadPercent > 1.0) { // 1% spread threshold
      return false;
    }
    
    // Check for adequate liquidity
    if (orderBook.liquidityDepth < 0.1) { // Minimum liquidity threshold
      return false;
    }
    
    // Check for normal volume conditions
    if (volume.volumeSpike && volume.currentVolume > volume.volumeMA * 5) {
      return false; // Avoid trading during extreme volume spikes
    }
    
    // Check execution quality
    if (microstructure.executionQuality < 0.3) {
      return false;
    }
    
    return true;
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

  private async tradingLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.executeTradingCycle();
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
    
    // Generate trading signal
    const signal = this.strategy.generateSignal(ticker);
    
    // Check stop loss and take profit for existing positions
    await this.checkStopLossAndTakeProfit(ticker);
    
    // Execute trades based on signal
    await this.executeSignal(signal);
    
    // Log current status
    this.logTradingStatus(signal);
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
        console.log(`Order placed: ${signal.action} ${signal.amount} BTC at ${signal.price} JPY`);
      }
    } catch (error) {
      console.error('Order execution error:', error);
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

      console.log(`Position closed: ${reason}`);
      if (trade) {
        console.log(`Trade result: ${trade.profit.toFixed(2)} JPY (${(trade.returnRate * 100).toFixed(2)}%)`);
      }
    } catch (error) {
      console.error('Failed to close position:', error);
    }
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
    console.log(`
--- Trading Status ---
Signal: ${signal.action} (${signal.confidence.toFixed(2)} confidence)
Reason: ${signal.reason}
Active Positions: ${this.activePositions.size}
Total Profit: ${metrics.totalProfit.toFixed(2)} JPY
Win Rate: ${(metrics.winRate * 100).toFixed(2)}%
Total Trades: ${metrics.totalTrades}
Current Balance: ${this.profitCalculator.getCurrentBalance().toFixed(2)} JPY
--------------------
    `);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProfitReport(): string {
    return this.profitCalculator.getPerformanceReport();
  }

  getActivePositions(): TradingPosition[] {
    return Array.from(this.activePositions.values());
  }

  isActive(): boolean {
    return this.isRunning;
  }
}