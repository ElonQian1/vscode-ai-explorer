// src/core/ai/OpenAIClient.ts
// [module: core] [tags: OpenAI, API, Client, Rate-Limit]
/**
 * OpenAI API 客户端
 * 统一的 AI 服务接入点，支持限流、重试、缓存
 */

import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { Logger } from '../logging/Logger';
import { AIRequest, AIResponse } from '../../shared/types';

export class OpenAIClient {
    private client: OpenAI | null = null;
    private rateLimiter: Map<string, number> = new Map();
    private requestQueue: Array<() => Promise<void>> = [];
    private processing = false;

    constructor(private logger: Logger) {}

    private initializeClient(): void {
        const config = vscode.workspace.getConfiguration('aiExplorer');
        const apiKey = config.get<string>('openaiApiKey');
        const baseURL = config.get<string>('openaiBaseUrl');

        if (!apiKey) {
            throw new Error('OpenAI API Key 未配置。请在设置中配置 aiExplorer.openaiApiKey');
        }

        this.client = new OpenAI({
            apiKey,
            baseURL
        });

        this.logger.info('OpenAI 客户端初始化完成');
    }

    async chat(request: AIRequest): Promise<AIResponse> {
        if (!this.client) {
            this.initializeClient();
        }

        // 限流检查
        await this.checkRateLimit(request.model || 'default');

        try {
            const config = vscode.workspace.getConfiguration('aiExplorer');
            const model = request.model || config.get<string>('model', 'gpt-3.5-turbo');

            this.logger.debug('发送 OpenAI 请求', { model, prompt: request.prompt.substring(0, 100) });

            const completion = await this.client!.chat.completions.create({
                model,
                messages: [
                    { role: 'user', content: request.prompt }
                ],
                temperature: request.temperature || 0.7,
                max_tokens: request.maxTokens || 1000
            });

            const response: AIResponse = {
                content: completion.choices[0]?.message?.content || '',
                usage: completion.usage ? {
                    promptTokens: completion.usage.prompt_tokens,
                    completionTokens: completion.usage.completion_tokens,
                    totalTokens: completion.usage.total_tokens
                } : undefined
            };

            this.logger.debug('OpenAI 响应成功', { 
                contentLength: response.content.length, 
                usage: response.usage 
            });

            return response;

        } catch (error) {
            this.logger.error('OpenAI 请求失败', error);
            throw new Error(`AI 服务调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async checkRateLimit(model: string): Promise<void> {
        const now = Date.now();
        const lastRequest = this.rateLimiter.get(model) || 0;
        const minInterval = 1000; // 1 秒间隔

        if (now - lastRequest < minInterval) {
            const waitTime = minInterval - (now - lastRequest);
            this.logger.debug(`限流等待: ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.rateLimiter.set(model, now);
    }

    /**
     * 批量处理请求（队列机制）
     */
    async batchProcess<T>(
        items: T[],
        processor: (item: T) => Promise<AIResponse>,
        batchSize: number = 3
    ): Promise<Map<T, AIResponse>> {
        const results = new Map<T, AIResponse>();
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchPromises = batch.map(async (item) => {
                try {
                    const result = await processor(item);
                    results.set(item, result);
                } catch (error) {
                    this.logger.error(`批量处理项目失败`, { item, error });
                    // 继续处理其他项目
                }
            });

            await Promise.all(batchPromises);
            
            // 批次间暂停
            if (i + batchSize < items.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        return results;
    }

    dispose(): void {
        this.rateLimiter.clear();
        this.requestQueue = [];
        this.client = null;
    }
}