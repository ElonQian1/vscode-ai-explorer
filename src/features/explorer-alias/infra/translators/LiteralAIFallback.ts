/**
 * LiteralAIFallback.ts
 * 
 * AI 兜底翻译器（只补缺词）
 * 
 * 作用：
 * - 接收整个文件名 + 未知词列表
 * - 让 AI 只返回缺失词的中文映射（结构化 JSON 格式）
 * - 不让 AI 生成整句别名，只要单词/短语映射
 * - 包含对齐检测（Alignment Guard）防止词数不匹配
 * 
 * 优势：
 * - 只翻译未知词，成本最低
 * - 返回结构化数据（key, alias, kind, confidence）
 * - 支持短语识别（如 element hierarchy）
 * - 对齐检测确保质量
 */

import { MultiProviderAIClient } from '../../../../core/ai/MultiProviderAIClient';

/**
 * AI 翻译结果项（结构化）
 */
export type AITranslationItem = {
    /** 英文键（小写） */
    key: string;
    /** 中文翻译 */
    alias: string;
    /** 类型：normal=单词, phrase=短语 */
    kind: 'normal' | 'phrase';
    /** 置信度 (0-1) */
    confidence: number;
};

/**
 * AI 兜底翻译器
 */
export class LiteralAIFallback {
    constructor(private aiClient: MultiProviderAIClient) {}

    /**
     * 为未知词获取中文翻译建议（结构化版本）
     * @param fileName 完整文件名（用于上下文）
     * @param unknownWords 未知词列表
     * @returns 结构化翻译结果数组
     */
    async suggestLiteralTranslationsStructured(
        fileName: string,
        unknownWords: string[]
    ): Promise<AITranslationItem[]> {
        if (unknownWords.length === 0) {
            return [];
        }

        // 构建 AI 提示词（增强版：明确大小写处理规则）
        const systemPrompt = `你是文件名"直译"助手。你的任务是为未知的英文单词或短语，提供**死板直译**的中文建议。

规则：
1. 输出格式：JSON 数组，每项包含：{ "key": "英文（小写）", "alias": "中文", "kind": "normal或phrase", "confidence": 0-1 }
2. key: 英文单词或短语（小写）
3. alias: 对应的中文词（不要加后缀，不要解释）
4. kind: "normal"=单词, "phrase"=短语
5. confidence: 置信度（0.8-1.0表示高置信，0.5-0.8表示中等）
6. 必须逐词或短语直译，保持原意义
7. 如果单词可以组成短语，同时返回单词和短语翻译
8. ⚠️ 短语翻译时，只翻译单词本身，不要添加任何分隔符
9. ⚠️ 纯大写词（如DEBUG/WARNING）不是缩写，是普通单词，应当翻译
10. ⚠️ 必须为每个输入词返回翻译，不能遗漏

示例输出：
[
  { "key": "debug", "alias": "调试", "kind": "normal", "confidence": 1.0 },
  { "key": "warning", "alias": "警告", "kind": "normal", "confidence": 1.0 },
  { "key": "element", "alias": "元素", "kind": "normal", "confidence": 1.0 },
  { "key": "hierarchy", "alias": "层级", "kind": "normal", "confidence": 0.9 },
  { "key": "element hierarchy", "alias": "元素层级", "kind": "phrase", "confidence": 0.95 }
]`;

        const userPrompt = `文件名: ${fileName}
未知单词: ${unknownWords.join(', ')}

请为这些未知单词提供中文直译。如果某些单词可以组成短语（如相邻的两个词），请同时提供短语的翻译。
⚠️ 必须为每个输入词返回至少一个翻译结果。`;

        try {
            // 调用 AI 接口
            const response = await this.aiClient.sendRequest({
                prompt: `${systemPrompt}\n\n${userPrompt}`,
                maxTokens: 1000,
                temperature: 0.3
            });

            const content = response.content || '';
            
            // 解析 JSON 响应（支持数组格式）
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const items: AITranslationItem[] = JSON.parse(jsonMatch[0]);
                
                // 对齐检测（Alignment Guard）
                const normalItems = items.filter(item => item.kind === 'normal');
                if (normalItems.length < unknownWords.length) {
                    console.warn(`[LiteralAIFallback] 对齐警告：输入${unknownWords.length}个词，AI返回${normalItems.length}个单词翻译`);
                    console.warn(`  输入词: ${unknownWords.join(', ')}`);
                    console.warn(`  AI返回: ${normalItems.map(i => i.key).join(', ')}`);
                    
                    // 标记缺失的词
                    const returnedKeys = new Set(normalItems.map(i => i.key.toLowerCase()));
                    const missingWords = unknownWords.filter(w => !returnedKeys.has(w.toLowerCase()));
                    if (missingWords.length > 0) {
                        console.warn(`  缺失词: ${missingWords.join(', ')}`);
                    }
                }
                
                // 过滤低置信度结果（可选）
                const MIN_CONFIDENCE = 0.5;
                const filtered = items.filter(item => item.confidence >= MIN_CONFIDENCE);
                
                return filtered;
            }

            return [];
        } catch (error) {
            console.error('[LiteralAIFallback] AI 翻译失败:', error);
            return [];
        }
    }

    /**
     * 为未知词获取中文翻译建议（简化版，兼容旧接口）
     * @param fileName 完整文件名（用于上下文）
     * @param unknownWords 未知词列表
     * @returns 单词/短语 → 中文翻译的映射
     */
    async suggestLiteralTranslations(
        fileName: string,
        unknownWords: string[]
    ): Promise<Record<string, string>> {
        const items = await this.suggestLiteralTranslationsStructured(fileName, unknownWords);
        
        // 转换为简单映射（兼容现有代码）
        const mappings: Record<string, string> = {};
        for (const item of items) {
            mappings[item.key] = item.alias;
        }
        
        return mappings;
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
