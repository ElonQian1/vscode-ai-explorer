// src/features/explorer-alias/domain/policies/LiteralAliasBuilder.ts
/**
 * 直译风格构建器：逐词保留、原顺序拼接，未知词不丢弃
 * 
 * 特点：
 * - 严格按照原文件名的词序翻译
 * - 每个词都保留（未知词保留英文原词）
 * - 连接符可配置（默认为空，可设置为 _ 或 ·）
 * - 可选扩展名后缀（脚本/模块/组件）
 * 
 * @example
 * buildLiteralAlias('analyze_element_hierarchy.cjs')
 * // => { alias: '分析元素层级脚本', confidence: 0.9, debug: 'literal:分析|元素|层级 ext=cjs' }
 * 
 * buildLiteralAlias('analyze_hierarchy_simple.cjs')
 * // => { alias: '分析层级简版脚本', confidence: 0.9, debug: 'literal:分析|层级|简版 ext=cjs' }
 */

import { tokenizeFileName } from '../../../../shared/naming/NameTokenizer';

export type LiteralResult = {
    alias: string;
    confidence: number;
    debug: string;
};

/**
 * 直译词典（扩展自 SmartRuleEngine 的词典）
 */
const LiteralDict: Record<string, string> = {
    // 功能动词
    analyze: '分析',
    analysis: '分析',
    process: '处理',
    handle: '处理',
    manage: '管理',
    control: '控制',
    render: '渲染',
    parse: '解析',
    format: '格式化',
    validate: '验证',
    build: '构建',
    create: '创建',
    update: '更新',
    delete: '删除',
    get: '获取',
    set: '设置',
    fetch: '获取',
    load: '加载',
    save: '保存',
    
    // 名词
    element: '元素',
    hierarchy: '层级',
    tree: '树',
    node: '节点',
    component: '组件',
    module: '模块',
    service: '服务',
    util: '工具',
    utils: '工具',
    helper: '辅助',
    config: '配置',
    setting: '设置',
    data: '数据',
    model: '模型',
    view: '视图',
    controller: '控制器',
    manager: '管理器',
    handler: '处理器',
    processor: '处理器',
    builder: '构建器',
    factory: '工厂',
    provider: '提供者',
    
    // UI 组件
    section: '区块',
    block: '区块',
    panel: '面板',
    card: '卡片',
    page: '页面',
    button: '按钮',
    input: '输入框',
    form: '表单',
    table: '表格',
    list: '列表',
    menu: '菜单',
    dialog: '对话框',
    modal: '弹窗',
    
    // 状态/级别
    status: '状态',
    state: '状态',
    info: '信息',
    detail: '详情',
    simple: '简版',
    basic: '基础',
    advanced: '高级',
    full: '完整',
    lite: '轻量',
    mini: '迷你',
    
    // 修饰词
    universal: '通用',
    global: '全局',
    local: '本地',
    common: '通用',
    shared: '共享',
    public: '公开',
    private: '私有',
    main: '主',
    sub: '子',
    new: '新',
    old: '旧',
    current: '当前',
    default: '默认',
    custom: '自定义',
    
    // 测试相关
    test: '测试',
    spec: '测试',
    mock: '桩',
    demo: '示例',
    example: '示例',
    sample: '示例',
    
    // 其他
    index: '索引',
    entry: '入口',
    contact: '联系人',
    contacts: '联系人',
};

/**
 * 扩展名后缀映射
 */
const ExtSuffix: Record<string, string> = {
    tsx: '组件',
    jsx: '组件',
    vue: '组件',
    svelte: '组件',
    
    ts: '模块',
    js: '模块',
    mjs: '模块',
    cjs: '脚本',
    
    json: '配置',
    yaml: '配置',
    yml: '配置',
    toml: '配置',
    
    md: '文档',
    txt: '文本',
    
    css: '样式',
    scss: '样式',
    less: '样式',
    sass: '样式',
};

/**
 * 构建直译风格别名
 */
export function buildLiteralAlias(fileName: string, options?: {
    joiner?: string;
    appendSuffix?: boolean;
}): LiteralResult {
    // 优先使用传入的选项，否则尝试读取配置（如果在 VS Code 环境）
    let joiner = options?.joiner ?? '';
    let appendSuffix = options?.appendSuffix ?? true;
    
    // 尝试读取 VS Code 配置（如果可用）
    try {
        const vscode = require('vscode');
        const config = vscode.workspace.getConfiguration('aiExplorer');
        joiner = config.get('alias.literalJoiner') || '';
        appendSuffix = config.get('alias.appendExtSuffix') !== false;
    } catch {
        // 不在 VS Code 环境中，使用默认值或传入的选项
    }
    
    const { tokens, ext } = tokenizeFileName(fileName);
    
    // 逐词翻译（未知词保留英文）
    const translatedWords = tokens.map(token => {
        const lower = token.raw.toLowerCase();
        return LiteralDict[lower] || token.raw; // 未映射保留原词
    });
    
    // 按顺序拼接
    const core = translatedWords.join(joiner);
    
    // 添加扩展名后缀（可选）
    const suffix = appendSuffix && ExtSuffix[ext] 
        ? (joiner ? joiner + ExtSuffix[ext] : ExtSuffix[ext])
        : '';
    
    const alias = sanitize(core + suffix);
    
    // 计算置信度（根据已映射词汇的比例）
    const mappedCount = tokens.filter(t => LiteralDict[t.raw.toLowerCase()]).length;
    const confidence = tokens.length > 0 
        ? 0.6 + (mappedCount / tokens.length) * 0.3 // 0.6 - 0.9
        : 0.6;
    
    return {
        alias,
        confidence,
        debug: `literal:${translatedWords.join('|')} ext=${ext} mapped=${mappedCount}/${tokens.length}`
    };
}

/**
 * 清理别名（避免非法文件名字符）
 */
function sanitize(s: string): string {
    return (s || '')
        .replace(/[\\/:*?"<>|]/g, '·')  // 替换非法字符
        .slice(0, 64);  // 限制长度
}
