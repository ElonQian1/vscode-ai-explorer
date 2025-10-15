// src/features/filetree-blueprint/panel/BlueprintPanel.ts
// [module: filetree-blueprint] [tags: Webview, Panel]
/**
 * 蓝图面板管理器
 * 负责创建和管理 Webview 面板，处理前后端消息通信
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../../core/logging/Logger';
import { Graph, Node } from '../domain/FileTreeScanner';

export class BlueprintPanel {
    private static currentPanel: BlueprintPanel | undefined;
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private logger: Logger;
    private currentGraph?: Graph;
    private extensionUri: vscode.Uri;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        logger: Logger
    ) {
        this.panel = panel;
        this.logger = logger;
        this.extensionUri = extensionUri;

        // 设置 HTML 内容
        this.panel.webview.html = this.getHtmlContent(extensionUri);

        // 监听面板销毁
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // 处理来自 Webview 的消息
        this.panel.webview.onDidReceiveMessage(
            (message) => this.handleMessage(message),
            null,
            this.disposables
        );
    }

    /**
     * 创建或显示蓝图面板
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        logger: Logger,
        title: string = '文件树蓝图'
    ): BlueprintPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 如果已有面板，直接显示
        if (BlueprintPanel.currentPanel) {
            BlueprintPanel.currentPanel.panel.reveal(column);
            return BlueprintPanel.currentPanel;
        }

        // 创建新面板
        const panel = vscode.window.createWebviewPanel(
            'fileTreeBlueprint',
            title,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out')
                ]
            }
        );

        BlueprintPanel.currentPanel = new BlueprintPanel(panel, extensionUri, logger);
        return BlueprintPanel.currentPanel;
    }

    /**
     * 显示图表数据
     */
    public showGraph(graph: Graph): void {
        this.currentGraph = graph;
        this.panel.title = graph.title;
        
        this.panel.webview.postMessage({
            type: 'init-graph',
            payload: graph
        });

        this.logger.info(`显示蓝图: ${graph.title} (${graph.nodes.length} 个节点)`);
    }

    /**
     * 处理来自 Webview 的消息
     */
    private async handleMessage(message: any): Promise<void> {
        this.logger.debug(`收到 Webview 消息: ${message.type}`);

        switch (message.type) {
            case 'ready':
                // Webview 已就绪
                if (this.currentGraph) {
                    this.showGraph(this.currentGraph);
                }
                break;

            case 'node-click':
                await this.handleNodeClick(message.payload);
                break;

            case 'node-double-click':
                await this.handleNodeDoubleClick(message.payload);
                break;

            case 'open-file':
                await this.openFile(message.payload.path);
                break;

            case 'reveal-in-explorer':
                await this.revealInExplorer(message.payload.path);
                break;

            case 'go-up':
                await this.handleGoUpDirectory(message.payload.currentPath);
                break;

            case 'error':
                this.logger.error('Webview 错误:', message.payload);
                vscode.window.showErrorMessage(`蓝图错误: ${message.payload.message}`);
                break;

            default:
                this.logger.warn(`未知消息类型: ${message.type}`);
        }
    }

    /**
     * 处理节点点击
     */
    private async handleNodeClick(nodeData: any): Promise<void> {
        this.logger.debug(`节点被点击: ${nodeData.label}`);
        // 可以在状态栏显示节点信息
        vscode.window.setStatusBarMessage(`选中: ${nodeData.label}`, 3000);
    }

    /**
     * 处理节点双击（文件夹下钻）
     */
    private async handleNodeDoubleClick(nodeData: any): Promise<void> {
        this.logger.info(`节点被双击: ${nodeData.label} (${nodeData.type})`);

        if (nodeData.type === 'folder' && nodeData.data?.path) {
            // 如果是根节点，提示用户
            if (nodeData.data?.isRoot) {
                vscode.window.showInformationMessage(
                    `当前已在 "${nodeData.label}" 目录中。双击子文件夹可下钻，点击"返回上级"可返回。`
                );
                return;
            }
            
            // 下钻到子文件夹：重新生成该文件夹的蓝图
            const folderPath = nodeData.data.path;
            
            // 获取工作区根目录
            const workspaceRoot = this.currentGraph?.metadata?.workspaceRoot;
            if (!workspaceRoot) {
                this.logger.warn('无法获取工作区根目录，使用绝对路径');
                // 使用绝对路径
                vscode.commands.executeCommand(
                    'filetreeBlueprint.openFromPath',
                    vscode.Uri.file(folderPath)
                );
                return;
            }

            // 构造完整路径
            const fullPath = path.join(workspaceRoot, folderPath);
            this.logger.info(`下钻到: ${fullPath}`);
            
            vscode.commands.executeCommand(
                'filetreeBlueprint.openFromPath',
                vscode.Uri.file(fullPath)
            );
            
        } else if (nodeData.type === 'file' && nodeData.data?.path) {
            // 如果是文件，打开该文件
            await this.openFile(nodeData.data.path);
        }
    }

    /**
     * 处理返回上级目录
     */
    private async handleGoUpDirectory(currentPath: string): Promise<void> {
        this.logger.info(`返回上级目录，当前路径: ${currentPath}`);
        
        try {
            const workspaceRoot = this.currentGraph?.metadata?.workspaceRoot;
            
            if (!workspaceRoot) {
                vscode.window.showWarningMessage('无法确定工作区根目录');
                return;
            }

            // 如果已经是根目录，不能再往上
            if (currentPath === workspaceRoot || currentPath === '/') {
                vscode.window.showInformationMessage('已到达工作区根目录');
                return;
            }

            // 计算父目录
            const parentPath = path.dirname(currentPath);
            
            // 防止超出工作区根目录
            if (parentPath.length < workspaceRoot.length) {
                this.logger.warn('尝试超出工作区根目录');
                vscode.commands.executeCommand(
                    'filetreeBlueprint.openFromPath',
                    vscode.Uri.file(workspaceRoot)
                );
                return;
            }

            // 打开父目录的蓝图
            this.logger.info(`返回到父目录: ${parentPath}`);
            vscode.commands.executeCommand(
                'filetreeBlueprint.openFromPath',
                vscode.Uri.file(parentPath)
            );
            
        } catch (error) {
            this.logger.error('返回上级失败', error);
            vscode.window.showErrorMessage('无法返回上级目录');
        }
    }

    /**
     * 打开文件
     */
    private async openFile(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: false });
            this.logger.info(`打开文件: ${filePath}`);
        } catch (error) {
            this.logger.error(`打开文件失败: ${filePath}`, error);
            vscode.window.showErrorMessage(`无法打开文件: ${path.basename(filePath)}`);
        }
    }

    /**
     * 在资源管理器中显示
     */
    private async revealInExplorer(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.commands.executeCommand('revealInExplorer', uri);
            this.logger.info(`在资源管理器中显示: ${filePath}`);
        } catch (error) {
            this.logger.error(`显示失败: ${filePath}`, error);
        }
    }

    /**
     * 生成 HTML 内容
     */
    private getHtmlContent(extensionUri: vscode.Uri): string {
        const webview = this.panel.webview;

        // 资源 URI
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'filetree-blueprint', 'graphView.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'filetree-blueprint', 'index.css')
        );

        // 生成 nonce 用于 CSP
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>文件树蓝图</title>
</head>
<body>
    <div class="toolbar">
        <button id="btn-reset-view" title="重置视图">🔄 重置</button>
        <button id="btn-fit-view" title="适应窗口">📐 适应</button>
        <button id="btn-zoom-in" title="放大">🔍+</button>
        <button id="btn-zoom-out" title="缩小">🔍-</button>
        <span id="node-count" style="margin-left: 16px;">节点: 0</span>
        <span id="edge-count">边: 0</span>
        <span style="opacity: 0.6; margin-left: 16px; font-size: 11px;">💡 双击文件夹下钻 | 拖拽节点 | 空格+拖拽平移 | 滚轮缩放</span>
    </div>
    <div id="canvasWrap">
        <div id="canvas">
            <div id="nodes"></div>
            <svg class="edges"></svg>
        </div>
    </div>
    <div id="breadcrumb"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * 生成随机 nonce
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
     * 清理资源
     */
    public dispose(): void {
        BlueprintPanel.currentPanel = undefined;

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        this.logger.info('蓝图面板已关闭');
    }
}
