// 诊断AI Explorer扩展状态
const fs = require('fs');
const path = require('path');

console.log('=== AI Explorer 扩展诊断 ===');

// 1. 检查编译输出
const outDir = path.join(__dirname, 'out');
console.log('\n1. 检查编译输出:');
try {
    const extensionJs = path.join(outDir, 'extension.js');
    if (fs.existsSync(extensionJs)) {
        console.log('✅ extension.js 存在');
        const stat = fs.statSync(extensionJs);
        console.log(`   大小: ${stat.size} bytes`);
        console.log(`   修改时间: ${stat.mtime}`);
    } else {
        console.log('❌ extension.js 不存在');
    }
} catch (error) {
    console.log(`❌ 检查编译输出失败: ${error.message}`);
}

// 2. 检查package.json
console.log('\n2. 检查package.json:');
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    console.log(`✅ 扩展名: ${packageJson.name}`);
    console.log(`✅ 版本: ${packageJson.version}`);
    console.log(`✅ 主入口: ${packageJson.main}`);
    console.log(`✅ 激活事件: ${packageJson.activationEvents.join(', ')}`);
    console.log(`✅ 注册命令数: ${packageJson.contributes.commands.length}`);
} catch (error) {
    console.log(`❌ 读取package.json失败: ${error.message}`);
}

// 3. 检查核心模块文件
console.log('\n3. 检查核心模块:');
const coreFiles = [
    'out/extension.js',
    'out/core/di/Container.js',
    'out/core/logging/Logger.js',
    'out/features/explorer-alias/ExplorerAliasModule.js',
    'out/features/filetree-blueprint/FileTreeBlueprintModule.js',
    'out/features/aiguard-stats/AIGuardStatsModule.js'
];

coreFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} 缺失`);
    }
});

console.log('\n=== 诊断完成 ===');