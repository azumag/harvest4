import { performance } from 'perf_hooks';
import { cpus, totalmem, freemem } from 'os';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  unit: string;
}

interface BottleneckAlert {
  component: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  timestamp: number;
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  uptime: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private alerts: BottleneckAlert[] = [];
  private thresholds: Map<string, { warning: number; critical: number }> = new Map();
  private readonly MAX_METRICS_HISTORY = 1000;
  private readonly ALERT_COOLDOWN = 30000; // 30 seconds cooldown for same alert
  private lastAlerts: Map<string, number> = new Map();
  private startTime = Date.now();

  constructor() {
    this.setupDefaultThresholds();
    this.startSystemMonitoring();
  }

  private setupDefaultThresholds(): void {
    this.thresholds.set('api_response_time', { warning: 1000, critical: 5000 });
    this.thresholds.set('calculation_time', { warning: 100, critical: 500 });
    this.thresholds.set('memory_usage', { warning: 80, critical: 95 });
    this.thresholds.set('cpu_usage', { warning: 80, critical: 95 });
    this.thresholds.set('cache_hit_rate', { warning: 50, critical: 30 });
    this.thresholds.set('queue_size', { warning: 50, critical: 100 });
    this.thresholds.set('memory_leak_rate', { warning: 1, critical: 5 });
  }

  private startSystemMonitoring(): void {
    setInterval(() => {
      this.collectSystemMetrics();
      this.detectMemoryLeaks();
      this.cleanupOldMetrics();
    }, 5000); // Monitor every 5 seconds
  }

  private collectSystemMetrics(): void {
    const metrics = this.getSystemMetrics();
    
    this.recordMetric('cpu_usage', metrics.cpuUsage, '%');
    this.recordMetric('memory_usage', metrics.memoryUsage, '%');
    this.recordMetric('total_memory', metrics.totalMemory, 'MB');
    this.recordMetric('uptime', metrics.uptime, 'ms');
    
    this.checkThresholds('cpu_usage', metrics.cpuUsage);
    this.checkThresholds('memory_usage', metrics.memoryUsage);
  }

  private detectMemoryLeaks(): void {
    const memoryMetrics = this.metrics.get('memory_usage');
    if (!memoryMetrics || memoryMetrics.length < 10) return;

    const recent = memoryMetrics.slice(-10);
    const slope = this.calculateTrendSlope(recent);
    
    // If memory usage is consistently increasing
    if (slope > 0.5) {
      this.triggerAlert('memory_leak_detection', 'memory_leak_rate', slope, 0.5, 'warning');
    }
  }

  private calculateTrendSlope(metrics: PerformanceMetric[]): number {
    if (metrics.length < 2) return 0;
    
    const n = metrics.length;
    const sumX = metrics.reduce((sum, _, i) => sum + i, 0);
    const sumY = metrics.reduce((sum, metric) => sum + metric.value, 0);
    const sumXY = metrics.reduce((sum, metric, i) => sum + i * metric.value, 0);
    const sumX2 = metrics.reduce((sum, _, i) => sum + i * i, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - (60000 * 10); // Keep 10 minutes of data
    
    for (const [key, metrics] of this.metrics) {
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
      if (filteredMetrics.length > this.MAX_METRICS_HISTORY) {
        this.metrics.set(key, filteredMetrics.slice(-this.MAX_METRICS_HISTORY));
      } else {
        this.metrics.set(key, filteredMetrics);
      }
    }
    
    // Clean up old alerts
    this.alerts = this.alerts.filter(alert => Date.now() - alert.timestamp < 300000); // Keep 5 minutes
  }

  recordMetric(name: string, value: number, unit: string = 'ms'): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      unit,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push(metric);

    // Keep only recent metrics
    if (metrics.length > this.MAX_METRICS_HISTORY) {
      metrics.shift();
    }

    this.checkThresholds(name, value);
  }

  private checkThresholds(name: string, value: number): void {
    const threshold = this.thresholds.get(name);
    if (!threshold) return;

    if (value >= threshold.critical) {
      this.triggerAlert('threshold_breach', name, value, threshold.critical, 'critical');
    } else if (value >= threshold.warning) {
      this.triggerAlert('threshold_breach', name, value, threshold.warning, 'warning');
    }
  }

  private triggerAlert(
    component: string,
    metric: string,
    value: number,
    threshold: number,
    severity: 'warning' | 'critical'
  ): void {
    const alertKey = `${component}_${metric}_${severity}`;
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(alertKey) || 0;

    if (now - lastAlert < this.ALERT_COOLDOWN) {
      return; // Skip if in cooldown
    }

    const alert: BottleneckAlert = {
      component,
      metric,
      value,
      threshold,
      severity,
      timestamp: now,
    };

    this.alerts.push(alert);
    this.lastAlerts.set(alertKey, now);

    // Log alert
    console.warn(`[PERFORMANCE ALERT] ${severity.toUpperCase()}: ${component}.${metric} = ${value} (threshold: ${threshold})`);
  }

  measureFunction<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration);
      throw error;
    }
  }

  async measureAsyncFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration);
      throw error;
    }
  }

  getSystemMetrics(): SystemMetrics {
    const totalMemory = totalmem();
    const freeMemory = freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    return {
      cpuUsage: this.getCpuUsage(),
      memoryUsage,
      totalMemory: Math.round(totalMemory / 1024 / 1024), // Convert to MB
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }

  private getCpuUsage(): number {
    const cpuCores = cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const core of cpuCores) {
      for (const type in core.times) {
        totalTick += core.times[type as keyof typeof core.times];
      }
      totalIdle += core.times.idle;
    }

    return ((totalTick - totalIdle) / totalTick) * 100;
  }

  getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.metrics.get(name) || [];
    }
    
    const allMetrics: PerformanceMetric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  getRecentAlerts(limit: number = 10): BottleneckAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getPerformanceReport(): string {
    const systemMetrics = this.getSystemMetrics();
    const recentAlerts = this.getRecentAlerts(5);
    const slowestOperations = this.getTopBottlenecks(5);

    return `
=== PERFORMANCE REPORT ===
System Metrics:
- CPU Usage: ${systemMetrics.cpuUsage.toFixed(2)}%
- Memory Usage: ${systemMetrics.memoryUsage.toFixed(2)}% (${systemMetrics.totalMemory} MB total)
- Uptime: ${(systemMetrics.uptime / 1000 / 60).toFixed(2)} minutes

Recent Alerts (${recentAlerts.length}):
${recentAlerts.map(alert => 
  `- ${alert.severity.toUpperCase()}: ${alert.component}.${alert.metric} = ${alert.value} (threshold: ${alert.threshold})`
).join('\n')}

Slowest Operations:
${slowestOperations.map(op => 
  `- ${op.name}: ${op.avgTime.toFixed(2)}ms (${op.count} samples)`
).join('\n')}

Cache Performance:
${this.getCachePerformanceReport()}

Recommendations:
${this.getOptimizationRecommendations()}
========================
`;
  }

  private getTopBottlenecks(limit: number): Array<{ name: string; avgTime: number; count: number }> {
    const bottlenecks: Array<{ name: string; avgTime: number; count: number }> = [];

    for (const [name, metrics] of this.metrics) {
      if (metrics.length === 0) continue;

      const avgTime = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
      bottlenecks.push({ name, avgTime, count: metrics.length });
    }

    return bottlenecks
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);
  }

  private getCachePerformanceReport(): string {
    const cacheMetrics = this.metrics.get('cache_hit_rate');
    if (!cacheMetrics || cacheMetrics.length === 0) {
      return 'No cache metrics available';
    }

    const latest = cacheMetrics[cacheMetrics.length - 1];
    if (!latest) {
      return 'No recent cache metrics available';
    }
    return `Cache Hit Rate: ${latest.value.toFixed(2)}%`;
  }

  private getOptimizationRecommendations(): string {
    const recommendations: string[] = [];
    const systemMetrics = this.getSystemMetrics();

    if (systemMetrics.memoryUsage > 85) {
      recommendations.push('Consider reducing cache size or implementing memory cleanup');
    }

    if (systemMetrics.cpuUsage > 85) {
      recommendations.push('Consider optimizing calculation algorithms or adding more parallel processing');
    }

    const apiMetrics = this.metrics.get('api_response_time');
    if (apiMetrics && apiMetrics.length > 0) {
      const avgApiTime = apiMetrics.reduce((sum, m) => sum + m.value, 0) / apiMetrics.length;
      if (avgApiTime > 2000) {
        recommendations.push('API response times are high - consider request batching or caching');
      }
    }

    return recommendations.length > 0 ? recommendations.join('\n') : 'System performance is optimal';
  }

  setThreshold(name: string, warning: number, critical: number): void {
    this.thresholds.set(name, { warning, critical });
  }

  clearMetrics(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }

  clearAlerts(): void {
    this.alerts = [];
    this.lastAlerts.clear();
  }

  // Export metrics for external monitoring systems
  exportMetrics(): {
    metrics: Map<string, PerformanceMetric[]>;
    alerts: BottleneckAlert[];
    systemMetrics: SystemMetrics;
  } {
    return {
      metrics: this.metrics,
      alerts: this.alerts,
      systemMetrics: this.getSystemMetrics(),
    };
  }
}