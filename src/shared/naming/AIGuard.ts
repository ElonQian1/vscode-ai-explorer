/**
 * AIGuard.ts
 * 
 * AI 前置守卫
 * - 过滤掉不应送 AI 的 token：数字/版本/日期/哈希/缩写白名单/停用词/噪声等
 * - 可配置开关，并记录过滤统计（便于观察省钱效果）
 */
import * as vscode from 'vscode';

export type GuardStats = {
    total: number;
    kept: number;
    dropped: number;
    reasons: Record<string, number>; // 统计各原因
};

export class AIGuard {
    private allowAcr = new Set<string>();
    private stopwords = new Set<string>();
    private keepVocab = new Set<string>();
    private cfg = vscode.workspace.getConfiguration('aiExplorer');

    constructor() {
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
    }

    /**
     * 过滤未知词列表
     * @param rawUnknown 原始未知词列表
     * @returns 过滤后的词列表和统计信息
     */
    filterUnknown(rawUnknown: string[]): { keys: string[]; stats: GuardStats } {
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
            const reason = this.dropReason(k);
            if (reason) {
                stats.dropped++;
                stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
                continue;
            }
            keep.push(k);
            stats.kept++;
        }

        return { keys: keep, stats };
    }

    /**
     * 判断是否应该丢弃该 token，返回原因
     * @param k 小写后的 token
     * @returns 丢弃原因，null 表示保留
     */
    private dropReason(k: string): string | null {
        // 开关：可在 settings.json 控制
        const ignoreNumeric = this.cfg.get<boolean>('alias.ai.ignoreNumericTokens', true);

        // 1. 纯数字
        if (ignoreNumeric && /^\d+$/.test(k)) return 'numeric';

        // 2. 语义化版本号（v1, v2, 1.2.3, rc1, alpha, beta）
        if (/^v?\d+(\.\d+){0,3}([-._]?(alpha|beta|rc|dev|pre|post|build)\d*)?$/.test(k)) {
            return 'version';
        }

        // 3. 日期格式（2024-12-31, 20241231, 2024_12, 12-31）
        if (/^\d{4}[-_/]?\d{1,2}([-_/]?\d{1,2})?$/.test(k) || /^\d{8}$/.test(k)) {
            return 'date';
        }

        // 4. 时间戳（9 位以上数字）
        if (/^\d{9,}$/.test(k)) return 'timestamp';

        // 5. 哈希/ID（7 位以上的十六进制）
        if (/^[a-f0-9]{7,}$/.test(k)) return 'hash';
        if (/^[A-F0-9]{7,}$/.test(k)) return 'hash';

        // 6. 哈希算法名称
        if (/^(sha|md5|sha1|sha256|sha512|uuid|guid)$/.test(k)) return 'hash-algo';

        // 7. Numeronym（i18n, l10n, k8s, e2e）
        if (/^[a-z]\d+[a-z]$/.test(k)) return 'numeronym';

        // 8. 单字母（太短无意义）
        if (/^[a-z]$/.test(k)) return 'too-short';

        // 9. 停用词
        if (this.stopwords.has(k)) return 'stopword';

        // 10. 保留英文词汇（技术品牌名等）
        if (this.keepVocab.has(k)) return 'keep-english';

        // 11. 语言/地区代码（en, zh, ja, en-US, zh_CN）
        if (/^(en|zh|ja|fr|de|es|pt|ru|ko|it|nl|pl|tr|ar|he|th|vi|id)$/.test(k)) {
            return 'lang-code';
        }
        if (/^[a-z]{2}[-_][A-Za-z]{2}$/.test(k)) return 'locale';

        // 12. 颜色代码
        if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(k)) return 'color';
        if (/^(rgb|rgba|hsl|hsla)[\w\-]*$/.test(k)) return 'color-fn';

        // 13. 构建产物标记（min, map, bundle, chunk, vendor）
        if (/^(min|map|bundle|chunk|vendor|dist|build)$/.test(k)) return 'build-tag';

        // 14. 纯符号/噪声
        if (/^[\-_\.]+$/.test(k)) return 'punct';

        // 15. 缩写白名单（真缩写保留英文，不送 AI）
        if (this.allowAcr.has(k.toUpperCase())) return 'acronym-allow';

        // 16. React Hook 模式（useXxx → 建议保留英文或词典）
        if (/^use[a-z0-9]/.test(k)) return 'react-hook';

        // 17. 常见入口/占位词（index, main, default, app, home, root）
        if (/^(index|main|default|app|home|root|core|base|common|util|utils|helper|helpers|lib|libs|src|test|tests|spec|specs|demo|example|examples)$/.test(k)) {
            return 'common-placeholder';
        }

        // 18. 超长疑似噪声（>32 字符且非单纯单词）
        if (k.length > 32 && !/^[a-z0-9]+$/.test(k)) return 'gibberish';

        // 19. Base64 样式长串（连续大小写字母数字，无意义）
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
}
