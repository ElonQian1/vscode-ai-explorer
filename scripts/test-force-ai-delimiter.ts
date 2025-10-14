#!/usr/bin/env ts-node
/**
 * 测试强制 AI 翻译是否保留分隔符
 * 
 * 测试用例：
 * 1. clean-xml-files.js → clean_xml_files模块（kebab-case → snake_case）
 * 2. user_profile_manager.ts → user_profile_manager模块（保留下划线）
 * 3. DataGridComponent.tsx → data_grid_component组件（PascalCase → snake_case）
 */

console.log('🧪 测试强制 AI 翻译分隔符保留功能\n');

// 模拟测试用例
const testCases = [
    {
        input: 'clean-xml-files.js',
        expected: /clean[_\-]xml[_\-]files/,  // 应该保留分隔符
        description: 'kebab-case 应该保留连字符或转为下划线'
    },
    {
        input: 'user_profile_manager.ts',
        expected: /user_profile_manager/,
        description: 'snake_case 应该保留下划线'
    },
    {
        input: 'DataGridComponent.tsx',
        expected: /data[_\-]?grid[_\-]?component/i,
        description: 'PascalCase 应该转为带分隔符的形式'
    },
    {
        input: 'analyze.xml.structure.js',
        expected: /analyze[\._]xml[\._]structure/,
        description: '点分隔符应该保留'
    }
];

console.log('📋 测试用例:');
testCases.forEach((tc, i) => {
    console.log(`  ${i + 1}. ${tc.input}`);
    console.log(`     预期: ${tc.description}`);
    console.log(`     正则: ${tc.expected}\n`);
});

console.log('✅ 修复内容:');
console.log('  1. 移除了 style === "literal" 检查');
console.log('  2. 强制 AI 模式总是使用直译 V2 构建器');
console.log('  3. 保留原始分隔符（- _ . 驼峰）');
console.log('  4. 详细的日志输出，便于调试\n');

console.log('🔍 关键改动:');
console.log('  before: if (style === "literal" && this.literalBuilderV2) { ... }');
console.log('  after:  if (this.literalBuilderV2) { ... } // 总是使用直译模式\n');

console.log('💡 使用方法:');
console.log('  1. 重新加载 VS Code 窗口');
console.log('  2. 右键文件 → "AI 资源管理器：强制用 AI 翻译此文件"');
console.log('  3. 查看输出面板（AI Explorer）的详细日志');
console.log('  4. 验证翻译结果是否保留了分隔符\n');

console.log('📝 预期日志输出:');
console.log('  [强制AI] clean-xml-files.js - 分词结果: tokens=["clean","xml","files"], delims=["-","-"]');
console.log('  [强制AI] clean-xml-files.js - 未知词: xml');
console.log('  [强制AI] clean-xml-files.js - AI 返回映射: {"xml":"可扩展标记语言"}');
console.log('  [强制AI] clean-xml-files.js -> clean-可扩展标记语言-files脚本 (覆盖率100%, 保留了分隔符)\n');

console.log('🎯 测试清单:');
console.log('  [ ] clean-xml-files.js → 应该有连字符或下划线');
console.log('  [ ] user_profile_manager.ts → 应该保留下划线');
console.log('  [ ] DataGridComponent.tsx → 应该有分隔符');
console.log('  [ ] analyze.xml.structure.js → 应该保留点号\n');

console.log('✨ 如果还是没有分隔符，可能的原因:');
console.log('  1. literalBuilderV2 未初始化（检查 DI 容器注册）');
console.log('  2. rebuildWithDelimiters() 方法有问题');
console.log('  3. AI 返回的映射格式不正确');
console.log('  4. 学习词典写入失败\n');

console.log('🔧 调试步骤:');
console.log('  1. 打开输出面板（Ctrl+Shift+U）→ 选择 "AI Explorer"');
console.log('  2. 查找 "[强制AI]" 日志');
console.log('  3. 检查 "分词结果" 是否正确');
console.log('  4. 检查 "AI 返回映射" 是否有内容');
console.log('  5. 检查最终翻译结果是否保留了分隔符');
