// src/features/uml-canvas/UMLCanvasModule.ts
// [module: uml-canvas] [tags: AST, IR, Layout, Webview, Canvas]
/**
 * UML 图表模块主入口
 * 负责代码解析、图表生成和画布显示
 */

import * as vscode from 'vscode';
import { BaseModule } from '@shared/base/BaseModule';
import { DIContainer } from '@core/di/Container';
import { OpenAIClient } from '@core/ai/OpenAIClient';
import { KVCache } from '@core/cache/KVCache';
import { GenerateUMLUseCase } from './app/usecases/GenerateUMLUseCase';
import { UMLCanvasPanel } from './panel/UMLCanvasPanel';

export class UMLCanvasModule extends BaseModule {
    private generateUseCase?: GenerateUMLUseCase;

    constructor(container: DIContainer) {
        super(container, 'uml-canvas');
    }

    async activate(context: vscode.ExtensionContext): Promise<void> {
        this.logger.info('UML 图表模块正在激活...');

        // 注册服务到 DI 容器
        this.registerServices(context);

        // 注册命令
        this.registerCommands(context);

        this.logger.info('UML 图表模块激活完成');
    }

    private registerServices(context: vscode.ExtensionContext): void {
        // 确保 OpenAI 客户端已注册
        if (!this.container.has('openaiClient')) {
            this.container.registerSingleton('openaiClient', () => 
                new OpenAIClient(this.logger));
        }

        // 确保缓存服务已注册
        if (!this.container.has('kvCache')) {
            this.container.registerSingleton('kvCache', () => 
                new KVCache(context, this.logger));
        }

        // 注册 UML 生成用例
        this.container.registerSingleton('generateUMLUseCase', () => {
            const aiClient = this.container.get<OpenAIClient>('openaiClient');
            const cache = this.container.get<KVCache>('kvCache');
            return new GenerateUMLUseCase(this.logger, aiClient, cache);
        });

        this.generateUseCase = this.container.get<GenerateUMLUseCase>('generateUMLUseCase');

        this.logger.debug('UML-Canvas 模块服务注册完成');
    }

    private registerCommands(context: vscode.ExtensionContext): void {
        // 从文件生成 UML 图表命令
        this.registerCommand(context, 'umlCanvas.generateFromFile', async (uri?: vscode.Uri) => {
            await this.handleGenerateFromFile(uri, context);
        });

        // 打开 UML 画布命令
        this.registerCommand(context, 'umlCanvas.openCanvas', () => {
            this.handleOpenCanvas(context);
        });

        this.logger.debug('UML-Canvas 命令注册完成');
    }

    private async handleGenerateFromFile(uri?: vscode.Uri, context?: vscode.ExtensionContext): Promise<void> {
        try {
            // 如果没有提供 URI，尝试从当前活动编辑器获取
            if (!uri && vscode.window.activeTextEditor) {
                uri = vscode.window.activeTextEditor.document.uri;
            }

            if (!uri) {
                vscode.window.showErrorMessage('请选择一个代码文件');
                return;
            }

            this.logger.info('从文件生成 UML 图表', uri.fsPath);

            if (!this.generateUseCase) {
                vscode.window.showErrorMessage('UML 生成服务未初始化');
                return;
            }

            // 显示进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在生成 UML 图表...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: '分析代码结构...' });

                const umlGraph = await this.generateUseCase!.generateFromFile(uri!);
                
                progress.report({ increment: 50, message: '创建画布...' });

                // 创建或显示画布面板
                const panel = UMLCanvasPanel.createOrShow(context!.extensionUri, this.logger);
                
                progress.report({ increment: 80, message: '渲染图表...' });

                // 显示 UML 图表
                panel.showUMLGraph(umlGraph);

                progress.report({ increment: 100, message: '完成' });

                vscode.window.showInformationMessage(
                    `UML 图表生成完成：${umlGraph.nodes.length} 个节点，${umlGraph.edges.length} 条关系`);
            });

        } catch (error) {
            this.logger.error('生成 UML 图表失败', error);
            vscode.window.showErrorMessage(
                `生成 UML 图表失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private handleOpenCanvas(context: vscode.ExtensionContext): void {
        try {
            this.logger.info('打开 UML 画布');
            
            // 创建或显示画布面板
            UMLCanvasPanel.createOrShow(context.extensionUri, this.logger);
            
            vscode.window.showInformationMessage('UML 画布已打开');

        } catch (error) {
            this.logger.error('打开 UML 画布失败', error);
            vscode.window.showErrorMessage(
                `打开 UML 画布失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}