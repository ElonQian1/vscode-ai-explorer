/**
 * AIGuardStatsPanel.ts
 * 
 * AI守卫统计面板管理器
 * 负责创建和管理统计 Webview 面板，显示过滤效果和节省统计
 */

import * as vscode from 'vscode';
import { AIGuardStatsService } from '../../../shared/services/AIGuardStatsService';
import { Logger } from '../../../core/logging/Logger';
import { getNonce } from '../../filetree-blueprint/utils/webviewHost';

export class AIGuardStatsPanel {
    private panel: vscode.WebviewPanel | null = null;
    private logger = new Logger('[AIGuardStatsPanel]');
    private statsService: AIGuardStatsService;
    private refreshTimer: NodeJS.Timeout | null = null;

    constructor(statsService: AIGuardStatsService) {
        this.statsService = statsService;
    }

    /**
     * 创建或显示统计面板
     */
    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        // 创建 Webview 面板
        this.panel = vscode.window.createWebviewPanel(
            'aiGuardStats',
            '🛡️ AI守卫统计',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        // 设置图标
        this.panel.iconPath = {
            light: vscode.Uri.file(vscode.env.appRoot + '/resources/light/shield.svg'),
            dark: vscode.Uri.file(vscode.env.appRoot + '/resources/dark/shield.svg')
        };

        // 生成HTML内容
        await this.updateContent();

        // 处理消息
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            undefined
        );

        // 面板关闭时清理
        this.panel.onDidDispose(() => {
            this.panel = null;
            this.stopAutoRefresh();
        });

        // 启动自动刷新
        this.startAutoRefresh();

        this.logger.info('统计面板已创建');
    }

    /**
     * 更新面板内容
     */
    private async updateContent(): Promise<void> {
        if (!this.panel) return;

        try {
            const stats = this.statsService.getStats();
            const topReasons = this.statsService.getTopReasons(8);
            const savingsRate = this.statsService.getSavingsRate();
            const sessionSavingsRate = this.statsService.getSessionSavingsRate();

            const html = this.generateHtml({
                stats,
                topReasons,
                savingsRate,
                sessionSavingsRate
            });

            this.panel.webview.html = html;
        } catch (error) {
            this.logger.error('更新面板内容失败:', error);
        }
    }

    /**
     * 生成HTML内容
     */
    private generateHtml(data: {
        stats: any;
        topReasons: any[];
        savingsRate: number;
        sessionSavingsRate: number;
    }): string {
        const nonce = getNonce();
        
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline' https://*.vscode-cdn.net 'nonce-${nonce}'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; img-src 'self' data: https:;">
    <title>AI守卫统计</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 2em;
            color: var(--vscode-textLink-foreground);
        }
        
        .header p {
            margin: 10px 0 0;
            opacity: 0.8;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid var(--vscode-textLink-foreground);
        }
        
        .stat-card h3 {
            margin: 0 0 10px;
            font-size: 1.1em;
            color: var(--vscode-textLink-foreground);
        }
        
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .stat-subtitle {
            font-size: 0.9em;
            opacity: 0.7;
        }
        
        .savings-rate {
            color: var(--vscode-charts-green);
        }
        
        .chart-container {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }
        
        .chart-title {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-textLink-foreground);
        }
        
        .chart-canvas {
            width: 100%;
            height: 400px;
        }
        
        .reason-list {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 20px;
        }
        
        .reason-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        
        .reason-item:last-child {
            border-bottom: none;
        }
        
        .reason-name {
            font-weight: 500;
        }
        
        .reason-count {
            font-weight: bold;
            color: var(--vscode-charts-blue);
        }
        
        .reason-percentage {
            font-size: 0.9em;
            opacity: 0.7;
            margin-left: 10px;
        }
        
        .action-buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
        }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            opacity: 0.6;
        }
        
        .session-badge {
            display: inline-block;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 0.8em;
            margin-left: 8px;
        }
        
        .loading {
            text-align: center;
            padding: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ AI守卫统计面板</h1>
            <p>实时监控AI请求过滤效果，智能节省算力成本</p>
        </div>
        
        ${this.generateStatsContent(data)}
        
        <div class="action-buttons">
            <button class="btn" onclick="refreshStats()">🔄 刷新统计</button>
            <button class="btn btn-secondary" onclick="resetStats()">🗑️ 重置统计</button>
            <button class="btn btn-secondary" onclick="resetSession()">📋 重置会话</button>
        </div>
    </div>

    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // 绘制饼图
        function drawPieChart() {
            const canvas = document.getElementById('reasonChart');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const data = ${JSON.stringify(data.topReasons)};
            
            if (data.length === 0) {
                canvas.style.display = 'none';
                return;
            }
            
            new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: data.map(item => this.translateReason(item.reason)),
                    datasets: [{
                        data: data.map(item => item.count),
                        backgroundColor: [
                            '#007ACC', '#BC5FD3', '#00D4AA', '#F14C4C',
                            '#FFAB00', '#8B5CF6', '#10B981', '#F59E0B'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                usePointStyle: true,
                                padding: 15,
                                color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground')
                            }
                        }
                    }
                }
            });
        }
        
        // 翻译过滤原因
        function translateReason(reason) {
            const translations = {
                'numeric': '数字',
                'version': '版本号',
                'hash': '哈希值',
                'acronym-allow': '缩写词',
                'stopword': '停用词',
                'common-placeholder': '占位符',
                'too-short': '过短',
                'custom': '自定义规则'
            };
            
            // 处理自定义规则格式 "custom:rule-name"
            if (reason.startsWith('custom:')) {
                return '自定义: ' + reason.substring(7);
            }
            
            return translations[reason] || reason;
        }
        
        // 刷新统计
        function refreshStats() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        // 重置统计
        function resetStats() {
            if (confirm('确定要重置所有统计数据吗？此操作不可撤销。')) {
                vscode.postMessage({ command: 'reset' });
            }
        }
        
        // 重置会话统计
        function resetSession() {
            vscode.postMessage({ command: 'resetSession' });
        }
        
        // 页面加载完成后绘制图表
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(drawPieChart, 100);
        });
    </script>
</body>
</html>`;
    }

    /**
     * 生成统计内容
     */
    private generateStatsContent(data: {
        stats: any;
        topReasons: any[];
        savingsRate: number;
        sessionSavingsRate: number;
    }): string {
        const { stats, topReasons, savingsRate, sessionSavingsRate } = data;
        
        if (stats.totalDropped === 0 && stats.totalKept === 0) {
            return `
                <div class="empty-state">
                    <h3>📊 暂无统计数据</h3>
                    <p>开始使用AI翻译功能后，这里将显示过滤统计</p>
                </div>
            `;
        }

        return `
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>📉 累计过滤数</h3>
                    <div class="stat-value">${stats.totalDropped.toLocaleString()}</div>
                    <div class="stat-subtitle">已过滤的无效词汇</div>
                </div>
                
                <div class="stat-card">
                    <h3>🤖 发送AI数</h3>
                    <div class="stat-value">${stats.totalKept.toLocaleString()}</div>
                    <div class="stat-subtitle">需要AI翻译的词汇</div>
                </div>
                
                <div class="stat-card">
                    <h3>💰 总节省率</h3>
                    <div class="stat-value savings-rate">${savingsRate.toFixed(1)}%</div>
                    <div class="stat-subtitle">节省的AI请求比例</div>
                </div>
                
                <div class="stat-card">
                    <h3>⚡ 会话节省率</h3>
                    <div class="stat-value savings-rate">${sessionSavingsRate.toFixed(1)}%</div>
                    <div class="stat-subtitle">本次会话节省比例 <span class="session-badge">实时</span></div>
                </div>
            </div>
            
            <div class="chart-container">
                <div class="chart-title">🎯 过滤原因分布</div>
                <canvas id="reasonChart" class="chart-canvas"></canvas>
            </div>
            
            <div class="reason-list">
                <div class="chart-title">📋 详细统计</div>
                ${this.generateReasonList(topReasons)}
            </div>
        `;
    }

    /**
     * 生成原因列表
     */
    private generateReasonList(topReasons: any[]): string {
        if (topReasons.length === 0) {
            return '<div class="empty-state">暂无详细数据</div>';
        }

        return topReasons.map(item => `
            <div class="reason-item">
                <span class="reason-name">${this.translateReason(item.reason)}</span>
                <span>
                    <span class="reason-count">${item.count.toLocaleString()}</span>
                    <span class="reason-percentage">(${item.percentage.toFixed(1)}%)</span>
                </span>
            </div>
        `).join('');
    }

    /**
     * 翻译过滤原因
     */
    private translateReason(reason: string): string {
        const translations: { [key: string]: string } = {
            'numeric': '📊 数字',
            'version': '🏷️ 版本号',
            'hash': '🔐 哈希值',
            'acronym-allow': '🔤 缩写词',
            'stopword': '⛔ 停用词',
            'common-placeholder': '📝 占位符',
            'too-short': '📏 过短词汇',
            'custom': '⚙️ 自定义规则'
        };

        // 处理自定义规则格式
        if (reason.startsWith('custom:')) {
            return '⚙️ 自定义: ' + reason.substring(7);
        }

        return translations[reason] || `🔍 ${reason}`;
    }

    /**
     * 处理来自 Webview 的消息
     */
    private async handleMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'refresh':
                    await this.updateContent();
                    this.logger.info('统计数据已刷新');
                    break;

                case 'reset':
                    await this.statsService.reset();
                    await this.updateContent();
                    this.logger.info('统计数据已重置');
                    vscode.window.showInformationMessage('AI守卫统计已重置');
                    break;

                case 'resetSession':
                    this.statsService.resetSession();
                    await this.updateContent();
                    this.logger.info('会话统计已重置');
                    vscode.window.showInformationMessage('会话统计已重置');
                    break;

                default:
                    this.logger.warn('未知命令:', message.command);
            }
        } catch (error) {
            this.logger.error('处理消息失败:', error);
            vscode.window.showErrorMessage(`操作失败: ${error}`);
        }
    }

    /**
     * 启动自动刷新
     */
    private startAutoRefresh(): void {
        this.refreshTimer = setInterval(() => {
            this.updateContent();
        }, 5000); // 每5秒刷新一次
    }

    /**
     * 停止自动刷新
     */
    private stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * 销毁面板
     */
    dispose(): void {
        this.stopAutoRefresh();
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
    }
}