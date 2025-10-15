/**
 * LiteralAIFallback.ts
 * 
 * AI 兜底翻译器（只补缺词）
 * 
 * 作用：
 * - 接收整个文件名 + 未知词列表
 * - 让 AI 只返回缺失词的中文映射（JSON 格式）
 * - 不让 AI 生成整句别名，只要单词/短语映射
 * 
 * 优势：
 * - 只翻译未知词，成本最低
 * - 返回结构化数据，易于解析
 * - 可以识别短语（如 element hierarchy）
 */

import { MultiProviderAIClient } from '../../../../core/ai/MultiProviderAIClient';

/**
 * AI 兜底翻译器
 */
export class LiteralAIFallback {
    constructor(private aiClient: MultiProviderAIClient) {}

    /**
     * 为未知词获取中文翻译建议
     * @param fileName 完整文件名（用于上下文）
     * @param unknownWords 未知词列表
     * @returns 单词/短语 → 中文翻译的映射
     */
    async suggestLiteralTranslations(
        fileName: string,
        unknownWords: string[]
    ): Promise<Record<string, string>> {
        if (unknownWords.length === 0) {
            return {};
        }

        // 构建 AI 提示词
        const systemPrompt = `你是文件名"直译"助手。你的任务是为未知的英文单词或短语，提供**死板直译**的中文建议。

规则：
1. 只输出一个 JSON 对象
2. 键是英文单词或短语（小写）
3. 值是对应的中文词（不要加后缀，不要解释）
4. 必须逐词或短语直译，保持原意义
5. 如果单词可以组成短语，优先返回短语翻译
6. 不要生成整句中文，只要单词映射
7. ⚠️ 短语翻译时，只翻译单词本身，不要添加任何分隔符（系统会自动保留原文件的分隔符）

示例输出：
{
  "element": "元素",
  "hierarchy": "层级",
  "element hierarchy": "元素层级",
  "simple": "简版"
}`;

        const userPrompt = `文件名: ${fileName}
未知单词: ${unknownWords.join(', ')}

请为这些未知单词提供中文直译。如果某些单词可以组成短语（如相邻的两个词），请同时提供短语的翻译。`;

        try {
            // 调用 AI 接口
            const response = await this.aiClient.sendRequest({
                prompt: `${systemPrompt}\n\n${userPrompt}`,
                maxTokens: 500,
                temperature: 0.3
            });

            const content = response.content || '';
            
            // 解析 JSON 响应
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const mappings = JSON.parse(jsonMatch[0]);
                return mappings;
            }

            return {};
        } catch (error) {
            console.error('[LiteralAIFallback] AI 翻译失败:', error);
            return {};
        }
    }

    /**
     * 批量翻译多个文件的未知词
     * @param requests 文件名 → 未知词列表的映射
     * @returns 文件名 → 翻译映射的结果
     */
    async batchSuggest(
        requests: Array<{ fileName: string; unknownWords: string[] }>
    ): Promise<Map<string, Record<string, string>>> {
        const results = new Map<string, Record<string, string>>();

        // 串行处理（避免并发限制）
        for (const req of requests) {
            if (req.unknownWords.length > 0) {
                const mappings = await this.suggestLiteralTranslations(
                    req.fileName,
                    req.unknownWords
                );
                results.set(req.fileName, mappings);
            }
        }

        return results;
    }

    /**
     * 智能批量翻译（合并相同的未知词）
     * 
     * 优化策略：
     * - 收集所有未知词，去重
     * - 一次性翻译所有唯一未知词
     * - 分发到各个文件
     */
    async batchSuggestOptimized(
        requests: Array<{ fileName: string; unknownWords: string[] }>
    ): Promise<Map<string, Record<string, string>>> {
        // 1. 收集所有唯一未知词
        const allUnknownWords = new Set<string>();
        for (const req of requests) {
            req.unknownWords.forEach(w => allUnknownWords.add(w.toLowerCase()));
        }

        if (allUnknownWords.size === 0) {
            return new Map();
        }

        // 2. 一次性翻译所有未知词
        const globalMappings = await this.suggestLiteralTranslations(
            'batch translation',  // 虚拟文件名
            Array.from(allUnknownWords)
        );

        // 3. 为每个文件分发翻译结果
        const results = new Map<string, Record<string, string>>();
        for (const req of requests) {
            const fileMappings: Record<string, string> = {};
            for (const word of req.unknownWords) {
                const translation = globalMappings[word.toLowerCase()];
                if (translation) {
                    fileMappings[word] = translation;
                }
            }
            if (Object.keys(fileMappings).length > 0) {
                results.set(req.fileName, fileMappings);
            }
        }

        return results;
    }
}
