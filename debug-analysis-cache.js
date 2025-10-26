/**
 * 🔍 调试分析结果存储问题
 */

const vscode = require('vscode');
const path = require('path');

async function debugAnalysisCache() {
    const filePath = 'd:\\rust\\active-projects\\ai-explorer\\scripts\\test-ai-fallback-enhanced.ts';
    console.log('🔍 调试文件:', filePath);
    
    // 计算缓存键（与SmartAnalyzer一致）
    function hashPath(path) {
        let hash = 0;
        for (let i = 0; i < path.length; i++) {
            const char = path.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }
    
    const cacheKey = `file-analysis-${hashPath(filePath)}`;
    console.log('📝 缓存键:', cacheKey);
    
    // 尝试访问ExtensionContext的globalState
    const extension = vscode.extensions.getExtension('elonqian1.ai-explorer');
    if (extension && extension.isActive) {
        const context = extension.extensionContext || extension.context;
        if (context) {
            const cached = context.globalState.get(`smart-analyzer:${cacheKey}`);
            console.log('💾 SmartAnalyzer缓存结果:', cached);
            
            // 也检查其他可能的缓存键格式
            const allKeys = context.globalState.keys();
            const smartKeys = allKeys.filter(k => k.includes('smart-analyzer'));
            console.log('🔑 所有smart-analyzer缓存键:', smartKeys);
        }
    }
}

debugAnalysisCache().catch(console.error);