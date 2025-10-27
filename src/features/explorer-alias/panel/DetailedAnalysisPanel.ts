// src/features/explorer-alias/panel/DetailedAnalysisPanel.ts
/**
 * 🔍 详细分析面板
 * 为非技术用户和AI代理提供丰富的文件分析信息
 * 支持Markdown格式渲染
 */

import * as vscode from 'vscode';
import { HoverInfoService } from '../ui/HoverInfoService';
import { MarkdownRenderer } from '../../../shared/utils/MarkdownRenderer';

export class DetailedAnalysisPanel {
    public static currentPanel: DetailedAnalysisPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private readonly _markdownRenderer: MarkdownRenderer;

    public static createOrShow(extensionUri: vscode.Uri, filePath: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 如果面板已存在，显示它
        if (DetailedAnalysisPanel.currentPanel) {
            DetailedAnalysisPanel.currentPanel._panel.reveal(column);
            DetailedAnalysisPanel.currentPanel._updateForFile(filePath);
            return;
        }

        // 创建新面板
        const panel = vscode.window.createWebviewPanel(
            'aiExplorerDetailedAnalysis',
            '🔍 AI Explorer - 详细分析',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        DetailedAnalysisPanel.currentPanel = new DetailedAnalysisPanel(panel, extensionUri);
        DetailedAnalysisPanel.currentPanel._updateForFile(filePath);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._markdownRenderer = MarkdownRenderer.getInstance();

        // 设置初始内容
        this._update();

        // 监听面板关闭事件
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // 处理来自webview的消息
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'openFile':
                        vscode.window.showTextDocument(vscode.Uri.file(message.path));
                        break;
                    case 'analyzeRelated':
                        // 分析相关文件
                        this._updateForFile(message.path);
                        break;
                    case 'reanalyze':
                        // 强制重新分析
                        this._forceReanalyzeFile(message.path);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _updateForFile(filePath: string) {
        try {
            // 获取HoverInfoService的分析结果
            const hoverInfo = await HoverInfoService.getInstance().getTooltip(filePath);
            this._panel.webview.html = await this._getHtmlForWebview(filePath, hoverInfo);
        } catch (error) {
            console.error('更新文件分析失败:', error);
            this._panel.webview.html = await this._getHtmlForWebview(filePath, null);
        }
    }

    /**
     * 🔄 强制重新分析文件
     */
    private async _forceReanalyzeFile(filePath: string) {
        try {
            // 显示重新分析中的状态
            this._panel.webview.postMessage({
                command: 'showLoading',
                message: '🔄 正在强制重新分析...'
            });

            // 调用AI Explorer的强制重新分析命令
            await vscode.commands.executeCommand('aiExplorer.refreshAnalysis', { resourceUri: vscode.Uri.file(filePath) });

            // 等待一下让AI分析完成
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 更新面板内容
            await this._updateForFile(filePath);

            // 显示成功消息
            vscode.window.showInformationMessage(`✅ ${require('path').basename(filePath)} 重新分析完成`);

        } catch (error) {
            console.error('强制重新分析失败:', error);
            vscode.window.showErrorMessage(`重新分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
            
            // 仍然尝试刷新内容
            await this._updateForFile(filePath);
        }
    }

    private async _update() {
        this._panel.webview.html = await this._getHtmlForWebview();
    }

    private async _getHtmlForWebview(filePath?: string, analysis?: string | null): Promise<string> {
        const webview = this._panel.webview;

        // 生成主要内容
        const mainContent = filePath 
            ? await this._generateAnalysisHtml(filePath, analysis || null)
            : this._generateWelcomeHtml();

        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Explorer - 详细分析</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: var(--vscode-editor-inlayHint-background);
            border-radius: 8px;
        }
        .section {
            margin: 20px 0;
            padding: 15px;
            background: var(--vscode-input-background);
            border-radius: 6px;
            border-left: 4px solid var(--vscode-button-background);
        }
        .file-path {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textCodeBlock-background);
            padding: 8px 12px;
            border-radius: 4px;
            word-break: break-all;
        }
        .tips {
            background: var(--vscode-inputValidation-infoBackground);
            border-left: 4px solid var(--vscode-inputValidation-infoBorder);
            padding: 12px;
            margin: 10px 0;
            border-radius: 0 4px 4px 0;
        }
        .loading {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        /* Tab 样式 */
        .tab-container {
            margin: 20px 0;
        }
        .tab-buttons {
            display: flex;
            background: var(--vscode-tab-inactiveBackground);
            border-radius: 6px 6px 0 0;
            overflow: hidden;
        }
        .tab-button {
            background: var(--vscode-tab-inactiveBackground);
            color: var(--vscode-tab-inactiveForeground);
            border: none;
            padding: 12px 20px;
            cursor: pointer;
            border-bottom: 3px solid transparent;
            transition: all 0.2s;
            flex: 1;
            text-align: center;
        }
        .tab-button:hover {
            background: var(--vscode-tab-hoverBackground);
        }
        .tab-button.active {
            background: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
            border-bottom-color: var(--vscode-button-background);
        }
        .tab-content {
            display: none;
            background: var(--vscode-input-background);
            padding: 20px;
            border-radius: 0 0 6px 6px;
            border-top: 1px solid var(--vscode-widget-border);
        }
        .tab-content.active {
            display: block;
        }
        
        /* 核心功能样式 */
        .core-function {
            margin: 15px 0;
            padding: 15px;
            background: var(--vscode-editor-inlayHint-background);
            border-radius: 6px;
            border-left: 4px solid var(--vscode-button-background);
        }
        .core-function h4 {
            margin: 0 0 10px 0;
            color: var(--vscode-button-background);
        }
        .core-function ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        .core-function li {
            margin: 8px 0;
            line-height: 1.5;
        }

        /* Markdown内容样式 */
        .markdown-content {
            font-size: 13px;
            line-height: 1.6;
        }
        
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
            margin: 16px 0 8px 0;
            color: var(--vscode-foreground);
            font-weight: 600;
        }
        
        .markdown-content h1 { font-size: 18px; }
        .markdown-content h2 { font-size: 16px; }
        .markdown-content h3 { font-size: 15px; }
        
        .markdown-content code {
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textPreformat-foreground);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }
        
        .markdown-content pre {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 12px;
            overflow-x: auto;
            margin: 12px 0;
        }
        
        .markdown-content pre code {
            background: none;
            padding: 0;
            border-radius: 0;
        }
        
        .markdown-content blockquote {
            border-left: 3px solid var(--vscode-button-background);
            padding: 0 16px;
            color: var(--vscode-descriptionForeground);
            margin: 12px 0;
            font-style: italic;
        }
        
        .markdown-content strong {
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .markdown-content em {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
        }
        
        .markdown-content ul, .markdown-content ol {
            margin: 8px 0;
            padding-left: 24px;
        }
        
        .markdown-content li {
            margin: 4px 0;
            line-height: 1.5;
        }

        /* 复制Markdown按钮样式 */
        .copy-md-btn {
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-button-secondaryForeground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            margin-left: 8px;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        
        .copy-md-btn:hover {
            opacity: 1;
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        ${mainContent}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function openFile(path) {
            vscode.postMessage({
                command: 'openFile',
                path: path
            });
        }
        
        function analyzeRelated(path) {
            vscode.postMessage({
                command: 'analyzeRelated',
                path: path
            });
        }
        
        function forceReanalyze(path) {
            // 显示加载状态
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = '⏳ 分析中...';
            button.disabled = true;
            
            // 发送重新分析命令
            vscode.postMessage({
                command: 'reanalyze',
                path: path
            });
            
            // 5秒后恢复按钮状态（防止卡住）
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 5000);
        }
        
        // Tab 切换功能
        function showTab(tabName) {
            // 隐藏所有tab内容
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));
            
            // 移除所有tab按钮的active类
            const tabButtons = document.querySelectorAll('.tab-button');
            tabButtons.forEach(button => button.classList.remove('active'));
            
            // 显示选中的tab内容
            const activeContent = document.getElementById(tabName + '-content');
            if (activeContent) {
                activeContent.classList.add('active');
            }
            
            // 激活选中的tab按钮
            const activeButton = document.querySelector(\`[onclick="showTab('\${tabName}')"]\`);
            if (activeButton) {
                activeButton.classList.add('active');
            }
        }
        
        // 复制Markdown内容到剪贴板
        function copyMarkdown(text) {
            navigator.clipboard.writeText(text).then(() => {
                // 显示复制成功提示
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = '✅';
                button.style.color = 'var(--vscode-notificationsInfoIcon-foreground)';
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.color = '';
                }, 1500);
            }).catch(err => {
                console.error('复制失败:', err);
                // 显示复制失败提示
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = '❌';
                button.style.color = 'var(--vscode-errorForeground)';
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.color = '';
                }, 1500);
            });
        }

        // 页面加载完成后激活第一个tab
        document.addEventListener('DOMContentLoaded', function() {
            showTab('overview');
        });
    </script>
</body>
</html>`;
    }

    private _generateWelcomeHtml(): string {
        return `
        <div class="header">
            <h1>🔍 AI Explorer - 详细分析</h1>
            <p>为您提供文件的深度分析和通俗解释</p>
        </div>
        <div class="section">
            <h2>🚀 如何使用</h2>
            <p>在 AI Explorer 树视图中右键点击任何文件，选择 <strong>"查看详细分析"</strong> 即可查看该文件的详细信息。</p>
        </div>
        <div class="tips">
            <p><strong>💡 提示：</strong>这个面板专为非技术用户设计，用通俗易懂的语言解释代码文件的作用。</p>
        </div>`;
    }

    private async _generateAnalysisHtml(filePath: string, analysis: string | null): Promise<string> {
        const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
        
        if (!analysis) {
            return `
            <div class="header">
                <h1>📁 ${fileName}</h1>
                <div class="file-path">${filePath}</div>
            </div>
            <div class="loading">
                <p>⏳ 正在分析文件，请稍候...</p>
                <button onclick="location.reload()">🔄 刷新</button>
            </div>`;
        }

        const coreFunctionsContent = await this._generateCoreFunctionsContent(fileName, filePath);
        
        return `
        <div class="header">
            <h1>📁 ${fileName}</h1>
            <div class="file-path">${filePath}</div>
        </div>
        
        <div class="tab-container">
            <div class="tab-buttons">
                <button class="tab-button active" onclick="showTab('overview')">📊 概览</button>
                <button class="tab-button" onclick="showTab('core-functions')">🔧 核心功能</button>
                <button class="tab-button" onclick="showTab('technical')">⚙️ 技术详情</button>
            </div>
            
            <div id="overview-content" class="tab-content active">
                <div class="section">
                    <h2>🎯 文件分析结果</h2>
                    <div style="white-space: pre-line;">${analysis}</div>
                </div>
                <div class="section">
                    <h2>🛠️ 操作选项</h2>
                    <button onclick="openFile('${filePath}')">📝 打开文件</button>
                    <button onclick="forceReanalyze('${filePath}')">🔄 强制重新分析</button>
                </div>
                <div class="tips">
                    <p><strong>💡 专业提示：</strong>如果您是开发者，可以通过右键菜单进行更深入的代码分析。</p>
                </div>
            </div>
            
            <div id="core-functions-content" class="tab-content">
                ${coreFunctionsContent}
            </div>
            
            <div id="technical-content" class="tab-content">
                <div class="section">
                    <h2>⚙️ 技术详情</h2>
                    <p>这里显示技术实现细节、API文档、代码结构等信息。</p>
                    <div style="white-space: pre-line;">${analysis}</div>
                </div>
            </div>
        </div>`;
    }

    /**
     * 🔧 生成核心功能内容 - 真正的AI驱动内容
     */
    private async _generateCoreFunctionsContent(fileName: string, filePath: string): Promise<string> {
        try {
            // 获取SmartFileAnalyzer的分析结果
            const hoverService = HoverInfoService.getInstance();
            const smartResult = await (hoverService as any).checkSmartAnalysisCache(filePath);
            
            if (smartResult && smartResult.source === 'ai') {
                // 从AI分析结果中提取核心功能
                const coreFunctions = this.extractCoreFunctionsFromAI(smartResult, fileName);
                return coreFunctions;
            } else {
                // 如果没有AI分析结果，显示等待状态
                return this.generateWaitingForAIContent(fileName, filePath);
            }
        } catch (error) {
            console.error('生成核心功能内容失败:', error);
            return this.generateErrorContent(fileName, error);
        }
    }

    /**
     * 从AI分析结果中提取核心功能
     */
    private extractCoreFunctionsFromAI(smartResult: any, fileName: string): string {
        const analysis = smartResult.analysis || {};
        const coreFeatures = analysis.coreFeatures || [];
        const keyFunctions = analysis.keyFunctions || [];
        const businessValue = analysis.businessValue || '';
        const technicalArchitecture = analysis.technicalArchitecture || '';

        let content = `<h2>🎯 ${fileName} 核心功能 (AI分析)</h2>`;

        // 核心特性
        if (coreFeatures.length > 0) {
            content += `
            <div class="core-function">
                <h4>🚀 核心特性</h4>
                <ul>`;
            coreFeatures.forEach((feature: string) => {
                content += `<li>${feature}</li>`;
            });
            content += `</ul>
            </div>`;
        }

        // 关键功能
        if (keyFunctions.length > 0) {
            content += `
            <div class="core-function">
                <h4>🔧 关键功能</h4>
                <ul>`;
            keyFunctions.forEach((func: string) => {
                content += `<li>${func}</li>`;
            });
            content += `</ul>
            </div>`;
        }

        // 业务价值 - 支持Markdown渲染
        if (businessValue) {
            const businessValueHtml = this._markdownRenderer.renderText(businessValue);
            content += `
            <div class="core-function">
                <h4>💼 业务价值 
                    <button class="copy-md-btn" onclick="copyMarkdown('${this.escapeForJs(businessValue)}')" title="复制Markdown格式">📋</button>
                </h4>
                <div class="markdown-content">${businessValueHtml}</div>
            </div>`;
        }

        // 技术架构 - 支持Markdown渲染
        if (technicalArchitecture) {
            const techArchHtml = this._markdownRenderer.renderText(technicalArchitecture);
            content += `
            <div class="core-function">
                <h4>🏗️ 技术架构 
                    <button class="copy-md-btn" onclick="copyMarkdown('${this.escapeForJs(technicalArchitecture)}')" title="复制Markdown格式">📋</button>
                </h4>
                <div class="markdown-content">${techArchHtml}</div>
            </div>`;
        }

        // 如果没有结构化数据，尝试从原始分析文本中提取
        if (coreFeatures.length === 0 && keyFunctions.length === 0) {
            content += this.extractFromRawAnalysis(smartResult, fileName);
        }

        return content;
    }

    /**
     * 从原始分析文本中提取功能信息
     */
    private extractFromRawAnalysis(smartResult: any, fileName: string): string {
        const rawText = smartResult.summary || smartResult.description || '';
        
        // 简单的文本分析，寻找功能相关的关键词
        const lines = rawText.split('\n').filter((line: string) => line.trim());
        const functionalLines = lines.filter((line: string) => 
            line.includes('功能') || line.includes('作用') || line.includes('能力') || 
            line.includes('提供') || line.includes('支持') || line.includes('实现')
        );

        if (functionalLines.length > 0) {
            let content = `
            <div class="core-function">
                <h4>🔍 AI分析提取的功能</h4>
                <ul>`;
            functionalLines.forEach((line: string) => {
                content += `<li>${line.trim()}</li>`;
            });
            content += `</ul>
            </div>`;
            return content;
        }

        // 如果还是没有，显示完整的AI分析结果
        return `
        <div class="core-function">
            <h4>🤖 AI完整分析</h4>
            <div style="white-space: pre-line; background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px;">
${rawText}
            </div>
        </div>`;
    }

    /**
     * 生成等待AI分析的内容
     */
    private generateWaitingForAIContent(fileName: string, filePath: string): string {
        return `
        <h2>🎯 ${fileName} 核心功能</h2>
        
        <div class="core-function">
            <h4>⏳ 等待AI分析</h4>
            <p>正在生成 <code>${fileName}</code> 的核心功能分析...</p>
            <ul>
                <li>� <strong>分析状态</strong>: 等待AI分析完成</li>
                <li>📁 <strong>文件路径</strong>: ${filePath}</li>
                <li>⚡ <strong>建议</strong>: 请稍候片刻，然后刷新页面查看AI分析结果</li>
            </ul>
            <button onclick="location.reload()" style="margin-top: 10px;">🔄 刷新查看结果</button>
        </div>
        
        <div class="tips">
            <p><strong>💡 提示</strong>: 如果等待时间过长，可能需要检查AI服务状态或重新触发分析。</p>
        </div>`;
    }

    /**
     * 生成错误内容
     */
    private generateErrorContent(fileName: string, error: any): string {
        return `
        <h2>🎯 ${fileName} 核心功能</h2>
        
        <div class="core-function">
            <h4>❌ 分析错误</h4>
            <p>生成核心功能内容时发生错误：</p>
            <p style="color: var(--vscode-errorForeground); font-family: monospace;">${error.message || error}</p>
            <button onclick="location.reload()" style="margin-top: 10px;">🔄 重试</button>
        </div>`;
    }

    /**
     * 转义JavaScript字符串中的特殊字符
     */
    private escapeForJs(text: string): string {
        if (!text) return '';
        return text
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    public dispose() {
        DetailedAnalysisPanel.currentPanel = undefined;

        // 清理资源
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}