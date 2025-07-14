import { BacktestEngine } from '../backtest/backtest-engine';
import { HistoricalDataManager } from '../data/historical-data-manager';
import { TradingStrategy, TradingStrategyConfig } from '../strategies/trading-strategy';
import { 
  OptimizationResult, 
  OptimizationConfig, 
  ParameterRange, 
  WalkForwardResult,
  BacktestConfig 
} from '../types/backtest';

export class ParameterOptimizer {
  private dataManager: HistoricalDataManager;
  private baseConfig: BacktestConfig;

  constructor(dataManager: HistoricalDataManager, baseConfig: BacktestConfig) {
    this.dataManager = dataManager;
    this.baseConfig = baseConfig;
  }

  async gridSearchOptimization(
    pair: string,
    optimizationConfig: OptimizationConfig,
    timeframe: string = '1m'
  ): Promise<OptimizationResult[]> {
    console.log('Starting grid search optimization...');
    
    const parameterCombinations = this.generateParameterCombinations(optimizationConfig.parameters);
    const results: OptimizationResult[] = [];
    
    console.log(`Testing ${parameterCombinations.length} parameter combinations`);
    
    for (let i = 0; i < parameterCombinations.length; i++) {
      const parameters = parameterCombinations[i];
      
      try {
        const strategy = this.createStrategyWithParameters(parameters);
        const engine = new BacktestEngine(this.dataManager, strategy, this.baseConfig);
        
        const result = await engine.runBacktest(pair, timeframe);
        const score = this.calculateScore(result, optimizationConfig.objective);
        
        results.push({
          parameters,
          result,
          score
        });
        
        if (i % 10 === 0) {
          console.log(`Progress: ${((i / parameterCombinations.length) * 100).toFixed(1)}%`);
        }
      } catch (error) {
        console.error(`Error testing parameters ${JSON.stringify(parameters)}:`, error);
      }
    }
    
    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);
    
    console.log(`Grid search completed. Best score: ${results[0]?.score.toFixed(4)}`);
    return results;
  }

  async geneticOptimization(
    pair: string,
    optimizationConfig: OptimizationConfig,
    timeframe: string = '1m'
  ): Promise<OptimizationResult[]> {
    console.log('Starting genetic algorithm optimization...');
    
    const populationSize = optimizationConfig.populationSize || 50;
    const generations = optimizationConfig.generations || 20;
    const crossoverRate = optimizationConfig.crossoverRate || 0.7;
    const mutationRate = optimizationConfig.mutationRate || 0.1;
    
    // Initialize population
    let population = this.initializePopulation(optimizationConfig.parameters, populationSize);
    let bestResults: OptimizationResult[] = [];
    
    for (let generation = 0; generation < generations; generation++) {
      console.log(`Generation ${generation + 1}/${generations}`);
      
      // Evaluate fitness
      const evaluatedPopulation: OptimizationResult[] = [];
      
      for (const individual of population) {
        try {
          const strategy = this.createStrategyWithParameters(individual);
          const engine = new BacktestEngine(this.dataManager, strategy, this.baseConfig);
          
          const result = await engine.runBacktest(pair, timeframe);
          const score = this.calculateScore(result, optimizationConfig.objective);
          
          evaluatedPopulation.push({
            parameters: individual,
            result,
            score
          });
        } catch (error) {
          console.error(`Error evaluating individual:`, error);
        }
      }
      
      // Sort by fitness
      evaluatedPopulation.sort((a, b) => b.score - a.score);
      
      // Update best results
      if (generation === 0 || evaluatedPopulation[0].score > bestResults[0].score) {
        bestResults = [...evaluatedPopulation];
      }
      
      // Selection, crossover, and mutation
      const nextGeneration: Record<string, any>[] = [];
      
      // Elitism - keep best individuals
      const eliteCount = Math.floor(populationSize * 0.2);
      for (let i = 0; i < eliteCount; i++) {
        nextGeneration.push(evaluatedPopulation[i].parameters);
      }
      
      // Generate offspring
      while (nextGeneration.length < populationSize) {
        const parent1 = this.tournamentSelection(evaluatedPopulation, 3);
        const parent2 = this.tournamentSelection(evaluatedPopulation, 3);
        
        let offspring: Record<string, any>[];
        if (Math.random() < crossoverRate) {
          offspring = this.crossover(parent1.parameters, parent2.parameters);
        } else {
          offspring = [parent1.parameters, parent2.parameters];
        }
        
        // Mutation
        for (const individual of offspring) {
          if (Math.random() < mutationRate) {
            this.mutate(individual, optimizationConfig.parameters);
          }
        }
        
        nextGeneration.push(...offspring);
      }
      
      population = nextGeneration.slice(0, populationSize);
      
      console.log(`Best score in generation ${generation + 1}: ${evaluatedPopulation[0].score.toFixed(4)}`);
    }
    
    console.log(`Genetic optimization completed. Best score: ${bestResults[0]?.score.toFixed(4)}`);
    return bestResults.slice(0, 10); // Return top 10 results
  }

  async walkForwardOptimization(
    pair: string,
    optimizationConfig: OptimizationConfig,
    inSampleMonths: number = 6,
    outSampleMonths: number = 1,
    timeframe: string = '1m'
  ): Promise<WalkForwardResult[]> {
    console.log('Starting walk-forward optimization...');
    
    const results: WalkForwardResult[] = [];
    const totalPeriod = this.baseConfig.endDate - this.baseConfig.startDate;
    const inSamplePeriod = inSampleMonths * 30 * 24 * 60 * 60 * 1000;
    const outSamplePeriod = outSampleMonths * 30 * 24 * 60 * 60 * 1000;
    const stepSize = outSamplePeriod;
    
    let currentStart = this.baseConfig.startDate;
    
    while (currentStart + inSamplePeriod + outSamplePeriod <= this.baseConfig.endDate) {
      const inSampleStart = currentStart;
      const inSampleEnd = currentStart + inSamplePeriod;
      const outSampleStart = inSampleEnd;
      const outSampleEnd = outSampleStart + outSamplePeriod;
      
      console.log(`Optimizing period: ${new Date(inSampleStart)} to ${new Date(inSampleEnd)}`);
      
      // Optimize on in-sample data
      const inSampleConfig = {
        ...this.baseConfig,
        startDate: inSampleStart,
        endDate: inSampleEnd
      };
      
      const tempOptimizer = new ParameterOptimizer(this.dataManager, inSampleConfig);
      const optimizationResults = await tempOptimizer.gridSearchOptimization(pair, optimizationConfig, timeframe);
      
      if (optimizationResults.length === 0) {
        console.log('No optimization results, skipping period');
        currentStart += stepSize;
        continue;
      }
      
      const bestParameters = optimizationResults[0].parameters;
      const inSampleResult = optimizationResults[0].result;
      
      // Test on out-of-sample data
      const outSampleConfig = {
        ...this.baseConfig,
        startDate: outSampleStart,
        endDate: outSampleEnd
      };
      
      const strategy = this.createStrategyWithParameters(bestParameters);
      const engine = new BacktestEngine(this.dataManager, strategy, outSampleConfig);
      const outSampleResult = await engine.runBacktest(pair, timeframe);
      
      // Calculate degradation
      const inSampleScore = this.calculateScore(inSampleResult, optimizationConfig.objective);
      const outSampleScore = this.calculateScore(outSampleResult, optimizationConfig.objective);
      const degradation = (inSampleScore - outSampleScore) / inSampleScore;
      
      results.push({
        inSamplePeriod: { start: inSampleStart, end: inSampleEnd },
        outSamplePeriod: { start: outSampleStart, end: outSampleEnd },
        inSampleResult,
        outSampleResult,
        parameters: bestParameters,
        degradation
      });
      
      console.log(`Period completed. Degradation: ${(degradation * 100).toFixed(2)}%`);
      
      currentStart += stepSize;
    }
    
    console.log(`Walk-forward optimization completed. ${results.length} periods tested`);
    return results;
  }

  private generateParameterCombinations(parameters: Record<string, ParameterRange>): Record<string, any>[] {
    const combinations: Record<string, any>[] = [];
    const paramNames = Object.keys(parameters);
    
    if (paramNames.length === 0) return combinations;
    
    const generateCombinations = (index: number, current: Record<string, any>) => {
      if (index === paramNames.length) {
        combinations.push({ ...current });
        return;
      }
      
      const paramName = paramNames[index];
      const range = parameters[paramName];
      
      for (let value = range.min; value <= range.max; value += range.step) {
        current[paramName] = value;
        generateCombinations(index + 1, current);
      }
    };
    
    generateCombinations(0, {});
    return combinations;
  }

  private initializePopulation(parameters: Record<string, ParameterRange>, populationSize: number): Record<string, any>[] {
    const population: Record<string, any>[] = [];
    
    for (let i = 0; i < populationSize; i++) {
      const individual: Record<string, any> = {};
      
      for (const [paramName, range] of Object.entries(parameters)) {
        const randomValue = range.min + Math.random() * (range.max - range.min);
        individual[paramName] = Math.round(randomValue / range.step) * range.step;
      }
      
      population.push(individual);
    }
    
    return population;
  }

  private tournamentSelection(population: OptimizationResult[], tournamentSize: number): OptimizationResult {
    const tournament = [];
    
    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * population.length);
      tournament.push(population[randomIndex]);
    }
    
    return tournament.reduce((best, current) => current.score > best.score ? current : best);
  }

  private crossover(parent1: Record<string, any>, parent2: Record<string, any>): Record<string, any>[] {
    const offspring1: Record<string, any> = {};
    const offspring2: Record<string, any> = {};
    
    for (const param of Object.keys(parent1)) {
      if (Math.random() < 0.5) {
        offspring1[param] = parent1[param];
        offspring2[param] = parent2[param];
      } else {
        offspring1[param] = parent2[param];
        offspring2[param] = parent1[param];
      }
    }
    
    return [offspring1, offspring2];
  }

  private mutate(individual: Record<string, any>, parameters: Record<string, ParameterRange>): void {
    for (const [paramName, range] of Object.entries(parameters)) {
      if (Math.random() < 0.1) { // 10% chance to mutate each parameter
        const randomValue = range.min + Math.random() * (range.max - range.min);
        individual[paramName] = Math.round(randomValue / range.step) * range.step;
      }
    }
  }

  private createStrategyWithParameters(parameters: Record<string, any>): TradingStrategy {
    const strategyConfig: TradingStrategyConfig = {
      buyThreshold: parameters.buyThreshold || 0.02,
      sellThreshold: parameters.sellThreshold || 0.02,
      minProfitMargin: parameters.minProfitMargin || 0.01,
      maxTradeAmount: parameters.maxTradeAmount || 10000,
      riskTolerance: parameters.riskTolerance || 0.8
    };
    
    return new TradingStrategy(strategyConfig);
  }

  private calculateScore(result: any, objective: string): number {
    switch (objective) {
      case 'profit':
        return result.totalProfit;
      case 'sharpe':
        return result.sharpeRatio;
      case 'winRate':
        return result.winRate;
      case 'drawdown':
        return -result.maxDrawdown; // Negative because we want to minimize drawdown
      default:
        // Combined score
        return (
          result.totalReturn * 0.4 +
          result.sharpeRatio * 0.3 +
          result.winRate * 0.2 +
          (-result.maxDrawdown) * 0.1
        );
    }
  }

  detectOverfitting(results: OptimizationResult[]): { 
    isOverfitted: boolean; 
    confidence: number; 
    indicators: string[] 
  } {
    const indicators: string[] = [];
    let overfittingScore = 0;
    
    if (results.length < 2) {
      return { isOverfitted: false, confidence: 0, indicators: ['Insufficient data'] };
    }
    
    const bestResult = results[0];
    const scores = results.map(r => r.score);
    
    // Check if best result is significantly better than others
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const scoreStd = Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length);
    
    if (scoreStd > 0 && (bestResult.score - avgScore) / scoreStd > 2) {
      indicators.push('Best result is unusually good compared to others');
      overfittingScore += 0.3;
    }
    
    // Check win rate vs profit consistency
    const winRates = results.map(r => r.result.winRate);
    const profits = results.map(r => r.result.totalProfit);
    
    const winRateStd = Math.sqrt(winRates.reduce((sum, w, i) => sum + Math.pow(w - winRates.reduce((s, wr) => s + wr, 0) / winRates.length, 2), 0) / winRates.length);
    const profitStd = Math.sqrt(profits.reduce((sum, p, i) => sum + Math.pow(p - profits.reduce((s, pr) => s + pr, 0) / profits.length, 2), 0) / profits.length);
    
    if (winRateStd > 0.2 || profitStd > avgScore * 0.5) {
      indicators.push('High variability in results suggests overfitting');
      overfittingScore += 0.2;
    }
    
    // Check if best parameters are at the extremes
    const bestParams = bestResult.parameters;
    let extremeParameters = 0;
    
    for (const [param, value] of Object.entries(bestParams)) {
      if (typeof value === 'number') {
        const allValues = results.map(r => r.parameters[param] as number);
        const min = Math.min(...allValues);
        const max = Math.max(...allValues);
        
        if (value === min || value === max) {
          extremeParameters++;
        }
      }
    }
    
    if (extremeParameters > Object.keys(bestParams).length * 0.5) {
      indicators.push('Best parameters are at extreme values');
      overfittingScore += 0.3;
    }
    
    // Check trade count consistency
    const tradeCounts = results.map(r => r.result.totalTrades);
    const avgTrades = tradeCounts.reduce((sum, t) => sum + t, 0) / tradeCounts.length;
    
    if (bestResult.result.totalTrades < avgTrades * 0.5) {
      indicators.push('Best result has unusually few trades');
      overfittingScore += 0.2;
    }
    
    const confidence = Math.min(overfittingScore, 1.0);
    const isOverfitted = confidence > 0.6;
    
    return { isOverfitted, confidence, indicators };
  }

  async robustnessTest(
    pair: string,
    parameters: Record<string, any>,
    perturbationPercent: number = 0.1,
    timeframe: string = '1m'
  ): Promise<{ 
    originalScore: number; 
    perturbedScores: number[];
    robustnessScore: number;
    isRobust: boolean 
  }> {
    console.log('Starting robustness test...');
    
    // Test original parameters
    const originalStrategy = this.createStrategyWithParameters(parameters);
    const originalEngine = new BacktestEngine(this.dataManager, originalStrategy, this.baseConfig);
    const originalResult = await originalEngine.runBacktest(pair, timeframe);
    const originalScore = this.calculateScore(originalResult, 'profit');
    
    const perturbedScores: number[] = [];
    
    // Test perturbed parameters
    for (let i = 0; i < 20; i++) {
      const perturbedParams = { ...parameters };
      
      for (const [param, value] of Object.entries(parameters)) {
        if (typeof value === 'number') {
          const perturbation = (Math.random() - 0.5) * 2 * perturbationPercent;
          perturbedParams[param] = value * (1 + perturbation);
        }
      }
      
      try {
        const strategy = this.createStrategyWithParameters(perturbedParams);
        const engine = new BacktestEngine(this.dataManager, strategy, this.baseConfig);
        const result = await engine.runBacktest(pair, timeframe);
        const score = this.calculateScore(result, 'profit');
        
        perturbedScores.push(score);
      } catch (error) {
        console.error('Error in robustness test:', error);
      }
    }
    
    // Calculate robustness score
    const avgPerturbedScore = perturbedScores.reduce((sum, s) => sum + s, 0) / perturbedScores.length;
    const robustnessScore = avgPerturbedScore / originalScore;
    const isRobust = robustnessScore > 0.8; // 80% of original performance
    
    console.log(`Robustness test completed. Robustness score: ${robustnessScore.toFixed(3)}`);
    
    return {
      originalScore,
      perturbedScores,
      robustnessScore,
      isRobust
    };
  }
}