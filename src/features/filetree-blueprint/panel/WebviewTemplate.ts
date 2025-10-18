// src/features/filetree-blueprint/panel/WebviewTemplate.ts
// [tags: Webview, HTML, CSP, Security]
/**
 * Webview HTML 模板生成器
 * 
 * 功能：
 * - 生成符合 CSP 规范的 HTML
 * - 自动转换资源 URI（asWebviewUri）
 * - 统一脚本加载顺序
 * - 支持开发模式（加载调试组件）
 * 
 * 用法：
 * ```typescript
 * const html = generateWebviewHtml(
 *     panel.webview,
 *     extensionUri,
 *     { devMode: true }
 * );
 * panel.webview.html = html;
 * ```
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface WebviewHtmlOptions {
    /** 页面标题 */
    title?: string;
    /** 是否启用开发模式（加载 SmokeProbe 和 DebugBanner） */
    devMode?: boolean;
    /** 额外的脚本 URI 列表 */
    extraScripts?: vscode.Uri[];
    /** 额外的样式 URI 列表 */
    extraStyles?: vscode.Uri[];
}

/**
 * 生成 Webview HTML
 */
export function generateWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    options: WebviewHtmlOptions = {}
): string {
    const {
        title = '文件树蓝图',
        devMode = false,
        extraScripts = [],
        extraStyles = []
    } = options;

    // 核心资源路径
    const mediaPath = vscode.Uri.joinPath(extensionUri, 'media', 'filetree-blueprint');

    // 转换为 Webview URI
    const toWebviewUri = (filePath: string) => {
        const uri = vscode.Uri.joinPath(mediaPath, filePath);
        return webview.asWebviewUri(uri);
    };

    // 生成 nonce（用于 CSP）
    const nonce = getNonce();

    // 核心脚本列表
    const coreScripts = [
        toWebviewUri('d3.v7.min.js'),
        toWebviewUri('graphView.js')
    ];

    // 开发模式脚本
    const devScripts = devMode ? [
        toWebviewUri('SmokeProbe.js'),
        toWebviewUri('DebugBanner.js')
    ] : [];

    // 额外脚本
    const extraScriptUris = extraScripts.map(uri => webview.asWebviewUri(uri));

    // 所有脚本（按加载顺序）
    const allScripts = [...coreScripts, ...devScripts, ...extraScriptUris];

    // 核心样式
    const coreStyles = [
        toWebviewUri('styles.css')
    ];

    // 额外样式
    const extraStyleUris = extraStyles.map(uri => webview.asWebviewUri(uri));

    // 所有样式
    const allStyles = [...coreStyles, ...extraStyleUris];

    // 生成 HTML
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    
    <!-- CSP 安全策略 -->
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        img-src ${webview.cspSource} https:;
        script-src 'nonce-${nonce}';
        style-src ${webview.cspSource} 'unsafe-inline';
        font-src ${webview.cspSource};
    ">
    
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    
    <!-- 样式表 -->
    ${allStyles.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n    ')}
    
    <!-- 内联基础样式 -->
    <style>
        body {
            margin: 0;
            padding: ${devMode ? '32px 0 48px 0' : '0'}; /* 为调试组件预留空间 */
            overflow: hidden;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        
        #graph-container {
            width: 100vw;
            height: ${devMode ? 'calc(100vh - 80px)' : '100vh'};
            position: relative;
        }
        
        #graph-svg {
            width: 100%;
            height: 100%;
        }
        
        /* 加载动画 */
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999999;
        }
        
        .loading-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <!-- 加载动画 -->
    <div id="loading-overlay" class="loading-overlay">
        <div class="loading-spinner"></div>
    </div>
    
    <!-- 图表容器 -->
    <div id="graph-container">
        <svg id="graph-svg"></svg>
    </div>
    
    <!-- 核心脚本（按顺序加载） -->
    ${allScripts.map((uri, index) => `
    <!-- Script ${index + 1}: ${path.basename(uri.path)} -->
    <script nonce="${nonce}" src="${uri}"></script>`).join('\n    ')}
    
    <!-- 初始化脚本 -->
    <script nonce="${nonce}">
        (function() {
            console.log('[Webview] 🎨 初始化 Webview...');
            
            // 隐藏加载动画
            setTimeout(() => {
                const overlay = document.getElementById('loading-overlay');
                if (overlay) {
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => overlay.remove(), 300);
                }
            }, 500);
            
            // 开发模式提示
            ${devMode ? `
            console.log('[Webview] 🔍 开发模式已启用');
            console.log('[Webview] 💡 调试组件：SmokeProbe + DebugBanner');
            ` : ''}
            
            // 全局错误处理
            window.addEventListener('error', (event) => {
                console.error('[Webview] 💥 全局错误:', event.error);
            });
            
            window.addEventListener('unhandledrejection', (event) => {
                console.error('[Webview] 💥 未处理的 Promise 错误:', event.reason);
            });
            
            console.log('[Webview] ✅ Webview 初始化完成');
        })();
    </script>
</body>
</html>`;
}

/**
 * 生成随机 nonce（用于 CSP）
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * HTML 转义（防止 XSS）
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 生成调试信息（用于诊断）
 */
export function generateDebugInfo(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const mediaPath = vscode.Uri.joinPath(extensionUri, 'media', 'filetree-blueprint');
    
    return `
=== Webview 调试信息 ===
extensionUri: ${extensionUri.toString()}
mediaPath: ${mediaPath.toString()}
cspSource: ${webview.cspSource}

核心脚本 URI:
- d3.v7.min.js: ${webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'd3.v7.min.js')).toString()}
- graphView.js: ${webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'graphView.js')).toString()}

开发脚本 URI:
- SmokeProbe.js: ${webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'SmokeProbe.js')).toString()}
- DebugBanner.js: ${webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'DebugBanner.js')).toString()}
`;
}
