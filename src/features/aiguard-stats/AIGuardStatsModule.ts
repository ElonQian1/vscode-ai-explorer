/**
 * AIGuardStatsModule.ts
 * 
 * AI守卫统计功能模块
 * 负责统计面板、命令注册和服务集成
 */

import * as vscode from 'vscode';
import { DIContainer } from '../../core/di/Container';
import { Logger } from '../../core/logging/Logger';
import { AIGuardStatsService } from '../../shared/services/AIGuardStatsService';
import { registerAIGuardStatsCommands, AIGuardStatsCommands } from './commands';

export class AIGuardStatsModule {
    private logger: Logger;
    private statsService: AIGuardStatsService;
    private commands: AIGuardStatsCommands | null = null;

    constructor(private container: DIContainer) {
        this.logger = container.get<Logger>('logger');
        this.statsService = new AIGuardStatsService();
    }

    /**
     * 激活模块
     */
    async activate(context: vscode.ExtensionContext): Promise<void> {
        try {
            this.logger.info('[AIGuardStatsModule] 正在激活AI守卫统计模块...');

            // 加载历史统计数据
            await this.statsService.load();

            // 注册命令
            this.commands = registerAIGuardStatsCommands(context, this.statsService);

            // 注册到容器中供其他模块使用
            this.container.registerSingleton('aiGuardStatsService', () => this.statsService);

            // 添加菜单项到命令面板
            this.registerMenuItems(context);

            // 添加状态栏项（可选）
            this.createStatusBarItem(context);

            this.logger.info('[AIGuardStatsModule] AI守卫统计模块激活完成');

        } catch (error) {
            this.logger.error('[AIGuardStatsModule] 激活失败:', error);
            throw error;
        }
    }

    /**
     * 注册菜单项
     */
    private registerMenuItems(context: vscode.ExtensionContext): void {
        // 这些命令会自动出现在命令面板中，因为它们已经在 package.json 中定义
        // 可以在这里添加额外的上下文菜单或编辑器菜单项
    }

    /**
     * 创建状态栏项
     */
    private createStatusBarItem(context: vscode.ExtensionContext): void {
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 
            100
        );

        statusBarItem.command = 'ai-explorer.aiguard.showStats';
        statusBarItem.tooltip = 'AI守卫统计 - 点击查看详细统计';
        
        // 初始化显示
        this.updateStatusBarItem(statusBarItem);
        
        // 定期更新状态栏
        const updateInterval = setInterval(() => {
            this.updateStatusBarItem(statusBarItem);
        }, 10000); // 每10秒更新一次

        statusBarItem.show();

        context.subscriptions.push(
            statusBarItem,
            { dispose: () => clearInterval(updateInterval) }
        );
    }

    /**
     * 更新状态栏显示
     */
    private updateStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
        try {
            const stats = this.statsService.getStats();
            const savingsRate = this.statsService.getSavingsRate();
            
            if (stats.totalDropped === 0 && stats.totalKept === 0) {
                statusBarItem.text = '🛡️ AI守卫';
            } else {
                statusBarItem.text = `🛡️ ${savingsRate.toFixed(0)}% (${stats.totalDropped.toLocaleString()})`;
            }
        } catch (error) {
            statusBarItem.text = '🛡️ AI守卫';
        }
    }

    /**
     * 获取统计服务实例（供其他模块使用）
     */
    getStatsService(): AIGuardStatsService {
        return this.statsService;
    }

    /**
     * 停用模块
     */
    async deactivate(): Promise<void> {
        try {
            this.logger.info('[AIGuardStatsModule] 正在停用AI守卫统计模块...');

            if (this.commands) {
                this.commands.dispose();
                this.commands = null;
            }

            // 保存统计数据
            await this.statsService.dispose();

            this.logger.info('[AIGuardStatsModule] AI守卫统计模块停用完成');

        } catch (error) {
            this.logger.error('[AIGuardStatsModule] 停用失败:', error);
        }
    }
}