/**
 * Feature-Driven Analysis Context
 * 功能驱动分析上下文 - 按功能筛选相关文件的核心契约
 */

/**
 * 功能分析输入负载(供真人或MCP代理调用)
 */
export interface FeaturePayload {
	/** 功能唯一标识(用于缓存/备注关联) */
	featureId: string;
	
	/** 功能名称(显示用) */
	featureName?: string;
	
	/** 种子文件(功能的入口点) */
	seeds: string[];
	
	/** 关键词(补充语义过滤) */
	keywords: string[];
	
	/** 包含的glob模式 */
	includeGlobs?: string[];
	
	/** 排除的glob模式 */
	excludeGlobs?: string[];
	
	/** 最大跳数(从种子沿依赖图拓展的层数) */
	maxHops?: number;
	
	/** 是否返回完整图结构(供MCP代理后续推理) */
	returnGraph?: boolean;
	
	/** 相关性阈值(0-100,只显示分数>=阈值的文件) */
	relevanceThreshold?: number;
}

/**
 * 相关性证据类型
 */
export type ReasonType = 
	| 'seed'           // 是种子文件本身
	| 'import'         // 被种子import
	| 'imported-by'    // import了种子
	| 'called-by'      // 被种子调用
	| 'calls'          // 调用了种子
	| 'route'          // 同路由链
	| 'keyword-name'   // 文件名包含关键词
	| 'keyword-text'   // 代码/注释包含关键词
	| 'keyword-symbol' // 符号名包含关键词
	| 'bridge'         // 连通桥接节点
	| 'network-api';   // 网络API依赖

/**
 * 相关性证据
 */
export interface RelevanceReason {
	/** 证据类型 */
	type: ReasonType;
	
	/** 详细描述(可展示给用户) */
	detail: string;
	
	/** 权重分数 */
	weight: number;
	
	/** 来源文件(如果是关系证据) */
	source?: string;
	
	/** 目标文件(如果是关系证据) */
	target?: string;
	
	/** 匹配的关键词(如果是关键词证据) */
	matchedKeyword?: string;
	
	/** 匹配次数(如果是文本匹配) */
	matchCount?: number;
}

/**
 * 文件相关性评分结果
 */
export interface FileScore {
	/** 文件路径 */
	path: string;
	
	/** 综合得分(0-100) */
	score: number;
	
	/** 得分证据列表 */
	reasons: RelevanceReason[];
	
	/** 文件类型(file|component|service|route|config等) */
	kind?: string;
	
	/** 跳数(距离种子的最短路径长度) */
	hops?: number;
	
	/** 是否为桥接节点(连接不同功能区域) */
	isBridge?: boolean;
}

/**
 * 功能子图(筛选后的结果)
 */
export interface FeatureSubGraph {
	/** 功能ID */
	featureId: string;
	
	/** 功能名称 */
	featureName: string;
	
	/** 种子文件列表 */
	seeds: string[];
	
	/** 关键词列表 */
	keywords: string[];
	
	/** 相关文件及其评分 */
	files: FileScore[];
	
	/** 文件间关系(邻接表) */
	edges: Record<string, string[]>;
	
	/** 关系类型映射 */
	edgeTypes: Record<string, 'import'|'call'|'route'|'api'>;
	
	/** 生成时间戳 */
	timestamp: string;
	
	/** 代码库commit hash(用于缓存失效) */
	commitHash?: string;
	
	/** 工具版本(用于缓存失效) */
	toolVersion: string;
}

/**
 * 相关性评分权重配置
 */
export interface ScoringWeights {
	seed: number;           // 种子文件本身
	import: number;         // import关系
	importedBy: number;     // 被import
	calledBy: number;       // 被调用
	calls: number;          // 调用
	route: number;          // 路由链
	keywordName: number;    // 文件名关键词
	keywordText: number;    // 代码文本关键词
	keywordSymbol: number;  // 符号名关键词
	bridge: number;         // 桥接节点
	networkApi: number;     // 网络API
}

/**
 * 默认评分权重(根据你的架构思路)
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
	seed: 10,           // 种子文件最高权重
	import: 3,          // import关系(强结构信号)
	importedBy: 3,
	calledBy: 4,        // 调用关系(强结构信号)
	calls: 4,
	route: 4,           // 路由链(强结构信号)
	keywordName: 2,     // 文件名关键词(中等信号)
	keywordText: 1,     // 代码文本关键词(弱信号)
	keywordSymbol: 1,   // 符号名关键词(弱信号)
	bridge: 2,          // 桥接节点(中等信号)
	networkApi: 3       // 网络API(强信号)
};

/**
 * 功能渲染配置
 */
export interface FeatureRenderOptions {
	/** 是否显示得分(调试用) */
	showScores?: boolean;
	
	/** 是否显示证据详情 */
	showReasons?: boolean;
	
	/** 是否只显示桥接节点 */
	onlyBridges?: boolean;
	
	/** 分组方式(directory|type|layer) */
	groupBy?: 'directory' | 'type' | 'layer';
	
	/** 是否启用虚拟化(节点>300时) */
	enableVirtualization?: boolean;
	
	/** 是否自动展开卡片(对种子文件) */
	autoExpandSeeds?: boolean;
}

/**
 * MCP代理输出格式(回写给外部代理)
 */
export interface MCPFeatureOutput {
	featureId: string;
	featureName: string;
	summary: {
		totalFiles: number;
		seedFiles: number;
		avgScore: number;
		maxHops: number;
	};
	files: Array<{
		path: string;
		score: number;
		kind: string;
		hops: number;
		topReasons: string[]; // 前3个证据的描述
	}>;
	relationships: Array<{
		from: string;
		to: string;
		type: string;
	}>;
	graphJson: string; // 完整的FeatureSubGraph JSON
}
