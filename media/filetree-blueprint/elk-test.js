/**
 * 🔬 ELK加载测试脚本
 * 独立验证ELK.js是否能正确加载并工作
 */

(function() {
    'use strict';
    
    console.log('🔬 [ELK测试] 开始验证ELK加载状态...');
    
    // 立即检查
    console.log('🔬 [ELK测试] 立即检查 window.ELK:', {
        exists: !!(window.ELK),
        type: typeof window.ELK,
        isFunction: typeof window.ELK === 'function'
    });
    
    // 等待5秒再检查
    setTimeout(() => {
        console.log('🔬 [ELK测试] 5秒后检查 window.ELK:', {
            exists: !!(window.ELK),
            type: typeof window.ELK,
            isFunction: typeof window.ELK === 'function'
        });
        
        if (window.ELK && typeof window.ELK === 'function') {
            try {
                const elk = new window.ELK();
                console.log('🔬 [ELK测试] ✅ ELK实例创建成功:', elk);
                
                // 测试简单布局
                const testGraph = {
                    id: 'test',
                    layoutOptions: {
                        'elk.algorithm': 'layered',
                        'elk.direction': 'RIGHT'
                    },
                    children: [
                        { id: 'n1', width: 100, height: 50 },
                        { id: 'n2', width: 100, height: 50 }
                    ],
                    edges: [
                        { id: 'e1', sources: ['n1'], targets: ['n2'] }
                    ]
                };
                
                elk.layout(testGraph).then(result => {
                    console.log('🔬 [ELK测试] ✅ 布局计算成功:', result);
                }).catch(error => {
                    console.error('🔬 [ELK测试] ❌ 布局计算失败:', error);
                });
                
            } catch (error) {
                console.error('🔬 [ELK测试] ❌ ELK实例创建失败:', error);
            }
        } else {
            console.error('🔬 [ELK测试] ❌ ELK未正确加载');
        }
    }, 5000);
    
})();