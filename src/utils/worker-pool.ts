export interface WorkerTask<T = any> {
  id: string;
  type: string;
  data: T;
  priority: number;
  timeout?: number | undefined;
  retries?: number | undefined;
  createdAt: number;
}

export interface WorkerResult<R = any> {
  taskId: string;
  success: boolean;
  result?: R;
  error?: string;
  executionTime: number;
  workerId: string;
}

export interface WorkerStats {
  id: string;
  isActive: boolean;
  tasksCompleted: number;
  totalExecutionTime: number;
  lastTaskCompletedAt: number;
  errors: number;
}

export type TaskProcessor<T, R> = (data: T) => Promise<R>;

class Worker<T = any, R = any> {
  public readonly id: string;
  public isActive = false;
  public tasksCompleted = 0;
  public totalExecutionTime = 0;
  public lastTaskCompletedAt = 0;
  public errors = 0;
  private currentTask: WorkerTask<T> | null = null;

  constructor(id: string) {
    this.id = id;
  }

  async executeTask(
    task: WorkerTask<T>,
    processor: TaskProcessor<T, R>
  ): Promise<WorkerResult<R>> {
    this.isActive = true;
    this.currentTask = task;
    const startTime = Date.now();

    try {
      // Apply timeout if specified
      const result = task.timeout
        ? await this.withTimeout(processor(task.data), task.timeout)
        : await processor(task.data);

      const executionTime = Date.now() - startTime;
      this.tasksCompleted++;
      this.totalExecutionTime += executionTime;
      this.lastTaskCompletedAt = Date.now();

      return {
        taskId: task.id,
        success: true,
        result,
        executionTime,
        workerId: this.id,
      };
    } catch (error) {
      this.errors++;
      const executionTime = Date.now() - startTime;

      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        workerId: this.id,
      };
    } finally {
      this.isActive = false;
      this.currentTask = null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  getStats(): WorkerStats {
    return {
      id: this.id,
      isActive: this.isActive,
      tasksCompleted: this.tasksCompleted,
      totalExecutionTime: this.totalExecutionTime,
      lastTaskCompletedAt: this.lastTaskCompletedAt,
      errors: this.errors,
    };
  }

  getCurrentTask(): WorkerTask<T> | null {
    return this.currentTask;
  }
}

export class WorkerPool<T = any, R = any> {
  private workers: Worker<T, R>[] = [];
  private taskQueue: WorkerTask<T>[] = [];
  private processors: Map<string, TaskProcessor<T, R>> = new Map();
  private results: Map<string, WorkerResult<R>> = new Map();
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly maxQueueSize: number;
  private readonly processingIntervalMs = 10; // 10ms processing interval

  constructor(poolSize: number = 4, maxQueueSize: number = 1000) {
    this.maxQueueSize = maxQueueSize;
    
    // Create workers
    for (let i = 0; i < poolSize; i++) {
      this.workers.push(new Worker(`worker-${i}`));
    }
  }

  // Register a task processor
  registerProcessor(taskType: string, processor: TaskProcessor<T, R>): void {
    this.processors.set(taskType, processor);
  }

  // Start the worker pool
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.processingIntervalMs);

    console.log(`Worker pool started with ${this.workers.length} workers`);
  }

  // Stop the worker pool
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Wait for active tasks to complete
    await this.waitForActiveTasksToComplete();
    
    console.log('Worker pool stopped');
  }

  // Add a task to the queue
  addTask(
    type: string,
    data: T,
    priority: number = 0,
    timeout?: number,
    retries: number = 0
  ): string {
    if (this.taskQueue.length >= this.maxQueueSize) {
      throw new Error('Task queue is full');
    }

    if (!this.processors.has(type)) {
      throw new Error(`No processor registered for task type: ${type}`);
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const task: WorkerTask<T> = {
      id: taskId,
      type,
      data,
      priority,
      timeout,
      retries,
      createdAt: Date.now(),
    };

    // Insert task based on priority (higher priority first)
    const insertIndex = this.taskQueue.findIndex(t => t.priority < priority);
    if (insertIndex === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(insertIndex, 0, task);
    }

    return taskId;
  }

  // Execute a task and wait for result
  async executeTask(
    type: string,
    data: T,
    priority: number = 0,
    timeout?: number
  ): Promise<R> {
    const taskId = this.addTask(type, data, priority, timeout);
    return this.waitForResult(taskId);
  }

  // Execute multiple tasks in parallel
  async executeTasks(
    tasks: Array<{
      type: string;
      data: T;
      priority?: number;
      timeout?: number;
    }>
  ): Promise<R[]> {
    const taskIds = tasks.map(task =>
      this.addTask(task.type, task.data, task.priority || 0, task.timeout)
    );

    return Promise.all(taskIds.map(id => this.waitForResult(id)));
  }

  // Wait for a specific task result
  private async waitForResult(taskId: string): Promise<R> {
    return new Promise((resolve, reject) => {
      const checkResult = () => {
        const result = this.results.get(taskId);
        if (result) {
          this.results.delete(taskId); // Clean up
          if (result.success) {
            resolve(result.result!);
          } else {
            reject(new Error(result.error));
          }
        } else {
          setTimeout(checkResult, 10);
        }
      };
      checkResult();
    });
  }

  // Process the task queue
  private async processQueue(): Promise<void> {
    if (this.taskQueue.length === 0) return;

    const availableWorkers = this.workers.filter(w => !w.isActive);
    if (availableWorkers.length === 0) return;

    const tasksToProcess = Math.min(availableWorkers.length, this.taskQueue.length);
    
    for (let i = 0; i < tasksToProcess; i++) {
      const task = this.taskQueue.shift();
      const worker = availableWorkers[i];
      
      if (!task || !worker) continue;
      
      const processor = this.processors.get(task.type);
      if (!processor) {
        console.error(`No processor found for task type: ${task.type}`);
        continue;
      }

      // Execute task asynchronously
      this.executeTaskWithWorker(worker, task, processor);
    }
  }

  private async executeTaskWithWorker(
    worker: Worker<T, R>,
    task: WorkerTask<T>,
    processor: TaskProcessor<T, R>
  ): Promise<void> {
    try {
      const result = await worker.executeTask(task, processor);
      this.results.set(task.id, result);

      // Retry on failure if retries available
      if (!result.success && task.retries && task.retries > 0) {
        const retryTask = { ...task, retries: task.retries - 1 };
        this.taskQueue.unshift(retryTask); // Add to front for immediate retry
      }
    } catch (error) {
      // This shouldn't happen as worker.executeTask catches errors
      console.error('Unexpected error in task execution:', error);
    }
  }

  // Wait for all active tasks to complete
  private async waitForActiveTasksToComplete(): Promise<void> {
    while (this.workers.some(w => w.isActive)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Get worker pool statistics
  getStats(): {
    workers: WorkerStats[];
    queueLength: number;
    totalTasksCompleted: number;
    averageExecutionTime: number;
    activeWorkers: number;
    successRate: number;
  } {
    const workerStats = this.workers.map(w => w.getStats());
    const totalTasksCompleted = workerStats.reduce((sum, w) => sum + w.tasksCompleted, 0);
    const totalExecutionTime = workerStats.reduce((sum, w) => sum + w.totalExecutionTime, 0);
    const totalErrors = workerStats.reduce((sum, w) => sum + w.errors, 0);
    const activeWorkers = workerStats.filter(w => w.isActive).length;

    return {
      workers: workerStats,
      queueLength: this.taskQueue.length,
      totalTasksCompleted,
      averageExecutionTime: totalTasksCompleted > 0 ? totalExecutionTime / totalTasksCompleted : 0,
      activeWorkers,
      successRate: totalTasksCompleted > 0 ? 
        (totalTasksCompleted - totalErrors) / totalTasksCompleted : 0,
    };
  }

  // Get queue status
  getQueueStatus(): {
    length: number;
    maxSize: number;
    utilizationPercent: number;
    oldestTaskAge: number;
  } {
    const oldestTask = this.taskQueue.length > 0 ? this.taskQueue[this.taskQueue.length - 1] : null;
    
    return {
      length: this.taskQueue.length,
      maxSize: this.maxQueueSize,
      utilizationPercent: (this.taskQueue.length / this.maxQueueSize) * 100,
      oldestTaskAge: oldestTask ? Date.now() - oldestTask.createdAt : 0,
    };
  }

  // Clear completed results to prevent memory leaks
  clearCompletedResults(): void {
    this.results.clear();
  }

  // Get pending tasks count by type
  getPendingTasksByType(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const task of this.taskQueue) {
      counts.set(task.type, (counts.get(task.type) || 0) + 1);
    }
    return counts;
  }
}