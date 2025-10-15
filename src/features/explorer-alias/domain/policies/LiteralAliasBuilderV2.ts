/**
 * LiteralAliasBuilderV2.ts
 * 
 * 直译风格构建器 V2 版（保留分隔符）
 * 
 * 核心特性：
 * 1. 保留原始分隔符（_ - . 等），不重组语序
 * 2. 支持短语匹配和形态归一化
 * 3. 返回未知词列表，用于 AI 兜底（经过 AIGuard 过滤）
 * 4. 支持覆盖率计算
 * 5. 读取配置项（keepOriginalDelimiters、appendExtSuffix、literalJoiner）
 * 6. 数字智能处理（根据 numberMode 策略渲染）
 * 
 * 示例：
 * analyze_element_hierarchy.cjs
 * → 分析_元素_层级.cjs  (保留下划线和扩展名)
 */

import * as vscode from 'vscode';
import { DictionaryResolver } from '../../../../shared/naming/DictionaryResolver';
import { splitWithDelimiters, rebuildWithDelimiters, TokenPiece } from '../../../../shared/naming/SplitWithDelimiters';
import { isPureNumericToken, renderNumericToken } from '../../../../shared/naming/NumeralPolicy';
import { AIGuard } from '../../../../shared/naming/AIGuard';

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
    private aiGuard: AIGuard;

    constructor(resolver: DictionaryResolver) {
        this.resolver = resolver;
        this.aiGuard = new AIGuard();
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
                // 短语匹配成功 - 但为了保留内部分隔符，我们逐词翻译
                const phraseTokens = tokens.slice(i, i + matchedCount);
                const phraseTokenStrings = phraseTokens.map(t => t.raw);
                
                // 尝试逐词翻译，用原始分隔符连接
                const wordTranslations: string[] = [];
                for (let j = 0; j < matchedCount; j++) {
                    const token = tokens[i + j];
                    const wordEntry = this.resolver.resolveWord(token.lower);
                    
                    if (wordEntry) {
                        wordTranslations.push(wordEntry.alias);
                    } else if (token.type === 'acronym') {
                        wordTranslations.push(token.raw);
                    } else {
                        wordTranslations.push(token.raw);
                    }
                    
                    // 添加到mapped（每个词单独一项）
                    mapped.push(wordTranslations[j]);
                    mappedDelims.push(delims[i + j] || '');
                }
                
                debugParts.push(`[${phraseTokenStrings.join(' ')}→${wordTranslations.join('-')} (短语拆分)]`);
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
                } else if (isPureNumericToken(token.raw)) {
                    // 数字：根据策略渲染（keep/cn/roman）
                    const rendered = renderNumericToken(token.raw);
                    mapped.push(rendered);
                    mappedDelims.push(delims[i] || '');
                    debugParts.push(`${token.raw}→${rendered}(数字)`);
                    translatedCount++;  // 数字视为已翻译
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

        // 3. 使用 AIGuard 过滤未知词（移除数字、版本号、日期等）
        const { keys: filteredUnknown, stats } = this.aiGuard.filterUnknown(unknownWords);
        
        // 打印过滤统计（便于观察省算力效果）
        if (stats.dropped > 0) {
            console.log(this.aiGuard.formatStats(stats));
        }

        // 4. 重建别名（读取配置）
        const config = vscode.workspace.getConfiguration('aiExplorer');
        const keepOriginalDelimiters = config.get<boolean>('alias.keepOriginalDelimiters', true);
        const appendExtSuffix = config.get<boolean>('alias.appendExtSuffix', false);
        const literalJoiner = config.get<string>('alias.literalJoiner', '_');
        
        let finalDelims = mappedDelims;
        let finalExt = ext;
        
        // 如果不保留原始分隔符，统一使用 literalJoiner
        if (!keepOriginalDelimiters) {
            finalDelims = mapped.map(() => literalJoiner);
        }
        
        // 如果不保留扩展名，或者启用了扩展名后缀，则处理扩展名
        if (appendExtSuffix) {
            // 添加中文后缀（脚本、模块、组件等）
            const extSuffix = this.getExtensionSuffix(ext);
            if (extSuffix) {
                // 在最后一个词后添加后缀
                if (mapped.length > 0) {
                    mapped[mapped.length - 1] += extSuffix;
                }
                finalExt = '';  // 不保留原扩展名
            }
        } else {
            // 保留原扩展名
            finalExt = ext;
        }
        
        const alias = rebuildWithDelimiters(mapped, finalDelims, finalExt, this.keepExtension);

        // 5. 计算覆盖率和置信度
        const coverage = translatedCount / tokens.length;
        const confidence = this.calculateConfidence(coverage);

        return {
            alias,
            confidence,
            coverage,
            unknownWords: filteredUnknown,  // 返回过滤后的未知词（用于 AI 兜底）
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

    /**
     * 根据扩展名获取中文后缀
     */
    private getExtensionSuffix(ext: string): string {
        const suffixMap: Record<string, string> = {
            // JavaScript/TypeScript
            'js': '脚本',
            'cjs': '脚本',
            'mjs': '模块',
            'ts': '模块',
            'tsx': '组件',
            'jsx': '组件',
            
            // 样式
            'css': '样式',
            'scss': '样式',
            'less': '样式',
            'sass': '样式',
            
            // 配置
            'json': '配置',
            'yaml': '配置',
            'yml': '配置',
            'toml': '配置',
            'ini': '配置',
            
            // 文档
            'md': '文档',
            'txt': '文本',
            'html': '页面',
            
            // 其他
            'vue': '组件',
            'svelte': '组件',
            'py': '脚本',
            'rb': '脚本',
            'sh': '脚本',
            'bat': '脚本',
            'cmd': '脚本'
        };
        
        return suffixMap[ext.toLowerCase()] || '';
    }
}
