// scripts/test-new-files.ts
/**
 * 测试文档2中的4个文件翻译效果
 */

import { SmartRuleEngine } from '../src/features/explorer-alias/domain/policies/SmartRuleEngine';
import { tokenizeFileName } from '../src/shared/naming/NameTokenizer';

const engine = new SmartRuleEngine();

console.log('🧪 文档2 - 新文件翻译测试\n');
console.log('='.repeat(70));

const testCases = [
    {
        input: 'UniversalUIAPI.ts',
        expected: '通用UI API模块',
        description: '文档示例 1：PascalCase + 多缩写'
    },
    {
        input: 'UniversalUIService.ts',
        expected: '通用UI服务模块',
        description: '文档示例 2：PascalCase + Service'
    },
    {
        input: 'UniversalUIUtils.ts',
        expected: '通用UI工具模块',
        description: '文档示例 3：PascalCase + Utils'
    },
    {
        input: 'ContactAPI.ts',
        expected: '联系人API模块',
        description: '文档示例 4：PascalCase + Contact'
    }
];

let passedCount = 0;
let failedCount = 0;

for (const testCase of testCases) {
    console.log(`\n📝 ${testCase.description}`);
    console.log(`   输入: ${testCase.input}`);
    
    // 显示分词结果
    const { tokens, ext } = tokenizeFileName(testCase.input);
    console.log(`   分词: ${tokens.map(t => `${t.raw}(${t.type})`).join(', ')} | ext: ${ext}`);
    
    // 翻译
    const result = engine.translate(testCase.input);
    
    if (result) {
        // 移除空格进行比较（因为中文可能有空格差异）
        const normalizedResult = result.alias.replace(/\s+/g, '');
        const normalizedExpected = testCase.expected.replace(/\s+/g, '');
        const matched = normalizedResult === normalizedExpected;
        const icon = matched ? '✅' : '⚠️';
        
        console.log(`   ${icon} 翻译: ${result.alias} (置信度: ${(result.confidence * 100).toFixed(0)}%)`);
        
        if (!matched) {
            console.log(`   期望: ${testCase.expected}`);
            console.log(`   差异: "${normalizedResult}" vs "${normalizedExpected}"`);
            failedCount++;
        } else {
            passedCount++;
        }
        
        if (result.debug) {
            console.log(`   调试: ${result.debug}`);
        }
    } else {
        console.log(`   ❌ 翻译失败: 无法翻译`);
        console.log(`   期望: ${testCase.expected}`);
        failedCount++;
    }
}

console.log('\n' + '='.repeat(70));
console.log(`\n📊 测试结果：${passedCount} 通过 / ${failedCount} 失败 / ${testCases.length} 总计`);
console.log(`   通过率: ${((passedCount / testCases.length) * 100).toFixed(1)}%\n`);

if (failedCount === 0) {
    console.log('🎉 所有测试通过！\n');
    process.exit(0);
} else {
    console.log('⚠️ 部分测试失败，需要补充词典\n');
    process.exit(1);
}
