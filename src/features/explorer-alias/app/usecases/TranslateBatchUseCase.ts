// src/features/explorer-alias/app/usecases/TranslateBatchUseCase.ts
// [module: explorer-alias] [tags: Translation, UseCase, Batch, AI]
/**
 * 批量翻译用例
 * 处理文件名的批量翻译逻辑
 */

import { Logger } from '../../../../core/logging/Logger';
import { OpenAIClient } from '../../../../core/ai/OpenAIClient';
import { KVCache } from '../../../../core/cache/KVCache';
import { PromptProfiles } from '../../../../core/ai/PromptProfiles';
import { FileNode, TranslationResult } from '../../../../shared/types';

export class TranslateBatchUseCase {
    private readonly MODULE_ID = 'explorer-alias';

    constructor(
        private logger: Logger,
        private aiClient: OpenAIClient,
        private cache: KVCache
    ) {}

    /**
     * 批量翻译文件名
     */
    async translateFiles(files: FileNode[], context?: string): Promise<Map<FileNode, TranslationResult>> {
        this.logger.info(`开始批量翻译 ${files.length} 个文件`);
        
        const results = new Map<FileNode, TranslationResult>();
        const needsTranslation: FileNode[] = [];

        // 首先检查缓存
        for (const file of files) {
            const cached = await this.getCachedTranslation(file.name);
            if (cached) {
                results.set(file, cached);
                this.logger.debug(`使用缓存翻译: ${file.name} -> ${cached.translated}`);
            } else {
                needsTranslation.push(file);
            }
        }

        if (needsTranslation.length === 0) {
            this.logger.info('所有文件都有缓存翻译，无需调用AI');
            return results;
        }

        // 批量处理需要翻译的文件
        try {
            const aiResults = await this.aiClient.batchProcess(
                needsTranslation,
                async (file) => await this.translateSingleFile(file, context),
                3 // 每批处理3个文件
            );

            // 处理AI翻译结果
            for (const [file, aiResponse] of aiResults) {
                try {
                    const translated = this.parseTranslationResult(aiResponse.content, file.name);
                    const result: TranslationResult = {
                        original: file.name,
                        translated,
                        confidence: 0.8, // 基于AI响应质量评估
                        cached: false
                    };

                    results.set(file, result);
                    
                    // 缓存翻译结果
                    await this.cacheTranslation(file.name, result);
                    
                    this.logger.info(`翻译完成: ${file.name} -> ${translated}`);

                } catch (error) {
                    this.logger.error(`解析翻译结果失败: ${file.name}`, error);
                    // 使用原文件名作为兜底
                    results.set(file, {
                        original: file.name,
                        translated: file.name,
                        confidence: 0,
                        cached: false
                    });
                }
            }

        } catch (error) {
            this.logger.error('批量翻译失败', error);
            throw new Error(`翻译服务调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }

        this.logger.info(`批量翻译完成，成功 ${results.size} 个，失败 ${files.length - results.size} 个`);
        return results;
    }

    /**
     * 翻译单个文件
     */
    private async translateSingleFile(file: FileNode, context?: string) {
        const prompt = PromptProfiles.renderPrompt('file-translation', {
            filename: file.name,
            context: context || this.buildContext(file)
        });

        if (!prompt) {
            throw new Error('找不到文件翻译提示配置');
        }

        return await this.aiClient.chat({
            prompt: prompt.userPrompt,
            model: prompt.profile.model,
            temperature: prompt.profile.temperature,
            maxTokens: prompt.profile.maxTokens
        });
    }

    /**
     * 构建上下文信息
     */
    private buildContext(file: FileNode): string {
        // 提取文件路径的目录信息作为上下文
        const pathParts = file.path.split(/[\\/]/);
        const parentDir = pathParts[pathParts.length - 2];
        const fileExt = file.name.split('.').pop();
        
        let context = `文件类型: ${fileExt}`;
        if (parentDir) {
            context += `\\n所在目录: ${parentDir}`;
        }

        return context;
    }

    /**
     * 解析AI返回的翻译结果
     */
    private parseTranslationResult(content: string, originalName: string): string {
        // 清理AI返回的内容
        let result = content.trim();
        
        // 移除可能的引号或markdown格式
        result = result.replace(/^["'`]|["'`]$/g, '');
        result = result.replace(/^.*?[:：]\\s*/, ''); // 移除 "翻译:" 这样的前缀
        
        // 如果结果为空或异常，返回原文件名
        if (!result || result.length === 0 || result === originalName) {
            return originalName;
        }

        // 确保保留文件扩展名
        const originalExt = originalName.split('.').pop();
        if (originalExt && !result.endsWith(`.${originalExt}`)) {
            const baseName = result.replace(/\\..*$/, ''); // 移除可能错误的扩展名
            result = `${baseName}.${originalExt}`;
        }

        return result;
    }

    /**
     * 获取缓存的翻译
     */
    private async getCachedTranslation(filename: string): Promise<TranslationResult | null> {
        const cacheKey = `translation:${filename}`;
        const cached = await this.cache.get<TranslationResult>(cacheKey, this.MODULE_ID);
        
        if (cached) {
            return { ...cached, cached: true };
        }
        
        return null;
    }

    /**
     * 缓存翻译结果
     */
    private async cacheTranslation(filename: string, result: TranslationResult): Promise<void> {
        const cacheKey = `translation:${filename}`;
        const ttl = 7 * 24 * 60 * 60 * 1000; // 7天缓存
        
        await this.cache.set(cacheKey, result, ttl, this.MODULE_ID);
    }

    /**
     * 清除翻译缓存
     */
    async clearCache(): Promise<void> {
        await this.cache.clearModule(this.MODULE_ID);
        this.logger.info('已清除所有翻译缓存');
    }
}