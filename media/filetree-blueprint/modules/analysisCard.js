(function() {
    "use strict";
    
    const root = document.getElementById("analysis-card-root") || createRoot();
    
    function createRoot() {
        const el = document.createElement("div");
        el.id = "analysis-card-root";
        el.style.cssText = "position: fixed; top: 20px; right: 20px; width: 300px; max-height: 80vh; overflow-y: auto; z-index: 2000; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: none;";
        document.body.appendChild(el);
        console.log("[analysisCard] ✅ 创建了分析卡片容器");
        return el;
    }
    
    function show(payload) {
        const path = payload.path || "";
        const fileInfo = payload.fileInfo || {};
        const staticAnalysis = payload.staticAnalysis || {};
        
        const cardHtml = [
            '<div class="analysis-card" data-path="' + path + '">',
            '<div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--vscode-panel-border);">',
            '<h3 style="margin: 0; font-size: 14px; color: var(--vscode-foreground);">' + getFileName(path) + '</h3>',
            '<button onclick="window.cardManager.close()" style="background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-size: 16px;">×</button>',
            '</div>',
            '<div class="card-content" style="padding: 12px;">',
            '<div style="margin-bottom: 16px;">',
            '<h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">📁 文件信息</h4>',
            '<div style="font-size: 11px; color: var(--vscode-foreground);">',
            '<div>大小: ' + formatFileSize(fileInfo.size || 0) + '</div>',
            '<div>类型: ' + (fileInfo.extension || "Unknown") + '</div>',
            '</div>',
            '</div>',
            '<div style="margin-bottom: 16px;">',
            '<h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">🔍 静态分析</h4>',
            '<div id="static-analysis" style="font-size: 11px; color: var(--vscode-foreground);">' + renderStaticAnalysis(staticAnalysis) + '</div>',
            '</div>',
            '<div>',
            '<h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">🤖 AI 增强分析</h4>',
            '<div id="ai-analysis" style="font-size: 11px; color: var(--vscode-foreground);">',
            '<div style="display: flex; align-items: center; gap: 8px; color: var(--vscode-descriptionForeground);">',
            '<span>⏳</span><span>AI 正在分析中...</span>',
            '</div>',
            '</div>',
            '</div>',
            '</div>',
            '</div>'
        ].join("");
        
        root.innerHTML = cardHtml;
        root.style.display = "block";
        console.log("[analysisCard] ✅ 显示静态分析卡片:", path);
    }
    
    function update(payload) {
        const aiSection = document.getElementById("ai-analysis");
        if (!aiSection) return;
        
        const summary = payload.summary || "无摘要信息";
        const insights = payload.insights || [];
        const recommendations = (payload.aiAnalysis && payload.aiAnalysis.recommendations) || [];
        
        let html = '<div style="font-size: 11px; color: var(--vscode-foreground);">';
        html += '<div style="margin-bottom: 8px;"><strong>概要:</strong><p style="margin: 4px 0;">' + summary + '</p></div>';
        
        if (insights.length > 0) {
            html += '<div style="margin-bottom: 8px;"><strong>深度分析:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
            for (let i = 0; i < insights.length; i++) {
                html += '<li>' + insights[i] + '</li>';
            }
            html += '</ul></div>';
        }
        
        if (recommendations.length > 0) {
            html += '<div><strong>改进建议:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
            for (let i = 0; i < recommendations.length; i++) {
                html += '<li>' + recommendations[i] + '</li>';
            }
            html += '</ul></div>';
        }
        
        html += '</div>';
        aiSection.innerHTML = html;
        console.log("[analysisCard] ✅ AI分析结果已更新");
    }
    
    function close() {
        root.style.display = "none";
        root.innerHTML = "";
        console.log("[analysisCard] ✅ 卡片已关闭");
    }
    
    function getFileName(path) {
        return path.split(/[/\\]/).pop() || path;
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }
    
    function renderStaticAnalysis(analysis) {
        if (!analysis) {
            return '<p style="color: var(--vscode-descriptionForeground);">暂无静态分析结果</p>';
        }
        
        let html = "<div>";
        if (analysis.dependencies && analysis.dependencies.length > 0) {
            html += '<div style="margin-bottom: 8px;"><strong>依赖:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
            for (let i = 0; i < analysis.dependencies.length; i++) {
                html += '<li>' + analysis.dependencies[i] + '</li>';
            }
            html += '</ul></div>';
        }
        if (analysis.exports && analysis.exports.length > 0) {
            html += '<div><strong>导出:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
            for (let i = 0; i < analysis.exports.length; i++) {
                html += '<li>' + analysis.exports[i] + '</li>';
            }
            html += '</ul></div>';
        }
        html += "</div>";
        return html;
    }
    
    // 导出方法，同时提供兼容的别名
    window.cardManager = { 
        show: show, 
        update: update, 
        close: close,
        // 兼容旧的方法名
        showCard: show,
        updateCard: update
    };
    console.log("[analysisCard] ✅ cardManager 已注册到全局 (UMD/IIFE模式，兼容 show/showCard)");
    
})();
