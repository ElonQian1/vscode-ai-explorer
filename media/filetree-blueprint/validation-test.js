/**
 * 🧪 S1+S2验收测试脚本
 * 验证：双击文件 → 画布蓝图卡片 → 节点自动让路
 */

// 页面加载后自动运行测试
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(runValidationTest, 1000);
});

function runValidationTest() {
    console.log('🧪 [验收测试] 开始S1+S2功能验证...');
    
    // 1. 检查关键组件是否加载
    const checkResults = {
        cardLayer: !!document.getElementById('card-layer'),
        graphRoot: !!document.getElementById('graph-root'),
        blueprintCard: !!(window.blueprintCard && typeof window.blueprintCard.showCard === 'function'),
        layoutEngine: !!(window.layoutEngine && typeof window.layoutEngine.create === 'function'),
        messageContracts: !!(window.messageContracts && typeof window.messageContracts.createNodeDoubleClickMessage === 'function')
    };
    
    console.log('📊 [验收测试] 组件检查结果:', checkResults);
    
    // 2. 检查样式设置
    const cardLayer = document.getElementById('card-layer');
    if (cardLayer) {
        const styles = window.getComputedStyle(cardLayer);
        console.log('🎨 [验收测试] card-layer样式:', {
            position: styles.position,
            pointerEvents: styles.pointerEvents,
            zIndex: styles.zIndex
        });
    }
    
    // 3. 模拟双击测试（如果有文件节点）
    const fileNodes = document.querySelectorAll('[data-node-type="file"]');
    if (fileNodes.length > 0) {
        console.log(`🎯 [验收测试] 发现 ${fileNodes.length} 个文件节点，可进行双击测试`);
        
        // 提示用户手动测试
        console.log('👆 [验收测试] 请手动双击任一文件节点，验证：');
        console.log('   ✅ 出现520×420的蓝图卡片（非模态）');
        console.log('   ✅ 卡片可拖拽、可Pin、有Tab');
        console.log('   ✅ 其他节点自动重新排列（让路）');
        console.log('   ✅ 连线变为正交折线');
        
        // 添加视觉提示
        fileNodes.forEach((node, i) => {
            if (i < 3) { // 只高亮前3个
                node.style.boxShadow = '0 0 8px rgba(0,120,212,0.6)';
                node.title = '👆 双击测试蓝图卡片功能';
            }
        });
        
    } else {
        console.log('⚠️ [验收测试] 未发现文件节点，可能需要先加载文件树');
    }
    
    // 4. 检查双击事件绑定
    let dblClickCount = 0;
    document.addEventListener('dblclick', (e) => {
        dblClickCount++;
        console.log(`🖱️ [验收测试] 检测到第${dblClickCount}次双击事件:`, {
            target: e.target.tagName,
            classes: e.target.className,
            nodeType: e.target.getAttribute('data-node-type')
        });
    });
    
    // 5. 总结报告
    const allReady = Object.values(checkResults).every(v => v);
    console.log(allReady ? 
        '✅ [验收测试] 所有组件就绪，可进行手动测试' : 
        '❌ [验收测试] 部分组件缺失，需要检查模块加载'
    );
    
    return checkResults;
}

// 导出供控制台调用
window.validationTest = runValidationTest;