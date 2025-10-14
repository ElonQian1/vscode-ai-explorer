// src/features/explorer-alias/app/usecases/EnhancedTranslateBatchUseCase.ts
// [module: explorer-alias] [tags: UseCase, Translation, Dictionary, AI, Smart]
/**
 * 增强批量翻译用例
 * 智能翻译链路：词典优先 → 智能规则 → AI 翻译 → 学习词典更新
 */

import { Logger } from '../../../../core/logging/Logger';
import { MultiProviderAIClient } from '../../../../core/ai/MultiProviderAIClient';
import { KVCache } from '../../../../core/cache/KVCache';
import { DictionaryManager } from '../../core/DictionaryManager';
import { SmartRuleEngine } from '../../domain/policies/SmartRuleEngine';
import { FileNode, TranslationResult } from '../../../../shared/types';

interface TranslationStats {
    totalFiles: number;
    dictionaryHits: number;
    ruleHits: number;
    aiTranslations: number;
    cached: number;
    failed: number;
    processingTime: number;
}

export class EnhancedTranslateBatchUseCase {
    private readonly MODULE_ID = 'enhanced-translation';
    private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7天
    private readonly smartRuleEngine: SmartRuleEngine;

    constructor(
        private logger: Logger,
        private aiClient: MultiProviderAIClient,
        private cache: KVCache,
        private dictionary: DictionaryManager
    ) {
        this.smartRuleEngine = new SmartRuleEngine();
    }

    /**
     * 智能批量翻译文件
     */
    async translateFiles(files: FileNode[], options?: {
        forceRefresh?: boolean;
        enableLearning?: boolean;
        batchSize?: number;
    }): Promise<Map<FileNode, TranslationResult>> {
        const startTime = Date.now();
        const stats: TranslationStats = {
            totalFiles: files.length,
            dictionaryHits: 0,
            ruleHits: 0,
            aiTranslations: 0,
            cached: 0,
            failed: 0,
            processingTime: 0
        };

        this.logger.info(`开始智能批量翻译 ${files.length} 个文件`);
        
        const results = new Map<FileNode, TranslationResult>();
        const needsAITranslation: FileNode[] = [];

        // 第一阶段：缓存和词典查找
        for (const file of files) {
            try {
                // 1. 检查缓存（除非强制刷新）
                if (!options?.forceRefresh) {
                    const cached = await this.getCachedTranslation(file.name);
                    if (cached) {
                        results.set(file, cached);
                        stats.cached++;
                        continue;
                    }
                }

                // 2. 词典查找（优先级最高）
                const dictionaryResult = this.dictionary.translate(file.name);
                if (dictionaryResult) {
                    const result: TranslationResult = {
                        original: file.name,
                        translated: dictionaryResult,
                        confidence: 1.0,
                        source: 'dictionary',
                        timestamp: Date.now()
                    };
                    
                    results.set(file, result);
                    await this.cacheTranslation(file.name, result);
                    stats.dictionaryHits++;
                    continue;
                }

                // 3. 智能规则引擎（新增：支持中文语序重组）
                const smartRuleResult = this.smartRuleEngine.translate(file.name);
                if (smartRuleResult && smartRuleResult.confidence >= 0.6) {
                    const result: TranslationResult = {
                        original: file.name,
                        translated: smartRuleResult.alias,
                        confidence: smartRuleResult.confidence,
                        source: 'rule',
                        timestamp: Date.now()
                    };
                    
                    results.set(file, result);
                    await this.cacheTranslation(file.name, result);
                    stats.ruleHits++;
                    
                    // 调试信息
                    if (smartRuleResult.debug) {
                        this.logger.debug(`智能规则匹配: ${file.name} -> ${smartRuleResult.alias} (${smartRuleResult.debug})`);
                    }
                    
                    continue;
                }

                // 4. 需要 AI 翻译
                needsAITranslation.push(file);
            } catch (error) {
                this.logger.warn(`处理文件失败: ${file.name}`, error);
                stats.failed++;
            }
        }

        // 第二阶段：AI 批量翻译
        if (needsAITranslation.length > 0) {
            await this.processAITranslations(needsAITranslation, results, stats, options);
        }

        // 统计和日志
        stats.processingTime = Date.now() - startTime;
        this.logTranslationStats(stats);

        return results;
    }

    /**
     * 翻译单个文件名
     */
    async translateSingle(fileName: string, options?: {
        forceRefresh?: boolean;
        enableLearning?: boolean;
    }): Promise<TranslationResult> {
        const fileNode: FileNode = {
            name: fileName,
            path: fileName,
            type: 'file'
        };

        const results = await this.translateFiles([fileNode], options);
        const result = results.get(fileNode);
        
        if (!result) {
            throw new Error(`翻译失败: ${fileName}`);
        }

        return result;
    }

    /**
     * 获取翻译统计信息
     */
    async getTranslationStats(): Promise<{
        cacheStats: any;
        dictionaryStats: any;
        aiStats: any;
    }> {
        return {
            cacheStats: await this.cache.getStats(),
            dictionaryStats: this.dictionary.getStats(),
            aiStats: this.aiClient.getProviderStatus()
        };
    }

    private async processAITranslations(
        files: FileNode[],
        results: Map<FileNode, TranslationResult>,
        stats: TranslationStats,
        options?: any
    ): Promise<void> {
        const batchSize = options?.batchSize || 20;
        const fileNames = files.map(f => f.name);

        try {
            this.logger.info(`开始 AI 翻译 ${files.length} 个文件`);
            
            // 批量调用 AI
            const aiResults = await this.aiClient.translateBatch(fileNames);
            
            // 处理结果
            for (const file of files) {
                const translated = aiResults.get(file.name);
                
                if (translated && translated !== file.name) {
                    // AI 翻译成功且有变化
                    const result: TranslationResult = {
                        original: file.name,
                        translated,
                        confidence: 0.9,
                        source: 'ai',
                        timestamp: Date.now()
                    };

                    results.set(file, result);
                    await this.cacheTranslation(file.name, result);
                    
                    // 学习词典更新
                    if (options?.enableLearning !== false) {
                        await this.dictionary.addLearnedEntry(file.name, translated, 'learned');
                    }
                    
                    stats.aiTranslations++;
                    this.logger.info(`AI 翻译成功: ${file.name} -> ${translated}`);
                } else {
                    // AI 翻译失败或返回原名
                    this.logger.warn(`AI 翻译失败或无变化: ${file.name}, 返回值: ${translated || 'undefined'}`);
                    const result: TranslationResult = {
                        original: file.name,
                        translated: file.name,
                        confidence: 0.0,
                        source: 'fallback',
                        timestamp: Date.now()
                    };
                    
                    results.set(file, result);
                    stats.failed++;
                }
            }
        } catch (error) {
            this.logger.error('AI 批量翻译失败', error);
            
            // 降级处理：返回原文件名
            for (const file of files) {
                if (!results.has(file)) {
                    const result: TranslationResult = {
                        original: file.name,
                        translated: file.name,
                        confidence: 0.0,
                        source: 'error',
                        timestamp: Date.now()
                    };
                    
                    results.set(file, result);
                    stats.failed++;
                }
            }
        }
    }

    private async getCachedTranslation(fileName: string): Promise<TranslationResult | null> {
        const cacheKey = `${this.MODULE_ID}:${fileName}`;
        const cached = await this.cache.get<TranslationResult>(cacheKey);
        
        if (cached) {
            // 检查缓存是否过期
            if (cached.timestamp) {
                const age = Date.now() - cached.timestamp;
                if (age < this.CACHE_TTL) {
                    return cached;
                } else {
                    // 清理过期缓存
                    await this.cache.delete(cacheKey);
                }
            } else {
                // 没有时间戳的缓存也返回
                return cached;
            }
        }
        
        return null;
    }

    private async cacheTranslation(fileName: string, result: TranslationResult): Promise<void> {
        const cacheKey = `${this.MODULE_ID}:${fileName}`;
        await this.cache.set(cacheKey, result, this.CACHE_TTL);
    }

    private applyTranslationRules(fileName: string): string | null {
        // 规则1：文件扩展名保持不变
        const match = fileName.match(/^(.+)(\.[^.]+)$/);
        if (match) {
            const [, baseName, extension] = match;
            const translatedBase = this.translateBaseName(baseName);
            if (translatedBase && translatedBase !== baseName) {
                return translatedBase + extension;
            }
        }

        // 规则2：驼峰命名拆分
        const camelCaseResult = this.translateCamelCase(fileName);
        if (camelCaseResult) {
            return camelCaseResult;
        }

        // 规则3：下划线连接
        if (fileName.includes('_')) {
            const parts = fileName.split('_');
            const translatedParts = parts.map(part => 
                this.dictionary.translate(part) || part
            );
            
            if (translatedParts.some((part, index) => part !== parts[index])) {
                return translatedParts.join('_');
            }
        }

        // 规则4：连字符连接
        if (fileName.includes('-')) {
            const parts = fileName.split('-');
            const translatedParts = parts.map(part => 
                this.dictionary.translate(part) || part
            );
            
            if (translatedParts.some((part, index) => part !== parts[index])) {
                return translatedParts.join('-');
            }
        }

        return null;
    }

    private translateBaseName(baseName: string): string | null {
        // 尝试直接翻译
        const direct = this.dictionary.translate(baseName);
        if (direct) {
            return direct;
        }

        // 尝试小写翻译
        const lower = this.dictionary.translate(baseName.toLowerCase());
        if (lower) {
            return lower;
        }

        return null;
    }

    private translateCamelCase(fileName: string): string | null {
        // 检查是否是驼峰命名
        if (!/[a-z][A-Z]/.test(fileName)) {
            return null;
        }

        // 拆分驼峰命名
        const parts = fileName.replace(/([A-Z])/g, ' $1').trim().split(' ');
        const translatedParts: string[] = [];
        let hasTranslation = false;

        for (const part of parts) {
            const translated = this.dictionary.translate(part.toLowerCase());
            if (translated) {
                translatedParts.push(translated);
                hasTranslation = true;
            } else {
                translatedParts.push(part);
            }
        }

        return hasTranslation ? translatedParts.join('') : null;
    }

    private logTranslationStats(stats: TranslationStats): void {
        const hitRate = ((stats.dictionaryHits + stats.ruleHits + stats.cached) / stats.totalFiles * 100).toFixed(1);
        
        this.logger.info(`翻译完成 - 总计: ${stats.totalFiles}, ` +
            `缓存: ${stats.cached}, 词典: ${stats.dictionaryHits}, ` +
            `规则: ${stats.ruleHits}, AI: ${stats.aiTranslations}, ` +
            `失败: ${stats.failed}, 命中率: ${hitRate}%, ` +
            `耗时: ${stats.processingTime}ms`);
    }
}