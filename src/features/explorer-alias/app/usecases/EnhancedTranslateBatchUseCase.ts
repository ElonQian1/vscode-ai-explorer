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
import { LiteralAliasBuilderV2 } from '../../domain/policies/LiteralAliasBuilderV2';
import { DictionaryResolver } from '../../../../shared/naming/DictionaryResolver';
import { LiteralAIFallback } from '../../infra/translators/LiteralAIFallback';
import { isCoverageSufficient } from '../../domain/policies/CoverageGuard';
import { splitWithDelimiters } from '../../../../shared/naming/SplitWithDelimiters';
import { FileNode, TranslationResult } from '../../../../shared/types';
import * as vscode from 'vscode';

interface TranslationStats {
    totalFiles: number;
    dictionaryHits: number;
    ruleHits: number;
    literalHits: number;  // 新增：直译命中数
    aiTranslations: number;
    aiFallbackHits: number;  // 新增：AI兜底补缺词次数
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
    private literalBuilderV2: LiteralAliasBuilderV2 | null = null;  // 新增：V2版本（保留分隔符）
    private literalAIFallback: LiteralAIFallback | null = null;  // 新增：AI兜底

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
     * 初始化 Pro 版直译构建器（包括 V2 和 AI 兜底）
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
            this.literalBuilderV2 = new LiteralAliasBuilderV2(this.dictionaryResolver);  // V2版本
            this.literalAIFallback = new LiteralAIFallback(this.aiClient);  // AI兜底
            
            // 从配置读取连接符和扩展名后缀选项
            const config = vscode.workspace.getConfiguration('aiExplorer.alias');
            const joiner = config.get<string>('literalJoiner', '');
            const appendExtSuffix = config.get<boolean>('appendExtSuffix', true);
            
            this.literalBuilderPro.setJoiner(joiner);
            this.literalBuilderPro.setAppendExtSuffix(appendExtSuffix);
            this.literalBuilderV2.setKeepExtension(appendExtSuffix);
            
            const stats = this.dictionaryResolver.getStats();
            this.logger.info(`Pro 版直译构建器初始化成功: ${stats.wordCount} 个单词, ${stats.phraseCount} 个短语`);
        } catch (error) {
            this.logger.error(`Pro 版直译构建器初始化失败: ${error}`);
        }
    }

    /**
     * 智能批量翻译文件
     * 
     * @param files 要翻译的文件列表
     * @param options 翻译选项
     *   - forceRefresh: 是否强制刷新（跳过缓存，但仍然使用词典）
     *   - forceAI: 是否强制使用 AI（跳过缓存和词典，直接用 AI 翻译所有词）
     *   - enableLearning: 是否启用学习词典
     *   - batchSize: 批量大小
     */
    async translateFiles(files: FileNode[], options?: {
        forceRefresh?: boolean;
        forceAI?: boolean;
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
            aiFallbackHits: 0,
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
                // 🔧 强制 AI 模式：跳过缓存和词典，直接走 AI 翻译
                if (options?.forceAI) {
                    this.logger.info(`[强制AI模式] ${file.name} - 跳过缓存和词典，直接使用 AI`);
                    needsAITranslation.push(file);
                    continue;
                }
                
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
                    // 直译风格：V2版本（保留分隔符） + AI兜底
                    if (this.literalBuilderV2 && this.literalAIFallback && this.dictionaryResolver) {
                        // V2版本：保留分隔符，返回未知词
                        const literalResult = this.literalBuilderV2.buildLiteralAlias(file.name);
                        
                        // 如果有未知词，使用 AI 兜底
                        if (literalResult.unknownWords.length > 0) {
                            this.logger.debug(`${file.name} 有 ${literalResult.unknownWords.length} 个未知词，触发 AI 兜底`);
                            
                            try {
                                // AI 只翻译未知词
                                const aiMappings = await this.literalAIFallback.suggestLiteralTranslations(
                                    file.name,
                                    literalResult.unknownWords
                                );
                                
                                // 写回学习词典
                                if (Object.keys(aiMappings).length > 0) {
                                    await this.dictionaryResolver.writeBatchLearning(aiMappings);
                                    stats.aiFallbackHits++;
                                    
                                    // 重新翻译（使用更新后的词典）
                                    const updatedResult = this.literalBuilderV2.buildLiteralAlias(file.name);
                                    const result: TranslationResult = {
                                        original: file.name,
                                        translated: updatedResult.alias,
                                        confidence: updatedResult.confidence,
                                        source: 'ai',  // 标记为 AI 增强
                                        timestamp: Date.now()
                                    };
                                    
                                    results.set(file, result);
                                    await this.cacheTranslation(file.name, result);
                                    stats.literalHits++;
                                    
                                    this.logger.debug(`直译V2+AI: ${file.name} -> ${updatedResult.alias} (覆盖率${(updatedResult.coverage*100).toFixed(0)}%)`);
                                    continue;
                                }
                            } catch (error) {
                                this.logger.warn(`AI 兜底失败: ${error}`);
                                // 继续使用原始翻译结果
                            }
                        }
                        
                        // 无未知词或 AI 兜底失败，使用原始结果
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
                        
                        this.logger.debug(`直译V2模式: ${file.name} -> ${literalResult.alias} (${literalResult.debug})`);
                        continue;
                    } else if (this.literalBuilderPro) {
                        // 回退到 Pro 版：支持短语匹配、形态归一
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
            // 🔧 区分强制 AI 模式和普通 AI 模式
            if (options?.forceAI) {
                await this.processForceAITranslations(needsAITranslation, results, stats, options);
            } else {
                await this.processAITranslations(needsAITranslation, results, stats, options);
            }
        }

        // 统计和日志
        stats.processingTime = Date.now() - startTime;
        this.logTranslationStats(stats);

        return results;
    }

    /**
     * 翻译单个文件或文件夹名
     */
    async translateSingle(fileName: string, options?: {
        forceRefresh?: boolean;
        forceAI?: boolean;
        enableLearning?: boolean;
        itemType?: 'file' | 'directory';  // 新增：允许指定类型，但翻译逻辑不依赖此参数
    }): Promise<TranslationResult> {
        const fileNode: FileNode = {
            name: fileName,
            path: fileName,
            type: options?.itemType || 'file'  // ✅ 使用传入的类型，默认为 file（向后兼容）
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
            
            this.logger.debug(`AI 批量翻译返回 ${aiResults.size} 个结果`);
            
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
                    
                    // 🔧 增强错误诊断：检查 AI 客户端状态
                    const providerStatus = this.aiClient.getProviderStatus();
                    const config = vscode.workspace.getConfiguration('aiExplorer');
                    const primaryProvider = config.get<string>('provider.primary', 'openai');
                    
                    this.logger.error('AI 翻译详细诊断', {
                        fileName: file.name,
                        translatedResult: translated,
                        primaryProvider,
                        providerStatus,
                        aiResultsSize: aiResults.size,
                        allResults: Array.from(aiResults.entries())
                    });
                    
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

    /**
     * 🆕 强制 AI 翻译模式（总是使用直译样式，不管全局配置）
     * 
     * 与普通 AI 翻译的区别：
     * 1. 跳过词典和缓存查找
     * 2. 使用 AI 翻译所有 tokens（不只是未知词）
     * 3. 总是保持直译样式（保留分隔符、扩展名）
     * 4. 写回学习词典
     * 
     * ⚠️ 注意：强制 AI 模式总是使用直译样式，忽略 alias.style 配置
     */
    private async processForceAITranslations(
        files: FileNode[],
        results: Map<FileNode, TranslationResult>,
        stats: TranslationStats,
        options?: any
    ): Promise<void> {
        this.logger.info(`[强制AI模式] 开始翻译 ${files.length} 个文件（总是使用直译样式）`);
        
        // 🔧 强制使用直译模式，忽略全局配置
        // 原因：强制 AI 的目的是校正翻译，应该保持原有的分隔符结构
        
        for (const file of files) {
            try {
                // 检查是否有 V2 直译构建器
                if (!this.literalBuilderV2 || !this.literalAIFallback || !this.dictionaryResolver) {
                    this.logger.warn(`[强制AI] ${file.name} - 直译组件未初始化，回退到普通 AI 翻译`);
                    await this.processAITranslations([file], results, stats, options);
                    continue;
                }
                
                // 1. 先分词，获取所有 tokens
                const literalResult = this.literalBuilderV2.buildLiteralAlias(file.name);
                
                this.logger.debug(`[强制AI] ${file.name} - 分词结果: ${literalResult.debug}`);
                this.logger.debug(`[强制AI] ${file.name} - 未知词: ${literalResult.unknownWords.join(', ')}`);
                
                // 2. 🔧 强制 AI 模式：总是调用 AI，即使所有词都已知
                // 目的：纠正词典中的错误翻译
                // 提取所有词元（不管已知还是未知）
                const { tokens } = splitWithDelimiters(file.name);
                const allWords = tokens.map(t => t.raw.toLowerCase()).filter(w => w.length > 0);
                
                this.logger.info(`[强制AI] ${file.name} - 提取到 ${allWords.length} 个词，总是调用 AI（纠正词典错误）`);
                
                if (allWords.length > 0) {
                    // 总是调用 AI 翻译所有词
                    const aiMappings = await this.literalAIFallback.suggestLiteralTranslations(
                        file.name,
                        allWords  // 🔧 传递所有词，不是只传未知词
                    );
                    
                    this.logger.debug(`[强制AI] ${file.name} - AI 返回映射: ${JSON.stringify(aiMappings)}`);
                    
                    // 3. 写回学习词典（覆盖旧的翻译）
                    if (Object.keys(aiMappings).length > 0) {
                        await this.dictionaryResolver.writeBatchLearning(aiMappings);
                        stats.aiFallbackHits++;
                        
                        this.logger.info(`[强制AI] ${file.name} - 已写入 ${Object.keys(aiMappings).length} 个词到学习词典（覆盖旧翻译）`);
                        
                        // 4. 重新构建（使用更新后的词典）
                        const updatedResult = this.literalBuilderV2.buildLiteralAlias(file.name);
                        
                        this.logger.info(`[强制AI] ${file.name} -> ${updatedResult.alias} (覆盖率${(updatedResult.coverage*100).toFixed(0)}%, 保留了分隔符)`);
                        
                        const result: TranslationResult = {
                            original: file.name,
                            translated: updatedResult.alias,
                            confidence: updatedResult.confidence,
                            source: 'ai',
                            timestamp: Date.now()
                        };
                        
                        results.set(file, result);
                        await this.cacheTranslation(file.name, result);
                        stats.aiTranslations++;
                    } else {
                        // AI 返回空（罕见），使用现有词典翻译
                        this.logger.warn(`[强制AI] ${file.name} - AI 返回空映射，使用现有词典翻译`);
                        
                        const result: TranslationResult = {
                            original: file.name,
                            translated: literalResult.alias,
                            confidence: literalResult.confidence,
                            source: 'ai',
                            timestamp: Date.now()
                        };
                        
                        results.set(file, result);
                        await this.cacheTranslation(file.name, result);
                        stats.aiTranslations++;
                    }
                } else {
                    // 无法提取词（极罕见），回退到现有结果
                    this.logger.warn(`[强制AI] ${file.name} - 无法提取词，使用现有翻译`);
                    
                    const result: TranslationResult = {
                        original: file.name,
                        translated: literalResult.alias,
                        confidence: literalResult.confidence,
                        source: 'ai',
                        timestamp: Date.now()
                    };
                    
                    results.set(file, result);
                    await this.cacheTranslation(file.name, result);
                    stats.aiTranslations++;
                }
            } catch (error) {
                this.logger.error(`[强制AI] ${file.name} 翻译失败`, error);
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
            `AI完整: ${stats.aiTranslations}, AI补缺词: ${stats.aiFallbackHits}, ` +
            `覆盖度守卫: ${stats.coverageGuardTriggered}, ` +
            `失败: ${stats.failed}, 命中率: ${hitRate}%, ` +
            `耗时: ${stats.processingTime}ms`);
    }
}