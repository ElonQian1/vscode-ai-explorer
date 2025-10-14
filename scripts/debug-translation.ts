// scripts/debug-translation.ts
import { SmartRuleEngine } from '../src/features/explorer-alias/domain/policies/SmartRuleEngine';
import { tokenizeFileName } from '../src/shared/naming/NameTokenizer';

const engine = new SmartRuleEngine();
const fileName = 'analyze_hierarchy_simple.cjs';

console.log('=== 调试翻译过程 ===\n');

// 分词
const { tokens, ext } = tokenizeFileName(fileName);
console.log('1. 分词结果:');
tokens.forEach((t, i) => {
    console.log(`   [${i}] ${t.raw} (${t.type}) → ${t.lower}`);
});
console.log(`   扩展名: ${ext}\n`);

// 翻译
const result = engine.translate(fileName);
console.log('2. 翻译结果:');
console.log(`   别名: ${result?.alias}`);
console.log(`   置信度: ${result?.confidence}`);
console.log(`   调试信息: ${result?.debug}\n`);

console.log('3. 期望结果: 层级分析（简版）脚本');
console.log(`4. 是否匹配: ${result?.alias === '层级分析（简版）脚本' ? '✅' : '❌'}`);
