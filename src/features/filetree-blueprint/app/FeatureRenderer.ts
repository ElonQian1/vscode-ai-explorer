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
			
			// 7. 计算跳数(BFS从种子出发)
			this.calculateHops(relevantScores, context.importGraph, new Set(payload.seeds));
			
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
	 * 分析文件(TODO: 真实实现需要AST解析)
	 */
	private async analyzeFiles(
		filePaths: string[]
	): Promise<AnalyzedFile[]> {
		// TODO: 这里是简化版,真实实现需要:
		// 1. 用 TypeScript Compiler API 或 ts-morph 解析AST
		// 2. 提取 imports/exports/symbols/calls
		// 3. 识别路由配置(react-router等)
		// 4. 识别网络请求(axios/fetch)
		
		// 现在先返回占位数据
		const analyzed: AnalyzedFile[] = [];
		
		for (const filePath of filePaths) {
			try {
				const uri = vscode.Uri.file(filePath);
				const content = await vscode.workspace.fs.readFile(uri);
				const text = Buffer.from(content).toString('utf-8');
				
				// 简单的import正则提取(生产环境应该用AST)
				const importMatches = text.matchAll(/import\s+.*?from\s+['"](.+?)['"]/g);
				const imports = Array.from(importMatches, m => m[1]);
				
				// 简单的export正则提取
				const exportMatches = text.matchAll(/export\s+(?:const|function|class|interface|type)\s+(\w+)/g);
				const exports = Array.from(exportMatches, m => m[1]);
				
				analyzed.push({
					path: filePath,
					content: text,
					imports,
					importedBy: [], // 后续构建反向图时填充
					exports,
					symbols: exports // 简化版,实际应包含所有符号
				});
			} catch (error) {
				this.logger.warn(`[FeatureRenderer] Failed to analyze ${filePath}: ${error}`);
			}
		}
		
		return analyzed;
	}
	
	/**
	 * 构建图上下文(依赖图/调用图/路由图)
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
		
		// 构建import图
		for (const file of files) {
			const imports = new Set<string>();
			for (const imp of file.imports) {
				// TODO: 解析相对路径为绝对路径
				imports.add(imp);
			}
			importGraph.set(file.path, imports);
		}
		
		// TODO: 构建callGraph和routeGraph
		
		return {
			seeds: new Set(payload.seeds),
			keywords: payload.keywords,
			importGraph
		};
	}
	
	/**
	 * 计算跳数(BFS)
	 */
	private calculateHops(
		scores: FileScore[],
		importGraph: Map<string, Set<string>>,
		seeds: Set<string>
	): void {
		const visited = new Set<string>();
		const queue: { path: string; hops: number }[] = [];
		
		// 初始化:种子文件跳数为0
		for (const seed of seeds) {
			queue.push({ path: seed, hops: 0 });
			visited.add(seed);
		}
		
		// BFS
		while (queue.length > 0) {
			const { path, hops } = queue.shift()!;
			const score = scores.find(s => s.path === path);
			if (score) {
				score.hops = hops;
			}
			
			const neighbors = importGraph.get(path);
			if (neighbors) {
				for (const neighbor of neighbors) {
					if (!visited.has(neighbor)) {
						visited.add(neighbor);
						queue.push({ path: neighbor, hops: hops + 1 });
					}
				}
			}
		}
	}
	
	/**
	 * 构建功能子图
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
		
		// 构建边(只保留相关文件间的边)
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
