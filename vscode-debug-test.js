/**
 * 🎯 VS Code Debug Console验证脚本
 * 
 * 在VS Code调试控制台中执行此脚本来验证tooltip功能
 */

// 分析成功的文件路径
const analyzedFile = 'd:\\rust\\active-projects\\ai-explorer\\scripts\\test-ai-fallback-enhanced.ts';

console.log('🎯 VS Code Debug Console 验证步骤:');
console.log('');
console.log('1. 首先确认extension已激活:');
console.log("const ext = vscode.extensions.getExtension('elonqian1.ai-explorer');");
console.log('console.log("Extension active:", ext?.isActive);');
console.log('');

console.log('2. 获取工作区根目录:');
console.log('const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;');
console.log('console.log("Workspace root:", workspaceRoot);');
console.log('');

console.log('3. 创建HoverInfoService实例:');
console.log('const HoverInfoService = ext?.exports?.HoverInfoService;');
console.log('console.log("HoverInfoService available:", !!HoverInfoService);');
console.log('');

console.log('4. 获取实例并测试tooltip:');
console.log('const hoverService = HoverInfoService?.getInstance(workspaceRoot, ext.context);');
console.log(`const tooltipResult = await hoverService?.getExistingTooltip('${analyzedFile}');`);
console.log('console.log("Tooltip result:", tooltipResult);');
console.log('');

console.log('5. 如果上面返回null，检查缓存:');
console.log('const cacheKey = "smart-analyzer:file-analysis-yekbm7";');
console.log('const cachedData = ext.context.globalState.get(cacheKey);');
console.log('console.log("Cached data:", cachedData);');
console.log('');

console.log('6. 检查所有smart-analyzer缓存:');
console.log('const allKeys = ext.context.globalState.keys();');
console.log('const smartKeys = allKeys.filter(k => k.includes("smart-analyzer"));');
console.log('console.log("All smart-analyzer keys:", smartKeys);');
console.log('');

console.log('✅ 预期结果:');
console.log('- tooltip应该包含: "🎯 测试文件"');
console.log('- 如果返回null，说明HoverInfoService有问题');
console.log('- 如果缓存存在但tooltip为null，说明getExistingTooltip()有bug');

console.log('\n🚀 请在VS Code Debug Console中逐步执行上述命令');