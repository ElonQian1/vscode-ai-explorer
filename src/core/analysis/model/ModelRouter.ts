// src/core/analysis/model/ModelRouter.ts
import * as vscode from 'vscode';

export interface ChatModel {
  name: string;
  maxTokens: number;
  call(prompt: string, inputs: Record<string, any>): Promise<string>; // 返回严格 JSON 字符串
}

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
  private primaryHealth = true;
  private secondaryHealth = true;
  private lastHealthCheck = 0;
  private readonly healthCheckInterval = 60000; // 1分钟

  constructor(private primary: ChatModel, private secondary: ChatModel) {}

  async smartCall(prompt: string, inputs: Record<string, any>): Promise<string> {
    await this.checkHealth();

    // 根据健康状态选择模型
    const useSecondary = !this.primaryHealth || this.shouldPreferSecondary(inputs);
    
    try {
      if (useSecondary && this.secondaryHealth) {
        return await this.secondary.call(prompt, inputs);
      } else if (this.primaryHealth) {
        return await this.primary.call(prompt, inputs);
      } else if (this.secondaryHealth) {
        return await this.secondary.call(prompt, inputs);
      } else {
        throw new Error('所有AI模型都不可用');
      }
    } catch (error) {
      console.warn(`Primary model (${this.primary.name}) failed, trying secondary:`, error);
      
      // 主模型失败，尝试备用模型
      if (!useSecondary && this.secondaryHealth) {
        this.primaryHealth = false; // 标记主模型健康状态
        return await this.secondary.call(prompt, inputs);
      } else if (useSecondary && this.primaryHealth) {
        this.secondaryHealth = false; // 标记备用模型健康状态
        return await this.primary.call(prompt, inputs);
      }
      
      throw error;
    }
  }

  /**
   * 🏥 健康检查
   */
  private async checkHealth(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval) {
      return;
    }

    this.lastHealthCheck = now;

    // 检查配置是否可用
    const config = vscode.workspace.getConfiguration('ai-explorer');
    const openaiKey = config.get<string>('openai.apiKey') || process.env.OPENAI_API_KEY;
    const hunyuanKey = config.get<string>('hunyuan.apiKey') || process.env.HUNYUAN_API_KEY;

    this.primaryHealth = !!openaiKey;
    this.secondaryHealth = !!hunyuanKey;
  }

  /**
   * 🤔 决策是否优先使用备用模型
   */
  private shouldPreferSecondary(inputs: Record<string, any>): boolean {
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
  getStatus(): { primary: { name: string; healthy: boolean }; secondary: { name: string; healthy: boolean } } {
    return {
      primary: { name: this.primary.name, healthy: this.primaryHealth },
      secondary: { name: this.secondary.name, healthy: this.secondaryHealth }
    };
  }
}

/**
 * 🔑 OpenAI模型实现
 */
export class OpenAIModel implements ChatModel {
  name = 'OpenAI GPT-4';
  maxTokens = 128000;

  private apiKey: string | undefined;
  private baseUrl: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('ai-explorer');
    this.apiKey = config.get<string>('openai.apiKey') || process.env.OPENAI_API_KEY;
    this.baseUrl = config.get<string>('openai.baseUrl') || 'https://api.openai.com/v1';
  }

  async call(prompt: string, inputs: Record<string, any>): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API Key 未配置');
    }

    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: this.formatInputs(inputs) }
    ];

    // 创建带超时的AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
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
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OpenAI API 错误: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '{}';
    } catch (error) {
      clearTimeout(timeoutId);
      
      // 检查是否是网络或超时错误
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('OpenAI API 请求超时 (30秒)');
        }
        if (error.message.includes('fetch failed') || error.message.includes('TIMED_OUT')) {
          throw new Error(`网络连接失败: ${error.message}`);
        }
      }
      
      throw error;
    }
  }

  private formatInputs(inputs: Record<string, any>): string {
    return Object.entries(inputs)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join('\n\n');
  }
}

/**
 * 🇨🇳 腾讯混元模型实现
 */
export class HunyuanModel implements ChatModel {
  name = '腾讯混元';
  maxTokens = 32000;

  private secretId: string | undefined;
  private secretKey: string | undefined;
  private region = 'ap-beijing';

  constructor() {
    const config = vscode.workspace.getConfiguration('ai-explorer');
    this.secretId = config.get<string>('hunyuan.secretId') || process.env.HUNYUAN_SECRET_ID;
    this.secretKey = config.get<string>('hunyuan.secretKey') || process.env.HUNYUAN_SECRET_KEY;
  }

  async call(prompt: string, inputs: Record<string, any>): Promise<string> {
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

    } catch (error: any) {
      // SDK不可用时，回退到直接HTTP调用
      return this.callDirectAPI(prompt, inputs);
    }
  }

  private async callDirectAPI(prompt: string, inputs: Record<string, any>): Promise<string> {
    // 这里可以实现直接HTTP调用腾讯混元API
    // 暂时抛出错误，提示用户安装SDK
    throw new Error('请安装腾讯云SDK: npm install tencentcloud-sdk-nodejs-hunyuan');
  }

  private formatInputs(inputs: Record<string, any>): string {
    return Object.entries(inputs)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join('\n\n');
  }
}

/**
 * 🏭 模型路由器工厂
 */
export function createModelRouter(): ModelRouter {
  const primary = new OpenAIModel();
  const secondary = new HunyuanModel();
  return new ModelRouter(primary, secondary);
}