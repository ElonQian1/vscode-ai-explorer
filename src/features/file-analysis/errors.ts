// src/features/file-analysis/errors.ts
// [module: file-analysis] [tags: Error, Recovery]
/**
 * 文件分析错误类型定义
 * 提供结构化的错误处理和分类
 */

/**
 * 错误严重性级别
 */
export enum ErrorSeverity {
    /** 信息级别（如缓存未命中） */
    INFO = 'info',
    /** 警告级别（如 AI 分析失败，但有降级方案） */
    WARN = 'warn',
    /** 错误级别（如文件读取失败） */
    ERROR = 'error',
    /** 致命错误（系统崩溃） */
    FATAL = 'fatal'
}

/**
 * 错误代码
 */
export enum ErrorCode {
    // 文件系统错误
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    FILE_READ_ERROR = 'FILE_READ_ERROR',
    FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
    
    // 解析错误
    PARSE_ERROR = 'PARSE_ERROR',
    SYNTAX_ERROR = 'SYNTAX_ERROR',
    
    // AI 分析错误
    AI_CLIENT_INIT_FAILED = 'AI_CLIENT_INIT_FAILED',
    AI_REQUEST_FAILED = 'AI_REQUEST_FAILED',
    AI_TIMEOUT = 'AI_TIMEOUT',
    AI_RATE_LIMIT = 'AI_RATE_LIMIT',
    AI_AUTH_FAILED = 'AI_AUTH_FAILED',
    AI_INVALID_RESPONSE = 'AI_INVALID_RESPONSE',
    
    // 缓存错误
    CACHE_READ_ERROR = 'CACHE_READ_ERROR',
    CACHE_WRITE_ERROR = 'CACHE_WRITE_ERROR',
    
    // 网络错误
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    
    // 配置错误
    CONFIG_ERROR = 'CONFIG_ERROR',
    
    // 未知错误
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 文件分析错误类
 * 
 * 提供结构化的错误信息，包括：
 * - 错误代码（便于程序判断）
 * - 错误严重性（便于日志记录）
 * - 上下文信息（便于调试）
 * - 可重试判断
 * - 降级需求判断
 */
export class AnalysisError extends Error {
    constructor(
        message: string,
        public code: ErrorCode,
        public severity: ErrorSeverity,
        public context: Record<string, any> = {}
    ) {
        super(message);
        this.name = 'AnalysisError';
        
        // 保持正确的堆栈跟踪
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AnalysisError);
        }
    }

    /**
     * 判断错误是否可重试
     * 
     * 可重试的错误类型：
     * - 网络错误
     * - 超时错误
     * - AI 请求失败（非认证错误）
     * - 限流错误
     */
    isRetryable(): boolean {
        const retryableCodes = [
            ErrorCode.AI_REQUEST_FAILED,
            ErrorCode.AI_TIMEOUT,
            ErrorCode.AI_RATE_LIMIT,
            ErrorCode.NETWORK_ERROR,
            ErrorCode.TIMEOUT_ERROR
        ];
        
        return retryableCodes.includes(this.code);
    }

    /**
     * 判断错误是否需要降级处理
     * 
     * 需要降级的错误：
     * - 警告级别的错误
     * - AI 分析失败（但静态分析成功）
     */
    needsDegradation(): boolean {
        return this.severity === ErrorSeverity.WARN || 
               this.code === ErrorCode.AI_REQUEST_FAILED ||
               this.code === ErrorCode.AI_TIMEOUT ||
               this.code === ErrorCode.AI_RATE_LIMIT;
    }

    /**
     * 判断错误是否需要用户干预
     * 
     * 需要用户干预的错误：
     * - 认证失败（需要配置 API Key）
     * - 配置错误（需要修复配置）
     */
    needsUserAction(): boolean {
        const userActionCodes = [
            ErrorCode.AI_AUTH_FAILED,
            ErrorCode.CONFIG_ERROR
        ];
        
        return userActionCodes.includes(this.code);
    }

    /**
     * 格式化为日志消息
     */
    toLogMessage(): string {
        const contextStr = Object.keys(this.context).length > 0
            ? ` | Context: ${JSON.stringify(this.context)}`
            : '';
        
        return `[${this.severity.toUpperCase()}] ${this.code}: ${this.message}${contextStr}`;
    }

    /**
     * 格式化为用户友好的消息
     */
    toUserMessage(): string {
        switch (this.code) {
            case ErrorCode.FILE_NOT_FOUND:
                return `文件未找到：${this.context.file || '未知文件'}`;
            
            case ErrorCode.AI_TIMEOUT:
                return 'AI 分析超时，已显示基础分析结果。\n建议：检查网络连接或稍后重试。';
            
            case ErrorCode.AI_RATE_LIMIT:
                return 'AI 服务限流，已显示基础分析结果。\n建议：等待几分钟后重试。';
            
            case ErrorCode.AI_AUTH_FAILED:
                return 'AI 服务认证失败。\n请检查 API Key 配置是否正确。';
            
            case ErrorCode.NETWORK_ERROR:
                return '网络连接失败。\n请检查网络连接后重试。';
            
            default:
                return this.message;
        }
    }

    /**
     * 获取用户操作建议
     */
    getUserActions(): string[] {
        const actions: string[] = [];
        
        switch (this.code) {
            case ErrorCode.AI_AUTH_FAILED:
                actions.push('打开设置');
                actions.push('配置 API Key');
                break;
            
            case ErrorCode.AI_TIMEOUT:
            case ErrorCode.AI_REQUEST_FAILED:
                actions.push('重试');
                actions.push('查看日志');
                break;
            
            case ErrorCode.NETWORK_ERROR:
                actions.push('检查网络');
                actions.push('重试');
                break;
            
            default:
                actions.push('查看日志');
                break;
        }
        
        return actions;
    }

    /**
     * 从原生错误创建 AnalysisError
     */
    static fromError(error: any, defaultCode = ErrorCode.UNKNOWN_ERROR): AnalysisError {
        // 已经是 AnalysisError
        if (error instanceof AnalysisError) {
            return error;
        }

        // 网络错误
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return new AnalysisError(
                error.message,
                ErrorCode.NETWORK_ERROR,
                ErrorSeverity.WARN,
                { originalCode: error.code }
            );
        }

        // HTTP 错误
        if (error.response) {
            const status = error.response.status;
            
            if (status === 401 || status === 403) {
                return new AnalysisError(
                    'AI 服务认证失败',
                    ErrorCode.AI_AUTH_FAILED,
                    ErrorSeverity.ERROR,
                    { status, url: error.config?.url }
                );
            }
            
            if (status === 429) {
                return new AnalysisError(
                    'AI 服务限流',
                    ErrorCode.AI_RATE_LIMIT,
                    ErrorSeverity.WARN,
                    { status }
                );
            }
            
            if (status >= 500) {
                return new AnalysisError(
                    'AI 服务不可用',
                    ErrorCode.AI_REQUEST_FAILED,
                    ErrorSeverity.WARN,
                    { status }
                );
            }
        }

        // 文件系统错误
        if (error.code === 'FileNotFound' || error.name === 'EntryNotFound (FileSystemError)') {
            return new AnalysisError(
                error.message,
                ErrorCode.FILE_NOT_FOUND,
                ErrorSeverity.ERROR,
                { originalError: error.name }
            );
        }

        // 默认错误
        return new AnalysisError(
            error.message || 'Unknown error',
            defaultCode,
            ErrorSeverity.ERROR,
            { originalError: error.toString() }
        );
    }
}
