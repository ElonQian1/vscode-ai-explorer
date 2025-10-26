/**
 * 调试悬停AI缓存 - 验证右键AI分析后悬停是否显示正确结果
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

async function debugHoverAICache() {
    console.log('=== 🔍 调试悬停AI缓存 ===');
    
    // 1. 检查工作区
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        console.log('❌ 没有工作区');
        return;
    }
    
    const workspaceRoot = workspaceFolder.uri.fsPath;
    console.log(`📁 工作区: ${workspaceRoot}`);
    
    // 2. 选择测试文件
    const testFile = path.join(workspaceRoot, 'src', 'features', 'explorer-alias', 'ExplorerAliasModule.ts');
    console.log(`🎯 测试文件: ${testFile}`);
    
    // 3. 检查文件存在
    if (!fs.existsSync(testFile)) {
        console.log('❌ 测试文件不存在');
        return;
    }
    
    try {
        // 4. 导入 SmartFileAnalyzer 检查缓存
        console.log('\n=== 📦 检查 SmartFileAnalyzer 缓存 ===');
        
        // 模拟缓存键生成
        const cacheKey = `analysis:${testFile}`;
        console.log(`🔑 缓存键: ${cacheKey}`);
        
        // 5. 导入 HoverInfoService 并测试
        console.log('\n=== 🎯 测试 HoverInfoService ===');
        
        const { HoverInfoService } = require('./out/src/features/explorer-alias/ui/HoverInfoService');
        const hoverService = HoverInfoService.getInstance(workspaceRoot);
        
        // 6. 获取悬停信息
        const tooltip = await hoverService.getTooltip(testFile);
        console.log('\n📝 悬停信息:');
        console.log('─'.repeat(50));
        console.log(tooltip);
        console.log('─'.repeat(50));
        
        // 7. 检查是否包含AI分析标识
        if (tooltip.includes('🤖 AI智能分析')) {
            console.log('✅ 悬停显示了AI分析结果！');
        } else if (tooltip.includes('AI分析中')) {
            console.log('⚠️ 悬停仍然显示"AI分析中"');
        } else {
            console.log('ℹ️ 悬停显示的是其他分析结果');
        }
        
        // 8. 获取服务状态
        const status = await hoverService.getServiceStatus();
        console.log('\n📊 服务状态:');
        console.log(`⏳ 待处理分析: ${status.pendingUpdates}`);
        console.log(`💾 缓存统计: ${JSON.stringify(status.cacheStats, null, 2)}`);
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        console.log('详细错误信息:');
        console.log(error.stack);
    }
}

// 如果是直接运行
if (require.main === module) {
    debugHoverAICache().catch(console.error);
}

module.exports = { debugHoverAICache };