const { TradingStrategy } = require('./dist/strategies/trading-strategy');

const config = {
  buyThreshold: 0.02,
  sellThreshold: 0.02,
  minProfitMargin: 0.01,
  maxTradeAmount: 10000,
  riskTolerance: 0.8,
};

const strategy = new TradingStrategy(config);

// Create upward trend
const prices = [];
for (let i = 0; i < 15; i++) {
  prices.push(5000000 + i * 10000); // Increasing price
}

prices.forEach(price => strategy.updatePrice(price));

const ticker = {
  pair: 'btc_jpy',
  sell: '5141000',
  buy: '5139000',
  high: '5142000',
  low: '5138000',
  last: '5140000',
  vol: '2000',
  timestamp: Date.now(),
};

const signal = strategy.generateSignal(ticker);
console.log('Signal:', signal);

// Let's also check the internals
console.log('Price history:', strategy.priceHistory);
console.log('Short MA:', strategy.calculateMovingAverage(5));
console.log('Long MA:', strategy.calculateMovingAverage(20));
console.log('Momentum:', strategy.calculateMomentum());
console.log('Volatility:', strategy.calculateVolatility());