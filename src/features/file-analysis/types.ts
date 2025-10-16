// src/features/file-analysis/types.ts
// [module: file-analysis] [tags: Types, Interface]
/**
 * FileCapsule 数据结构定义
 * 用于存储文件的静态分析和AI分析结果
 */

/**
 * 文件分析胶囊 - 完整的文件分析结果
 */
export interface FileCapsule {
    /** 数据格式版本 */
    version: '1.0';
    
    /** 文件路径 */
    file: string;
    
    /** 编程语言 */
    lang: string;
    
    /** 文件内容哈希 (用于缓存失效) */
    contentHash: string;
    
    /** 文件摘要 */
    summary: {
        zh: string;  // 中文摘要
        en: string;  // 英文摘要
    };
    
    /** API 导出符号 */
    api: ApiSymbol[];
    
    /** 依赖关系 */
    deps: Dependencies;
    
    /** 事实列表 (从代码直接提取的确定性信息) */
    facts: Fact[];
    
    /** 推断列表 (AI基于代码分析的推测) */
    inferences: Inference[];
    
    /** 建议列表 (优化、改进建议) */
    recommendations: Recommendation[];
    
    /** 证据索引 (所有证据的源码位置) */
    evidence: Record<string, Evidence>;
    
    /** 是否过期 (文件已修改) */
    stale: boolean;
    
    /** 最后验证时间 (ISO格式) */
    lastVerifiedAt: string;
}

/**
 * API 符号 (函数、类、接口等)
 */
export interface ApiSymbol {
    /** 符号名称 */
    name: string;
    
    /** 符号类型 */
    kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'variable';
    
    /** 完整签名 */
    signature: string;
    
    /** 证据ID列表 */
    evidence: string[];
    
    /** 是否导出 */
    exported?: boolean;
    
    /** JSDoc注释 (如果有) */
    jsDoc?: string;
}

/**
 * 依赖关系
 */
export interface Dependencies {
    /** 出依赖 (该文件引用了谁) */
    out: OutDependency[];
    
    /** 入依赖样本 (谁引用了该文件) */
    inSample: InDependency[];
}

/**
 * 出依赖
 */
export interface OutDependency {
    /** 模块名 */
    module: string;
    
    /** 引用次数 */
    count: number;
    
    /** 证据ID列表 */
    evidence: string[];
    
    /** 是否为相对路径导入 */
    isRelative?: boolean;
}

/**
 * 入依赖
 */
export interface InDependency {
    /** 引用文件路径 */
    file: string;
    
    /** 引用行号 */
    line: number;
    
    /** 证据ID */
    evidence: string[];
}

/**
 * 事实
 */
export interface Fact {
    /** 事实ID */
    id: string;
    
    /** 事实描述 */
    text: string;
    
    /** 证据ID列表 */
    evidence: string[];
}

/**
 * 推断
 */
export interface Inference {
    /** 推断ID */
    id: string;
    
    /** 推断描述 */
    text: string;
    
    /** 置信度 (0-1) */
    confidence: number;
    
    /** 证据ID列表 */
    evidence: string[];
}

/**
 * 建议
 */
export interface Recommendation {
    /** 建议ID */
    id: string;
    
    /** 建议内容 */
    text: string;
    
    /** 建议原因 */
    reason: string;
    
    /** 证据ID列表 */
    evidence: string[];
    
    /** 优先级 */
    priority?: 'low' | 'medium' | 'high';
}

/**
 * 证据 (源码位置)
 */
export interface Evidence {
    /** 文件路径 */
    file: string;
    
    /** 行范围 [起始行, 结束行] (1-based) */
    lines: [number, number];
    
    /** 代码片段哈希 */
    sha256: string;
}

/**
 * 分析选项
 */
export interface AnalysisOptions {
    /** 是否强制重新分析 (忽略缓存) */
    force?: boolean;
    
    /** 是否包含AI分析 */
    includeAI?: boolean;
    
    /** 是否深度分析依赖 */
    deepDeps?: boolean;
}
