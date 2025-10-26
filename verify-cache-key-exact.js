/**
 * 🔍 精确验证缓存键不匹配问题
 */
const path = require('path');

console.log('🎯 精确验证缓存键计算');

// 分析的文件路径（从日志中获取）
const analyzedFile = 'd:\\rust\\active-projects\\ai-explorer\\scripts\\test-ai-fallback-enhanced.ts';
console.log('📁 分析的文件:', analyzedFile);

// SmartFileAnalyzer的hashPath实现（从源码中复制）
function smartFileAnalyzerHash(filePath) {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36);
}

// HoverInfoService的hashPath实现（从源码中复制）  
function hoverInfoServiceHash(filePath) {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36);
}

// 测试不同的路径格式
const testPaths = [
    analyzedFile,  // 原始路径
    path.normalize(analyzedFile),  // 标准化路径
    analyzedFile.replace(/\\/g, '/'),  // 正斜杠路径
    path.posix.normalize(analyzedFile.replace(/\\/g, '/')),  // POSIX标准化
];

console.log('\n📊 测试不同路径格式的hash结果:');
testPaths.forEach((testPath, index) => {
    const smartHash = smartFileAnalyzerHash(testPath);
    const hoverHash = hoverInfoServiceHash(testPath);
    const smartKey = `file-analysis-${smartHash}`;
    const hoverKey = `file-analysis-${hoverHash}`;
    
    console.log(`\n${index + 1}. 路径: ${testPath}`);
    console.log(`   Smart哈希: ${smartHash}`);
    console.log(`   Hover哈希: ${hoverHash}`);
    console.log(`   缓存键: ${smartKey}`);
    console.log(`   匹配: ${smartHash === hoverHash ? '✅' : '❌'}`);
    
    // 检查是否与日志中的缓存键匹配
    if (smartKey === 'file-analysis-yekbm7') {
        console.log(`   🎯 这个就是日志中的缓存键！`);
    }
});

console.log('\n🔍 查找日志中的缓存键 "yekbm7":');
console.log('如果上面没有找到匹配的，说明路径处理可能还有其他差异');

// 尝试相对路径
const workspaceRoot = 'd:\\rust\\active-projects\\ai-explorer';
const relativePath = path.relative(workspaceRoot, analyzedFile);
console.log('\n📁 相对路径测试:');
console.log(`工作区根目录: ${workspaceRoot}`);
console.log(`相对路径: ${relativePath}`);

const relativeHash = smartFileAnalyzerHash(relativePath);
const relativeKey = `file-analysis-${relativeHash}`;
console.log(`相对路径哈希: ${relativeHash}`);  
console.log(`相对路径缓存键: ${relativeKey}`);
if (relativeKey === 'file-analysis-yekbm7') {
    console.log('🎯 找到了！SmartFileAnalyzer使用的是相对路径！');
}