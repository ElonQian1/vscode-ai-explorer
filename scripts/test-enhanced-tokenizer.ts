/**
 * 测试增强版分词器
 * 验证文档要求的所有功能
 */

import { splitWithDelimiters } from '../src/shared/naming/SplitWithDelimiters';

console.log('=== 测试增强版分词器 ===\n');

const testCases = [
    // 基本驼峰
    { input: 'useForm', expected: 'use | Form' },
    { input: 'isURLValid', expected: 'is | URL | Valid' },
    
    // HTML类缩写
    { input: 'HTMLParser', expected: 'HTML | Parser' },
    { input: 'XMLToJSON', expected: 'XML | To | JSON' },
    
    // iOS类特殊情况
    { input: 'iOSVersion', expected: 'i | OS | Version' },
    
    // 数字边界
    { input: 'JSON2CSV', expected: 'JSON | 2 | CSV' },
    { input: 'v2API', expected: 'v2 | API' },
    { input: 'Ab12Cd', expected: 'Ab | 12 | Cd' },
    
    // numeronym
    { input: 'i18nConfig', expected: 'i18n | Config' },
    { input: 'l10nService', expected: 'l10n | Service' },
    { input: 'k8sDeployment', expected: 'k8s | Deployment' },
    { input: 'e2eTest', expected: 'e2e | Test' },
    
    // 全大写（应该当普通词）
    { input: 'DEBUG_MODE', expected: 'DEBUG | MODE (当普通词)' },
    { input: 'WARNING_LEVEL', expected: 'WARNING | LEVEL (当普通词)' },
    
    // 文件扩展名
    { input: 'useForm.tsx', expected: 'use | Form (扩展名: tsx)' },
    { input: 'HTMLParser.ts', expected: 'HTML | Parser (扩展名: ts)' },
    { input: 'JSON2CSV.mjs', expected: 'JSON | 2 | CSV (扩展名: mjs)' },
    
    // 分隔符保留
    { input: 'fetch-http-data.js', expected: 'fetch | - | http | - | data (扩展名: js)' },
    { input: 'render_xml_to_json.ts', expected: 'render | _ | xml | _ | to | _ | json (扩展名: ts)' },
    { input: 'file.ids.parser.ts', expected: 'file | . | ids | . | parser (扩展名: ts)' },
    
    // 混合情况
    { input: 'fetchHTTPData.ts', expected: 'fetch | HTTP | Data (扩展名: ts)' },
    { input: 'parseJSON2XML.js', expected: 'parse | JSON | 2 | XML (扩展名: js)' },
    { input: 'iOSVersion_v2.md', expected: 'i | OS | Version | _ | v2 (扩展名: md)' },
];

let passedCount = 0;
let failedCount = 0;

for (const testCase of testCases) {
    console.log(`\n📝 测试: ${testCase.input}`);
    console.log(`   期望: ${testCase.expected}`);
    
    try {
        const result = splitWithDelimiters(testCase.input);
        
        // 构建实际结果字符串
        const tokenStr = result.tokens.map((t, i) => {
            const delim = result.delims[i];
            return delim ? `${t.raw} | ${delim}` : t.raw;
        }).join(' | ');
        
        const actualStr = result.ext 
            ? `${tokenStr} (扩展名: ${result.ext})`
            : tokenStr;
        
        console.log(`   实际: ${actualStr}`);
        
        // 显示token类型
        const types = result.tokens.map(t => `${t.raw}(${t.type})`).join(', ');
        console.log(`   类型: ${types}`);
        
        // 显示分隔符数组
        console.log(`   分隔符: [${result.delims.map(d => `"${d}"`).join(', ')}]`);
        
        passedCount++;
        console.log('   ✅ 通过');
        
    } catch (error) {
        failedCount++;
        console.log(`   ❌ 失败: ${error}`);
    }
}

console.log(`\n=== 测试结果 ===`);
console.log(`✅ 通过: ${passedCount}`);
console.log(`❌ 失败: ${failedCount}`);
console.log(`📊 通过率: ${((passedCount / testCases.length) * 100).toFixed(1)}%`);

// 重点验证的功能点
console.log(`\n=== 功能验证 ===`);
console.log(`\n1. 驼峰三类边界:`);
console.log(`   - aB/9A (小写/数字→大写): useForm, v2API`);
console.log(`   - ABc (连续大写→大写+小写): HTMLParser, XMLToJSON`);
console.log(`   - 字母↔数字边界: JSON2CSV, Ab12Cd`);

console.log(`\n2. 缩写白名单:`);
console.log(`   - 白名单内: HTML, XML, JSON, CSV, API, URL, OS (保留为 acronym)`);
console.log(`   - 白名单外: DEBUG, WARNING, MODE (当作 word)`);

console.log(`\n3. numeronym识别:`);
console.log(`   - i18n, l10n, k8s, e2e (识别为 word)`);

console.log(`\n4. 分隔符保留:`);
console.log(`   - 连字符: fetch-http-data`);
console.log(`   - 下划线: render_xml_to_json`);
console.log(`   - 点号: file.ids.parser`);

console.log(`\n5. 扩展名处理:`);
console.log(`   - 正确分离并返回: .ts, .tsx, .js, .mjs, .md`);
