// src/shared/utils/ConcurrencyPool.ts
/**
 * 并发控制池
 * 用于控制异步任务的最大并发数，避免同时发起过多请求导致 API 限流或资源耗尽
 * 
 * 使用示例：
 * ```typescript
 * const pool = new ConcurrencyPool(6); // 最大 6 个并发
 * 
 * for (const item of items) {
 *     pool.run(async () => {
 *         await processItem(item);
 *     });
 * }
 * 
 * await pool.drain(); // 等待所有任务完成
 * ```
 */

export class ConcurrencyPool {
    private active = 0;  // 当前正在执行的任务数
    private queue: Array<() => Promise<void>> = [];  // 待执行任务队列

    /**
     * @param maxConcurrency 最大并发数（默认 6）
     */
    constructor(private maxConcurrency: number = 6) {
        if (maxConcurrency < 1) {
            throw new Error('maxConcurrency 必须大于 0');
        }
    }

    /**
     * 添加任务到队列
     * 如果当前并发数未达上限，立即执行；否则加入队列等待
     */
    run(task: () => Promise<void>): void {
        this.queue.push(task);
        this.pump();
    }

    /**
     * 泵送任务：从队列中取任务执行
     */
    private pump(): void {
        // 只要有空闲槽位且队列中有任务，就执行
        while (this.active < this.maxConcurrency && this.queue.length > 0) {
            const task = this.queue.shift()!;
            this.active++;
            
            // 执行任务，完成后释放槽位并继续泵送
            task().finally(() => {
                this.active--;
                this.pump();
            });
        }
    }

    /**
     * 等待所有任务完成
     * 当队列为空且没有正在执行的任务时返回
     */
    async drain(): Promise<void> {
        while (this.active > 0 || this.queue.length > 0) {
            await this.sleep(50);  // 轮询间隔 50ms
        }
    }

    /**
     * 获取当前状态
     */
    getStatus(): { active: number; queued: number; total: number } {
        return {
            active: this.active,
            queued: this.queue.length,
            total: this.active + this.queue.length
        };
    }

    /**
     * 清空队列（不影响正在执行的任务）
     */
    clear(): void {
        this.queue = [];
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
