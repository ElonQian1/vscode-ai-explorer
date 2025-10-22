// src/core/ai/SmartFileAnalyzer.ts
// [module: core] [tags: AI, FileAnalysis, MCP, Context]
/**
 * 智能文件分析器
 * 为AI资源管理器提供文件/文件夹的智能用途分析
 * 支持缓存和MCP协议集成
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../logging/Logger';
import { MultiProviderAIClient } from './MultiProviderAIClient';
import { KVCache } from '../cache/KVCache';
import { AIRequest, AIResponse } from '../../shared/types';

/**
 * 文件智能分析结果
 */
export interface SmartAnalysisResult {
    /** 文件/文件夹的主要用途 */
    purpose: string;
    /** 详细描述 */
    description?: string;
    /** 技术标签 */
    tags: string[];
    /** 重要性评分 (1-10) */
    importance: number;
    /** 分析来源 */
    source: 'rule-based' | 'ai-analysis' | 'cache';
    /** 分析时间 */
    analyzedAt: number;
    /** 是否为关键文件 */
    isKeyFile: boolean;
    /** 相关文件建议 */
    relatedFiles?: string[];
}

/**
 * MCP上下文信息
 */
export interface MCPContextInfo {
    /** 项目类型 */
    projectType: string;
    /** 主要技术栈 */
    techStack: string[];
    /** 项目架构模式 */
    architecturePattern?: string;
    /** 关键目录结构 */
    keyDirectories: Record<string, string>;
    /** 项目元数据 */
    metadata: {
        lastAnalyzed: number;
        fileCount: number;
        keyFileCount: number;
    };
}

export class SmartFileAnalyzer {
    private cache: KVCache;
    private contextCache: KVCache;
    private readonly moduleId = 'smart-analyzer';
    
    constructor(
        private logger: Logger,
        private aiClient: MultiProviderAIClient,
        private context: vscode.ExtensionContext
    ) {
        // 初始化缓存
        this.cache = new KVCache(
            this.context,
            this.logger,
            24 * 60 * 60 * 1000 // 24小时过期
        );
        
        // MCP上下文缓存
        this.contextCache = new KVCache(
            this.context,
            this.logger,
            7 * 24 * 60 * 60 * 1000 // 7天过期
        );
    }

    /**
     * 🧠 分析单个文件/文件夹的用途
     */
    async analyzeFileSmartly(filePath: string): Promise<SmartAnalysisResult> {
        const cacheKey = this.getCacheKey(filePath);
        
        // 1. 检查缓存
        const cached = await this.cache.get<SmartAnalysisResult>(cacheKey, this.moduleId);
        if (cached) {
            this.logger.debug(`[SmartAnalyzer] 缓存命中: ${filePath}`);
            return { ...cached, source: 'cache' as const };
        }

        // 2. 基于规则的快速分析
        const ruleBasedResult = this.analyzeByRules(filePath);
        if (ruleBasedResult) {
            await this.cache.set(cacheKey, ruleBasedResult, undefined, this.moduleId);
            return ruleBasedResult;
        }

        // 3. AI深度分析（后台执行）
        this.performAIAnalysis(filePath, cacheKey);
        
        // 4. 返回默认结果
        const defaultResult: SmartAnalysisResult = {
            purpose: this.getBasicPurpose(filePath),
            tags: this.getBasicTags(filePath),
            importance: 5,
            source: 'rule-based',
            analyzedAt: Date.now(),
            isKeyFile: false
        };
        
        return defaultResult;
    }

    /**
     * 📊 基于规则的快速分析
     */
    private analyzeByRules(filePath: string): SmartAnalysisResult | null {
        const fileName = path.basename(filePath).toLowerCase();
        const dirName = path.dirname(filePath).toLowerCase();
        const ext = path.extname(fileName);
        
        // 高优先级关键文件
        const keyFilePatterns = [
            { pattern: 'package.json', purpose: 'Node.js项目配置', importance: 10, tags: ['config', 'nodejs', 'dependencies'] },
            { pattern: 'tsconfig.json', purpose: 'TypeScript编译配置', importance: 9, tags: ['config', 'typescript', 'build'] },
            { pattern: 'webpack.config.js', purpose: 'Webpack打包配置', importance: 8, tags: ['config', 'build', 'webpack'] },
            { pattern: 'vite.config.js', purpose: 'Vite构建配置', importance: 8, tags: ['config', 'build', 'vite'] },
            { pattern: 'extension.ts', purpose: 'VS Code扩展入口文件', importance: 10, tags: ['vscode', 'extension', 'entry'] },
            { pattern: 'index.ts', purpose: '模块入口文件', importance: 7, tags: ['entry', 'module'] },
            { pattern: 'readme.md', purpose: '项目说明文档', importance: 8, tags: ['documentation', 'readme'] }
        ];

        for (const { pattern, purpose, importance, tags } of keyFilePatterns) {
            if (fileName === pattern) {
                return {
                    purpose,
                    tags,
                    importance,
                    source: 'rule-based',
                    analyzedAt: Date.now(),
                    isKeyFile: importance >= 8
                };
            }
        }

        // 目录类型分析
        if (this.isDirectory(filePath)) {
            const dirPurpose = this.analyzeDirByRules(fileName, dirName);
            if (dirPurpose) {
                return {
                    purpose: dirPurpose.purpose,
                    tags: dirPurpose.tags,
                    importance: dirPurpose.importance,
                    source: 'rule-based',
                    analyzedAt: Date.now(),
                    isKeyFile: false
                };
            }
        }

        // 文件类型分析
        const filePurpose = this.analyzeFileByRules(fileName, ext, dirName);
        if (filePurpose) {
            return {
                purpose: filePurpose.purpose,
                tags: filePurpose.tags,
                importance: filePurpose.importance,
                source: 'rule-based',
                analyzedAt: Date.now(),
                isKeyFile: filePurpose.importance >= 8
            };
        }

        return null;
    }

    /**
     * 📁 目录规则分析
     */
    private analyzeDirByRules(dirName: string, parentDir: string): { purpose: string; tags: string[]; importance: number } | null {
        const dirAnalysis = [
            { pattern: /^src$|^source$/, purpose: '源代码根目录', tags: ['source', 'code'], importance: 9 },
            { pattern: /^test$|^tests$|^spec$/, purpose: '测试文件目录', tags: ['test', 'qa'], importance: 7 },
            { pattern: /^doc$|^docs$|^documentation$/, purpose: '项目文档目录', tags: ['docs', 'documentation'], importance: 6 },
            { pattern: /^config$|^conf$|^configuration$/, purpose: '配置文件目录', tags: ['config', 'settings'], importance: 7 },
            { pattern: /^lib$|^library$|^libraries$/, purpose: '第三方库目录', tags: ['library', 'dependencies'], importance: 6 },
            { pattern: /^asset$|^assets$|^static$|^public$/, purpose: '静态资源目录', tags: ['assets', 'static'], importance: 5 },
            { pattern: /^util$|^utils$|^helper$|^helpers$/, purpose: '工具函数目录', tags: ['utils', 'helpers'], importance: 6 },
            { pattern: /^component$|^components$/, purpose: 'UI组件目录', tags: ['components', 'ui'], importance: 7 },
            { pattern: /^service$|^services$/, purpose: '业务服务目录', tags: ['service', 'business'], importance: 7 },
            { pattern: /^model$|^models$|^entity$/, purpose: '数据模型目录', tags: ['model', 'data'], importance: 7 },
            { pattern: /^controller$|^controllers$/, purpose: '控制器目录', tags: ['controller', 'api'], importance: 7 },
            { pattern: /^router$|^routes$|^routing$/, purpose: '路由配置目录', tags: ['router', 'navigation'], importance: 6 },
            { pattern: /^middleware$/, purpose: '中间件目录', tags: ['middleware', 'pipeline'], importance: 6 },
            { pattern: /^feature$|^features$/, purpose: '功能模块目录', tags: ['feature', 'module'], importance: 8 },
            { pattern: /^core$/, purpose: '核心功能目录', tags: ['core', 'foundation'], importance: 9 },
            { pattern: /^shared$|^common$/, purpose: '共享代码目录', tags: ['shared', 'common'], importance: 7 }
        ];

        for (const { pattern, purpose, tags, importance } of dirAnalysis) {
            if (pattern.test(dirName)) {
                return { purpose, tags, importance };
            }
        }

        return null;
    }

    /**
     * 📄 文件规则分析
     */
    private analyzeFileByRules(fileName: string, ext: string, dirName: string): { purpose: string; tags: string[]; importance: number } | null {
        // 测试文件
        if (fileName.includes('test') || fileName.includes('spec')) {
            return {
                purpose: '测试文件',
                tags: ['test', 'qa', ext.slice(1)],
                importance: 6
            };
        }

        // 配置文件
        if (fileName.includes('config') || fileName.includes('setting')) {
            return {
                purpose: '配置模块',
                tags: ['config', 'settings', ext.slice(1)],
                importance: 7
            };
        }

        // 工具文件
        if (fileName.includes('util') || fileName.includes('helper')) {
            return {
                purpose: '工具函数模块',
                tags: ['utils', 'helpers', ext.slice(1)],
                importance: 6
            };
        }

        // 扩展名分析
        const extAnalysis: Record<string, { purpose: string; tags: string[]; importance: number }> = {
            '.ts': { purpose: 'TypeScript模块', tags: ['typescript', 'code'], importance: 6 },
            '.js': { purpose: 'JavaScript模块', tags: ['javascript', 'code'], importance: 6 },
            '.vue': { purpose: 'Vue组件', tags: ['vue', 'component', 'ui'], importance: 6 },
            '.jsx': { purpose: 'React JSX组件', tags: ['react', 'jsx', 'component'], importance: 6 },
            '.tsx': { purpose: 'React TypeScript组件', tags: ['react', 'tsx', 'typescript'], importance: 6 },
            '.css': { purpose: '样式表', tags: ['css', 'styles'], importance: 5 },
            '.scss': { purpose: 'Sass样式表', tags: ['sass', 'scss', 'styles'], importance: 5 },
            '.less': { purpose: 'Less样式表', tags: ['less', 'styles'], importance: 5 },
            '.html': { purpose: 'HTML页面', tags: ['html', 'markup'], importance: 5 },
            '.md': { purpose: 'Markdown文档', tags: ['markdown', 'docs'], importance: 5 },
            '.json': { purpose: 'JSON数据文件', tags: ['json', 'data', 'config'], importance: 5 },
            '.sql': { purpose: 'SQL数据库脚本', tags: ['sql', 'database'], importance: 6 },
            '.py': { purpose: 'Python脚本', tags: ['python', 'script'], importance: 6 }
        };

        return extAnalysis[ext] || null;
    }

    /**
     * 🤖 AI深度分析（异步后台执行）
     */
    private async performAIAnalysis(filePath: string, cacheKey: string): Promise<void> {
        try {
            this.logger.info(`[SmartAnalyzer] 开始AI分析: ${filePath}`);
            
            // 读取文件内容（限制大小）
            const content = await this.readFileContent(filePath, 2000); // 前2000字符
            const fileName = path.basename(filePath);
            const dirStructure = await this.getDirectoryContext(path.dirname(filePath));

            const prompt = `
请分析这个文件的用途和重要性：

文件路径: ${filePath}
文件名: ${fileName}
目录结构: ${dirStructure}
文件内容预览:
\`\`\`
${content}
\`\`\`

请以JSON格式回答：
{
    "purpose": "简洁的用途描述（1-2句话）",
    "description": "详细描述（可选）", 
    "tags": ["技术标签数组"],
    "importance": 评分1-10,
    "isKeyFile": true/false,
    "relatedFiles": ["相关文件建议"]
}`;

            const aiRequest: AIRequest = {
                prompt: prompt,
                maxTokens: 300,
                temperature: 0.3
            };
            
            const response = await this.aiClient.sendRequest(aiRequest);

            const aiResult = this.parseAIResponse(response.content, filePath);
            if (aiResult) {
                aiResult.source = 'ai-analysis';
                aiResult.analyzedAt = Date.now();
                await this.cache.set(cacheKey, aiResult, undefined, this.moduleId);
                
                this.logger.info(`[SmartAnalyzer] AI分析完成: ${filePath} -> ${aiResult.purpose}`);
            }

        } catch (error) {
            this.logger.error(`[SmartAnalyzer] AI分析失败: ${filePath}`, error);
        }
    }

    /**
     * 🔄 生成MCP项目上下文
     */
    async generateMCPContext(workspacePath: string): Promise<MCPContextInfo> {
        const cacheKey = `mcp-context-${this.hashPath(workspacePath)}`;
        
        // 检查缓存
        const cached = await this.contextCache.get<MCPContextInfo>(cacheKey, this.moduleId);
        if (cached) {
            return cached;
        }

        this.logger.info(`[SmartAnalyzer] 生成MCP上下文: ${workspacePath}`);

        // 分析项目结构
        const projectType = await this.detectProjectType(workspacePath);
        const techStack = await this.detectTechStack(workspacePath);
        const keyDirectories = await this.analyzeKeyDirectories(workspacePath);
        
        const contextInfo: MCPContextInfo = {
            projectType,
            techStack,
            keyDirectories,
            metadata: {
                lastAnalyzed: Date.now(),
                fileCount: await this.countFiles(workspacePath),
                keyFileCount: Object.keys(keyDirectories).length
            }
        };

        // 缓存结果
        await this.contextCache.set(cacheKey, contextInfo, undefined, this.moduleId);
        
        return contextInfo;
    }

    /**
     * 🔍 检测项目类型
     */
    private async detectProjectType(workspacePath: string): Promise<string> {
        const packageJsonPath = path.join(workspacePath, 'package.json');
        
        try {
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
            
            if (packageJson.contributes?.commands) return 'VS Code Extension';
            if (packageJson.dependencies?.react) return 'React Application';
            if (packageJson.dependencies?.vue) return 'Vue Application';
            if (packageJson.dependencies?.express) return 'Node.js Server';
            if (packageJson.dependencies?.typescript) return 'TypeScript Project';
            
            return 'Node.js Project';
        } catch {
            // 检查其他项目类型标识
            if (await this.fileExists(path.join(workspacePath, 'Cargo.toml'))) return 'Rust Project';
            if (await this.fileExists(path.join(workspacePath, 'pom.xml'))) return 'Java Maven Project';
            if (await this.fileExists(path.join(workspacePath, 'requirements.txt'))) return 'Python Project';
            
            return 'General Project';
        }
    }

    /**
     * 🛠️ 检测技术栈
     */
    private async detectTechStack(workspacePath: string): Promise<string[]> {
        const techStack: string[] = [];
        const packageJsonPath = path.join(workspacePath, 'package.json');
        
        try {
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
            const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            
            if (allDeps.typescript) techStack.push('TypeScript');
            if (allDeps.react) techStack.push('React');
            if (allDeps.vue) techStack.push('Vue');
            if (allDeps.express) techStack.push('Express');
            if (allDeps.webpack) techStack.push('Webpack');
            if (allDeps.vite) techStack.push('Vite');
            if (allDeps.jest) techStack.push('Jest');
            if (allDeps.eslint) techStack.push('ESLint');
            
        } catch {
            // 基于文件扩展名推测
            // TODO: 扫描文件扩展名
        }

        return techStack;
    }

    /**
     * 📁 分析关键目录
     */
    private async analyzeKeyDirectories(workspacePath: string): Promise<Record<string, string>> {
        const keyDirs: Record<string, string> = {};
        
        try {
            const entries = await fs.readdir(workspacePath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const analysis = this.analyzeDirByRules(entry.name.toLowerCase(), '');
                    if (analysis && analysis.importance >= 7) {
                        keyDirs[entry.name] = analysis.purpose;
                    }
                }
            }
        } catch (error) {
            this.logger.warn(`[SmartAnalyzer] 无法分析目录结构: ${workspacePath}`, error);
        }

        return keyDirs;
    }

    // 辅助方法
    private getCacheKey(filePath: string): string {
        return `file-analysis-${this.hashPath(filePath)}`;
    }

    private hashPath(filePath: string): string {
        // 简单hash
        let hash = 0;
        for (let i = 0; i < filePath.length; i++) {
            hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
        }
        return Math.abs(hash).toString(36);
    }

    private getBasicPurpose(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.ts') return 'TypeScript文件';
        if (ext === '.js') return 'JavaScript文件';
        if (ext === '.json') return 'JSON配置文件';
        return '文件';
    }

    private getBasicTags(filePath: string): string[] {
        const ext = path.extname(filePath).slice(1).toLowerCase();
        return ext ? [ext] : ['unknown'];
    }

    private isDirectory(filePath: string): boolean {
        try {
            return require('fs').statSync(filePath).isDirectory();
        } catch {
            return !path.extname(filePath);
        }
    }

    private async readFileContent(filePath: string, maxLength: number): Promise<string> {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return content.substring(0, maxLength);
        } catch {
            return '';
        }
    }

    private async getDirectoryContext(dirPath: string): Promise<string> {
        try {
            const entries = await fs.readdir(dirPath);
            return entries.slice(0, 5).join(', '); // 前5个文件名
        } catch {
            return '';
        }
    }

    private parseAIResponse(response: string, filePath: string): SmartAnalysisResult | null {
        try {
            const parsed = JSON.parse(response);
            return {
                purpose: parsed.purpose || this.getBasicPurpose(filePath),
                description: parsed.description,
                tags: Array.isArray(parsed.tags) ? parsed.tags : this.getBasicTags(filePath),
                importance: Math.max(1, Math.min(10, parsed.importance || 5)),
                source: 'ai-analysis',
                analyzedAt: Date.now(),
                isKeyFile: Boolean(parsed.isKeyFile),
                relatedFiles: Array.isArray(parsed.relatedFiles) ? parsed.relatedFiles : undefined
            };
        } catch {
            return null;
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private async countFiles(dirPath: string): Promise<number> {
        try {
            const entries = await fs.readdir(dirPath, { recursive: true });
            return entries.length;
        } catch {
            return 0;
        }
    }
}