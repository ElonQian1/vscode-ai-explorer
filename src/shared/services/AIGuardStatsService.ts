/**
 * AIGuardStatsService.ts
 * 
 * AI守卫统计服务
 * - 持久化统计数据（累计过滤数、AI请求节省数、过滤原因分布）
 * - 支持读取/写入/重置
 * - 自动保存到工作区 .ai/.ai-guard-stats.json
 */
import * as vscode from 'vscode';
import * as path from 'path';

export interface AIGuardStats {
    /** 总过滤数（累计） */
    totalDropped: number;
    /** 总保留数（累计发送给AI） */
    totalKept: number;
    /** 过滤原因分布 */
    reasonDistribution: Record<string, number>;
    /** 统计开始时间 */
    startTime: number;
    /** 最后更新时间 */
    lastUpdateTime: number;
    /** 会话统计（当前VS Code会话） */
    sessionStats: {
        dropped: number;
        kept: number;
        reasons: Record<string, number>;
    };
}

export class AIGuardStatsService {
    private stats: AIGuardStats;
    private statsFilePath: string | null = null;
    private autoSaveTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.stats = this.getDefaultStats();
        this.initStatsFile();
    }

    /**
     * 获取默认统计数据
     */
    private getDefaultStats(): AIGuardStats {
        return {
            totalDropped: 0,
            totalKept: 0,
            reasonDistribution: {},
            startTime: Date.now(),
            lastUpdateTime: Date.now(),
            sessionStats: {
                dropped: 0,
                kept: 0,
                reasons: {}
            }
        };
    }

    /**
     * 初始化统计文件
     */
    private async initStatsFile() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        this.statsFilePath = path.join(workspaceRoot, '.ai', '.ai-guard-stats.json');

        // 尝试加载现有统计
        await this.load();
    }

    /**
     * 加载统计数据
     */
    async load(): Promise<void> {
        if (!this.statsFilePath) {
            return;
        }

        try {
            const uri = vscode.Uri.file(this.statsFilePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const loaded = JSON.parse(content.toString()) as AIGuardStats;
            
            // 合并数据（保留会话统计为空，只加载累计数据）
            this.stats = {
                ...loaded,
                sessionStats: {
                    dropped: 0,
                    kept: 0,
                    reasons: {}
                }
            };
            
            console.log('[AIGuardStatsService] 已加载统计数据');
        } catch (error) {
            // 文件不存在或解析失败，使用默认值
            console.log('[AIGuardStatsService] 首次运行，创建新统计数据');
        }
    }

    /**
     * 保存统计数据
     */
    async save(): Promise<void> {
        if (!this.statsFilePath) {
            return;
        }

        try {
            // 确保目录存在
            const dirUri = vscode.Uri.file(path.dirname(this.statsFilePath));
            try {
                await vscode.workspace.fs.createDirectory(dirUri);
            } catch {
                // 目录已存在
            }

            // 写入文件
            const uri = vscode.Uri.file(this.statsFilePath);
            const jsonContent = JSON.stringify(this.stats, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(jsonContent, 'utf-8'));
        } catch (error) {
            console.error('[AIGuardStatsService] 保存统计数据失败:', error);
        }
    }

    /**
     * 记录一次过滤
     */
    record(dropped: number, kept: number, reasons: Record<string, number>): void {
        // 更新累计数据
        this.stats.totalDropped += dropped;
        this.stats.totalKept += kept;
        this.stats.lastUpdateTime = Date.now();

        // 更新原因分布
        for (const [reason, count] of Object.entries(reasons)) {
            this.stats.reasonDistribution[reason] = (this.stats.reasonDistribution[reason] || 0) + count;
        }

        // 更新会话统计
        this.stats.sessionStats.dropped += dropped;
        this.stats.sessionStats.kept += kept;
        for (const [reason, count] of Object.entries(reasons)) {
            this.stats.sessionStats.reasons[reason] = (this.stats.sessionStats.reasons[reason] || 0) + count;
        }

        // 防抖保存（避免频繁IO）
        this.scheduleSave();
    }

    /**
     * 延迟保存（防抖）
     */
    private scheduleSave(): void {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        this.autoSaveTimer = setTimeout(() => {
            this.save();
        }, 2000); // 2秒后保存
    }

    /**
     * 获取当前统计
     */
    getStats(): AIGuardStats {
        return { ...this.stats };
    }

    /**
     * 获取节省率
     */
    getSavingsRate(): number {
        const total = this.stats.totalDropped + this.stats.totalKept;
        if (total === 0) return 0;
        return (this.stats.totalDropped / total) * 100;
    }

    /**
     * 获取会话节省率
     */
    getSessionSavingsRate(): number {
        const total = this.stats.sessionStats.dropped + this.stats.sessionStats.kept;
        if (total === 0) return 0;
        return (this.stats.sessionStats.dropped / total) * 100;
    }

    /**
     * 重置统计
     */
    async reset(): Promise<void> {
        this.stats = this.getDefaultStats();
        await this.save();
        console.log('[AIGuardStatsService] 统计数据已重置');
    }

    /**
     * 重置会话统计
     */
    resetSession(): void {
        this.stats.sessionStats = {
            dropped: 0,
            kept: 0,
            reasons: {}
        };
    }

    /**
     * 获取Top原因
     */
    getTopReasons(limit: number = 5): Array<{ reason: string; count: number; percentage: number }> {
        const entries = Object.entries(this.stats.reasonDistribution);
        const total = this.stats.totalDropped;
        
        return entries
            .map(([reason, count]) => ({
                reason,
                count,
                percentage: total > 0 ? (count / total) * 100 : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * 销毁服务（保存数据）
     */
    async dispose(): Promise<void> {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        await this.save();
    }
}
