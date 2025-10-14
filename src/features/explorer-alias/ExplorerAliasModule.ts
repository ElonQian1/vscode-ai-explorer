// src/features/explorer-alias/ExplorerAliasModule.ts
// [module: explorer-alias] [tags: TreeView, Alias, Translate, Cache]
/**
 * AI 资源管理器模块主入口
 * 负责模块的激活、服务注册和生命周期管理
 */

import * as vscode from 'vscode';
import { BaseModule } from '@shared/base/BaseModule';
import { DIContainer } from '@core/di/Container';
import { OpenAIClient } from '@core/ai/OpenAIClient';
import { KVCache } from '@core/cache/KVCache';
import { AIExplorerProvider } from './ui/AIExplorerProvider';
import { TranslateBatchUseCase } from './app/usecases/TranslateBatchUseCase';

export class ExplorerAliasModule extends BaseModule {
    private treeProvider?: AIExplorerProvider;
    private translateUseCase?: TranslateBatchUseCase;

    constructor(container: DIContainer) {
        super(container, 'explorer-alias');
    }

    async activate(context: vscode.ExtensionContext): Promise<void> {
        this.logger.info('AI 资源管理器模块正在激活...');

        // 注册服务到 DI 容器
        this.registerServices(context);

        // 创建树视图提供者
        await this.createTreeProvider();

        // 注册命令处理器
        this.registerCommands(context);

        this.logger.info('AI 资源管理器模块激活完成');
    }

    private registerServices(context: vscode.ExtensionContext): void {
        // 注册 OpenAI 客户端（如果还没有注册）
        if (!this.container.has('openaiClient')) {
            this.container.registerSingleton('openaiClient', () => 
                new OpenAIClient(this.logger));
        }

        // 注册缓存服务（如果还没有注册）
        if (!this.container.has('kvCache')) {
            this.container.registerSingleton('kvCache', () => 
                new KVCache(context, this.logger));
        }

        // 注册翻译用例
        this.container.registerSingleton('translateUseCase', () => {
            const aiClient = this.container.get<OpenAIClient>('openaiClient');
            const cache = this.container.get<KVCache>('kvCache');
            return new TranslateBatchUseCase(this.logger, aiClient, cache);
        });

        this.logger.debug('Explorer-Alias 模块服务注册完成');
    }

    private async createTreeProvider(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.warn('没有打开的工作区文件夹');
            return;
        }

        // 使用第一个工作区文件夹
        const workspaceFolder = workspaceFolders[0];
        this.treeProvider = new AIExplorerProvider(this.logger, workspaceFolder);

        // 注册树视图
        const treeView = vscode.window.createTreeView('aiExplorer', {
            treeDataProvider: this.treeProvider,
            showCollapseAll: true,
            canSelectMany: false
        });

        this.logger.debug('AI 资源管理器树视图创建完成');
    }

    private registerCommands(context: vscode.ExtensionContext): void {
        // 刷新命令
        this.registerCommand(context, 'aiExplorer.refresh', () => {
            this.logger.info('刷新 AI 资源管理器');
            this.treeProvider?.refresh();
            vscode.window.showInformationMessage('AI 资源管理器已刷新');
        });

        // 翻译命令
        this.registerCommand(context, 'aiExplorer.translate', async (item) => {
            await this.handleTranslateCommand(item);
        });

        // 切换别名显示命令
        this.registerCommand(context, 'aiExplorer.toggleAlias', () => {
            this.logger.info('切换别名显示');
            this.treeProvider?.toggleAliasDisplay();
            vscode.window.showInformationMessage('已切换别名显示模式');
        });

        this.logger.debug('Explorer-Alias 命令注册完成');
    }

    private async handleTranslateCommand(item?: any): Promise<void> {
        try {
            if (!this.treeProvider || !this.translateUseCase) {
                vscode.window.showErrorMessage('服务未初始化');
                return;
            }

            // 获取需要翻译的文件
            const filesToTranslate = this.treeProvider.getNodesNeedingTranslation();
            
            if (filesToTranslate.length === 0) {
                vscode.window.showInformationMessage('没有需要翻译的文件');
                return;
            }

            // 显示进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在翻译文件名...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: `准备翻译 ${filesToTranslate.length} 个文件` });

                const results = await this.translateUseCase!.translateFiles(filesToTranslate);
                
                // 更新树视图中的别名
                let successCount = 0;
                for (const [file, result] of results) {
                    if (result.translated !== result.original) {
                        this.treeProvider!.updateAlias(file, result.translated);
                        successCount++;
                    }
                }

                progress.report({ increment: 100, message: '翻译完成' });

                vscode.window.showInformationMessage(
                    `翻译完成：成功 ${successCount} 个，共处理 ${results.size} 个文件`);
            });

        } catch (error) {
            this.logger.error('翻译命令执行失败', error);
            vscode.window.showErrorMessage(
                `翻译失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}