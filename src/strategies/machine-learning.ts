import { BitbankTicker, TradingSignal } from '../types/bitbank';
import { 
  MachineLearningConfig, 
  AdvancedTradingStrategy, 
  MarketCondition, 
  StrategyPerformance 
} from '../types/advanced-strategies';

interface MLFeature {
  name: string;
  value: number;
}

interface MLDataPoint {
  features: MLFeature[];
  target: number;
  timestamp: number;
}

export class MachineLearningStrategy implements AdvancedTradingStrategy {
  name = 'Machine Learning';
  config: MachineLearningConfig;
  
  private priceHistory: number[] = [];
  private volumeHistory: number[] = [];
  private trainingData: MLDataPoint[] = [];
  private model: { weights: number[]; bias: number } | null = null;
  private lastRetrainTime = 0;
  private totalTrades = 0;
  private winningTrades = 0;
  private totalProfit = 0;
  private maxDrawdown = 0;
  private currentDrawdown = 0;
  private lastUpdated = Date.now();
  private predictionAccuracy = 0;
  private totalPredictions = 0;
  private correctPredictions = 0;

  constructor(config: MachineLearningConfig) {
    this.config = config;
  }

  updateMarketData(ticker: BitbankTicker): void {
    const currentPrice = parseFloat(ticker.last);
    const currentVolume = parseFloat(ticker.vol);
    
    this.priceHistory.push(currentPrice);
    this.volumeHistory.push(currentVolume);
    
    // Keep only training period data
    const maxHistory = this.config.params.trainingPeriod * 2;
    if (this.priceHistory.length > maxHistory) {
      this.priceHistory.shift();
      this.volumeHistory.shift();
    }
    
    // Add to training data if we have enough history
    if (this.priceHistory.length >= 20) {
      this.addTrainingDataPoint(currentPrice, currentVolume);
    }
    
    // Check if we need to retrain the model
    if (this.shouldRetrain()) {
      this.retrainModel();
    }
  }

  generateSignal(ticker: BitbankTicker, _marketCondition: MarketCondition): TradingSignal {
    if (!this.config.enabled) {
      return this.createHoldSignal(ticker, 'Strategy disabled');
    }

    const currentPrice = parseFloat(ticker.last);
    
    // Need sufficient data and trained model
    if (this.priceHistory.length < 50 || !this.model) {
      return this.createHoldSignal(ticker, 'Insufficient data or model not trained');
    }
    
    // Generate prediction
    const prediction = this.generatePrediction(currentPrice);
    
    if (prediction === null) {
      return this.createHoldSignal(ticker, 'Unable to generate prediction');
    }
    
    // Convert prediction to trading signal
    return this.predictionToSignal(ticker, currentPrice, prediction);
  }

  private addTrainingDataPoint(currentPrice: number, currentVolume: number): void {
    const features = this.extractFeatures(currentPrice, currentVolume);
    
    // Use future price as target (if available)
    if (this.priceHistory.length >= this.config.params.predictionHorizon + 1) {
      const targetIndex = this.priceHistory.length - this.config.params.predictionHorizon - 1;
      const targetPrice = this.priceHistory[targetIndex + this.config.params.predictionHorizon];
      const currentPriceAtTime = this.priceHistory[targetIndex];
      
      const target = (targetPrice - currentPriceAtTime) / currentPriceAtTime; // Price change percentage
      
      this.trainingData.push({
        features,
        target,
        timestamp: Date.now()
      });
    }
    
    // Keep only recent training data
    if (this.trainingData.length > this.config.params.trainingPeriod) {
      this.trainingData.shift();
    }
  }

  private extractFeatures(currentPrice: number, currentVolume: number): MLFeature[] {
    const features: MLFeature[] = [];
    
    // Price-based features
    if (this.priceHistory.length >= 20) {
      features.push({
        name: 'price_ma_5',
        value: this.calculateMovingAverage(this.priceHistory, 5)
      });
      
      features.push({
        name: 'price_ma_10',
        value: this.calculateMovingAverage(this.priceHistory, 10)
      });
      
      features.push({
        name: 'price_ma_20',
        value: this.calculateMovingAverage(this.priceHistory, 20)
      });
      
      features.push({
        name: 'price_std_10',
        value: this.calculateStandardDeviation(this.priceHistory, 10)
      });
      
      features.push({
        name: 'price_momentum_5',
        value: this.calculateMomentum(this.priceHistory, 5)
      });
      
      features.push({
        name: 'price_momentum_10',
        value: this.calculateMomentum(this.priceHistory, 10)
      });
      
      features.push({
        name: 'rsi_14',
        value: this.calculateRSI(14)
      });
    }
    
    // Volume-based features
    if (this.volumeHistory.length >= 10) {
      features.push({
        name: 'volume_ma_5',
        value: this.calculateMovingAverage(this.volumeHistory, 5)
      });
      
      features.push({
        name: 'volume_ma_10',
        value: this.calculateMovingAverage(this.volumeHistory, 10)
      });
      
      features.push({
        name: 'volume_ratio',
        value: currentVolume / this.calculateMovingAverage(this.volumeHistory, 10)
      });
    }
    
    // Current price as feature
    features.push({
      name: 'current_price',
      value: currentPrice
    });
    
    return features;
  }

  private shouldRetrain(): boolean {
    const timeSinceLastRetrain = Date.now() - this.lastRetrainTime;
    const retrainInterval = this.config.params.retrainInterval * 1000; // Convert to milliseconds
    
    return timeSinceLastRetrain > retrainInterval && 
           this.trainingData.length >= 50;
  }

  private retrainModel(): void {
    if (this.trainingData.length < 50) {
      return;
    }
    
    console.log(`Retraining ML model with ${this.trainingData.length} data points`);
    
    // Prepare training data
    const features = this.trainingData.map(d => d.features.map(f => f.value));
    const targets = this.trainingData.map(d => d.target);
    
    // Simple linear regression
    this.model = this.trainLinearRegression(features, targets);
    this.lastRetrainTime = Date.now();
    
    console.log(`Model trained: ${this.model ? 'Success' : 'Failed'}`);
  }

  private trainLinearRegression(features: number[][], targets: number[]): { weights: number[]; bias: number } | null {
    if (features.length === 0 || features[0].length === 0) {
      return null;
    }
    
    const numFeatures = features[0].length;
    const numSamples = features.length;
    
    // Initialize weights and bias
    const weights = new Array(numFeatures).fill(0);
    let bias = 0;
    
    // Learning parameters
    const learningRate = 0.01;
    const epochs = 100;
    
    // Gradient descent
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalError = 0;
      
      for (let i = 0; i < numSamples; i++) {
        // Forward pass
        let prediction = bias;
        for (let j = 0; j < numFeatures; j++) {
          prediction += weights[j] * features[i][j];
        }
        
        const error = prediction - targets[i];
        totalError += error * error;
        
        // Backward pass
        bias -= learningRate * error;
        for (let j = 0; j < numFeatures; j++) {
          weights[j] -= learningRate * error * features[i][j];
        }
      }
      
      // Early stopping if error is very small
      if (totalError / numSamples < 0.001) {
        break;
      }
    }
    
    return { weights, bias };
  }

  private generatePrediction(currentPrice: number): number | null {
    if (!this.model) {
      return null;
    }
    
    const features = this.extractFeatures(currentPrice, this.volumeHistory[this.volumeHistory.length - 1] || 0);
    
    if (features.length !== this.model.weights.length) {
      return null;
    }
    
    let prediction = this.model.bias;
    for (let i = 0; i < features.length; i++) {
      prediction += this.model.weights[i] * features[i].value;
    }
    
    return prediction;
  }

  private predictionToSignal(ticker: BitbankTicker, currentPrice: number, prediction: number): TradingSignal {
    const predictionThreshold = 0.01; // 1% threshold
    const confidence = Math.min(0.8, Math.abs(prediction) * 50); // Scale prediction to confidence
    
    this.totalPredictions++;
    
    // Strong buy signal
    if (prediction > predictionThreshold) {
      return {
        action: 'buy',
        confidence,
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `ML prediction: ${(prediction * 100).toFixed(2)}% price increase expected`,
      };
    }
    
    // Strong sell signal
    if (prediction < -predictionThreshold) {
      return {
        action: 'sell',
        confidence,
        price: currentPrice,
        amount: this.calculateTradeAmount(currentPrice, confidence),
        reason: `ML prediction: ${(Math.abs(prediction) * 100).toFixed(2)}% price decrease expected`,
      };
    }
    
    return this.createHoldSignal(ticker, `ML prediction: ${(prediction * 100).toFixed(2)}% (below threshold)`);
  }

  private calculateMovingAverage(data: number[], period: number): number {
    if (data.length < period) {
      return data[data.length - 1] || 0;
    }
    
    const sum = data.slice(-period).reduce((sum, val) => sum + val, 0);
    return sum / period;
  }

  private calculateStandardDeviation(data: number[], period: number): number {
    if (data.length < period) {
      return 0;
    }
    
    const recent = data.slice(-period);
    const mean = recent.reduce((sum, val) => sum + val, 0) / period;
    const variance = recent.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    
    return Math.sqrt(variance);
  }

  private calculateMomentum(data: number[], period: number): number {
    if (data.length < period) {
      return 0;
    }
    
    const current = data[data.length - 1];
    const previous = data[data.length - period];
    
    return (current - previous) / previous;
  }

  private calculateRSI(period: number): number {
    if (this.priceHistory.length < period + 1) {
      return 50; // Neutral RSI
    }
    
    const gains = [];
    const losses = [];
    
    for (let i = this.priceHistory.length - period; i < this.priceHistory.length; i++) {
      const change = this.priceHistory[i] - this.priceHistory[i - 1];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }
    
    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateTradeAmount(price: number, confidence: number): number {
    // Base amount scaled by confidence
    const baseAmount = 0.01; // 0.01 BTC base
    return baseAmount * confidence;
  }

  private createHoldSignal(ticker: BitbankTicker, reason: string): TradingSignal {
    return {
      action: 'hold',
      confidence: 0.5,
      price: parseFloat(ticker.last),
      amount: 0,
      reason,
    };
  }

  updatePerformance(profit: number, tradeResult: 'win' | 'loss'): void {
    this.totalTrades++;
    this.totalProfit += profit;
    
    if (tradeResult === 'win') {
      this.winningTrades++;
      this.correctPredictions++;
    }
    
    // Update prediction accuracy
    this.predictionAccuracy = this.totalPredictions > 0 ? 
      this.correctPredictions / this.totalPredictions : 0;
    
    // Update drawdown
    if (profit < 0) {
      this.currentDrawdown += Math.abs(profit);
      this.maxDrawdown = Math.max(this.maxDrawdown, this.currentDrawdown);
    } else {
      this.currentDrawdown = Math.max(0, this.currentDrawdown - profit);
    }
    
    this.lastUpdated = Date.now();
  }

  getPerformanceMetrics(): StrategyPerformance {
    return {
      name: this.name,
      totalTrades: this.totalTrades,
      winRate: this.totalTrades > 0 ? this.winningTrades / this.totalTrades : 0,
      averageProfit: this.totalTrades > 0 ? this.totalProfit / this.totalTrades : 0,
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.maxDrawdown,
      lastUpdated: this.lastUpdated,
    };
  }

  private calculateSharpeRatio(): number {
    if (this.totalTrades < 10) return 0;
    
    // Simplified Sharpe ratio calculation
    const averageReturn = this.totalProfit / this.totalTrades;
    const volatility = this.calculateVolatility();
    
    return volatility > 0 ? averageReturn / volatility : 0;
  }

  private calculateVolatility(): number {
    if (this.priceHistory.length < 20) return 0;
    
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      returns.push((this.priceHistory[i] - this.priceHistory[i-1]) / this.priceHistory[i-1]);
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getWeight(): number {
    return this.config.weight;
  }

  // Get model information
  getModelInfo(): { trained: boolean; accuracy: number; features: string[] } {
    return {
      trained: this.model !== null,
      accuracy: this.predictionAccuracy,
      features: this.config.params.features
    };
  }
}