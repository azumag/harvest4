import { BacktestEngine } from '../backtest/backtest-engine';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import {
  HistoricalDataPoint,
  BacktestConfig,
  BacktestResult,
  OptimizationConfig,
  OptimizationParameter,
  OptimizationResult,
  WalkForwardConfig,
  WalkForwardResult,
  WalkForwardSegment,
  StabilityMetrics,
  RobustnessMetrics
} from '../types/backtest';

export class ParameterOptimizer {
  private data: HistoricalDataPoint[];
  private backtestConfig: BacktestConfig;

  constructor(data: HistoricalDataPoint[], backtestConfig: BacktestConfig) {
    this.data = data;
    this.backtestConfig = backtestConfig;
  }

  async optimize(
    baseStrategy: TradingStrategyConfig,
    optimizationConfig: OptimizationConfig
  ): Promise<OptimizationResult[]> {
    switch (optimizationConfig.method) {
      case 'grid':
        return this.gridSearchOptimization(baseStrategy, optimizationConfig);
      case 'genetic':
        return this.geneticAlgorithmOptimization(baseStrategy, optimizationConfig);
      case 'random':
        return this.randomSearchOptimization(baseStrategy, optimizationConfig);
      default:
        throw new Error(`Unsupported optimization method: ${optimizationConfig.method}`);
    }
  }

  private async gridSearchOptimization(
    baseStrategy: TradingStrategyConfig,
    config: OptimizationConfig
  ): Promise<OptimizationResult[]> {
    const results: OptimizationResult[] = [];
    const parameterCombinations = this.generateParameterCombinations(config.parameters);
    
    console.log(`Grid Search: Testing ${parameterCombinations.length} parameter combinations`);
    
    for (let i = 0; i < parameterCombinations.length; i++) {
      const parameters = parameterCombinations[i];
      const strategyConfig = { ...baseStrategy, ...parameters };
      
      try {
        const backtest = new BacktestEngine(this.backtestConfig, strategyConfig);
        const result = await backtest.runBacktest(this.data);
        
        const fitness = this.calculateFitness(result, config.fitnessFunction);
        
        results.push({
          parameters,
          fitness,
          backtest: result,
          metrics: {
            return: result.totalReturnPercent,
            sharpeRatio: result.sharpeRatio,
            maxDrawdown: result.maxDrawdownPercent,
            winRate: result.winRate,
            profitFactor: result.profitFactor,
            calmarRatio: result.calmarRatio
          }
        });
        
        if (i % 10 === 0) {
          console.log(`Progress: ${i + 1}/${parameterCombinations.length} (${((i + 1) / parameterCombinations.length * 100).toFixed(1)}%)`);
        }
      } catch (error) {
        console.error(`Error optimizing parameters ${JSON.stringify(parameters)}:`, error);
      }
    }
    
    return results.sort((a, b) => b.fitness - a.fitness);
  }

  private generateParameterCombinations(parameters: OptimizationParameter[]): Record<string, number>[] {
    const combinations: Record<string, number>[] = [];
    
    const generateCombinations = (index: number, current: Record<string, number>) => {
      if (index === parameters.length) {
        combinations.push({ ...current });
        return;
      }
      
      const param = parameters[index];
      for (let value = param.min; value <= param.max; value += param.step) {
        current[param.name] = value;
        generateCombinations(index + 1, current);
      }
    };
    
    generateCombinations(0, {});
    return combinations;
  }

  private async geneticAlgorithmOptimization(
    baseStrategy: TradingStrategyConfig,
    config: OptimizationConfig
  ): Promise<OptimizationResult[]> {
    const populationSize = config.populationSize || 50;
    const maxGenerations = config.maxIterations || 100;
    const mutationRate = config.mutationRate || 0.1;
    const crossoverRate = config.crossoverRate || 0.8;
    const eliteSize = config.eliteSize || 10;
    const convergenceThreshold = config.convergenceThreshold || 0.001;
    
    console.log(`Genetic Algorithm: Population=${populationSize}, Generations=${maxGenerations}`);
    
    let population = this.initializePopulation(config.parameters, populationSize);
    let bestFitness = -Infinity;
    let stagnationCount = 0;
    
    for (let generation = 0; generation < maxGenerations; generation++) {
      const results = await this.evaluatePopulation(population, baseStrategy);
      
      const currentBest = Math.max(...results.map(r => r.fitness));
      
      if (currentBest > bestFitness + convergenceThreshold) {
        bestFitness = currentBest;
        stagnationCount = 0;
      } else {
        stagnationCount++;
      }
      
      if (stagnationCount >= 10) {
        console.log(`Converged after ${generation + 1} generations`);
        break;
      }
      
      const elite = results.slice(0, eliteSize);
      const newPopulation = elite.map(r => r.parameters);
      
      while (newPopulation.length < populationSize) {
        const parent1 = this.tournamentSelection(results);
        const parent2 = this.tournamentSelection(results);
        
        let child = this.crossover(parent1.parameters, parent2.parameters, config.parameters, crossoverRate);
        child = this.mutate(child, config.parameters, mutationRate);
        
        newPopulation.push(child);
      }
      
      population = newPopulation;
      
      if (generation % 10 === 0) {
        console.log(`Generation ${generation + 1}: Best fitness = ${bestFitness.toFixed(4)}`);
      }
    }
    
    const finalResults = await this.evaluatePopulation(population, baseStrategy);
    return finalResults.sort((a, b) => b.fitness - a.fitness);
  }

  private initializePopulation(
    parameters: OptimizationParameter[],
    populationSize: number
  ): Record<string, number>[] {
    const population: Record<string, number>[] = [];
    
    for (let i = 0; i < populationSize; i++) {
      const individual: Record<string, number> = {};
      
      parameters.forEach(param => {
        individual[param.name] = Math.random() * (param.max - param.min) + param.min;
      });
      
      population.push(individual);
    }
    
    return population;
  }

  private async evaluatePopulation(
    population: Record<string, number>[],
    baseStrategy: TradingStrategyConfig
  ): Promise<OptimizationResult[]> {
    const results: OptimizationResult[] = [];
    
    for (const individual of population) {
      const strategyConfig = { ...baseStrategy, ...individual };
      
      try {
        const backtest = new BacktestEngine(this.backtestConfig, strategyConfig);
        const result = await backtest.runBacktest(this.data);
        
        const fitness = this.calculateFitness(result, 'composite');
        
        results.push({
          parameters: individual,
          fitness,
          backtest: result,
          metrics: {
            return: result.totalReturnPercent,
            sharpeRatio: result.sharpeRatio,
            maxDrawdown: result.maxDrawdownPercent,
            winRate: result.winRate,
            profitFactor: result.profitFactor,
            calmarRatio: result.calmarRatio
          }
        });
      } catch (error) {
        results.push({
          parameters: individual,
          fitness: -Infinity,
          backtest: {} as BacktestResult,
          metrics: {
            return: -Infinity,
            sharpeRatio: -Infinity,
            maxDrawdown: 100,
            winRate: 0,
            profitFactor: 0,
            calmarRatio: -Infinity
          }
        });
      }
    }
    
    return results;
  }

  private tournamentSelection(results: OptimizationResult[], tournamentSize = 5): OptimizationResult {
    const tournament: OptimizationResult[] = [];
    
    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * results.length);
      tournament.push(results[randomIndex]);
    }
    
    return tournament.reduce((best, current) => current.fitness > best.fitness ? current : best);
  }

  private crossover(
    parent1: Record<string, number>,
    parent2: Record<string, number>,
    parameters: OptimizationParameter[],
    crossoverRate: number
  ): Record<string, number> {
    const child: Record<string, number> = {};
    
    parameters.forEach(param => {
      if (Math.random() < crossoverRate) {
        child[param.name] = Math.random() < 0.5 ? parent1[param.name] : parent2[param.name];
      } else {
        child[param.name] = parent1[param.name];
      }
    });
    
    return child;
  }

  private mutate(
    individual: Record<string, number>,
    parameters: OptimizationParameter[],
    mutationRate: number
  ): Record<string, number> {
    const mutated = { ...individual };
    
    parameters.forEach(param => {
      if (Math.random() < mutationRate) {
        const range = param.max - param.min;
        const mutation = (Math.random() - 0.5) * range * 0.1; // 10% of range
        mutated[param.name] = Math.max(param.min, Math.min(param.max, individual[param.name] + mutation));
      }
    });
    
    return mutated;
  }

  private async randomSearchOptimization(
    baseStrategy: TradingStrategyConfig,
    config: OptimizationConfig
  ): Promise<OptimizationResult[]> {
    const results: OptimizationResult[] = [];
    const maxIterations = config.maxIterations || 1000;
    
    console.log(`Random Search: Testing ${maxIterations} random parameter combinations`);
    
    for (let i = 0; i < maxIterations; i++) {
      const parameters: Record<string, number> = {};
      
      config.parameters.forEach(param => {
        parameters[param.name] = Math.random() * (param.max - param.min) + param.min;
      });
      
      const strategyConfig = { ...baseStrategy, ...parameters };
      
      try {
        const backtest = new BacktestEngine(this.backtestConfig, strategyConfig);
        const result = await backtest.runBacktest(this.data);
        
        const fitness = this.calculateFitness(result, config.fitnessFunction);
        
        results.push({
          parameters,
          fitness,
          backtest: result,
          metrics: {
            return: result.totalReturnPercent,
            sharpeRatio: result.sharpeRatio,
            maxDrawdown: result.maxDrawdownPercent,
            winRate: result.winRate,
            profitFactor: result.profitFactor,
            calmarRatio: result.calmarRatio
          }
        });
        
        if (i % 50 === 0) {
          console.log(`Progress: ${i + 1}/${maxIterations} (${((i + 1) / maxIterations * 100).toFixed(1)}%)`);
        }
      } catch (error) {
        console.error(`Error optimizing parameters ${JSON.stringify(parameters)}:`, error);
      }
    }
    
    return results.sort((a, b) => b.fitness - a.fitness);
  }

  private calculateFitness(
    result: BacktestResult,
    fitnessFunction: 'return' | 'sharpe' | 'calmar' | 'profit_factor' | 'composite'
  ): number {
    switch (fitnessFunction) {
      case 'return':
        return result.totalReturnPercent;
      case 'sharpe':
        return result.sharpeRatio;
      case 'calmar':
        return result.calmarRatio;
      case 'profit_factor':
        return result.profitFactor;
      case 'composite':
        return this.calculateCompositeFitness(result);
      default:
        return result.totalReturnPercent;
    }
  }

  private calculateCompositeFitness(result: BacktestResult): number {
    const returnScore = Math.max(0, result.totalReturnPercent) / 100;
    const sharpeScore = Math.max(0, result.sharpeRatio) / 3;
    const drawdownPenalty = Math.max(0, result.maxDrawdownPercent) / 100;
    const winRateScore = result.winRate / 100;
    const profitFactorScore = Math.min(result.profitFactor, 5) / 5;
    
    return (returnScore * 0.3 + sharpeScore * 0.25 + winRateScore * 0.15 + profitFactorScore * 0.3) - (drawdownPenalty * 0.5);
  }

  async walkForwardAnalysis(
    baseStrategy: TradingStrategyConfig,
    optimizationConfig: OptimizationConfig,
    walkForwardConfig: WalkForwardConfig
  ): Promise<WalkForwardResult> {
    const segments: WalkForwardSegment[] = [];
    const dataLength = this.data.length;
    
    console.log('Starting Walk-Forward Analysis...');
    
    for (let i = 0; i < dataLength - walkForwardConfig.windowSize; i += walkForwardConfig.stepSize) {
      const segmentStart = i;
      const segmentEnd = Math.min(i + walkForwardConfig.windowSize, dataLength);
      
      const optimizationEnd = segmentStart + walkForwardConfig.optimizationPeriods;
      const testStart = optimizationEnd;
      const testEnd = Math.min(testStart + walkForwardConfig.testPeriods, segmentEnd);
      
      if (testEnd - testStart < walkForwardConfig.minPeriods) {
        break;
      }
      
      const optimizationData = this.data.slice(segmentStart, optimizationEnd);
      const testData = this.data.slice(testStart, testEnd);
      
      const optimizer = new ParameterOptimizer(optimizationData, this.backtestConfig);
      const optimizationResults = await optimizer.optimize(baseStrategy, optimizationConfig);
      
      if (optimizationResults.length === 0) {
        continue;
      }
      
      const bestParameters = optimizationResults[0].parameters;
      const inSampleResult = optimizationResults[0].backtest;
      
      const testStrategyConfig = { ...baseStrategy, ...bestParameters };
      const testBacktest = new BacktestEngine(this.backtestConfig, testStrategyConfig);
      const outOfSampleResult = await testBacktest.runBacktest(testData);
      
      const degradation = this.calculateDegradation(inSampleResult, outOfSampleResult);
      
      segments.push({
        startDate: this.data[segmentStart].timestamp,
        endDate: this.data[segmentEnd - 1].timestamp,
        optimizationPeriod: [this.data[segmentStart].timestamp, this.data[optimizationEnd - 1].timestamp],
        testPeriod: [this.data[testStart].timestamp, this.data[testEnd - 1].timestamp],
        bestParameters,
        inSampleResult,
        outOfSampleResult,
        degradation
      });
      
      console.log(`Segment ${segments.length}: In-Sample Return: ${inSampleResult.totalReturnPercent.toFixed(2)}%, Out-of-Sample Return: ${outOfSampleResult.totalReturnPercent.toFixed(2)}%, Degradation: ${degradation.toFixed(2)}%`);
    }
    
    const overallMetrics = this.calculateOverallMetrics(segments);
    const stability = this.calculateStabilityMetrics(segments);
    const robustness = this.calculateRobustnessMetrics(segments);
    
    return {
      segments,
      overallMetrics,
      stability,
      robustness
    };
  }

  private calculateDegradation(inSample: BacktestResult, outOfSample: BacktestResult): number {
    if (inSample.totalReturnPercent === 0) return 0;
    return ((inSample.totalReturnPercent - outOfSample.totalReturnPercent) / Math.abs(inSample.totalReturnPercent)) * 100;
  }

  private calculateOverallMetrics(segments: WalkForwardSegment[]): Record<string, number> {
    const outOfSampleResults = segments.map(s => s.outOfSampleResult);
    
    const totalReturn = outOfSampleResults.reduce((sum, r) => sum + r.totalReturnPercent, 0);
    // const averageReturn = totalReturn / outOfSampleResults.length;
    
    const returns = outOfSampleResults.map(r => r.totalReturnPercent / 100);
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const annualizedReturn = meanReturn * 252;
    const annualizedVolatility = Math.sqrt(variance * 252);
    const sharpeRatio = annualizedVolatility > 0 ? annualizedReturn / annualizedVolatility : 0;
    
    const maxDrawdown = Math.max(...outOfSampleResults.map(r => r.maxDrawdownPercent));
    const averageWinRate = outOfSampleResults.reduce((sum, r) => sum + r.winRate, 0) / outOfSampleResults.length;
    const averageProfitFactor = outOfSampleResults.reduce((sum, r) => sum + r.profitFactor, 0) / outOfSampleResults.length;
    
    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate: averageWinRate,
      profitFactor: averageProfitFactor,
      calmarRatio: maxDrawdown > 0 ? totalReturn / maxDrawdown : 0,
      sortinoRatio: 0, // Simplified
      var95: 0, // Simplified
      cvar95: 0, // Simplified
      ulcerIndex: 0 // Simplified
    };
  }

  private calculateStabilityMetrics(segments: WalkForwardSegment[]): StabilityMetrics {
    const parameterNames = Object.keys(segments[0].bestParameters);
    const parameterStabilities: number[] = [];
    
    parameterNames.forEach(name => {
      const values = segments.map(s => s.bestParameters[name]);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stability = variance > 0 ? 1 / (1 + Math.sqrt(variance)) : 1;
      parameterStabilities.push(stability);
    });
    
    const parameterStability = parameterStabilities.reduce((sum, s) => sum + s, 0) / parameterStabilities.length;
    
    const outOfSampleReturns = segments.map(s => s.outOfSampleResult.totalReturnPercent);
    const meanReturn = outOfSampleReturns.reduce((sum, r) => sum + r, 0) / outOfSampleReturns.length;
    const returnVariance = outOfSampleReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / outOfSampleReturns.length;
    const performanceStability = returnVariance > 0 ? 1 / (1 + Math.sqrt(returnVariance)) : 1;
    
    const degradations = segments.map(s => s.degradation);
    const avgDegradation = degradations.reduce((sum, d) => sum + d, 0) / degradations.length;
    const degradationStability = Math.max(0, 1 - Math.abs(avgDegradation) / 100);
    
    const drawdowns = segments.map(s => s.outOfSampleResult.maxDrawdownPercent);
    const meanDrawdown = drawdowns.reduce((sum, d) => sum + d, 0) / drawdowns.length;
    const drawdownVariance = drawdowns.reduce((sum, d) => sum + Math.pow(d - meanDrawdown, 2), 0) / drawdowns.length;
    const drawdownStability = drawdownVariance > 0 ? 1 / (1 + Math.sqrt(drawdownVariance)) : 1;
    
    const consistencyScore = (parameterStability + performanceStability + degradationStability + drawdownStability) / 4;
    
    return {
      parameterStability,
      performanceStability,
      returnStability: performanceStability,
      drawdownStability,
      consistencyScore
    };
  }

  private calculateRobustnessMetrics(segments: WalkForwardSegment[]): RobustnessMetrics {
    const degradations = segments.map(s => s.degradation);
    const avgDegradation = degradations.reduce((sum, d) => sum + d, 0) / degradations.length;
    
    const positiveOutOfSampleSegments = segments.filter(s => s.outOfSampleResult.totalReturnPercent > 0).length;
    const robustnessScore = positiveOutOfSampleSegments / segments.length;
    
    const overfittingIndex = Math.max(0, avgDegradation) / 100;
    
    return {
      monteCarloPValue: 0.05, // Simplified
      permutationPValue: 0.05, // Simplified
      whiteRealityCheck: 0.05, // Simplified
      overfittingIndex,
      robustnessScore
    };
  }

  detectOverfitting(
    results: OptimizationResult[],
    validationData: HistoricalDataPoint[]
  ): OverfittingAnalysis {
    const topResults = results.slice(0, 10);
    const validationResults: OptimizationResult[] = [];
    
    for (const result of topResults) {
      const strategyConfig = { ...result.parameters };
      const backtest = new BacktestEngine(this.backtestConfig, strategyConfig as TradingStrategyConfig);
      
      backtest.runBacktest(validationData).then(validationResult => {
        validationResults.push({
          parameters: result.parameters,
          fitness: this.calculateFitness(validationResult, 'composite'),
          backtest: validationResult,
          metrics: {
            return: validationResult.totalReturnPercent,
            sharpeRatio: validationResult.sharpeRatio,
            maxDrawdown: validationResult.maxDrawdownPercent,
            winRate: validationResult.winRate,
            profitFactor: validationResult.profitFactor,
            calmarRatio: validationResult.calmarRatio
          }
        });
      });
    }
    
    const correlations = this.calculateCorrelations(topResults, validationResults);
    const degradations = topResults.map((original, index) => {
      const validation = validationResults[index];
      return validation ? this.calculateDegradation(original.backtest, validation.backtest) : 100;
    });
    
    const avgDegradation = degradations.reduce((sum, d) => sum + d, 0) / degradations.length;
    const overfittingScore = Math.max(0, avgDegradation) / 100;
    
    return {
      overfittingScore,
      avgDegradation,
      correlations,
      degradations,
      recommendation: overfittingScore > 0.5 ? 'High overfitting risk detected' : 'Low overfitting risk'
    };
  }

  private calculateCorrelations(original: OptimizationResult[], validation: OptimizationResult[]): number[] {
    const correlations: number[] = [];
    
    const originalReturns = original.map(r => r.metrics.return);
    const validationReturns = validation.map(r => r.metrics.return);
    
    if (originalReturns.length === validationReturns.length) {
      const correlation = this.pearsonCorrelation(originalReturns, validationReturns);
      correlations.push(correlation);
    }
    
    return correlations;
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator > 0 ? numerator / denominator : 0;
  }
}

interface OverfittingAnalysis {
  overfittingScore: number;
  avgDegradation: number;
  correlations: number[];
  degradations: number[];
  recommendation: string;
}