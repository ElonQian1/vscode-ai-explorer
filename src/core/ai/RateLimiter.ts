/**
 * 简单的速率限制器
 * 用于控制API调用频率，避免触发429错误
 */

export class RateLimiter {
    private lastCallTime = 0;
    private callCount = 0;
    private windowStart = 0;
    
    constructor(
        private maxCallsPerWindow: number = 10,
        private windowSizeMs: number = 60000, // 1分钟
        private minIntervalMs: number = 1000    // 最小调用间隔1秒
    ) {}

    async waitIfNeeded(): Promise<void> {
        const now = Date.now();
        
        // 重置窗口计数器
        if (now - this.windowStart > this.windowSizeMs) {
            this.windowStart = now;
            this.callCount = 0;
        }
        
        // 检查是否达到窗口限制
        if (this.callCount >= this.maxCallsPerWindow) {
            const waitTime = this.windowSizeMs - (now - this.windowStart);
            if (waitTime > 0) {
                console.log(`🕐 API速率限制：需要等待 ${Math.ceil(waitTime / 1000)} 秒`);
                await this.delay(waitTime);
                this.windowStart = Date.now();
                this.callCount = 0;
            }
        }
        
        // 检查最小间隔
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.minIntervalMs) {
            const waitTime = this.minIntervalMs - timeSinceLastCall;
            console.log(`⏳ API调用间隔限制：等待 ${waitTime}ms`);
            await this.delay(waitTime);
        }
        
        this.lastCallTime = Date.now();
        this.callCount++;
    }
    
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 重置限制器状态
     */
    reset(): void {
        this.lastCallTime = 0;
        this.callCount = 0;
        this.windowStart = 0;
    }
}