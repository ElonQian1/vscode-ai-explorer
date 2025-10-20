/**
 * Webview Host Utilities
 * CSP安全的Webview HTML渲染工具
 */

import * as vscode from 'vscode';

/**
 * 生成随机nonce(用于CSP)
 */
export function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * 渲染CSP安全的Webview HTML
 * @param webview Webview实例
 * @param extensionUri 扩展根URI
 * @returns HTML字符串
 */
export function getWebviewHtml(
	webview: vscode.Webview,
	extensionUri: vscode.Uri
): string {
	const nonce = getNonce();
	
	// 辅助函数:转换为webview URI
	const asWebviewUri = (...pathSegments: string[]) => {
		return webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, ...pathSegments)
		);
	};
	
	// 资源URI
	const cssUri = asWebviewUri('media', 'filetree-blueprint', 'bp.css');
	const graphViewJsUri = asWebviewUri('media', 'filetree-blueprint', 'graphView.js');
	const elkBundledUri = asWebviewUri('media', 'filetree-blueprint', 'lib', 'elk.bundled.js');
	
	// 模块URI
	const blueprintCardUri = asWebviewUri('media', 'filetree-blueprint', 'modules', 'blueprintCard.js');
	const enhancedUserNotesUri = asWebviewUri('media', 'filetree-blueprint', 'modules', 'enhancedUserNotes.js');
	
	return /* html */ `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy"
		content="
			default-src 'none';
			img-src ${webview.cspSource} blob: data:;
			style-src ${webview.cspSource} 'nonce-${nonce}';
			script-src ${webview.cspSource} 'nonce-${nonce}';
			font-src ${webview.cspSource};
			connect-src ${webview.cspSource} https:;
		">
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<link rel="stylesheet" nonce="${nonce}" href="${cssUri}">
	<title>AI Explorer - Blueprint</title>
</head>
<body>
	<!-- 蓝图卡片层 -->
	<div id="card-layer" class="bp-card-layer"></div>
	
	<!-- 图画布容器 -->
	<div id="graph-container" class="bp-graph-container">
		<svg id="graph-svg" class="bp-graph-svg"></svg>
	</div>
	
	<!-- 控制工具条 -->
	<div id="toolbar" class="bp-toolbar">
		<div class="bp-toolbar-section">
			<label class="bp-toolbar-label">关键词:</label>
			<div id="keyword-chips" class="bp-keyword-chips"></div>
		</div>
		<div class="bp-toolbar-section">
			<label class="bp-toolbar-label">阈值:</label>
			<input type="range" id="threshold-slider" class="bp-slider" min="0" max="100" value="30" />
			<span id="threshold-value" class="bp-value">30</span>
		</div>
		<div class="bp-toolbar-section">
			<label class="bp-toolbar-label">层级:</label>
			<select id="hops-select" class="bp-select">
				<option value="1">1跳</option>
				<option value="2" selected>2跳</option>
				<option value="3">3跳</option>
			</select>
		</div>
		<div class="bp-toolbar-section">
			<button id="toggle-relevant" class="bp-btn bp-btn-toggle is-active">
				只看相关
			</button>
			<button id="toggle-bridge" class="bp-btn bp-btn-toggle">
				桥接节点
			</button>
		</div>
	</div>
	
	<!-- 加载状态提示 -->
	<div id="loading" class="bp-loading" style="display: none;">
		<div class="bp-spinner"></div>
		<p class="bp-loading-text">正在分析...</p>
	</div>
	
	<!-- 依赖加载顺序: ELK → 模块 → 主应用 -->
	<script nonce="${nonce}" src="${elkBundledUri}"></script>
	<script nonce="${nonce}" src="${blueprintCardUri}"></script>
	<script nonce="${nonce}" src="${enhancedUserNotesUri}"></script>
	<script nonce="${nonce}" src="${graphViewJsUri}"></script>
</body>
</html>`;
}

/**
 * 为元素设置位置(CSP安全方式)
 * 使用CSS变量而非直接设置style
 */
export function setElementPosition(
	element: HTMLElement,
	x: number,
	y: number
): void {
	element.setAttribute('data-x', x.toString());
	element.setAttribute('data-y', y.toString());
	element.style.setProperty('--x', `${x}px`);
	element.style.setProperty('--y', `${y}px`);
}

/**
 * 创建元素的辅助函数(CSP安全)
 */
export function createElement(
	tag: string,
	className?: string,
	attributes?: Record<string, string>
): HTMLElement {
	const element = document.createElement(tag);
	if (className) {
		element.className = className;
	}
	if (attributes) {
		for (const [key, value] of Object.entries(attributes)) {
			if (key === 'text') {
				element.textContent = value;
			} else if (key === 'html') {
				element.innerHTML = value;
			} else {
				element.setAttribute(key, value);
			}
		}
	}
	return element;
}
