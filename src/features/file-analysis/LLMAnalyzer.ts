// src/features/file-analysis/LLMAnalyzer.ts
// [module: file-analysis] [tags: AI, LLM, OpenAI]
/**
 * LLM 文件分析器
 * 使用大语言模型进行深度代码分析
 */

import { Logger } from '../../core/logging/Logger';
import { MultiProviderAIClient } from '../../core/ai/MultiProviderAIClient';
import { Inference, Recommendation } from './types';

interface LLMAnalysisInput {
    filePath: string;
    lang: string;
    content: string;
    staticAnalysis: {
        apiCount: number;
        apiSummary: string;
        depsCount: number;
        depsSummary: string;
    };
}

interface LLMAnalysisOutput {
    summary: {
        zh: string;
        en: string;
    };
    inferences: Inference[];
    recommendations: Recommendation[];
}

export class LLMAnalyzer {
    private aiClient: MultiProviderAIClient;
    private logger: Logger;

    constructor(aiClient: MultiProviderAIClient, logger: Logger) {
        this.aiClient = aiClient;
        this.logger = logger;
    }

    /**
     * 分析文件内容
     */
    public async analyzeFile(input: LLMAnalysisInput): Promise<LLMAnalysisOutput> {
        this.logger.info(`[LLMAnalyzer] 开始AI分析: ${input.filePath}`);

        try {
            const prompt = this.buildPrompt(input);
            const systemPrompt = this.getSystemPrompt();
            
            // 合并系统提示词和用户提示词
            const fullPrompt = `${systemPrompt}\n\n${prompt}`;
            
            this.logger.debug('[LLMAnalyzer] 发送请求到AI服务...');
            
            const response = await this.aiClient.sendRequest({
                prompt: fullPrompt,
                temperature: 0.3, // 较低温度,保持分析的准确性
                maxTokens: 2000
            });

            this.logger.debug('[LLMAnalyzer] 收到AI响应');

            // 解析AI返回的JSON
            const result = this.parseResponse(response.content);
            
            this.logger.info(`[LLMAnalyzer] 分析完成: ${result.inferences.length} 推断, ${result.recommendations.length} 建议`);
            
            return result;

        } catch (error) {
            this.logger.error('[LLMAnalyzer] AI分析失败', error);
            
            // 返回降级结果
            return this.getFallbackResult(input);
        }
    }

    /**
     * 构建系统提示词
     */
    private getSystemPrompt(): string {
        return `你是一个专业的代码分析专家。你的任务是分析代码文件,提供深入的见解和建议。

**输出格式要求**:
必须返回有效的JSON,格式如下:
\`\`\`json
{
  "summary": {
    "zh": "中文摘要(2-3句话,描述文件的核心功能和作用)",
    "en": "English summary (2-3 sentences about the file's core functionality)"
  },
  "inferences": [
    {
      "id": "i1",
      "text": "推断内容(基于代码特征进行的合理推测)",
      "confidence": 0.85,
      "reasoning": "推断的理由和依据"
    }
  ],
  "recommendations": [
    {
      "id": "r1",
      "text": "优化建议内容",
      "reason": "建议的原因",
      "priority": "high|medium|low"
    }
  ]
}
\`\`\`

**分析原则**:
1. 摘要要准确、简洁,突出文件的核心职责
2. 推断要基于代码证据,置信度范围0-1
3. 建议要实用、可操作,优先级明确
4. 只返回JSON,不要包含其他文字`;
    }

    /**
     * 构建用户提示词
     */
    private buildPrompt(input: LLMAnalysisInput): string {
        // 截取文件内容(避免超过token限制)
        const maxContentLength = 4000;
        const truncatedContent = input.content.length > maxContentLength
            ? input.content.substring(0, maxContentLength) + '\n\n... (内容已截断)'
            : input.content;

        return `请分析以下代码文件:

**文件信息**:
- 路径: ${input.filePath}
- 语言: ${input.lang}
- API数量: ${input.staticAnalysis.apiCount}
- API概要: ${input.staticAnalysis.apiSummary}
- 依赖数量: ${input.staticAnalysis.depsCount}
- 依赖概要: ${input.staticAnalysis.depsSummary}

**代码内容**:
\`\`\`${input.lang}
${truncatedContent}
\`\`\`

请根据以上信息,生成分析结果JSON。`;
    }

    /**
     * 解析AI响应
     */
    private parseResponse(content: string): LLMAnalysisOutput {
        try {
            // 尝试提取JSON(可能包含在markdown代码块中)
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                             content.match(/```\s*([\s\S]*?)\s*```/) ||
                             [null, content];
            
            const jsonStr = jsonMatch[1] || content;
            const parsed = JSON.parse(jsonStr.trim());

            // 验证和规范化数据
            return {
                summary: {
                    zh: parsed.summary?.zh || '暂无中文摘要',
                    en: parsed.summary?.en || 'No English summary available'
                },
                inferences: this.normalizeInferences(parsed.inferences || []),
                recommendations: this.normalizeRecommendations(parsed.recommendations || [])
            };

        } catch (error) {
            this.logger.error('[LLMAnalyzer] JSON解析失败', error);
            this.logger.debug('[LLMAnalyzer] 原始响应:', content);
            
            throw new Error('AI响应格式无效');
        }
    }

    /**
     * 规范化推断数据
     */
    private normalizeInferences(inferences: any[]): Inference[] {
        return inferences.map((inf, idx) => ({
            id: inf.id || `i${idx + 1}`,
            text: inf.text || '',
            confidence: this.clamp(inf.confidence || 0.5, 0, 1),
            evidence: [] // AI生成的推断暂无具体证据
        }));
    }

    /**
     * 规范化建议数据
     */
    private normalizeRecommendations(recommendations: any[]): Recommendation[] {
        return recommendations.map((rec, idx) => ({
            id: rec.id || `r${idx + 1}`,
            text: rec.text || '',
            reason: rec.reason || '',
            evidence: [],
            priority: this.normalizePriority(rec.priority)
        }));
    }

    /**
     * 规范化优先级
     */
    private normalizePriority(priority: any): 'low' | 'medium' | 'high' {
        const p = String(priority).toLowerCase();
        if (p === 'high' || p === 'h') return 'high';
        if (p === 'low' || p === 'l') return 'low';
        return 'medium';
    }

    /**
     * 限制数值范围
     */
    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * 降级结果(AI失败时返回)
     */
    private getFallbackResult(input: LLMAnalysisInput): LLMAnalysisOutput {
        this.logger.info('[LLMAnalyzer] 使用降级结果');
        
        return {
            summary: {
                zh: `这是一个 ${input.lang} 文件(AI分析暂时不可用,显示基础信息)。`,
                en: `This is a ${input.lang} file (AI analysis temporarily unavailable, showing basic info).`
            },
            inferences: [
                {
                    id: 'i_fallback',
                    text: 'AI分析服务暂时不可用,请稍后重试或检查API配置',
                    confidence: 1.0,
                    evidence: []
                }
            ],
            recommendations: []
        };
    }
}
