#!/usr/bin/env ts-node
/**
 * 自动检测并修复 AI 提供商配置问题
 * 
 * 使用场景：
 * - 主提供商设置为 openai 但未配置 API Key
 * - 主提供商设置为 hunyuan 但未配置 API Key
 * - 同时配置了多个提供商但主提供商选择错误
 */

import * as vscode from 'vscode';

async function fixProviderConfig() {
    console.log('🔍 检查 AI 提供商配置...\n');
    
    const config = vscode.workspace.getConfiguration('aiExplorer');
    
    const primaryProvider = config.get<string>('provider.primary', 'openai');
    const openaiKey = config.get<string>('openaiApiKey');
    const hunyuanKey = config.get<string>('hunyuanApiKey');
    
    console.log('📋 当前配置:');
    console.log(`  主提供商: ${primaryProvider}`);
    console.log(`  OpenAI Key: ${openaiKey ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`  腾讯混元 Key: ${hunyuanKey ? '✅ 已配置' : '❌ 未配置'}\n`);
    
    // 检测问题
    const problems: string[] = [];
    
    if (!openaiKey && !hunyuanKey) {
        problems.push('❌ 未配置任何 AI 提供商的 API Key');
    } else if (primaryProvider === 'openai' && !openaiKey) {
        if (hunyuanKey) {
            problems.push('⚠️ 主提供商设置为 OpenAI，但未配置 OpenAI Key（已配置腾讯混元）');
        } else {
            problems.push('❌ 主提供商设置为 OpenAI，但未配置 OpenAI Key');
        }
    } else if (primaryProvider === 'hunyuan' && !hunyuanKey) {
        if (openaiKey) {
            problems.push('⚠️ 主提供商设置为腾讯混元，但未配置混元 Key（已配置 OpenAI）');
        } else {
            problems.push('❌ 主提供商设置为腾讯混元，但未配置混元 Key');
        }
    }
    
    if (problems.length === 0) {
        console.log('✅ 配置正常，无需修复！');
        return;
    }
    
    // 显示问题
    console.log('🚨 发现以下问题:');
    problems.forEach(p => console.log(`  ${p}`));
    console.log();
    
    // 自动修复
    console.log('🔧 尝试自动修复...\n');
    
    if (!openaiKey && !hunyuanKey) {
        console.log('❌ 无法自动修复：请先配置至少一个 AI 提供商的 API Key');
        console.log('\n💡 配置方法:');
        console.log('  1. 在 VS Code 中按 Ctrl+Shift+P（Mac: Cmd+Shift+P）');
        console.log('  2. 输入 "AI 资源管理器：设置 OpenAI Key" 或 "设置腾讯混元 Key"');
        console.log('  3. 输入你的 API Key');
    } else if (primaryProvider === 'openai' && !openaiKey && hunyuanKey) {
        console.log('✅ 检测到已配置腾讯混元，建议切换主提供商为 hunyuan');
        console.log('\n修复命令:');
        console.log('  await config.update("provider.primary", "hunyuan", vscode.ConfigurationTarget.Global);');
        
        // 在 VS Code 环境中执行
        await config.update('provider.primary', 'hunyuan', vscode.ConfigurationTarget.Global);
        console.log('\n✅ 已自动切换主提供商为腾讯混元！');
        
    } else if (primaryProvider === 'hunyuan' && !hunyuanKey && openaiKey) {
        console.log('✅ 检测到已配置 OpenAI，建议切换主提供商为 openai');
        console.log('\n修复命令:');
        console.log('  await config.update("provider.primary", "openai", vscode.ConfigurationTarget.Global);');
        
        await config.update('provider.primary', 'openai', vscode.ConfigurationTarget.Global);
        console.log('\n✅ 已自动切换主提供商为 OpenAI！');
    }
    
    console.log('\n🎉 修复完成！请重新尝试翻译。');
}

// VS Code 环境中运行
if (typeof vscode !== 'undefined') {
    fixProviderConfig().catch(console.error);
} else {
    console.log('⚠️ 此脚本需要在 VS Code 扩展环境中运行');
    console.log('请在扩展代码中调用此函数，或使用命令面板执行相关命令');
}

export { fixProviderConfig };
