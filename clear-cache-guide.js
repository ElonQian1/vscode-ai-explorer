// 清除特定文件缓存的脚本 - 需要在VS Code扩展环境中运行

// 使用方法：
// 1. 在VS Code中按 Ctrl+Shift+P
// 2. 输入 "Developer: Reload Window" 重载窗口
// 3. 或者在扩展开发主机中执行以下逻辑

console.log('🧹 缓存清除指南');
console.log('');
console.log('由于缓存存储在VS Code的globalState中，需要通过扩展API清除。');
console.log('');
console.log('方法1: 使用内置调试命令');
console.log('1. 按 Ctrl+Shift+P 打开命令面板');
console.log('2. 搜索并执行: "🔧 调试缓存内容"');
console.log('3. 查看输出面板了解缓存状态');
console.log('');
console.log('方法2: 手动清除缓存');
console.log('1. 在AI Explorer树视图中找到这两个文件');
console.log('2. 右键点击 -> "清除节点缓存"');
console.log('3. 或执行 "aiExplorer.clearCacheForNode" 命令');
console.log('');
console.log('方法3: 强制重新分析');
console.log('1. 右键点击文件 -> "重新分析路径"');  
console.log('2. 这会清除缓存并触发新的AI分析');
console.log('');
console.log('📋 需要清除的文件:');
console.log('- OpenAIClient.ts');
console.log('- MultiProviderAIClient.ts');
console.log('');
console.log('🎯 验证步骤:');
console.log('1. 清除缓存后，右键文件选择 "查看详细分析"');
console.log('2. 点击 "核心功能" tab');
console.log('3. 应该看到AI生成的功能列表，不是硬编码说明');
console.log('');

// 缓存键信息
const crypto = require('crypto');
function hashPath(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
}

const files = [
    'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\OpenAIClient.ts',
    'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\MultiProviderAIClient.ts'
];

console.log('🔑 缓存键映射:');
files.forEach(file => {
    const hash = hashPath(file);
    const fileName = file.split('\\').pop();
    console.log(`${fileName}:`);
    console.log(`  缓存键: file-analysis-${hash}`);
    console.log(`  存储键: cache:file-analysis-${hash}`);
    console.log('');
});

console.log('⚡ 快速测试方案:');
console.log('如果想快速验证修复效果：');
console.log('1. 重命名其中一个文件 (临时)');
console.log('2. 改回原名');
console.log('3. 这会触发文件变更监听，清除旧缓存');
console.log('4. 然后进行AI分析测试');