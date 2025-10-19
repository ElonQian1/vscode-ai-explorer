// src/features/filetree-blueprint/monitoring/CacheStatsStatusBar.ts
// [module: filetree-blueprint] [tags: Monitoring, StatusBar]

/**
 * S3胶囊缓存性能监控状态栏
 * 
 * 功能:
 * - VS Code状态栏实时显示缓存命中率
 * - 点击状态栏打开详细统计面板
 * - 定时更新缓存统计数据
 * - 支持开启/关闭监控
 */

import * as vscode from 'vscode';
import { Logger } from '../../../core/logging/Logger';
import { CacheStats } from '../cache/EnhancedCapsuleCache';

export class CacheStatsStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private updateTimer: NodeJS.Timeout | null = null;
    private isEnabled = true;
    
    constructor(
        private logger: Logger,
        private getCacheStats: () => CacheStats
    ) {
        // 创建状态栏项
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 
            100  // 优先级，数字越大越靠左
        );
        
        this.statusBarItem.command = 'aiExplorer.showCacheStats';
        this.statusBarItem.tooltip = 'S3胶囊缓存统计 - 点击查看详情';
        
        this.initialize();
    }

    private initialize(): void {
        this.updateDisplay();
        this.startAutoUpdate();
        this.statusBarItem.show();
        
        this.logger.info('[CacheMonitor] 📊 缓存监控状态栏已启动');
    }

    /**
     * 更新状态栏显示
     */
    public updateDisplay(): void {
        if (!this.isEnabled) {
            this.statusBarItem.hide();
            return;
        }

        try {
            const stats = this.getCacheStats();
            
            // 格式化显示文本
            const text = this.formatStatusText(stats);
            const tooltip = this.formatTooltip(stats);
            
            this.statusBarItem.text = text;
            this.statusBarItem.tooltip = tooltip;
            this.statusBarItem.show();
            
        } catch (error) {
            this.logger.warn('[CacheMonitor] 更新状态栏失败', error);
            this.statusBarItem.text = '$(database) Cache: Error';
            this.statusBarItem.tooltip = '缓存监控出现错误';
        }
    }

    /**
     * 格式化状态栏文本
     */
    private formatStatusText(stats: CacheStats): string {
        const icon = this.getHitRateIcon(stats.hitRate);
        return `${icon} ${stats.hitRate.toFixed(1)}% (${stats.totalCapsules})`;
    }

    /**
     * 根据命中率选择图标
     */
    private getHitRateIcon(hitRate: number): string {
        if (hitRate >= 80) return '$(database)';      // 高命中率
        if (hitRate >= 60) return '$(circle-filled)'; // 中等命中率
        if (hitRate >= 40) return '$(circle-outline)'; // 较低命中率
        return '$(warning)';                           // 低命中率
    }

    /**
     * 格式化工具提示
     */
    private formatTooltip(stats: CacheStats): string {
        const upTimeStr = this.formatUptime(stats.uptime);
        const memorySizeStr = this.formatBytes(stats.totalMemorySize);
        const diskSizeStr = this.formatBytes(stats.totalDiskSize);
        
        return [
            '🗄️ S3胶囊缓存统计',
            '',
            `📊 总体性能:`,
            `  • 总命中率: ${stats.hitRate.toFixed(1)}% (${stats.memoryHits + stats.diskHits}/${stats.requestCount})`,
            `  • 内存命中率: ${stats.memoryHitRate.toFixed(1)}% (${stats.memoryHits}/${stats.requestCount})`,
            `  • 磁盘命中率: ${stats.diskHitRate.toFixed(1)}% (${stats.diskHits}/${stats.requestCount})`,
            `  • 平均响应时间: ${stats.avgResponseTime.toFixed(1)}ms`,
            '',
            `💾 存储使用:`,
            `  • 胶囊总数: ${stats.totalCapsules}`,
            `  • 内存占用: ${memorySizeStr}`,
            `  • 磁盘占用: ${diskSizeStr}`,
            `  • 写入次数: ${stats.writes}`,
            `  • 失效次数: ${stats.invalidations}`,
            '',
            `⏱️ 运行状态:`,
            `  • 运行时长: ${upTimeStr}`,
            `  • 总请求数: ${stats.requestCount}`,
            `  • 最后命中: ${this.formatLastTime(stats.lastHitTime)}`,
            `  • 最后未命中: ${this.formatLastTime(stats.lastMissTime)}`,
            '',
            '点击查看详细统计面板'
        ].join('\n');
    }

    /**
     * 格式化字节大小
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化运行时长
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
     * 格式化最后时间
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
     * 开始自动更新
     */
    private startAutoUpdate(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        // 每5秒更新一次
        this.updateTimer = setInterval(() => {
            this.updateDisplay();
        }, 5000);
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
     * 启用/禁用监控
     */
    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        
        if (enabled) {
            this.startAutoUpdate();
            this.updateDisplay();
        } else {
            this.stopAutoUpdate();
            this.statusBarItem.hide();
        }
        
        this.logger.info(`[CacheMonitor] 缓存监控${enabled ? '启用' : '禁用'}`);
    }

    /**
     * 手动触发更新
     */
    public refresh(): void {
        this.updateDisplay();
    }

    /**
     * 销毁监控器
     */
    public dispose(): void {
        this.stopAutoUpdate();
        this.statusBarItem.dispose();
        this.logger.info('[CacheMonitor] 📊 缓存监控状态栏已销毁');
    }
}