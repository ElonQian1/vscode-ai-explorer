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
import { FileAnalysisService } from '../../file-analysis/FileAnalysisService';
import {
    WebviewToExtension,
    ExtensionToWebview,
    createShowAnalysisCardMessage,
    createUpdateAnalysisCardMessage,
    createAnalysisErrorMessage
} from '../../../shared/messages';

export class BlueprintPanel {
    private static currentPanel: BlueprintPanel | undefined;
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private logger: Logger;
    private currentGraph?: Graph;
    private extensionUri: vscode.Uri;
    private statusBarItem?: vscode.StatusBarItem;
    private fileAnalysisService: FileAnalysisService;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        logger: Logger
    ) {
        this.panel = panel;
        this.logger = logger;
        this.extensionUri = extensionUri;
        this.fileAnalysisService = new FileAnalysisService(logger);

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

        // 显示状态栏提示
        this.showStatusBarHint();
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
        
        this.sendMessage({
            type: 'init-graph',
            payload: graph
        });

        this.logger.info(`显示蓝图: ${graph.title} (${graph.nodes.length} 个节点)`);
    }

    /**
     * 发送消息到 Webview (类型安全)
     */
    private sendMessage(message: ExtensionToWebview): void {
        this.panel.webview.postMessage(message);
    }

    /**
     * 处理来自 Webview 的消息
     * 使用类型安全的消息契约
     */
    private async handleMessage(message: WebviewToExtension): Promise<void> {
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

            case 'drill':
                // 下钻到子文件夹
                await this.handleDrill(message.payload);
                break;

            case 'drill-up':
                // 返回上一级
                await this.handleDrillUp();
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

            case 'analyze-file':
                // 分析文件并返回FileCapsule
                await this.handleAnalyzeFile(message.payload);
                break;

            case 'analysis-card-shown':
                // ✅ ACK: Webview确认已显示卡片
                this.logger.info(`[ACK] Webview 已显示卡片: ${message.payload?.file}`);
                break;

            case 'open-source':
                // 打开源文件并跳转到指定行
                await this.handleOpenSource(message.payload);
                break;

            case 'node-moved':
                // 处理节点移动（手写图等场景）
                // 对于文件树蓝图,这个消息通常不需要处理
                this.logger.debug(`节点移动: ${message.payload.nodeId}`, message.payload.position);
                break;

            case 'error':
                this.logger.error('Webview 错误:', message.payload);
                vscode.window.showErrorMessage(`蓝图错误: ${message.payload.message}`);
                break;

            default:
                // TypeScript 确保所有消息类型都被处理
                const exhaustiveCheck: never = message;
                this.logger.warn(`未知消息类型:`, exhaustiveCheck);
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
            
            // 下钻到子文件夹：data.path 已经是完整的绝对路径
            const folderPath = nodeData.data.path;
            
            this.logger.info(`下钻到: ${folderPath}`);
            
            // 直接使用绝对路径，不需要拼接
            vscode.commands.executeCommand(
                'filetreeBlueprint.openFromPath',
                vscode.Uri.file(folderPath)
            );
            
        } else if (nodeData.type === 'file' && nodeData.data?.path) {
            // 如果是文件，打开该文件
            await this.openFile(nodeData.data.path);
        }
    }

    /**
     * 处理下钻到子文件夹（在同一面板内刷新）
     */
    private async handleDrill(payload: any): Promise<void> {
        const folderPath = payload?.path;
        
        this.logger.info(`[handleDrill] 收到下钻请求, payload:`, payload);
        this.logger.info(`[handleDrill] 提取的 folderPath:`, folderPath);
        
        if (!folderPath) {
            this.logger.warn('下钻消息缺少路径信息');
            return;
        }

        this.logger.info(`下钻到: ${folderPath}`);

        try {
            // 重新扫描子文件夹
            const uri = vscode.Uri.file(folderPath);
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const workspaceRoot = workspaceFolder?.uri;

            if (!workspaceRoot) {
                this.logger.warn('无法确定工作区根目录');
                return;
            }

            // 使用 FileTreeScanner 扫描子目录
            const { FileTreeScanner } = await import('../domain/FileTreeScanner');
            const scanner = new FileTreeScanner(this.logger);
            const graph = await scanner.scanPathShallow(uri, workspaceRoot);

            // 在同一面板显示新图
            this.showGraph(graph);
            this.panel.title = `蓝图: ${path.basename(folderPath)}`;

            this.logger.info(`已刷新到子目录: ${folderPath}`);
        } catch (error) {
            this.logger.error('下钻失败', error);
            vscode.window.showErrorMessage(`无法打开文件夹: ${folderPath}`);
        }
    }

    /**
     * 处理返回上一级（在同一面板内刷新）
     */
    private async handleDrillUp(): Promise<void> {
        const currentPath = this.currentGraph?.metadata?.rootPath;
        
        if (!currentPath) {
            this.logger.warn('无法确定当前路径');
            return;
        }

        const workspaceRoot = this.currentGraph?.metadata?.workspaceRoot;
        
        if (!workspaceRoot) {
            vscode.window.showWarningMessage('无法确定工作区根目录');
            return;
        }

        // 如果已经是根目录，不能再往上
        if (currentPath === workspaceRoot) {
            vscode.window.showInformationMessage('已到达工作区根目录');
            return;
        }

        // 计算父目录
        const parentPath = path.dirname(currentPath);
        
        // 防止超出工作区根目录
        if (parentPath.length < workspaceRoot.length) {
            this.logger.warn('尝试超出工作区根目录，返回到工作区根');
            const uri = vscode.Uri.file(workspaceRoot);
            
            const { FileTreeScanner } = await import('../domain/FileTreeScanner');
            const scanner = new FileTreeScanner(this.logger);
            const graph = await scanner.scanPathShallow(uri, uri);
            
            this.showGraph(graph);
            this.panel.title = `蓝图: ${path.basename(workspaceRoot)}`;
            return;
        }

        // 打开父目录的蓝图
        this.logger.info(`返回到父目录: ${parentPath}`);
        
        try {
            const uri = vscode.Uri.file(parentPath);
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const wsRoot = workspaceFolder?.uri || vscode.Uri.file(workspaceRoot);

            const { FileTreeScanner } = await import('../domain/FileTreeScanner');
            const scanner = new FileTreeScanner(this.logger);
            const graph = await scanner.scanPathShallow(uri, wsRoot);

            this.showGraph(graph);
            this.panel.title = `蓝图: ${path.basename(parentPath)}`;

            this.logger.info(`已返回到上级目录: ${parentPath}`);
        } catch (error) {
            this.logger.error('返回上级失败', error);
            vscode.window.showErrorMessage('无法返回上级目录');
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
     * 处理文件分析请求
     * 
     * 采用乐观UI模式:
     * 1. 先立即发送静态分析结果(带loading标记)
     * 2. 后台继续AI分析
     * 3. AI完成后发送update消息更新卡片
     */
    private async handleAnalyzeFile(payload: any): Promise<void> {
        const filePath = payload?.path;
        const force = payload?.force || false;
        
        this.logger.info(`[分析文件] ${filePath}, force=${force}`);
        
        if (!filePath) {
            this.logger.warn('分析文件消息缺少路径信息');
            return;
        }

        try {
            // ✅ 步骤1: 先做静态分析,立即返回结果
            const staticCapsule = await this.fileAnalysisService.analyzeFileStatic(filePath);

            // ✅ 步骤2: 立即发送静态结果到前端(带loading标记)
            const showMessage = createShowAnalysisCardMessage(staticCapsule, true);
            this.sendMessage(showMessage);

            this.logger.info(`[UI] 已发送静态分析卡片: ${filePath}`);

            // ✅ 步骤3: 后台进行AI分析(不阻塞)
            this.runAIAnalysisInBackground(filePath, staticCapsule, force);

        } catch (error) {
            this.logger.error('静态分析失败', error);
            
            // 发送错误消息
            const errorMsg = createAnalysisErrorMessage(
                filePath,
                error instanceof Error ? error.message : '分析失败'
            );
            this.sendMessage(errorMsg);
            
            vscode.window.showErrorMessage(`分析失败: ${path.basename(filePath)}`);
        }
    }

    /**
     * 后台运行AI分析并更新卡片
     */
    private async runAIAnalysisInBackground(filePath: string, staticCapsule: any, force: boolean): Promise<void> {
        try {
            this.logger.info(`[AI] 开始后台AI分析: ${filePath}`);

            // 调用AI增强分析
            const fullCapsule = await this.fileAnalysisService.enhanceWithAI(staticCapsule, { force });

            // ✅ 发送AI更新结果
            const updateMessage = createUpdateAnalysisCardMessage(fullCapsule, false);
            this.sendMessage(updateMessage);

            this.logger.info(`[UI] 已发送AI增强结果: ${filePath}`);

        } catch (error) {
            this.logger.warn('[AI] AI分析失败,保留静态结果', error);
            
            // AI失败时也发送更新,只是标记loading=false
            const errorMessage = createUpdateAnalysisCardMessage(
                staticCapsule,
                false,
                error instanceof Error ? error.message : 'AI分析失败'
            );
            this.sendMessage(errorMessage);
        }
    }

    /**
     * 处理打开源文件请求
     */
    private async handleOpenSource(payload: any): Promise<void> {
        const filePath = payload?.file;
        const startLine = payload?.line || 1;
        const endLine = payload?.endLine || startLine;
        
        this.logger.info(`[打开源文件] ${filePath}:${startLine}-${endLine}`);
        
        if (!filePath) {
            this.logger.warn('打开源文件消息缺少路径信息');
            return;
        }

        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, { preview: false });
            
            // 跳转到指定行并高亮
            const range = new vscode.Range(
                new vscode.Position(startLine - 1, 0),
                new vscode.Position(endLine - 1, 999)
            );
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            
            this.logger.info(`已打开并跳转到: ${filePath}:${startLine}`);
        } catch (error) {
            this.logger.error(`打开源文件失败: ${filePath}`, error);
            vscode.window.showErrorMessage(`无法打开文件: ${path.basename(filePath)}`);
        }
    }

    /**
     * 检测文件语言
     */
    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const langMap: Record<string, string> = {
            '.ts': 'typescript',
            '.js': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.rs': 'rust',
            '.go': 'go',
            '.rb': 'ruby',
            '.php': 'php'
        };
        return langMap[ext] || 'unknown';
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
        const cardModuleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'filetree-blueprint', 'modules', 'analysisCard.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'filetree-blueprint', 'index.css')
        );
        const cardStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'filetree-blueprint', 'analysisCard.css')
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
    <link href="${cardStyleUri}" rel="stylesheet">
    <title>文件树蓝图</title>
</head>
<body>
    <div class="toolbar">
        <button id="btn-reset-view" title="重置视图">🔄 重置</button>
        <button id="btn-fit-view" title="适应窗口">📐 适应</button>
        <button id="btn-zoom-in" title="放大">🔍+</button>
        <button id="btn-zoom-out" title="缩小">🔍-</button>
        <button id="btn-help" title="快捷键与操作说明" style="margin-left: 8px;">❓</button>
        <span id="node-count" style="margin-left: 16px;">节点: 0</span>
        <span id="edge-count">边: 0</span>
        <span style="opacity: 0.6; margin-left: 16px; font-size: 11px;">💡 空格+拖拽=平移 · 滚轮=缩放 · 双击文件夹=下钻 · ?=帮助</span>
    </div>
    <div id="canvasWrap">
        <div id="canvas">
            <svg class="edges"></svg>
            <div id="nodes"></div>
        </div>
    </div>
    <div id="breadcrumb"></div>
    
    <!-- 帮助浮层 -->
    <div class="help-overlay" id="helpOverlay">
        <div class="help-card">
            <div class="help-title">🎨 蓝图视图 · 快捷操作</div>
            <ul class="help-list">
                <li><kbd>空格</kbd> + 拖拽：平移画布</li>
                <li><strong>滚轮</strong>：缩放画布</li>
                <li><strong>拖拽节点</strong>：移动节点位置</li>
                <li><strong>双击文件夹</strong>：下钻到子目录</li>
                <li><strong>工具栏</strong>：返回上级、重置视图、适应窗口</li>
                <li><kbd>?</kbd> 或 <kbd>Shift</kbd>+<kbd>/</kbd>：打开/关闭本帮助</li>
                <li><kbd>Esc</kbd>：关闭本帮助</li>
            </ul>
            <div class="help-note">✨ 已优化防抖动：坐标整数化 · rAF节流 · GPU合成层</div>
            <div class="help-actions">
                <label class="noagain"><input type="checkbox" id="noShowAgain"> 下次不再自动显示</label>
                <button id="helpClose" class="btn-primary">我知道了</button>
            </div>
        </div>
    </div>
    
    <!-- ✅ ES6 模块：先加载卡片管理模块 -->
    <script type="module" nonce="${nonce}">
        // 导入卡片管理模块
        import { AnalysisCardManager } from '${cardModuleUri}';
        
        // 创建全局卡片管理器实例
        const vscode = acquireVsCodeApi();
        window.cardManager = new AnalysisCardManager(vscode);
        
        console.log('[模块] AnalysisCardManager 已加载');
    </script>
    
    <!-- 主脚本 -->
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
     * 显示状态栏提示（15秒后自动隐藏）
     */
    private showStatusBarHint(): void {
        const config = vscode.workspace.getConfiguration('filetreeBlueprint');
        const showHint = config.get<boolean>('showStatusBarHint', true);

        if (!showHint) {
            return;
        }

        // 创建状态栏项
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.statusBarItem.text = '$(graph) 空格+拖拽=平移 · 滚轮=缩放 · 双击文件夹=下钻 · ?=帮助';
        this.statusBarItem.tooltip = '蓝图视图快捷操作\n\n• 空格 + 拖拽：平移画布\n• 滚轮：缩放\n• 拖拽节点：移动节点\n• 双击文件夹：下钻\n• ? 键：打开帮助\n\n已优化防抖动：坐标取整 · rAF 节流 · GPU 合成层';
        this.statusBarItem.command = 'filetreeBlueprint.openHelp';
        this.statusBarItem.show();

        // 添加到可销毁列表
        this.disposables.push(this.statusBarItem);

        // 15 秒后自动隐藏
        setTimeout(() => {
            if (this.statusBarItem) {
                this.statusBarItem.hide();
            }
        }, 15000);

        this.logger.debug('状态栏提示已显示，将在 15 秒后隐藏');
    }

    /**
     * 打开帮助浮层
     */
    public openHelp(): void {
        this.sendMessage({ type: 'open-help' });
        this.logger.debug('已发送打开帮助消息到 Webview');
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
