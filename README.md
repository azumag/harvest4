# Harvest4 - Bitcoin Trading Bot

A sophisticated Bitcoin trading bot for the Bitbank cryptocurrency exchange, built with TypeScript and designed for automated profit maximization.

## Features

- 🚀 **Automated Trading**: Continuous Bitcoin trading on Bitbank exchange
- 📊 **Technical Analysis**: Moving averages, momentum, and volatility analysis
- 💰 **Profit Maximization**: Optimized trading strategies for maximum returns
- 🛡️ **Risk Management**: Stop-loss, take-profit, and position sizing
- 📈 **Performance Tracking**: Real-time profit/loss monitoring
- 🔧 **TDD Approach**: Test-driven development with comprehensive coverage
- ☁️ **Cloud Deployment**: Google Cloud Run with automated CI/CD

## Quick Start

### Prerequisites
- Node.js 18+ or 20+
- Bitbank API credentials
- Google Cloud account (for deployment)

### Installation
```bash
npm install
```

### Configuration
Create a `.env` file:
```
BB_API_KEY=your_bitbank_api_key
BB_API_SECRET=your_bitbank_api_secret
NODE_ENV=development
```

### Development
```bash
npm run dev          # Start development server
npm run test         # Run test suite
npm run build        # Build for production
```

### Deployment
```bash
# Deploy to Google Cloud Run
./deploy.sh
```

## Trading Strategy

The bot uses a sophisticated technical analysis approach:

- **Moving Average Crossover**: 5-period and 20-period MA signals
- **Momentum Analysis**: Price momentum over 10 periods
- **Volatility Adjustment**: Dynamic position sizing
- **Volume Confirmation**: Trade signal validation

## Risk Management

- **Stop Loss**: 2% default protection
- **Take Profit**: 4% target profit
- **Position Limits**: Maximum 3 concurrent trades
- **Trade Cooldown**: 1-minute minimum between trades

## Architecture

- **API Client**: Bitbank REST API integration with HMAC authentication
- **Trading Strategy**: Technical analysis with multiple indicators
- **Profit Calculator**: Real-time P&L tracking and performance metrics
- **Trading Bot**: Main orchestrator with error handling and monitoring

## Testing

Comprehensive test suite following TDD principles:

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

## Deployment

The bot is designed for Google Cloud Run deployment with:

- **Container**: Docker-based deployment
- **Secrets**: API keys in Google Secret Manager
- **Scheduling**: Hourly execution via Cloud Scheduler
- **Monitoring**: Health checks and logging

## Documentation

See [CLAUDE.md](CLAUDE.md) for detailed technical documentation.

## License

MIT License - see LICENSE file for details.

## Disclaimer

⚠️ **Trading Risk**: Cryptocurrency trading involves significant financial risk. Use this bot at your own risk and never invest more than you can afford to lose.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request