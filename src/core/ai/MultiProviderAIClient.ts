// src/core/ai/MultiProviderAIClient.ts
// [module: core] [tags: AI, MultiProvider, OpenAI, Hunyuan, Fallback]
/**
 * 多提供商 AI 客户端
 * 支持 OpenAI、腾讯云混元 OpenAI 兼容接口等多个 AI 提供商
 * 
 * 架构说明：
 * - 使用统一的 OpenAI SDK (openai npm 包)
 * - 通过切换 baseURL 和 apiKey 实现提供商切换
 * - 腾讯云混元使用官方 OpenAI 兼容接口 (https://api.hunyuan.cloud.tencent.com/v1)
 * - 具备降级和故障转移能力
 */

import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { Logger } from '../logging/Logger';
import { AIRequest, AIResponse } from '../../shared/types';
import { RateLimiter } from './RateLimiter';

interface AIProvider {
    name: string;
    client: OpenAI;
    isAvailable: boolean;
    lastError?: string;
    lastHealthCheck: number;
}

interface ProviderConfig {
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
}

export class MultiProviderAIClient {
    private providers: Map<string, AIProvider> = new Map();
    private rateLimiter: Map<string, number> = new Map();
    private requestQueue: Array<() => Promise<void>> = [];
    private processing = false;
    private rateLimiters: Map<string, RateLimiter> = new Map();
    
    private readonly HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟
    private readonly MAX_RETRIES = 3;
    private readonly RATE_LIMIT_DELAY = 1000; // 1秒

    constructor(private logger: Logger) {}

    /**
     * 初始化 AI 客户端
     */
    async initialize(): Promise<void> {
        await this.loadProviderConfigs();
        this.logger.info('多提供商 AI 客户端初始化完成');
    }

    /**
     * 发送 AI 请求（带降级机制和智能提供商选择）
     */
    async sendRequest(request: AIRequest): Promise<AIResponse> {
        const config = vscode.workspace.getConfiguration('aiExplorer');
        let primaryProvider = config.get<string>('provider.primary', 'openai');
        const fallbackProvider = config.get<string>('provider.fallback', 'none');

        // 🔧 智能提供商选择：如果主提供商未配置，自动切换到已配置的提供商
        const openaiKey = config.get<string>('openaiApiKey');
        const hunyuanKey = config.get<string>('hunyuanApiKey');
        
        if (!this.providers.has(primaryProvider) || !this.providers.get(primaryProvider)?.isAvailable) {
            this.logger.warn(`主提供商 ${primaryProvider} 未配置或不可用`);
            
            // 自动选择已配置的提供商
            if (primaryProvider === 'openai' && !openaiKey && hunyuanKey) {
                this.logger.info('🔄 OpenAI 未配置，自动切换到腾讯混元');
                primaryProvider = 'hunyuan';
                
                // 更新配置（仅本次会话）
                await config.update('provider.primary', 'hunyuan', vscode.ConfigurationTarget.Global);
                
                vscode.window.showInformationMessage(
                    '✅ 已自动切换到腾讯混元（检测到未配置 OpenAI）',
                    '查看配置'
                ).then(action => {
                    if (action === '查看配置') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'aiExplorer.provider.primary');
                    }
                });
            } else if (primaryProvider === 'hunyuan' && !hunyuanKey && openaiKey) {
                this.logger.info('🔄 腾讯混元未配置，自动切换到 OpenAI');
                primaryProvider = 'openai';
                
                await config.update('provider.primary', 'openai', vscode.ConfigurationTarget.Global);
                
                vscode.window.showInformationMessage(
                    '✅ 已自动切换到 OpenAI（检测到未配置腾讯混元）',
                    '查看配置'
                ).then(action => {
                    if (action === '查看配置') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'aiExplorer.provider.primary');
                    }
                });
            }
        }

        try {
            // 尝试主提供商
            this.logger.debug(`使用主提供商: ${primaryProvider}`);
            return await this.sendToProvider(primaryProvider, request);
        } catch (primaryError) {
            const errorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
            this.logger.error(`主提供商 ${primaryProvider} 请求失败: ${errorMsg}`, primaryError);

            // 尝试备用提供商
            if (fallbackProvider && fallbackProvider !== 'none' && fallbackProvider !== primaryProvider) {
                try {
                    this.logger.info(`尝试备用提供商: ${fallbackProvider}`);
                    return await this.sendToProvider(fallbackProvider, request);
                } catch (fallbackError) {
                    const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                    this.logger.error(`备用提供商 ${fallbackProvider} 也失败: ${fallbackErrorMsg}`, fallbackError);
                }
            }

            // 所有提供商都失败 - 提供详细的错误信息
            const detailedError = new Error(
                `❌ AI 翻译失败\n\n` +
                `主提供商: ${primaryProvider} ${!this.providers.has(primaryProvider) ? '(未配置)' : '(请求失败)'}\n` +
                `错误信息: ${errorMsg}\n\n` +
                `💡 解决方案:\n` +
                `1. 检查 API Key 是否正确配置\n` +
                `2. 检查网络连接是否正常\n` +
                `3. 尝试切换提供商（设置 > AI Explorer > Provider: Primary）`
            );
            
            throw detailedError;
        }
    }

    /**
     * 批量翻译请求
     */
    async translateBatch(texts: string[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        const batchSize = 10; // 每批处理10个
        
        this.logger.debug(`开始批量翻译 ${texts.length} 个文本，批次大小: ${batchSize}`);
        
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchPrompt = this.createBatchTranslationPrompt(batch);
            
            try {
                this.logger.debug(`翻译批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}: ${batch.join(', ')}`);
                
                const response = await this.sendRequest({
                    prompt: batchPrompt,
                    maxTokens: 1000,
                    temperature: 0.3
                });

                this.logger.debug(`批次翻译响应: ${response.content.substring(0, 200)}...`);

                const translations = this.parseBatchTranslationResponse(response.content, batch);
                
                this.logger.debug(`解析得到 ${translations.size} 个翻译结果`);
                
                for (const [original, translated] of translations) {
                    results.set(original, translated);
                    this.logger.debug(`  ${original} -> ${translated}`);
                }

                // 批量之间添加延迟
                if (i + batchSize < texts.length) {
                    await this.delay(this.RATE_LIMIT_DELAY);
                }
            } catch (error) {
                this.logger.error(`批量翻译失败 (batch ${Math.floor(i / batchSize) + 1})`, error);
                
                // 记录详细错误信息
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`错误详情: ${errorMessage}`, {
                    batch,
                    batchIndex: Math.floor(i / batchSize) + 1,
                    errorStack: error instanceof Error ? error.stack : undefined
                });
                
                // 单个翻译作为备选
                for (const text of batch) {
                    try {
                        this.logger.debug(`尝试单个翻译: ${text}`);
                        const response = await this.sendRequest({
                            prompt: `将以下英文翻译成中文，只返回翻译结果：${text}`,
                            maxTokens: 100,
                            temperature: 0.3
                        });
                        results.set(text, response.content.trim());
                        this.logger.info(`单个翻译成功: ${text} -> ${response.content.trim()}`);
                        await this.delay(500); // 单个请求间隔
                    } catch (singleError) {
                        this.logger.warn(`单个翻译失败: ${text}`, singleError);
                        const singleErrorMsg = singleError instanceof Error ? singleError.message : String(singleError);
                        this.logger.error(`单个翻译错误详情: ${singleErrorMsg}`);
                    }
                }
            }
        }

        this.logger.info(`批量翻译完成，成功 ${results.size}/${texts.length} 个`);
        return results;
    }

    /**
     * 获取提供商状态
     */
    getProviderStatus(): Record<string, { available: boolean; lastError?: string }> {
        const status: Record<string, { available: boolean; lastError?: string }> = {};
        
        for (const [name, provider] of this.providers) {
            status[name] = {
                available: provider.isAvailable,
                lastError: provider.lastError
            };
        }

        return status;
    }

    /**
     * 健康检查
     */
    async healthCheck(): Promise<void> {
        const now = Date.now();
        
        for (const [name, provider] of this.providers) {
            if (now - provider.lastHealthCheck > this.HEALTH_CHECK_INTERVAL) {
                try {
                    await this.testProvider(provider);
                    provider.isAvailable = true;
                    provider.lastError = undefined;
                } catch (error) {
                    provider.isAvailable = false;
                    provider.lastError = error instanceof Error ? error.message : String(error);
                }
                provider.lastHealthCheck = now;
            }
        }
    }

    private async sendToProvider(providerName: string, request: AIRequest): Promise<AIResponse> {
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`未知的提供商: ${providerName}`);
        }

        if (!provider.isAvailable) {
            throw new Error(`提供商 ${providerName} 不可用: ${provider.lastError}`);
        }

        // 速率限制
        await this.enforceRateLimit(providerName);

        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                const model = this.getModelForProvider(providerName);
                this.logger.debug(`[${providerName}] 发送请求: model=${model}, maxTokens=${request.maxTokens}`);
                
                const response = await provider.client.chat.completions.create({
                    model: model,
                    messages: [{ role: 'user', content: request.prompt }],
                    max_tokens: request.maxTokens,
                    temperature: request.temperature || 0.7
                });

                const content = response.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('AI 响应为空');
                }

                this.logger.debug(`[${providerName}] 请求成功: tokens=${response.usage?.total_tokens || 0}`);
                
                return {
                    content: content.trim(),
                    model: response.model,
                    usage: {
                        promptTokens: response.usage?.prompt_tokens || 0,
                        completionTokens: response.usage?.completion_tokens || 0,
                        totalTokens: response.usage?.total_tokens || 0
                    }
                };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const errorMsg = lastError.message || String(error);
                
                // 检查是否是429速率限制错误
                const is429Error = errorMsg.includes('429') || errorMsg.includes('Too Many Requests');
                
                this.logger.warn(
                    `[${providerName}] 请求失败 (尝试 ${attempt}/${this.MAX_RETRIES}): ${errorMsg}`,
                    error
                );
                
                if (attempt < this.MAX_RETRIES) {
                    let delayTime = Math.pow(2, attempt) * 1000; // 指数退避
                    
                    // 对于429错误，使用更长的等待时间
                    if (is429Error) {
                        delayTime = Math.min(60000, delayTime * 5); // 最长1分钟
                        this.logger.info(`遇到速率限制，等待 ${delayTime/1000} 秒后重试`);
                        
                        // 重置该提供商的速率限制器
                        const limiter = this.rateLimiters.get(providerName);
                        if (limiter) {
                            limiter.reset();
                        }
                    }
                    
                    await this.delay(delayTime);
                }
            }
        }

        provider.isAvailable = false;
        provider.lastError = lastError?.message;
        throw lastError || new Error('未知错误');
    }

    private async loadProviderConfigs(): Promise<void> {
        const config = vscode.workspace.getConfiguration('aiExplorer');
        
        // OpenAI 配置
        const openaiKey = config.get<string>('openaiApiKey');
        const openaiBaseUrl = config.get<string>('openaiBaseUrl', 'https://api.openai.com/v1');
        
        if (openaiKey) {
            try {
                const client = new OpenAI({
                    apiKey: openaiKey,
                    baseURL: openaiBaseUrl
                });

                this.providers.set('openai', {
                    name: 'OpenAI',
                    client,
                    isAvailable: true,
                    lastHealthCheck: 0
                });
                this.logger.debug('OpenAI 提供商配置完成');
            } catch (error) {
                this.logger.error('OpenAI 提供商配置失败', error);
            }
        }

        // 腾讯云混元配置（OpenAI 兼容接口）
        // 参考文档：https://cloud.tencent.com/document/product/1729/111007
        const hunyuanKey = config.get<string>('hunyuanApiKey');
        const hunyuanBaseUrl = config.get<string>('hunyuanBaseUrl', 'https://api.hunyuan.cloud.tencent.com/v1');
        
        if (hunyuanKey) {
            try {
                // 使用标准 OpenAI SDK，仅切换 baseURL 和 apiKey
                const client = new OpenAI({
                    apiKey: hunyuanKey,  // 腾讯云混元专用 API Key（非 SecretId/SecretKey）
                    baseURL: hunyuanBaseUrl,  // OpenAI 兼容接口端点
                    defaultHeaders: {
                        'Content-Type': 'application/json'
                    }
                });

                this.providers.set('hunyuan', {
                    name: '腾讯混元',
                    client,
                    isAvailable: true,
                    lastHealthCheck: 0
                });
                this.logger.debug('腾讯云混元 OpenAI 兼容接口配置完成');
            } catch (error) {
                this.logger.error('腾讯云混元配置失败', error);
            }
        }

        if (this.providers.size === 0) {
            this.logger.warn('❌ 没有配置任何 AI 提供商');
            
            // 显示友好的提示
            vscode.window.showWarningMessage(
                '⚠️ 未配置任何 AI 提供商，翻译功能将不可用\n\n请配置 OpenAI 或腾讯混元 API Key',
                '配置 OpenAI',
                '配置腾讯混元',
                '查看文档'
            ).then(action => {
                if (action === '配置 OpenAI') {
                    vscode.commands.executeCommand('aiExplorer.setOpenAIKey');
                } else if (action === '配置腾讯混元') {
                    vscode.commands.executeCommand('aiExplorer.setHunyuanKey');
                } else if (action === '查看文档') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/ElonQian1/vscode-ai-explorer#配置-ai-服务'));
                }
            });
        } else {
            // 显示已配置的提供商
            const configuredProviders = Array.from(this.providers.keys()).join(', ');
            this.logger.info(`✅ 已配置提供商: ${configuredProviders}`);
            
            // 检查主提供商是否已配置
            const primaryProvider = config.get<string>('provider.primary', 'openai');
            if (!this.providers.has(primaryProvider)) {
                this.logger.warn(`⚠️ 主提供商 ${primaryProvider} 未配置，可能导致翻译失败`);
                
                // 自动切换到已配置的提供商
                const availableProvider = Array.from(this.providers.keys())[0];
                this.logger.info(`🔄 自动切换主提供商为: ${availableProvider}`);
                await config.update('provider.primary', availableProvider, vscode.ConfigurationTarget.Global);
                
                vscode.window.showInformationMessage(
                    `✅ 已自动设置主提供商为 ${availableProvider}`,
                    '查看配置'
                ).then(action => {
                    if (action === '查看配置') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'aiExplorer.provider');
                    }
                });
            }
        }
    }

    private getModelForProvider(providerName: string): string {
        const config = vscode.workspace.getConfiguration('aiExplorer');
        
        switch (providerName) {
            case 'openai':
                return config.get<string>('model', 'gpt-3.5-turbo');
            case 'hunyuan':
                // 腾讯云混元可用模型（参考官方文档）
                // - hunyuan-turbo: 通用版，推荐使用
                // - hunyuan-turbos-longtext: 长文本版，支持更大上下文
                // - hunyuan-lite: 轻量版，速度快
                // - hunyuan-pro: 专业版，高质量
                // - hunyuan-standard: 标准版
                return config.get<string>('hunyuanModel', 'hunyuan-turbo');
            default:
                return 'gpt-3.5-turbo';
        }
    }

    private async testProvider(provider: AIProvider): Promise<void> {
        const testResponse = await provider.client.chat.completions.create({
            model: this.getModelForProvider(provider.name.toLowerCase()),
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 5
        });

        if (!testResponse.choices[0]?.message?.content) {
            throw new Error('测试请求失败');
        }
    }

    private async enforceRateLimit(providerName: string): Promise<void> {
        // 获取或创建该提供商的速率限制器
        let limiter = this.rateLimiters.get(providerName);
        if (!limiter) {
            // 针对不同提供商使用不同的限制策略 - 更保守的设置
            const isHunyuan = providerName.includes('hunyuan') || providerName.includes('腾讯');
            limiter = new RateLimiter(
                isHunyuan ? 3 : 5,     // 大幅降低频率：腾讯元宝3次/分钟，其他5次/分钟
                60000,                 // 1分钟窗口
                isHunyuan ? 5000 : 3000 // 大幅增加间隔：腾讯元宝5秒，其他3秒
            );
            this.rateLimiters.set(providerName, limiter);
            this.logger.info(`为提供商 ${providerName} 创建速率限制器: ${isHunyuan ? '严格模式' : '标准模式'}`);
        }
        
        await limiter.waitIfNeeded();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private createBatchTranslationPrompt(texts: string[]): string {
        return `请将以下英文词汇翻译成中文，每行一个翻译结果，保持原有顺序：

${texts.map((text, index) => `${index + 1}. ${text}`).join('\n')}

要求：
- 只返回翻译结果，不要编号
- 每行一个结果
- 如果是编程术语，优先使用常见的中文译名
- 如果是文件名或目录名，翻译要简洁准确`;
    }

    private parseBatchTranslationResponse(response: string, originalTexts: string[]): Map<string, string> {
        const results = new Map<string, string>();
        const lines = response.split('\n').map(line => line.trim()).filter(line => line);
        
        for (let i = 0; i < Math.min(lines.length, originalTexts.length); i++) {
            const original = originalTexts[i];
            const translated = lines[i].replace(/^\d+\.\s*/, ''); // 移除可能的编号
            
            if (translated && translated !== original) {
                results.set(original, translated);
            }
        }

        return results;
    }
}