import { 
  OptimizationConfig, 
  OptimizationResult, 
  BacktestResult, 
  HistoricalCandle,
  BacktestConfig,
  PerformanceMetrics
} from '../types/backtest';
import { TradingStrategyConfig } from '../strategies/trading-strategy';
import { BacktestEngine } from '../backtest/backtest-engine';
import { PerformanceAnalyzer } from '../analysis/performance-analyzer';

export interface GeneticIndividual {
  parameters: { [key: string]: number };
  fitness: number;
  backtest?: BacktestResult;
}

export interface WalkForwardResult {
  period: number;
  trainingStart: number;
  trainingEnd: number;
  testingStart: number;
  testingEnd: number;
  optimalParameters: { [key: string]: number };
  inSampleResult: BacktestResult;
  outOfSampleResult: BacktestResult;
  degradation: number;
}

export class ParameterOptimizer {
  private performanceAnalyzer: PerformanceAnalyzer;

  constructor() {
    this.performanceAnalyzer = new PerformanceAnalyzer();
  }

  async optimizeParameters(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    optimizationConfig: OptimizationConfig
  ): Promise<OptimizationResult> {
    console.log('Starting parameter optimization...');
    
    let results: Array<{
      parameters: { [key: string]: number };
      score: number;
      backtest: BacktestResult;
    }> = [];

    let convergence: number[] = [];
    
    if (optimizationConfig.genetic?.enabled) {
      const geneticResults = await this.runGeneticOptimization(
        backtestConfig,
        historicalData,
        optimizationConfig
      );
      results = geneticResults.results;
      convergence = geneticResults.convergence;
    } else {
      // Grid search optimization
      results = await this.runGridSearch(
        backtestConfig,
        historicalData,
        optimizationConfig
      );
    }

    // Sort results by score (ascending for minimize, descending for maximize)
    results.sort((a, b) => 
      optimizationConfig.direction === 'maximize' ? b.score - a.score : a.score - b.score
    );

    const bestResult = results[0];
    
    if (!bestResult) {
      throw new Error('No valid optimization results found');
    }
    
    // Calculate overfitting and robustness scores
    const overfittingScore = this.calculateOverfittingScore(results);
    const robustnessScore = this.calculateRobustnessScore(results);

    // Walk-forward analysis if enabled
    if (optimizationConfig.walkForward?.enabled) {
      const walkForwardResults = await this.runWalkForwardAnalysis(
        backtestConfig,
        historicalData,
        optimizationConfig,
        bestResult.parameters
      );
      console.log(`Walk-forward analysis completed: ${walkForwardResults.length} periods`);
    }

    return {
      bestParameters: bestResult.parameters,
      bestScore: bestResult.score,
      allResults: results,
      convergence,
      overfittingScore,
      robustnessScore
    };
  }

  private async runGridSearch(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    optimizationConfig: OptimizationConfig
  ): Promise<Array<{
    parameters: { [key: string]: number };
    score: number;
    backtest: BacktestResult;
  }>> {
    const parameterCombinations = this.generateParameterCombinations(optimizationConfig.parameters);
    const results: Array<{
      parameters: { [key: string]: number };
      score: number;
      backtest: BacktestResult;
    }> = [];

    console.log(`Running grid search with ${parameterCombinations.length} combinations...`);

    for (let i = 0; i < parameterCombinations.length; i++) {
      const parameters = parameterCombinations[i];
      
      try {
        const strategyConfig = this.createStrategyConfig(parameters);
        const backtest = await this.runSingleBacktest(backtestConfig, strategyConfig, historicalData);
        const metrics = this.performanceAnalyzer.calculateMetrics(backtest);
        const score = this.getMetricValue(metrics, optimizationConfig.metric);

        results.push({
          parameters,
          score,
          backtest
        });

        if ((i + 1) % 10 === 0) {
          console.log(`Completed ${i + 1}/${parameterCombinations.length} combinations`);
        }
      } catch (error) {
        console.warn(`Backtest failed for parameters:`, parameters, error);
      }
    }

    return results;
  }

  private async runGeneticOptimization(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    optimizationConfig: OptimizationConfig
  ): Promise<{
    results: Array<{
      parameters: { [key: string]: number };
      score: number;
      backtest: BacktestResult;
    }>;
    convergence: number[];
  }> {
    const geneticConfig = optimizationConfig.genetic!;
    const population = this.initializePopulation(
      optimizationConfig.parameters,
      geneticConfig.populationSize
    );

    const convergence: number[] = [];
    const allResults: Array<{
      parameters: { [key: string]: number };
      score: number;
      backtest: BacktestResult;
    }> = [];

    console.log(`Starting genetic optimization: ${geneticConfig.generations} generations, population size ${geneticConfig.populationSize}`);

    for (let generation = 0; generation < geneticConfig.generations; generation++) {
      // Evaluate fitness for each individual
      await this.evaluatePopulation(population, backtestConfig, historicalData, optimizationConfig);

      // Sort by fitness (descending for maximize, ascending for minimize)
      population.sort((a, b) => 
        optimizationConfig.direction === 'maximize' ? b.fitness - a.fitness : a.fitness - b.fitness
      );

      // Track convergence
      const bestFitness = population[0].fitness;
      convergence.push(bestFitness);

      // Store results from this generation
      for (const individual of population) {
        if (individual.backtest) {
          allResults.push({
            parameters: individual.parameters,
            score: individual.fitness,
            backtest: individual.backtest
          });
        }
      }

      console.log(`Generation ${generation + 1}: Best fitness = ${bestFitness.toFixed(4)}`);

      // Create next generation
      if (generation < geneticConfig.generations - 1) {
        const newPopulation = this.createNextGeneration(
          population,
          geneticConfig.mutationRate,
          geneticConfig.crossoverRate,
          optimizationConfig.parameters
        );
        population.splice(0, population.length, ...newPopulation);
      }
    }

    return { results: allResults, convergence };
  }

  private async runWalkForwardAnalysis(
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    optimizationConfig: OptimizationConfig,
    baseParameters: { [key: string]: number }
  ): Promise<WalkForwardResult[]> {
    const walkForwardConfig = optimizationConfig.walkForward!;
    const results: WalkForwardResult[] = [];
    
    const sortedData = historicalData.sort((a, b) => a.timestamp - b.timestamp);
    const totalDataPoints = sortedData.length;
    const trainingSize = Math.floor(totalDataPoints * walkForwardConfig.trainingPeriod);
    const testingSize = Math.floor(totalDataPoints * walkForwardConfig.testingPeriod);
    const stepSize = Math.floor(totalDataPoints * walkForwardConfig.reoptimizationFrequency);

    for (let start = 0; start + trainingSize + testingSize <= totalDataPoints; start += stepSize) {
      const trainingData = sortedData.slice(start, start + trainingSize);
      const testingData = sortedData.slice(start + trainingSize, start + trainingSize + testingSize);

      // Optimize parameters on training data
      const trainingConfig = {
        ...backtestConfig,
        startDate: trainingData[0].timestamp,
        endDate: trainingData[trainingData.length - 1].timestamp
      };

      const trainingOptimization = await this.optimizeParameters(
        trainingConfig,
        trainingData,
        {
          ...optimizationConfig,
          walkForward: { ...walkForwardConfig, enabled: false } // Disable recursive walk-forward
        }
      );

      // Test optimized parameters on out-of-sample data
      const testingConfig = {
        ...backtestConfig,
        startDate: testingData[0].timestamp,
        endDate: testingData[testingData.length - 1].timestamp
      };

      const strategyConfig = this.createStrategyConfig(trainingOptimization.bestParameters);
      const outOfSampleResult = await this.runSingleBacktest(testingConfig, strategyConfig, testingData);

      // Calculate in-sample result for comparison
      const inSampleStrategyConfig = this.createStrategyConfig(trainingOptimization.bestParameters);
      const inSampleResult = await this.runSingleBacktest(trainingConfig, inSampleStrategyConfig, trainingData);

      // Calculate degradation
      const inSampleMetric = this.getMetricValue(
        this.performanceAnalyzer.calculateMetrics(inSampleResult),
        optimizationConfig.metric
      );
      const outOfSampleMetric = this.getMetricValue(
        this.performanceAnalyzer.calculateMetrics(outOfSampleResult),
        optimizationConfig.metric
      );

      const degradation = (inSampleMetric - outOfSampleMetric) / Math.abs(inSampleMetric);

      results.push({
        period: Math.floor(start / stepSize) + 1,
        trainingStart: trainingData[0].timestamp,
        trainingEnd: trainingData[trainingData.length - 1].timestamp,
        testingStart: testingData[0].timestamp,
        testingEnd: testingData[testingData.length - 1].timestamp,
        optimalParameters: trainingOptimization.bestParameters,
        inSampleResult,
        outOfSampleResult,
        degradation
      });
    }

    return results;
  }

  private generateParameterCombinations(parameters: { [key: string]: number[] }): { [key: string]: number }[] {
    const paramNames = Object.keys(parameters);
    const combinations: { [key: string]: number }[] = [];

    const generate = (index: number, current: { [key: string]: number }) => {
      if (index >= paramNames.length) {
        combinations.push({ ...current });
        return;
      }

      const paramName = paramNames[index];
      const values = parameters[paramName];

      for (const value of values) {
        current[paramName] = value;
        generate(index + 1, current);
      }
    };

    generate(0, {});
    return combinations;
  }

  private initializePopulation(
    parameters: { [key: string]: number[] },
    populationSize: number
  ): GeneticIndividual[] {
    const population: GeneticIndividual[] = [];

    for (let i = 0; i < populationSize; i++) {
      const individual: GeneticIndividual = {
        parameters: {},
        fitness: 0
      };

      for (const [paramName, values] of Object.entries(parameters)) {
        const randomIndex = Math.floor(Math.random() * values.length);
        individual.parameters[paramName] = values[randomIndex];
      }

      population.push(individual);
    }

    return population;
  }

  private async evaluatePopulation(
    population: GeneticIndividual[],
    backtestConfig: BacktestConfig,
    historicalData: HistoricalCandle[],
    optimizationConfig: OptimizationConfig
  ): Promise<void> {
    for (const individual of population) {
      if (individual.fitness === 0) { // Only evaluate if not already evaluated
        try {
          const strategyConfig = this.createStrategyConfig(individual.parameters);
          const backtest = await this.runSingleBacktest(backtestConfig, strategyConfig, historicalData);
          const metrics = this.performanceAnalyzer.calculateMetrics(backtest);
          
          individual.fitness = this.getMetricValue(metrics, optimizationConfig.metric);
          individual.backtest = backtest;
        } catch (error) {
          individual.fitness = optimizationConfig.direction === 'maximize' ? -Infinity : Infinity;
        }
      }
    }
  }

  private createNextGeneration(
    population: GeneticIndividual[],
    mutationRate: number,
    crossoverRate: number,
    parameterRanges: { [key: string]: number[] }
  ): GeneticIndividual[] {
    const newPopulation: GeneticIndividual[] = [];
    const eliteCount = Math.floor(population.length * 0.1); // Keep top 10%

    // Add elite individuals
    for (let i = 0; i < eliteCount; i++) {
      newPopulation.push({
        parameters: { ...population[i].parameters },
        fitness: 0 // Reset fitness for re-evaluation
      });
    }

    // Generate offspring
    while (newPopulation.length < population.length) {
      const parent1 = this.selectParent(population);
      const parent2 = this.selectParent(population);

      let offspring1, offspring2;

      if (Math.random() < crossoverRate) {
        [offspring1, offspring2] = this.crossover(parent1, parent2);
      } else {
        offspring1 = { parameters: { ...parent1.parameters }, fitness: 0 };
        offspring2 = { parameters: { ...parent2.parameters }, fitness: 0 };
      }

      if (Math.random() < mutationRate) {
        this.mutate(offspring1, parameterRanges);
      }
      if (Math.random() < mutationRate) {
        this.mutate(offspring2, parameterRanges);
      }

      newPopulation.push(offspring1);
      if (newPopulation.length < population.length) {
        newPopulation.push(offspring2);
      }
    }

    return newPopulation;
  }

  private selectParent(population: GeneticIndividual[]): GeneticIndividual {
    // Tournament selection
    const tournamentSize = 3;
    const tournament: GeneticIndividual[] = [];

    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * population.length);
      tournament.push(population[randomIndex]);
    }

    return tournament.reduce((best, current) => 
      current.fitness > best.fitness ? current : best
    );
  }

  private crossover(parent1: GeneticIndividual, parent2: GeneticIndividual): [GeneticIndividual, GeneticIndividual] {
    const offspring1: GeneticIndividual = { parameters: {}, fitness: 0 };
    const offspring2: GeneticIndividual = { parameters: {}, fitness: 0 };

    for (const paramName of Object.keys(parent1.parameters)) {
      if (Math.random() < 0.5) {
        offspring1.parameters[paramName] = parent1.parameters[paramName];
        offspring2.parameters[paramName] = parent2.parameters[paramName];
      } else {
        offspring1.parameters[paramName] = parent2.parameters[paramName];
        offspring2.parameters[paramName] = parent1.parameters[paramName];
      }
    }

    return [offspring1, offspring2];
  }

  private mutate(individual: GeneticIndividual, parameterRanges: { [key: string]: number[] }): void {
    for (const [paramName, values] of Object.entries(parameterRanges)) {
      if (Math.random() < 0.1) { // 10% chance to mutate each parameter
        const randomIndex = Math.floor(Math.random() * values.length);
        individual.parameters[paramName] = values[randomIndex];
      }
    }
  }

  private calculateOverfittingScore(results: Array<{
    parameters: { [key: string]: number };
    score: number;
    backtest: BacktestResult;
  }>): number {
    if (results.length < 2) return 0;

    // Calculate the spread between best and worst performing parameters
    const scores = results.map(r => r.score);
    const bestScore = Math.max(...scores);
    const worstScore = Math.min(...scores);
    const spread = bestScore - worstScore;

    // Higher spread indicates potential overfitting
    // Normalize by the best score to get a ratio
    return bestScore !== 0 ? spread / Math.abs(bestScore) : 0;
  }

  private calculateRobustnessScore(results: Array<{
    parameters: { [key: string]: number };
    score: number;
    backtest: BacktestResult;
  }>): number {
    if (results.length < 10) return 1; // Not enough data

    // Take top 10% of results
    const topResults = results.slice(0, Math.max(1, Math.floor(results.length * 0.1)));
    const scores = topResults.map(r => r.score);

    // Calculate coefficient of variation (lower is more robust)
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Return inverse of coefficient of variation (higher is more robust)
    const coefficientOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : 1;
    return 1 / (1 + coefficientOfVariation);
  }

  private createStrategyConfig(parameters: { [key: string]: number }): TradingStrategyConfig {
    return {
      buyThreshold: parameters['buyThreshold'] || 0.02,
      sellThreshold: parameters['sellThreshold'] || 0.02,
      minProfitMargin: parameters['minProfitMargin'] || 0.01,
      maxTradeAmount: parameters['maxTradeAmount'] || 10000,
      riskTolerance: parameters['riskTolerance'] || 0.8
    };
  }

  private async runSingleBacktest(
    config: BacktestConfig,
    strategyConfig: TradingStrategyConfig,
    historicalData: HistoricalCandle[]
  ): Promise<BacktestResult> {
    const engine = new BacktestEngine(config, strategyConfig);
    return await engine.runBacktest(historicalData);
  }

  private getMetricValue(metrics: PerformanceMetrics, metricName: keyof PerformanceMetrics): number {
    return metrics[metricName];
  }
}