// src/features/explorer-alias/ExplorerAliasModule.ts
// [module: explorer-alias] [tags: TreeView, Alias, Translate, Cache]
/**
 * AI 资源管理器模块主入口
 * 负责模块的激活、服务注册和生命周期管理
 */

import * as vscode from 'vscode';
import { BaseModule } from '../../shared/base/BaseModule';
import { DIContainer } from '../../core/di/Container';
import { MultiProviderAIClient } from '../../core/ai/MultiProviderAIClient';
import { KVCache } from '../../core/cache/KVCache';
import { DictionaryManager } from './core/DictionaryManager';
import { AIExplorerProvider } from './ui/AIExplorerProvider';
import { EnhancedTranslateBatchUseCase } from './app/usecases/EnhancedTranslateBatchUseCase';
import { APIKeyCommands } from './app/commands/APIKeyCommands';
import { FileNode } from '../../shared/types';

export class ExplorerAliasModule extends BaseModule {
    private treeProvider?: AIExplorerProvider;
    private translateUseCase?: EnhancedTranslateBatchUseCase;
    private apiKeyCommands?: APIKeyCommands;
    private dictionaryManager?: DictionaryManager;

    constructor(container: DIContainer) {
        super(container, 'explorer-alias');
    }

    async activate(context: vscode.ExtensionContext): Promise<void> {
        this.logger.info('AI 资源管理器模块正在激活...');

        // 注册服务到 DI 容器
        this.registerServices(context);

        // 初始化字典管理器
        this.dictionaryManager = this.container.get<DictionaryManager>('dictionaryManager');
        await this.dictionaryManager.initialize();

        // 初始化 AI 客户端
        const aiClient = this.container.get<MultiProviderAIClient>('aiClient');
        await aiClient.initialize();

        // 创建树视图提供者
        await this.createTreeProvider(context);

        // 注册命令处理器
        this.registerCommands(context);

        this.logger.info('AI 资源管理器模块激活完成');
    }

    private registerServices(context: vscode.ExtensionContext): void {
        // 注册多提供商 AI 客户端
        if (!this.container.has('aiClient')) {
            this.container.registerSingleton('aiClient', () => 
                new MultiProviderAIClient(this.logger));
        }

        // 注册缓存服务
        if (!this.container.has('kvCache')) {
            this.container.registerSingleton('kvCache', () => 
                new KVCache(context, this.logger));
        }

        // 注册字典管理器
        this.container.registerSingleton('dictionaryManager', () => 
            new DictionaryManager(this.logger, context));

        // 注册增强翻译用例
        this.container.registerSingleton('translateUseCase', () => {
            const aiClient = this.container.get<MultiProviderAIClient>('aiClient');
            const cache = this.container.get<KVCache>('kvCache');
            const dictionary = this.container.get<DictionaryManager>('dictionaryManager');
            return new EnhancedTranslateBatchUseCase(this.logger, aiClient, cache, dictionary);
        });

        // 注册 API Key 命令处理器
        this.container.registerSingleton('apiKeyCommands', () => 
            new APIKeyCommands(this.logger));

        this.logger.debug('Explorer-Alias 模块服务注册完成');
    }

    private async createTreeProvider(context: vscode.ExtensionContext): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.warn('没有打开的工作区文件夹，跳过创建树视图');
            vscode.window.showWarningMessage('请先打开一个工作区文件夹才能使用 AI 资源管理器');
            return;
        }

        try {
            // 使用第一个工作区文件夹
            const workspaceFolder = workspaceFolders[0];
            this.logger.info(`正在为工作区创建 AI 资源管理器: ${workspaceFolder.uri.fsPath}`);
            
            this.treeProvider = new AIExplorerProvider(this.logger, workspaceFolder);

            // 注册树视图到 VS Code
            const treeView = vscode.window.createTreeView('aiExplorer', {
                treeDataProvider: this.treeProvider,
                showCollapseAll: true,
                canSelectMany: false
            });

            // 将树视图添加到 VS Code 扩展上下文中
            context.subscriptions.push(treeView);
            
            // 将树视图添加到容器中供其他地方使用
            this.container.registerSingleton('aiExplorerTreeView', () => treeView);

            this.logger.info('AI 资源管理器树视图创建成功');
            
        } catch (error) {
            this.logger.error('创建 AI 资源管理器树视图失败', error);
            vscode.window.showErrorMessage(`AI 资源管理器初始化失败: ${error}`);
        }
    }

    private registerCommands(context: vscode.ExtensionContext): void {
        // 获取命令处理器
        this.apiKeyCommands = this.container.get<APIKeyCommands>('apiKeyCommands');
        this.translateUseCase = this.container.get<EnhancedTranslateBatchUseCase>('translateUseCase');

        // 刷新命令
        this.registerCommand(context, 'aiExplorer.refresh', () => {
            this.logger.info('刷新 AI 资源管理器');
            this.treeProvider?.refresh();
            vscode.window.showInformationMessage('AI 资源管理器已刷新');
        });

        // 翻译命令（单个文件）
        this.registerCommand(context, 'aiExplorer.translate', async (item) => {
            await this.handleTranslateCommand(item);
        });

        // 翻译整个工作区
        this.registerCommand(context, 'aiExplorer.translateAll', async () => {
            await this.handleTranslateAllCommand();
        });

        // 切换别名显示命令
        this.registerCommand(context, 'aiExplorer.toggleAlias', () => {
            this.logger.info('切换别名显示');
            this.treeProvider?.toggleAliasDisplay();
            vscode.window.showInformationMessage('已切换别名显示模式');
        });

        // API Key 管理命令
        this.registerCommand(context, 'aiExplorer.setOpenAIKey', async () => {
            await this.apiKeyCommands!.setOpenAIKey();
        });

        this.registerCommand(context, 'aiExplorer.setHunyuanKey', async () => {
            await this.apiKeyCommands!.setHunyuanKey();
        });

        this.registerCommand(context, 'aiExplorer.chooseProvider', async () => {
            await this.apiKeyCommands!.chooseProvider();
        });

        this.logger.debug('Explorer-Alias 命令注册完成');
    }

    private async handleTranslateCommand(item?: any): Promise<void> {
        try {
            if (!this.treeProvider || !this.translateUseCase) {
                vscode.window.showErrorMessage('服务未初始化');
                return;
            }

            let filesToTranslate: FileNode[] = [];

            // 如果有选中的项目，只翻译该项目
            if (item && item.node) {
                filesToTranslate = [item.node];
            } else {
                // 否则翻译所有需要翻译的文件
                filesToTranslate = this.treeProvider.getNodesNeedingTranslation();
            }
            
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

                const results = await this.translateUseCase!.translateFiles(filesToTranslate, {
                    enableLearning: true,
                    batchSize: 10
                });
                
                // 更新树视图中的别名
                let successCount = 0;
                for (const [file, result] of results) {
                    if (result.translated !== result.original) {
                        this.treeProvider!.updateAlias(file, result.translated);
                        successCount++;
                    }
                }

                progress.report({ increment: 100, message: '翻译完成' });

                // 刷新树视图
                this.treeProvider!.refresh();

                const statsMessage = `翻译完成：成功 ${successCount} 个，共处理 ${results.size} 个文件`;
                vscode.window.showInformationMessage(statsMessage);
                this.logger.info(statsMessage);
            });

        } catch (error) {
            this.logger.error('翻译命令执行失败', error);
            vscode.window.showErrorMessage(
                `翻译失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleTranslateAllCommand(): Promise<void> {
        try {
            if (!this.treeProvider || !this.translateUseCase) {
                vscode.window.showErrorMessage('服务未初始化');
                return;
            }

            // 获取所有需要翻译的文件
            const allFiles = this.treeProvider.getNodesNeedingTranslation();
            
            if (allFiles.length === 0) {
                vscode.window.showInformationMessage('没有需要翻译的文件');
                return;
            }

            // 确认操作
            const action = await vscode.window.showInformationMessage(
                `准备翻译 ${allFiles.length} 个文件，这可能需要一些时间。是否继续？`,
                '继续翻译',
                '取消'
            );

            if (action !== '继续翻译') {
                return;
            }

            // 显示进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在批量翻译工作区文件...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: `开始翻译 ${allFiles.length} 个文件` });

                const results = await this.translateUseCase!.translateFiles(allFiles, {
                    enableLearning: true,
                    batchSize: 15,
                    forceRefresh: false
                });
                
                // 更新树视图中的别名
                let successCount = 0;
                let cacheHits = 0;
                let newTranslations = 0;

                for (const [file, result] of results) {
                    if (result.translated !== result.original) {
                        this.treeProvider!.updateAlias(file, result.translated);
                        successCount++;
                        
                        if (result.source === 'cache') {
                            cacheHits++;
                        } else {
                            newTranslations++;
                        }
                    }
                }

                progress.report({ increment: 100, message: '翻译完成' });

                // 刷新树视图
                this.treeProvider!.refresh();

                // 显示详细统计信息
                const statsMessage = `批量翻译完成！\n` +
                    `✅ 成功翻译：${successCount} 个文件\n` +
                    `💾 缓存命中：${cacheHits} 个\n` +
                    `🆕 新翻译：${newTranslations} 个\n` +
                    `📁 总处理：${results.size} 个文件`;

                vscode.window.showInformationMessage(statsMessage);
                this.logger.info(`批量翻译统计: 成功=${successCount}, 缓存=${cacheHits}, 新翻译=${newTranslations}`);
            });

        } catch (error) {
            this.logger.error('批量翻译命令执行失败', error);
            vscode.window.showErrorMessage(
                `批量翻译失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}