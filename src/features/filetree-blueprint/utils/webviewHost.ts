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
	extensionUri: vscode.Uri,
	useNewArchitecture: boolean = false
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
	const elkBundledUri = asWebviewUri('media', 'vendor', 'elk.bundled.js'); // ✅ 修复路径
	
	// 模块URI
	const blueprintCardUri = asWebviewUri('media', 'filetree-blueprint', 'modules', 'blueprintCard.js');
	const enhancedUserNotesUri = asWebviewUri('media', 'filetree-blueprint', 'modules', 'enhancedUserNotes.js');
	const featureToolbarUri = asWebviewUri('media', 'filetree-blueprint', 'modules', 'featureToolbar.js');
	const runtimeStylesheetUri = asWebviewUri('media', 'filetree-blueprint', 'modules', 'runtimeStylesheet.js');
	
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
	<script nonce="${nonce}">
		// ✅ 全局nonce，供运行时样式表使用
		window.__NONCE__ = '${nonce}';
	</script>
</head>
<body>
	<!-- 蓝图卡片层 -->
	<div id="card-layer" class="bp-card-layer"></div>
	
	<!-- 图画布容器 -->
	<div id="graph-container" class="bp-graph-container">
		<svg id="graph-svg" class="bp-graph-svg"></svg>
	</div>
	
	<!-- 兼容性：旧架构所需的容器 -->
	<div id="graph-root">
		<div class="empty-state">
			<h3>🎨 画布已加载</h3>
			<p>正在初始化图表数据...</p>
			<p><small>如果长时间无数据，请检查Debug Banner状态</small></p>
		</div>
	</div>
	
	<!-- 功能筛选工具条(由featureToolbar.js动态生成) -->
	<div id="feature-toolbar-container"></div>
	
	<!-- 加载状态提示 -->
	<div id="loading" class="bp-loading hidden">
		<div class="bp-spinner"></div>
		<p class="bp-loading-text">正在分析...</p>
	</div>
	
	${useNewArchitecture ? `
	<!-- 新架构: Bundle.js -->
	<script nonce="${nonce}" src="${elkBundledUri}"></script>
	<script nonce="${nonce}" type="module" src="${asWebviewUri('media', 'filetree-blueprint', 'dist', 'bundle.js')}"></script>
	` : `
	<!-- 旧架构: 模块化加载 -->
	<script nonce="${nonce}" src="${elkBundledUri}"></script>
	<script nonce="${nonce}" src="${runtimeStylesheetUri}"></script>
	<script nonce="${nonce}" src="${blueprintCardUri}"></script>
	<script nonce="${nonce}" src="${enhancedUserNotesUri}"></script>
	<script nonce="${nonce}" src="${featureToolbarUri}"></script>
	<script nonce="${nonce}" src="${graphViewJsUri}"></script>
	`}
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
