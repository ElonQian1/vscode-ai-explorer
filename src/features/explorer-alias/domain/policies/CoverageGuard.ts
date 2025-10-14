// src/features/explorer-alias/domain/policies/CoverageGuard.ts
/**
 * 覆盖度守卫：检测别名是否覆盖了源 tokens（模糊比对）
 * 
 * 防止 AI 翻译或规则引擎漏掉关键词汇，确保翻译的完整性。
 * 
 * 检查逻辑：
 * 1. 对于有中文映射的词，检查中文是否出现在别名中
 * 2. 对于未映射的词，检查英文原词是否被保留
 * 3. 停用词（the, a, an等）不计入覆盖度
 * 
 * @example
 * isCoverageSufficient('analyze_element_hierarchy', '分析层级') // false, 漏了'element'
 * isCoverageSufficient('analyze_element_hierarchy', '分析元素层级') // true
 * isCoverageSufficient('analyze_hierarchy_simple', '层级分析（简版）') // true
 */

import { tokenizeFileName } from '../../../../shared/naming/NameTokenizer';

/**
 * 词典：用于检查中文翻译
 */
const CoverageDict: Record<string, string> = {
    analyze: '分析',
    analysis: '分析',
    element: '元素',
    hierarchy: '层级',
    simple: '简版',
    basic: '基础',
    example: '示例',
    sample: '示例',
    universal: '通用',
    status: '状态',
    section: '区块',
    card: '卡片',
    panel: '面板',
    page: '页面',
    view: '视图',
    component: '组件',
    module: '模块',
    service: '服务',
    manager: '管理器',
    controller: '控制器',
    handler: '处理器',
    processor: '处理器',
    builder: '构建器',
    util: '工具',
    utils: '工具',
    helper: '辅助',
    config: '配置',
    setting: '设置',
    data: '数据',
    model: '模型',
    node: '节点',
    tree: '树',
    contact: '联系人',
    contacts: '联系人',
};

/**
 * 停用词：不计入覆盖度检查
 */
const StopWords = new Set([
    'the', 'a', 'an', 
    'and', 'or', 'but',
    'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'from', 'by',
]);

/**
 * 检查覆盖度是否充分
 * 
 * @param sourceName 原文件名
 * @param aliasZh 中文别名
 * @param allowMiss 允许的漏词数量（默认 0，即不允许漏词）
 * @returns 是否覆盖充分
 */
export function isCoverageSufficient(
    sourceName: string,
    aliasZh: string,
    allowMiss = 0
): boolean {
    const { tokens } = tokenizeFileName(sourceName);
    let missCount = 0;
    const missedWords: string[] = [];
    
    for (const token of tokens) {
        const lower = token.raw.toLowerCase();
        
        // 跳过停用词
        if (StopWords.has(lower)) {
            continue;
        }
        
        // 检查是否被覆盖
        const isCovered = checkCoverage(lower, aliasZh, token.raw);
        
        if (!isCovered) {
            missCount++;
            missedWords.push(token.raw);
        }
    }
    
    // 调试信息（开发环境）
    if (missCount > allowMiss && process.env.NODE_ENV === 'development') {
        console.log(`[CoverageGuard] 覆盖度不足: ${sourceName} → ${aliasZh}`);
        console.log(`  漏词: ${missedWords.join(', ')}`);
        console.log(`  允许漏词数: ${allowMiss}, 实际漏词数: ${missCount}`);
    }
    
    return missCount <= allowMiss;
}

/**
 * 检查单个词是否被覆盖
 */
function checkCoverage(lowerWord: string, aliasZh: string, originalWord: string): boolean {
    const zhTranslation = CoverageDict[lowerWord];
    
    if (zhTranslation) {
        // 有中文映射：检查中文是否出现
        return aliasZh.includes(zhTranslation);
    } else {
        // 无映射：检查英文原词是否被保留（不区分大小写）
        // 或者检查是否是常见缩写（如 UI, API, ID）
        const aliasLower = aliasZh.toLowerCase();
        const wordLower = originalWord.toLowerCase();
        
        // 检查原词是否出现
        if (aliasLower.includes(wordLower)) {
            return true;
        }
        
        // 检查是否是缩写（全大写或首字母大写）
        if (isLikelyAcronym(originalWord) && aliasZh.includes(originalWord.toUpperCase())) {
            return true;
        }
        
        return false;
    }
}

/**
 * 判断是否可能是缩写
 */
function isLikelyAcronym(word: string): boolean {
    // 2-4 个字母的全大写或混合大小写
    return word.length >= 2 && word.length <= 4 && /[A-Z]/.test(word);
}

/**
 * 获取覆盖度详情（用于调试）
 */
export function getCoverageDetails(sourceName: string, aliasZh: string): {
    totalTokens: number;
    coveredTokens: number;
    missedTokens: string[];
    coverageRate: number;
} {
    const { tokens } = tokenizeFileName(sourceName);
    let covered = 0;
    const missed: string[] = [];
    
    for (const token of tokens) {
        const lower = token.raw.toLowerCase();
        
        if (StopWords.has(lower)) {
            continue;
        }
        
        const isCovered = checkCoverage(lower, aliasZh, token.raw);
        
        if (isCovered) {
            covered++;
        } else {
            missed.push(token.raw);
        }
    }
    
    const total = tokens.filter(t => !StopWords.has(t.raw.toLowerCase())).length;
    const rate = total > 0 ? covered / total : 1.0;
    
    return {
        totalTokens: total,
        coveredTokens: covered,
        missedTokens: missed,
        coverageRate: rate
    };
}
