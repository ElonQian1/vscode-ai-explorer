// src/features/explorer-alias/domain/policies/SmartRuleEngine.ts
/**
 * 智能规则引擎：不依赖 AI 的中文别名生成
 * 
 * 翻译流程：
 * 1. 分词（统一处理所有命名风格）
 * 2. 词典映射（名词、形容词、缩写）
 * 3. 选择中心词（Head Noun）
 * 4. 中文语序重组（修饰词 + 中心词 + 变体）
 * 5. 添加扩展名后缀（.tsx → 组件）
 * 6. 安全清洗（避免非法文件名）
 * 
 * @example
 * translate('analyze_hierarchy_simple.cjs')
 * // => { alias: '层级分析（简版）脚本', source: 'rule', confidence: 0.88 }
 * 
 * translate('universal-analysis-status-section.tsx')
 * // => { alias: '通用分析状态区块组件', source: 'rule', confidence: 0.88 }
 * 
 * translate('StepCard.tsx')
 * // => { alias: '步骤卡片组件', source: 'rule', confidence: 0.88 }
 */

import { tokenizeFileName, Token } from '../../../../shared/naming/NameTokenizer';

export type AliasResult = {
    /** 翻译后的别名 */
    alias: string;
    /** 来源：规则引擎 */
    source: 'rule';
    /** 置信度：0-1 */
    confidence: number;
    /** 调试信息（可选） */
    debug?: string;
};

/**
 * 名词词典（主要词汇）
 * 优先级：section > block > panel > card > page > view > analysis
 */
const NounMap: Record<string, string> = {
    // UI 组件类
    section: '区块',
    block: '区块',
    panel: '面板',
    card: '卡片',
    page: '页面',
    view: '视图',
    component: '组件',
    widget: '部件',
    button: '按钮',
    input: '输入框',
    form: '表单',
    modal: '弹窗',
    dialog: '对话框',
    menu: '菜单',
    list: '列表',
    table: '表格',
    grid: '网格',
    
    // 功能类
    analysis: '分析',
    analyze: '分析',
    analyzer: '分析器',
    processor: '处理器',
    handler: '处理器',
    manager: '管理器',
    controller: '控制器',
    service: '服务',
    provider: '提供者',
    factory: '工厂',
    builder: '构建器',
    validator: '验证器',
    formatter: '格式化器',
    parser: '解析器',
    renderer: '渲染器',
    
    // 数据类
    data: '数据',
    config: '配置',
    setting: '设置',
    option: '选项',
    param: '参数',
    parameter: '参数',
    model: '模型',
    entity: '实体',
    item: '条目',
    record: '记录',
    contact: '联系人',  // 新增：联系人/通讯录
    contacts: '联系人',
    
    // 状态类
    status: '状态',
    state: '状态',
    info: '信息',
    detail: '详情',
    summary: '摘要',
    
    // 层级/结构类
    hierarchy: '层级',
    tree: '树',
    node: '节点',
    element: '元素',  // 新增：元素/DOM元素/数组元素
    parent: '父级',
    child: '子级',
    root: '根',
    
    // 操作类
    step: '步骤',
    action: '操作',
    task: '任务',
    job: '任务',
    process: '流程',
    workflow: '工作流',
    
    // 其他
    util: '工具',
    utils: '工具',
    helper: '辅助',
    common: '公共',
    shared: '共享',
    core: '核心',
};

/**
 * 形容词/修饰词词典
 */
const AdjMap: Record<string, string> = {
    // 范围
    universal: '通用',
    global: '全局',
    local: '本地',
    common: '通用',
    shared: '共享',
    public: '公开',
    private: '私有',
    
    // 级别
    simple: '简版',
    basic: '基础',
    advanced: '高级',
    pro: '专业',
    lite: '轻量',
    mini: '迷你',
    full: '完整',
    
    // 测试相关
    test: '测试',
    spec: '测试',
    mock: '桩',
    demo: '示例',
    example: '示例',
    sample: '示例',
    
    // 状态
    active: '活跃',
    disabled: '禁用',
    enabled: '启用',
    loading: '加载中',
    
    // 其他
    main: '主',
    sub: '子',
    new: '新',
    old: '旧',
    current: '当前',
    default: '默认',
    custom: '自定义',
};

/**
 * 缩写词典
 */
const AcronymMap: Record<string, string> = {
    ui: 'UI',
    id: 'ID',
    api: 'API',
    http: 'HTTP',
    https: 'HTTPS',
    url: 'URL',
    uri: 'URI',
    dom: 'DOM',
    html: 'HTML',
    css: 'CSS',
    js: 'JS',
    ts: 'TS',
    json: 'JSON',
    xml: 'XML',
    sql: 'SQL',
    db: '数据库',
    ai: 'AI',
};

/**
 * 中心词优先级（越靠前优先级越高）
 * 用于在多个名词中选择"主干"
 * 注意：UI 组件类优先级最高，业务逻辑类次之
 */
const HeadPriority = [
    'section',    // 区块（UI）
    'block',      // 区块（UI）
    'panel',      // 面板（UI）
    'card',       // 卡片（UI）
    'page',       // 页面（UI）
    'view',       // 视图（UI）
    'component',  // 组件（UI）
    'manager',    // 管理器（业务）
    'controller', // 控制器（业务）
    'service',    // 服务（业务）
    'processor',  // 处理器（业务）
    'handler',    // 处理器（业务）
    'analysis',   // 分析（业务）- 降低优先级
    'analyzer',   // 分析器（业务）
];

/**
 * 高优先级名词（更可能是中心词，而非修饰词）
 * 这些词通常表达核心概念，应该作为"中心词"
 */
const HighPriorityNouns = [
    // 分析/处理类（动作型名词）
    'analysis', 'analyze',    // ← analyze 也要加上！
    'analyzer',
    'processor', 'handler',
    'parser', 'renderer',
    'formatter', 'validator',
    
    // 管理/控制类
    'manager', 'controller',
    'service', 'provider',
    
    // 构建类
    'builder', 'factory',
    'generator', 'creator',
];

/**
 * 扩展名后缀映射
 */
const ExtSuffix: Record<string, string> = {
    // React/Vue 组件
    tsx: '组件',
    jsx: '组件',
    vue: '组件',
    
    // TypeScript/JavaScript
    ts: '模块',
    js: '脚本',
    mjs: '脚本',
    cjs: '脚本',
    
    // 样式
    css: '样式',
    scss: '样式',
    sass: '样式',
    less: '样式',
    
    // 文档
    md: '文档',
    markdown: '文档',
    txt: '文本',
    
    // 配置
    json: '配置',
    yaml: '配置',
    yml: '配置',
    toml: '配置',
    ini: '配置',
    
    // 测试
    spec: '测试',
    test: '测试',
};

/**
 * 变体词（会放到括号里）
 */
const VariantWords = [
    'simple', 'lite', 'mini', 'basic', 'advanced', 'pro',
    'test', 'spec', 'mock', 'demo', 'example', 'sample'
];

export class SmartRuleEngine {
    /**
     * 翻译文件名为中文别名
     */
    translate(name: string): AliasResult | undefined {
        const { tokens, ext } = tokenizeFileName(name);
        
        if (!tokens.length) {
            return undefined;
        }

        // 词性分类
        const nouns: Array<{ zh: string; en: string }> = [];
        const adjs: Array<{ zh: string; en: string }> = [];
        const acronyms: Array<{ zh: string; en: string }> = [];
        const others: string[] = [];

        for (const t of tokens) {
            // 缩写优先
            if (t.type === 'acronym' && AcronymMap[t.lower]) {
                acronyms.push({ zh: AcronymMap[t.lower], en: t.lower });
                continue;
            }
            
            // 形容词
            if (AdjMap[t.lower]) {
                adjs.push({ zh: AdjMap[t.lower], en: t.lower });
                continue;
            }
            
            // 名词
            if (NounMap[t.lower]) {
                nouns.push({ zh: NounMap[t.lower], en: t.lower });
                continue;
            }
            
            // 未命中的词（可能是专有名词或新词）
            others.push(t.raw);
        }

        // 选择中心词（Head Noun）
        let head = this.selectHeadNoun(nouns, acronyms, others, ext);
        
        // 如果没有中心词，但有扩展名后缀，可以只用后缀
        if (!head) {
            const suffixFromExt = ExtSuffix[ext] || '';
            if (suffixFromExt) {
                // 只有扩展名后缀的情况（如 UserProfile.tsx → 组件）
                const alias = sanitize(suffixFromExt);
                return {
                    alias,
                    source: 'rule',
                    confidence: 0.4, // 低置信度，因为没有识别出具体含义
                    debug: `tokens=${tokens.map(t => t.raw).join('|')} head=none ext=${ext} (suffix-only)`
                };
            }
            // 完全无法翻译
            return undefined;
        }

        // 构建修饰词列表（去掉中心词）
        const mods: string[] = [];
        
        // 1. 形容词/限定词（但排除会放入变体的词，避免重复）
        const variantEnWords = new Set(VariantWords);
        const nonVariantAdjs = adjs.filter(a => !variantEnWords.has(a.en));
        mods.push(...nonVariantAdjs.map(a => a.zh));
        
        // 2. 其他名词（非中心词）
        mods.push(...nouns.filter(n => n !== head).map(n => n.zh));
        
        // 3. 缩写词（非中心词）
        mods.push(...acronyms.filter(a => a !== head).map(a => a.zh));

        // 构建核心词（修饰词 + 中心词）
        const core = `${mods.join('')}${head.zh}`;

        // 变体词（放括号）
        const variants = this.extractVariants(adjs);
        const variantStr = variants.length 
            ? `（${Array.from(new Set(variants)).join('、')}）` 
            : '';

        // 扩展名后缀（避免重复：如果中心词已经是"配置"，则不再添加"配置"后缀）
        const suffixFromExt = ExtSuffix[ext] || '';
        const suffix = (suffixFromExt && suffixFromExt !== head.zh) ? suffixFromExt : '';

        // 最终组装
        const raw = `${core}${variantStr}${suffix}`;
        const alias = sanitize(raw);

        // 计算置信度
        const confidence = this.calculateConfidence(tokens, nouns, adjs, acronyms);

        return {
            alias,
            source: 'rule',
            confidence,
            debug: `tokens=${tokens.map(t => t.raw).join('|')} head=${head.en} ext=${ext}`
        };
    }

    /**
     * 选择中心词（主干名词）
     * 
     * 选择策略（按优先级）：
     * 1. UI 组件类词汇（section, card, panel等）- 最高优先级
     * 2. 高优先级缩写（API, UI等） - 技术术语作为中心
     * 3. 高优先级名词（analysis, manager等动作型名词）- 次高优先级
     * 4. 最后一个名词（符合中文"核心在后"的语序习惯）
     * 5. 普通缩写词
     * 6. 未知词（但如果只有扩展名后缀可用，返回undefined）
     */
    private selectHeadNoun(
        nouns: Array<{ zh: string; en: string }>,
        acronyms: Array<{ zh: string; en: string }>,
        others: string[],
        ext: string
    ): { zh: string; en: string } | undefined {
        // 策略1：优先选择 UI 组件类词汇（section, card, panel 等）
        // 这些词通常是真正的"中心"
        const uiPriority = ['section', 'block', 'panel', 'card', 'page', 'view', 'component'];
        for (const priority of uiPriority) {
            const found = nouns.find(n => n.en === priority);
            if (found) {
                return found;
            }
        }

        // 策略1.5：高优先级缩写（API, UI等）
        // 这些技术术语通常是中心词
        // 例如：ContactAPI → "联系人API"，API 是中心词
        const highPriorityAcronyms = ['api'];
        const highPriorityAcronym = acronyms.find(a =>
            highPriorityAcronyms.includes(a.en)
        );
        if (highPriorityAcronym) {
            return highPriorityAcronym;
        }

        // 策略2：高优先级名词（动作型名词，如 analysis, manager）
        // 这些词更可能是中心词而不是修饰词
        // 例如：analyze_hierarchy → "层级分析"，hierarchy 是修饰词
        const highPriorityNoun = nouns.find(n => 
            HighPriorityNouns.includes(n.en)
        );
        if (highPriorityNoun) {
            return highPriorityNoun;
        }

        // 策略3：最后一个名词作为中心词（符合中文习惯）
        if (nouns.length > 0) {
            return nouns[nouns.length - 1];
        }

        // 策略4：其他缩写作为中心词
        if (acronyms.length > 0) {
            return acronyms[acronyms.length - 1];
        }

        // 策略5：未知词作为中心词（但如果有扩展名后缀，可以只用后缀）
        if (others.length > 0) {
            const last = others[others.length - 1];
            const suffixFromExt = ExtSuffix[ext] || '';
            
            // 如果有明确的扩展名后缀（如"组件"），且没有其他已知词，
            // 可以选择只返回后缀，避免显示未知词
            if (suffixFromExt && nouns.length === 0 && acronyms.length === 0) {
                // 完全未知的情况，返回 undefined，让置信度计算判断
                return undefined;
            }
            
            return { zh: last, en: last.toLowerCase() };
        }

        return undefined;
    }

    /**
     * 提取变体词（放括号的词）
     */
    private extractVariants(adjs: Array<{ zh: string; en: string }>): string[] {
        return adjs
            .filter(a => VariantWords.includes(a.en))
            .map(a => a.zh);
    }

    /**
     * 计算置信度
     */
    private calculateConfidence(
        tokens: Token[],
        nouns: any[],
        adjs: any[],
        acronyms: any[]
    ): number {
        const totalTokens = tokens.length;
        const mappedTokens = nouns.length + adjs.length + acronyms.length;
        
        if (totalTokens === 0) return 0;
        
        // 基础置信度：命中词占比
        const hitRate = mappedTokens / totalTokens;
        
        // 调整因子
        let confidence = hitRate * 0.9; // 基础分
        
        // 有中心词加分
        if (nouns.length > 0) {
            confidence += 0.05;
        }
        
        // 有修饰词加分
        if (adjs.length > 0) {
            confidence += 0.03;
        }
        
        // 限制范围 0.5-0.95
        return Math.max(0.5, Math.min(0.95, confidence));
    }
}

/**
 * 清洗文件名（避免非法字符）
 */
function sanitize(s: string): string {
    return (s || '')
        .replace(/[\\/:*?"<>|]/g, '·')  // 替换非法字符
        .replace(/\s+/g, '')             // 移除多余空格
        .trim()
        .slice(0, 32);                   // 限制长度
}
