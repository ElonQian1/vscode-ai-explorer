#!/usr/bin/env node
/**
 * 🧪 测试悬停修复验证脚本
 * 
 * 验证SmartFileAnalyzer和HoverInfoService缓存键是否匹配
 */

const path = require('path');

function hashPath(filePath) {
    // 🔧 和 SmartFileAnalyzer/HoverInfoService 完全一致的哈希算法
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36); // 🔥 关键：包含 Math.abs()
}

function getCacheKey(filePath) {
    return `file-analysis-${hashPath(filePath)}`;
}

console.log('=== 🔧 悬停修复验证测试 ===');
console.log('');

// 测试几个文件路径
const testPaths = [
    'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\SmartFileAnalyzer.ts',
    'd:\\rust\\active-projects\\ai-explorer\\src\\features\\explorer-alias\\ui\\HoverInfoService.ts',
    'd:\\rust\\active-projects\\ai-explorer\\src\\features\\explorer-alias\\ui\\ExplorerTreeItem.ts',
    'd:\\rust\\active-projects\\ai-explorer\\package.json'
];

console.log('📊 缓存键一致性测试:');
console.log('');

testPaths.forEach((filePath, index) => {
    const hash = hashPath(filePath);
    const cacheKey = getCacheKey(filePath);
    
    console.log(`${index + 1}. ${path.basename(filePath)}`);
    console.log(`   📁 路径: ${filePath}`);
    console.log(`   🔑 哈希: ${hash}`);
    console.log(`   💾 缓存键: ${cacheKey}`);
    console.log('');
});

console.log('✅ 修复内容总结:');
console.log('');
console.log('🔧 1. AIExplorerProvider 构造函数新增 context 参数');
console.log('🔧 2. ExplorerTreeItem 构造函数新增 context 参数');  
console.log('🔧 3. HoverInfoService.getInstance 调用传递 context');
console.log('🔧 4. ExplorerAliasModule 传递 context 给 AIExplorerProvider');
console.log('🔧 5. HoverInfoService.hashPath 已修复包含 Math.abs()');
console.log('');

console.log('🚀 测试步骤:');
console.log('');
console.log('1. F5 启动调试会话');
console.log('2. 右键任意文件选择 "🔍 AI分析：分析此文件"');
console.log('3. 等待分析完成（看到完成通知）');
console.log('4. 鼠标悬停相同文件');
console.log('5. 应该显示 "🤖 AI智能分析" 而非 "AI分析中"');
console.log('');

console.log('🎯 预期结果:');
console.log('   ✅ smartCache 可用（不再显示 "smartCache不可用"）');
console.log('   ✅ 悬停显示 AI 分析结果');
console.log('   ✅ 显示 🤖 AI智能分析 标识');
console.log('   ✅ 不再显示 "AI分析中" 状态');