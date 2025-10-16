/**
 * AIGuard.ts
 * 
 * AI 前置守卫 V2
 * - 过滤掉不应送 AI 的 token：数字/版本/日期/哈希/缩写白名单/停用词/噪声等
 * - 智能数字识别：区分纯ID数字和有语义数字
 * - 自定义过滤规则（正则表达式）
 * - 用户白名单支持
 * - 集成统计服务
 */
import * as vscode from 'vscode';
import { AIGuardStatsService } from '../services/AIGuardStatsService';

export type GuardStats = {
    total: number;
    kept: number;
    dropped: number;
    reasons: Record<string, number>; // 统计各原因
};

export interface CustomFilterRule {
    pattern: string;  // 正则表达式
    reason: string;   // 过滤原因
    description?: string;  // 规则描述
}

export class AIGuard {
    private allowAcr = new Set<string>();
    private stopwords = new Set<string>();
    private keepVocab = new Set<string>();
    private userWhitelist = new Set<string>();
    private customRules: Array<{ regex: RegExp; reason: string }> = [];
    private cfg = vscode.workspace.getConfiguration('aiExplorer');
    private statsService: AIGuardStatsService | null = null;

    constructor(statsService?: AIGuardStatsService) {
        this.statsService = statsService || null;
        this.reloadConfig();
    }

    /**
     * 重新加载配置
     */
    reloadConfig() {
        this.cfg = vscode.workspace.getConfiguration('aiExplorer');
        
        // 缩写白名单（从现有配置读取）
        this.allowAcr = new Set(
            this.cfg.get<string[]>('alias.acronymAllowlist', [
                'UI', 'API', 'HTTP', 'HTTPS', 'URL', 'URI', 'ID', 'UUID',
                'CSS', 'HTML', 'JS', 'TS', 'JSX', 'TSX', 'JSON', 'XML',
                'CSV', 'PDF', 'PNG', 'JPG', 'GIF', 'SVG', 'DOM', 'SDK',
                'CLI', 'JWT', 'CPU', 'GPU', 'DB', 'SQL', 'ORM',
                'TCP', 'UDP', 'TLS', 'SSL', 'CI', 'CD', 'MD', 'IOS', 'OS'
            ]).map(s => s.toUpperCase())
        );

        // 停用词
        this.stopwords = new Set(
            this.cfg.get<string[]>('alias.stopwords', [
                'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'by', 'and', 'or'
            ]).map(s => s.toLowerCase())
        );

        // 保留英文词汇（不翻译）
        this.keepVocab = new Set(
            this.cfg.get<string[]>('alias.keepEnglishVocab', [
                'react', 'vue', 'redux', 'tailwind', 'jest', 'vitest',
                'webpack', 'vite', 'eslint', 'prettier', 'nodejs', 'typescript'
            ]).map(s => s.toLowerCase())
        );

        // 🆕 用户自定义白名单
        this.userWhitelist = new Set(
            this.cfg.get<string[]>('alias.userWhitelist', []).map(s => s.toLowerCase())
        );

        // 🆕 自定义过滤规则
        const rules = this.cfg.get<CustomFilterRule[]>('alias.customFilterRules', []);
        this.customRules = rules.map(rule => {
            try {
                return {
                    regex: new RegExp(rule.pattern),
                    reason: rule.reason
                };
            } catch (error) {
                console.error(`[AIGuard] 无效的正则表达式: ${rule.pattern}`, error);
                return null;
            }
        }).filter(r => r !== null) as Array<{ regex: RegExp; reason: string }>;
    }

    /**
     * 过滤未知词列表
     * @param rawUnknown 原始未知词列表
     * @param context 上下文信息（用于智能数字识别）
     * @returns 过滤后的词列表和统计信息
     */
    filterUnknown(rawUnknown: string[], context?: { fileName?: string; tokens?: string[] }): { keys: string[]; stats: GuardStats } {
        const stats: GuardStats = {
            total: rawUnknown.length,
            kept: 0,
            dropped: 0,
            reasons: {},
        };

        // 去重 + 小写
        const uniq = Array.from(new Set(rawUnknown.map(t => t.toLowerCase())));

        const keep: string[] = [];
        for (const k of uniq) {
            const reason = this.dropReason(k, context);
            if (reason) {
                stats.dropped++;
                stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
                continue;
            }
            keep.push(k);
            stats.kept++;
        }

        // 🆕 记录到统计服务
        if (this.statsService) {
            this.statsService.record(stats.dropped, stats.kept, stats.reasons);
        }

        return { keys: keep, stats };
    }

    /**
     * 🆕 智能数字识别
     * 判断数字是否可能有语义（需要AI翻译）
     * @param num 数字字符串
     * @param context 上下文
     * @returns true=有语义（保留给AI），false=纯ID（过滤）
     */
    private isSemanticNumber(num: string, context?: { fileName?: string; tokens?: string[] }): boolean {
        const intelligentMode = this.cfg.get<boolean>('alias.intelligentNumberMode', true);
        if (!intelligentMode) {
            return false;  // 关闭智能识别，所有数字都过滤
        }

        const n = parseInt(num, 10);

        // 规则1: 1-10的数字很可能有语义（第一、第二、第三...）
        if (n >= 1 && n <= 10) {
            return true;
        }

        // 规则2: 如果文件名包含"chapter/section/level/part/volume"等词，数字可能有语义
        if (context?.fileName) {
            const semanticPrefixes = /chapter|section|level|part|volume|lesson|episode|stage|phase/i;
            if (semanticPrefixes.test(context.fileName)) {
                return true;
            }
        }

        // 规则3: 如果相邻token是语义前缀
        if (context?.tokens) {
            const idx = context.tokens.findIndex(t => t.toLowerCase() === num);
            if (idx > 0) {
                const prev = context.tokens[idx - 1].toLowerCase();
                if (/^(chapter|section|level|part|volume|lesson|episode|stage|phase|step|round)$/.test(prev)) {
                    return true;
                }
            }
        }

        // 规则4: 年份范围（1900-2100）可能有语义
        if (n >= 1900 && n <= 2100) {
            return true;
        }

        // 其他情况视为纯ID
        return false;
    }

    /**
     * 判断是否应该丢弃该 token，返回原因
     * @param k 小写后的 token
     * @param context 上下文信息
     * @returns 丢弃原因，null 表示保留
     */
    private dropReason(k: string, context?: { fileName?: string; tokens?: string[] }): string | null {
        // 0. 🆕 用户自定义白名单（最高优先级）
        if (this.userWhitelist.has(k)) {
            return null;  // 不过滤，保留给AI
        }

        // 1. 🆕 自定义过滤规则（高优先级）
        for (const rule of this.customRules) {
            if (rule.regex.test(k)) {
                return `custom:${rule.reason}`;
            }
        }

        // 2. 纯数字（智能识别）
        const ignoreNumeric = this.cfg.get<boolean>('alias.ai.ignoreNumericTokens', true);
        if (ignoreNumeric && /^\d+$/.test(k)) {
            // 🆕 智能数字识别
            if (this.isSemanticNumber(k, context)) {
                return null;  // 有语义，保留给AI
            }
            return 'numeric';
        }

        // 3. 语义化版本号（v1, v2, 1.2.3, rc1, alpha, beta）
        if (/^v?\d+(\.\d+){0,3}([-._]?(alpha|beta|rc|dev|pre|post|build)\d*)?$/.test(k)) {
            return 'version';
        }

        // 4. 日期格式（2024-12-31, 20241231, 2024_12, 12-31）
        if (/^\d{4}[-_/]?\d{1,2}([-_/]?\d{1,2})?$/.test(k) || /^\d{8}$/.test(k)) {
            return 'date';
        }

        // 5. 时间戳（9 位以上数字）
        if (/^\d{9,}$/.test(k)) return 'timestamp';

        // 6. 哈希/ID（7 位以上的十六进制）
        if (/^[a-f0-9]{7,}$/.test(k)) return 'hash';
        if (/^[A-F0-9]{7,}$/.test(k)) return 'hash';

        // 7. 哈希算法名称
        if (/^(sha|md5|sha1|sha256|sha512|uuid|guid)$/.test(k)) return 'hash-algo';

        // 8. Numeronym（i18n, l10n, k8s, e2e）
        if (/^[a-z]\d+[a-z]$/.test(k)) return 'numeronym';

        // 9. 单字母（太短无意义）
        if (/^[a-z]$/.test(k)) return 'too-short';

        // 10. 停用词
        if (this.stopwords.has(k)) return 'stopword';

        // 11. 保留英文词汇（技术品牌名等）
        if (this.keepVocab.has(k)) return 'keep-english';

        // 12. 语言/地区代码（en, zh, ja, en-US, zh_CN）
        if (/^(en|zh|ja|fr|de|es|pt|ru|ko|it|nl|pl|tr|ar|he|th|vi|id)$/.test(k)) {
            return 'lang-code';
        }
        if (/^[a-z]{2}[-_][A-Za-z]{2}$/.test(k)) return 'locale';

        // 13. 颜色代码
        if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(k)) return 'color';
        if (/^(rgb|rgba|hsl|hsla)[\w\-]*$/.test(k)) return 'color-fn';

        // 14. 构建产物标记（min, map, bundle, chunk, vendor）
        if (/^(min|map|bundle|chunk|vendor|dist|build)$/.test(k)) return 'build-tag';

        // 15. 纯符号/噪声
        if (/^[\-_\.]+$/.test(k)) return 'punct';

        // 16. 缩写白名单（真缩写保留英文，不送 AI）
        if (this.allowAcr.has(k.toUpperCase())) return 'acronym-allow';

        // 17. React Hook 模式（useXxx → 建议保留英文或词典）
        if (/^use[a-z0-9]/.test(k)) return 'react-hook';

        // 18. 常见入口/占位词（index, main, default, app, home, root）
        if (/^(index|main|default|app|home|root|core|base|common|util|utils|helper|helpers|lib|libs|src|test|tests|spec|specs|demo|example|examples)$/.test(k)) {
            return 'common-placeholder';
        }

        // 19. 超长疑似噪声（>32 字符且非单纯单词）
        if (k.length > 32 && !/^[a-z0-9]+$/.test(k)) return 'gibberish';

        // 20. Base64 样式长串（连续大小写字母数字，无意义）
        if (k.length > 16 && /^[A-Za-z0-9+/=]+$/.test(k) && !/[aeiou]{2,}/.test(k)) {
            return 'base64-like';
        }

        return null;
    }

    /**
     * 格式化统计信息（用于日志输出）
     */
    formatStats(stats: GuardStats): string {
        const reasonsStr = Object.entries(stats.reasons)
            .map(([reason, count]) => `${reason}:${count}`)
            .join(', ');
        return `[AIGuard] total=${stats.total}, kept=${stats.kept}, dropped=${stats.dropped} (${reasonsStr})`;
    }

    /**
     * 🆕 添加到用户白名单
     */
    async addToUserWhitelist(word: string): Promise<void> {
        const current = this.cfg.get<string[]>('alias.userWhitelist', []);
        const updated = [...new Set([...current, word.toLowerCase()])];
        await this.cfg.update('alias.userWhitelist', updated, vscode.ConfigurationTarget.Global);
        this.reloadConfig();
        console.log(`[AIGuard] 已添加到用户白名单: ${word}`);
    }

    /**
     * 🆕 从用户白名单移除
     */
    async removeFromUserWhitelist(word: string): Promise<void> {
        const current = this.cfg.get<string[]>('alias.userWhitelist', []);
        const updated = current.filter(w => w.toLowerCase() !== word.toLowerCase());
        await this.cfg.update('alias.userWhitelist', updated, vscode.ConfigurationTarget.Global);
        this.reloadConfig();
        console.log(`[AIGuard] 已从用户白名单移除: ${word}`);
    }

    /**
     * 🆕 获取统计服务
     */
    getStatsService(): AIGuardStatsService | null {
        return this.statsService;
    }
}
