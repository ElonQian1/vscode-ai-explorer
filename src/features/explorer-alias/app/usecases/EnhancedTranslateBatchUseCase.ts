// src/features/explorer-alias/app/usecases/EnhancedTranslateBatchUseCase.ts
// [module: explorer-alias] [tags: UseCase, Translation, Dictionary, AI, Smart]
/**
 * 增强批量翻译用例
 * 智能翻译链路：词典优先 → 智能规则/直译 → AI 翻译 → 覆盖度守卫 → 学习词典更新
 * 
 * 翻译风格：
 * - natural（默认）：自然中文，重组语序，可读性优先
 * - literal：直译，逐词翻译，保持原顺序，不丢词
 */

import { Logger } from '../../../../core/logging/Logger';
import { MultiProviderAIClient } from '../../../../core/ai/MultiProviderAIClient';
import { KVCache } from '../../../../core/cache/KVCache';
import { DictionaryManager } from '../../core/DictionaryManager';
import { SmartRuleEngine } from '../../domain/policies/SmartRuleEngine';
import { buildLiteralAlias } from '../../domain/policies/LiteralAliasBuilder';
import { LiteralAliasBuilderPro } from '../../domain/policies/LiteralAliasBuilderPro';
import { DictionaryResolver } from '../../../../shared/naming/DictionaryResolver';
import { isCoverageSufficient } from '../../domain/policies/CoverageGuard';
import { FileNode, TranslationResult } from '../../../../shared/types';
import * as vscode from 'vscode';

interface TranslationStats {
    totalFiles: number;
    dictionaryHits: number;
    ruleHits: number;
    literalHits: number;  // 新增：直译命中数
    aiTranslations: number;
    coverageGuardTriggered: number;  // 新增：覆盖度守卫触发次数
    cached: number;
    failed: number;
    processingTime: number;
}

export class EnhancedTranslateBatchUseCase {
    private readonly MODULE_ID = 'enhanced-translation';
    private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7天
    private readonly smartRuleEngine: SmartRuleEngine;
    private dictionaryResolver: DictionaryResolver | null = null;
    private literalBuilderPro: LiteralAliasBuilderPro | null = null;

    constructor(
        private logger: Logger,
        private aiClient: MultiProviderAIClient,
        private cache: KVCache,
        private dictionary: DictionaryManager
    ) {
        this.smartRuleEngine = new SmartRuleEngine();
        
        // 异步初始化 Pro 版直译构建器
        this.initializeProBuilder();
    }

    /**
     * 初始化 Pro 版直译构建器
     */
    private async initializeProBuilder(): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.logger.warn('未找到工作区，Pro 版直译构建器初始化失败');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            
            this.dictionaryResolver = new DictionaryResolver();
            await this.dictionaryResolver.loadDictionaries(workspaceRoot);
            
            this.literalBuilderPro = new LiteralAliasBuilderPro(this.dictionaryResolver);
            
            // 从配置读取连接符和扩展名后缀选项
            const config = vscode.workspace.getConfiguration('aiExplorer.alias');
            const joiner = config.get<string>('literalJoiner', '');
            const appendExtSuffix = config.get<boolean>('appendExtSuffix', true);
            
            this.literalBuilderPro.setJoiner(joiner);
            this.literalBuilderPro.setAppendExtSuffix(appendExtSuffix);
            
            const stats = this.dictionaryResolver.getStats();
            this.logger.info(`Pro 版直译构建器初始化成功: ${stats.wordCount} 个单词, ${stats.phraseCount} 个短语`);
        } catch (error) {
            this.logger.error(`Pro 版直译构建器初始化失败: ${error}`);
        }
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
            literalHits: 0,
            aiTranslations: 0,
            coverageGuardTriggered: 0,
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

                // 3. 智能规则引擎或直译（根据配置选择风格）
                const config = vscode.workspace.getConfiguration('aiExplorer');
                const style = config.get<'natural' | 'literal'>('alias.style', 'natural');
                
                if (style === 'literal') {
                    // 直译风格：优先使用 Pro 版，回退到基础版
                    if (this.literalBuilderPro) {
                        // Pro 版：支持短语匹配、形态归一
                        const literalResult = this.literalBuilderPro.buildLiteralAlias(file.name);
                        const result: TranslationResult = {
                            original: file.name,
                            translated: literalResult.alias,
                            confidence: literalResult.confidence,
                            source: 'rule',
                            timestamp: Date.now()
                        };
                        
                        results.set(file, result);
                        await this.cacheTranslation(file.name, result);
                        stats.literalHits++;
                        
                        this.logger.debug(`直译Pro模式: ${file.name} -> ${literalResult.alias} (${literalResult.debug})`);
                        continue;
                    } else {
                        // 基础版：简单逐词翻译
                        const literalResult = buildLiteralAlias(file.name);
                        const result: TranslationResult = {
                            original: file.name,
                            translated: literalResult.alias,
                            confidence: literalResult.confidence,
                            source: 'rule',
                            timestamp: Date.now()
                        };
                        
                        results.set(file, result);
                        await this.cacheTranslation(file.name, result);
                        stats.literalHits++;
                        
                        this.logger.debug(`直译基础模式: ${file.name} -> ${literalResult.alias} (${literalResult.debug})`);
                        continue;
                    }
                } else {
                    // 自然中文风格：语序重组
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
                    // 覆盖度守卫：检查 AI 翻译是否漏词
                    const isCoverageSufficient_ = isCoverageSufficient(file.name, translated, 0);
                    
                    let finalTranslated = translated;
                    let finalConfidence = 0.9;
                    
                    if (!isCoverageSufficient_) {
                        // AI 翻译漏词，回退到直译
                        this.logger.warn(`AI 翻译覆盖度不足: ${file.name} -> ${translated}，回退到直译`);
                        const literalResult = buildLiteralAlias(file.name);
                        finalTranslated = literalResult.alias;
                        finalConfidence = literalResult.confidence;
                        stats.coverageGuardTriggered++;
                    }
                    
                    // AI 翻译成功且覆盖度充分（或已回退到直译）
                    const result: TranslationResult = {
                        original: file.name,
                        translated: finalTranslated,
                        confidence: finalConfidence,
                        source: 'ai',
                        timestamp: Date.now()
                    };

                    results.set(file, result);
                    await this.cacheTranslation(file.name, result);
                    
                    // 学习词典更新
                    if (options?.enableLearning !== false) {
                        await this.dictionary.addLearnedEntry(file.name, finalTranslated, 'learned');
                    }
                    
                    stats.aiTranslations++;
                    this.logger.info(`AI 翻译成功: ${file.name} -> ${finalTranslated}`);
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
        const hitRate = ((stats.dictionaryHits + stats.ruleHits + stats.literalHits + stats.cached) / stats.totalFiles * 100).toFixed(1);
        
        this.logger.info(`翻译完成 - 总计: ${stats.totalFiles}, ` +
            `缓存: ${stats.cached}, 词典: ${stats.dictionaryHits}, ` +
            `智能规则: ${stats.ruleHits}, 直译: ${stats.literalHits}, ` +
            `AI: ${stats.aiTranslations}, 覆盖度守卫: ${stats.coverageGuardTriggered}, ` +
            `失败: ${stats.failed}, 命中率: ${hitRate}%, ` +
            `耗时: ${stats.processingTime}ms`);
    }
}