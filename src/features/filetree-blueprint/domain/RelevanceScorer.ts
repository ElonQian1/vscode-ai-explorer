/**
 * Relevance Scorer
 * 相关性评分引擎 - 计算文件与功能的相关度
 */

import * as path from 'path';
import {
	FeaturePayload,
	FileScore,
	RelevanceReason,
	ReasonType,
	ScoringWeights,
	DEFAULT_WEIGHTS
} from '../types/FeatureContext';

/**
 * 文件分析结果(简化版,可后续扩展为完整AST分析)
 */
export interface AnalyzedFile {
	path: string;
	content?: string;
	imports: string[];      // 导入的文件路径
	importedBy: string[];   // 被谁导入
	exports: string[];      // 导出的符号名
	symbols: string[];      // 所有符号名(函数/类/变量)
	routes?: string[];      // 路由路径(如果是路由文件)
	apiCalls?: string[];    // API调用(如果有网络请求)
}

/**
 * 相关性评分器
 */
export class RelevanceScorer {
	private weights: ScoringWeights;
	
	constructor(weights: ScoringWeights = DEFAULT_WEIGHTS) {
		this.weights = weights;
	}
	
	/**
	 * 计算单个文件的相关性得分
	 */
	public scoreFile(
		file: AnalyzedFile,
		context: {
			seeds: Set<string>;
			keywords: string[];
			importGraph: Map<string, Set<string>>; // path -> imported paths
			callGraph?: Map<string, Set<string>>;  // path -> called paths
			routeGraph?: Map<string, Set<string>>; // route -> related paths
		}
	): FileScore {
		const reasons: RelevanceReason[] = [];
		const filePath = file.path;
		
		// 1. 检查是否为种子文件
		if (context.seeds.has(filePath)) {
			reasons.push({
				type: 'seed',
				detail: 'This is a seed file',
				weight: this.weights.seed,
				source: filePath
			});
		}
		
		// 2. 检查import关系
		this.checkImportRelations(file, context, reasons);
		
		// 3. 检查调用关系(如果有调用图)
		if (context.callGraph) {
			this.checkCallRelations(file, { seeds: context.seeds, callGraph: context.callGraph }, reasons);
		}
		
		// 4. 检查路由关系(如果有路由图)
		if (context.routeGraph) {
			this.checkRouteRelations(file, { seeds: context.seeds, routeGraph: context.routeGraph }, reasons);
		}
		
		// 5. 检查关键词匹配
		this.checkKeywordMatches(file, context.keywords, reasons);
		
		// 6. 计算综合得分
		const score = this.calculateScore(reasons);
		
		// 7. 推断文件类型
		const kind = this.inferFileKind(file);
		
		return {
			path: filePath,
			score,
			reasons,
			kind
		};
	}
	
	/**
	 * 检查import关系
	 */
	private checkImportRelations(
		file: AnalyzedFile,
		context: { seeds: Set<string>; importGraph: Map<string, Set<string>> },
		reasons: RelevanceReason[]
	): void {
		const filePath = file.path;
		
		// 被种子import
		for (const seed of context.seeds) {
			const seedImports = context.importGraph.get(seed);
			if (seedImports?.has(filePath)) {
				reasons.push({
					type: 'import',
					detail: `Imported by seed: ${this.getFileName(seed)}`,
					weight: this.weights.import,
					source: seed,
					target: filePath
				});
			}
		}
		
		// import了种子
		const fileImports = context.importGraph.get(filePath);
		if (fileImports) {
			for (const seed of context.seeds) {
				if (fileImports.has(seed)) {
					reasons.push({
						type: 'imported-by',
						detail: `Imports seed: ${this.getFileName(seed)}`,
						weight: this.weights.importedBy,
						source: filePath,
						target: seed
					});
				}
			}
		}
	}
	
	/**
	 * 检查调用关系
	 */
	private checkCallRelations(
		file: AnalyzedFile,
		context: { seeds: Set<string>; callGraph: Map<string, Set<string>> },
		reasons: RelevanceReason[]
	): void {
		const filePath = file.path;
		const callGraph = context.callGraph!;
		
		// 被种子调用
		for (const seed of context.seeds) {
			const seedCalls = callGraph.get(seed);
			if (seedCalls?.has(filePath)) {
				reasons.push({
					type: 'called-by',
					detail: `Called by seed: ${this.getFileName(seed)}`,
					weight: this.weights.calledBy,
					source: seed,
					target: filePath
				});
			}
		}
		
		// 调用了种子
		const fileCalls = callGraph.get(filePath);
		if (fileCalls) {
			for (const seed of context.seeds) {
				if (fileCalls.has(seed)) {
					reasons.push({
						type: 'calls',
						detail: `Calls seed: ${this.getFileName(seed)}`,
						weight: this.weights.calls,
						source: filePath,
						target: seed
					});
				}
			}
		}
	}
	
	/**
	 * 检查路由关系
	 */
	private checkRouteRelations(
		file: AnalyzedFile,
		context: { seeds: Set<string>; routeGraph: Map<string, Set<string>> },
		reasons: RelevanceReason[]
	): void {
		if (!file.routes || file.routes.length === 0) {
			return;
		}
		
		const routeGraph = context.routeGraph!;
		for (const route of file.routes) {
			const relatedFiles = routeGraph.get(route);
			if (relatedFiles) {
				for (const seed of context.seeds) {
					if (relatedFiles.has(seed)) {
						reasons.push({
							type: 'route',
							detail: `Same route chain: ${route}`,
							weight: this.weights.route,
							source: file.path,
							target: seed
						});
					}
				}
			}
		}
	}
	
	/**
	 * 检查关键词匹配
	 */
	private checkKeywordMatches(
		file: AnalyzedFile,
		keywords: string[],
		reasons: RelevanceReason[]
	): void {
		if (keywords.length === 0) {
			return;
		}
		
		const lowerPath = file.path.toLowerCase();
		const fileName = this.getFileName(file.path).toLowerCase();
		
		// 文件名匹配
		for (const keyword of keywords) {
			const lowerKeyword = keyword.toLowerCase();
			if (fileName.includes(lowerKeyword)) {
				reasons.push({
					type: 'keyword-name',
					detail: `Filename contains: "${keyword}"`,
					weight: this.weights.keywordName,
					matchedKeyword: keyword,
					matchCount: 1
				});
			}
		}
		
		// 符号名匹配
		const allSymbols = [...file.exports, ...file.symbols];
		for (const keyword of keywords) {
			const lowerKeyword = keyword.toLowerCase();
			const matches = allSymbols.filter(s => 
				s.toLowerCase().includes(lowerKeyword)
			);
			if (matches.length > 0) {
				reasons.push({
					type: 'keyword-symbol',
					detail: `${matches.length} symbol(s) match: "${keyword}"`,
					weight: this.weights.keywordSymbol,
					matchedKeyword: keyword,
					matchCount: matches.length
				});
			}
		}
		
		// 代码文本匹配(如果有内容)
		if (file.content) {
			const lowerContent = file.content.toLowerCase();
			for (const keyword of keywords) {
				const lowerKeyword = keyword.toLowerCase();
				const regex = new RegExp(lowerKeyword, 'gi');
				const matches = lowerContent.match(regex);
				if (matches && matches.length > 0) {
					reasons.push({
						type: 'keyword-text',
						detail: `${matches.length} occurrence(s) of: "${keyword}"`,
						weight: this.weights.keywordText,
						matchedKeyword: keyword,
						matchCount: matches.length
					});
				}
			}
		}
	}
	
	/**
	 * 计算综合得分(归一化到0-100)
	 */
	private calculateScore(reasons: RelevanceReason[]): number {
		const rawScore = reasons.reduce((sum, r) => sum + r.weight, 0);
		
		// 简单归一化(假设最高分为种子文件=10,加上多个强关系最多到30)
		// 后续可以根据实际数据分布调整
		const normalized = Math.min(100, (rawScore / 30) * 100);
		
		return Math.round(normalized);
	}
	
	/**
	 * 推断文件类型
	 */
	private inferFileKind(file: AnalyzedFile): string {
		const ext = path.extname(file.path);
		const fileName = this.getFileName(file.path).toLowerCase();
		
		// 配置文件
		if (fileName.includes('config') || fileName.includes('.config.')) {
			return 'config';
		}
		
		// 路由文件
		if (fileName.includes('route') || fileName.includes('router') || file.routes && file.routes.length > 0) {
			return 'route';
		}
		
		// React组件
		if ((ext === '.tsx' || ext === '.jsx') && fileName[0].toUpperCase() === fileName[0]) {
			return 'component';
		}
		
		// 服务/API
		if (fileName.includes('service') || fileName.includes('api') || fileName.includes('client')) {
			return 'service';
		}
		
		// 工具/辅助
		if (fileName.includes('util') || fileName.includes('helper') || fileName.includes('lib')) {
			return 'utility';
		}
		
		// 类型定义
		if (fileName.includes('type') || fileName.includes('.d.ts') || fileName.includes('interface')) {
			return 'types';
		}
		
		// Hook
		if (fileName.startsWith('use') && (ext === '.ts' || ext === '.tsx')) {
			return 'hook';
		}
		
		// 测试
		if (fileName.includes('test') || fileName.includes('spec')) {
			return 'test';
		}
		
		return 'file';
	}
	
	/**
	 * 获取文件名(不含路径)
	 */
	private getFileName(filePath: string): string {
		return path.basename(filePath);
	}
	
	/**
	 * 批量评分(带桥接节点检测)
	 */
	public scoreFiles(
		files: AnalyzedFile[],
		context: {
			seeds: Set<string>;
			keywords: string[];
			importGraph: Map<string, Set<string>>;
			callGraph?: Map<string, Set<string>>;
			routeGraph?: Map<string, Set<string>>;
		}
	): FileScore[] {
		// 先计算基础得分
		const scores = files.map(f => this.scoreFile(f, context));
		
		// 检测桥接节点(连接高分节点但自身得分不高的文件)
		this.detectBridgeNodes(scores, context.importGraph);
		
		return scores;
	}
	
	/**
	 * 检测桥接节点
	 */
	private detectBridgeNodes(
		scores: FileScore[],
		importGraph: Map<string, Set<string>>
	): void {
		const scoreMap = new Map(scores.map(s => [s.path, s]));
		const highScoreThreshold = 60;
		
		for (const score of scores) {
			if (score.score >= highScoreThreshold) {
				continue; // 已经是高分,不需要桥接加成
			}
			
			const imports = importGraph.get(score.path);
			if (!imports) {
				continue;
			}
			
			// 检查是否连接多个高分节点
			const highScoreNeighbors = Array.from(imports)
				.map(p => scoreMap.get(p))
				.filter(s => s && s.score >= highScoreThreshold);
			
			if (highScoreNeighbors.length >= 2) {
				score.isBridge = true;
				score.reasons.push({
					type: 'bridge',
					detail: `Connects ${highScoreNeighbors.length} high-score files`,
					weight: this.weights.bridge
				});
				score.score += this.weights.bridge;
			}
		}
	}
}
