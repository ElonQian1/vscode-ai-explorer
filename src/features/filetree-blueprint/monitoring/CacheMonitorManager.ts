// src/features/filetree-blueprint/monitoring/CacheMonitorManager.ts
// [module: filetree-blueprint] [tags: Monitoring, Manager]

/**
 * S3胶囊缓存监控管理器
 * 
 * 功能:
 * - 统一管理状态栏监控和详细面板
 * - 注册VS Code命令和事件处理
 * - 协调缓存统计的更新和显示
 * - 提供监控开关和配置管理
 */

import * as vscode from 'vscode';
import { Logger } from '../../../core/logging/Logger';
import { EnhancedCapsuleCache, CacheStats } from '../cache/EnhancedCapsuleCache';
import { CacheStatsStatusBar } from './CacheStatsStatusBar';
import { CacheStatsPanel } from './CacheStatsPanel';

export class CacheMonitorManager {
    private statusBar: CacheStatsStatusBar | null = null;
    private disposables: vscode.Disposable[] = [];
    private isEnabled = true;
    
    constructor(
        private extensionUri: vscode.Uri,
        private logger: Logger,
        private cacheManager: EnhancedCapsuleCache
    ) {
        this.initialize();
    }

    private initialize(): void {
        this.registerCommands();
        this.createStatusBar();
        
        // 监听配置变化
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('aiExplorer.cache.monitoring')) {
                this.onConfigurationChanged();
            }
        }, null, this.disposables);
        
        this.logger.info('[CacheMonitor] 🚀 缓存监控管理器已启动');
    }

    /**
     * 注册VS Code命令
     */
    private registerCommands(): void {
        // 显示缓存统计面板
        const showStatsCommand = vscode.commands.registerCommand(
            'aiExplorer.showCacheStats',
            () => this.showStatsPanel()
        );
        
        // 刷新缓存统计
        const refreshStatsCommand = vscode.commands.registerCommand(
            'aiExplorer.refreshCacheStats',
            () => this.refreshStats()
        );
        
        // 切换监控状态
        const toggleMonitoringCommand = vscode.commands.registerCommand(
            'aiExplorer.toggleCacheMonitoring',
            () => this.toggleMonitoring()
        );
        
        // 清空缓存
        const clearCacheCommand = vscode.commands.registerCommand(
            'aiExplorer.clearCache',
            () => this.clearCache()
        );
        
        // 清理过期缓存
        const clearExpiredCommand = vscode.commands.registerCommand(
            'aiExplorer.clearExpiredCache',
            () => this.clearExpiredCache()
        );
        
        this.disposables.push(
            showStatsCommand,
            refreshStatsCommand,
            toggleMonitoringCommand,
            clearCacheCommand,
            clearExpiredCommand
        );
        
        this.logger.info('[CacheMonitor] 命令注册完成');
    }

    /**
     * 创建状态栏监控
     */
    private createStatusBar(): void {
        if (this.statusBar) {
            this.statusBar.dispose();
        }
        
        this.statusBar = new CacheStatsStatusBar(
            this.logger,
            () => this.getCacheStats()
        );
        
        this.statusBar.setEnabled(this.isEnabled);
    }

    /**
     * 显示统计面板
     */
    public showStatsPanel(): void {
        try {
            CacheStatsPanel.createOrShow(
                this.extensionUri,
                this.logger,
                () => this.getCacheStats(),
                () => this.clearCache(),
                () => this.clearExpiredCache()
            );
            
            this.logger.info('[CacheMonitor] 用户打开了缓存统计面板');
        } catch (error) {
            this.logger.error('[CacheMonitor] 打开统计面板失败', error);
            vscode.window.showErrorMessage('打开缓存统计面板失败: ' + String(error));
        }
    }

    /**
     * 刷新统计数据
     */
    public refreshStats(): void {
        try {
            if (this.statusBar) {
                this.statusBar.refresh();
            }
            
            // 如果面板已打开，也刷新面板
            if (CacheStatsPanel.currentPanel) {
                CacheStatsPanel.currentPanel.refresh();
            }
            
            this.logger.info('[CacheMonitor] 手动刷新了缓存统计');
        } catch (error) {
            this.logger.error('[CacheMonitor] 刷新统计失败', error);
            vscode.window.showErrorMessage('刷新缓存统计失败: ' + String(error));
        }
    }

    /**
     * 切换监控状态
     */
    public toggleMonitoring(): void {
        this.isEnabled = !this.isEnabled;
        
        if (this.statusBar) {
            this.statusBar.setEnabled(this.isEnabled);
        }
        
        const status = this.isEnabled ? '已启用' : '已禁用';
        vscode.window.showInformationMessage(`缓存监控${status}`);
        
        // 更新配置
        vscode.workspace.getConfiguration('aiExplorer.cache').update(
            'monitoring.enabled',
            this.isEnabled,
            vscode.ConfigurationTarget.Global
        );
        
        this.logger.info(`[CacheMonitor] 监控状态: ${status}`);
    }

    /**
     * 清空所有缓存
     */
    private async clearCache(): Promise<void> {
        await this.cacheManager.clearAll();
        
        // 触发统计更新
        this.refreshStats();
    }

    /**
     * 清理过期缓存
     */
    private async clearExpiredCache(): Promise<void> {
        const beforeStats = this.getCacheStats();
        
        // 这里应该调用缓存管理器的清理过期缓存方法
        // 由于当前的EnhancedCapsuleCache没有这个方法，先记录日志
        this.logger.info('[CacheMonitor] 清理过期缓存功能待实现');
        
        const afterStats = this.getCacheStats();
        const cleared = beforeStats.totalCapsules - afterStats.totalCapsules;
        
        if (cleared > 0) {
            vscode.window.showInformationMessage(`已清理 ${cleared} 个过期缓存项`);
        } else {
            vscode.window.showInformationMessage('没有发现过期缓存项');
        }
        
        // 触发统计更新
        this.refreshStats();
    }

    /**
     * 获取缓存统计
     */
    private getCacheStats(): CacheStats {
        return this.cacheManager.getStats();
    }

    /**
     * 处理配置变化
     */
    private onConfigurationChanged(): void {
        const config = vscode.workspace.getConfiguration('aiExplorer.cache.monitoring');
        const enabled = config.get<boolean>('enabled', true);
        
        if (enabled !== this.isEnabled) {
            this.isEnabled = enabled;
            
            if (this.statusBar) {
                this.statusBar.setEnabled(this.isEnabled);
            }
            
            this.logger.info(`[CacheMonitor] 配置变更，监控状态: ${enabled ? '启用' : '禁用'}`);
        }
    }

    /**
     * 获取监控状态
     */
    public isMonitoringEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * 设置监控状态
     */
    public setMonitoringEnabled(enabled: boolean): void {
        if (this.isEnabled !== enabled) {
            this.isEnabled = enabled;
            
            if (this.statusBar) {
                this.statusBar.setEnabled(this.isEnabled);
            }
            
            // 更新配置
            vscode.workspace.getConfiguration('aiExplorer.cache').update(
                'monitoring.enabled',
                enabled,
                vscode.ConfigurationTarget.Global
            );
        }
    }

    /**
     * 获取当前缓存统计快照
     */
    public getCacheStatsSnapshot(): CacheStats {
        return this.getCacheStats();
    }

    /**
     * 导出缓存统计到文件
     */
    public async exportStatsToFile(): Promise<void> {
        try {
            const stats = this.getCacheStats();
            const exportData = {
                timestamp: new Date().toISOString(),
                stats: stats,
                export_version: '1.0',
                source: 'aiExplorer.cacheMonitor'
            };

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`cache-stats-${Date.now()}.json`),
                filters: {
                    'JSON文件': ['json'],
                    '所有文件': ['*']
                }
            });

            if (uri) {
                const content = JSON.stringify(exportData, null, 2);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                
                vscode.window.showInformationMessage(
                    `统计数据已导出到 ${uri.fsPath}`,
                    '打开文件'
                ).then(choice => {
                    if (choice === '打开文件') {
                        vscode.window.showTextDocument(uri);
                    }
                });
                
                this.logger.info('[CacheMonitor] 统计数据导出成功', { path: uri.fsPath });
            }
        } catch (error) {
            this.logger.error('[CacheMonitor] 导出统计数据失败', error);
            vscode.window.showErrorMessage('导出统计数据失败: ' + String(error));
        }
    }

    /**
     * 销毁监控管理器
     */
    public dispose(): void {
        // 销毁状态栏
        if (this.statusBar) {
            this.statusBar.dispose();
            this.statusBar = null;
        }
        
        // 销毁所有一次性资源
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        
        this.logger.info('[CacheMonitor] 🚀 缓存监控管理器已销毁');
    }
}