import { config } from 'dotenv';
import { TradingBot, TradingBotConfig } from './bot/trading-bot';
import { AdvancedTradingBot, AdvancedTradingBotConfig } from './bot/advanced-trading-bot';
import { StrategyManagerConfig } from './strategies/strategy-manager';
import * as cron from 'node-cron';

config();

const createTradingBotConfig = (): TradingBotConfig => {
  const apiKey = process.env['BB_API_KEY'];
  const apiSecret = process.env['BB_API_SECRET'];

  if (!apiKey || !apiSecret) {
    throw new Error('Missing required environment variables: BB_API_KEY and BB_API_SECRET');
  }

  return {
    apiKey,
    apiSecret,
    baseUrl: 'https://api.bitbank.cc',
    pair: 'btc_jpy',
    initialBalance: 100000, // 100,000 JPY
    maxConcurrentTrades: 3,
    tradingInterval: 30000, // 30 seconds
    stopLossPercentage: 2, // 2%
    takeProfitPercentage: 4, // 4%
    strategy: {
      buyThreshold: 0.02, // 2% momentum threshold
      sellThreshold: 0.02, // 2% momentum threshold
      minProfitMargin: 0.01, // 1% minimum profit margin
      maxTradeAmount: 10000, // 10,000 JPY per trade
      riskTolerance: 0.8, // 80% risk tolerance
    },
  };
};

const createAdvancedTradingBotConfig = (): AdvancedTradingBotConfig => {
  const apiKey = process.env['BB_API_KEY'];
  const apiSecret = process.env['BB_API_SECRET'];

  if (!apiKey || !apiSecret) {
    throw new Error('Missing required environment variables: BB_API_KEY and BB_API_SECRET');
  }

  const strategyManagerConfig: StrategyManagerConfig = {
    totalCapital: 100000, // 100,000 JPY
    maxConcurrentStrategies: 3,
    rebalanceInterval: 3600, // 1 hour
    performanceWindowSize: 100,
    minStrategyWeight: 0.05,
    maxStrategyWeight: 0.5,
    strategies: {
      gridTrading: {
        name: 'Grid Trading',
        enabled: true,
        weight: 0.2,
        params: {
          priceRange: 100000, // 100,000 JPY price range
          gridLevels: 10,
          quantityPerLevel: 0.01, // 0.01 BTC per level
          rebalanceThreshold: 0.05 // 5% price change triggers rebalance
        }
      },
      arbitrage: {
        name: 'Arbitrage',
        enabled: true,
        weight: 0.15,
        params: {
          minSpread: 0.002, // 0.2% minimum spread
          maxRiskPerTrade: 10000, // 10,000 JPY max risk per trade
          exchangeDelayMs: 1000 // 1 second exchange delay tolerance
        }
      },
      marketMaking: {
        name: 'Market Making',
        enabled: true,
        weight: 0.25,
        params: {
          bidSpread: 0.001, // 0.1% bid spread
          askSpread: 0.001, // 0.1% ask spread
          maxInventory: 0.1, // 0.1 BTC max inventory
          requoteThreshold: 0.005 // 0.5% price change triggers requote
        }
      },
      momentum: {
        name: 'Momentum',
        enabled: true,
        weight: 0.2,
        params: {
          lookbackPeriod: 20,
          momentumThreshold: 0.02, // 2% momentum threshold
          volumeConfirmation: true,
          breakoutFactor: 0.01 // 1% breakout factor
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
          maxHoldingPeriod: 3600000 // 1 hour max holding period
        }
      },
      machineLearning: {
        name: 'Machine Learning',
        enabled: true,
        weight: 0.3,
        params: {
          features: ['price_ma_5', 'price_ma_10', 'price_ma_20', 'volume_ma_5', 'rsi_14', 'price_momentum_5'],
          modelType: 'linear',
          trainingPeriod: 100,
          retrainInterval: 3600, // 1 hour
          predictionHorizon: 5
        }
      }
    }
  };

  return {
    apiKey,
    apiSecret,
    baseUrl: 'https://api.bitbank.cc',
    pair: 'btc_jpy',
    initialBalance: 100000, // 100,000 JPY
    maxConcurrentTrades: 5, // More concurrent trades for advanced bot
    tradingInterval: 30000, // 30 seconds
    stopLossPercentage: 2, // 2%
    takeProfitPercentage: 4, // 4%
    strategyManager: strategyManagerConfig
  };
};

const startTradingBot = async (): Promise<void> => {
  const useAdvancedBot = process.env['USE_ADVANCED_BOT'] === 'true';
  
  if (useAdvancedBot) {
    await startAdvancedTradingBot();
  } else {
    await startBasicTradingBot();
  }
};

const startBasicTradingBot = async (): Promise<void> => {
  const botConfig = createTradingBotConfig();
  const bot = new TradingBot(botConfig);

  // Graceful shutdown handling
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await bot.stop();
      console.log('Bot stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    console.log('Starting Bitcoin Trading Bot for Bitbank...');
    console.log('Configuration:', {
      pair: botConfig.pair,
      initialBalance: botConfig.initialBalance,
      maxConcurrentTrades: botConfig.maxConcurrentTrades,
      tradingInterval: botConfig.tradingInterval,
      stopLossPercentage: botConfig.stopLossPercentage,
      takeProfitPercentage: botConfig.takeProfitPercentage,
    });

    await bot.start();
  } catch (error) {
    console.error('Failed to start trading bot:', error);
    process.exit(1);
  }
};

const startAdvancedTradingBot = async (): Promise<void> => {
  const botConfig = createAdvancedTradingBotConfig();
  const bot = new AdvancedTradingBot(botConfig);

  // Graceful shutdown handling
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await bot.stop();
      console.log('Advanced bot stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    console.log('Starting Advanced Bitcoin Trading Bot for Bitbank...');
    console.log('Configuration:', {
      pair: botConfig.pair,
      initialBalance: botConfig.initialBalance,
      maxConcurrentTrades: botConfig.maxConcurrentTrades,
      tradingInterval: botConfig.tradingInterval,
      stopLossPercentage: botConfig.stopLossPercentage,
      takeProfitPercentage: botConfig.takeProfitPercentage,
      activeStrategies: Object.keys(botConfig.strategyManager.strategies).filter(
        strategy => botConfig.strategyManager.strategies[strategy as keyof typeof botConfig.strategyManager.strategies].enabled
      ),
    });

    await bot.start();
  } catch (error) {
    console.error('Failed to start advanced trading bot:', error);
    process.exit(1);
  }
};

const scheduleBot = (): void => {
  console.log('Setting up scheduled trading bot...');
  
  // Schedule bot to run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('Starting scheduled trading session...');
    try {
      await startTradingBot();
    } catch (error) {
      console.error('Scheduled trading session failed:', error);
    }
  });

  console.log('Trading bot scheduled to run every hour');
};

// Main execution
if (require.main === module) {
  const mode = process.env['NODE_ENV'] || 'development';
  
  if (mode === 'production') {
    // In production (Cloud Run), run continuously
    startTradingBot().catch(error => {
      console.error('Production bot failed:', error);
      process.exit(1);
    });
  } else {
    // In development, use scheduled execution
    scheduleBot();
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('Shutting down scheduler...');
      process.exit(0);
    });
  }
}

export { 
  TradingBot, 
  TradingBotConfig, 
  createTradingBotConfig,
  AdvancedTradingBot,
  AdvancedTradingBotConfig,
  createAdvancedTradingBotConfig,
  startBasicTradingBot,
  startAdvancedTradingBot
};