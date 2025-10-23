// src/core/analysis/model/ModelRouter.ts
import * as vscode from 'vscode';
/**
 * 🤖 模型路由器 - OpenAI ↔ 混元双路智能切换
 *
 * 策略：
 * - 首选OpenAI（质量更稳定）
 * - 混元回退（性价比高，长文本友好）
 * - 自动检测配置可用性
 * - 智能错误恢复
 */
export class ModelRouter {
    primary;
    secondary;
    primaryHealth = true;
    secondaryHealth = true;
    lastHealthCheck = 0;
    healthCheckInterval = 60000; // 1分钟
    constructor(primary, secondary) {
        this.primary = primary;
        this.secondary = secondary;
    }
    async smartCall(prompt, inputs) {
        await this.checkHealth();
        // 根据健康状态选择模型
        const useSecondary = !this.primaryHealth || this.shouldPreferSecondary(inputs);
        try {
            if (useSecondary && this.secondaryHealth) {
                return await this.secondary.call(prompt, inputs);
            }
            else if (this.primaryHealth) {
                return await this.primary.call(prompt, inputs);
            }
            else if (this.secondaryHealth) {
                return await this.secondary.call(prompt, inputs);
            }
            else {
                throw new Error('所有AI模型都不可用');
            }
        }
        catch (error) {
            console.warn(`Primary model (${this.primary.name}) failed, trying secondary:`, error);
            // 主模型失败，尝试备用模型
            if (!useSecondary && this.secondaryHealth) {
                this.primaryHealth = false; // 标记主模型健康状态
                return await this.secondary.call(prompt, inputs);
            }
            else if (useSecondary && this.primaryHealth) {
                this.secondaryHealth = false; // 标记备用模型健康状态
                return await this.primary.call(prompt, inputs);
            }
            throw error;
        }
    }
    /**
     * 🏥 健康检查
     */
    async checkHealth() {
        const now = Date.now();
        if (now - this.lastHealthCheck < this.healthCheckInterval) {
            return;
        }
        this.lastHealthCheck = now;
        // 检查配置是否可用
        const config = vscode.workspace.getConfiguration('ai-explorer');
        const openaiKey = config.get('openai.apiKey') || process.env.OPENAI_API_KEY;
        const hunyuanKey = config.get('hunyuan.apiKey') || process.env.HUNYUAN_API_KEY;
        this.primaryHealth = !!openaiKey;
        this.secondaryHealth = !!hunyuanKey;
    }
    /**
     * 🤔 决策是否优先使用备用模型
     */
    shouldPreferSecondary(inputs) {
        const code = inputs.code || '';
        // 长文本优先用混元（更便宜）
        if (code.length > 5000) {
            return true;
        }
        // 批量分析优先用混元
        if (Array.isArray(inputs.files) && inputs.files.length > 5) {
            return true;
        }
        return false;
    }
    /**
     * 📊 获取模型状态
     */
    getStatus() {
        return {
            primary: { name: this.primary.name, healthy: this.primaryHealth },
            secondary: { name: this.secondary.name, healthy: this.secondaryHealth }
        };
    }
}
/**
 * 🔑 OpenAI模型实现
 */
export class OpenAIModel {
    name = 'OpenAI GPT-4';
    maxTokens = 128000;
    apiKey;
    baseUrl;
    constructor() {
        const config = vscode.workspace.getConfiguration('ai-explorer');
        this.apiKey = config.get('openai.apiKey') || process.env.OPENAI_API_KEY;
        this.baseUrl = config.get('openai.baseUrl') || 'https://api.openai.com/v1';
    }
    async call(prompt, inputs) {
        if (!this.apiKey) {
            throw new Error('OpenAI API Key 未配置');
        }
        const messages = [
            { role: 'system', content: prompt },
            { role: 'user', content: this.formatInputs(inputs) }
        ];
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages,
                max_tokens: 4000,
                temperature: 0.1,
                response_format: { type: 'json_object' }
            })
        });
        if (!response.ok) {
            throw new Error(`OpenAI API 错误: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return data.choices[0]?.message?.content || '{}';
    }
    formatInputs(inputs) {
        return Object.entries(inputs)
            .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
            .join('\n\n');
    }
}
/**
 * 🇨🇳 腾讯混元模型实现
 */
export class HunyuanModel {
    name = '腾讯混元';
    maxTokens = 32000;
    secretId;
    secretKey;
    region = 'ap-beijing';
    constructor() {
        const config = vscode.workspace.getConfiguration('ai-explorer');
        this.secretId = config.get('hunyuan.secretId') || process.env.HUNYUAN_SECRET_ID;
        this.secretKey = config.get('hunyuan.secretKey') || process.env.HUNYUAN_SECRET_KEY;
    }
    async call(prompt, inputs) {
        if (!this.secretId || !this.secretKey) {
            throw new Error('腾讯混元 SecretId/SecretKey 未配置');
        }
        const messages = [
            { Role: 'system', Content: prompt },
            { Role: 'user', Content: this.formatInputs(inputs) }
        ];
        try {
            // 使用腾讯云SDK
            const tencentcloud = require('tencentcloud-sdk-nodejs-hunyuan');
            const HunyuanClient = tencentcloud.hunyuan.v20230901.Client;
            const client = new HunyuanClient({
                credential: {
                    secretId: this.secretId,
                    secretKey: this.secretKey,
                },
                region: this.region,
            });
            const params = {
                Model: 'hunyuan-lite',
                Messages: messages,
                Stream: false,
                MaxTokens: 4000,
                Temperature: 0.1,
            };
            const response = await client.ChatCompletions(params);
            return response.Choices[0]?.Message?.Content || '{}';
        }
        catch (error) {
            // SDK不可用时，回退到直接HTTP调用
            return this.callDirectAPI(prompt, inputs);
        }
    }
    async callDirectAPI(prompt, inputs) {
        // 这里可以实现直接HTTP调用腾讯混元API
        // 暂时抛出错误，提示用户安装SDK
        throw new Error('请安装腾讯云SDK: npm install tencentcloud-sdk-nodejs-hunyuan');
    }
    formatInputs(inputs) {
        return Object.entries(inputs)
            .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
            .join('\n\n');
    }
}
/**
 * 🏭 模型路由器工厂
 */
export function createModelRouter() {
    const primary = new OpenAIModel();
    const secondary = new HunyuanModel();
    return new ModelRouter(primary, secondary);
}
