/**
 * 🧠 增强版AI分析UseCase
 * 
 * 核心特性：
 * 1. 🎯 优先缓存加载：快速响应
 * 2. 🔄 增量AI分析：流式更新
 * 3. 📝 用户备注分离：避免覆盖
 * 4. ⚡ 后台智能分析：非阻塞体验
 * 5. 🔔 实时状态反馈：进度可视化
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from '../../../core/logging/Logger';
import { MultiProviderAIClient } from '../../../core/ai/MultiProviderAIClient';
import { EnhancedCapsuleCache, CapsuleData, AIAnalysisResult } from '../cache/EnhancedCapsuleCache';
import { UserNotes as EnhancedUserNotes, createEmptyUserNotes } from '../types/UserNotes';

export interface AnalysisRequest {
    filePath: string;
    forceRefresh?: boolean;
    includeAI?: boolean;
    progressCallback?: (stage: AnalysisStage, progress: number) => void;
}

export interface AnalysisResult {
    success: boolean;
    data?: CapsuleData;
    fromCache: boolean;
    error?: string;
    analysisTime: number;
}

export enum AnalysisStage {
    Loading = 'loading',
    StaticAnalysis = 'static',
    AIAnalysis = 'ai',
    Caching = 'caching',
    Complete = 'complete'
}

export class EnhancedAnalysisUseCase {
    private cache: EnhancedCapsuleCache;
    private aiClient: MultiProviderAIClient | null = null;
    private isAIInitialized = false;

    constructor(
        private logger: Logger,
        private context: vscode.ExtensionContext
    ) {
        this.cache = new EnhancedCapsuleCache(logger, context);
        this.initialize();
    }

    private async initialize(): Promise<void> {
        await this.cache.initialize();
        this.logger.info('[EnhancedAnalysis] ✅ UseCase初始化完成');
    }

    /**
     * 分析单个文件（主入口）
     */
    public async analyzeFile(request: AnalysisRequest): Promise<AnalysisResult> {
        const startTime = Date.now();
        const { filePath, forceRefresh = false, includeAI = true, progressCallback } = request;

        try {
            progressCallback?.(AnalysisStage.Loading, 0);
            
            // 1. 读取文件内容和计算哈希
            const { content, contentHash } = await this.readFileContent(filePath);
            
            // 2. 尝试从缓存加载（除非强制刷新）
            if (!forceRefresh) {
                const cached = await this.cache.getCapsule(filePath, contentHash);
                if (cached) {
                    progressCallback?.(AnalysisStage.Complete, 100);
                    return {
                        success: true,
                        data: cached,
                        fromCache: true,
                        analysisTime: Date.now() - startTime
                    };
                }
            }

            // 3. 执行静态分析
            progressCallback?.(AnalysisStage.StaticAnalysis, 25);
            const staticResult = await this.performStaticAnalysis(content, filePath);

            // 4. 创建基础胶囊数据
            let capsuleData = await this.createBaseCapsule(filePath, contentHash, staticResult);
            
            // 5. 保存静态分析结果（立即可用）
            await this.cache.saveAIAnalysis(filePath, contentHash, capsuleData.ai);
            progressCallback?.(AnalysisStage.Caching, 60);

            // 6. 后台执行AI分析（如果需要）
            if (includeAI) {
                this.performBackgroundAIAnalysis(filePath, contentHash, content, staticResult, progressCallback);
            } else {
                progressCallback?.(AnalysisStage.Complete, 100);
            }

            return {
                success: true,
                data: capsuleData,
                fromCache: false,
                analysisTime: Date.now() - startTime
            };

        } catch (error) {
            this.logger.error(`[EnhancedAnalysis] 分析失败: ${filePath}`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '分析失败',
                fromCache: false,
                analysisTime: Date.now() - startTime
            };
        }
    }

    /**
     * 批量分析文件
     */
    public async analyzeFiles(filePaths: string[], options?: {
        includeAI?: boolean;
        concurrency?: number;
        progressCallback?: (completed: number, total: number, current: string) => void;
    }): Promise<AnalysisResult[]> {
        const { includeAI = true, concurrency = 3, progressCallback } = options || {};
        const results: AnalysisResult[] = [];
        
        // 分批处理以控制并发
        for (let i = 0; i < filePaths.length; i += concurrency) {
            const batch = filePaths.slice(i, i + concurrency);
            const batchPromises = batch.map(async (filePath) => {
                progressCallback?.(i, filePaths.length, filePath);
                return this.analyzeFile({ filePath, includeAI });
            });
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults.map(r => 
                r.status === 'fulfilled' ? r.value : {
                    success: false,
                    error: 'Promise rejected',
                    fromCache: false,
                    analysisTime: 0
                }
            ));
        }

        progressCallback?.(filePaths.length, filePaths.length, 'completed');
        return results;
    }

    /**
     * 保存用户备注（独立于AI分析）
     */
    public async saveUserNotes(filePath: string, notes: {
        comments?: string[];
        tags?: string[];
        priority?: 'low' | 'medium' | 'high';
        bookmarked?: boolean;
    }): Promise<void> {
        await this.cache.saveUserNotes(filePath, notes);
        this.logger.info(`[EnhancedAnalysis] 📝 用户备注已保存: ${filePath}`);
    }

    /**
     * 保存增强版用户备注（新版API）
     */
    public async saveEnhancedUserNotes(filePath: string, notes: EnhancedUserNotes): Promise<void> {
        await this.cache.saveEnhancedUserNotes(filePath, notes);
        this.logger.info(`[EnhancedAnalysis] ✨ 增强版用户备注已保存: ${filePath}`);
    }

    /**
     * 获取增强版用户备注
     */
    public async getEnhancedUserNotes(filePath: string): Promise<EnhancedUserNotes | null> {
        const notes = await this.cache.getEnhancedUserNotes(filePath);
        if (notes) {
            this.logger.info(`[EnhancedAnalysis] ✨ 增强版用户备注已加载: ${filePath}`);
        } else {
            this.logger.debug(`[EnhancedAnalysis] 增强版用户备注不存在: ${filePath}`);
        }
        return notes;
    }

    /**
     * 获取或创建增强版用户备注
     */
    public async getOrCreateEnhancedUserNotes(filePath: string): Promise<EnhancedUserNotes> {
        let notes = await this.getEnhancedUserNotes(filePath);
        if (!notes) {
            notes = createEmptyUserNotes(filePath);
            await this.saveEnhancedUserNotes(filePath, notes);
        }
        return notes;
    }

    /**
     * 获取缓存统计信息
     */
    public getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * 清理缓存
     */
    public async clearCache(): Promise<void> {
        await this.cache.clearAll();
        this.logger.info('[EnhancedAnalysis] 🧹 缓存已清理');
    }

    /**
     * 销毁UseCase
     */
    public dispose(): void {
        this.cache.dispose();
    }

    // ===== 私有方法 =====

    private async readFileContent(filePath: string): Promise<{ content: string; contentHash: string }> {
        try {
            const uri = vscode.Uri.file(filePath);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = Buffer.from(bytes).toString('utf8');
            const contentHash = crypto.createHash('sha256').update(content).digest('hex');
            
            return { content, contentHash };
        } catch (error) {
            throw new Error(`无法读取文件: ${filePath} - ${error}`);
        }
    }

    private async performStaticAnalysis(content: string, filePath: string): Promise<{
        exports: string[];
        imports: string[];
        functions: string[];
        classes: string[];
        summary: string;
    }> {
        // 简单的静态分析实现
        const lines = content.split('\n');
        const exports: string[] = [];
        const imports: string[] = [];
        const functions: string[] = [];
        const classes: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            
            // 导出检测
            if (trimmed.startsWith('export ')) {
                const match = trimmed.match(/export\\s+(function|class|const|let|var)\\s+(\\w+)/);
                if (match) exports.push(match[2]);
            }
            
            // 导入检测
            if (trimmed.startsWith('import ')) {
                const match = trimmed.match(/from\\s+['"']([^'"']+)['"']/);
                if (match) imports.push(match[1]);
            }
            
            // 函数检测
            if (trimmed.includes('function ')) {
                const match = trimmed.match(/function\\s+(\\w+)/);
                if (match) functions.push(match[1]);
            }
            
            // 类检测
            if (trimmed.startsWith('class ')) {
                const match = trimmed.match(/class\\s+(\\w+)/);
                if (match) classes.push(match[1]);
            }
        }

        const summary = `文件包含 ${functions.length} 个函数，${classes.length} 个类，${exports.length} 个导出，${imports.length} 个导入`;
        
        return { exports, imports, functions, classes, summary };
    }

    private async createBaseCapsule(
        filePath: string,
        contentHash: string,
        staticResult: any
    ): Promise<CapsuleData> {
        const now = Date.now();
        
        return {
            meta: {
                version: '2.0',
                filePath,
                language: this.detectLanguage(filePath),
                contentHash,
                fileSize: 0, // TODO: 实际文件大小
                lastModified: now,
                createdAt: now,
                updatedAt: now
            },
            ai: {
                static: staticResult,
                inferences: [],
                suggestions: [],
                analyzedAt: now,
                aiVersion: '1.0'
            },
            notes: {
                comments: [],
                tags: [],
                lastEditedAt: now,
                bookmarked: false
            }
        };
    }

    private async performBackgroundAIAnalysis(
        filePath: string,
        contentHash: string,
        content: string,
        staticResult: any,
        progressCallback?: (stage: AnalysisStage, progress: number) => void
    ): Promise<void> {
        // 异步执行，不阻塞主流程
        setTimeout(async () => {
            try {
                progressCallback?.(AnalysisStage.AIAnalysis, 70);
                
                // 确保AI客户端已初始化
                await this.ensureAIClient();
                
                if (!this.aiClient) {
                    this.logger.warn('[EnhancedAnalysis] AI客户端未可用，跳过AI分析');
                    return;
                }

                // 执行AI分析
                const aiResult = await this.performAIAnalysis(content, staticResult);
                
                // 增量更新AI结果
                await this.cache.mergeAIAnalysis(filePath, contentHash, {
                    inferences: aiResult.inferences,
                    suggestions: aiResult.suggestions,
                    analyzedAt: Date.now(),
                    aiVersion: '1.0'
                });

                progressCallback?.(AnalysisStage.Complete, 100);
                this.logger.info(`[EnhancedAnalysis] 🤖 AI分析完成: ${filePath}`);
                
                // 通知UI更新
                this.notifyAIAnalysisComplete(filePath, aiResult);

            } catch (error) {
                this.logger.error(`[EnhancedAnalysis] AI分析失败: ${filePath}`, error);
            }
        }, 100); // 短延迟确保主流程先完成
    }

    private async ensureAIClient(): Promise<void> {
        if (!this.isAIInitialized) {
            this.aiClient = new MultiProviderAIClient(this.logger);
            await this.aiClient.initialize();
            this.isAIInitialized = true;
        }
    }

    private async performAIAnalysis(content: string, staticResult: any): Promise<{
        inferences: string[];
        suggestions: string[];
    }> {
        if (!this.aiClient) {
            this.logger.warn('[EnhancedAnalysis] AI客户端未初始化，返回空结果');
            return { inferences: [], suggestions: [] };
        }

        try {
            // 构建AI分析提示词
            const prompt = this.buildAnalysisPrompt(content, staticResult);
            
            // 调用AI服务进行分析
            const aiRequest = {
                prompt: prompt,
                temperature: 0.3,
                maxTokens: 1000
            };
            
            const response = await this.aiClient.sendRequest(aiRequest);

            // 解析AI响应
            return this.parseAIResponse(response.content);
            
        } catch (error) {
            this.logger.error('[EnhancedAnalysis] AI分析失败', error);
            // 返回基于静态分析的推断作为兜底
            return this.generateFallbackAnalysis(staticResult);
        }
    }

    private buildAnalysisPrompt(content: string, staticResult: any): string {
        const exports = staticResult.exports?.join(', ') || '无';
        const imports = staticResult.imports?.join(', ') || '无';
        const functions = staticResult.functions?.join(', ') || '无';
        const classes = staticResult.classes?.join(', ') || '无';

        return `请分析以下代码文件，提供推断和建议。

**代码内容**:
\`\`\`
${content.substring(0, 2000)}${content.length > 2000 ? '...(内容被截断)' : ''}
\`\`\`

**静态分析结果**:
- 导出: ${exports}
- 导入: ${imports}  
- 函数: ${functions}
- 类: ${classes}

请按以下格式回复:
**推断**:
1. [第一个推断]
2. [第二个推断]
...

**建议**:
1. [第一个建议]
2. [第二个建议]
...`;
    }

    private parseAIResponse(response: string): { inferences: string[]; suggestions: string[] } {
        const inferences: string[] = [];
        const suggestions: string[] = [];
        
        const lines = response.split('\n');
        let currentSection: 'inferences' | 'suggestions' | null = null;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.includes('推断') || trimmed.includes('Inferences')) {
                currentSection = 'inferences';
                continue;
            }
            
            if (trimmed.includes('建议') || trimmed.includes('Suggestions')) {
                currentSection = 'suggestions';
                continue;
            }
            
            // 解析列表项 (1. xxx 或 - xxx)
            const match = trimmed.match(/^[\d\-\*]\s*\.?\s*(.+)$/);
            if (match && currentSection) {
                const content = match[1].trim();
                if (content) {
                    if (currentSection === 'inferences') {
                        inferences.push(content);
                    } else {
                        suggestions.push(content);
                    }
                }
            }
        }
        
        return { inferences, suggestions };
    }

    private generateFallbackAnalysis(staticResult: any): { inferences: string[]; suggestions: string[] } {
        const inferences: string[] = [];
        const suggestions: string[] = [];
        
        // 基于静态分析生成推断
        if (staticResult.exports?.length > 0) {
            inferences.push(`该文件导出了 ${staticResult.exports.length} 个模块，可能是一个工具库或组件`);
        }
        
        if (staticResult.imports?.length > 0) {
            inferences.push(`文件依赖了 ${staticResult.imports.length} 个外部模块，集成度较高`);
        }
        
        if (staticResult.functions?.length > 0) {
            inferences.push(`包含 ${staticResult.functions.length} 个函数，提供了丰富的功能接口`);
        }
        
        // 生成通用建议
        suggestions.push('建议添加更多的单元测试以提高代码质量');
        suggestions.push('考虑添加更详细的文档注释');
        
        return { inferences, suggestions };
    }

    private detectLanguage(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript', 
            'jsx': 'javascript',
            'py': 'python',
            'java': 'java',
            'cs': 'csharp',
            'cpp': 'cpp',
            'c': 'c',
            'go': 'go',
            'rs': 'rust'
        };
        return langMap[ext || ''] || 'unknown';
    }

    private notifyAIAnalysisComplete(filePath: string, aiResult: any): void {
        // 发送消息给webview，通知AI分析完成
        // TODO: 实现具体的通知机制
        this.logger.debug(`[EnhancedAnalysis] 🔔 通知AI分析完成: ${filePath}`);
    }

    /**
     * 将CapsuleData转换为FileCapsule格式（用于UI展示）
     */
    public convertToFileCapsule(capsuleData: CapsuleData): any {
        const { meta, ai, notes } = capsuleData;
        
        return {
            version: '1.0',
            file: meta.filePath,
            lang: meta.language,
            contentHash: meta.contentHash,
            summary: {
                zh: ai?.static?.summary || '静态分析完成',
                en: ai?.static?.summary || 'Static analysis completed'
            },
            api: ai?.static?.exports?.map(name => ({
                name,
                type: 'export',
                signature: name
            })) || [],
            deps: {
                imports: ai?.static?.imports || [],
                exports: ai?.static?.exports || []
            },
            facts: ai?.static ? [
                `包含 ${ai.static.functions.length} 个函数`,
                `包含 ${ai.static.classes.length} 个类`,
                `导入 ${ai.static.imports.length} 个模块`,
                `导出 ${ai.static.exports.length} 个符号`
            ] : [],
            inferences: ai?.inferences?.map(inf => ({
                category: 'analysis',
                content: inf,
                confidence: 0.8
            })) || [],
            recommendations: ai?.suggestions?.map(sug => ({
                type: 'improvement',
                priority: 'medium',
                content: sug
            })) || [],
            // 附加用户备注信息（如果有的话）
            userNotes: notes || undefined
        };
    }
}