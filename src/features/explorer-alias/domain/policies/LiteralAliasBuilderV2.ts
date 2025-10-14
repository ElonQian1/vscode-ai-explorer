/**
 * LiteralAliasBuilderV2.ts
 * 
 * 直译风格构建器 V2 版（保留分隔符）
 * 
 * 核心特性：
 * 1. 保留原始分隔符（_ - . 等），不重组语序
 * 2. 支持短语匹配和形态归一化
 * 3. 返回未知词列表，用于 AI 兜底
 * 4. 支持覆盖率计算
 * 
 * 示例：
 * analyze_element_hierarchy.cjs
 * → 分析_元素_层级.cjs  (保留下划线和扩展名)
 */

import { DictionaryResolver } from '../../../../shared/naming/DictionaryResolver';
import { splitWithDelimiters, rebuildWithDelimiters, TokenPiece } from '../../../../shared/naming/SplitWithDelimiters';

export type LiteralResultV2 = {
    /** 翻译后的别名 */
    alias: string;
    /** 置信度 */
    confidence: number;
    /** 覆盖率（已翻译词数 / 总词数） */
    coverage: number;
    /** 未知词列表（需要 AI 兜底） */
    unknownWords: string[];
    /** 调试信息 */
    debug: string;
};

/**
 * 直译构建器 V2（保留分隔符）
 */
export class LiteralAliasBuilderV2 {
    private resolver: DictionaryResolver;
    private keepExtension: boolean = true;  // 保留扩展名

    constructor(resolver: DictionaryResolver) {
        this.resolver = resolver;
    }

    /**
     * 设置是否保留扩展名
     */
    setKeepExtension(keep: boolean): void {
        this.keepExtension = keep;
    }

    /**
     * 构建直译别名（保留分隔符版本）
     */
    buildLiteralAlias(fileName: string): LiteralResultV2 {
        // 1. 分词并保留分隔符
        const { tokens, delims, ext } = splitWithDelimiters(fileName);

        if (tokens.length === 0) {
            return {
                alias: fileName,
                confidence: 0,
                coverage: 0,
                unknownWords: [],
                debug: 'literal-v2:empty'
            };
        }

        // 2. 使用词典解析（短语优先）
        const mapped: string[] = [];
        const mappedDelims: string[] = [];  // 新增：映射后的分隔符
        const unknownWords: string[] = [];
        const debugParts: string[] = [];
        let translatedCount = 0;

        let i = 0;
        while (i < tokens.length) {
            // 尝试最长短语匹配
            const tokenStrings = tokens.map(t => t.lower);
            const [phraseEntry, matchedCount] = this.resolver.matchPhrase(tokenStrings, i);

            if (phraseEntry && matchedCount > 0) {
                // 短语匹配成功
                mapped.push(phraseEntry.alias);
                // 短语使用最后一个 token 的分隔符
                mappedDelims.push(delims[i + matchedCount - 1] || '');
                const phraseTokens = tokens.slice(i, i + matchedCount).map(t => t.raw);
                debugParts.push(`[${phraseTokens.join(' ')}→${phraseEntry.alias}]`);
                translatedCount += matchedCount;
                i += matchedCount;
            } else {
                // 单词匹配
                const token = tokens[i];
                const wordEntry = this.resolver.resolveWord(token.lower);

                if (wordEntry) {
                    // 词典命中
                    mapped.push(wordEntry.alias);
                    mappedDelims.push(delims[i] || '');
                    debugParts.push(`${token.raw}→${wordEntry.alias}`);
                    translatedCount++;
                } else if (token.type === 'acronym') {
                    // 缩写保持原样
                    mapped.push(token.raw);
                    mappedDelims.push(delims[i] || '');
                    debugParts.push(`${token.raw}(缩写)`);
                    translatedCount++;  // 缩写视为已翻译
                } else {
                    // 未知词，保留原词
                    mapped.push(token.raw);
                    mappedDelims.push(delims[i] || '');
                    unknownWords.push(token.raw);
                    debugParts.push(`${token.raw}(未知)`);
                }
                i++;
            }
        }

        // 3. 重建别名（保留分隔符）
        const alias = rebuildWithDelimiters(mapped, mappedDelims, ext, this.keepExtension);

        // 4. 计算覆盖率和置信度
        const coverage = translatedCount / tokens.length;
        const confidence = this.calculateConfidence(coverage);

        return {
            alias,
            confidence,
            coverage,
            unknownWords,
            debug: `literal-v2:${debugParts.join('|')} ext=${ext} coverage=${(coverage * 100).toFixed(0)}%`
        };
    }

    /**
     * 计算置信度
     */
    private calculateConfidence(coverage: number): number {
        if (coverage >= 1.0) return 0.95;  // 全覆盖
        if (coverage >= 0.8) return 0.85;  // 大部分覆盖
        if (coverage >= 0.5) return 0.65;  // 半数覆盖
        return 0.4;  // 覆盖不足
    }

    /**
     * 获取词典统计信息
     */
    getDictionaryStats(): { wordCount: number; phraseCount: number } {
        return this.resolver.getStats();
    }
}
