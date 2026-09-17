export type FrameTask = () => boolean | void;

export class FrameBudgetQueue {
  private static instance: FrameBudgetQueue | null = null;
  private queue: Array<{ id: string; task: FrameTask; priority: number }> = [];
  public defaultBudgetMs = 3.0;

  public static getInstance(): FrameBudgetQueue {
    if (!FrameBudgetQueue.instance) {
      FrameBudgetQueue.instance = new FrameBudgetQueue();
    }
    return FrameBudgetQueue.instance;
  }

  public enqueue(id: string, task: FrameTask, priority = 0): void {
    // Avoid duplicate queueing with same ID
    if (this.queue.some((item) => item.id === id)) {
      return;
    }
    this.queue.push({ id, task, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  public cancel(id: string): void {
    this.queue = this.queue.filter((item) => item.id !== id);
  }

  public clear(): void {
    this.queue = [];
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Processes tasks until frame budget is exhausted or queue is empty.
   */
  public process(budgetMs = this.defaultBudgetMs): number {
    if (this.queue.length === 0) return 0;

    const start = performance.now();
    let executedCount = 0;

    while (this.queue.length > 0 && performance.now() - start < budgetMs) {
      const item = this.queue[0];
      const hasMore = item.task();
      executedCount++;

      if (!hasMore) {
        this.queue.shift();
      } else {
        // If task still has more work, keep it at head or cycle
        break;
      }
    }

    return executedCount;
  }
}
