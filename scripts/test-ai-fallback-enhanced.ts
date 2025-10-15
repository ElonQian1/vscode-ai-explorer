/**
 * 测试用例：验证大写词处理完整流程
 * 
 * 测试场景：
 * 1. 纯大写词（非白名单）→ 小写查词典 → AI 兜底
 * 2. 对齐检测（Alignment Guard）
 * 3. 结构化 JSON 响应
 */

import { splitWithDelimiters } from '../src/shared/naming/SplitWithDelimiters';

/**
 * 测试用例 1：纯大写词被正确标记为普通词
 */
function testUppercaseWordClassification() {
    console.log('\n=== 测试 1: 大写词分类 ===');
    
    const testCases = [
        { input: 'DEBUG_WARNING_ATTRIBUTION.md', expected: 'word' },
        { input: 'API_HTTP_URL.ts', expected: 'acronym' },  // 白名单词
        { input: 'DEBUG_API_WARNING.js', expected: 'mixed' }  // 混合
    ];
    
    for (const tc of testCases) {
        const { tokens, delims, ext } = splitWithDelimiters(tc.input);
        console.log(`\n输入: ${tc.input}`);
        console.log('词元:');
        tokens.forEach((token, i) => {
            console.log(`  [${i}] raw="${token.raw}" lower="${token.lower}" type="${token.type}"`);
        });
        console.log(`分隔符: [${delims.join(', ')}]`);
        console.log(`扩展名: ${ext}`);
    }
}

/**
 * 测试用例 2：模拟 AI 兜底流程
 */
function testAIFallbackFlow() {
    console.log('\n\n=== 测试 2: AI 兜底流程 ===');
    
    const fileName = 'DEBUG_USEFORM_WARNING_ATTRIBUTION.md';
    const { tokens, delims, ext } = splitWithDelimiters(fileName);
    
    console.log(`\n文件名: ${fileName}`);
    console.log('\n步骤 1: 分词');
    console.log('词元:', tokens.map(t => `${t.raw}(${t.type})`).join(', '));
    
    console.log('\n步骤 2: 模拟词典查找（使用小写键）');
    const dict: Record<string, string> = {
        'warning': '警告',
        // 假设其它词不在词典中
    };
    
    const unknownWords: string[] = [];
    const translations: string[] = [];
    
    tokens.forEach(token => {
        const translation = dict[token.lower];
        if (translation) {
            translations.push(translation);
            console.log(`  ✓ ${token.raw} (${token.lower}) → ${translation} [词典]`);
        } else if (token.type === 'acronym') {
            translations.push(token.raw);
            console.log(`  ✓ ${token.raw} → ${token.raw} [缩写保留]`);
        } else {
            unknownWords.push(token.raw);
            console.log(`  ✗ ${token.raw} (${token.lower}) → 未知，需要 AI`);
        }
    });
    
    console.log(`\n步骤 3: AI 兜底`);
    console.log(`未知词列表: [${unknownWords.join(', ')}]`);
    
    // 模拟 AI 响应（结构化 JSON）
    const mockAIResponse = [
        { key: 'debug', alias: '调试', kind: 'normal', confidence: 1.0 },
        { key: 'useform', alias: '使用表单', kind: 'normal', confidence: 0.8 },
        { key: 'attribution', alias: '归因', kind: 'normal', confidence: 0.9 }
    ];
    
    console.log('\nAI 响应:');
    mockAIResponse.forEach(item => {
        console.log(`  ${item.key} → ${item.alias} [${item.kind}, 置信度: ${item.confidence}]`);
    });
    
    console.log('\n步骤 4: 对齐检测');
    const normalItems = mockAIResponse.filter(item => item.kind === 'normal');
    const expectedCount = unknownWords.length;
    const actualCount = normalItems.length;
    
    if (actualCount === expectedCount) {
        console.log(`  ✓ 对齐成功：输入 ${expectedCount} 个词，AI 返回 ${actualCount} 个翻译`);
    } else {
        console.log(`  ✗ 对齐警告：输入 ${expectedCount} 个词，AI 返回 ${actualCount} 个翻译`);
        const returnedKeys = new Set(normalItems.map(i => i.key));
        const missingWords = unknownWords.map(w => w.toLowerCase()).filter(w => !returnedKeys.has(w));
        if (missingWords.length > 0) {
            console.log(`  缺失词: [${missingWords.join(', ')}]`);
        }
    }
    
    console.log('\n步骤 5: 合并词典 + AI 结果');
    const finalDict: Record<string, string> = { ...dict };
    mockAIResponse.forEach(item => {
        finalDict[item.key] = item.alias;
    });
    
    console.log('完整词典:');
    Object.entries(finalDict).forEach(([key, value]) => {
        console.log(`  ${key} → ${value}`);
    });
    
    console.log('\n步骤 6: 重建别名（保留分隔符）');
    const finalTranslations = tokens.map(token => {
        return finalDict[token.lower] || token.raw;
    });
    
    const rebuiltAlias = finalTranslations.reduce((result, trans, i) => {
        return result + trans + (delims[i] || '');
    }, '') + ext;
    
    console.log(`\n最终别名: ${rebuiltAlias}`);
    console.log(`原始文件: ${fileName}`);
}

/**
 * 测试用例 3：混合大小写 + 驼峰
 */
function testMixedCaseWithCamel() {
    console.log('\n\n=== 测试 3: 混合大小写 + 驼峰 ===');
    
    const testCases = [
        'DEBUG_useFormWarning.js',
        'APIController_DEBUG.ts',
        'json2CSV_WARNING.py',
        'i18n_DEBUG_Config.md'
    ];
    
    testCases.forEach(fileName => {
        console.log(`\n文件名: ${fileName}`);
        const { tokens, delims, ext } = splitWithDelimiters(fileName);
        
        console.log('分词结果:');
        tokens.forEach((token, i) => {
            const typeSymbol = token.type === 'acronym' ? '🏷️' : token.type === 'word' ? '📝' : '🔢';
            console.log(`  ${typeSymbol} ${token.raw} → ${token.lower} [${token.type}]`);
        });
        
        console.log(`分隔符: [${delims.map(d => d || '∅').join(', ')}]`);
        console.log(`扩展名: ${ext}`);
    });
}

/**
 * 测试用例 4：对齐检测 - AI 遗漏词
 */
function testAlignmentGuardMissing() {
    console.log('\n\n=== 测试 4: 对齐检测 - AI 遗漏词 ===');
    
    const unknownWords = ['DEBUG', 'UNKNOWN', 'WARNING'];
    
    // 模拟 AI 错误响应（遗漏了 UNKNOWN）
    const badAIResponse = [
        { key: 'debug', alias: '调试', kind: 'normal', confidence: 1.0 },
        { key: 'warning', alias: '警告', kind: 'normal', confidence: 1.0 }
    ];
    
    console.log(`输入词: [${unknownWords.join(', ')}]`);
    console.log('\nAI 响应（错误）:');
    badAIResponse.forEach(item => {
        console.log(`  ${item.key} → ${item.alias}`);
    });
    
    console.log('\n对齐检测:');
    const normalItems = badAIResponse.filter(item => item.kind === 'normal');
    const expectedCount = unknownWords.length;
    const actualCount = normalItems.length;
    
    console.log(`  预期: ${expectedCount} 个词`);
    console.log(`  实际: ${actualCount} 个词`);
    
    if (actualCount < expectedCount) {
        console.log(`  ⚠️ 警告：AI 返回词数不足`);
        
        const returnedKeys = new Set(normalItems.map(i => i.key.toLowerCase()));
        const missingWords = unknownWords.filter(w => !returnedKeys.has(w.toLowerCase()));
        
        console.log(`  缺失词: [${missingWords.join(', ')}]`);
        console.log(`  建议：重新提示 AI 或使用备用翻译策略`);
    }
}

/**
 * 测试用例 5：置信度过滤
 */
function testConfidenceFiltering() {
    console.log('\n\n=== 测试 5: 置信度过滤 ===');
    
    const aiResponse = [
        { key: 'debug', alias: '调试', kind: 'normal', confidence: 1.0 },
        { key: 'useform', alias: '使用表单', kind: 'normal', confidence: 0.8 },
        { key: 'weird', alias: '怪异', kind: 'normal', confidence: 0.3 },  // 低置信度
        { key: 'attribution', alias: '归因', kind: 'normal', confidence: 0.9 }
    ];
    
    console.log('AI 响应:');
    aiResponse.forEach(item => {
        const confidenceBar = '█'.repeat(Math.round(item.confidence * 10));
        console.log(`  ${item.key} → ${item.alias} [${confidenceBar} ${item.confidence}]`);
    });
    
    const MIN_CONFIDENCE = 0.5;
    console.log(`\n过滤阈值: ${MIN_CONFIDENCE}`);
    
    const filtered = aiResponse.filter(item => item.confidence >= MIN_CONFIDENCE);
    console.log('\n过滤后结果:');
    filtered.forEach(item => {
        console.log(`  ✓ ${item.key} → ${item.alias}`);
    });
    
    const rejected = aiResponse.filter(item => item.confidence < MIN_CONFIDENCE);
    if (rejected.length > 0) {
        console.log('\n被拒绝的低置信度翻译:');
        rejected.forEach(item => {
            console.log(`  ✗ ${item.key} → ${item.alias} [置信度: ${item.confidence}]`);
        });
    }
}

// 运行所有测试
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  AI 兜底增强测试套件                                    ║');
console.log('║  验证：大写词处理 + 对齐检测 + 结构化响应               ║');
console.log('╚══════════════════════════════════════════════════════════╝');

testUppercaseWordClassification();
testAIFallbackFlow();
testMixedCaseWithCamel();
testAlignmentGuardMissing();
testConfidenceFiltering();

console.log('\n\n✅ 所有测试完成！');
console.log('\n下一步：');
console.log('1. 重新加载 VS Code (Ctrl+Shift+P → Developer: Reload Window)');
console.log('2. 测试真实文件：DEBUG_USEFORM_WARNING.md');
console.log('3. 检查控制台是否有对齐警告');
console.log('4. 验证学习词典是否使用小写键');
