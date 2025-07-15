import { config } from 'dotenv';
import { TradingBot, TradingBotConfig } from './bot/trading-bot';
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

const startTradingBot = async (): Promise<void> => {
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

export { TradingBot, TradingBotConfig, createTradingBotConfig };