#!/usr/bin/env node
/**
 * 🧪 AI分析功能快速测试脚本
 * 这个脚本可以验证右键AI分析功能是否正常工作
 */

const vscode = require('vscode');

// 模拟测试AI分析命令
async function testAnalyzeCommand() {
    console.log('🧪 开始测试AI分析功能...\n');
    
    try {
        // 测试命令是否存在
        console.log('1. 📋 检查命令注册...');
        const commands = await vscode.commands.getCommands();
        const analyzeCommands = commands.filter(cmd => cmd.startsWith('aiExplorer.analyze'));
        
        if (analyzeCommands.length > 0) {
            console.log('✅ 发现AI分析命令:', analyzeCommands);
        } else {
            console.log('❌ 未发现AI分析命令');
            return;
        }
        
        // 测试命令执行
        console.log('\n2. 🚀 测试命令执行...');
        const testFile = __filename; // 使用当前文件进行测试
        
        console.log(`测试文件: ${testFile}`);
        
        // 执行分析命令
        await vscode.commands.executeCommand('aiExplorer.analyzePath', vscode.Uri.file(testFile));
        
        console.log('✅ 命令执行完成');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error('详细错误:', error);
    }
}

// 如果在VS Code扩展环境中运行
if (typeof vscode !== 'undefined') {
    testAnalyzeCommand();
} else {
    console.log('⚠️  此脚本需要在VS Code扩展环境中运行');
    console.log('📖 使用方法:');
    console.log('1. 按F5启动扩展调试');
    console.log('2. 在Extension Development Host中右键文件');
    console.log('3. 选择 "🔍 AI 分析：分析此文件"');
}