// AI分析缓存诊断工具
const vscode = require('vscode');

/**
 * 诊断AI分析缓存问题
 */
async function diagnoseAIAnalysisCache() {
    console.log('=== AI分析缓存诊断 ===\n');

    // 1. 检查AI配置
    console.log('1. 🔧 AI配置检查:');
    const config = vscode.workspace.getConfiguration('aiExplorer');
    const openaiKey = config.get('openaiApiKey');
    const hunyuanKey = config.get('hunyuanApiKey');
    const primaryProvider = config.get('provider.primary', 'openai');
    
    console.log(`   主提供商: ${primaryProvider}`);
    console.log(`   OpenAI密钥: ${openaiKey ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   混元密钥: ${hunyuanKey ? '✅ 已配置' : '❌ 未配置'}`);

    // 2. 检查缓存目录
    console.log('\n2. 📁 缓存目录检查:');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const cacheDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ai-explorer-cache');
        try {
            const stat = await vscode.workspace.fs.stat(cacheDir);
            console.log(`   ✅ 缓存目录存在: ${cacheDir.fsPath}`);
            
            // 检查胶囊文件
            const files = await vscode.workspace.fs.readDirectory(cacheDir);
            const capsuleFiles = files.filter(([name]) => name.endsWith('.json'));
            console.log(`   📦 胶囊文件数量: ${capsuleFiles.length}`);
            
            if (capsuleFiles.length > 0) {
                console.log('   最近的胶囊文件:');
                capsuleFiles.slice(0, 3).forEach(([name]) => {
                    console.log(`     - ${name}`);
                });
            }
        } catch (error) {
            console.log(`   ❌ 缓存目录不存在或无法访问`);
        }
    } else {
        console.log('   ❌ 未打开工作区');
    }

    // 3. 模拟AI分析请求
    console.log('\n3. 🧠 AI分析测试:');
    try {
        const testPrompt = "请分析这个简单的JavaScript函数：function add(a, b) { return a + b; }";
        console.log(`   测试提示词: ${testPrompt.substring(0, 50)}...`);
        
        // 这里我们无法直接测试，因为需要实际的MultiProviderAIClient实例
        console.log('   ⏳ 需要在扩展内部进行实际测试');
        
    } catch (error) {
        console.log(`   ❌ AI测试失败: ${error.message}`);
    }

    // 4. 检查日志输出
    console.log('\n4. 📝 建议检查项:');
    console.log('   - 在VS Code开发者控制台中查找 "[EnhancedAnalysis]" 日志');
    console.log('   - 查找 "AI客户端未可用，跳过AI分析" 警告');
    console.log('   - 查找 "AI分析失败" 错误信息');
    console.log('   - 检查 "🧠 保存AI分析" 成功日志');

    console.log('\n=== 诊断完成 ===');
    return {
        hasAIConfig: !!(openaiKey || hunyuanKey),
        primaryProvider,
        cacheExists: !!workspaceFolder
    };
}

// 导出诊断函数
if (typeof module !== 'undefined') {
    module.exports = { diagnoseAIAnalysisCache };
}