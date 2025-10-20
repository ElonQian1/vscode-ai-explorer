/**
 * Feature Renderer
 * 功能渲染器 - 按功能筛选并渲染文件子图
 */

import * as vscode from 'vscode';
import { FeaturePayload, FeatureSubGraph, FileScore } from '../types/FeatureContext';
import { RelevanceScorer, AnalyzedFile } from '../domain/RelevanceScorer';
import { Logger } from '../../../core/logging/Logger';

/**
 * 功能渲染器(供VS Code命令调用)
 */
export class FeatureRenderer {
	private logger = new Logger('FeatureRenderer');
	private scorer = new RelevanceScorer();
	
	/**
	 * 渲染功能(命令入口)
	 * @param payload 功能分析负载
	 * @returns 功能子图(可选返回给MCP代理)
	 */
	public async renderFeature(
		payload: FeaturePayload
	): Promise<FeatureSubGraph | undefined> {
		try {
			this.logger.info(`[FeatureRenderer] Rendering feature: ${payload.featureId}`);
			
			// 1. 验证输入
			this.validatePayload(payload);
			
			// 2. 收集工作区文件
			const workspaceFiles = await this.collectWorkspaceFiles(payload);
			this.logger.info(`[FeatureRenderer] Collected ${workspaceFiles.length} files`);
			
			// 3. 分析文件(构建依赖图)
			const analyzedFiles = await this.analyzeFiles(workspaceFiles);
			this.logger.info(`[FeatureRenderer] Analyzed ${analyzedFiles.length} files`);
			
			// 4. 构建图上下文
			const context = this.buildGraphContext(analyzedFiles, payload);
			
			// 5. 计算相关性得分
			const scores = this.scorer.scoreFiles(analyzedFiles, context);
			
			// 6. 筛选相关文件(阈值过滤)
			const threshold = payload.relevanceThreshold ?? 30;
			const relevantScores = scores.filter((s: FileScore) => s.score >= threshold);
			this.logger.info(`[FeatureRenderer] Found ${relevantScores.length} relevant files (threshold: ${threshold})`);
			
			// 7. 计算跳数(BFS从种子出发, 限制最大跳数)
			const maxHops = payload.maxHops ?? 3;
			this.calculateHops(relevantScores, context.importGraph, new Set(payload.seeds), maxHops);
			
			// 8. 构建子图
			const subGraph = this.buildSubGraph(payload, relevantScores, context);
			
			// 9. 渲染到Webview(TODO: 集成到BlueprintPanel)
			await this.renderToWebview(subGraph);
			
			// 10. 返回图结构(供MCP代理)
			if (payload.returnGraph) {
				return subGraph;
			}
			
			return undefined;
		} catch (error) {
			this.logger.error(`[FeatureRenderer] Error rendering feature: ${error}`);
			vscode.window.showErrorMessage(`Failed to render feature: ${error}`);
			return undefined;
		}
	}
	
	/**
	 * 验证输入负载
	 */
	private validatePayload(payload: FeaturePayload): void {
		if (!payload.featureId) {
			throw new Error('featureId is required');
		}
		if (!payload.seeds || payload.seeds.length === 0) {
			throw new Error('At least one seed file is required');
		}
		if (!payload.keywords) {
			payload.keywords = [];
		}
	}
	
	/**
	 * 收集工作区文件(根据includeGlobs/excludeGlobs)
	 */
	private async collectWorkspaceFiles(
		payload: FeaturePayload
	): Promise<string[]> {
		const includePattern = payload.includeGlobs?.join(',') || '**/*.{ts,tsx,js,jsx}';
		const excludePattern = payload.excludeGlobs?.join(',') || '**/node_modules/**';
		
		const files = await vscode.workspace.findFiles(includePattern, excludePattern);
		return files.map(f => f.fsPath);
	}
	
	/**
	 * 分析文件(改进版: 更好的依赖解析)
	 */
	private async analyzeFiles(
		filePaths: string[]
	): Promise<AnalyzedFile[]> {
		const analyzed: AnalyzedFile[] = [];
		const path = await import('path');
		
		for (const filePath of filePaths) {
			try {
				const uri = vscode.Uri.file(filePath);
				const content = await vscode.workspace.fs.readFile(uri);
				const text = Buffer.from(content).toString('utf-8');
				
				// ✅ 改进的import提取(支持多种语法)
				const imports: string[] = [];
				
				// ES6 import from
				const importFromMatches = text.matchAll(/import\s+.*?from\s+['"](.+?)['"]/g);
				for (const match of importFromMatches) {
					imports.push(match[1]);
				}
				
				// require()
				const requireMatches = text.matchAll(/require\s*\(\s*['"](.+?)['"]\s*\)/g);
				for (const match of requireMatches) {
					imports.push(match[1]);
				}
				
				// dynamic import()
				const dynamicImportMatches = text.matchAll(/import\s*\(\s*['"](.+?)['"]\s*\)/g);
				for (const match of dynamicImportMatches) {
					imports.push(match[1]);
				}
				
				// ✅ 解析相对路径为绝对路径
				const resolvedImports = imports.map(imp => {
					if (imp.startsWith('.')) {
						// 相对路径,解析为绝对路径
						const dir = path.dirname(filePath);
						let resolved = path.resolve(dir, imp);
						
						// 添加文件扩展名(如果没有)
						if (!path.extname(resolved)) {
							const extensions = ['.ts', '.tsx', '.js', '.jsx'];
							for (const ext of extensions) {
								if (filePaths.includes(resolved + ext)) {
									resolved += ext;
									break;
								}
							}
						}
						return resolved;
					} else if (imp.startsWith('@/')) {
						// 别名路径(简化处理,假设@指向src)
						const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
						return path.join(workspaceRoot, 'src', imp.substring(2));
					} else {
						// node_modules或其他外部依赖,暂时忽略
						return imp;
					}
				}).filter(imp => filePaths.includes(imp)); // 只保留在分析范围内的文件
				
				// ✅ 改进的export提取
				const exports: string[] = [];
				const exportMatches = text.matchAll(/export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/g);
				for (const match of exportMatches) {
					exports.push(match[1]);
				}
				
				// export default
				if (text.includes('export default')) {
					exports.push('default');
				}
				
				analyzed.push({
					path: filePath,
					content: text,
					imports: resolvedImports,
					importedBy: [], // 后续构建反向图时填充
					exports,
					symbols: exports
				});
			} catch (error) {
				this.logger.warn(`[FeatureRenderer] Failed to analyze ${filePath}: ${error}`);
			}
		}
		
		// ✅ 构建反向图(importedBy)
		const fileMap = new Map(analyzed.map(f => [f.path, f]));
		for (const file of analyzed) {
			for (const imp of file.imports) {
				const imported = fileMap.get(imp);
				if (imported) {
					imported.importedBy.push(file.path);
				}
			}
		}
		
		return analyzed;
	}
	
	/**
	 * 构建图上下文(改进版: 双向依赖图)
	 */
	private buildGraphContext(
		files: AnalyzedFile[],
		payload: FeaturePayload
	): {
		seeds: Set<string>;
		keywords: string[];
		importGraph: Map<string, Set<string>>;
		callGraph?: Map<string, Set<string>>;
		routeGraph?: Map<string, Set<string>>;
	} {
		const importGraph = new Map<string, Set<string>>();
		
		// ✅ 构建双向import图(包含imports和importedBy)
		for (const file of files) {
			// 正向: file imports X
			const imports = new Set<string>(file.imports);
			importGraph.set(file.path, imports);
			
			// 反向: X is imported by file
			for (const imported of file.importedBy) {
				if (!importGraph.has(imported)) {
					importGraph.set(imported, new Set());
				}
				importGraph.get(imported)!.add(file.path);
			}
		}
		
		// TODO: 未来可以添加callGraph和routeGraph
		// callGraph: 函数调用关系图(需要AST深度分析)
		// routeGraph: 路由配置关系图(识别react-router/vue-router配置)
		
		return {
			seeds: new Set(payload.seeds),
			keywords: payload.keywords,
			importGraph
		};
	}
	
	/**
	 * 计算跳数(改进版: 支持maxHops限制)
	 */
	private calculateHops(
		scores: FileScore[],
		importGraph: Map<string, Set<string>>,
		seeds: Set<string>,
		maxHops?: number
	): void {
		const visited = new Set<string>();
		const queue: { path: string; hops: number }[] = [];
		
		// 初始化:种子文件跳数为0
		for (const seed of seeds) {
			queue.push({ path: seed, hops: 0 });
			visited.add(seed);
			const score = scores.find(s => s.path === seed);
			if (score) {
				score.hops = 0;
			}
		}
		
		// ✅ BFS with maxHops constraint
		while (queue.length > 0) {
			const { path, hops } = queue.shift()!;
			
			// ✅ 如果达到最大跳数,停止拓展
			if (maxHops !== undefined && hops >= maxHops) {
				continue;
			}
			
			const neighbors = importGraph.get(path);
			if (neighbors) {
				for (const neighbor of neighbors) {
					if (!visited.has(neighbor)) {
						visited.add(neighbor);
						queue.push({ path: neighbor, hops: hops + 1 });
						
						// 更新score中的hops
						const score = scores.find(s => s.path === neighbor);
						if (score) {
							score.hops = hops + 1;
						}
					}
				}
			}
		}
	}
	
	/**
	 * 构建功能子图(改进版: 识别桥接节点)
	 */
	private buildSubGraph(
		payload: FeaturePayload,
		scores: FileScore[],
		context: {
			importGraph: Map<string, Set<string>>;
		}
	): FeatureSubGraph {
		const relevantPaths = new Set(scores.map(s => s.path));
		const edges: Record<string, string[]> = {};
		const edgeTypes: Record<string, 'import'|'call'|'route'|'api'> = {};
		
		// ✅ 构建边(只保留相关文件间的边)
		for (const score of scores) {
			const neighbors = context.importGraph.get(score.path);
			if (neighbors) {
				const relevantNeighbors = Array.from(neighbors).filter(n => relevantPaths.has(n));
				if (relevantNeighbors.length > 0) {
					edges[score.path] = relevantNeighbors;
					for (const neighbor of relevantNeighbors) {
						edgeTypes[`${score.path}->${neighbor}`] = 'import';
					}
				}
			}
		}
		
		// ✅ 识别桥接节点(连接度高的节点)
		this.identifyBridgeNodes(scores, edges);
		
		return {
			featureId: payload.featureId,
			featureName: payload.featureName || payload.featureId,
			seeds: payload.seeds,
			keywords: payload.keywords,
			files: scores,
			edges,
			edgeTypes,
			timestamp: new Date().toISOString(),
			toolVersion: '1.0.0' // TODO: 从package.json读取
		};
	}
	
	/**
	 * 识别桥接节点(高连接度的节点)
	 */
	private identifyBridgeNodes(
		scores: FileScore[],
		edges: Record<string, string[]>
	): void {
		// 计算每个节点的度数(入度+出度)
		const inDegree = new Map<string, number>();
		const outDegree = new Map<string, number>();
		
		// 初始化度数
		for (const score of scores) {
			inDegree.set(score.path, 0);
			outDegree.set(score.path, edges[score.path]?.length || 0);
		}
		
		// 计算入度
		for (const [from, targets] of Object.entries(edges)) {
			for (const to of targets) {
				inDegree.set(to, (inDegree.get(to) || 0) + 1);
			}
		}
		
		// ✅ 标记桥接节点: 总度数 >= 4 且 入度和出度都 >= 1
		const avgDegree = scores.reduce((sum, s) => {
			const degree = (inDegree.get(s.path) || 0) + (outDegree.get(s.path) || 0);
			return sum + degree;
		}, 0) / scores.length;
		
		for (const score of scores) {
			const inDeg = inDegree.get(score.path) || 0;
			const outDeg = outDegree.get(score.path) || 0;
			const totalDeg = inDeg + outDeg;
			
			// 桥接节点条件:
			// 1. 总度数 >= 平均度数的1.5倍
			// 2. 或者总度数 >= 4 且双向连接(入度和出度都 >= 1)
			if (totalDeg >= avgDegree * 1.5 || (totalDeg >= 4 && inDeg >= 1 && outDeg >= 1)) {
				score.isBridge = true;
			}
		}
		
		const bridgeCount = scores.filter(s => s.isBridge).length;
		this.logger.info(`[FeatureRenderer] Identified ${bridgeCount} bridge nodes (avgDegree: ${avgDegree.toFixed(2)})`);
	}
	
	/**
	 * 渲染到Webview(集成BlueprintPanel)
	 */
	private async renderToWebview(subGraph: FeatureSubGraph): Promise<void> {
		this.logger.info(`[FeatureRenderer] Rendering ${subGraph.files.length} files to webview`);
		
		try {
			// ✅ 将 FeatureSubGraph 转换为 Graph 格式
			const graph = this.convertSubGraphToGraph(subGraph);
			
			// ✅ 获取 Extension Context (从全局状态或传参)
			const context = (global as any).extensionContext as vscode.ExtensionContext;
			if (!context) {
				throw new Error('Extension context not available');
			}
			
			// ✅ 创建或显示 BlueprintPanel
			const { BlueprintPanel } = await import('../panel/BlueprintPanel');
			const extensionUri = context.extensionUri;
			
			const panel = BlueprintPanel.createOrShow(
				extensionUri,
				this.logger,
				context,
				undefined,  // targetUri (使用默认工作区根)
				`功能: ${subGraph.featureName}`  // 标题
			);
			
			// ✅ 显示功能子图
			panel.showGraph(graph);
			
			this.logger.info(`[FeatureRenderer] Successfully rendered feature graph to BlueprintPanel`);
			
			// 显示成功通知
			vscode.window.showInformationMessage(
				`Feature "${subGraph.featureName}": ${subGraph.files.length} relevant files`
			);
			
		} catch (error) {
			this.logger.error(`[FeatureRenderer] Failed to render to webview: ${error}`);
			throw error;
		}
	}
	
	/**
	 * 将 FeatureSubGraph 转换为 BlueprintPanel 的 Graph 格式
	 */
	private convertSubGraphToGraph(subGraph: FeatureSubGraph): any {
		const nodes: any[] = [];
		const edges: any[] = [];
		
		// 1. 创建文件节点
		subGraph.files.forEach((fileScore, index) => {
			const fileName = fileScore.path.split(/[\\/]/).pop() || fileScore.path;
			const isSeed = subGraph.seeds.includes(fileScore.path);
			
			nodes.push({
				id: fileScore.path,
				label: fileName,
				type: 'file',
				position: { x: 0, y: 0 }, // 将由布局引擎计算
				data: {
					path: fileScore.path,
					absPath: fileScore.path,
					score: fileScore.score,
					reasons: fileScore.reasons,
					hops: fileScore.hops,
					isSeed,
					isBridge: fileScore.isBridge,
					kind: fileScore.kind
				}
			});
		});
		
		// 2. 创建依赖边
		let edgeId = 0;
		Object.entries(subGraph.edges).forEach(([from, targets]) => {
			targets.forEach(to => {
				const edgeType = subGraph.edgeTypes[`${from}->${to}`] || 'import';
				edges.push({
					id: `edge-${edgeId++}`,
					label: edgeType,
					from: { node: from },
					to: { node: to },
					data: { type: edgeType }
				});
			});
		});
		
		// 3. 构建 Graph 对象
		return {
			id: subGraph.featureId,
			title: subGraph.featureName,
			nodes,
			edges,
			metadata: {
				graphType: 'feature-subgraph',  // 标识为功能子图
				featureId: subGraph.featureId,
				seeds: subGraph.seeds,
				keywords: subGraph.keywords,
				timestamp: subGraph.timestamp,
				toolVersion: subGraph.toolVersion,
				commitHash: subGraph.commitHash
			}
		};
	}
}

/**
 * 注册VS Code命令
 */
export function registerFeatureCommands(context: vscode.ExtensionContext): void {
	const renderer = new FeatureRenderer();
	
	// 命令: aiExplorer.renderFeature
	const renderCmd = vscode.commands.registerCommand(
		'aiExplorer.renderFeature',
		async (payload?: FeaturePayload) => {
			// 如果没有传参,弹出输入框
			if (!payload) {
				payload = await promptForFeaturePayload();
				if (!payload) {
					return;
				}
			}
			
			return renderer.renderFeature(payload);
		}
	);
	
	context.subscriptions.push(renderCmd);
	
	const logger = new Logger('FeatureRenderer');
	logger.info('[FeatureRenderer] Commands registered');
}

/**
 * 提示用户输入功能负载(简化版)
 */
async function promptForFeaturePayload(): Promise<FeaturePayload | undefined> {
	// 1. 输入功能ID
	const featureId = await vscode.window.showInputBox({
		prompt: 'Enter feature ID (e.g., feat-user-login)',
		placeHolder: 'feat-xxx'
	});
	if (!featureId) {
		return undefined;
	}
	
	// 2. 选择种子文件
	const seedFiles = await vscode.window.showOpenDialog({
		canSelectMany: true,
		openLabel: 'Select seed files',
		filters: { 'Code files': ['ts', 'tsx', 'js', 'jsx'] }
	});
	if (!seedFiles || seedFiles.length === 0) {
		return undefined;
	}
	
	// 3. 输入关键词
	const keywordsInput = await vscode.window.showInputBox({
		prompt: 'Enter keywords (comma-separated)',
		placeHolder: 'login, auth, token'
	});
	const keywords = keywordsInput 
		? keywordsInput.split(',').map(k => k.trim()) 
		: [];
	
	return {
		featureId,
		featureName: featureId,
		seeds: seedFiles.map(f => f.fsPath),
		keywords,
		maxHops: 2,
		relevanceThreshold: 30,
		returnGraph: false
	};
}
