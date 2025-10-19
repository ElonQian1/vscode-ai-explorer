/**
 * 🔧 CSP修复版HTML模板 - 临时文件
 * 完全移除内联脚本，使用本地ELK，修复CSP拦截问题
 */

// 这个方法将替换BlueprintPanel.ts中的getEmergencyHtml
function getEmergencyHtmlFixed(extensionUri: any, webview: any): string {
    const csp = webview.cspSource;
    
    // URI设置
    const mediaBase = extensionUri + '/media/filetree-blueprint';
    const elkUri = extensionUri + '/media/vendor/elk.bundled.js';
    
    const scriptUris = {
        style: `${mediaBase}/index.css`,
        smokeProbe: `${mediaBase}/SmokeProbe.js`,
        debugBanner: `${mediaBase}/DebugBanner.js`,
        messageContracts: `${mediaBase}/contracts/messageContracts.js`,
        layoutEngine: `${mediaBase}/modules/layoutEngine.js`,
        blueprintCard: `${mediaBase}/modules/blueprintCard.js`,
        analysisCard: `${mediaBase}/modules/analysisCard.js`,
        graphView: `${mediaBase}/graphView.js`,
        validationTest: `${mediaBase}/validation-test.js`
    };
    
    // 生成nonce
    const nonce = Math.random().toString(36).substring(2);
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none'; 
        img-src ${csp} https:; 
        script-src ${csp} 'nonce-${nonce}';
        style-src ${csp} 'nonce-${nonce}';
        font-src ${csp} https:;
    ">
    <link rel="stylesheet" href="${scriptUris.style}">
    <style nonce="${nonce}">
        html, body { height: 100%; margin: 0; padding: 0; }
        #graph-root { height: 100vh; position: relative; z-index: 1; }
        #card-layer { position: absolute; inset: 0; pointer-events: none; z-index: 1500; }
        .bp-card { position: absolute; pointer-events: auto; z-index: 3; }
        .bp-card.pinned { box-shadow: 0 12px 28px rgba(0,0,0,.25); }
    </style>
    <title>文件树蓝图 - CSP修复版</title>
</head>
<body>
    <div id="breadcrumb"></div>
    <div id="graph-root">
        <div class="empty-state">
            <h3>🔧 CSP修复版</h3>
            <p>ELK本地化 · 无内联脚本 · 节点应该能正常显示了</p>
        </div>
    </div>
    <div id="card-layer" class="card-layer"></div>
    
    <!-- 🔧 CSP合规：所有脚本external + nonce -->
    <script nonce="${nonce}" src="${elkUri}"></script>
    <script nonce="${nonce}" src="${scriptUris.smokeProbe}"></script>
    <script nonce="${nonce}" src="${scriptUris.debugBanner}"></script>
    <script nonce="${nonce}" src="${scriptUris.messageContracts}"></script>
    <script nonce="${nonce}" src="${scriptUris.layoutEngine}"></script>
    <script nonce="${nonce}" src="${scriptUris.blueprintCard}"></script>
    <script nonce="${nonce}" src="${scriptUris.analysisCard}"></script>
    <script nonce="${nonce}" src="${scriptUris.graphView}"></script>
    <script nonce="${nonce}" src="${scriptUris.validationTest}"></script>
</body>
</html>`;
}