import { totalmem } from 'os';

export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
  success: boolean;
  errorMessage?: string | undefined;
}

export interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: number;
  timestamp: number;
}

export interface PerformanceReport {
  averageExecutionTime: number;
  totalOperations: number;
  successRate: number;
  memoryTrend: number[];
  bottlenecks: string[];
  recommendations: string[];
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private activeOperations: Map<string, number> = new Map();
  private readonly MAX_METRICS = 10000;
  private readonly MAX_SYSTEM_METRICS = 1000;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startSystemMonitoring();
  }

  // Start an operation timer
  startOperation(operationName: string): string {
    const operationId = `${operationName}_${Date.now()}_${Math.random()}`;
    this.activeOperations.set(operationId, Date.now());
    return operationId;
  }

  // End an operation timer and record metrics
  endOperation(operationId: string, success: boolean = true, errorMessage?: string): void {
    const startTime = this.activeOperations.get(operationId);
    if (!startTime) return;

    const endTime = Date.now();
    const operationName = operationId.split('_')[0] || 'unknown';

    const metric: PerformanceMetrics = {
      operationName,
      startTime,
      endTime,
      duration: endTime - startTime,
      memoryUsage: process.memoryUsage(),
      success,
      errorMessage,
    };

    this.metrics.push(metric);
    this.activeOperations.delete(operationId);

    // Trim metrics if too many
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Log slow operations
    if (metric.duration > 1000) {
      console.warn(`Slow operation detected: ${operationName} took ${metric.duration}ms`);
    }
  }

  // Measure function execution
  async measureAsync<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
    const operationId = this.startOperation(operationName);
    try {
      const result = await fn();
      this.endOperation(operationId, true);
      return result;
    } catch (error) {
      this.endOperation(operationId, false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // Measure synchronous function execution
  measure<T>(operationName: string, fn: () => T): T {
    const operationId = this.startOperation(operationName);
    try {
      const result = fn();
      this.endOperation(operationId, true);
      return result;
    } catch (error) {
      this.endOperation(operationId, false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // Start system monitoring
  private startSystemMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const totalMemory = totalmem();
      
      const systemMetric: SystemMetrics = {
        cpu: process.cpuUsage().user / 1000000, // Convert to seconds
        memory: {
          used: memUsage.heapUsed,
          total: totalMemory,
          percentage: (memUsage.heapUsed / totalMemory) * 100,
        },
        uptime: process.uptime(),
        timestamp: Date.now(),
      };

      this.systemMetrics.push(systemMetric);

      // Trim system metrics if too many
      if (this.systemMetrics.length > this.MAX_SYSTEM_METRICS) {
        this.systemMetrics = this.systemMetrics.slice(-this.MAX_SYSTEM_METRICS);
      }

      // Alert on high memory usage
      if (systemMetric.memory.percentage > 80) {
        console.warn(`High memory usage detected: ${systemMetric.memory.percentage.toFixed(2)}%`);
      }
    }, 5000); // Monitor every 5 seconds
  }

  // Stop monitoring
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Get performance report
  getPerformanceReport(): PerformanceReport {
    const operationGroups = this.groupMetricsByOperation();
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];
    let totalDuration = 0;
    let totalOperations = 0;
    let successfulOperations = 0;

    for (const [operationName, metrics] of operationGroups) {
      const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const successRate = metrics.filter(m => m.success).length / metrics.length;
      
      totalDuration += metrics.reduce((sum, m) => sum + m.duration, 0);
      totalOperations += metrics.length;
      successfulOperations += metrics.filter(m => m.success).length;

      // Identify bottlenecks
      if (avgDuration > 500) {
        bottlenecks.push(`${operationName}: ${avgDuration.toFixed(2)}ms average`);
      }

      if (successRate < 0.95) {
        bottlenecks.push(`${operationName}: ${(successRate * 100).toFixed(2)}% success rate`);
      }
    }

    // Generate recommendations
    if (bottlenecks.length > 0) {
      recommendations.push('Consider implementing caching for slow operations');
      recommendations.push('Review error handling for operations with low success rates');
    }

    const memoryTrend = this.systemMetrics
      .slice(-20)
      .map(m => m.memory.percentage);

    if (memoryTrend.length > 1) {
      const latestMemory = memoryTrend[memoryTrend.length - 1];
      const firstMemory = memoryTrend[0];
      if (latestMemory !== undefined && firstMemory !== undefined) {
        const memoryIncrease = latestMemory - firstMemory;
        if (memoryIncrease > 10) {
          recommendations.push('Memory usage is increasing. Consider implementing memory cleanup');
        }
      }
    }

    return {
      averageExecutionTime: totalOperations > 0 ? totalDuration / totalOperations : 0,
      totalOperations,
      successRate: totalOperations > 0 ? successfulOperations / totalOperations : 0,
      memoryTrend,
      bottlenecks,
      recommendations,
    };
  }

  // Get metrics for a specific operation
  getOperationMetrics(operationName: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.operationName === operationName);
  }

  // Get current system metrics
  getCurrentSystemMetrics(): SystemMetrics | null {
    return this.systemMetrics.length > 0 ? this.systemMetrics[this.systemMetrics.length - 1] || null : null;
  }

  // Get system metrics history
  getSystemMetricsHistory(minutes: number = 60): SystemMetrics[] {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.systemMetrics.filter(m => m.timestamp >= cutoffTime);
  }

  // Group metrics by operation name
  private groupMetricsByOperation(): Map<string, PerformanceMetrics[]> {
    const groups = new Map<string, PerformanceMetrics[]>();
    
    for (const metric of this.metrics) {
      if (!groups.has(metric.operationName)) {
        groups.set(metric.operationName, []);
      }
      groups.get(metric.operationName)!.push(metric);
    }
    
    return groups;
  }

  // Clear all metrics
  clearMetrics(): void {
    this.metrics = [];
    this.systemMetrics = [];
  }

  // Get memory leak detection
  detectMemoryLeaks(): {
    isLeaking: boolean;
    trend: number;
    recommendation: string;
  } {
    if (this.systemMetrics.length < 10) {
      return {
        isLeaking: false,
        trend: 0,
        recommendation: 'Need more data to detect memory leaks',
      };
    }

    const recent = this.systemMetrics.slice(-10);
    const lastMetric = recent[recent.length - 1];
    const firstMetric = recent[0];
    
    if (!lastMetric || !firstMetric) {
      return {
        isLeaking: false,
        trend: 0,
        recommendation: 'Insufficient data to detect memory leaks',
      };
    }
    
    const trend = (lastMetric.memory.percentage - firstMetric.memory.percentage) / recent.length;
    
    const isLeaking = trend > 1; // More than 1% increase per measurement
    
    return {
      isLeaking,
      trend,
      recommendation: isLeaking ? 
        'Potential memory leak detected. Review object cleanup and event listeners.' :
        'Memory usage appears stable.',
    };
  }

  // Generate detailed performance report
  generateDetailedReport(): string {
    const report = this.getPerformanceReport();
    const systemMetrics = this.getCurrentSystemMetrics();
    const memoryLeak = this.detectMemoryLeaks();
    const operationGroups = this.groupMetricsByOperation();

    let reportText = `
=== PERFORMANCE MONITORING REPORT ===
Generated: ${new Date().toISOString()}

== SUMMARY ==
Total Operations: ${report.totalOperations}
Average Execution Time: ${report.averageExecutionTime.toFixed(2)}ms
Success Rate: ${(report.successRate * 100).toFixed(2)}%

== CURRENT SYSTEM ==
Memory Usage: ${systemMetrics?.memory.percentage.toFixed(2) || 'N/A'}%
Memory Used: ${systemMetrics ? (systemMetrics.memory.used / 1024 / 1024).toFixed(2) : 'N/A'}MB
Uptime: ${systemMetrics ? (systemMetrics.uptime / 3600).toFixed(2) : 'N/A'} hours

== MEMORY LEAK DETECTION ==
Status: ${memoryLeak.isLeaking ? 'POTENTIAL LEAK' : 'STABLE'}
Trend: ${memoryLeak.trend.toFixed(3)}% per measurement
${memoryLeak.recommendation}

== BOTTLENECKS ==
${report.bottlenecks.length > 0 ? report.bottlenecks.map(b => `- ${b}`).join('\n') : 'No bottlenecks detected'}

== OPERATION BREAKDOWN ==`;

    for (const [operationName, metrics] of operationGroups) {
      const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const successRate = metrics.filter(m => m.success).length / metrics.length;
      const maxDuration = Math.max(...metrics.map(m => m.duration));
      const minDuration = Math.min(...metrics.map(m => m.duration));

      reportText += `
${operationName}:
  Count: ${metrics.length}
  Avg Duration: ${avgDuration.toFixed(2)}ms
  Min/Max: ${minDuration}ms / ${maxDuration}ms
  Success Rate: ${(successRate * 100).toFixed(2)}%`;
    }

    reportText += `

== RECOMMENDATIONS ==
${report.recommendations.length > 0 ? report.recommendations.map(r => `- ${r}`).join('\n') : 'No specific recommendations'}

================================
`;

    return reportText;
  }
}