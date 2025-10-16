// src/features/file-analysis/CapsuleCache.ts
// [module: file-analysis] [tags: Cache, Performance]
/**
 * FileCapsule 缓存管理器
 * 
 * 实现两层缓存策略：
 * 1. 内存缓存：快速访问，进程内共享
 * 2. 磁盘缓存：持久化存储，跨会话
 * 
 * 缓存 key: contentHash (文件内容的 SHA-256)
 * 缓存失效：文件内容变化时 contentHash 改变，自动失效
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../../core/logging/Logger';
import { FileCapsule } from './types';

export interface CacheStats {
    memoryHits: number;
    diskHits: number;
    misses: number;
    writes: number;
}

export class CapsuleCache {
    private memoryCache: Map<string, FileCapsule> = new Map();
    private cacheDir: vscode.Uri | null = null;
    private logger: Logger;
    private stats: CacheStats = {
        memoryHits: 0,
        diskHits: 0,
        misses: 0,
        writes: 0
    };

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 初始化缓存目录
     */
    public async initialize(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.warn('[CapsuleCache] 无法初始化：未找到工作区');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri;
        this.cacheDir = vscode.Uri.joinPath(workspaceRoot, '.ai-explorer-cache', 'filecapsules');

        try {
            await vscode.workspace.fs.createDirectory(this.cacheDir);
            this.logger.info(`[CapsuleCache] 初始化完成: ${this.cacheDir.fsPath}`);
        } catch (error) {
            this.logger.error('[CapsuleCache] 初始化失败', error);
        }
    }

    /**
     * 计算文件内容的哈希值
     */
    public static computeContentHash(content: string): string {
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    }

    /**
     * 从缓存中获取 FileCapsule
     * 
     * @param contentHash 文件内容哈希
     * @returns FileCapsule 或 null
     */
    public async get(contentHash: string): Promise<FileCapsule | null> {
        // 1. 尝试内存缓存
        const memoryResult = this.memoryCache.get(contentHash);
        if (memoryResult) {
            this.stats.memoryHits++;
            this.logger.info(`[CapsuleCache] 内存缓存命中: ${contentHash.slice(0, 8)}... (总命中: ${this.stats.memoryHits})`);
            return memoryResult;
        }

        // 2. 尝试磁盘缓存
        if (!this.cacheDir) {
            this.stats.misses++;
            return null;
        }

        try {
            const cacheFile = vscode.Uri.joinPath(this.cacheDir, `${contentHash}.json`);
            const content = await vscode.workspace.fs.readFile(cacheFile);
            const capsule: FileCapsule = JSON.parse(Buffer.from(content).toString('utf8'));

            // 写入内存缓存
            this.memoryCache.set(contentHash, capsule);
            this.stats.diskHits++;
            this.logger.info(`[CapsuleCache] 磁盘缓存命中: ${contentHash.slice(0, 8)}... (总命中: ${this.stats.diskHits})`);

            return capsule;
        } catch (error) {
            // 缓存未命中或读取失败
            this.stats.misses++;
            return null;
        }
    }

    /**
     * 将 FileCapsule 写入缓存
     * 
     * @param contentHash 文件内容哈希
     * @param capsule FileCapsule 对象
     */
    public async set(contentHash: string, capsule: FileCapsule): Promise<void> {
        // 1. 写入内存缓存
        this.memoryCache.set(contentHash, capsule);

        // 2. 写入磁盘缓存
        if (!this.cacheDir) {
            this.logger.warn('[CapsuleCache] 缓存目录未初始化，跳过磁盘写入');
            return;
        }

        try {
            const cacheFile = vscode.Uri.joinPath(this.cacheDir, `${contentHash}.json`);
            const content = Buffer.from(JSON.stringify(capsule, null, 2), 'utf8');
            await vscode.workspace.fs.writeFile(cacheFile, content);

            this.stats.writes++;
            this.logger.info(`[CapsuleCache] 写入缓存: ${contentHash.slice(0, 8)}... (总写入: ${this.stats.writes})`);
        } catch (error) {
            this.logger.error('[CapsuleCache] 写入缓存失败', error);
        }
    }

    /**
     * 清除所有缓存（内存 + 磁盘）
     */
    public async clear(): Promise<void> {
        // 清除内存缓存
        const memorySize = this.memoryCache.size;
        this.memoryCache.clear();
        this.logger.info(`[CapsuleCache] 清除内存缓存: ${memorySize} 项`);

        // 清除磁盘缓存
        if (!this.cacheDir) {
            return;
        }

        try {
            const files = await vscode.workspace.fs.readDirectory(this.cacheDir);
            let deletedCount = 0;

            for (const [fileName, fileType] of files) {
                if (fileType === vscode.FileType.File && fileName.endsWith('.json')) {
                    const fileUri = vscode.Uri.joinPath(this.cacheDir, fileName);
                    await vscode.workspace.fs.delete(fileUri);
                    deletedCount++;
                }
            }

            this.logger.info(`[CapsuleCache] 清除磁盘缓存: ${deletedCount} 个文件`);
        } catch (error) {
            this.logger.error('[CapsuleCache] 清除磁盘缓存失败', error);
        }

        // 重置统计
        this.stats = {
            memoryHits: 0,
            diskHits: 0,
            misses: 0,
            writes: 0
        };
    }

    /**
     * 获取缓存统计信息
     */
    public getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * 获取缓存命中率
     */
    public getHitRate(): number {
        const total = this.stats.memoryHits + this.stats.diskHits + this.stats.misses;
        if (total === 0) {
            return 0;
        }
        return ((this.stats.memoryHits + this.stats.diskHits) / total) * 100;
    }

    /**
     * 打印缓存统计信息
     */
    public logStats(): void {
        const hitRate = this.getHitRate().toFixed(2);
        this.logger.info(
            `[CapsuleCache] 统计: ` +
            `内存命中=${this.stats.memoryHits}, ` +
            `磁盘命中=${this.stats.diskHits}, ` +
            `未命中=${this.stats.misses}, ` +
            `写入=${this.stats.writes}, ` +
            `命中率=${hitRate}%`
        );
    }

    /**
     * 获取内存缓存大小
     */
    public getMemoryCacheSize(): number {
        return this.memoryCache.size;
    }

    /**
     * 删除特定文件的缓存
     */
    public async delete(contentHash: string): Promise<void> {
        // 删除内存缓存
        this.memoryCache.delete(contentHash);

        // 删除磁盘缓存
        if (!this.cacheDir) {
            return;
        }

        try {
            const cacheFile = vscode.Uri.joinPath(this.cacheDir, `${contentHash}.json`);
            await vscode.workspace.fs.delete(cacheFile);
            this.logger.info(`[CapsuleCache] 删除缓存: ${contentHash.slice(0, 8)}...`);
        } catch (error) {
            // 文件可能不存在，忽略错误
        }
    }
}
