// ===== Webview 双击诊断脚本 =====
// 在 Webview 开发者工具 Console 中粘贴并运行

console.log('🔍 开始诊断双击功能...\n');

// ===== 1. 检查 graph 对象 =====
console.log('===== 1. 检查 graph 对象 =====');
if (!window.graph && !graph) {
    console.error('❌ graph 对象不存在！');
    console.log('💡 可能原因：init-graph 消息未收到');
    console.log('💡 解决方案：检查扩展端是否发送了 init-graph');
} else {
    const g = window.graph || graph;
    console.log('✅ graph 对象存在');
    console.log('   - nodes:', g.nodes?.length || 0);
    console.log('   - edges:', g.edges?.length || 0);
    console.log('   - metadata:', g.metadata);
    console.log('   - graphType:', g.metadata?.graphType);
    
    if (g.metadata?.graphType !== 'filetree') {
        console.error('❌ graphType 不是 "filetree"，而是:', g.metadata?.graphType);
        console.log('💡 这会导致双击事件不绑定！');
        console.log('💡 检查 FileTreeScanner.ts 是否设置了 graphType');
    } else {
        console.log('✅ graphType 正确: "filetree"');
    }
}

// ===== 2. 检查节点 DOM =====
console.log('\n===== 2. 检查节点 DOM =====');
const fileNodes = document.querySelectorAll('.node[data-type="file"]');
const folderNodes = document.querySelectorAll('.node[data-type="folder"]');
console.log('文件节点数量:', fileNodes.length);
console.log('文件夹节点数量:', folderNodes.length);

if (fileNodes.length === 0 && folderNodes.length === 0) {
    console.error('❌ 没有找到任何节点 DOM！');
    console.log('💡 可能原因：renderNodesOnce() 未执行');
    console.log('💡 检查是否收到了 init-graph 消息');
}

// ===== 3. 检查双击监听器 =====
console.log('\n===== 3. 检查双击监听器 =====');

// 检查文件节点
if (fileNodes.length > 0) {
    console.log('--- 文件节点监听器 ---');
    let fileWithListener = 0;
    fileNodes.forEach((el, i) => {
        if (i < 3) { // 只检查前 3 个
            const listeners = getEventListeners(el);
            const hasDblclick = listeners.dblclick?.length > 0;
            console.log(`  ${el.querySelector('.label')?.textContent || 'unknown'}:`, 
                hasDblclick ? '✅ 有监听器' : '❌ 无监听器');
            if (hasDblclick) fileWithListener++;
        }
    });
    
    if (fileWithListener === 0) {
        console.error('❌ 文件节点没有 dblclick 监听器！');
        console.log('💡 检查绑定条件是否满足（graphType === "filetree"）');
    } else {
        console.log(`✅ 检查的文件节点都有监听器`);
    }
}

// 检查文件夹节点
if (folderNodes.length > 0) {
    console.log('--- 文件夹节点监听器 ---');
    let folderWithListener = 0;
    folderNodes.forEach((el, i) => {
        if (i < 3) { // 只检查前 3 个
            const listeners = getEventListeners(el);
            const hasDblclick = listeners.dblclick?.length > 0;
            console.log(`  ${el.querySelector('.label')?.textContent || 'unknown'}:`, 
                hasDblclick ? '✅ 有监听器' : '❌ 无监听器');
            if (hasDblclick) folderWithListener++;
        }
    });
    
    if (folderWithListener === 0) {
        console.error('❌ 文件夹节点没有 dblclick 监听器！');
        console.log('💡 检查绑定条件是否满足（graphType === "filetree"）');
    } else {
        console.log(`✅ 检查的文件夹节点都有监听器`);
    }
}

// ===== 4. 检查 CSS 层级和遮罩 =====
console.log('\n===== 4. 检查 CSS 层级和遮罩 =====');

const edges = document.querySelector('svg.edges');
const nodes = document.getElementById('nodes');
const analysisHost = document.getElementById('analysis-host');
const helpOverlay = document.getElementById('helpOverlay');

console.log('edges pointer-events:', getComputedStyle(edges).pointerEvents);
console.log('nodes z-index:', getComputedStyle(nodes).zIndex);
console.log('analysis-host pointer-events:', analysisHost ? getComputedStyle(analysisHost).pointerEvents : 'N/A');
console.log('helpOverlay display:', helpOverlay ? getComputedStyle(helpOverlay).display : 'N/A');

if (edges && getComputedStyle(edges).pointerEvents !== 'none') {
    console.warn('⚠️ edges 的 pointer-events 不是 none，可能拦截双击！');
}

// ===== 5. 手动测试双击 =====
console.log('\n===== 5. 手动测试双击 =====');

if (fileNodes.length > 0) {
    console.log('尝试手动触发文件节点的双击事件...');
    const testNode = fileNodes[0];
    const nodeName = testNode.querySelector('.label')?.textContent || 'unknown';
    console.log(`测试节点: ${nodeName}`);
    
    // 监听 postMessage
    const originalPostMessage = acquireVsCodeApi().postMessage;
    let messageSent = false;
    acquireVsCodeApi().postMessage = function(msg) {
        console.log('📤 发送消息:', msg);
        messageSent = true;
        return originalPostMessage.call(this, msg);
    };
    
    // 触发双击
    testNode.dispatchEvent(new MouseEvent('dblclick', { 
        bubbles: true, 
        cancelable: true 
    }));
    
    setTimeout(() => {
        if (!messageSent) {
            console.error('❌ 手动触发双击后，没有发送消息！');
            console.log('💡 可能原因：');
            console.log('   1. 事件监听器未绑定');
            console.log('   2. 事件被拦截/阻止传播');
            console.log('   3. vscode API 未初始化');
        } else {
            console.log('✅ 手动触发双击成功，已发送消息');
        }
        
        // 恢复原始方法
        acquireVsCodeApi().postMessage = originalPostMessage;
    }, 100);
}

// ===== 6. 总结 =====
console.log('\n===== 诊断总结 =====');
console.log('请查看上面的输出，重点关注：');
console.log('1. ❌ 标记的错误项');
console.log('2. ⚠️ 标记的警告项');
console.log('3. 手动测试是否成功发送消息');
console.log('\n如果一切正常但双击仍无反应，请：');
console.log('1. 检查扩展端是否收到了消息（查看扩展端日志）');
console.log('2. 尝试刷新 Webview（Ctrl+R）');
console.log('3. 重启扩展（F5）');
