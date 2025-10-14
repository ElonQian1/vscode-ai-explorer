// scripts/test-smart-translation.ts
/**
 * 测试脚本：验证智能翻译效果
 * 运行命令：npx ts-node scripts/test-smart-translation.ts
 */

import { SmartRuleEngine } from '../src/features/explorer-alias/domain/policies/SmartRuleEngine';
import { tokenizeFileName } from '../src/shared/naming/NameTokenizer';

const engine = new SmartRuleEngine();

console.log('🧪 智能翻译引擎测试\n');
console.log('=' .repeat(60));

// 文档中的三个示例
const testCases = [
    {
        input: 'analyze_hierarchy_simple.cjs',
        expected: '层级分析（简版）脚本',
        description: '文档示例 1：snake_case + 变体词'
    },
    {
        input: 'universal-analysis-status-section.tsx',
        expected: '通用分析状态区块组件',
        description: '文档示例 2：kebab-case + 多修饰词'
    },
    {
        input: 'StepCard.tsx',
        expected: '步骤卡片组件',
        description: '文档示例 3：PascalCase + 简单'
    },
    // 更多测试用例
    {
        input: 'APIController.ts',
        expected: 'API控制器模块',
        description: '缩写识别：API'
    },
    {
        input: 'user-list-view.tsx',
        expected: '列表视图组件',
        description: 'kebab-case：多名词'
    },
    {
        input: 'data_processor.js',
        expected: '数据处理器脚本',
        description: 'snake_case：处理器'
    },
    {
        input: 'config.json',
        expected: '配置',
        description: '单词 + 配置文件'
    },
    {
        input: 'UserProfile.tsx',
        expected: '组件',
        description: 'PascalCase：未知词'
    },
    {
        input: 'test_util.ts',
        expected: '工具（测试）模块',
        description: '变体词测试'
    },
    {
        input: 'global-user-manager.ts',
        expected: '全局管理器模块',
        description: '形容词 + 名词 + 中心词'
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
        const matched = result.alias === testCase.expected;
        const icon = matched ? '✅' : '⚠️';
        
        console.log(`   ${icon} 翻译: ${result.alias} (置信度: ${(result.confidence * 100).toFixed(0)}%)`);
        
        if (!matched) {
            console.log(`   期望: ${testCase.expected}`);
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

console.log('\n' + '='.repeat(60));
console.log(`\n📊 测试结果：${passedCount} 通过 / ${failedCount} 失败 / ${testCases.length} 总计`);
console.log(`   通过率: ${((passedCount / testCases.length) * 100).toFixed(1)}%\n`);

if (failedCount === 0) {
    console.log('🎉 所有测试通过！\n');
    process.exit(0);
} else {
    console.log('⚠️ 部分测试失败，需要调整词典或规则\n');
    process.exit(1);
}
