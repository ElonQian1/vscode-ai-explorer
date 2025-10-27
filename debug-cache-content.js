const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function debugCacheContent() {
    console.log('🔍 开始调试缓存内容...\n');
    
    // 模拟KVCache的key生成逻辑
    function generateCacheKey(filePath) {
        return crypto.createHash('md5').update(filePath).digest('hex');
    }
    
    const files = [
        'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\OpenAIClient.ts',
        'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\MultiProviderAIClient.ts'
    ];
    
    console.log('📊 缓存键值对照表:');
    console.log('┌─────────────────────────┬──────────────────────────────────┐');
    console.log('│ 文件                    │ MD5 缓存键                       │');
    console.log('├─────────────────────────┼──────────────────────────────────┤');
    
    for (const filePath of files) {
        const key = generateCacheKey(filePath);
        const fileName = path.basename(filePath);
        console.log(`│ ${fileName.padEnd(23)} │ ${key} │`);
    }
    console.log('└─────────────────────────┴──────────────────────────────────┘\n');
    
    // 尝试多种方式读取缓存
    console.log('🔍 尝试读取缓存内容...\n');
    
    // 方法1: 检查本地存储的缓存键
    console.log('🔑 生成的缓存键:');
    for (const filePath of files) {
        const key = generateCacheKey(filePath);
        console.log(`${path.basename(filePath)}: ${key}`);
    }
    
    // 方法2: 检查本地缓存文件
    const workspaceRoot = 'd:\\rust\\active-projects\\ai-explorer';
    const cacheDir = path.join(workspaceRoot, '.ai-explorer-cache');
    
    console.log(`📁 检查缓存目录: ${cacheDir}`);
    if (fs.existsSync(cacheDir)) {
        const cacheFiles = fs.readdirSync(cacheDir, { recursive: true });
        console.log('📄 缓存文件列表:', cacheFiles);
        
        // 查找可能的缓存文件
        for (const file of cacheFiles) {
            if (typeof file === 'string' && file.includes('.json')) {
                const fullPath = path.join(cacheDir, file);
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    console.log(`\n📄 文件: ${file}`);
                    console.log(`📝 内容预览: ${content.substring(0, 200)}...`);
                } catch (error) {
                    console.log(`❌ 读取文件失败: ${file} - ${error.message}`);
                }
            }
        }
    } else {
        console.log('❌ 缓存目录不存在');
    }
    
    // 方法3: 检查VS Code的globalStorage
    const userDataPath = process.env.VSCODE_USERDATA || path.join(process.env.APPDATA, 'Code', 'User');
    const globalStoragePath = path.join(userDataPath, 'globalStorage');
    
    console.log(`\n📁 检查全局存储: ${globalStoragePath}`);
    if (fs.existsSync(globalStoragePath)) {
        const extensions = fs.readdirSync(globalStoragePath);
        const aiExplorerDirs = extensions.filter(dir => dir.includes('ai-explorer') || dir.includes('elonqian1'));
        
        console.log('🔍 找到相关扩展目录:', aiExplorerDirs);
        
        for (const dir of aiExplorerDirs) {
            const extPath = path.join(globalStoragePath, dir);
            try {
                const files = fs.readdirSync(extPath);
                console.log(`📂 ${dir} 中的文件:`, files);
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(extPath, file);
                        const content = fs.readFileSync(filePath, 'utf8');
                        console.log(`\n📄 ${dir}/${file}:`);
                        console.log(`📝 内容: ${content.substring(0, 300)}...`);
                    }
                }
            } catch (error) {
                console.log(`❌ 读取目录失败: ${dir} - ${error.message}`);
            }
        }
    }
    
    console.log('\n✅ 缓存内容调试完成');
}

// 执行调试
debugCacheContent();