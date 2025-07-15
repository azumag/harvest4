import { performance } from 'perf_hooks';

interface Task<T = any> {
  id: string;
  fn: () => Promise<T>;
  priority: number;
  timeout: number;
  retries: number;
  maxRetries: number;
  createdAt: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

interface WorkerStats {
  id: string;
  tasksProcessed: number;
  totalProcessingTime: number;
  errors: number;
  isActive: boolean;
  currentTask?: string | undefined;
  lastTaskTime: number;
}

export class WorkerPool {
  private workers: Map<string, WorkerStats> = new Map();
  private taskQueue: Task[] = [];
  private activeTasks: Map<string, Task> = new Map();
  private readonly maxWorkers: number;
  private readonly defaultTimeout: number;
  private readonly queueCheckInterval: number;
  private queueTimer: NodeJS.Timeout | null = null;
  private taskIdCounter = 0;

  constructor(
    maxWorkers: number = 4,
    defaultTimeout: number = 30000,
    queueCheckInterval: number = 100
  ) {
    this.maxWorkers = maxWorkers;
    this.defaultTimeout = defaultTimeout;
    this.queueCheckInterval = queueCheckInterval;

    this.initializeWorkers();
    this.startQueueProcessor();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      const workerId = `worker-${i}`;
      this.workers.set(workerId, {
        id: workerId,
        tasksProcessed: 0,
        totalProcessingTime: 0,
        errors: 0,
        isActive: false,
        lastTaskTime: 0,
      });
    }
  }

  private startQueueProcessor(): void {
    this.queueTimer = setInterval(() => {
      this.processQueue();
    }, this.queueCheckInterval);
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Sort tasks by priority (higher priority first)
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    // Find available workers
    const availableWorkers = Array.from(this.workers.entries())
      .filter(([_, stats]) => !stats.isActive)
      .map(([id, stats]) => ({ id, stats }));

    if (availableWorkers.length === 0) return;

    // Assign tasks to available workers
    const tasksToProcess = Math.min(this.taskQueue.length, availableWorkers.length);
    
    for (let i = 0; i < tasksToProcess; i++) {
      const task = this.taskQueue.shift()!;
      const worker = availableWorkers[i];
      if (worker) {
        this.assignTaskToWorker(task, worker.id);
      }
    }
  }

  private async assignTaskToWorker(task: Task, workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }
    worker.isActive = true;
    worker.currentTask = task.id;
    
    this.activeTasks.set(task.id, task);

    const startTime = performance.now();
    
    try {
      const result = await Promise.race([
        task.fn(),
        this.createTimeoutPromise(task.timeout),
      ]);

      const processingTime = performance.now() - startTime;
      
      // Update worker stats
      worker.tasksProcessed++;
      worker.totalProcessingTime += processingTime;
      worker.lastTaskTime = Date.now();

      // Complete task
      task.resolve(result);
      this.activeTasks.delete(task.id);
      
    } catch (error) {
      const processingTime = performance.now() - startTime;
      worker.totalProcessingTime += processingTime;
      worker.errors++;

      // Handle retries
      if (task.retries < task.maxRetries) {
        task.retries++;
        console.warn(`Task ${task.id} failed, retrying (${task.retries}/${task.maxRetries}):`, error);
        
        // Re-queue the task with lower priority
        task.priority = Math.max(1, task.priority - 1);
        this.taskQueue.push(task);
      } else {
        console.error(`Task ${task.id} failed after ${task.maxRetries} retries:`, error);
        task.reject(error as Error);
        this.activeTasks.delete(task.id);
      }
    } finally {
      worker.isActive = false;
      delete worker.currentTask;
    }
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  async submit<T>(
    taskFn: () => Promise<T>,
    options: {
      priority?: number;
      timeout?: number;
      maxRetries?: number;
      id?: string;
    } = {}
  ): Promise<T> {
    const {
      priority = 5,
      timeout = this.defaultTimeout,
      maxRetries = 3,
      id = this.generateTaskId(),
    } = options;

    return new Promise<T>((resolve, reject) => {
      const task: Task<T> = {
        id,
        fn: taskFn,
        priority,
        timeout,
        retries: 0,
        maxRetries,
        createdAt: Date.now(),
        resolve,
        reject,
      };

      this.taskQueue.push(task);
    });
  }

  private generateTaskId(): string {
    return `task-${++this.taskIdCounter}-${Date.now()}`;
  }

  // Submit multiple tasks concurrently
  async submitBatch<T>(
    tasks: Array<{
      fn: () => Promise<T>;
      priority?: number;
      timeout?: number;
      maxRetries?: number;
      id?: string;
    }>
  ): Promise<T[]> {
    const promises = tasks.map(task => this.submit(task.fn, task));
    return Promise.all(promises);
  }

  // Submit tasks with different priorities
  async submitWithPriority<T>(
    highPriorityTasks: Array<() => Promise<T>>,
    lowPriorityTasks: Array<() => Promise<T>>
  ): Promise<{ high: T[]; low: T[] }> {
    const highPromises = highPriorityTasks.map(fn => 
      this.submit(fn, { priority: 10 })
    );
    
    const lowPromises = lowPriorityTasks.map(fn => 
      this.submit(fn, { priority: 1 })
    );

    const [high, low] = await Promise.all([
      Promise.all(highPromises),
      Promise.all(lowPromises),
    ]);

    return { high, low };
  }

  // Get worker pool statistics
  getStats(): {
    workers: WorkerStats[];
    queueSize: number;
    activeTaskCount: number;
    totalProcessed: number;
    totalErrors: number;
    averageProcessingTime: number;
  } {
    const workers = Array.from(this.workers.values());
    const totalProcessed = workers.reduce((sum, w) => sum + w.tasksProcessed, 0);
    const totalErrors = workers.reduce((sum, w) => sum + w.errors, 0);
    const totalProcessingTime = workers.reduce((sum, w) => sum + w.totalProcessingTime, 0);
    const averageProcessingTime = totalProcessed > 0 ? totalProcessingTime / totalProcessed : 0;

    return {
      workers,
      queueSize: this.taskQueue.length,
      activeTaskCount: this.activeTasks.size,
      totalProcessed,
      totalErrors,
      averageProcessingTime,
    };
  }

  // Get performance metrics
  getPerformanceReport(): string {
    const stats = this.getStats();
    const activeWorkers = stats.workers.filter(w => w.isActive).length;
    const totalProcessingTime = stats.workers.reduce((sum, w) => sum + w.totalProcessingTime, 0);
    const successRate = stats.totalProcessed > 0 
      ? ((stats.totalProcessed - stats.totalErrors) / stats.totalProcessed) * 100 
      : 0;

    return `
=== WORKER POOL PERFORMANCE ===
Workers: ${activeWorkers}/${this.maxWorkers} active
Queue Size: ${stats.queueSize}
Active Tasks: ${stats.activeTaskCount}
Total Processed: ${stats.totalProcessed}
Success Rate: ${successRate.toFixed(2)}%
Average Processing Time: ${stats.averageProcessingTime.toFixed(2)}ms
Total Processing Time: ${totalProcessingTime.toFixed(2)}ms

Worker Details:
${stats.workers.map(w => 
  `- ${w.id}: ${w.tasksProcessed} tasks, ${w.errors} errors, ${w.isActive ? 'ACTIVE' : 'IDLE'}${w.currentTask ? ` (${w.currentTask})` : ''}`
).join('\n')}
=============================
`;
  }

  // Load balancing: Get the least loaded worker (for potential future use)
  // private getLeastLoadedWorker(): string | null {
  //   const availableWorkers = Array.from(this.workers.entries())
  //     .filter(([_, stats]) => !stats.isActive)
  //     .sort(([_, a], [__, b]) => a.tasksProcessed - b.tasksProcessed);

  //   return availableWorkers.length > 0 ? availableWorkers[0][0] : null;
  // }

  // Get tasks waiting in queue
  getQueuedTasks(): Array<{
    id: string;
    priority: number;
    waitTime: number;
    retries: number;
  }> {
    const now = Date.now();
    return this.taskQueue.map(task => ({
      id: task.id,
      priority: task.priority,
      waitTime: now - task.createdAt,
      retries: task.retries,
    }));
  }

  // Clear completed tasks and reset stats
  reset(): void {
    this.taskQueue = [];
    this.activeTasks.clear();
    
    for (const worker of this.workers.values()) {
      worker.tasksProcessed = 0;
      worker.totalProcessingTime = 0;
      worker.errors = 0;
      worker.isActive = false;
      delete worker.currentTask;
      worker.lastTaskTime = 0;
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.queueTimer) {
      clearTimeout(this.queueTimer);
      this.queueTimer = null;
    }

    // Wait for active tasks to complete
    const activeTaskPromises = Array.from(this.activeTasks.values()).map(task => 
      new Promise<void>((resolve) => {
        const originalResolve = task.resolve;
        const originalReject = task.reject;
        
        task.resolve = (value) => {
          originalResolve(value);
          resolve();
        };
        
        task.reject = (error) => {
          originalReject(error);
          resolve();
        };
      })
    );

    await Promise.all(activeTaskPromises);
    
    // Clear remaining queued tasks
    this.taskQueue.forEach(task => {
      task.reject(new Error('Worker pool shutdown'));
    });
    
    this.reset();
  }

  // Dynamic scaling (experimental)
  async scaleUp(additionalWorkers: number): Promise<void> {
    const currentWorkerCount = this.workers.size;
    
    for (let i = 0; i < additionalWorkers; i++) {
      const workerId = `worker-${currentWorkerCount + i}`;
      this.workers.set(workerId, {
        id: workerId,
        tasksProcessed: 0,
        totalProcessingTime: 0,
        errors: 0,
        isActive: false,
        lastTaskTime: 0,
      });
    }
  }

  // Health check
  isHealthy(): boolean {
    const stats = this.getStats();
    const errorRate = stats.totalProcessed > 0 ? stats.totalErrors / stats.totalProcessed : 0;
    
    return errorRate < 0.1 && // Less than 10% error rate
           stats.queueSize < 100 && // Queue not too large
           stats.averageProcessingTime < 10000; // Tasks complete within 10 seconds on average
  }
}