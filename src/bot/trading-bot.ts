import { BitbankClient } from '../api/bitbank-client';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { ProfitCalculator } from '../utils/profit-calculator';
import { BitbankConfig, TradingSignal, TradingPosition, BitbankTicker } from '../types/bitbank';

export interface TradingBotConfig extends BitbankConfig {
  pair: string;
  strategy: TradingStrategyConfig;
  initialBalance: number;
  maxConcurrentTrades: number;
  tradingInterval: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
}

export class TradingBot {
  private client: BitbankClient;
  private strategy: TradingStrategy;
  private profitCalculator: ProfitCalculator;
  private config: TradingBotConfig;
  private isRunning = false;
  private activePositions: Map<string, TradingPosition> = new Map();
  private lastTradeTime = 0;
  private readonly MIN_TRADE_INTERVAL = 60000; // 1 minute minimum between trades

  constructor(config: TradingBotConfig) {
    this.config = config;
    this.client = new BitbankClient(config);
    this.strategy = new TradingStrategy(config.strategy);
    this.profitCalculator = new ProfitCalculator(config.initialBalance);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Trading bot is already running');
    }

    this.isRunning = true;
    
    try {
      await this.validateConfiguration();
      await this.tradingLoop();
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Close all open positions
    await this.closeAllPositions();
    
    // Generate final report
  }

  private async validateConfiguration(): Promise<void> {
    try {
      // Test API connection
      await this.client.getTicker(this.config.pair);
      
      // Check balance
      const balances = await this.client.getBalance();
      const jpyBalance = balances.find(b => b.asset === 'jpy');
      const btcBalance = balances.find(b => b.asset === 'btc');
      
      
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
      }
    } catch (error) {
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

      if (trade) {
      }
    } catch (error) {
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