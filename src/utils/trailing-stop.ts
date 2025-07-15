export type PositionSide = 'long' | 'short';

export interface StepConfig {
  profitThreshold: number; // Profit percentage threshold
  stopDistance: number;    // New stop distance when threshold reached
}

export interface PartialClose {
  price: number;
  percentage: number;
  timestamp: number;
}

export interface TrailingStopPosition {
  id: string;
  side: PositionSide;
  entryPrice: number;
  currentPrice: number;
  highestPrice?: number;   // For long positions
  lowestPrice?: number;    // For short positions
  stopLevel: number;
  stopDistance: number;
  isATRBased: boolean;
  atrValue?: number;
  atrMultiplier?: number;
  isSteppedStop: boolean;
  stepConfigs?: StepConfig[];
  partialCloses: PartialClose[];
  createdAt: number;
  lastUpdated: number;
}

export class TrailingStopManager {
  private positions: Map<string, TrailingStopPosition> = new Map();

  createTrailingStop(
    positionId: string,
    side: PositionSide,
    entryPrice: number,
    initialStopDistance: number
  ): void {
    const stopLevel = this.calculateInitialStopLevel(side, entryPrice, initialStopDistance);
    
    const position: TrailingStopPosition = {
      id: positionId,
      side,
      entryPrice,
      currentPrice: entryPrice,
      stopLevel,
      stopDistance: initialStopDistance,
      isATRBased: false,
      isSteppedStop: false,
      partialCloses: [],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    if (side === 'long') {
      position.highestPrice = entryPrice;
    } else {
      position.lowestPrice = entryPrice;
    }

    this.positions.set(positionId, position);
  }

  createATRTrailingStop(
    positionId: string,
    side: PositionSide,
    entryPrice: number,
    atrValue: number,
    atrMultiplier = 2.0
  ): void {
    const stopDistance = (atrValue * atrMultiplier) / entryPrice;
    const stopLevel = this.calculateInitialStopLevel(side, entryPrice, stopDistance);

    const position: TrailingStopPosition = {
      id: positionId,
      side,
      entryPrice,
      currentPrice: entryPrice,
      stopLevel,
      stopDistance,
      isATRBased: true,
      atrValue,
      atrMultiplier,
      isSteppedStop: false,
      partialCloses: [],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    if (side === 'long') {
      position.highestPrice = entryPrice;
    } else {
      position.lowestPrice = entryPrice;
    }

    this.positions.set(positionId, position);
  }

  createSteppedTrailingStop(
    positionId: string,
    side: PositionSide,
    entryPrice: number,
    initialStopDistance: number,
    stepConfigs: StepConfig[]
  ): void {
    const stopLevel = this.calculateInitialStopLevel(side, entryPrice, initialStopDistance);

    const position: TrailingStopPosition = {
      id: positionId,
      side,
      entryPrice,
      currentPrice: entryPrice,
      stopLevel,
      stopDistance: initialStopDistance,
      isATRBased: false,
      isSteppedStop: true,
      stepConfigs: [...stepConfigs].sort((a, b) => a.profitThreshold - b.profitThreshold),
      partialCloses: [],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    if (side === 'long') {
      position.highestPrice = entryPrice;
    } else {
      position.lowestPrice = entryPrice;
    }

    this.positions.set(positionId, position);
  }

  private calculateInitialStopLevel(
    side: PositionSide,
    entryPrice: number,
    stopDistance: number
  ): number {
    if (side === 'long') {
      return entryPrice * (1 - stopDistance);
    } else {
      return entryPrice * (1 + stopDistance);
    }
  }

  updateTrailingStop(positionId: string, currentPrice: number): boolean {
    const position = this.positions.get(positionId);
    if (!position) {
      return false;
    }

    position.currentPrice = currentPrice;
    position.lastUpdated = Date.now();

    let stopUpdated = false;

    if (position.side === 'long') {
      // Update highest price if current price is higher
      if (!position.highestPrice || currentPrice > position.highestPrice) {
        position.highestPrice = currentPrice;
        stopUpdated = this.updateLongStopLevel(position);
      }
    } else {
      // Update lowest price if current price is lower
      if (!position.lowestPrice || currentPrice < position.lowestPrice) {
        position.lowestPrice = currentPrice;
        stopUpdated = this.updateShortStopLevel(position);
      }
    }

    return stopUpdated;
  }

  private updateLongStopLevel(position: TrailingStopPosition): boolean {
    if (!position.highestPrice) return false;

    const currentStopDistance = this.getCurrentStopDistance(position);
    const newStopLevel = position.highestPrice * (1 - currentStopDistance);

    if (newStopLevel > position.stopLevel) {
      position.stopLevel = newStopLevel;
      return true;
    }

    return false;
  }

  private updateShortStopLevel(position: TrailingStopPosition): boolean {
    if (!position.lowestPrice) return false;

    const currentStopDistance = this.getCurrentStopDistance(position);
    const newStopLevel = position.lowestPrice * (1 + currentStopDistance);

    if (newStopLevel < position.stopLevel) {
      position.stopLevel = newStopLevel;
      return true;
    }

    return false;
  }

  private getCurrentStopDistance(position: TrailingStopPosition): number {
    if (position.isSteppedStop && position.stepConfigs) {
      const profitPct = this.calculateProfitPercentage(position);
      
      // Find the appropriate step based on current profit
      for (let i = position.stepConfigs.length - 1; i >= 0; i--) {
        const stepConfig = position.stepConfigs[i];
        if (stepConfig && profitPct >= stepConfig.profitThreshold) {
          return stepConfig.stopDistance;
        }
      }
    }

    if (position.isATRBased && position.atrValue && position.atrMultiplier) {
      return (position.atrValue * position.atrMultiplier) / position.currentPrice;
    }

    return position.stopDistance;
  }

  private calculateProfitPercentage(position: TrailingStopPosition): number {
    if (position.side === 'long') {
      return (position.currentPrice - position.entryPrice) / position.entryPrice;
    } else {
      return (position.entryPrice - position.currentPrice) / position.entryPrice;
    }
  }

  updateATRDistance(positionId: string, newATR: number): boolean {
    const position = this.positions.get(positionId);
    if (!position || !position.isATRBased || !position.atrMultiplier) {
      return false;
    }

    position.atrValue = newATR;
    position.stopDistance = (newATR * position.atrMultiplier) / position.currentPrice;
    
    // Recalculate stop level
    if (position.side === 'long' && position.highestPrice) {
      position.stopLevel = position.highestPrice * (1 - position.stopDistance);
    } else if (position.side === 'short' && position.lowestPrice) {
      position.stopLevel = position.lowestPrice * (1 + position.stopDistance);
    }

    return true;
  }

  checkStopTrigger(positionId: string, currentPrice: number): boolean {
    const position = this.positions.get(positionId);
    if (!position) {
      return false;
    }

    const isTriggered = position.side === 'long' 
      ? currentPrice <= position.stopLevel
      : currentPrice >= position.stopLevel;

    if (isTriggered) {
      this.positions.delete(positionId);
    }

    return isTriggered;
  }

  getCurrentStopLevel(positionId: string): number | null {
    const position = this.positions.get(positionId);
    return position ? position.stopLevel : null;
  }

  getActivePositions(): string[] {
    return Array.from(this.positions.keys());
  }

  closePosition(positionId: string): boolean {
    return this.positions.delete(positionId);
  }

  getPositionInfo(positionId: string): TrailingStopPosition | undefined {
    return this.positions.get(positionId);
  }

  getUnrealizedProfit(positionId: string, positionSize: number): number {
    const position = this.positions.get(positionId);
    if (!position) {
      return 0;
    }

    const priceDiff = position.side === 'long'
      ? position.currentPrice - position.entryPrice
      : position.entryPrice - position.currentPrice;

    return priceDiff * positionSize;
  }

  getProfitPercentage(positionId: string): number {
    const position = this.positions.get(positionId);
    if (!position) {
      return 0;
    }

    return this.calculateProfitPercentage(position);
  }

  moveToBreakeven(positionId: string): boolean {
    const position = this.positions.get(positionId);
    if (!position) {
      return false;
    }

    position.stopLevel = position.entryPrice;
    return true;
  }

  addPartialClose(positionId: string, price: number, percentage: number): boolean {
    const position = this.positions.get(positionId);
    if (!position) {
      return false;
    }

    position.partialCloses.push({
      price,
      percentage,
      timestamp: Date.now(),
    });

    return true;
  }

  getPartialCloses(positionId: string): PartialClose[] {
    const position = this.positions.get(positionId);
    return position ? [...position.partialCloses] : [];
  }

  // Utility methods
  getPositionCount(): number {
    return this.positions.size;
  }

  getAllPositions(): TrailingStopPosition[] {
    return Array.from(this.positions.values());
  }

  clearAllPositions(): void {
    this.positions.clear();
  }

  // Statistics
  getAverageStopDistance(): number {
    const positions = Array.from(this.positions.values());
    if (positions.length === 0) return 0;

    const totalDistance = positions.reduce((sum, pos) => sum + pos.stopDistance, 0);
    return totalDistance / positions.length;
  }

  getPositionsAtRisk(riskThreshold: number): string[] {
    const atRisk: string[] = [];
    
    for (const [id, position] of this.positions) {
      const distanceToStop = position.side === 'long'
        ? (position.currentPrice - position.stopLevel) / position.currentPrice
        : (position.stopLevel - position.currentPrice) / position.currentPrice;
      
      if (distanceToStop <= riskThreshold) {
        atRisk.push(id);
      }
    }

    return atRisk;
  }
}