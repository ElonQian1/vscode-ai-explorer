/**
 * 测试"死板又快"的直译 V2 功能
 * 
 * 验证功能：
 * 1. 保留分隔符（analyze_element → 分析_元素）
 * 2. 保留扩展名（.cjs → .cjs）
 * 3. 返回未知词列表
 * 4. AI 兜底模拟（只补缺词）
 * 5. 学习词典写入
 */

import { DictionaryResolver } from '../src/shared/naming/DictionaryResolver';
import { LiteralAliasBuilderV2 } from '../src/features/explorer-alias/domain/policies/LiteralAliasBuilderV2';
import { splitWithDelimiters, rebuildWithDelimiters } from '../src/shared/naming/SplitWithDelimiters';

async function testDeadSimpleFast() {
    console.log('=== 测试"死板又快"直译 V2 功能 ===\n');

    // 1. 测试分词器（保留分隔符）
    console.log('【测试1】分词器（保留分隔符）');
    const testFiles = [
        'analyze_element_hierarchy.cjs',
        'simple-example-test.js',
        'UserAPI.handler.ts',
        'get.user.info.py'
    ];

    for (const file of testFiles) {
        const { tokens, delims, ext } = splitWithDelimiters(file);
        const tokenStrings = tokens.map(t => t.raw);
        console.log(`  ${file}`);
        console.log(`    tokens: [${tokenStrings.join(', ')}]`);
        console.log(`    delims: [${delims.map(d => d || '∅').join(', ')}]`);
        console.log(`    ext: ${ext}\n`);
    }

    // 2. 初始化词典解析器
    console.log('【测试2】词典解析器初始化');
    const resolver = new DictionaryResolver();
    
    // 手动加载测试词典
    const testDict = {
        words: {
            'analyze': { alias: '分析', confidence: 1.0 },
            'element': { alias: '元素', confidence: 1.0 },
            'hierarchy': { alias: '层级', confidence: 1.0 },
            'simple': { alias: '简版', confidence: 1.0 },
            'example': { alias: '示例', confidence: 1.0 },
            'test': { alias: '测试', confidence: 1.0 },
            'user': { alias: '用户', confidence: 1.0 },
            'api': { alias: 'API', confidence: 1.0 },
            'handler': { alias: '处理器', confidence: 1.0 }
        },
        phrases: {
            'element hierarchy': { alias: '元素_层级', confidence: 1.0 }
        }
    };

    (resolver as any).mergeDictionary(testDict);
    console.log(`  ✅ 词典加载完成: ${resolver.getStats().wordCount} 个单词, ${resolver.getStats().phraseCount} 个短语\n`);

    // 3. 测试 V2 构建器（保留分隔符）
    console.log('【测试3】V2 构建器（保留分隔符）');
    const builder = new LiteralAliasBuilderV2(resolver);
    builder.setKeepExtension(true);

    const testCases = [
        {
            input: 'analyze_element_hierarchy.cjs',
            expectAlias: '分析_元素_层级.cjs',
            expectUnknown: 0,
            description: '下划线分隔 + 短语匹配'
        },
        {
            input: 'simple-example-test.js',
            expectAlias: '简版-示例-测试.js',
            expectUnknown: 0,
            description: '连字符分隔'
        },
        {
            input: 'UserAPI.handler.ts',
            expectAlias: '用户API.处理器.ts',
            expectUnknown: 0,
            description: '点分隔 + 驼峰'
        },
        {
            input: 'get.user.info.py',
            expectAlias: 'get.用户.info.py',
            expectUnknown: 2,  // get, info 未知
            description: '部分未知词'
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        const result = builder.buildLiteralAlias(testCase.input);
        const isAliasMatch = result.alias === testCase.expectAlias;
        const isUnknownMatch = result.unknownWords.length === testCase.expectUnknown;
        const isPass = isAliasMatch && isUnknownMatch;

        if (isPass) {
            console.log(`  ✅ ${testCase.description}`);
            console.log(`     输入: ${testCase.input}`);
            console.log(`     输出: ${result.alias}`);
            console.log(`     未知词: [${result.unknownWords.join(', ')}]`);
            console.log(`     覆盖率: ${(result.coverage * 100).toFixed(0)}%\n`);
            passed++;
        } else {
            console.log(`  ❌ ${testCase.description}`);
            console.log(`     输入: ${testCase.input}`);
            console.log(`     期望: ${testCase.expectAlias}`);
            console.log(`     实际: ${result.alias}`);
            console.log(`     期望未知词数: ${testCase.expectUnknown}`);
            console.log(`     实际未知词: [${result.unknownWords.join(', ')}] (${result.unknownWords.length}个)\n`);
            failed++;
        }
    }

    // 4. 测试重建（保留分隔符）
    console.log('【测试4】重建别名（保留分隔符）');
    const rebuildTests = [
        {
            mapped: ['分析', '元素', '层级'],
            delims: ['_', '_', ''],
            ext: 'cjs',
            expected: '分析_元素_层级.cjs'
        },
        {
            mapped: ['简版', '示例', '测试'],
            delims: ['-', '-', ''],
            ext: 'js',
            expected: '简版-示例-测试.js'
        }
    ];

    for (const test of rebuildTests) {
        const result = rebuildWithDelimiters(test.mapped, test.delims, test.ext, true);
        const isPass = result === test.expected;

        if (isPass) {
            console.log(`  ✅ ${result}`);
            passed++;
        } else {
            console.log(`  ❌ 期望: ${test.expected}, 实际: ${result}`);
            failed++;
        }
    }

    // 5. 模拟 AI 兜底流程
    console.log('\n【测试5】AI 兜底流程模拟');
    const fileName = 'get.user.info.py';
    const result1 = builder.buildLiteralAlias(fileName);
    
    console.log(`  步骤1: 首次翻译`);
    console.log(`    输入: ${fileName}`);
    console.log(`    输出: ${result1.alias}`);
    console.log(`    未知词: [${result1.unknownWords.join(', ')}]`);
    console.log(`    覆盖率: ${(result1.coverage * 100).toFixed(0)}%`);

    if (result1.unknownWords.length > 0) {
        console.log(`\n  步骤2: AI 兜底（模拟）`);
        const aiMappings = {
            'get': '获取',
            'info': '信息'
        };
        console.log(`    AI 返回: ${JSON.stringify(aiMappings)}`);

        // 写入学习词典（模拟）
        console.log(`\n  步骤3: 写入学习词典`);
        for (const [word, alias] of Object.entries(aiMappings)) {
            (resolver as any).wordMap.set(word, { alias });
            console.log(`    ${word} → ${alias}`);
        }

        // 重新翻译
        console.log(`\n  步骤4: 重新翻译`);
        const result2 = builder.buildLiteralAlias(fileName);
        console.log(`    输入: ${fileName}`);
        console.log(`    输出: ${result2.alias}`);
        console.log(`    未知词: [${result2.unknownWords.join(', ')}]`);
        console.log(`    覆盖率: ${(result2.coverage * 100).toFixed(0)}%`);

        if (result2.alias === '获取.用户.信息.py' && result2.unknownWords.length === 0) {
            console.log(`    ✅ AI 兜底成功！`);
            passed++;
        } else {
            console.log(`    ❌ AI 兜底失败`);
            failed++;
        }
    }

    // 总结
    console.log(`\n=== 测试总结 ===`);
    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log(`📊 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

    if (failed === 0) {
        console.log('\n🎉 所有测试通过！"死板又快"的直译 V2 功能正常工作。');
        console.log('\n核心特性验证通过：');
        console.log('  ✅ 保留原始分隔符（_ - .）');
        console.log('  ✅ 保留扩展名');
        console.log('  ✅ 返回未知词列表');
        console.log('  ✅ AI 兜底只补缺词');
        console.log('  ✅ 学习词典增强');
    } else {
        console.log(`\n⚠️ 有 ${failed} 个测试失败，请检查实现。`);
        process.exit(1);
    }
}

// 运行测试
testDeadSimpleFast().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});
