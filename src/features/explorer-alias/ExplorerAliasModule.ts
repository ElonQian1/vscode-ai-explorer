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
import { SmartFileAnalyzer, SmartAnalysisResult } from '../../core/ai/SmartFileAnalyzer';
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
    private smartAnalyzer?: SmartFileAnalyzer;
    private extensionContext?: vscode.ExtensionContext; // 保存 context 以便后续使用
    
    // 🚀 防抖刷新机制，避免频繁UI更新
    private refreshTimer?: NodeJS.Timeout;
    private readonly REFRESH_DEBOUNCE_DELAY = 300; // 300ms 防抖延迟

    constructor(container: DIContainer) {
        super(container, 'explorer-alias');
    }
    
    /**
     * 🚀 防抖刷新TreeView - 避免频繁UI更新导致性能问题
     */
    private debouncedRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        this.refreshTimer = setTimeout(() => {
            this.logger.info('刷新 AI 资源管理器树视图');
            this.treeProvider?.refresh();
            this.refreshTimer = undefined;
        }, this.REFRESH_DEBOUNCE_DELAY);
    }

    async activate(context: vscode.ExtensionContext): Promise<void> {
        this.logger.info('AI 资源管理器模块正在激活...');

        // 保存 context 以便后续使用
        this.extensionContext = context;

        // 注册服务到 DI 容器
        this.registerServices(context);

        // 初始化字典管理器
        this.dictionaryManager = this.container.get<DictionaryManager>('dictionaryManager');
        await this.dictionaryManager.initialize();

        // 初始化 AI 客户端
        const aiClient = this.container.get<MultiProviderAIClient>('aiClient');
        await aiClient.initialize();

        // 初始化智能文件分析器
        this.smartAnalyzer = this.container.get<SmartFileAnalyzer>('smartAnalyzer');

        // 创建树视图提供者
        await this.createTreeProvider(context);

        // 注册命令处理器
        this.registerCommands(context);

        // 设置文件变更监听器
        this.setupFileWatchers(context);

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

        // 注册智能文件分析器
        this.container.registerSingleton('smartAnalyzer', () => {
            const aiClient = this.container.get<MultiProviderAIClient>('aiClient');
            return new SmartFileAnalyzer(this.logger, aiClient, context);
        });

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
            
            // 获取缓存和字典管理器实例
            const cache = this.container.get<KVCache>('kvCache');
            const dictionaryManager = this.container.get<DictionaryManager>('dictionaryManager');
            const translateUseCase = this.container.get<EnhancedTranslateBatchUseCase>('translateUseCase');
            
            // 创建树视图提供者
            this.treeProvider = new AIExplorerProvider(
                this.logger,
                workspaceFolder,
                cache,
                dictionaryManager,
                translateUseCase // 传入翻译用例
            );

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
            
            // 🔔 监听AI分析完成事件，自动刷新TreeView
            const smartAnalyzer = this.container.get<SmartFileAnalyzer>('smartAnalyzer');
            context.subscriptions.push(
                smartAnalyzer.onAnalysisComplete((filePath) => {
                    this.logger.info(`[AI分析完成] 刷新TreeView: ${filePath}`);
                    this.treeProvider?.refresh();
                    vscode.window.showInformationMessage(`✨ AI分析完成，请hover查看结果！`);
                })
            );
            
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
        this.registerCommand(context, 'aiExplorer.refresh', async () => {
            this.logger.info('刷新 AI 资源管理器');
            await this.treeProvider?.refresh();
            vscode.window.showInformationMessage('AI 资源管理器已刷新');
        });

        // 翻译命令（单个文件）
        this.registerCommand(context, 'aiExplorer.translate', async (item) => {
            await this.handleTranslateCommand(item);
        });

        // 翻译单个文件（仅此文件，不递归）
        this.registerCommand(context, 'aiExplorer.translateThisFile', async (item) => {
            this.logger.info('执行单文件翻译命令');
            await this.treeProvider?.translateThisFile(item);
        });

        // 强制用 AI 翻译（绕过缓存/词典/规则）
        this.registerCommand(context, 'aiExplorer.forceAITranslate', async (item) => {
            this.logger.info('执行强制 AI 翻译命令');
            await this.treeProvider?.forceAITranslate(item);
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

        // 强制重新加载别名（调试用）
        this.registerCommand(context, 'aiExplorer.reloadAliases', async () => {
            this.logger.info('强制重新加载别名');
            await this.treeProvider?.refresh();
            vscode.window.showInformationMessage('已重新加载所有别名');
        });

        // AI状态检查命令（调试用）
        this.registerCommand(context, 'aiExplorer.checkAIStatus', async () => {
            await this.handleCheckAIStatusCommand();
        });

        // 测试AI翻译单个词汇
        this.registerCommand(context, 'aiExplorer.testAITranslation', async () => {
            await this.handleTestAITranslationCommand();
        });

        // 右键菜单命令
        this.registerCommand(context, 'aiExplorer.renameToAlias', async (item) => {
            await this.treeProvider?.renameToAlias(item);
        });

        this.registerCommand(context, 'aiExplorer.copyAlias', async (item) => {
            await this.treeProvider?.copyAlias(item);
        });

        this.registerCommand(context, 'aiExplorer.clearCacheForNode', async (item) => {
            await this.treeProvider?.clearCacheForNode(item);
        });

        // 🔍 文件分析命令
        this.registerCommand(context, 'aiExplorer.analyzePath', async (...args) => {
            await this.handleAnalyzePathCommand(...args);
        });

        this.registerCommand(context, 'aiExplorer.reanalyzePath', async (item) => {
            await this.handleAnalyzePathCommand(item, true);
        });

        // 🔄 刷新AI分析命令 - 用户主动触发
        this.registerCommand(context, 'aiExplorer.refreshAnalysis', async (item) => {
            await this.handleRefreshAnalysis(item);
        });

        this.registerCommand(context, 'aiExplorer.showAnalysisSummary', async (item) => {
            await this.handleShowAnalysisSummary(item);
        });

        this.registerCommand(context, 'aiExplorer.batchAnalyzeFolder', async (item) => {
            await this.handleBatchAnalyzeFolderCommand(item);
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

                // 🆕 读取并发配置
                const config = vscode.workspace.getConfiguration('aiExplorer');
                const maxConcurrency = config.get<number>('batch.maxConcurrency', 6);
                const retryTimes = config.get<number>('batch.retryTimes', 1);

                const results = await this.translateUseCase!.translateFiles(filesToTranslate, {
                    enableLearning: true,
                    batchSize: 10,  // 已废弃，保留用于向后兼容
                    maxConcurrency,  // 🆕 并发控制
                    retryTimes       // 🆕 重试机制
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
                await this.treeProvider!.refresh();

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
                await this.treeProvider!.refresh();

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

    private async handleCheckAIStatusCommand(): Promise<void> {
        try {
            if (!this.translateUseCase) {
                vscode.window.showErrorMessage('翻译服务未初始化');
                return;
            }

            // 获取AI客户端状态
            const aiClient = this.container.get<MultiProviderAIClient>('aiClient');
            const stats = await this.translateUseCase.getTranslationStats();
            
            // 检查API Key配置
            let hasOpenAIKey = false;
            let hasHunyuanKey = false;
            try {
                // 尝试获取AI客户端状态来判断API Key是否配置
                const providerStatus = stats.aiStats;
                hasOpenAIKey = providerStatus && providerStatus.openai !== undefined;
                hasHunyuanKey = providerStatus && providerStatus.hunyuan !== undefined;
            } catch (error) {
                this.logger.warn('无法检查API Key状态', error);
            }
            
            const statusMessage = `🔍 AI服务状态检查\n\n` +
                `📊 缓存统计: ${JSON.stringify(stats.cacheStats, null, 2)}\n\n` +
                `📚 词典统计: ${JSON.stringify(stats.dictionaryStats, null, 2)}\n\n` +
                `🤖 AI状态: ${JSON.stringify(stats.aiStats, null, 2)}\n\n` +
                `🔑 API Keys:\n` +
                `  - OpenAI: ${hasOpenAIKey ? '✅ 已配置' : '❌ 未配置'}\n` +
                `  - 腾讯混元: ${hasHunyuanKey ? '✅ 已配置' : '❌ 未配置'}`;

            await vscode.window.showInformationMessage(statusMessage, { modal: true });
            this.logger.info('AI状态检查完成', { stats, hasOpenAIKey, hasHunyuanKey });

        } catch (error) {
            this.logger.error('AI状态检查失败', error);
            vscode.window.showErrorMessage(`AI状态检查失败: ${error}`);
        }
    }

    private async handleTestAITranslationCommand(): Promise<void> {
        try {
            if (!this.translateUseCase) {
                vscode.window.showErrorMessage('翻译服务未初始化');
                return;
            }

            // 请用户输入要测试的单词
            const testWord = await vscode.window.showInputBox({
                prompt: '输入要测试翻译的英文单词或文件名',
                placeHolder: '例如: components, utils, README.md',
                value: 'components'
            });

            if (!testWord) {
                return;
            }

            // 显示进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在测试翻译: ${testWord}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: '开始翻译测试...' });

                const result = await this.translateUseCase!.translateSingle(testWord, {
                    forceRefresh: true, // 强制刷新以测试AI
                    enableLearning: false // 测试时不学习
                });

                progress.report({ increment: 100, message: '测试完成' });

                const resultMessage = `🧪 翻译测试结果\n\n` +
                    `📝 原文: ${result.original}\n` +
                    `🈸 译文: ${result.translated}\n` +
                    `📊 置信度: ${result.confidence ? (result.confidence * 100).toFixed(1) : '未知'}%\n` +
                    `🔧 来源: ${result.source}\n` +
                    `⏰ 时间: ${result.timestamp ? new Date(result.timestamp).toLocaleString() : '未知'}`;

                vscode.window.showInformationMessage(resultMessage, { modal: true });
                this.logger.info('AI翻译测试完成', result);
            });

        } catch (error) {
            this.logger.error('AI翻译测试失败', error);
            vscode.window.showErrorMessage(`AI翻译测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 🔍 =============文件分析命令处理器=============

    /**
     * 分析指定路径的文件或文件夹
     */
    private async handleAnalyzePathCommand(...args: any[]): Promise<void> {
        try {
            this.logger.info('🔍 handleAnalyzePathCommand 被调用', { 
                args: args,
                argsLength: args.length,
                firstArg: args[0]
            });

            // 尝试从不同的参数获取路径
            let filePath: string | null = null;
            
            // 遍历所有参数寻找有效路径
            for (let i = 0; i < args.length; i++) {
                filePath = this.getPathFromItem(args[i]);
                if (filePath) {
                    this.logger.info(`✅ 从参数${i}获取到路径: ${filePath}`);
                    break;
                }
            }

            // 如果还是没有路径，尝试使用当前活动编辑器的文件
            if (!filePath) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    filePath = activeEditor.document.uri.fsPath;
                    this.logger.info(`✅ 从活动编辑器获取路径: ${filePath}`);
                } else {
                    this.logger.warn('⚠️ 无法从任何来源获取文件路径，分析终止');
                    vscode.window.showErrorMessage('❌ 无法获取文件路径，请在编辑器中打开一个文件或从资源管理器右键点击');
                    return;
                }
            }

            this.logger.info(`✅ 开始分析路径: ${filePath}`);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在分析: ${filePath.split(/[/\\]/).pop()}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: '启动分析引擎...' });

                // 集成真正的AI分析服务
                const result = await this.performSmartAnalysis(filePath);

                progress.report({ increment: 100, message: '分析完成' });
                
                // 显示分析结果
                const message = `🔍 文件分析结果\n\n${result}`;
                vscode.window.showInformationMessage(message, { modal: true });
            });

            // 刷新TreeView以更新悬停提示
            this.treeProvider?.refresh();

        } catch (error) {
            this.logger.error('文件分析失败', error);
            vscode.window.showErrorMessage(`文件分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 重新分析指定路径（清除缓存）
     */
    private async handleReanalyzePathCommand(item: any): Promise<void> {
        try {
            const filePath = this.getPathFromItem(item);
            if (!filePath) return;

            this.logger.info(`重新分析路径: ${filePath}`);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `重新分析: ${filePath.split(/[/\\]/).pop()}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: '清除旧缓存...' });

                // 清除分析缓存
                await this.clearAnalysisCache(filePath);

                progress.report({ increment: 50, message: '执行新分析...' });

                // 重新分析（使用AI智能分析）
                const result = await this.performSmartAnalysis(filePath);

                progress.report({ increment: 100, message: '重新分析完成' });

                vscode.window.showInformationMessage(`✅ 重新分析完成: ${filePath.split(/[/\\]/).pop()}`);
            });

            // 刷新TreeView
            this.treeProvider?.refresh();

        } catch (error) {
            this.logger.error('重新分析失败', error);
            vscode.window.showErrorMessage(`重新分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 显示详细的分析摘要
     */
    private async handleShowAnalysisSummary(item: any): Promise<void> {
        try {
            const filePath = this.getPathFromItem(item);
            if (!filePath) return;

            this.logger.info(`显示分析摘要: ${filePath}`);

            // 获取详细分析结果
            const summary = await this.getDetailedAnalysisSummary(filePath);
            
            // 创建并显示 Webview
            const panel = vscode.window.createWebviewPanel(
                'aiExplorerAnalysis',
                `🔍 分析摘要: ${filePath.split(/[/\\]/).pop()}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = this.getAnalysisSummaryHTML(summary);

        } catch (error) {
            this.logger.error('显示分析摘要失败', error);
            vscode.window.showErrorMessage(`显示分析摘要失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 批量分析文件夹
     */
    private async handleBatchAnalyzeFolderCommand(item: any): Promise<void> {
        try {
            const folderPath = this.getPathFromItem(item);
            if (!folderPath) return;

            this.logger.info(`批量分析文件夹: ${folderPath}`);

            const confirmation = await vscode.window.showWarningMessage(
                `确定要分析文件夹 "${folderPath.split(/[/\\]/).pop()}" 中的所有文件吗？\n这可能需要较长时间。`,
                { modal: true },
                '确定分析',
                '取消'
            );

            if (confirmation !== '确定分析') {
                return;
            }

            let processed = 0;
            const startTime = Date.now();

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `批量分析: ${folderPath.split(/[/\\]/).pop()}`,
                cancellable: false
            }, async (progress) => {
                // 这里实现批量分析逻辑
                // 暂时简化，后面完善
                const files = await this.getAllFilesInFolder(folderPath);
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    progress.report({ 
                        increment: (100 / files.length),
                        message: `分析 ${file.split(/[/\\]/).pop()} (${i + 1}/${files.length})` 
                    });
                    
                    try {
                        await this.performSmartAnalysis(file);
                        processed++;
                    } catch (error) {
                        this.logger.warn(`分析文件失败: ${file}`, error);
                    }
                }
            });

            const duration = (Date.now() - startTime) / 1000;
            vscode.window.showInformationMessage(
                `✅ 批量分析完成！\n处理了 ${processed} 个文件，耗时 ${duration.toFixed(1)} 秒`
            );

            // 刷新TreeView
            this.treeProvider?.refresh();

        } catch (error) {
            this.logger.error('批量分析文件夹失败', error);
            vscode.window.showErrorMessage(`批量分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 🛠️ =============辅助方法=============

    /**
     * 🤖 智能文件分析 - 调用腾讯元宝AI
     */
    private async performSmartAnalysis(filePath: string): Promise<string> {
        try {
            if (!this.smartAnalyzer) {
                // 如果智能分析器未初始化，使用回退方法
                this.logger.warn('智能文件分析器未初始化，使用基础分析');
                return await this.performPathAnalysis(filePath);
            }

            this.logger.info(`🤖 开始AI智能分析: ${filePath}`);
            
            // 调用SmartFileAnalyzer进行AI分析
            const analysisResult: SmartAnalysisResult = await this.smartAnalyzer.analyzeFileSmartly(filePath);
            
            // 格式化分析结果
            return this.formatSmartAnalysisResult(analysisResult, filePath);
            
        } catch (error) {
            this.logger.error('AI智能分析失败，使用基础分析', error);
            // 分析失败时回退到基础分析
            return await this.performPathAnalysis(filePath);
        }
    }

    /**
     * 📊 格式化智能分析结果
     */
    private formatSmartAnalysisResult(result: SmartAnalysisResult, filePath: string): string {
        const parts: string[] = [];
        
        // 文件路径
        parts.push(`📁 路径: ${filePath}`);
        
        // AI分析的用途
        parts.push(`🤖 AI分析: ${result.purpose}`);
        
        // 详细描述
        if (result.description) {
            parts.push(`📝 详细: ${result.description}`);
        }
        
        // 技术标签
        if (result.tags?.length) {
            parts.push(`🏷️ 标签: ${result.tags.join(', ')}`);
        }
        
        // 重要性评分
        const importanceEmoji = result.importance >= 8 ? '🔥' : result.importance >= 6 ? '⭐' : '📄';
        parts.push(`${importanceEmoji} 重要性: ${result.importance}/10`);
        
        // 分析来源
        const sourceEmoji = result.source === 'ai-analysis' ? '🤖' : 
                           result.source === 'rule-based' ? '⚡' : '💾';
        const sourceName = result.source === 'ai-analysis' ? 'AI智能分析' :
                          result.source === 'rule-based' ? '规则推测' : '缓存';
        parts.push(`${sourceEmoji} 来源: ${sourceName}${result.source === 'ai-analysis' ? ' (腾讯元宝)' : ''}`);
        
        // 关键文件标识
        if (result.isKeyFile) {
            parts.push(`🎯 关键文件`);
        }
        
        // 相关文件建议
        if (result.relatedFiles?.length) {
            parts.push(`🔗 相关文件: ${result.relatedFiles.slice(0, 3).join(', ')}`);
        }
        
        // 分析时间
        parts.push(`⏰ 分析时间: ${new Date(result.analyzedAt).toLocaleString()}`);
        
        return parts.join('\n');
    }

    private getPathFromItem(item: any): string | null {
        // 详细调试：输出完整的item信息
        this.logger.info('🔍 调试getPathFromItem', {
            item: item,
            itemType: typeof item,
            itemKeys: item ? Object.keys(item) : 'null',
            itemConstructor: item?.constructor?.name,
            itemProto: item ? Object.getPrototypeOf(item)?.constructor?.name : 'null'
        });

        // VS Code右键菜单传递的URI对象
        if (item?.fsPath) {
            this.logger.debug(`从URI获取路径: ${item.fsPath}`);
            return item.fsPath;
        }
        
        // TreeView项目
        if (item?.resourceUri) {
            this.logger.debug(`从TreeView项目获取路径: ${item.resourceUri.fsPath}`);
            return item.resourceUri.fsPath;
        }
        
        // TreeItem节点
        if (item?.node?.path) {
            this.logger.debug(`从TreeItem节点获取路径: ${item.node.path}`);
            return item.node.path;
        }

        // 检查是否有path属性
        if (item?.path) {
            this.logger.debug(`从path属性获取路径: ${item.path}`);
            return item.path;
        }

        // 检查是否有uri属性
        if (item?.uri?.fsPath) {
            this.logger.debug(`从uri.fsPath获取路径: ${item.uri.fsPath}`);
            return item.uri.fsPath;
        }

        // 检查是否是vscode.Uri对象
        if (item && typeof item.toString === 'function' && item.scheme) {
            this.logger.debug(`从vscode.Uri对象获取路径: ${item.fsPath}`);
            return item.fsPath;
        }
        
        // 直接字符串路径
        if (typeof item === 'string') {
            this.logger.debug(`直接字符串路径: ${item}`);
            return item;
        }
        
        // 调试：记录无法识别的item结构
        this.logger.warn('无法从item获取路径', { 
            itemType: typeof item,
            itemKeys: item ? Object.keys(item) : 'null',
            item: item 
        });
        
        return null;
    }

    private async performPathAnalysis(filePath: string): Promise<string> {
        // 这里接入 HoverInfoService 或 AnalysisOrchestrator
        // 暂时返回简化结果
        const fs = await import('fs/promises');
        try {
            const stats = await fs.stat(filePath);
            const isFile = stats.isFile();
            const size = stats.size;
            
            let content = '';
            if (isFile && size < 100000) { // 小于100KB的文件才分析内容
                try {
                    const fileContent = await fs.readFile(filePath, 'utf-8');
                    const lines = fileContent.split('\n');
                    content = `\n📄 文件行数: ${lines.length}\n`;
                    
                    // 简单的文件类型检测
                    const ext = filePath.split('.').pop()?.toLowerCase();
                    if (ext === 'ts' || ext === 'js') {
                        const exports = fileContent.match(/export\s+(class|function|const|let|var)\s+(\w+)/g);
                        if (exports) {
                            content += `📤 导出: ${exports.length} 个\n`;
                        }
                    }
                } catch (error) {
                    content = '\n⚠️ 无法读取文件内容\n';
                }
            }

            return `📁 路径: ${filePath}\n` +
                   `📝 类型: ${isFile ? '文件' : '文件夹'}\n` +
                   `📏 大小: ${this.formatFileSize(size)}${content}\n` +
                   `⏰ 修改时间: ${stats.mtime.toLocaleString()}\n` +
                   `🔍 分析时间: ${new Date().toLocaleString()}`;
        } catch (error) {
            return `❌ 分析失败: ${error instanceof Error ? error.message : '未知错误'}`;
        }
    }

    private async clearAnalysisCache(filePath: string): Promise<void> {
        // 这里实现清除分析缓存的逻辑
        // 可以调用 AnalysisOrchestrator 的相关方法
        this.logger.info(`清除分析缓存: ${filePath}`);
    }

    private async getDetailedAnalysisSummary(filePath: string): Promise<any> {
        // 这里获取详细的分析结果
        return {
            path: filePath,
            basicInfo: await this.performPathAnalysis(filePath),
            // 可以添加更多详细信息
        };
    }

    private getAnalysisSummaryHTML(summary: any): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>AI Explorer - 分析摘要</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
                    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
                    .path { font-family: monospace; color: #0066cc; }
                    pre { background: #f0f0f0; padding: 10px; border-radius: 3px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>🔍 文件分析摘要</h1>
                <div class="summary">
                    <h3>路径</h3>
                    <div class="path">${summary.path}</div>
                    
                    <h3>基础信息</h3>
                    <pre>${summary.basicInfo}</pre>
                </div>
            </body>
            </html>
        `;
    }

    private async getAllFilesInFolder(folderPath: string): Promise<string[]> {
        const fs = await import('fs/promises');
        const path = await import('path');
        const files: string[] = [];
        
        async function scanDir(dir: string): Promise<void> {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isFile()) {
                        files.push(fullPath);
                    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        await scanDir(fullPath);
                    }
                }
            } catch (error) {
                // 忽略权限错误等
            }
        }
        
        await scanDir(folderPath);
        return files;
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // 🔍 =============文件监听器=============

    /**
     * 设置文件变更监听器，自动刷新分析缓存
     */
    private setupFileWatchers(context: vscode.ExtensionContext): void {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                this.logger.warn('没有工作区文件夹，跳过文件监听器设置');
                return;
            }

            // 创建分析刷新队列（去重、防抖）
            const analysisQueue = new Map<string, NodeJS.Timeout>();
            const DEBOUNCE_DELAY = 500; // 500ms 防抖

            const scheduleAnalysisRefresh = (filePath: string) => {
                // 过滤掉不需要分析的文件
                if (this.shouldIgnoreFile(filePath)) {
                    return;
                }

                // 清除之前的定时器
                const existingTimer = analysisQueue.get(filePath);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                // 设置新的防抖定时器
                const timer = setTimeout(async () => {
                    try {
                        this.logger.info(`文件变更，刷新分析: ${filePath}`);
                        await this.refreshAnalysisForPath(filePath);
                        analysisQueue.delete(filePath);
                    } catch (error) {
                        this.logger.error(`刷新分析失败: ${filePath}`, error);
                        analysisQueue.delete(filePath);
                    }
                }, DEBOUNCE_DELAY);

                analysisQueue.set(filePath, timer);
            };

            // 1. 监听文档保存事件
            const onDidSaveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
                scheduleAnalysisRefresh(document.uri.fsPath);
            });
            context.subscriptions.push(onDidSaveDisposable);

            // 2. 监听文件重命名事件
            const onDidRenameDisposable = vscode.workspace.onDidRenameFiles((event) => {
                event.files.forEach(({ oldUri, newUri }) => {
                    // 清除旧路径的缓存
                    this.clearAnalysisCache(oldUri.fsPath);
                    // 分析新路径
                    scheduleAnalysisRefresh(newUri.fsPath);
                });
            });
            context.subscriptions.push(onDidRenameDisposable);

            // 3. 监听文件删除事件
            const onDidDeleteDisposable = vscode.workspace.onDidDeleteFiles((event) => {
                event.files.forEach(({ fsPath }) => {
                    this.clearAnalysisCache(fsPath);
                });
            });
            context.subscriptions.push(onDidDeleteDisposable);

            // 4. 创建文件系统监听器（监听整个工作区）
            const fileWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(workspaceFolder, '**/*'),
                false, // 不忽略创建
                false, // 不忽略变更  
                false  // 不忽略删除
            );

            // 监听文件创建
            fileWatcher.onDidCreate((uri) => {
                scheduleAnalysisRefresh(uri.fsPath);
            });

            // 监听文件变更
            fileWatcher.onDidChange((uri) => {
                scheduleAnalysisRefresh(uri.fsPath);
            });

            // 监听文件删除
            fileWatcher.onDidDelete((uri) => {
                this.clearAnalysisCache(uri.fsPath);
                // 清除队列中的任务
                const timer = analysisQueue.get(uri.fsPath);
                if (timer) {
                    clearTimeout(timer);
                    analysisQueue.delete(uri.fsPath);
                }
            });

            context.subscriptions.push(fileWatcher);

            this.logger.info('文件变更监听器设置完成');

        } catch (error) {
            this.logger.error('设置文件监听器失败', error);
        }
    }

    /**
     * 判断是否应该忽略某个文件的分析
     */
    private shouldIgnoreFile(filePath: string): boolean {
        const ignoredPatterns = [
            /node_modules/,
            /\.git/,
            /dist/,
            /out/,
            /build/,
            /coverage/,
            /\.vscode/,
            /\.idea/,
            /\.DS_Store/,
            /\.log$/,
            /\.tmp$/,
            /\.cache$/,
            // 🛡️ 排除内部缓存文件，避免循环刷新
            /\.ai-explorer-cache/,
            /analysis[\/\\]\.ai[\/\\]cache\.jsonl/,
            /\.db-shm$/,  // SQLite共享内存文件
            /\.db-wal$/,  // SQLite写前日志文件
            /\.lock$/,    // Git锁文件
            // 媒体文件
            /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i,
            /\.(mp4|avi|mov|wmv|flv|webm)$/i,
            // 压缩文件
            /\.(zip|rar|7z|tar|gz|bz2)$/i,
            // 二进制文件
            /\.(exe|dll|so|dylib)$/i,
            // 文档文件
            /\.(pdf|doc|docx|xls|xlsx)$/i
        ];

        return ignoredPatterns.some(pattern => pattern.test(filePath));
    }

    /**
     * 刷新指定路径的分析缓存
     */
    private async refreshAnalysisForPath(filePath: string): Promise<void> {
        try {
            // 🔄 文件变更时，仅标记分析过期，不自动触发AI请求
            this.logger.info(`文件变更检测: ${filePath} - 标记分析结果需要更新`);
            
            // 1. 标记缓存过期（但不删除，让用户决定是否刷新）
            await this.markAnalysisAsStale(filePath);
            
            // 2. 显示用户提示（可选的通知）
            await this.showFileChangedNotification(filePath);
            
            // 3. 使用防抖刷新TreeView，避免频繁UI更新
            this.debouncedRefresh();
            
        } catch (error) {
            this.logger.error(`处理文件变更失败: ${filePath}`, error);
        }
    }

    /**
     * 🔄 处理手动刷新分析命令
     */
    private async handleRefreshAnalysis(item?: any): Promise<void> {
        try {
            const path = this.getPathFromItem(item);
            if (!path) {
                vscode.window.showErrorMessage('无法获取文件路径');
                return;
            }

            // 显示进度提示
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在刷新AI分析...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: `分析 ${require('path').basename(path)}` });
                
                await this.performManualRefresh(path);
                
                progress.report({ increment: 100, message: '完成' });
            });

        } catch (error) {
            this.logger.error('刷新分析失败', error);
            vscode.window.showErrorMessage(`刷新分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 📝 标记分析结果为过期状态
     */
    private async markAnalysisAsStale(filePath: string): Promise<void> {
        try {
            const { HoverInfoService } = await import('./ui/HoverInfoService');
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
                const hoverService = HoverInfoService.getInstance(workspaceRoot, this.extensionContext);
                await hoverService.markAsStale(filePath);
            }
        } catch (error) {
            this.logger.warn(`标记分析过期失败: ${filePath}`, error);
        }
    }

    /**
     * 💬 显示文件变更提示或自动刷新（可配置）
     */
    private async showFileChangedNotification(filePath: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('ai-explorer');
        const autoRefresh = config.get<boolean>('autoRefreshOnFileChange', false);
        const showNotifications = config.get<boolean>('showFileChangeNotifications', false);
        
        // 如果启用了自动刷新（不推荐）
        if (autoRefresh) {
            this.logger.warn(`⚠️ 自动刷新已启用，将自动请求AI分析: ${filePath}`);
            await this.performManualRefresh(filePath);
            return;
        }
        
        // 显示通知让用户选择
        if (!showNotifications) {
            return;
        }

        const fileName = require('path').basename(filePath);
        const action = await vscode.window.showInformationMessage(
            `📝 文件 ${fileName} 已修改，分析结果可能过期`,
            '🔄 立即刷新', '⚙️ 设置', '❌ 忽略'
        );

        switch (action) {
            case '🔄 立即刷新':
                await this.performManualRefresh(filePath);
                break;
            case '⚙️ 设置':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'aiExplorer.showFileChangeNotifications');
                break;
            // 忽略则什么都不做
        }
    }

    /**
     * 🔄 执行手动刷新（用户主动触发）
     */
    private async performManualRefresh(filePath: string): Promise<void> {
        try {
            // 🆕 使用新的 SmartFileAnalyzer 而不是旧的 HoverInfoService
            if (this.smartAnalyzer) {
                this.logger.info(`🔄 使用 SmartFileAnalyzer 刷新分析: ${filePath}`);
                await this.smartAnalyzer.analyzeFileSmartly(filePath);
                this.treeProvider?.refresh();
                
                const fileName = require('path').basename(filePath);
                vscode.window.showInformationMessage(`✅ ${fileName} 分析已更新`);
            } else {
                // Fallback 到旧系统（但这不应该发生）
                this.logger.warn('SmartFileAnalyzer 未初始化，使用旧系统');
                const { HoverInfoService } = await import('./ui/HoverInfoService');
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceRoot) {
                    const hoverService = HoverInfoService.getInstance(workspaceRoot, this.extensionContext);
                    await hoverService.refresh(filePath);
                    this.treeProvider?.refresh();
                    
                    const fileName = require('path').basename(filePath);
                    vscode.window.showInformationMessage(`✅ ${fileName} 分析已更新`);
                }
            }

        } catch (error) {
            throw error; // 重新抛出，由上层处理
        }
    }
}