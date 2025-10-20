/**
 * 🔧 CSP修复版启动脚本
 * 替代内联script，初始化蓝图卡片系统和兼容检查
 */

(function() {
    'use strict';
    
    console.log('[BOOT] ✅ CSP修复版启动脚本开始执行');
    
    // 🎨 初始化StyleManager
    if (window.StyleManager) {
        // 从HTML中提取nonce（由扩展注入）
        const nonceScript = document.querySelector('script[nonce]');
        const nonce = nonceScript ? nonceScript.getAttribute('nonce') : 'default-nonce';
        window.styleManager = new window.StyleManager(nonce);
        console.log('[BOOT] ✅ StyleManager初始化完成');
    } else {
        console.error('[BOOT] ❌ StyleManager未加载');
    }
    
    // 等待所有依赖加载完成
    function waitForDependencies() {
        return new Promise((resolve) => {
            let checkCount = 0;
            const checkInterval = setInterval(() => {
                checkCount++;
                const hasELK = !!(window.ELK);
                const hasStyleManager = !!(window.styleManager);
                const hasBlueprintCard = !!(window.blueprintCard);
                const hasMessageContracts = !!(window.messageContracts);
                const hasLayoutEngine = !!(window.layoutEngine);
                
                // 每10次检查打印一次状态（每0.5秒）
                if (checkCount % 10 === 0) {
                    console.log(`[BOOT] 依赖检查 #${checkCount}:`, {
                        ELK: hasELK,
                        StyleManager: hasStyleManager,
                        blueprintCard: hasBlueprintCard,
                        messageContracts: hasMessageContracts,
                        layoutEngine: hasLayoutEngine,
                        windowELKType: typeof window.ELK
                    });
                }
                
                if (hasELK && hasStyleManager && hasBlueprintCard && hasMessageContracts && hasLayoutEngine) {
                    clearInterval(checkInterval);
                    console.log('[BOOT] ✅ 所有依赖已加载完成，ELK类型:', typeof window.ELK);
                    resolve();
                }
            }, 50);
            
            // 5秒超时
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn('[BOOT] ⚠️ 依赖加载超时，继续执行');
                resolve();
            }, 5000);
        });
    }
    
    // 初始化蓝图卡片系统
    async function initializeBlueprintCards() {
        if (window.blueprintCard && window.messageContracts) {
            try {
                // 挂载蓝图卡片到专用层
                window.blueprintCard.mount('#card-layer');
                
                // 设置事件回调
                window.blueprintCard.setCallbacks({
                    onOpen: (path, size) => {
                        console.log('[blueprintCard] 📌 卡片已打开:', path, size);
                        // 通知布局引擎节点展开
                        if (window.layoutEngine && typeof window.layoutEngine.markExpanded === 'function') {
                            window.layoutEngine.markExpanded(path, true);
                            window.layoutEngine.reflow('expand', [path]);
                        }
                    },
                    onClose: (path) => {
                        console.log('[blueprintCard] ❌ 卡片已关闭:', path);
                        // 通知布局引擎节点收起
                        if (window.layoutEngine && typeof window.layoutEngine.markExpanded === 'function') {
                            window.layoutEngine.markExpanded(path, false);
                            window.layoutEngine.reflow('collapse', [path]);
                        }
                    },
                    onNotesChange: (path, notes) => {
                        console.log('[blueprintCard] 📝 备注已更改:', path);
                        if (window.messageContracts && window.vscode) {
                            const saveMessage = window.messageContracts.createSaveNotesMessage(path, notes);
                            window.vscode.postMessage(saveMessage);
                        }
                    },
                    onDependencyClick: (depPath) => {
                        console.log('[blueprintCard] 🔗 依赖点击:', depPath);
                        // TODO: 导航到依赖文件或显示其卡片
                    }
                });
                
                console.log('[BOOT] 🎯 蓝图卡片系统初始化成功');
                return true;
            } catch (error) {
                console.error('[BOOT] ❌ 蓝图卡片系统初始化失败:', error);
                return false;
            }
        } else {
            console.warn('[BOOT] ⚠️ 蓝图卡片系统未加载');
            return false;
        }
    }
    
    // 初始化旧卡片系统（兼容）
    function initializeLegacyCards() {
        if (window.cardManager) {
            try {
                window.cardManager.mount('#card-layer');
                console.log('[BOOT] ✅ 旧卡片系统（兼容）初始化成功');
            } catch (error) {
                console.warn('[BOOT] ⚠️ 旧卡片系统初始化失败:', error);
            }
        }
    }
    
    // DOM容器验证
    function validateContainers() {
        const root = document.getElementById('graph-root');
        if (root) {
            const rect = root.getBoundingClientRect();
            console.log('[BOOT] 📐 容器尺寸:', {
                width: rect.width, 
                height: rect.height,
                top: rect.top,
                left: rect.left
            });
            
            if (rect.height === 0) {
                console.error('[BOOT] ❌ 容器高度为0，CSS布局问题');
                // CSP-safe: 使用类名替代 inline style
                root.classList.add('fallback-height');
                console.log('[BOOT] 🔧 已应用 fallback-height 类');
            }
        } else {
            console.error('[BOOT] ❌ 找不到#graph-root容器');
        }
        
        const cardLayer = document.getElementById('card-layer');
        if (cardLayer) {
            console.log('[BOOT] ✅ card-layer容器已找到');
        } else {
            console.error('[BOOT] ❌ 找不到#card-layer容器');
        }
    }
    
    // 主初始化流程
    async function main() {
        console.log('[BOOT] 🚀 开始CSP修复版初始化流程');
        
        // 1. 等待依赖加载
        await waitForDependencies();
        
        // 2. 等待DOM就绪
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', resolve);
                } else {
                    resolve();
                }
            });
        }
        
        // 3. 验证容器
        validateContainers();
        
        // 4. 初始化蓝图卡片系统
        const blueprintSuccess = await initializeBlueprintCards();
        
        // 5. 如果蓝图卡片初始化失败，启用兼容模式
        if (!blueprintSuccess) {
            initializeLegacyCards();
        }
        
        console.log('[BOOT] ✅ CSP修复版初始化完成');
    }
    
    // 启动
    main().catch(error => {
        console.error('[BOOT] ❌ 初始化过程发生错误:', error);
    });
    
})();