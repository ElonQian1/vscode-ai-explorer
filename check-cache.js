// 检查两个文件的缓存情况
const crypto = require('crypto');
const path = require('path');

// 复制SmartFileAnalyzer的哈希方法
function hashPath(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
}

// 两个文件路径
const openaiFile = 'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\OpenAIClient.ts';
const multiproviderFile = 'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\MultiProviderAIClient.ts';

// 计算缓存键
const openaiCacheKey = `file-analysis-${hashPath(openaiFile)}`;
const multiproviderCacheKey = `file-analysis-${hashPath(multiproviderFile)}`;

console.log('🔍 文件分析缓存键对比:');
console.log('');
console.log('📁 OpenAIClient.ts');
console.log(`   文件路径: ${openaiFile}`);
console.log(`   缓存键: ${openaiCacheKey}`);
console.log('');
console.log('📁 MultiProviderAIClient.ts');
console.log(`   文件路径: ${multiproviderFile}`);
console.log(`   缓存键: ${multiproviderCacheKey}`);
console.log('');

// 检查VS Code globalState中对应的存储键
console.log('🗄️ VS Code GlobalState 存储键:');
console.log(`   OpenAIClient: cache:${openaiCacheKey}`);
console.log(`   MultiProvider: cache:${multiproviderCacheKey}`);
console.log('');
console.log('💡 这些缓存存储在VS Code的globalState中，需要通过扩展API访问');
