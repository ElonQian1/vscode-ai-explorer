/**
 * 🔍 专门调试当前分析文件的缓存状态
 */

console.log('🔍 调试当前分析文件的缓存状态');
console.log('📁 目标文件: test-ai-fallback-enhanced.ts');
console.log('');

// 1. 计算缓存键
const filePath = 'd:\\rust\\active-projects\\ai-explorer\\scripts\\test-ai-fallback-enhanced.ts';

function hashPath(filePath) {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36);
}

const cacheKey = `file-analysis-${hashPath(filePath)}`;
console.log('🔑 计算出的缓存键:', cacheKey);

// 2. 提供Debug Console命令
console.log('');
console.log('📋 在Debug Console中执行以下命令:');
console.log('');
console.log('// 1. 检查Smart Analyzer缓存');
console.log(`vscode.extensions.getExtension('elonqian1.ai-explorer').context.globalState.get('smart-analyzer:${cacheKey}')`);
console.log('');
console.log('// 2. 检查所有smart-analyzer相关缓存');
console.log(`const keys = vscode.extensions.getExtension('elonqian1.ai-explorer').context.globalState.keys();`);
console.log(`keys.filter(k => k.includes('smart-analyzer'))`);
console.log('');
console.log('// 3. 检查文件分析相关的所有缓存');
console.log(`keys.filter(k => k.includes('file-analysis'))`);
console.log('');

console.log('✅ 如果返回结果，说明缓存正常');
console.log('❌ 如果返回undefined，可能的原因:');
console.log('   - SmartAnalyzer没有保存缓存');
console.log('   - 缓存键计算不一致');
console.log('   - Extension context访问问题');
console.log('');

console.log('🧪 进一步测试:');
console.log('   如果缓存存在但tooltip不显示,说明HoverInfoService读取有问题');
console.log('   如果缓存不存在,说明SmartAnalyzer保存有问题');