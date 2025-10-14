// src/features/uml-canvas/app/usecases/GenerateUMLUseCase.ts
// [module: uml-canvas] [tags: UML, AST, CodeAnalysis, UseCase]
/**
 * UML 生成用例
 * 处理从代码文件生成 UML 图表的核心逻辑
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../../../core/logging/Logger';
import { OpenAIClient } from '../../../../core/ai/OpenAIClient';
import { KVCache } from '../../../../core/cache/KVCache';
import { PromptProfiles } from '../../../../core/ai/PromptProfiles';
import { UMLGraph, UMLNode, UMLEdge } from '../../../../shared/types';

export interface CodeAnalysisResult {
    filePath: string;
    language: string;
    content: string;
    ast?: any; // 抽象语法树（可选）
}

export class GenerateUMLUseCase {
    private readonly MODULE_ID = 'uml-canvas';
    private readonly supportedExtensions = ['.ts', '.js', '.py', '.java', '.cs', '.cpp', '.c', '.h'];

    constructor(
        private logger: Logger,
        private aiClient: OpenAIClient,
        private cache: KVCache
    ) {}

    /**
     * 从文件生成 UML 图表
     */
    async generateFromFile(fileUri: vscode.Uri): Promise<UMLGraph> {
        this.logger.info(`开始生成 UML 图表: ${fileUri.fsPath}`);

        // 验证文件类型
        const language = this.detectLanguage(fileUri.fsPath);
        if (!language) {
            throw new Error(`不支持的文件类型: ${path.extname(fileUri.fsPath)}`);
        }

        // 读取文件内容
        const content = await this.readFileContent(fileUri);
        
        // 检查缓存
        const cacheKey = await this.getCacheKey(fileUri.fsPath, content);
        const cachedResult = await this.cache.get<UMLGraph>(cacheKey, this.MODULE_ID);
        
        if (cachedResult) {
            this.logger.info(`使用缓存的 UML 图表: ${fileUri.fsPath}`);
            return cachedResult;
        }

        // 分析代码结构
        const analysisResult: CodeAnalysisResult = {
            filePath: fileUri.fsPath,
            language,
            content
        };

        // 生成 UML 图表
        const umlGraph = await this.generateUMLFromAnalysis(analysisResult);
        
        // 缓存结果
        const cacheTTL = 24 * 60 * 60 * 1000; // 24小时
        await this.cache.set(cacheKey, umlGraph, cacheTTL, this.MODULE_ID);

        this.logger.info(`UML 图表生成完成: ${umlGraph.nodes.length} 个节点, ${umlGraph.edges.length} 条边`);
        return umlGraph;
    }

    /**
     * 从多个文件生成综合 UML 图表
     */
    async generateFromMultipleFiles(fileUris: vscode.Uri[]): Promise<UMLGraph> {
        this.logger.info(`开始生成多文件 UML 图表，共 ${fileUris.length} 个文件`);

        const analysisResults: CodeAnalysisResult[] = [];
        
        // 并行分析所有文件
        const analysisPromises = fileUris.map(async (uri) => {
            const language = this.detectLanguage(uri.fsPath);
            if (language) {
                const content = await this.readFileContent(uri);
                return { filePath: uri.fsPath, language, content };
            }
            return null;
        });

        const results = await Promise.all(analysisPromises);
        analysisResults.push(...results.filter(r => r !== null) as CodeAnalysisResult[]);

        if (analysisResults.length === 0) {
            throw new Error('没有找到可分析的代码文件');
        }

        // 生成综合 UML 图表
        return await this.generateUMLFromMultipleAnalysis(analysisResults);
    }

    /**
     * 从单个分析结果生成 UML
     */
    private async generateUMLFromAnalysis(analysis: CodeAnalysisResult): Promise<UMLGraph> {
        try {
            // 构建 AI 提示
            const prompt = PromptProfiles.renderPrompt('uml-generation', {
                language: analysis.language,
                filePath: analysis.filePath,
                code: this.truncateCode(analysis.content, 3000) // 限制代码长度
            });

            if (!prompt) {
                throw new Error('找不到 UML 生成提示配置');
            }

            // 调用 AI 分析代码
            const response = await this.aiClient.chat({
                prompt: prompt.userPrompt,
                model: prompt.profile.model,
                temperature: prompt.profile.temperature,
                maxTokens: prompt.profile.maxTokens
            });

            // 解析 AI 返回的 UML 数据
            const umlGraph = this.parseUMLResponse(response.content, analysis);
            
            // 翻译标签为中文
            await this.translateLabelsToChines(umlGraph);

            return umlGraph;

        } catch (error) {
            this.logger.error(`UML 生成失败: ${analysis.filePath}`, error);
            throw new Error(`UML 生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 从多个分析结果生成综合 UML
     */
    private async generateUMLFromMultipleAnalysis(analyses: CodeAnalysisResult[]): Promise<UMLGraph> {
        // 为每个文件生成 UML，然后合并
        const umlGraphs = await Promise.all(
            analyses.map(analysis => this.generateUMLFromAnalysis(analysis))
        );

        return this.mergeUMLGraphs(umlGraphs);
    }

    /**
     * 合并多个 UML 图表
     */
    private mergeUMLGraphs(graphs: UMLGraph[]): UMLGraph {
        const mergedNodes: UMLNode[] = [];
        const mergedEdges: UMLEdge[] = [];
        const nodeIds = new Set<string>();
        const edgeKeys = new Set<string>();

        for (const graph of graphs) {
            // 合并节点
            for (const node of graph.nodes) {
                if (!nodeIds.has(node.id)) {
                    mergedNodes.push(node);
                    nodeIds.add(node.id);
                }
            }

            // 合并边
            for (const edge of graph.edges) {
                const edgeKey = `${edge.from}->${edge.to}:${edge.type}`;
                if (!edgeKeys.has(edgeKey)) {
                    mergedEdges.push(edge);
                    edgeKeys.add(edgeKey);
                }
            }
        }

        return {
            nodes: mergedNodes,
            edges: mergedEdges,
            metadata: {
                filePath: 'multiple-files',
                language: 'mixed',
                generatedAt: new Date()
            }
        };
    }

    /**
     * 解析 AI 返回的 UML 数据
     */
    private parseUMLResponse(content: string, analysis: CodeAnalysisResult): UMLGraph {
        try {
            // 提取 JSON 部分
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('AI 响应中没有找到有效的 JSON 数据');
            }

            const umlData = JSON.parse(jsonMatch[0]);
            
            // 验证数据结构
            if (!umlData.nodes || !Array.isArray(umlData.nodes)) {
                throw new Error('UML 数据格式错误：缺少 nodes 数组');
            }

            return {
                nodes: umlData.nodes || [],
                edges: umlData.edges || [],
                metadata: {
                    filePath: analysis.filePath,
                    language: analysis.language,
                    generatedAt: new Date()
                }
            };

        } catch (error) {
            this.logger.error('解析 UML 响应失败', { content, error });
            
            // 返回基本的 UML 结构作为兜底
            return {
                nodes: [{
                    id: 'unknown',
                    label: path.basename(analysis.filePath),
                    type: 'class',
                    visibility: 'public'
                }],
                edges: [],
                metadata: {
                    filePath: analysis.filePath,
                    language: analysis.language,
                    generatedAt: new Date()
                }
            };
        }
    }

    /**
     * 翻译标签为中文
     */
    private async translateLabelsToChines(umlGraph: UMLGraph): Promise<void> {
        try {
            // 收集需要翻译的标签
            const labelsToTranslate = umlGraph.nodes.map(node => node.label);
            
            if (labelsToTranslate.length === 0) {
                return;
            }

            const prompt = PromptProfiles.renderPrompt('code-comment-translation', {
                elements: JSON.stringify(labelsToTranslate),
                context: `UML 图表元素翻译，文件: ${umlGraph.metadata?.filePath}`
            });

            if (!prompt) {
                this.logger.warn('找不到代码注释翻译提示配置，跳过翻译');
                return;
            }

            const response = await this.aiClient.chat({
                prompt: prompt.userPrompt,
                model: prompt.profile.model,
                temperature: prompt.profile.temperature,
                maxTokens: prompt.profile.maxTokens
            });

            // 解析翻译结果并应用
            const translations = this.parseTranslations(response.content);
            this.applyTranslations(umlGraph, translations);

        } catch (error) {
            this.logger.warn('标签翻译失败，使用原标签', error);
        }
    }

    private parseTranslations(content: string): Record<string, string> {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            this.logger.warn('解析翻译结果失败', error);
        }
        return {};
    }

    private applyTranslations(umlGraph: UMLGraph, translations: Record<string, string>): void {
        for (const node of umlGraph.nodes) {
            if (translations[node.label]) {
                node.label = translations[node.label];
            }
        }
    }

    private detectLanguage(filePath: string): string | null {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.js': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c'
        };

        return languageMap[ext] || null;
    }

    private async readFileContent(uri: vscode.Uri): Promise<string> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(content).toString('utf8');
        } catch (error) {
            throw new Error(`读取文件失败: ${uri.fsPath}`);
        }
    }

    private truncateCode(code: string, maxLength: number): string {
        if (code.length <= maxLength) {
            return code;
        }
        return code.substring(0, maxLength) + '\\n\\n// ... 代码已截断 ...';
    }

    private async getCacheKey(filePath: string, content: string): Promise<string> {
        // 使用文件路径和内容哈希作为缓存键
        const contentHash = this.hashString(content);
        return `uml:${path.basename(filePath)}:${contentHash}`;
    }

    private hashString(str: string): string {
        let hash = 0;
        if (str.length === 0) {
            return hash.toString();
        }
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
}