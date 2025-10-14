// src/features/uml-canvas/panel/UMLCanvasPanel.ts
// [module: uml-canvas] [tags: Webview, Panel, Canvas, UI]
/**
 * UML 画布面板管理器
 * 管理 Webview 面板的创建、通信和生命周期
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../../core/logging/Logger';
import { UMLGraph } from '../../../shared/types';

export class UMLCanvasPanel {
    public static currentPanel: UMLCanvasPanel | undefined;
    private static readonly viewType = 'umlCanvas';

    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, logger: Logger): UMLCanvasPanel {
        const column = vscode.window.activeTextEditor?.viewColumn;

        // 如果已经有面板打开，就显示它
        if (UMLCanvasPanel.currentPanel) {
            UMLCanvasPanel.currentPanel.panel.reveal(column);
            return UMLCanvasPanel.currentPanel;
        }

        // 创建新的面板
        const panel = vscode.window.createWebviewPanel(
            UMLCanvasPanel.viewType,
            'UML 画布',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview'),
                    vscode.Uri.joinPath(extensionUri, 'out', 'webview')
                ],
                retainContextWhenHidden: true // 保持状态
            }
        );

        UMLCanvasPanel.currentPanel = new UMLCanvasPanel(panel, extensionUri, logger);
        return UMLCanvasPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly logger: Logger
    ) {
        this.panel = panel;

        // 设置面板图标
        this.panel.iconPath = {
            light: vscode.Uri.joinPath(extensionUri, 'resources', 'light', 'uml.svg'),
            dark: vscode.Uri.joinPath(extensionUri, 'resources', 'dark', 'uml.svg')
        };

        // 设置初始 HTML
        this.update();

        // 监听面板关闭事件
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // 监听面板状态变化
        this.panel.onDidChangeViewState(
            e => {
                if (this.panel.visible) {
                    this.update();
                }
            },
            null,
            this.disposables
        );

        // 处理来自 webview 的消息
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );

        this.logger.info('UML 画布面板已创建');
    }

    /**
     * 显示 UML 图表
     */
    public showUMLGraph(umlGraph: UMLGraph): void {
        this.logger.info(`显示 UML 图表: ${umlGraph.nodes.length} 个节点`);
        
        this.panel.webview.postMessage({
            type: 'showUML',
            data: umlGraph
        });
    }

    /**
     * 更新画布布局
     */
    public updateLayout(layoutType: 'hierarchical' | 'force' | 'grid'): void {
        this.logger.info(`更新布局类型: ${layoutType}`);
        
        this.panel.webview.postMessage({
            type: 'updateLayout',
            data: { layoutType }
        });
    }

    /**
     * 导出图表
     */
    public async exportDiagram(format: 'png' | 'svg' | 'pdf'): Promise<void> {
        this.logger.info(`导出图表，格式: ${format}`);
        
        return new Promise((resolve, reject) => {
            const messageHandler = (message: any) => {
                if (message.type === 'exportResult') {
                    // 处理导出结果
                    this.handleExportResult(message.data, format)
                        .then(resolve)
                        .catch(reject);
                }
            };

            // 临时监听导出结果
            const disposable = this.panel.webview.onDidReceiveMessage(messageHandler);
            
            // 发送导出请求
            this.panel.webview.postMessage({
                type: 'exportDiagram',
                data: { format }
            });

            // 10秒超时
            setTimeout(() => {
                disposable.dispose();
                reject(new Error('导出超时'));
            }, 10000);
        });
    }

    /**
     * 处理来自 webview 的消息
     */
    private async handleMessage(message: any): Promise<void> {
        try {
            switch (message.type) {
                case 'ready':
                    this.logger.info('Webview 已准备就绪');
                    break;

                case 'nodeClick':
                    this.logger.info('节点被点击', message.data);
                    await this.handleNodeClick(message.data);
                    break;

                case 'nodeDoubleClick':
                    this.logger.info('节点被双击', message.data);
                    await this.handleNodeDoubleClick(message.data);
                    break;

                case 'layoutChanged':
                    this.logger.info('布局已更改', message.data);
                    break;

                case 'error':
                    this.logger.error('Webview 错误', message.data);
                    vscode.window.showErrorMessage(`UML 画布错误: ${message.data.message}`);
                    break;

                default:
                    this.logger.warn('未知消息类型', message);
            }
        } catch (error) {
            this.logger.error('处理 webview 消息失败', error);
        }
    }

    /**
     * 处理节点点击事件
     */
    private async handleNodeClick(nodeData: any): Promise<void> {
        // 可以在这里实现节点点击的逻辑
        // 比如显示节点详情、跳转到源代码等
    }

    /**
     * 处理节点双击事件
     */
    private async handleNodeDoubleClick(nodeData: any): Promise<void> {
        // 实现双击跳转到源代码的逻辑
        if (nodeData.filePath && nodeData.line) {
            const uri = vscode.Uri.file(nodeData.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            
            // 跳转到指定行
            const position = new vscode.Position(nodeData.line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        }
    }

    /**
     * 处理导出结果
     */
    private async handleExportResult(data: any, format: string): Promise<void> {
        try {
            if (data.error) {
                throw new Error(data.error);
            }

            // 让用户选择保存位置
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`uml-diagram.${format}`),
                filters: {
                    'Images': ['png', 'svg'],
                    'Documents': ['pdf'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                // 保存文件
                const buffer = Buffer.from(data.content, 'base64');
                await vscode.workspace.fs.writeFile(saveUri, buffer);
                
                vscode.window.showInformationMessage(`图表已保存到: ${saveUri.fsPath}`);
                this.logger.info(`图表已导出: ${saveUri.fsPath}`);
            }

        } catch (error) {
            this.logger.error('导出处理失败', error);
            vscode.window.showErrorMessage(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 更新 webview HTML 内容
     */
    private update(): void {
        const webview = this.panel.webview;
        this.panel.webview.html = this.getWebviewContent(webview);
    }

    /**
     * 生成 webview HTML 内容
     */
    private getWebviewContent(webview: vscode.Webview): string {
        // 获取资源 URI
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'main.css')
        );

        // 生成随机 nonce 用于安全策略
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>UML 画布</title>
</head>
<body>
    <div id="app">
        <div id="toolbar">
            <button id="layout-hierarchical" class="layout-btn active">层次布局</button>
            <button id="layout-force" class="layout-btn">力导向布局</button>
            <button id="layout-grid" class="layout-btn">网格布局</button>
            <div class="separator"></div>
            <button id="export-png" class="export-btn">导出 PNG</button>
            <button id="export-svg" class="export-btn">导出 SVG</button>
            <button id="fit-view" class="action-btn">适应窗口</button>
        </div>
        <div id="canvas-container">
            <div id="uml-canvas"></div>
        </div>
        <div id="status-bar">
            <span id="node-count">节点: 0</span>
            <span id="edge-count">边: 0</span>
            <span id="zoom-level">缩放: 100%</span>
        </div>
    </div>
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
    private dispose(): void {
        UMLCanvasPanel.currentPanel = undefined;

        // 清理 disposables
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        this.logger.info('UML 画布面板已关闭');
    }
}