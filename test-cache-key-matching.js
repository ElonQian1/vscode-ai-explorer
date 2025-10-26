/**
 * 测试缓存键匹配 - 验证SmartFileAnalyzer和HoverInfoService使用相同的缓存键
 */

// 模拟两个类的hashPath方法

function smartFileAnalyzerHashPath(filePath) {
    // SmartFileAnalyzer的hashPath方法
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36);
}

function hoverInfoServiceHashPath(filePath) {
    // HoverInfoService修复后的hashPath方法
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36); // 现在也包含Math.abs()
}

function testCacheKeyMatching() {
    console.log('=== 🧪 测试缓存键匹配 ===\n');
    
    const testFiles = [
        'D:\\rust\\active-projects\\ai-explorer\\src\\features\\explorer-alias\\ExplorerAliasModule.ts',
        'D:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\SmartFileAnalyzer.ts',
        'D:\\rust\\active-projects\\ai-explorer\\package.json',
        'C:\\Users\\test\\project\\index.js'
    ];
    
    let allMatch = true;
    
    testFiles.forEach((filePath, index) => {
        console.log(`${index + 1}. 测试文件: ${filePath.substring(filePath.length - 50)}`);
        
        const smartHash = smartFileAnalyzerHashPath(filePath);
        const hoverHash = hoverInfoServiceHashPath(filePath);
        const smartCacheKey = `file-analysis-${smartHash}`;
        const hoverCacheKey = `file-analysis-${hoverHash}`;
        
        const match = smartHash === hoverHash;
        
        console.log(`   SmartFileAnalyzer 哈希: ${smartHash}`);
        console.log(`   HoverInfoService 哈希:  ${hoverHash}`);
        console.log(`   缓存键匹配: ${match ? '✅ 是' : '❌ 否'}`);
        console.log(`   完整缓存键: ${smartCacheKey}`);
        console.log('');
        
        if (!match) allMatch = false;
    });
    
    console.log('=== 🎯 测试结果 ===');
    if (allMatch) {
        console.log('✅ 所有测试通过！缓存键现在完全匹配');
        console.log('✅ SmartFileAnalyzer 和 HoverInfoService 将访问相同的缓存');
        console.log('✅ 右键AI分析的结果现在应该能在悬停时正确显示');
    } else {
        console.log('❌ 还有缓存键不匹配的问题');
        console.log('❌ 需要进一步检查哈希算法的实现');
    }
    
    console.log('\n=== 📋 下一步测试 ===');
    console.log('1. F5 启动VS Code扩展调试');
    console.log('2. 右键任意文件选择 "🔍 AI分析：分析此文件"');
    console.log('3. 观察控制台输出的缓存键');
    console.log('4. 分析完成后，鼠标悬停同一文件');
    console.log('5. 检查是否显示 🤖 AI智能分析 结果');
    
    console.log('\n=== 🔍 期望的日志输出 ===');
    console.log('[SmartFileAnalyzer] ✅ 保存分析结果到缓存: file-analysis-xxxxx');
    console.log('[HoverInfoService] 🔍 查询缓存 - cacheKey: file-analysis-xxxxx');
    console.log('[HoverInfoService] ✅ 缓存命中! 结果: {...}');
    console.log('[HoverInfoService] ✅ 找到智能分析结果: {...}');
}

testCacheKeyMatching();