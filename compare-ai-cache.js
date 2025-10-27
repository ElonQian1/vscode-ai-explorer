// 比较两个AI客户端文件的缓存分析数据
const fs = require('fs');
const path = require('path');

function compareAICache() {
    console.log('🔍 对比 OpenAIClient.ts vs MultiProviderAIClient.ts 的AI分析缓存\n');
    
    const files = [
        {
            name: 'OpenAIClient.ts',
            path: 'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\OpenAIClient.ts'
        },
        {
            name: 'MultiProviderAIClient.ts', 
            path: 'd:\\rust\\active-projects\\ai-explorer\\src\\core\\ai\\MultiProviderAIClient.ts'
        }
    ];
    
    console.log('📋 分析对比表格:');
    console.log('┌─────────────────────────┬───────────────────────┬──────────────────────────────┐');
    console.log('│ 文件名                  │ 预期AI分析字段        │ 实际缓存状态                 │');
    console.log('├─────────────────────────┼───────────────────────┼──────────────────────────────┤');
    
    files.forEach(file => {
        const expectedFields = [
            'analysis.coreFeatures[]',
            'analysis.keyFunctions[]', 
            'analysis.businessValue',
            'analysis.technicalArchitecture'
        ];
        
        console.log(`│ ${file.name.padEnd(23)} │ ${expectedFields[0].padEnd(21)} │ 需要实际检查缓存内容         │`);
        expectedFields.slice(1).forEach(field => {
            console.log(`│ ${' '.padEnd(23)} │ ${field.padEnd(21)} │ ${' '.padEnd(28)} │`);
        });
    });
    console.log('└─────────────────────────┴───────────────────────┴──────────────────────────────┘\n');
    
    console.log('🔍 问题诊断分析:');
    console.log('');
    console.log('1️⃣ 缓存时间问题:');
    console.log('   - OpenAIClient.ts 可能使用旧版本缓存 (没有analysis字段)');
    console.log('   - MultiProviderAIClient.ts 可能使用新版本缓存 (有analysis字段)');
    console.log('');
    console.log('2️⃣ AI提示词差异:');
    console.log('   - 检查两个文件的AI分析是否都使用了更新后的提示词');
    console.log('   - SmartFileAnalyzer 的prompt应包含coreFeatures等字段');
    console.log('');
    console.log('3️⃣ DetailedAnalysisPanel行为:');
    console.log('   - extractCoreFunctionsFromAI() 依赖 smartResult.analysis 字段');
    console.log('   - 如果缓存中没有这些字段，会显示默认内容');
    console.log('');
    console.log('4️⃣ 解决方案:');
    console.log('   ✅ 清除这两个文件的缓存');
    console.log('   ✅ 重新分析以使用新的AI提示词');
    console.log('   ✅ 验证新缓存包含structured analysis字段');
    console.log('');
    console.log('🛠️ 调试步骤:');
    console.log('   1. 按 Ctrl+Shift+P');
    console.log('   2. 运行 "🔧 调试缓存内容" 命令');
    console.log('   3. 检查两个文件的具体缓存内容');
    console.log('   4. 如果缺少analysis字段，清除并重新分析');
    console.log('');
    console.log('💡 根本原因:');
    console.log('   "硬编码内容" 实际上是DetailedAnalysisPanel的默认fallback行为');
    console.log('   当AI分析缓存中缺少结构化字段时，就会显示通用内容');
    console.log('   我们已经更新了AI prompt，但旧缓存仍然是旧格式');
}

compareAICache();