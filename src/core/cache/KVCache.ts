// src/core/cache/KVCache.ts
// [module: core] [tags: Cache, Storage, TTL, Persistence]
/**
 * 键值缓存服务
 * 支持 TTL、持久化存储和模块隔离
 */

import * as vscode from 'vscode';
import { Logger } from '@core/logging/Logger';

interface CacheEntry<T> {
    value: T;
    expiry: number;
    createdAt: number;
    moduleId: string;
}

export class KVCache {
    private memoryCache = new Map<string, CacheEntry<any>>();
    private readonly cleanupInterval: NodeJS.Timeout;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private defaultTTL: number = 60 * 60 * 1000 // 1 小时默认 TTL
    ) {
        // 定期清理过期缓存
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000); // 每5分钟清理一次

        // 从持久存储加载缓存
        this.loadFromStorage();
    }

    /**
     * 设置缓存值
     */
    async set<T>(
        key: string, 
        value: T, 
        ttlMs?: number, 
        moduleId: string = 'default'
    ): Promise<void> {
        const fullKey = this.getFullKey(key, moduleId);
        const expiry = Date.now() + (ttlMs || this.defaultTTL);
        
        const entry: CacheEntry<T> = {
            value,
            expiry,
            createdAt: Date.now(),
            moduleId
        };

        // 内存缓存
        this.memoryCache.set(fullKey, entry);

        // 持久化缓存（仅对重要数据）
        if (ttlMs === undefined || ttlMs > 30 * 60 * 1000) { // > 30分钟的缓存才持久化
            await this.saveToStorage(fullKey, entry);
        }

        this.logger.debug(`缓存设置: ${fullKey}`, { moduleId, ttlMs });
    }

    /**
     * 获取缓存值
     */
    async get<T>(key: string, moduleId: string = 'default'): Promise<T | null> {
        const fullKey = this.getFullKey(key, moduleId);
        
        // 先查内存缓存
        let entry = this.memoryCache.get(fullKey);
        
        // 如果内存中没有，尝试从持久存储加载
        if (!entry) {
            const loadedEntry = await this.loadFromStorage(fullKey);
            if (loadedEntry) {
                entry = loadedEntry;
                this.memoryCache.set(fullKey, entry);
            }
        }

        if (!entry) {
            return null;
        }

        // 检查是否过期
        if (Date.now() > entry.expiry) {
            this.memoryCache.delete(fullKey);
            await this.removeFromStorage(fullKey);
            this.logger.debug(`缓存过期并删除: ${fullKey}`);
            return null;
        }

        this.logger.debug(`缓存命中: ${fullKey}`, { age: Date.now() - entry.createdAt });
        return entry.value as T;
    }

    /**
     * 删除缓存
     */
    async delete(key: string, moduleId: string = 'default'): Promise<void> {
        const fullKey = this.getFullKey(key, moduleId);
        this.memoryCache.delete(fullKey);
        await this.removeFromStorage(fullKey);
        this.logger.debug(`缓存删除: ${fullKey}`);
    }

    /**
     * 清空指定模块的缓存
     */
    async clearModule(moduleId: string): Promise<void> {
        const keysToDelete: string[] = [];
        
        this.memoryCache.forEach((entry, key) => {
            if (entry.moduleId === moduleId) {
                keysToDelete.push(key);
            }
        });

        for (const key of keysToDelete) {
            this.memoryCache.delete(key);
            await this.removeFromStorage(key);
        }

        this.logger.info(`已清空模块缓存: ${moduleId}`, { count: keysToDelete.length });
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): { total: number; byModule: Record<string, number> } {
        const stats = { total: 0, byModule: {} as Record<string, number> };
        
        this.memoryCache.forEach((entry) => {
            stats.total++;
            stats.byModule[entry.moduleId] = (stats.byModule[entry.moduleId] || 0) + 1;
        });

        return stats;
    }

    private getFullKey(key: string, moduleId: string): string {
        return `${moduleId}:${key}`;
    }

    private async saveToStorage<T>(key: string, entry: CacheEntry<T>): Promise<void> {
        try {
            const storageKey = `cache:${key}`;
            await this.context.globalState.update(storageKey, entry);
        } catch (error) {
            this.logger.warn(`缓存持久化失败: ${key}`, error);
        }
    }

    private async loadFromStorage(key?: string): Promise<CacheEntry<any> | null> {
        try {
            if (key) {
                const storageKey = `cache:${key}`;
                return this.context.globalState.get<CacheEntry<any>>(storageKey) || null;
            } else {
                // 加载所有缓存
                const keys = this.context.globalState.keys();
                for (const storageKey of keys) {
                    if (storageKey.startsWith('cache:')) {
                        const entry = this.context.globalState.get<CacheEntry<any>>(storageKey);
                        if (entry && Date.now() <= entry.expiry) {
                            const cacheKey = storageKey.replace('cache:', '');
                            this.memoryCache.set(cacheKey, entry);
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.warn('缓存加载失败', error);
        }
        return null;
    }

    private async removeFromStorage(key: string): Promise<void> {
        try {
            const storageKey = `cache:${key}`;
            await this.context.globalState.update(storageKey, undefined);
        } catch (error) {
            this.logger.warn(`缓存删除失败: ${key}`, error);
        }
    }

    private cleanup(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        this.memoryCache.forEach((entry, key) => {
            if (now > entry.expiry) {
                expiredKeys.push(key);
            }
        });

        expiredKeys.forEach(key => {
            this.memoryCache.delete(key);
            this.removeFromStorage(key); // 异步删除持久化数据
        });

        if (expiredKeys.length > 0) {
            this.logger.debug(`清理过期缓存: ${expiredKeys.length} 个`);
        }
    }

    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.memoryCache.clear();
    }
}