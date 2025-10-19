// src/features/filetree-blueprint/monitoring/CacheStatsPanel.ts
// [module: filetree-blueprint] [tags: Monitoring, WebView, Panel]

/**
 * S3胶囊缓存详细统计面板
 * 
 * 功能:
 * - WebView面板显示详细缓存统计
 * - 实时图表和趋势分析
 * - 缓存清理操作
 * - 性能优化建议
 */

import * as vscode from 'vscode';
import { Logger } from '../../../core/logging/Logger';
import { CacheStats } from '../cache/EnhancedCapsuleCache';

export class CacheStatsPanel {
    public static currentPanel: CacheStatsPanel | undefined;
    private static readonly viewType = 'aiExplorer.cacheStats';
    private static extensionUri: vscode.Uri;
    
    private disposables: vscode.Disposable[] = [];
    private updateTimer: NodeJS.Timeout | null = null;
    
    constructor(
        private panel: vscode.WebviewPanel,
        private logger: Logger,
        private getCacheStats: () => CacheStats,
        private clearCache?: () => Promise<void>,
        private clearExpired?: () => Promise<void>
    ) {
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );
        
        this.initialize();
    }

    /**
     * 创建或显示统计面板
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        logger: Logger,
        getCacheStats: () => CacheStats,
        clearCache?: () => Promise<void>,
        clearExpired?: () => Promise<void>
    ): void {
        CacheStatsPanel.extensionUri = extensionUri;
        
        // 如果面板已存在，直接显示
        if (CacheStatsPanel.currentPanel) {
            CacheStatsPanel.currentPanel.panel.reveal();
            CacheStatsPanel.currentPanel.refresh();
            return;
        }
        
        // 创建新面板
        const panel = vscode.window.createWebviewPanel(
            CacheStatsPanel.viewType,
            'S3胶囊缓存统计',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );
        
        panel.iconPath = {
            light: vscode.Uri.joinPath(extensionUri, 'media', 'light', 'chart.svg'),
            dark: vscode.Uri.joinPath(extensionUri, 'media', 'dark', 'chart.svg')
        };
        
        CacheStatsPanel.currentPanel = new CacheStatsPanel(
            panel,
            logger,
            getCacheStats,
            clearCache,
            clearExpired
        );
    }

    private initialize(): void {
        this.updateWebview();
        this.startAutoUpdate();
        this.logger.info('[CacheMonitor] 📊 缓存统计面板已打开');
    }

    /**
     * 更新WebView内容
     */
    private updateWebview(): void {
        this.panel.webview.html = this.getWebviewContent();
    }

    /**
     * 刷新数据
     */
    public refresh(): void {
        try {
            const stats = this.getCacheStats();
            this.panel.webview.postMessage({
                command: 'updateStats',
                stats: stats
            });
        } catch (error) {
            this.logger.error('[CacheMonitor] 刷新统计数据失败', error);
            this.panel.webview.postMessage({
                command: 'error',
                message: '获取统计数据失败: ' + String(error)
            });
        }
    }

    /**
     * 处理来自WebView的消息
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'clearAll':
                await this.handleClearAll();
                break;
            case 'clearExpired':
                await this.handleClearExpired();
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'exportStats':
                await this.handleExportStats();
                break;
        }
    }

    /**
     * 处理清空所有缓存
     */
    private async handleClearAll(): Promise<void> {
        if (!this.clearCache) {
            vscode.window.showWarningMessage('缓存清理功能未配置');
            return;
        }

        const choice = await vscode.window.showWarningMessage(
            '确定要清空所有缓存吗？此操作不可撤销。',
            { modal: true },
            '清空缓存',
            '取消'
        );

        if (choice === '清空缓存') {
            try {
                await this.clearCache();
                vscode.window.showInformationMessage('缓存已清空');
                this.refresh();
                this.logger.info('[CacheMonitor] 用户清空了所有缓存');
            } catch (error) {
                vscode.window.showErrorMessage('清空缓存失败: ' + String(error));
                this.logger.error('[CacheMonitor] 清空缓存失败', error);
            }
        }
    }

    /**
     * 处理清理过期缓存
     */
    private async handleClearExpired(): Promise<void> {
        if (!this.clearExpired) {
            vscode.window.showWarningMessage('过期缓存清理功能未配置');
            return;
        }

        try {
            await this.clearExpired();
            vscode.window.showInformationMessage('过期缓存已清理');
            this.refresh();
            this.logger.info('[CacheMonitor] 用户清理了过期缓存');
        } catch (error) {
            vscode.window.showErrorMessage('清理过期缓存失败: ' + String(error));
            this.logger.error('[CacheMonitor] 清理过期缓存失败', error);
        }
    }

    /**
     * 处理导出统计数据
     */
    private async handleExportStats(): Promise<void> {
        try {
            const stats = this.getCacheStats();
            const exportData = {
                timestamp: new Date().toISOString(),
                stats: stats,
                export_version: '1.0'
            };

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`cache-stats-${Date.now()}.json`),
                filters: {
                    'JSON文件': ['json']
                }
            });

            if (uri) {
                const content = JSON.stringify(exportData, null, 2);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage(`统计数据已导出到 ${uri.fsPath}`);
                this.logger.info('[CacheMonitor] 统计数据已导出', { path: uri.fsPath });
            }
        } catch (error) {
            vscode.window.showErrorMessage('导出统计数据失败: ' + String(error));
            this.logger.error('[CacheMonitor] 导出统计失败', error);
        }
    }

    /**
     * 开始自动更新
     */
    private startAutoUpdate(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        // 每3秒更新一次
        this.updateTimer = setInterval(() => {
            this.refresh();
        }, 3000);
    }

    /**
     * 停止自动更新
     */
    private stopAutoUpdate(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    /**
     * 生成WebView HTML内容
     */
    private getWebviewContent(): string {
        const stats = this.getCacheStats();
        const nonce = this.getNonce();
        
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>S3胶囊缓存统计</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .title {
            font-size: 1.5em;
            font-weight: 600;
            color: var(--vscode-titleBar-activeForeground);
        }
        
        .actions {
            display: flex;
            gap: 10px;
        }
        
        .btn {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
        }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn.danger {
            background: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
            border-color: var(--vscode-errorBorder);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stats-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 16px;
        }
        
        .card-header {
            font-size: 1.1em;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-titleBar-activeForeground);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .stats-item {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 4px 0;
        }
        
        .stats-item:not(:last-child) {
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        
        .stats-label {
            color: var(--vscode-descriptionForeground);
        }
        
        .stats-value {
            font-weight: 500;
            font-family: monospace;
        }
        
        .hit-rate {
            font-size: 2em;
            font-weight: 700;
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        
        .hit-rate.good {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }
        
        .hit-rate.medium {
            background: var(--vscode-testing-iconQueued);
            color: white;
        }
        
        .hit-rate.poor {
            background: var(--vscode-testing-iconFailed);
            color: white;
        }
        
        .progress-bar {
            width: 100%;
            height: 8px;
            background: var(--vscode-progressBar-background);
            border-radius: 4px;
            overflow: hidden;
            margin: 4px 0;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-background);
            transition: width 0.3s ease;
        }
        
        .recommendations {
            margin-top: 20px;
            padding: 16px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
        }
        
        .recommendation-item {
            margin: 8px 0;
            padding: 8px;
            background: var(--vscode-editor-background);
            border-left: 3px solid var(--vscode-activityBarBadge-background);
            border-radius: 0 3px 3px 0;
        }
        
        .error {
            color: var(--vscode-errorForeground);
            background: var(--vscode-errorBackground);
            border: 1px solid var(--vscode-errorBorder);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">🗄️ S3胶囊缓存统计</h1>
        <div class="actions">
            <button class="btn" onclick="refresh()">🔄 刷新</button>
            <button class="btn" onclick="exportStats()">📋 导出</button>
            <button class="btn" onclick="clearExpired()">🧹 清理过期</button>
            <button class="btn danger" onclick="clearAll()">🗑️ 清空所有</button>
        </div>
    </div>
    
    <div id="error-container"></div>
    
    <div class="hit-rate ${this.getHitRateClass(stats.hitRate)}">
        总命中率: ${stats.hitRate.toFixed(1)}%
    </div>
    
    <div class="stats-grid">
        <div class="stats-card">
            <div class="card-header">📊 命中统计</div>
            <div class="stats-item">
                <span class="stats-label">内存命中率</span>
                <span class="stats-value">${stats.memoryHitRate.toFixed(1)}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${stats.memoryHitRate}%; background: #4CAF50;"></div>
            </div>
            <div class="stats-item">
                <span class="stats-label">磁盘命中率</span>
                <span class="stats-value">${stats.diskHitRate.toFixed(1)}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${stats.diskHitRate}%; background: #2196F3;"></div>
            </div>
            <div class="stats-item">
                <span class="stats-label">内存命中</span>
                <span class="stats-value">${stats.memoryHits.toLocaleString()}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">磁盘命中</span>
                <span class="stats-value">${stats.diskHits.toLocaleString()}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">未命中</span>
                <span class="stats-value">${stats.misses.toLocaleString()}</span>
            </div>
        </div>
        
        <div class="stats-card">
            <div class="card-header">⚡ 性能指标</div>
            <div class="stats-item">
                <span class="stats-label">平均响应时间</span>
                <span class="stats-value">${stats.avgResponseTime.toFixed(1)}ms</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">总请求数</span>
                <span class="stats-value">${stats.requestCount.toLocaleString()}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">运行时长</span>
                <span class="stats-value">${this.formatUptime(stats.uptime)}</span>
            </div>
        </div>
        
        <div class="stats-card">
            <div class="card-header">💾 存储使用</div>
            <div class="stats-item">
                <span class="stats-label">胶囊总数</span>
                <span class="stats-value">${stats.totalCapsules.toLocaleString()}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">内存占用</span>
                <span class="stats-value">${this.formatBytes(stats.totalMemorySize)}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">磁盘占用</span>
                <span class="stats-value">${this.formatBytes(stats.totalDiskSize)}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">写入次数</span>
                <span class="stats-value">${stats.writes.toLocaleString()}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">失效次数</span>
                <span class="stats-value">${stats.invalidations.toLocaleString()}</span>
            </div>
        </div>
        
        <div class="stats-card">
            <div class="card-header">🕒 时间信息</div>
            <div class="stats-item">
                <span class="stats-label">最后命中</span>
                <span class="stats-value">${this.formatLastTime(stats.lastHitTime)}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">最后未命中</span>
                <span class="stats-value">${this.formatLastTime(stats.lastMissTime)}</span>
            </div>
            <div class="stats-item">
                <span class="stats-label">最后写入</span>
                <span class="stats-value">${this.formatLastTime(stats.lastWriteTime)}</span>
            </div>
        </div>
    </div>
    
    <div class="recommendations">
        <div class="card-header">💡 优化建议</div>
        <div id="recommendations-content">
            ${this.generateRecommendations(stats)}
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function clearAll() {
            vscode.postMessage({ command: 'clearAll' });
        }
        
        function clearExpired() {
            vscode.postMessage({ command: 'clearExpired' });
        }
        
        function exportStats() {
            vscode.postMessage({ command: 'exportStats' });
        }
        
        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'updateStats':
                    updateDisplay(message.stats);
                    break;
                case 'error':
                    showError(message.message);
                    break;
            }
        });
        
        function updateDisplay(stats) {
            // 这里会通过重新加载页面来更新，实际实现中可以用JavaScript动态更新
            location.reload();
        }
        
        function showError(message) {
            const container = document.getElementById('error-container');
            container.innerHTML = '<div class="error">错误: ' + message + '</div>';
        }
    </script>
</body>
</html>`;
    }

    /**
     * 获取命中率CSS类
     */
    private getHitRateClass(hitRate: number): string {
        if (hitRate >= 80) return 'good';
        if (hitRate >= 60) return 'medium';
        return 'poor';
    }

    /**
     * 生成优化建议
     */
    private generateRecommendations(stats: CacheStats): string {
        const recommendations: string[] = [];
        
        if (stats.hitRate < 60) {
            recommendations.push('命中率较低，建议增加缓存大小或优化缓存策略');
        }
        
        if (stats.avgResponseTime > 100) {
            recommendations.push('平均响应时间较长，建议检查磁盘I/O性能');
        }
        
        if (stats.totalMemorySize > 50 * 1024 * 1024) { // 50MB
            recommendations.push('内存使用量较大，建议适当清理缓存');
        }
        
        if (stats.requestCount > 0 && stats.memoryHitRate < 30) {
            recommendations.push('内存命中率过低，建议增加内存缓存容量');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('缓存系统运行良好！');
        }
        
        return recommendations.map(rec => 
            `<div class="recommendation-item">${rec}</div>`
        ).join('');
    }

    /**
     * 格式化字节大小 (复用状态栏的方法)
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化运行时长 (复用状态栏的方法)
     */
    private formatUptime(uptime: number): string {
        const seconds = Math.floor(uptime / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}时${minutes % 60}分`;
        } else if (minutes > 0) {
            return `${minutes}分${seconds % 60}秒`;
        } else {
            return `${seconds}秒`;
        }
    }

    /**
     * 格式化最后时间 (复用状态栏的方法)
     */
    private formatLastTime(timestamp: number): string {
        if (!timestamp) return '从未';
        
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        
        return new Date(timestamp).toLocaleString();
    }

    /**
     * 生成随机nonce
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * 销毁面板
     */
    public dispose(): void {
        CacheStatsPanel.currentPanel = undefined;
        this.stopAutoUpdate();
        
        this.panel.dispose();
        
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        
        this.logger.info('[CacheMonitor] 📊 缓存统计面板已关闭');
    }
}