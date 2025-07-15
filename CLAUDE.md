# CLAUDE.md - Bitcoin Trading Bot for Bitbank Exchange

## Project Overview
This is a Bitcoin sell/buy trading bot designed for the Bitbank cryptocurrency exchange. The bot uses technical analysis to make trading decisions and constantly strives to maximize profits through automated trading strategies.

## Architecture
- **Target Exchange**: Bitbank (https://github.com/bitbankinc/bitbank-api-docs)
- **Language**: TypeScript/Node.js
- **Development Approach**: TDD (Test-Driven Development) - t-wada style
- **Deployment**: Google Cloud Run with automated CI/CD

## API Configuration
- **API Key**: Stored in `secrets.BB_API_KEY` (Google Secret Manager)
- **API Secret**: Stored in `secrets.BB_API_SECRET` (Google Secret Manager)
- **Base URL**: https://api.bitbank.cc

## Project Structure
```
src/
├── api/
│   └── bitbank-client.ts       # Bitbank API client with HMAC authentication
├── bot/
│   └── trading-bot.ts          # Main trading bot orchestrator
├── strategies/
│   └── trading-strategy.ts     # Technical analysis trading strategy
├── types/
│   └── bitbank.ts             # TypeScript type definitions
├── utils/
│   ├── profit-calculator.ts    # Profit calculation and tracking
│   ├── dynamic-risk-manager.ts # Comprehensive dynamic risk management
│   ├── atr-calculator.ts       # Average True Range calculation
│   ├── kelly-criterion.ts      # Kelly Criterion position sizing
│   ├── trailing-stop.ts        # Trailing stop management
│   └── performance-indicators.ts # Advanced performance metrics
├── __tests__/                 # Comprehensive test suite
└── index.ts                   # Application entry point
```

## Key Features

### 1. Technical Analysis Trading Strategy
- **Moving Average Crossover**: Uses 5-period and 20-period moving averages
- **Momentum Analysis**: Calculates price momentum over 10 periods
- **Volatility Analysis**: Adjusts position sizes based on market volatility
- **Volume Analysis**: Considers trading volume for signal confirmation

### 2. Dynamic Risk Management
- **ATR-Based Dynamic Stops**: Dynamic stop loss and take profit based on Average True Range
- **Kelly Criterion Sizing**: Optimal position sizing with conservative scaling (25% max Kelly)
- **Trailing Stops**: Multi-tier trailing stop system with ATR-based adjustments
- **Market Regime Adaptation**: Risk parameters adapt to trending/ranging/volatile markets
- **Drawdown Protection**: Automatic position size reduction during drawdowns
- **Maximum Concurrent Trades**: Limited to 3 simultaneous positions
- **Minimum Trade Interval**: 1 minute cooldown between trades

### 3. Advanced Performance Analytics
- **Real-time P&L**: Continuous profit/loss monitoring with unrealized positions
- **Performance Metrics**: Sharpe ratio, Sortino ratio, Calmar ratio, VaR
- **Trade History**: Complete record with Kelly Criterion statistics
- **Performance Reports**: Comprehensive risk-adjusted profitability analysis
- **Market Correlation**: Position correlation analysis and risk assessment

### 4. Dynamic Risk Management Features
- **ATR Calculation**: Wilder's smoothing method for volatility assessment
- **Kelly Criterion**: Mathematical position sizing with conservative scaling
- **Trailing Stops**: ATR-based, stepped, and percentage-based trailing systems
- **Market Regime Detection**: Automatic detection of trending/ranging/volatile markets
- **Portfolio Risk Management**: Real-time exposure and correlation monitoring
- **Drawdown Protection**: Automatic position size reduction during adverse periods

### 5. Error Handling & Monitoring
- **Graceful Shutdown**: Proper cleanup on termination signals
- **API Error Handling**: Robust error handling for API failures
- **Health Checks**: Docker health checks for deployment monitoring
- **Logging**: Comprehensive logging of trading activities

## Development Setup

### Prerequisites
- Node.js 18+ or 20+
- npm package manager
- Docker (for containerization)
- Google Cloud CLI (for deployment)

### Installation
```bash
npm install
```

### Development Commands
```bash
npm run dev          # Start development server
npm run build        # Build TypeScript
npm run test         # Run test suite
npm run test:watch   # Watch mode testing
npm run test:coverage # Test coverage report
npm run lint         # Code linting
npm run lint:fix     # Fix linting issues
```

### Environment Variables
Create a `.env` file for local development:
```
BB_API_KEY=your_bitbank_api_key
BB_API_SECRET=your_bitbank_api_secret
NODE_ENV=development
```

## Testing Approach (TDD - t-wada Style)

### Test Structure
- **Unit Tests**: Individual component testing with mocks
- **Integration Tests**: End-to-end application flow testing
- **Test-First Development**: Write tests before implementation
- **Comprehensive Mocking**: Mock external dependencies for isolated testing

### Test Categories
1. **API Client Tests**: Bitbank API integration testing
2. **Trading Strategy Tests**: Technical analysis algorithm validation
3. **Profit Calculator Tests**: Financial calculation accuracy
4. **Trading Bot Tests**: Main bot orchestration logic
5. **Dynamic Risk Management Tests**: ATR, Kelly Criterion, trailing stops validation
6. **Performance Indicators Tests**: Advanced metrics calculation accuracy
7. **Integration Tests**: End-to-end application configuration and flow

### Running Tests
```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

## Deployment

### Google Cloud Run Deployment
The bot is configured for automatic deployment to Google Cloud Run with the following features:
- **Container**: Docker-based deployment
- **Secrets**: API keys stored in Google Secret Manager
- **Scaling**: Single instance with no CPU throttling
- **Scheduling**: Hourly execution via Cloud Scheduler
- **Monitoring**: Health checks and logging

### Deployment Process
1. **GitHub Actions**: Automated CI/CD pipeline
2. **Merge to Main**: Triggers automatic deployment
3. **Container Build**: Docker image creation and push
4. **Cloud Run Deploy**: Service deployment with secrets
5. **Scheduler Setup**: Hourly execution configuration

### Manual Deployment
```bash
# Set environment variables
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=asia-northeast1
export BB_API_KEY=your_api_key
export BB_API_SECRET=your_api_secret

# Run deployment script
chmod +x deploy.sh
./deploy.sh
```

## Trading Configuration

### Default Settings
- **Trading Pair**: BTC/JPY
- **Initial Balance**: 100,000 JPY
- **Trading Interval**: 30 seconds
- **Dynamic Stop Loss**: ATR-based with 2.0x multiplier (adaptive)
- **Dynamic Take Profit**: ATR-based with 3.0x multiplier (adaptive)
- **Position Sizing**: Kelly Criterion with 25% maximum allocation
- **Maximum Trade Amount**: 10,000 JPY per trade
- **Risk Tolerance**: Conservative 75% Kelly scaling

### Strategy Parameters
- **Buy Threshold**: 2% positive momentum
- **Sell Threshold**: 2% negative momentum
- **Minimum Profit Margin**: 1%
- **Maximum Concurrent Trades**: 3
- **Volatility Adjustment**: Dynamic position sizing

## Profit Maximization Strategy

### Core Principles
1. **Trend Following**: Identify and follow market trends
2. **Risk Management**: Strict stop-loss and position sizing
3. **Momentum Trading**: Enter positions with strong momentum
4. **Volatility Adaptation**: Adjust trade sizes based on market volatility
5. **Profit Taking**: Systematic profit realization at target levels

### Performance Monitoring
- **Advanced Metrics**: Sharpe ratio, Sortino ratio, Calmar ratio
- **Risk Metrics**: Value at Risk (VaR), Conditional VaR, Maximum Drawdown
- **Drawdown Management**: Dynamic position size reduction during drawdowns
- **Win Rate Optimization**: Kelly Criterion-based strategy refinement
- **Return Analysis**: Risk-adjusted returns with volatility normalization
- **Market Regime Detection**: Adaptive parameters for trending/ranging/volatile markets

## Maintenance & Support

### Monitoring
- **Log Analysis**: Trading activity and error monitoring
- **Performance Metrics**: Regular profit/loss analysis
- **API Health**: Bitbank API connectivity monitoring
- **System Health**: Cloud Run service health checks

### Updates
- **Strategy Refinement**: Continuous improvement of trading algorithms
- **Risk Parameters**: Adjustment of stop-loss and take-profit levels
- **Market Adaptation**: Strategy updates based on market conditions

## Important Notes

### Security
- **API Credentials**: Never commit API keys to version control
- **Secret Management**: Use Google Secret Manager for production
- **Access Control**: Limit API permissions to trading functions only

### Compliance
- **Risk Disclosure**: Cryptocurrency trading involves significant risk
- **Testing**: Thoroughly test all changes before production deployment
- **Monitoring**: Continuous monitoring of trading performance required

### Support
- **Documentation**: Complete API documentation available
- **Testing**: Comprehensive test suite for validation
- **Deployment**: Automated deployment pipeline configured

---

This trading bot is designed to operate continuously and autonomously while maintaining strict risk management and profit optimization protocols. All code follows TDD principles with comprehensive testing coverage.