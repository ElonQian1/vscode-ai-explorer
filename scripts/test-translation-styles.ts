// scripts/test-translation-styles.ts
/**
 * 测试翻译风格功能
 * 验证文档中的示例：analyze_element_hierarchy.cjs 和 analyze_hierarchy_simple.cjs
 */

import { buildLiteralAlias } from '../src/features/explorer-alias/domain/policies/LiteralAliasBuilder';
import { SmartRuleEngine } from '../src/features/explorer-alias/domain/policies/SmartRuleEngine';
import { isCoverageSufficient, getCoverageDetails } from '../src/features/explorer-alias/domain/policies/CoverageGuard';

const testCases = [
    {
        fileName: 'analyze_element_hierarchy.cjs',
        expected: {
            natural: '元素层级分析脚本',  // 自然中文（补充了 element）
            literal: '分析元素层级脚本'   // 直译
        }
    },
    {
        fileName: 'analyze_hierarchy_simple.cjs',
        expected: {
            natural: '层级分析（简版）脚本',
            literal: '分析层级简版脚本'
        }
    },
    {
        fileName: 'UniversalUIAPI.ts',
        expected: {
            natural: '通用UIAPI模块',
            literal: '通用UIAPI模块'
        }
    },
    {
        fileName: 'ContactAPI.ts',
        expected: {
            natural: '联系人API模块',
            literal: '联系人API模块'
        }
    }
];

console.log('🧪 翻译风格测试\n');
console.log('=' .repeat(80));

const smartEngine = new SmartRuleEngine();
let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
    console.log(`\n📝 测试用例: ${testCase.fileName}`);
    console.log('-'.repeat(80));
    
    // 1. 测试自然中文风格（SmartRuleEngine）
    const naturalResult = smartEngine.translate(testCase.fileName);
    const naturalTranslation = naturalResult?.alias || '(未匹配)';
    const naturalMatch = naturalTranslation.includes(testCase.expected.natural.replace(/[（）]/g, '')) || 
                         naturalTranslation === testCase.expected.natural;
    
    console.log(`📌 自然中文风格:`);
    console.log(`   翻译: ${naturalTranslation}`);
    console.log(`   期望: ${testCase.expected.natural}`);
    console.log(`   状态: ${naturalMatch ? '✅ 通过' : '⚠️  不完全匹配'}`);
    if (naturalResult?.debug) {
        console.log(`   调试: ${naturalResult.debug}`);
    }
    
    // 覆盖度检查
    const coverage = getCoverageDetails(testCase.fileName, naturalTranslation);
    console.log(`   覆盖度: ${(coverage.coverageRate * 100).toFixed(0)}% (${coverage.coveredTokens}/${coverage.totalTokens})`);
    if (coverage.missedTokens.length > 0) {
        console.log(`   漏词: ${coverage.missedTokens.join(', ')}`);
    }
    
    // 2. 测试直译风格（LiteralAliasBuilder）
    const literalResult = buildLiteralAlias(testCase.fileName);
    const literalMatch = literalResult.alias === testCase.expected.literal;
    
    console.log(`\n📌 直译风格:`);
    console.log(`   翻译: ${literalResult.alias}`);
    console.log(`   期望: ${testCase.expected.literal}`);
    console.log(`   状态: ${literalMatch ? '✅ 通过' : '⚠️  不匹配'}`);
    console.log(`   调试: ${literalResult.debug}`);
    console.log(`   置信度: ${(literalResult.confidence * 100).toFixed(0)}%`);
    
    // 覆盖度检查
    const literalCoverage = isCoverageSufficient(testCase.fileName, literalResult.alias);
    console.log(`   覆盖度: ${literalCoverage ? '✅ 充分' : '❌ 不足'}`);
    
    if (naturalMatch && literalMatch) {
        passCount++;
    } else {
        failCount++;
    }
}

console.log('\n' + '='.repeat(80));
console.log(`📊 测试结果：${passCount} 通过 / ${failCount} 失败 / ${testCases.length} 总计`);
console.log(`通过率: ${(passCount / testCases.length * 100).toFixed(1)}%`);

if (failCount === 0) {
    console.log('\n🎉 所有测试通过！');
} else {
    console.log('\n⚠️  部分测试未通过，请检查实现。');
}
