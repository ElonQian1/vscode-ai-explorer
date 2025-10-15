// src/features/filetree-blueprint/app/usecases/GenerateBlueprintUseCase.ts
// [module: filetree-blueprint] [tags: UseCase, Application]
/**
 * 生成蓝图用例
 * 业务逻辑：协调扫描器和面板，完成从路径到蓝图的完整流程
 */

import * as vscode from 'vscode';
import { Logger } from '../../../../core/logging/Logger';
import { FileTreeScanner, Graph } from '../../domain/FileTreeScanner';
import { BlueprintPanel } from '../../panel/BlueprintPanel';

export class GenerateBlueprintUseCase {
    private scanner: FileTreeScanner;
    private logger: Logger;
    private extensionUri: vscode.Uri;

    constructor(logger: Logger, extensionUri: vscode.Uri) {
        this.logger = logger;
        this.extensionUri = extensionUri;
        this.scanner = new FileTreeScanner(logger);
    }

    /**
     * 从工作区路径生成蓝图（浅层扫描模式）
     */
    async executeFromPath(uri: vscode.Uri, title?: string, useShallow: boolean = true): Promise<void> {
        try {
            // 验证 URI 方案
            if (uri.scheme !== 'file') {
                this.logger.error(`不支持的 URI 方案: ${uri.scheme}, URI: ${uri.toString()}`);
                vscode.window.showErrorMessage(
                    `无法生成蓝图：不支持 "${uri.scheme}:" 类型的资源。\n请选择文件系统中的文件或文件夹。`
                );
                return;
            }

            this.logger.info(`开始生成蓝图: ${uri.fsPath} (浅层模式: ${useShallow})`);

            // 验证路径存在
            try {
                await vscode.workspace.fs.stat(uri);
            } catch (error) {
                this.logger.error(`路径不存在或无法访问: ${uri.fsPath}`, error);
                vscode.window.showErrorMessage(
                    `无法访问路径: ${uri.fsPath}\n请确保文件或文件夹存在。`
                );
                return;
            }

            // 获取工作区根目录
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const workspaceRoot = workspaceFolder?.uri;

            // 显示进度
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: useShallow ? '正在生成文件树蓝图（当前目录）...' : '正在生成文件树蓝图（递归扫描）...',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0, message: '扫描文件系统...' });

                    // 根据模式选择扫描方式
                    const graph = useShallow
                        ? await this.scanner.scanPathShallow(uri, workspaceRoot)
                        : await this.scanner.scanPath(uri, title);

                    progress.report({ increment: 50, message: '生成可视化...' });

                    // 创建或显示面板
                    const panel = BlueprintPanel.createOrShow(
                        this.extensionUri,
                        this.logger,
                        graph.title
                    );

                    // 显示图表
                    panel.showGraph(graph);

                    progress.report({ increment: 100, message: '完成!' });
                }
            );

            this.logger.info('蓝图生成完成');
        } catch (error) {
            this.logger.error('生成蓝图失败', error);
            vscode.window.showErrorMessage(
                `生成蓝图失败: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * 从整个工作区生成蓝图
     */
    async executeFromWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('未打开工作区');
            return;
        }

        // 如果有多个工作区文件夹，让用户选择
        let targetFolder: vscode.WorkspaceFolder;
        
        if (workspaceFolders.length === 1) {
            targetFolder = workspaceFolders[0];
        } else {
            const picked = await vscode.window.showQuickPick(
                workspaceFolders.map(folder => ({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    folder
                })),
                { placeHolder: '选择要扫描的工作区文件夹' }
            );

            if (!picked) {
                return;
            }

            targetFolder = picked.folder;
        }

        await this.executeFromPath(
            targetFolder.uri,
            `工作区蓝图: ${targetFolder.name}`
        );
    }

    /**
     * 从 JSON/Markdown 文件打开图表
     */
    async executeFromDocument(document: vscode.TextDocument): Promise<void> {
        try {
            this.logger.info(`从文档解析图表: ${document.fileName}`);

            const content = document.getText();
            const languageId = document.languageId;

            let parseResult: { ok: boolean; graph?: Graph; error?: string };

            // 根据文件类型选择解析方式
            if (languageId === 'json' || languageId === 'jsonc') {
                parseResult = this.scanner.parseGraphFromJson(content);
            } else if (languageId === 'markdown') {
                parseResult = this.scanner.parseGraphFromMarkdown(content);
            } else {
                vscode.window.showWarningMessage(
                    '请打开 JSON 或包含 ```flowjson 代码块的 Markdown 文件'
                );
                return;
            }

            if (!parseResult.ok || !parseResult.graph) {
                vscode.window.showErrorMessage(`解析失败: ${parseResult.error}`);
                return;
            }

            // 创建或显示面板
            const panel = BlueprintPanel.createOrShow(
                this.extensionUri,
                this.logger,
                parseResult.graph.title
            );

            // 显示图表
            panel.showGraph(parseResult.graph);

            this.logger.info('图表显示完成');
        } catch (error) {
            this.logger.error('从文档打开图表失败', error);
            vscode.window.showErrorMessage(
                `打开图表失败: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}
