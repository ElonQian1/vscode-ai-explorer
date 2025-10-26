/**
 * 🔍 调试Hover显示问题
 * 检查为什么分析后tooltip不显示正确状态
 */
const path = require('path');

// 测试文件路径
const testFile = path.resolve(__dirname, 'scripts', 'test-ai-fallback-enhanced.ts');
console.log(`🎯 测试文件: ${testFile}`);

// 计算缓存键
function computeCacheKey(filePath) {
    const relativePath = path.relative(__dirname, filePath);
    let hash = 0;
    for (let i = 0; i < relativePath.length; i++) {
        const char = relativePath.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = Math.abs(hash); // 确保是正数
    }
    const shortHash = hash.toString(36).substring(0, 6);
    return `file-analysis-${shortHash}`;
}

const cacheKey = computeCacheKey(testFile);
console.log(`🔑 缓存键: ${cacheKey}`);

console.log('\n📋 Debug Console 命令:');
console.log('// 1. 获取extension实例');
console.log("const ext = vscode.extensions.getExtension('elonqian1.ai-explorer');");
console.log('console.log("Extension:", ext?.isActive);');

console.log('\n// 2. 检查globalState');
console.log('const globalState = ext.exports?.context?.globalState || ext.context?.globalState;');
console.log('console.log("GlobalState:", !!globalState);');

console.log('\n// 3. 检查缓存');
console.log(`const result = globalState?.get('smart-analyzer:${cacheKey}');`);
console.log('console.log("Cache result:", result);');

console.log('\n// 4. 检查所有相关keys');
console.log('const allKeys = globalState?.keys() || [];');
console.log('const smartKeys = allKeys.filter(k => k.includes("smart-analyzer"));');
console.log('console.log("Smart analyzer keys:", smartKeys);');

console.log('\n// 5. 检查HoverInfoService');
console.log('// 如果缓存存在但tooltip不工作，检查HoverInfoService.getExistingTooltip()');

console.log('\n✅ 执行上述命令后报告结果');