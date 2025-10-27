// 临时分析工具 - 检查两个文件分析差异
const crypto = require('crypto');

// 复制SmartFileAnalyzer的哈希方法
function hashPath(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
}

// 两个文件路径
const openaiFile = 'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\OpenAIClient.ts';
const multiproviderFile = 'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\MultiProviderAIClient.ts';

console.log('🎯 问题分析：为什么两个文件"查看详细分析"效果不同？');
console.log('');

console.log('📊 分析对比表:');
console.log('┌──────────────────────────┬─────────────────────────┬─────────────────────────┐');
console.log('│ 对比项                   │ OpenAIClient.ts        │ MultiProviderAIClient.ts│');
console.log('├──────────────────────────┼─────────────────────────┼─────────────────────────┤');
console.log('│ 文件名模式匹配          │ 可能不匹配               │ 匹配                    │');
console.log('│ forceAIFiles 触发       │ 应该触发(/client\\.ts$/)  │ 应该触发                │');
console.log('│ AI分析提示词            │ 相同                     │ 相同                    │');
console.log('│ 缓存键计算              │ 不同哈希值              │ 不同哈希值              │');
console.log('└──────────────────────────┴─────────────────────────┴─────────────────────────┘');
console.log('');

// 计算缓存键
const openaiCacheKey = `file-analysis-${hashPath(openaiFile)}`;
const multiproviderCacheKey = `file-analysis-${hashPath(multiproviderFile)}`;

console.log('🔑 缓存键信息:');
console.log(`   OpenAIClient.ts: ${openaiCacheKey}`);
console.log(`   MultiProviderAIClient.ts: ${multiproviderCacheKey}`);
console.log('');

console.log('🚨 可能的问题原因:');
console.log('');
console.log('1. **AI提示词问题** (已修复✅):');
console.log('   - 之前缺少 coreFeatures, keyFunctions 等字段');
console.log('   - 现在已经更新提示词包含这些字段');
console.log('');
console.log('2. **文件名识别问题** (已修复✅):'); 
console.log('   - HoverInfoService中OpenAIClient.ts可能不被识别为AI客户端');
console.log('   - 已添加 openai + client 的模式匹配');
console.log('');
console.log('3. **缓存时机问题** (待验证❓):');
console.log('   - MultiProviderAIClient.ts 可能是用旧提示词生成的缓存');
console.log('   - OpenAIClient.ts 可能还没有AI分析缓存');
console.log('   - 需要清除缓存重新分析');
console.log('');
console.log('4. **DetailedAnalysisPanel问题** (已修复✅):');
console.log('   - 之前显示硬编码内容，现在改为从AI分析提取');
console.log('   - 但需要确保AI分析结果包含正确的结构化数据');
console.log('');

console.log('🔧 解决步骤:');
console.log('');
console.log('1. 执行 "🔧 调试缓存内容" 命令查看当前缓存状态');
console.log('2. 如果看到缓存来源是 "ast" 或 "rules"，说明没有AI分析');
console.log('3. 清除两个文件的缓存');
console.log('4. 重新触发AI分析');
console.log('5. 验证 "查看详细分析" 的核心功能tab效果');
console.log('');

console.log('💡 预期结果:');
console.log('   两个文件都应该显示AI生成的结构化核心功能列表，');
console.log('   而不是硬编码的说明文字！');
console.log('');

console.log('📋 VS Code GlobalState 存储键:');
console.log(`   cache:${openaiCacheKey}`);
console.log(`   cache:${multiproviderCacheKey}`);