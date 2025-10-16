// src/features/file-analysis/BatchAnalyzer.ts
// [module: file-analysis] [tags: Performance, Batch]
/**
 * 批量文件分析器
 * 
 * 🔥 Phase 5: 性能优化
 * 
 * 功能：
 * - 并发控制（避免过载）
 * - 进度回调（用户反馈）
 * - 错误隔离（单个文件失败不影响其他）
 * - 缓存优化（优先使用缓存）
 */

import { Logger } from '../../core/logging/Logger';
import { FileAnalysisService } from './FileAnalysisService';
import { FileCapsule } from './types';
import { ConcurrencyPool } from '../../shared/utils/ConcurrencyPool';

export interface BatchProgress {
    current: number;
    total: number;
    currentFile: string;
    completed: string[];
    failed: string[];
}

export interface BatchResult {
    capsules: FileCapsule[];
    failed: Array<{ file: string; error: any }>;
    stats: {
        total: number;
        succeeded: number;
        failed: number;
        duration: number;
    };
}

export class BatchAnalyzer {
    constructor(
        private fileAnalysisService: FileAnalysisService,
        private logger: Logger,
        private concurrency: number = 5
    ) {}

    /**
     * 批量分析文件（仅静态分析）
     * 
     * @param filePaths - 文件绝对路径列表
     * @param onProgress - 进度回调
     * @returns 批量分析结果
     */
    async analyzeFiles(
        filePaths: string[],
        onProgress?: (progress: BatchProgress) => void
    ): Promise<BatchResult> {
        const startTime = Date.now();
        const capsules: FileCapsule[] = [];
        const failed: Array<{ file: string; error: any }> = [];
        const completed: string[] = [];

        this.logger.info(`[BatchAnalyzer] 开始批量分析: ${filePaths.length} 个文件, 并发数=${this.concurrency}`);

        // 创建并发池
        const pool = new ConcurrencyPool(this.concurrency);

        // 添加所有任务
        for (const filePath of filePaths) {
            pool.run(async () => {
                try {
                    // 静态分析（会自动检查缓存）
                    const capsule = await this.fileAnalysisService.analyzeFileStatic(filePath);
                    capsules.push(capsule);
                    completed.push(filePath);

                    // 进度回调
                    if (onProgress) {
                        onProgress({
                            current: completed.length + failed.length,
                            total: filePaths.length,
                            currentFile: filePath,
                            completed,
                            failed: failed.map(f => f.file)
                        });
                    }
                } catch (error) {
                    this.logger.warn(`[BatchAnalyzer] 文件分析失败: ${filePath}`, error);
                    failed.push({ file: filePath, error });
                }
            });
        }

        // 等待所有任务完成
        await pool.drain();

        const duration = Date.now() - startTime;
        const stats = {
            total: filePaths.length,
            succeeded: capsules.length,
            failed: failed.length,
            duration
        };

        this.logger.info(
            `[BatchAnalyzer] 批量分析完成: ` +
            `成功=${stats.succeeded}, 失败=${stats.failed}, 耗时=${duration}ms`
        );

        return { capsules, failed, stats };
    }

    /**
     * 批量 AI 增强
     * 
     * @param capsules - 静态分析结果列表
     * @param onProgress - 进度回调
     * @returns 批量增强结果
     */
    async enhanceBatch(
        capsules: FileCapsule[],
        onProgress?: (progress: BatchProgress) => void
    ): Promise<BatchResult> {
        const startTime = Date.now();
        const enhancedCapsules: FileCapsule[] = [];
        const failed: Array<{ file: string; error: any }> = [];
        const completed: string[] = [];

        this.logger.info(`[BatchAnalyzer] 开始批量AI增强: ${capsules.length} 个文件`);

        // 创建并发池（AI 请求限制并发数更小）
        const pool = new ConcurrencyPool(Math.min(this.concurrency, 3));

        // 添加所有任务
        for (const capsule of capsules) {
            pool.run(async () => {
                try {
                    // AI 增强（会自动重试和降级）
                    const enhanced = await this.fileAnalysisService.enhanceWithAI(capsule);
                    enhancedCapsules.push(enhanced);
                    completed.push(capsule.file);

                    // 进度回调
                    if (onProgress) {
                        onProgress({
                            current: completed.length + failed.length,
                            total: capsules.length,
                            currentFile: capsule.file,
                            completed,
                            failed: failed.map(f => f.file)
                        });
                    }
                } catch (error) {
                    this.logger.warn(`[BatchAnalyzer] AI增强失败: ${capsule.file}`, error);
                    failed.push({ file: capsule.file, error });
                }
            });
        }

        // 等待所有任务完成
        await pool.drain();

        const duration = Date.now() - startTime;
        const stats = {
            total: capsules.length,
            succeeded: enhancedCapsules.length,
            failed: failed.length,
            duration
        };

        this.logger.info(
            `[BatchAnalyzer] 批量AI增强完成: ` +
            `成功=${stats.succeeded}, 失败=${stats.failed}, 耗时=${duration}ms`
        );

        return { capsules: enhancedCapsules, failed, stats };
    }

    /**
     * 批量分析并增强（一站式）
     * 
     * @param filePaths - 文件绝对路径列表
     * @param onProgress - 进度回调
     * @returns 批量分析结果
     */
    async analyzeAndEnhance(
        filePaths: string[],
        onProgress?: (progress: BatchProgress) => void
    ): Promise<BatchResult> {
        this.logger.info(`[BatchAnalyzer] 开始批量分析并增强: ${filePaths.length} 个文件`);

        // 阶段 1: 静态分析
        const staticResult = await this.analyzeFiles(filePaths, (progress) => {
            if (onProgress) {
                onProgress({
                    ...progress,
                    currentFile: `[静态分析] ${progress.currentFile}`
                });
            }
        });

        // 阶段 2: AI 增强
        const enhancedResult = await this.enhanceBatch(staticResult.capsules, (progress) => {
            if (onProgress) {
                onProgress({
                    ...progress,
                    currentFile: `[AI增强] ${progress.currentFile}`
                });
            }
        });

        return {
            capsules: enhancedResult.capsules,
            failed: [...staticResult.failed, ...enhancedResult.failed],
            stats: {
                total: filePaths.length,
                succeeded: enhancedResult.capsules.length,
                failed: staticResult.failed.length + enhancedResult.failed.length,
                duration: staticResult.stats.duration + enhancedResult.stats.duration
            }
        };
    }

    /**
     * 获取批量分析的最佳并发数
     * 基于系统资源和任务类型动态调整
     */
    static getOptimalConcurrency(taskType: 'static' | 'ai'): number {
        // 静态分析：CPU 密集型，使用较高并发
        if (taskType === 'static') {
            return Math.max(5, Math.floor(require('os').cpus().length / 2));
        }

        // AI 分析：网络 I/O，限制并发避免限流
        return 3;
    }
}
