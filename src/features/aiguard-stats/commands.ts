/**
 * command.ts
 * 
 * AI守卫统计面板命令注册
 * 负责注册和管理统计面板相关的 VS Code 命令
 */

import * as vscode from 'vscode';
import { AIGuardStatsPanel } from './panel/AIGuardStatsPanel';
import { AIGuardStatsService } from '../../shared/services/AIGuardStatsService';
import { Logger } from '../../core/logging/Logger';

export class AIGuardStatsCommands {
    private logger = new Logger('[AIGuardStatsCommands]');
    private statsPanel: AIGuardStatsPanel | null = null;
    private statsService: AIGuardStatsService;
    private disposables: vscode.Disposable[] = [];

    constructor(statsService: AIGuardStatsService) {
        this.statsService = statsService;
    }

    /**
     * 注册所有命令
     */
    registerCommands(context: vscode.ExtensionContext): void {
        // 注册显示统计面板命令
        const showStatsCommand = vscode.commands.registerCommand(
            'ai-explorer.aiguard.showStats',
            () => this.showStatsPanel()
        );

        // 注册重置统计命令
        const resetStatsCommand = vscode.commands.registerCommand(
            'ai-explorer.aiguard.resetStats',
            () => this.resetStats()
        );

        // 注册刷新统计命令
        const refreshStatsCommand = vscode.commands.registerCommand(
            'ai-explorer.aiguard.refreshStats',
            () => this.refreshStats()
        );

        // 注册获取统计信息命令（供其他扩展或快捷键使用）
        const getStatsCommand = vscode.commands.registerCommand(
            'ai-explorer.aiguard.getStats',
            () => this.getStatsInfo()
        );

        this.disposables.push(
            showStatsCommand,
            resetStatsCommand,
            refreshStatsCommand,
            getStatsCommand
        );

        context.subscriptions.push(...this.disposables);
        
        this.logger.info('AI守卫统计命令已注册');
    }

    /**
     * 显示统计面板
     */
    private async showStatsPanel(): Promise<void> {
        try {
            if (!this.statsPanel) {
                this.statsPanel = new AIGuardStatsPanel(this.statsService);
            }
            
            await this.statsPanel.show();
            this.logger.info('统计面板已显示');
        } catch (error) {
            this.logger.error('显示统计面板失败:', error);
            vscode.window.showErrorMessage(`显示统计面板失败: ${error}`);
        }
    }

    /**
     * 重置统计数据
     */
    private async resetStats(): Promise<void> {
        try {
            const result = await vscode.window.showWarningMessage(
                '确定要重置所有AI守卫统计数据吗？',
                { modal: true },
                '重置',
                '取消'
            );

            if (result === '重置') {
                await this.statsService.reset();
                
                // 如果统计面板已打开，刷新显示
                if (this.statsPanel) {
                    await this.showStatsPanel();
                }
                
                vscode.window.showInformationMessage('AI守卫统计数据已重置');
                this.logger.info('统计数据已重置');
            }
        } catch (error) {
            this.logger.error('重置统计失败:', error);
            vscode.window.showErrorMessage(`重置统计失败: ${error}`);
        }
    }

    /**
     * 刷新统计显示
     */
    private async refreshStats(): Promise<void> {
        try {
            if (this.statsPanel) {
                await this.showStatsPanel();
                vscode.window.showInformationMessage('统计数据已刷新');
            } else {
                vscode.window.showInformationMessage('请先打开统计面板');
            }
        } catch (error) {
            this.logger.error('刷新统计失败:', error);
            vscode.window.showErrorMessage(`刷新统计失败: ${error}`);
        }
    }

    /**
     * 获取统计信息（用于状态栏或其他集成）
     */
    private getStatsInfo(): any {
        try {
            const stats = this.statsService.getStats();
            const savingsRate = this.statsService.getSavingsRate();
            const topReasons = this.statsService.getTopReasons(5);

            return {
                totalDropped: stats.totalDropped,
                totalKept: stats.totalKept,
                savingsRate,
                sessionSavingsRate: this.statsService.getSessionSavingsRate(),
                topReasons,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('获取统计信息失败:', error);
            return null;
        }
    }

    /**
     * 销毁资源
     */
    dispose(): void {
        if (this.statsPanel) {
            this.statsPanel.dispose();
            this.statsPanel = null;
        }

        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        this.logger.info('AI守卫统计命令已销毁');
    }
}

/**
 * 便捷函数：注册AI守卫统计命令
 */
export function registerAIGuardStatsCommands(
    context: vscode.ExtensionContext, 
    statsService: AIGuardStatsService
): AIGuardStatsCommands {
    const commands = new AIGuardStatsCommands(statsService);
    commands.registerCommands(context);
    return commands;
}