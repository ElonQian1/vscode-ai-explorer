/**
 * 测试直译 Pro 版功能
 * 验证：
 * 1. 最长短语匹配（element hierarchy → 元素_层级）
 * 2. 形态归一化（elements → element, analyzing → analyze）
 * 3. 覆盖率计算
 */

import { DictionaryResolver } from '../src/shared/naming/DictionaryResolver';
import { LiteralAliasBuilderPro } from '../src/features/explorer-alias/domain/policies/LiteralAliasBuilderPro';

async function testProFeatures() {
    console.log('=== 测试直译 Pro 版功能 ===\n');

    // 1. 初始化 DictionaryResolver
    const resolver = new DictionaryResolver();
    
    // 手动加载测试词典（模拟从文件加载）
    const testDict = {
        words: {
            'element': { alias: '元素', confidence: 1.0 },
            'hierarchy': { alias: '层级', confidence: 1.0 },
            'analyze': { alias: '分析', confidence: 1.0 },
            'simple': { alias: '简版', confidence: 1.0 },
            'script': { alias: '脚本', confidence: 1.0 }
        },
        phrases: {
            'element hierarchy': { alias: '元素_层级', confidence: 1.0 }
        }
    };

    // 使用反射访问私有方法（仅用于测试）
    (resolver as any).mergeDictionary(testDict);

    console.log('✅ 词典加载完成');
    const stats = resolver.getStats();
    console.log(`   - 单词数: ${stats.wordCount}`);
    console.log(`   - 短语数: ${stats.phraseCount}\n`);

    // 2. 初始化 Pro 版构建器
    const builder = new LiteralAliasBuilderPro(resolver);
    builder.setJoiner('_'); // 使用下划线连接
    builder.setAppendExtSuffix(true);

    // 3. 测试用例
    const testCases = [
        {
            input: 'analyze_element_hierarchy.cjs',
            expectContains: '元素_层级', // 应该匹配短语
            description: '短语匹配测试'
        },
        {
            input: 'analyze_elements.ts', // elements（复数）→ element
            expectContains: '元素',
            description: '形态归一化测试（复数）'
        },
        {
            input: 'analyzing_script.py', // analyzing（动名词）→ analyze
            expectContains: '分析',
            description: '形态归一化测试（动名词）'
        },
        {
            input: 'simple_hierarchy.js',
            expectContains: '简版',
            description: '基本翻译测试'
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        const result = builder.buildLiteralAlias(testCase.input);
        const isPass = result.alias.includes(testCase.expectContains);
        
        if (isPass) {
            console.log(`✅ ${testCase.description}`);
            console.log(`   输入: ${testCase.input}`);
            console.log(`   输出: ${result.alias}`);
            console.log(`   覆盖率: ${(result.coverage * 100).toFixed(0)}%`);
            console.log(`   置信度: ${result.confidence}`);
            console.log(`   调试: ${result.debug}\n`);
            passed++;
        } else {
            console.log(`❌ ${testCase.description}`);
            console.log(`   输入: ${testCase.input}`);
            console.log(`   期望包含: ${testCase.expectContains}`);
            console.log(`   实际输出: ${result.alias}`);
            console.log(`   调试: ${result.debug}\n`);
            failed++;
        }
    }

    // 4. 测试单词解析（形态归一）
    console.log('=== 测试形态归一化 ===\n');
    const wordTests = [
        { input: 'element', expect: '元素' },
        { input: 'elements', expect: '元素' }, // 复数
        { input: 'hierarchy', expect: '层级' },
        { input: 'hierarchies', expect: '层级' }, // 复数
        { input: 'analyze', expect: '分析' },
        { input: 'analyzing', expect: '分析' }, // 动名词
        { input: 'analyzed', expect: '分析' } // 过去式
    ];

    for (const test of wordTests) {
        const entry = resolver.resolveWord(test.input);
        const actual = entry ? entry.alias : '未找到';
        const isPass = actual === test.expect;
        
        if (isPass) {
            console.log(`✅ ${test.input} → ${actual}`);
            passed++;
        } else {
            console.log(`❌ ${test.input} → ${actual} (期望: ${test.expect})`);
            failed++;
        }
    }

    // 5. 测试短语匹配
    console.log('\n=== 测试最长短语匹配 ===\n');
    const phraseTests = [
        {
            tokens: ['element', 'hierarchy'],
            startIndex: 0,
            expectAlias: '元素_层级',
            expectCount: 2
        }
    ];

    for (const test of phraseTests) {
        const [entry, count] = resolver.matchPhrase(test.tokens, test.startIndex);
        const actual = entry ? entry.alias : '未找到';
        const isPassAlias = actual === test.expectAlias;
        const isPassCount = count === test.expectCount;
        const isPass = isPassAlias && isPassCount;
        
        if (isPass) {
            console.log(`✅ [${test.tokens.join(', ')}] → ${actual} (匹配 ${count} 个词)`);
            passed++;
        } else {
            console.log(`❌ [${test.tokens.join(', ')}] → ${actual} (匹配 ${count} 个词)`);
            console.log(`   期望: ${test.expectAlias} (匹配 ${test.expectCount} 个词)`);
            failed++;
        }
    }

    // 总结
    console.log(`\n=== 测试总结 ===`);
    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log(`📊 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

    if (failed === 0) {
        console.log('\n🎉 所有测试通过！Pro 版功能正常工作。');
    } else {
        console.log(`\n⚠️ 有 ${failed} 个测试失败，请检查实现。`);
        process.exit(1);
    }
}

// 运行测试
testProFeatures().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});
