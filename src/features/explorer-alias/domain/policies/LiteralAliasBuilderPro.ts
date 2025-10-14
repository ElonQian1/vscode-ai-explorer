/**
 * LiteralAliasBuilderPro.ts
 * 
 * 直译风格构建器 Pro 版，支持：
 * 1. 最长短语匹配（element hierarchy → 元素_层级）
 * 2. 形态归一化（elements → element）
 * 3. 分层词典加载
 * 4. 覆盖率计算
 */

import { DictionaryResolver } from '../../../../shared/naming/DictionaryResolver';
import { tokenizeFileName } from '../../../../shared/naming/NameTokenizer';

export type LiteralResultPro = {
    alias: string;
    confidence: number;
    coverage: number; // 新增：覆盖率（已翻译词元数 / 总词元数）
    debug: string;
};

/**
 * 直译风格构建器 Pro 版
 */
export class LiteralAliasBuilderPro {
    private resolver: DictionaryResolver;
    private joiner: string = '_'; // 默认连接符
    private appendExtSuffix: boolean = true;

    constructor(resolver: DictionaryResolver) {
        this.resolver = resolver;
    }

    /**
     * 设置连接符
     */
    setJoiner(joiner: string): void {
        this.joiner = joiner;
    }

    /**
     * 设置是否添加扩展名后缀
     */
    setAppendExtSuffix(append: boolean): void {
        this.appendExtSuffix = append;
    }

    /**
     * 构建直译别名（Pro 版）
     */
    buildLiteralAlias(fileName: string): LiteralResultPro {
        // 1. 分词
        const { tokens, ext } = tokenizeFileName(fileName);
        const tokenStrings = tokens.map(t => t.lower); // Token 转小写字符串

        if (tokenStrings.length === 0) {
            return {
                alias: fileName,
                confidence: 0,
                coverage: 0,
                debug: 'literal-pro:empty'
            };
        }

        // 2. 使用 DictionaryResolver 进行最长短语匹配
        const parts: string[] = [];
        const debugParts: string[] = [];
        let i = 0;
        let translatedCount = 0; // 已翻译的词元数

        while (i < tokenStrings.length) {
            // 尝试最长短语匹配
            const [phraseEntry, matchedCount] = this.resolver.matchPhrase(tokenStrings, i);

            if (phraseEntry && matchedCount > 0) {
                // 匹配到短语
                parts.push(phraseEntry.alias);
                debugParts.push(`[${tokenStrings.slice(i, i + matchedCount).join(' ')}→${phraseEntry.alias}]`);
                translatedCount += matchedCount;
                i += matchedCount;
            } else {
                // 没有短语匹配，尝试单词匹配
                const token = tokenStrings[i];
                const wordEntry = this.resolver.resolveWord(token);

                if (wordEntry) {
                    parts.push(wordEntry.alias);
                    debugParts.push(`${token}→${wordEntry.alias}`);
                    translatedCount++;
                } else {
                    // 未知词，保留原词
                    parts.push(token);
                    debugParts.push(`${token}(未知)`);
                }
                i++;
            }
        }

        // 3. 拼接
        let alias = parts.join(this.joiner);

        // 4. 添加扩展名后缀
        if (this.appendExtSuffix && ext) {
            const extSuffix = this.getExtensionSuffix(ext);
            if (extSuffix) {
                alias += extSuffix;
            }
        }

        // 5. 计算覆盖率和置信度
        const coverage = translatedCount / tokenStrings.length;
        const confidence = this.calculateConfidence(coverage, translatedCount, tokenStrings.length);

        return {
            alias,
            confidence,
            coverage,
            debug: `literal-pro:${debugParts.join('|')} ext=${ext} coverage=${(coverage * 100).toFixed(0)}%`
        };
    }

    /**
     * 计算置信度
     * - 覆盖率 100%：0.95
     * - 覆盖率 >= 80%：0.8
     * - 覆盖率 >= 50%：0.6
     * - 其他：0.4
     */
    private calculateConfidence(coverage: number, translatedCount: number, totalCount: number): number {
        if (coverage >= 1.0) {
            return 0.95; // 全覆盖，高置信度
        }
        if (coverage >= 0.8) {
            return 0.8; // 大部分覆盖
        }
        if (coverage >= 0.5) {
            return 0.6; // 半数覆盖
        }
        return 0.4; // 覆盖不足
    }

    /**
     * 获取扩展名后缀
     */
    private getExtensionSuffix(ext: string): string {
        const extMap: Record<string, string> = {
            // 脚本类
            'js': '脚本',
            'cjs': '脚本',
            'mjs': '脚本',
            'ts': '脚本',
            'cts': '脚本',
            'mts': '脚本',
            'py': '脚本',
            'sh': '脚本',
            'bash': '脚本',
            
            // 模块类
            'tsx': '组件',
            'jsx': '组件',
            'vue': '组件',
            
            // 配置类
            'json': '配置',
            'yaml': '配置',
            'yml': '配置',
            'toml': '配置',
            'ini': '配置',
            
            // 文档类
            'md': '文档',
            'txt': '文档',
            'rst': '文档',
            
            // 样式类
            'css': '样式',
            'scss': '样式',
            'sass': '样式',
            'less': '样式'
        };

        return extMap[ext.toLowerCase()] || '';
    }

    /**
     * 获取词典统计信息（用于调试）
     */
    getDictionaryStats(): { wordCount: number; phraseCount: number } {
        return this.resolver.getStats();
    }
}
