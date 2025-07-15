import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  AdvancedTradingStrategy, 
  MarketCondition, 
  PortfolioAllocation, 
  StrategyPerformance,
  GridTradingConfig,
  ArbitrageConfig,
  MarketMakingConfig,
  MomentumConfig,
  MeanReversionConfig,
  MachineLearningConfig
} from '../types/advanced-strategies';
import { MarketAnalyzer } from '../analysis/market-analyzer';
import { GridTradingStrategy } from './grid-trading';
import { ArbitrageStrategy } from './arbitrage';
import { MarketMakingStrategy } from './market-making';
import { MomentumStrategy } from './momentum';
import { MeanReversionStrategy } from './mean-reversion';
import { MachineLearningStrategy } from './machine-learning';

export interface StrategyManagerConfig {
  totalCapital: number;
  maxConcurrentStrategies: number;
  rebalanceInterval: number;
  performanceWindowSize: number;
  minStrategyWeight: number;
  maxStrategyWeight: number;
  strategies: {
    gridTrading: GridTradingConfig;
    arbitrage: ArbitrageConfig;
    marketMaking: MarketMakingConfig;
    momentum: MomentumConfig;
    meanReversion: MeanReversionConfig;
    machineLearning: MachineLearningConfig;
  };
}

export class StrategyManager {
  private strategies: Map<string, AdvancedTradingStrategy> = new Map();
  private marketAnalyzer: MarketAnalyzer;
  private config: StrategyManagerConfig;
  private lastRebalanceTime = 0;
  private portfolioAllocations: PortfolioAllocation[] = [];
  private performanceHistory: StrategyPerformance[] = [];

  constructor(config: StrategyManagerConfig) {
    this.config = config;
    this.marketAnalyzer = new MarketAnalyzer();
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    // Initialize all strategy instances
    this.strategies.set('Grid Trading', new GridTradingStrategy(this.config.strategies.gridTrading));
    this.strategies.set('Arbitrage', new ArbitrageStrategy(this.config.strategies.arbitrage));
    this.strategies.set('Market Making', new MarketMakingStrategy(this.config.strategies.marketMaking));
    this.strategies.set('Momentum', new MomentumStrategy(this.config.strategies.momentum));
    this.strategies.set('Mean Reversion', new MeanReversionStrategy(this.config.strategies.meanReversion));
    this.strategies.set('Machine Learning', new MachineLearningStrategy(this.config.strategies.machineLearning));

    // Initialize portfolio allocations
    this.initializePortfolioAllocations();
  }

  private initializePortfolioAllocations(): void {
    this.portfolioAllocations = Array.from(this.strategies.keys()).map(strategyName => ({
      strategyName,
      weight: 1 / this.strategies.size, // Equal weight initially
      allocatedAmount: this.config.totalCapital / this.strategies.size,
      currentPositions: 0,
      expectedReturn: 0,
      riskLevel: 0.5
    }));
  }

  updateMarketData(ticker: BitbankTicker): void {
    // Update market analyzer
    this.marketAnalyzer.updateMarketData(ticker);

    // Update all strategies
    for (const strategy of this.strategies.values()) {
      strategy.updateMarketData(ticker);
    }

    // Check if rebalancing is needed
    if (this.shouldRebalance()) {
      this.rebalancePortfolio();
    }
  }

  generateCombinedSignal(ticker: BitbankTicker): TradingSignal {
    // Get current market analysis
    const marketAnalysis = this.marketAnalyzer.analyzeMarket();
    
    // Generate signals from all enabled strategies
    const signals: Array<{ signal: TradingSignal; strategy: string; weight: number }> = [];

    for (const [strategyName, strategy] of this.strategies) {
      if (strategy.isEnabled()) {
        const signal = strategy.generateSignal(ticker, marketAnalysis.condition);
        const allocation = this.portfolioAllocations.find(a => a.strategyName === strategyName);
        
        if (allocation && signal.action !== 'hold') {
          signals.push({
            signal,
            strategy: strategyName,
            weight: allocation.weight
          });
        }
      }
    }

    // If no signals, return hold
    if (signals.length === 0) {
      return {
        action: 'hold',
        confidence: 0.5,
        price: parseFloat(ticker.last),
        amount: 0,
        reason: 'No strategy signals generated'
      };
    }

    // Combine signals using weighted voting
    return this.combineSignals(signals, ticker);
  }

  private combineSignals(signals: Array<{ signal: TradingSignal; strategy: string; weight: number }>, ticker: BitbankTicker): TradingSignal {
    // Separate buy and sell signals
    const buySignals = signals.filter(s => s.signal.action === 'buy');
    const sellSignals = signals.filter(s => s.signal.action === 'sell');

    // Calculate weighted scores
    const buyScore = buySignals.reduce((sum, s) => sum + (s.signal.confidence * s.weight), 0);
    const sellScore = sellSignals.reduce((sum, s) => sum + (s.signal.confidence * s.weight), 0);

    const currentPrice = parseFloat(ticker.last);

    // Determine final action
    if (buyScore > sellScore && buyScore > 0.3) {
      // Calculate weighted average price and amount
      const avgPrice = this.calculateWeightedAverage(buySignals, 'price');
      const totalAmount = buySignals.reduce((sum, s) => sum + (s.signal.amount * s.weight), 0);
      const strategies = buySignals.map(s => s.strategy).join(', ');

      return {
        action: 'buy',
        confidence: Math.min(0.95, buyScore),
        price: avgPrice,
        amount: totalAmount,
        reason: `Combined buy signal from: ${strategies} (score: ${buyScore.toFixed(2)})`
      };
    } else if (sellScore > buyScore && sellScore > 0.3) {
      // Calculate weighted average price and amount
      const avgPrice = this.calculateWeightedAverage(sellSignals, 'price');
      const totalAmount = sellSignals.reduce((sum, s) => sum + (s.signal.amount * s.weight), 0);
      const strategies = sellSignals.map(s => s.strategy).join(', ');

      return {
        action: 'sell',
        confidence: Math.min(0.95, sellScore),
        price: avgPrice,
        amount: totalAmount,
        reason: `Combined sell signal from: ${strategies} (score: ${sellScore.toFixed(2)})`
      };
    }

    return {
      action: 'hold',
      confidence: 0.5,
      price: currentPrice,
      amount: 0,
      reason: `Conflicting signals: Buy=${buyScore.toFixed(2)}, Sell=${sellScore.toFixed(2)}`
    };
  }

  private calculateWeightedAverage(signals: Array<{ signal: TradingSignal; strategy: string; weight: number }>, field: 'price' | 'amount'): number {
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = signals.reduce((sum, s) => sum + (s.signal[field] * s.weight), 0);
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private shouldRebalance(): boolean {
    const timeSinceRebalance = Date.now() - this.lastRebalanceTime;
    return timeSinceRebalance > this.config.rebalanceInterval * 1000;
  }

  private rebalancePortfolio(): void {
    console.log('Rebalancing portfolio...');
    
    // Get current market analysis
    const marketAnalysis = this.marketAnalyzer.analyzeMarket();
    
    // Get performance metrics for all strategies
    const performances = new Map<string, StrategyPerformance>();
    for (const [strategyName, strategy] of this.strategies) {
      performances.set(strategyName, strategy.getPerformanceMetrics());
    }

    // Calculate new weights based on performance and market conditions
    const newAllocations = this.calculateOptimalAllocations(performances, marketAnalysis);
    
    // Update portfolio allocations
    this.portfolioAllocations = newAllocations;
    this.lastRebalanceTime = Date.now();
    
    console.log('Portfolio rebalanced:', this.portfolioAllocations);
  }

  private calculateOptimalAllocations(performances: Map<string, StrategyPerformance>, marketAnalysis: any): PortfolioAllocation[] {
    const allocations: PortfolioAllocation[] = [];
    
    // Get recommended strategies for current market conditions
    const recommendedStrategies = marketAnalysis.recommendedStrategies;
    
    // Calculate performance scores
    const performanceScores = new Map<string, number>();
    for (const [strategyName, performance] of performances) {
      let score = 0;
      
      // Base score from win rate and average profit
      score += performance.winRate * 0.4;
      score += Math.max(0, performance.averageProfit / 1000) * 0.3; // Normalize profit
      score += Math.max(0, performance.sharpeRatio) * 0.2;
      
      // Penalty for high drawdown
      score -= Math.min(0.3, performance.maxDrawdown / 10000) * 0.1;
      
      // Bonus for recommended strategies
      if (recommendedStrategies.includes(strategyName)) {
        score += 0.2;
      }
      
      performanceScores.set(strategyName, Math.max(0.1, score));
    }
    
    // Normalize scores to get weights
    const totalScore = Array.from(performanceScores.values()).reduce((sum, score) => sum + score, 0);
    
    for (const [strategyName, score] of performanceScores) {
      const weight = Math.max(
        this.config.minStrategyWeight,
        Math.min(this.config.maxStrategyWeight, score / totalScore)
      );
      
      allocations.push({
        strategyName,
        weight,
        allocatedAmount: this.config.totalCapital * weight,
        currentPositions: 0,
        expectedReturn: performances.get(strategyName)?.averageProfit || 0,
        riskLevel: marketAnalysis.riskLevel
      });
    }
    
    return allocations;
  }

  updateStrategyPerformance(strategyName: string, profit: number, tradeResult: 'win' | 'loss'): void {
    const strategy = this.strategies.get(strategyName);
    if (strategy) {
      strategy.updatePerformance(profit, tradeResult);
    }
  }

  getPortfolioSummary(): {
    totalAllocatedCapital: number;
    activeStrategies: number;
    performanceMetrics: StrategyPerformance[];
    marketCondition: MarketCondition;
    allocations: PortfolioAllocation[];
  } {
    const performanceMetrics = Array.from(this.strategies.keys()).map(strategyName => {
      const strategy = this.strategies.get(strategyName);
      return strategy ? strategy.getPerformanceMetrics() : null;
    }).filter(Boolean) as StrategyPerformance[];

    const totalAllocatedCapital = this.portfolioAllocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0);
    const activeStrategies = this.portfolioAllocations.filter(allocation => allocation.weight > 0).length;
    const marketCondition = this.marketAnalyzer.getCurrentMarketCondition();

    return {
      totalAllocatedCapital,
      activeStrategies,
      performanceMetrics,
      marketCondition,
      allocations: this.portfolioAllocations
    };
  }

  getStrategy(strategyName: string): AdvancedTradingStrategy | undefined {
    return this.strategies.get(strategyName);
  }

  enableStrategy(strategyName: string, enabled: boolean): void {
    const strategy = this.strategies.get(strategyName);
    if (strategy) {
      strategy.config.enabled = enabled;
      console.log(`Strategy ${strategyName} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  updateStrategyWeight(strategyName: string, weight: number): void {
    const allocation = this.portfolioAllocations.find(a => a.strategyName === strategyName);
    if (allocation) {
      allocation.weight = Math.max(
        this.config.minStrategyWeight,
        Math.min(this.config.maxStrategyWeight, weight)
      );
      allocation.allocatedAmount = this.config.totalCapital * allocation.weight;
      
      console.log(`Updated ${strategyName} weight to ${weight}`);
    }
  }

  getMarketAnalysis(): any {
    return this.marketAnalyzer.analyzeMarket();
  }

  getMarketSummary(): any {
    return this.marketAnalyzer.getMarketSummary();
  }

  // Method to get the best performing strategy
  getBestPerformingStrategy(): { name: string; performance: StrategyPerformance } | null {
    let bestStrategy = null;
    let bestScore = -Infinity;

    for (const [strategyName, strategy] of this.strategies) {
      const performance = strategy.getPerformanceMetrics();
      
      // Calculate composite score
      const score = performance.winRate * 0.4 + 
                   performance.averageProfit * 0.3 + 
                   performance.sharpeRatio * 0.2 - 
                   performance.maxDrawdown * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestStrategy = { name: strategyName, performance };
      }
    }

    return bestStrategy;
  }

  // Method to get strategy recommendations
  getStrategyRecommendations(): { strategy: string; reason: string; weight: number }[] {
    const marketAnalysis = this.marketAnalyzer.analyzeMarket();
    const recommendations: { strategy: string; reason: string; weight: number }[] = [];

    for (const strategyName of marketAnalysis.recommendedStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (strategy && strategy.isEnabled()) {
        const performance = strategy.getPerformanceMetrics();
        const allocation = this.portfolioAllocations.find(a => a.strategyName === strategyName);
        
        let reason = `Recommended for ${marketAnalysis.condition.trend} market with ${marketAnalysis.condition.volatility} volatility`;
        
        if (performance.winRate > 0.6) {
          reason += `, high win rate (${(performance.winRate * 100).toFixed(1)}%)`;
        }
        
        recommendations.push({
          strategy: strategyName,
          reason,
          weight: allocation?.weight || 0
        });
      }
    }

    return recommendations;
  }
}