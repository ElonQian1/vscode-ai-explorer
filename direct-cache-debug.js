// 直接调试两个AI客户端文件的缓存内容
// 这个脚本需要在VS Code扩展环境中运行

const path = require('path');

// 模拟缓存键生成
function hashPath(filePath) {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36);
}

function getCacheKey(filePath) {
    return `file-analysis-${hashPath(filePath)}`;
}

function debugCache() {
    console.log('🔍 缓存键调试分析\n');
    
    const files = [
        'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\OpenAIClient.ts',
        'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\MultiProviderAIClient.ts'
    ];
    
    console.log('📋 缓存键生成测试:');
    console.log('┌─────────────────────────┬──────────────────────────────────┐');
    console.log('│ 文件名                  │ 生成的缓存键                     │');
    console.log('├─────────────────────────┼──────────────────────────────────┤');
    
    for (const filePath of files) {
        const fileName = path.basename(filePath);
        const hash = hashPath(filePath);
        const cacheKey = getCacheKey(filePath);
        
        console.log(`│ ${fileName.padEnd(23)} │ ${cacheKey.padEnd(32)} │`);
    }
    console.log('└─────────────────────────┴──────────────────────────────────┘\n');
    
    console.log('🧪 缓存验证信息:');
    console.log('');
    console.log('📝 检查要点:');
    console.log('   1. moduleId: "smart-analyzer"');
    console.log('   2. 键格式: "file-analysis-{hash}"'); 
    console.log('   3. 预期字段: smartResult.analysis.coreFeatures[]');
    console.log('   4. 预期字段: smartResult.analysis.keyFunctions[]');
    console.log('   5. 预期字段: smartResult.analysis.businessValue');
    console.log('   6. 预期字段: smartResult.analysis.technicalArchitecture');
    console.log('');
    console.log('🚨 症状诊断:');
    console.log('   ❌ 如果显示硬编码内容 → 缓存中缺少analysis字段');
    console.log('   ✅ 如果显示AI分析内容 → 缓存正确包含结构化数据');
    console.log('');
    console.log('🛠️ 立即解决方案:');
    console.log('   1. 在VS Code中按 Ctrl+Shift+P');
    console.log('   2. 运行命令: "🔧 调试缓存内容"');
    console.log('   3. 查看具体缓存内容');
    console.log('   4. 如需清除: "Clear AI Explorer Analysis Cache"');
    console.log('   5. 重新分析这两个文件');
    
    // 生成清除命令
    console.log('');
    console.log('🗑️ 清除命令生成:');
    for (const filePath of files) {
        const fileName = path.basename(filePath);
        console.log(`   - ${fileName}: 右键 → "🤖 AI智能分析"`);
    }
}

debugCache();