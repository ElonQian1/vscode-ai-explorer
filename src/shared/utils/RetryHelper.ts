// src/shared/utils/RetryHelper.ts
/**
 * 重试助手
 * 用于处理短暂错误（如 429 限流、网络超时）的自动重试
 * 
 * 使用示例：
 * ```typescript
 * const result = await RetryHelper.withRetry(
 *     async () => await apiCall(),
 *     { retryTimes: 3, backoffMs: 300 }
 * );
 * ```
 */

export interface RetryOptions {
    /** 重试次数（默认 1） */
    retryTimes?: number;
    /** 初始退避时间（毫秒，默认 300） */
    backoffMs?: number;
    /** 退避时间增长系数（默认 1.5，即 300 -> 450 -> 675） */
    backoffMultiplier?: number;
    /** 哪些错误需要重试（默认：429/超时/网络错误） */
    shouldRetry?: (error: any) => boolean;
    /** 重试前的回调（可用于日志记录） */
    onRetry?: (error: any, attempt: number) => void;
}

export class RetryHelper {
    /**
     * 执行带重试的异步操作
     */
    static async withRetry<T>(
        operation: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<T> {
        const {
            retryTimes = 1,
            backoffMs = 300,
            backoffMultiplier = 1.5,
            shouldRetry = RetryHelper.defaultShouldRetry,
            onRetry
        } = options;

        let lastError: any;
        
        for (let attempt = 0; attempt <= retryTimes; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // 最后一次尝试失败，直接抛出
                if (attempt >= retryTimes) {
                    throw error;
                }
                
                // 检查是否需要重试
                if (!shouldRetry(error)) {
                    throw error;
                }
                
                // 计算退避时间（指数退避）
                const delayMs = backoffMs * Math.pow(backoffMultiplier, attempt);
                
                // 通知重试
                if (onRetry) {
                    onRetry(error, attempt + 1);
                }
                
                // 等待后重试
                await this.sleep(delayMs);
            }
        }
        
        throw lastError;
    }

    /**
     * 默认的重试判断逻辑
     * 对以下情况进行重试：
     * - HTTP 429 (Too Many Requests)
     * - HTTP 503 (Service Unavailable)
     * - 超时错误
     * - 网络错误
     */
    static defaultShouldRetry(error: any): boolean {
        // HTTP 状态码判断
        if (error?.response?.status === 429) return true;  // 限流
        if (error?.response?.status === 503) return true;  // 服务不可用
        
        // 错误消息判断
        const message = error?.message?.toLowerCase() || '';
        if (message.includes('timeout')) return true;      // 超时
        if (message.includes('econnreset')) return true;   // 连接重置
        if (message.includes('enotfound')) return true;    // DNS 查找失败
        if (message.includes('enetunreach')) return true;  // 网络不可达
        
        return false;
    }

    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
