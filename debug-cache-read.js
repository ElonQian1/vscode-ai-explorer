/**
 * 🔍 直接测试HoverInfoService缓存读取
 */

console.log('🔍 测试HoverInfoService缓存读取');

// 模拟测试文件路径
const testFilePath = 'd:\\rust\\active-projects\\ai-explorer\\scripts\\test-ai-fallback-enhanced.ts';

// 计算缓存键
function hashPath(path) {
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
        const char = path.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

const cacheKey = `file-analysis-${hashPath(testFilePath)}`;
console.log('📁 测试文件:', testFilePath);
console.log('🔑 缓存键:', cacheKey);

// 测试说明
console.log('');
console.log('📋 手动测试步骤:');
console.log('1. F5 启动调试');
console.log('2. 右键该文件进行AI分析');
console.log('3. 在Debug Console执行:');
console.log(`   vscode.extensions.getExtension('elonqian1.ai-explorer').context.globalState.get('smart-analyzer:${cacheKey}')`);
console.log('4. 检查是否返回分析结果');
console.log('');

console.log('🔧 如果没有结果可能的原因:');
console.log('- SmartAnalyzer没有正确保存到globalState');
console.log('- 缓存键计算不一致'); 
console.log('- HoverInfoService读取逻辑有问题');
console.log('');

console.log('✅ 预期缓存内容示例:');
console.log('{');
console.log('  "purpose": "测试文件",');
console.log('  "source": "rule-based",');
console.log('  "importance": 6,');
console.log('  "analyzedAt": 1729936234066,');
console.log('  "tags": ["test", "typescript"]');
console.log('}');