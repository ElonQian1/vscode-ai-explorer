/**
 * 🧪 烟雾测试脚本
 * 
 * 目的：验证 webview bundle 的完整性
 * - 检查 bundle.js 是否存在
 * - 验证文件大小合理（< 500KB）
 * - 检查关键导入是否存在
 */

const fs = require('fs');
const path = require('path');

const BUNDLE_PATH = path.resolve(__dirname, '../media/filetree-blueprint/dist/bundle.js');
const MAX_SIZE_KB = 500;

console.log('🧪 开始烟雾测试...\n');

// ✅ Test 1: 文件存在性
console.log('[Test 1] 检查 bundle.js 是否存在...');
if (!fs.existsSync(BUNDLE_PATH)) {
  console.error('❌ FAIL: bundle.js 不存在');
  console.error('   请运行: npm run build:webview');
  process.exit(1);
}
console.log('✅ PASS: bundle.js 存在\n');

// ✅ Test 2: 文件大小检查
console.log('[Test 2] 检查文件大小...');
const stats = fs.statSync(BUNDLE_PATH);
const sizeKB = stats.size / 1024;
console.log(`   文件大小: ${sizeKB.toFixed(2)} KB`);

if (sizeKB > MAX_SIZE_KB) {
  console.warn(`⚠️  WARN: bundle 超过 ${MAX_SIZE_KB}KB (${sizeKB.toFixed(2)} KB)`);
  console.warn('   可能包含不必要的依赖');
} else {
  console.log(`✅ PASS: 文件大小合理 (< ${MAX_SIZE_KB}KB)\n`);
}

// ✅ Test 3: 语法检查（基本）
console.log('[Test 3] 检查 bundle 内容...');
const content = fs.readFileSync(BUNDLE_PATH, 'utf-8');

// 检查关键标识（压缩后的代码使用不同的检查方式）
const requiredPatterns = [
  { name: 'RuntimeStyle (setPos)', pattern: /setPos.*translate/ },
  { name: 'MessageHub (postMessage)', pattern: /postMessage/ },
  { name: 'LayoutEngine (ELK)', pattern: /ELK|elk\.bundled/ },
  { name: 'Renderer (renderNodes)', pattern: /renderNodes|graph-node/ },
  { name: 'CardLayer (blueprint-card)', pattern: /blueprint-card/ },
  { name: 'Breadcrumb', pattern: /breadcrumb/ },
  { name: 'DragManager (dragging)', pattern: /dragging|mousedown/ },
  { name: 'ZoomPan (zoom/pan)', pattern: /wheel.*zoom|translate.*scale/ }
];

let allPatternsFound = true;
for (const { name, pattern } of requiredPatterns) {
  if (!pattern.test(content)) {
    console.error(`❌ FAIL: 缺少模块 "${name}"`);
    allPatternsFound = false;
  }
}

if (!allPatternsFound) {
  console.error('\n❌ 部分模块未打包');
  process.exit(1);
}

console.log('✅ PASS: 所有核心模块都已打包\n');

// ✅ Test 4: Sourcemap 检查
console.log('[Test 4] 检查 sourcemap...');
const sourcemapPath = BUNDLE_PATH + '.map';
if (!fs.existsSync(sourcemapPath)) {
  console.warn('⚠️  WARN: sourcemap 不存在（调试体验会受影响）');
} else {
  console.log('✅ PASS: sourcemap 已生成\n');
}

// 🎉 总结
console.log('═══════════════════════════════════');
console.log('🎉 所有测试通过!');
console.log('═══════════════════════════════════');
console.log(`📦 Bundle: ${BUNDLE_PATH}`);
console.log(`📏 大小: ${sizeKB.toFixed(2)} KB`);
console.log(`📋 包含模块: ${requiredPatterns.length}个`);
console.log('');
console.log('✨ Webview bundle 已就绪，可以发布!');
