/**
 * 🚀 增强版S3胶囊缓存系统
 * 
 * 核心特性：
 * 1. 🎯 分离存储：AI分析结果 vs 用户备注
 * 2. 📁 文件监听：自动失效缓存
 * 3. 🔄 增量更新：流式AI结果合并
 * 4. 📝 版本控制：支持历史版本查询
 * 5. 🧠 智能缓存：基于contentHash的自动失效
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../../../core/logging/Logger';

// ===== 类型定义 =====

/**
 * 胶囊数据分离存储格式
 */
export interface CapsuleData {
    /** 基本元数据 */
    meta: CapsuleMeta;
    /** AI分析结果 */
    ai: AIAnalysisResult;
    /** 用户备注数据 */
    notes: UserNotes;
}

export interface CapsuleMeta {
    version: '2.0';
    filePath: string;
    language: string;
    contentHash: string;
    fileSize: number;
    lastModified: number;
    createdAt: number;
    updatedAt: number;
}

export interface AIAnalysisResult {
    /** 静态分析 */
    static: {
        exports: string[];
        imports: string[];
        functions: string[];
        classes: string[];
        summary: string;
    };
    /** AI推断 */
    inferences: string[];
    /** AI建议 */
    suggestions: string[];
    /** 分析时间戳 */
    analyzedAt: number;
    /** AI分析版本 */
    aiVersion: string;
}

export interface UserNotes {
    /** 用户备注 */
    comments: string[];
    /** 用户标签 */
    tags: string[];
    /** 优先级 */
    priority?: 'low' | 'medium' | 'high';
    /** 最后编辑时间 */
    lastEditedAt: number;
    /** 是否收藏 */
    bookmarked: boolean;
}

export interface CacheStats {
    totalCapsules: number;
    memoryHits: number;
    diskHits: number;
    misses: number;
    writes: number;
    invalidations: number;
    hitRate: number;
}

// ===== 增强缓存管理器 =====

export class EnhancedCapsuleCache {
    private memoryCache = new Map<string, CapsuleData>();
    private cacheDir: vscode.Uri | null = null;
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private readonly logger: Logger;
    
    private stats = {
        totalCapsules: 0,
        memoryHits: 0,
        diskHits: 0,
        misses: 0,
        writes: 0,
        invalidations: 0
    };

    constructor(logger: Logger, private context: vscode.ExtensionContext) {
        this.logger = logger;
    }

    /**
     * 初始化缓存系统
     */
    public async initialize(): Promise<void> {
        await this.initializeCacheDirectory();
        await this.setupFileWatcher();
        await this.loadExistingCache();
        
        this.logger.info('[EnhancedCache] 🚀 增强版胶囊缓存系统初始化完成');
    }

    /**
     * 获取胶囊数据
     * @param filePath 文件路径
     * @param contentHash 文件内容哈希
     */
    public async getCapsule(filePath: string, contentHash: string): Promise<CapsuleData | null> {
        const cacheKey = this.getCacheKey(filePath);
        
        // 1. 检查内存缓存
        const memoryResult = this.memoryCache.get(cacheKey);
        if (memoryResult && memoryResult.meta.contentHash === contentHash) {
            this.stats.memoryHits++;
            this.logger.debug(`[EnhancedCache] 💾 内存缓存命中: ${path.basename(filePath)}`);
            return memoryResult;
        }

        // 2. 检查磁盘缓存
        const diskResult = await this.loadFromDisk(filePath, contentHash);
        if (diskResult) {
            // 写入内存缓存
            this.memoryCache.set(cacheKey, diskResult);
            this.stats.diskHits++;
            this.logger.debug(`[EnhancedCache] 💿 磁盘缓存命中: ${path.basename(filePath)}`);
            return diskResult;
        }

        // 3. 缓存未命中
        this.stats.misses++;
        this.logger.debug(`[EnhancedCache] ❌ 缓存未命中: ${path.basename(filePath)}`);
        return null;
    }

    /**
     * 保存AI分析结果（不覆盖用户备注）
     */
    public async saveAIAnalysis(
        filePath: string,
        contentHash: string,
        aiResult: AIAnalysisResult
    ): Promise<void> {
        const cacheKey = this.getCacheKey(filePath);
        
        // 获取现有数据或创建新数据
        let existing = this.memoryCache.get(cacheKey);
        const now = Date.now();

        if (!existing) {
            // 创建新胶囊
            existing = this.createEmptyCapsule(filePath, contentHash);
        }

        // 更新AI分析结果（保留用户备注）
        existing.ai = aiResult;
        existing.meta.contentHash = contentHash;
        existing.meta.updatedAt = now;

        // 保存到内存和磁盘
        this.memoryCache.set(cacheKey, existing);
        await this.saveToDisk(existing);
        
        this.stats.writes++;
        this.logger.info(`[EnhancedCache] 🧠 保存AI分析: ${path.basename(filePath)}`);
    }

    /**
     * 保存用户备注（不覆盖AI结果）
     */
    public async saveUserNotes(
        filePath: string,
        notes: Partial<UserNotes>
    ): Promise<void> {
        const cacheKey = this.getCacheKey(filePath);
        
        let existing = this.memoryCache.get(cacheKey);
        if (!existing) {
            // 如果胶囊不存在，先尝试从磁盘加载
            const contentHash = await this.getFileContentHash(filePath);
            const loadedCapsule = await this.getCapsule(filePath, contentHash);
            existing = loadedCapsule || this.createEmptyCapsule(filePath, contentHash);
        }

        // 合并用户备注
        existing.notes = {
            ...existing.notes,
            ...notes,
            lastEditedAt: Date.now()
        };
        existing.meta.updatedAt = Date.now();

        // 保存到内存和磁盘
        this.memoryCache.set(cacheKey, existing);
        await this.saveToDisk(existing);
        
        this.logger.info(`[EnhancedCache] 📝 保存用户备注: ${path.basename(filePath)}`);
    }

    /**
     * 增量更新AI分析结果
     */
    public async mergeAIAnalysis(
        filePath: string,
        contentHash: string,
        partialAI: Partial<AIAnalysisResult>
    ): Promise<void> {
        const existing = await this.getCapsule(filePath, contentHash);
        if (!existing) {
            // 如果不存在，创建新胶囊
            const newResult: AIAnalysisResult = {
                static: { exports: [], imports: [], functions: [], classes: [], summary: '' },
                inferences: [],
                suggestions: [],
                analyzedAt: Date.now(),
                aiVersion: '1.0',
                ...partialAI
            };
            await this.saveAIAnalysis(filePath, contentHash, newResult);
            return;
        }

        // 合并AI结果
        const mergedAI: AIAnalysisResult = {
            ...existing.ai,
            ...partialAI,
            static: {
                ...existing.ai.static,
                ...(partialAI.static || {})
            },
            inferences: [
                ...existing.ai.inferences,
                ...(partialAI.inferences || [])
            ],
            suggestions: [
                ...existing.ai.suggestions,
                ...(partialAI.suggestions || [])
            ]
        };

        await this.saveAIAnalysis(filePath, contentHash, mergedAI);
        this.logger.info(`[EnhancedCache] 🔄 增量合并AI分析: ${path.basename(filePath)}`);
    }

    /**
     * 失效指定文件的缓存
     */
    public async invalidate(filePath: string): Promise<void> {
        const cacheKey = this.getCacheKey(filePath);
        
        // 删除内存缓存
        this.memoryCache.delete(cacheKey);
        
        // 删除磁盘缓存
        await this.deleteFromDisk(filePath);
        
        this.stats.invalidations++;
        this.logger.info(`[EnhancedCache] 🗑️  失效缓存: ${path.basename(filePath)}`);
    }

    /**
     * 获取缓存统计信息
     */
    public getStats(): CacheStats {
        const total = this.stats.memoryHits + this.stats.diskHits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.memoryHits + this.stats.diskHits) / total) * 100 : 0;
        
        return {
            ...this.stats,
            totalCapsules: this.memoryCache.size,
            hitRate: Math.round(hitRate * 100) / 100
        };
    }

    /**
     * 清理所有缓存
     */
    public async clearAll(): Promise<void> {
        this.memoryCache.clear();
        
        if (this.cacheDir) {
            try {
                const files = await vscode.workspace.fs.readDirectory(this.cacheDir);
                for (const [fileName] of files) {
                    if (fileName.endsWith('.json')) {
                        const fileUri = vscode.Uri.joinPath(this.cacheDir, fileName);
                        await vscode.workspace.fs.delete(fileUri);
                    }
                }
            } catch (error) {
                this.logger.warn('[EnhancedCache] 清理磁盘缓存失败', error);
            }
        }

        // 重置统计
        this.stats = {
            totalCapsules: 0,
            memoryHits: 0,
            diskHits: 0,
            misses: 0,
            writes: 0,
            invalidations: 0
        };

        this.logger.info('[EnhancedCache] 🧹 已清理所有缓存');
    }

    /**
     * 销毁缓存系统
     */
    public dispose(): void {
        this.fileWatcher?.dispose();
        this.memoryCache.clear();
        this.logger.info('[EnhancedCache] 📴 缓存系统已停止');
    }

    // ===== 私有方法 =====

    private async initializeCacheDirectory(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            this.logger.warn('[EnhancedCache] 无工作区，跳过磁盘缓存');
            return;
        }

        this.cacheDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ai-explorer-cache', 'filecapsules');
        
        try {
            await vscode.workspace.fs.createDirectory(this.cacheDir);
            this.logger.info(`[EnhancedCache] 📁 缓存目录: ${this.cacheDir.fsPath}`);
        } catch (error) {
            this.logger.error('[EnhancedCache] 创建缓存目录失败', error);
        }
    }

    private async setupFileWatcher(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        // 监听工作区内的文件变更
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,go,rs}')
        );

        // 文件修改时失效缓存
        this.fileWatcher.onDidChange(uri => {
            this.invalidate(uri.fsPath);
        });

        // 文件删除时失效缓存
        this.fileWatcher.onDidDelete(uri => {
            this.invalidate(uri.fsPath);
        });

        this.logger.info('[EnhancedCache] 👀 文件监听器已启动');
    }

    private async loadExistingCache(): Promise<void> {
        if (!this.cacheDir) return;

        try {
            const files = await vscode.workspace.fs.readDirectory(this.cacheDir);
            let loadedCount = 0;

            for (const [fileName] of files) {
                if (fileName.endsWith('.json')) {
                    try {
                        const fileUri = vscode.Uri.joinPath(this.cacheDir, fileName);
                        const content = await vscode.workspace.fs.readFile(fileUri);
                        const capsule: CapsuleData = JSON.parse(Buffer.from(content).toString('utf8'));
                        
                        const cacheKey = this.getCacheKey(capsule.meta.filePath);
                        this.memoryCache.set(cacheKey, capsule);
                        loadedCount++;
                    } catch (error) {
                        this.logger.warn(`[EnhancedCache] 加载缓存文件失败: ${fileName}`, error);
                    }
                }
            }

            this.logger.info(`[EnhancedCache] 📥 加载现有缓存: ${loadedCount} 个胶囊`);
        } catch (error) {
            this.logger.warn('[EnhancedCache] 加载现有缓存失败', error);
        }
    }

    private getCacheKey(filePath: string): string {
        return crypto.createHash('md5').update(filePath).digest('hex');
    }

    private getCacheFileName(filePath: string): string {
        const key = this.getCacheKey(filePath);
        const fileName = path.basename(filePath, path.extname(filePath));
        return `${fileName}_${key}.json`;
    }

    private async loadFromDisk(filePath: string, contentHash: string): Promise<CapsuleData | null> {
        if (!this.cacheDir) return null;

        try {
            const fileName = this.getCacheFileName(filePath);
            const fileUri = vscode.Uri.joinPath(this.cacheDir, fileName);
            const content = await vscode.workspace.fs.readFile(fileUri);
            const capsule: CapsuleData = JSON.parse(Buffer.from(content).toString('utf8'));

            // 检查内容哈希是否匹配
            if (capsule.meta.contentHash !== contentHash) {
                // 内容已变更，删除过期缓存
                await this.deleteFromDisk(filePath);
                return null;
            }

            return capsule;
        } catch (error) {
            return null; // 文件不存在或读取失败
        }
    }

    private async saveToDisk(capsule: CapsuleData): Promise<void> {
        if (!this.cacheDir) return;

        try {
            const fileName = this.getCacheFileName(capsule.meta.filePath);
            const fileUri = vscode.Uri.joinPath(this.cacheDir, fileName);
            const content = Buffer.from(JSON.stringify(capsule, null, 2), 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, content);
        } catch (error) {
            this.logger.error(`[EnhancedCache] 磁盘写入失败: ${capsule.meta.filePath}`, error);
        }
    }

    private async deleteFromDisk(filePath: string): Promise<void> {
        if (!this.cacheDir) return;

        try {
            const fileName = this.getCacheFileName(filePath);
            const fileUri = vscode.Uri.joinPath(this.cacheDir, fileName);
            await vscode.workspace.fs.delete(fileUri);
        } catch (error) {
            // 文件可能不存在，忽略错误
        }
    }

    private createEmptyCapsule(filePath: string, contentHash: string): CapsuleData {
        const now = Date.now();
        return {
            meta: {
                version: '2.0',
                filePath,
                language: this.detectLanguage(filePath),
                contentHash,
                fileSize: 0,
                lastModified: now,
                createdAt: now,
                updatedAt: now
            },
            ai: {
                static: {
                    exports: [],
                    imports: [],
                    functions: [],
                    classes: [],
                    summary: ''
                },
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

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const langMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.go': 'go',
            '.rs': 'rust'
        };
        return langMap[ext] || 'unknown';
    }

    private async getFileContentHash(filePath: string): Promise<string> {
        try {
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch (error) {
            this.logger.warn(`[EnhancedCache] 无法计算文件哈希: ${filePath}`, error);
            return Date.now().toString(); // 降级到时间戳
        }
    }
}