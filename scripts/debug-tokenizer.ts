// scripts/debug-tokenizer.ts
import { tokenizeFileName } from '../src/shared/naming/NameTokenizer';

const testCases = [
    'UniversalUIAPI.ts',
    'UIAPI.ts',
    'ContactAPI.ts',
    'UniversalUIService.ts'
];

console.log('=== 分词器调试 ===\n');

for (const test of testCases) {
    const result = tokenizeFileName(test);
    console.log(`${test}:`);
    console.log(`  tokens: ${result.tokens.map(t => `${t.raw}(${t.type})`).join(', ')}`);
    console.log(`  ext: ${result.ext}\n`);
}
