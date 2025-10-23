import { AnalysisResult } from '../AnalysisOrchestrator';
/**
 * 🗄️ 分析缓存系统 - 支持JSONL持久化存储
 *
 * 特性：
 * - JSONL格式便于查看和调试
 * - 基于文件哈希的失效检测
 * - TTL过期机制
 * - 版本管理支持批量失效
 */
export declare class AnalysisCache {
    private memoryCache;
    private cacheDir;
    private cacheFile;
    private maxMemoryEntries;
    private defaultTtlHours;
    constructor(workspaceRoot: string);
    /**
     * 📥 获取缓存结果
     */
    get(filePath: string): Promise<AnalysisResult | null>;
    /**
     * 💾 设置缓存结果
     */
    set(result: AnalysisResult, ttlHours?: number): Promise<void>;
    /**
     * 🗑️ 删除缓存项
     */
    delete(filePath: string): Promise<void>;
    /**
     * 🧹 清理过期缓存
     */
    cleanup(): Promise<void>;
    /**
     * 🔄 清空所有缓存
     */
    clear(): Promise<void>;
    /**
     * 📊 获取缓存统计
     */
    getStats(): Promise<{
        total: number;
        heuristic: number;
        ast: number;
        llm: number;
    }>;
    /**
     * 💾 立即保存到磁盘
     */
    saveToDisk(): Promise<void>;
    /**
     * 📥 从磁盘加载缓存
     */
    private loadFromDisk;
    /**
     * 🔄 异步保存到磁盘（防抖）
     */
    private saveToDiskAsync;
    /**
     * 🔑 生成缓存键
     */
    private getKey;
    /**
     * 🔐 计算文件哈希
     */
    private getFileHash;
    /**
     * ⏱️ 防抖函数
     */
    private debounce;
    /**
     * 📤 导出缓存数据（供调试使用）
     */
    exportCache(): Promise<Record<string, AnalysisResult>>;
    /**
     * 📊 获取缓存大小信息
     */
    getCacheInfo(): {
        memoryEntries: number;
        estimatedSizeKB: number;
        cacheFile: string;
    };
}
