// src/features/file-analysis/FileAnalysisService.ts
// [module: file-analysis] [tags: Service, Coordinator]
/**
 * 文件分析服务
 * 协调静态分析、AI分析和缓存
 */

import { Logger } from '../../core/logging/Logger';
import { MultiProviderAIClient } from '../../core/ai/MultiProviderAIClient';
import { StaticAnalyzer } from './StaticAnalyzer';
import { LLMAnalyzer } from './LLMAnalyzer';
import { CapsuleCache } from './CapsuleCache';
import { FileCapsule, AnalysisOptions, Fact, Inference, Recommendation } from './types';
import { toPosixRelative, getWorkspaceRelative } from '../../shared/utils/pathUtils';
import * as vscode from 'vscode';

export class FileAnalysisService {
    private logger: Logger;
    private staticAnalyzer: StaticAnalyzer;
    private llmAnalyzer?: LLMAnalyzer;
    private aiClient?: MultiProviderAIClient;
    private cache: CapsuleCache;

    constructor(logger: Logger) {
        this.logger = logger;
        this.staticAnalyzer = new StaticAnalyzer(logger);
        this.cache = new CapsuleCache(logger);
        // 异步初始化缓存目录
        this.cache.initialize().catch(err => {
            this.logger.error('[FileAnalysisService] 缓存初始化失败', err);
        });
    }

    /**
     * 初始化AI客户端(延迟初始化)
     */
    private async ensureAIClient(): Promise<void> {
        if (!this.aiClient) {
            this.aiClient = new MultiProviderAIClient(this.logger);
            await this.aiClient.initialize();
            this.llmAnalyzer = new LLMAnalyzer(this.aiClient, this.logger);
            this.logger.info('[FileAnalysisService] AI客户端已初始化');
        }
    }

    /**
     * 仅执行静态分析(快速返回)
     * 用于乐观UI模式,立即返回基础结果
     * 
     * 🔥 Phase 4: 增加缓存支持
     * - 先计算 contentHash
     * - 检查缓存是否命中
     * - 未命中时才执行静态分析
     * 
     * @param filePath - 文件绝对路径
     * @returns FileCapsule，其中 file 字段为 POSIX 相对路径
     */
    public async analyzeFileStatic(filePath: string): Promise<FileCapsule> {
        this.logger.info(`[FileAnalysisService] 静态分析: ${filePath}`);

        try {
            // 0. 读取文件内容并计算哈希
            const fileUri = vscode.Uri.file(filePath);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const contentText = Buffer.from(fileContent).toString('utf8');
            const contentHash = CapsuleCache.computeContentHash(contentText);

            // 1. 检查缓存
            const cachedCapsule = await this.cache.get(contentHash);
            if (cachedCapsule) {
                this.logger.info(`[FileAnalysisService] ✅ 缓存命中: ${filePath}`);
                return cachedCapsule;
            }

            // 2. 静态分析（缓存未命中）
            this.logger.info(`[FileAnalysisService] ❌ 缓存未命中，执行静态分析`);
            const staticResult = await this.staticAnalyzer.analyzeFile(filePath);

            // 3. 转换为工作区相对路径 (POSIX 格式)
            const relativePath = getWorkspaceRelative(fileUri);
            
            if (!relativePath) {
                throw new Error(`文件不在工作区内: ${filePath}`);
            }

            // 3. 生成基础事实列表
            const facts = this.generateFacts(staticResult);

            // 4. 生成简单摘要(基于静态分析)
            const summary = {
                zh: this.generateSummary(staticResult, 'zh'),
                en: this.generateSummary(staticResult, 'en')
            };

            // 5. 构建基础 FileCapsule (不含AI分析)
            const capsule: FileCapsule = {
                version: '1.0',
                file: relativePath,  // ✅ 使用 POSIX 相对路径
                lang: staticResult.lang,
                contentHash: staticResult.contentHash,
                summary,
                api: staticResult.api,
                deps: {
                    out: staticResult.deps.out,
                    inSample: []
                },
                facts,
                inferences: [],  // AI分析后再填充
                recommendations: [],  // AI分析后再填充
                evidence: staticResult.evidence,
                stale: false,
                lastVerifiedAt: new Date().toISOString()
            };

            // 6. 写入缓存（仅静态部分）
            await this.cache.set(contentHash, capsule);

            this.logger.info(`[FileAnalysisService] 静态分析完成并缓存: ${relativePath}`);
            return capsule;

        } catch (error) {
            this.logger.error(`[FileAnalysisService] 静态分析失败: ${filePath}`, error);
            throw error;
        }
    }

    /**
     * 对已有的静态分析结果进行AI增强
     */
    public async enhanceWithAI(staticCapsule: FileCapsule, options: AnalysisOptions = {}): Promise<FileCapsule> {
        const relativePath = staticCapsule.file;
        this.logger.info(`[FileAnalysisService] AI增强分析: ${relativePath}`);

        try {
            // 检查是否启用AI
            const config = vscode.workspace.getConfiguration('aiExplorer');
            const enableAI = options.includeAI !== false && config.get<boolean>('fileAnalysis.enableAI', true);

            if (!enableAI) {
                this.logger.info('[FileAnalysisService] AI分析未启用,返回静态结果');
                return staticCapsule;
            }

            // 初始化AI客户端
            await this.ensureAIClient();

            if (!this.llmAnalyzer) {
                this.logger.warn('[FileAnalysisService] AI客户端未初始化,返回静态结果');
                return staticCapsule;
            }

            // 🔥 将相对路径转换为绝对路径
            // capsule.file 是 POSIX 相对路径（如 "/src/main.tsx"）
            // 需要转换为绝对路径才能读取文件
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.logger.error('[FileAnalysisService] 无法获取工作区根目录');
                return staticCapsule;
            }
            
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const normalizedRelative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
            const absolutePath = vscode.Uri.joinPath(workspaceFolders[0].uri, normalizedRelative).fsPath;
            
            this.logger.info(`[FileAnalysisService] 路径转换: ${relativePath} → ${absolutePath}`);

            // 读取文件内容
            const uri = vscode.Uri.file(absolutePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(content).toString('utf8');

            // 准备AI分析输入（使用相对路径，更易读）
            const aiInput = {
                filePath: relativePath,
                lang: staticCapsule.lang,
                content: text,
                staticAnalysis: {
                    apiCount: staticCapsule.api.length,
                    apiSummary: staticCapsule.api.map(a => `${a.kind} ${a.name}`).join(', ') || '无',
                    depsCount: staticCapsule.deps.out.length,
                    depsSummary: staticCapsule.deps.out.map(d => d.module).join(', ') || '无'
                }
            };

            const aiResult = await this.llmAnalyzer.analyzeFile(aiInput);

            // 合并AI结果到静态结果
            const enhancedCapsule: FileCapsule = {
                ...staticCapsule,
                summary: aiResult.summary,  // 使用AI生成的更详细摘要
                inferences: aiResult.inferences,
                recommendations: aiResult.recommendations,
                lastVerifiedAt: new Date().toISOString()
            };

            // 🔥 Phase 4: 更新缓存（包含AI增强结果）
            await this.cache.set(staticCapsule.contentHash, enhancedCapsule);

            this.logger.info('[FileAnalysisService] AI增强完成并更新缓存');
            return enhancedCapsule;

        } catch (error) {
            this.logger.warn('[FileAnalysisService] AI增强失败,返回静态结果', error);
            // 降级: 返回原始静态结果
            return staticCapsule;
        }
    }

    /**
     * 分析文件并返回 FileCapsule
     * @deprecated 使用 analyzeFileStatic + enhanceWithAI 替代,以支持乐观UI
     */
    public async analyzeFile(filePath: string, options: AnalysisOptions = {}): Promise<FileCapsule> {
        this.logger.info(`[FileAnalysisService] 开始分析文件: ${filePath}`);

        try {
            // 1. 静态分析
            const staticResult = await this.staticAnalyzer.analyzeFile(filePath);

            // 2. 生成基础事实列表
            const facts = this.generateFacts(staticResult);

            // 3. 检查是否需要AI分析
            const config = vscode.workspace.getConfiguration('aiExplorer');
            const enableAI = options.includeAI !== false && config.get<boolean>('fileAnalysis.enableAI', true);

            let summary = {
                zh: this.generateSummary(staticResult, 'zh'),
                en: this.generateSummary(staticResult, 'en')
            };
            let inferences: Inference[] = [];
            let recommendations: Recommendation[] = [];

            // 4. AI 分析(如果启用)
            if (enableAI) {
                try {
                    await this.ensureAIClient();
                    
                    if (this.llmAnalyzer) {
                        this.logger.info('[FileAnalysisService] 开始AI增强分析...');
                        
                        // 读取文件内容
                        const uri = vscode.Uri.file(filePath);
                        const content = await vscode.workspace.fs.readFile(uri);
                        const text = Buffer.from(content).toString('utf8');

                        // 准备AI分析输入
                        const aiInput = {
                            filePath,
                            lang: staticResult.lang,
                            content: text,
                            staticAnalysis: {
                                apiCount: staticResult.api.length,
                                apiSummary: staticResult.api.map(a => `${a.kind} ${a.name}`).join(', ') || '无',
                                depsCount: staticResult.deps.out.length,
                                depsSummary: staticResult.deps.out.map(d => d.module).join(', ') || '无'
                            }
                        };

                        const aiResult = await this.llmAnalyzer.analyzeFile(aiInput);
                        
                        // 使用AI生成的摘要和分析
                        summary = aiResult.summary;
                        inferences = aiResult.inferences;
                        recommendations = aiResult.recommendations;

                        this.logger.info('[FileAnalysisService] AI分析完成');
                    }
                } catch (aiError) {
                    this.logger.warn('[FileAnalysisService] AI分析失败,使用静态分析结果', aiError);
                    // 降级:继续使用静态生成的摘要
                }
            }

            // 5. 构建 FileCapsule
            const capsule: FileCapsule = {
                version: '1.0',
                file: filePath,
                lang: staticResult.lang,
                contentHash: staticResult.contentHash,
                summary,
                api: staticResult.api,
                deps: {
                    out: staticResult.deps.out,
                    inSample: [] // TODO: 实现入依赖分析
                },
                facts,
                inferences,
                recommendations,
                evidence: staticResult.evidence,
                stale: false,
                lastVerifiedAt: new Date().toISOString()
            };

            this.logger.info(`[FileAnalysisService] 分析完成: ${filePath}`);
            return capsule;

        } catch (error) {
            this.logger.error(`[FileAnalysisService] 分析失败: ${filePath}`, error);
            
            // 返回最小化的错误结果
            return {
                version: '1.0',
                file: filePath,
                lang: 'unknown',
                contentHash: 'error',
                summary: {
                    zh: '文件分析失败',
                    en: 'File analysis failed'
                },
                api: [],
                deps: { out: [], inSample: [] },
                facts: [{
                    id: 'error',
                    text: `分析错误: ${error instanceof Error ? error.message : '未知错误'}`,
                    evidence: []
                }],
                inferences: [],
                recommendations: [],
                evidence: {},
                stale: true,
                lastVerifiedAt: new Date().toISOString()
            };
        }
    }

    /**
     * 生成事实列表
     */
    private generateFacts(staticResult: any): Fact[] {
        const facts: Fact[] = [];
        let factId = 1;

        // 事实: API符号数量
        if (staticResult.api.length > 0) {
            const exportedApis = staticResult.api.filter((a: any) => a.exported !== false);
            facts.push({
                id: `f${factId++}`,
                text: `该文件导出了 ${exportedApis.length} 个符号`,
                evidence: exportedApis.slice(0, 3).flatMap((a: any) => a.evidence)
            });

            // 按类型统计
            const byKind = new Map<string, number>();
            exportedApis.forEach((a: any) => {
                byKind.set(a.kind, (byKind.get(a.kind) || 0) + 1);
            });

            byKind.forEach((count, kind) => {
                const kindText = {
                    'function': '函数',
                    'class': '类',
                    'interface': '接口',
                    'type': '类型别名',
                    'const': '常量',
                    'enum': '枚举',
                    'variable': '变量'
                }[kind] || kind;

                facts.push({
                    id: `f${factId++}`,
                    text: `包含 ${count} 个${kindText}`,
                    evidence: exportedApis
                        .filter((a: any) => a.kind === kind)
                        .slice(0, 2)
                        .flatMap((a: any) => a.evidence)
                });
            });
        }

        // 事实: 依赖数量
        if (staticResult.deps.out.length > 0) {
            facts.push({
                id: `f${factId++}`,
                text: `该文件依赖 ${staticResult.deps.out.length} 个外部模块`,
                evidence: staticResult.deps.out.slice(0, 3).flatMap((d: any) => d.evidence)
            });

            // 区分内部和外部依赖
            const internalDeps = staticResult.deps.out.filter((d: any) => d.isRelative);
            const externalDeps = staticResult.deps.out.filter((d: any) => !d.isRelative);

            if (internalDeps.length > 0) {
                facts.push({
                    id: `f${factId++}`,
                    text: `包含 ${internalDeps.length} 个内部模块引用`,
                    evidence: internalDeps.slice(0, 2).flatMap((d: any) => d.evidence)
                });
            }

            if (externalDeps.length > 0) {
                facts.push({
                    id: `f${factId++}`,
                    text: `包含 ${externalDeps.length} 个外部库引用`,
                    evidence: externalDeps.slice(0, 2).flatMap((d: any) => d.evidence)
                });
            }
        }

        // 事实: 文件语言
        facts.push({
            id: `f${factId++}`,
            text: `文件语言: ${staticResult.lang}`,
            evidence: []
        });

        return facts;
    }

    /**
     * 生成简单摘要 (基于静态分析)
     */
    private generateSummary(staticResult: any, lang: 'zh' | 'en'): string {
        const apiCount = staticResult.api.length;
        const depsCount = staticResult.deps.out.length;
        const fileType = staticResult.lang;

        if (lang === 'zh') {
            if (apiCount === 0 && depsCount === 0) {
                return `这是一个 ${fileType} 文件,暂未检测到导出符号或依赖关系。`;
            }

            const parts: string[] = [`这是一个 ${fileType} 模块`];
            
            if (apiCount > 0) {
                const kinds = new Set<string>(staticResult.api.map((a: any) => a.kind as string));
                const kindText = Array.from(kinds).map((k: string) => {
                    const map: Record<string, string> = {
                        'function': '函数',
                        'class': '类',
                        'interface': '接口',
                        'type': '类型',
                        'const': '常量'
                    };
                    return map[k] || k;
                }).join('、');
                parts.push(`导出了 ${apiCount} 个符号(${kindText})`);
            }

            if (depsCount > 0) {
                parts.push(`依赖 ${depsCount} 个外部模块`);
            }

            return parts.join(',') + '。';
        } else {
            // English summary
            if (apiCount === 0 && depsCount === 0) {
                return `This is a ${fileType} file with no detected exports or dependencies.`;
            }

            const parts: string[] = [`This is a ${fileType} module`];
            
            if (apiCount > 0) {
                parts.push(`exporting ${apiCount} symbol(s)`);
            }

            if (depsCount > 0) {
                parts.push(`with ${depsCount} external dependencies`);
            }

            return parts.join(' ') + '.';
        }
    }

    // ==================== 缓存管理 ====================

    /**
     * 清除所有缓存
     */
    public async clearCache(): Promise<void> {
        await this.cache.clear();
        this.logger.info('[FileAnalysisService] 缓存已清除');
    }

    /**
     * 获取缓存统计信息
     */
    public getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * 打印缓存统计信息
     */
    public logCacheStats(): void {
        this.cache.logStats();
    }

    /**
     * 获取缓存命中率
     */
    public getCacheHitRate(): number {
        return this.cache.getHitRate();
    }
}
