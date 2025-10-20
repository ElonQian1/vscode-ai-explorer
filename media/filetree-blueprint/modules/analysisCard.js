(function (global) {
    "use strict";
    
    // ✅ 卡片存储：path -> { dom, data }
    const store = new Map();
    let layer = null;
    let runtimeStyles = null; // RuntimeStylesheet 实例 (从外部注入)

    // ✅ 拖拽功能实现 (CSP-safe)
    function makeDraggable(cardEl, handleEl, path) {
        let dragging = false, sx = 0, sy = 0, ox = 120, oy = 120;
        const posClass = `pos-card-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        cardEl.classList.add(posClass);
        
        handleEl.addEventListener('mousedown', e => { 
            dragging = true; 
            sx = e.clientX; 
            sy = e.clientY; 
            
            // 从 CSS 变量读取当前位置
            const computedStyle = getComputedStyle(cardEl);
            ox = parseInt(computedStyle.left || '120px');
            oy = parseInt(computedStyle.top || '120px');
            
            handleEl.style.cursor = 'grabbing';
            e.preventDefault(); 
        });
        
        global.addEventListener('mousemove', e => {
            if (!dragging || !runtimeStyles) return;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            runtimeStyles.setPosition(`.${posClass}`, ox + dx, oy + dy);
        });
        
        global.addEventListener('mouseup', () => { 
            if (dragging) { 
                const computedStyle = getComputedStyle(cardEl);
                ox = parseInt(computedStyle.left || '0'); 
                oy = parseInt(computedStyle.top || '0'); 
                dragging = false; 
                handleEl.style.cursor = 'move';
            } 
        });
    }

    // ✅ 挂载卡片层
    function mount(selector) {
        layer = document.querySelector(selector) || document.body;
        console.log('[analysisCard] ✅ 挂载到:', selector, layer.id || layer.tagName);
    }
    
    // ✅ 渲染卡片内容
    function render(dom, data) {
        const titleEl = dom.querySelector('.title');
        const bodyEl = dom.querySelector('.body');
        
        if (titleEl) titleEl.textContent = getFileName(data.path || '未知文件');
        if (!bodyEl) return;
        
        bodyEl.innerHTML = '';

        // 文件信息
        if (data.meta || data.fileInfo) {
            const meta = data.meta || data.fileInfo || {};
            const sec = document.createElement('div');
            sec.innerHTML = `
                <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">📁 文件信息</h4>
                <div style="font-size: 11px; color: var(--vscode-foreground);">
                    <div>大小: ${formatFileSize(meta.size || 0)}</div>
                    <div>类型: ${meta.extension || data.lang || "Unknown"}</div>
                </div>
            `;
            bodyEl.appendChild(sec);
        }

        // 静态分析
        if (data.static || data.api || data.deps) {
            const sec = document.createElement('div');
            sec.style.marginTop = '16px';
            const staticData = data.static || {
                dependencies: data.deps ? extractDependencyNames(data.deps) : [],
                exports: data.api ? extractApiNames(data.api) : []
            };
            sec.innerHTML = `
                <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">🔍 静态分析</h4>
                <div style="font-size: 11px; color: var(--vscode-foreground);">
                    ${renderStaticAnalysis(staticData)}
                </div>
            `;
            bodyEl.appendChild(sec);
        }

        // AI 结果
        const hasInferences = data.inferences?.length || data.insights?.length;
        const hasRecommendations = data.recommendations?.length || (data.aiAnalysis?.recommendations?.length);
        const hasSummary = data.summary;
        
        if (hasInferences || hasRecommendations || hasSummary || data.loading) {
            const sec = document.createElement('div');
            sec.style.marginTop = '16px';
            
            let aiHtml = '<h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">🤖 AI 增强分析</h4>';
            
            if (data.loading) {
                aiHtml += '<div style="display: flex; align-items: center; gap: 8px; color: var(--vscode-descriptionForeground);"><span>⏳</span><span>AI 正在分析中...</span></div>';
            } else {
                // 摘要
                if (hasSummary) {
                    const summary = typeof data.summary === 'string' ? data.summary : (data.summary?.zh || data.summary?.en || '');
                    aiHtml += `<div style="margin-bottom: 8px;"><strong>概要:</strong><p style="margin: 4px 0;">${summary}</p></div>`;
                }
                
                // 推断/洞察
                const inferences = data.inferences || data.insights || [];
                if (inferences.length > 0) {
                    aiHtml += '<div style="margin-bottom: 8px;"><strong>深度分析:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
                    inferences.forEach(item => {
                        const text = typeof item === 'string' ? item : (item.text || item.description || String(item));
                        aiHtml += `<li>${text}</li>`;
                    });
                    aiHtml += '</ul></div>';
                }
                
                // 建议
                const recommendations = data.recommendations || (data.aiAnalysis?.recommendations) || [];
                if (recommendations.length > 0) {
                    aiHtml += '<div><strong>改进建议:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
                    recommendations.forEach(item => {
                        const text = typeof item === 'string' ? item : (item.text || item.description || String(item));
                        aiHtml += `<li>${text}</li>`;
                    });
                    aiHtml += '</ul></div>';
                }
            }
            
            sec.innerHTML = aiHtml;
            bodyEl.appendChild(sec);
        }
    }

    // ✅ 创建新卡片 (CSP-safe)
    function createCard(path, data) {
        const card = document.createElement('div');
        card.className = 'analysis-card';
        
        // 使用 RuntimeStylesheet 设置初始位置
        const posClass = `pos-card-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        card.classList.add(posClass);
        if (runtimeStyles) {
            runtimeStyles.setPosition(`.${posClass}`, 120 + store.size * 30, 120 + store.size * 20);
        }
        
        card.innerHTML = `
            <div class="header">
                <span class="title">文件分析</span>
                <button class="close">×</button>
            </div>
            <div class="body"></div>
        `;
        
        if (!layer) mount('#card-layer');
        layer.appendChild(card);

        // 关闭按钮
        card.querySelector('.close').onclick = () => { 
            card.remove(); 
            store.delete(path); 
            console.log('[analysisCard] ✅ 卡片已关闭:', path);
        };
        
        // 拖拽 (传递 path 参数用于 posClass 生成)
        makeDraggable(card, card.querySelector('.header'), path);

        const model = { dom: card, data: { ...data, path } };
        store.set(path, model);
        render(card, model.data);
        
        console.log('[analysisCard] ✅ 创建新卡片:', path);
        return model;
    }

    // ✅ 显示卡片（兼容旧API：show）
    function show(payload) {
        const path = payload.file || payload.path || "unknown";
        return showCard(path, payload);
    }

    // ✅ 显示卡片（新API）
    function showCard(path, payload) {
        if (!layer) mount('#card-layer');
        
        const exist = store.get(path);
        if (exist) {
            // 更新现有卡片
            exist.data = { ...exist.data, ...payload };
            render(exist.dom, exist.data);
            console.log('[analysisCard] ✅ 更新现有卡片:', path);
            return exist;
        }
        
        // 创建新卡片
        return createCard(path, payload);
    }
    
    // ✅ 更新卡片（兼容旧API：update）
    function update(payload) {
        const path = payload.file || payload.path || "unknown";
        return updateCard(path, payload);
    }

    // ✅ 更新卡片（新API）
    function updateCard(path, payload) {
        const exist = store.get(path);
        if (!exist) {
            console.warn('[analysisCard] 更新不存在的卡片，创建新卡片:', path);
            return showCard(path, payload);
        }
        
        // 关键：把 AI 合并进去，并去掉 loading
        exist.data = {
            ...exist.data,
            ...payload,
            ai: { ...(exist.data.ai||{}), ...(payload.ai||{}) },
            loading: false
        };
        
        render(exist.dom, exist.data);
        console.log('[analysisCard] ✅ AI分析结果已更新:', path);
        return exist;
    }

    // ✅ 关闭所有卡片
    function close() {
        store.forEach((model, path) => {
            model.dom.remove();
        });
        store.clear();
        console.log("[analysisCard] ✅ 所有卡片已关闭");
    }
    
    function getFileName(path) {
        return path.split(/[/\\]/).pop() || path;
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }
    
    // ✅ FileCapsule 辅助函数
    function getExtensionFromPath(path) {
        const parts = path.split('.');
        return parts.length > 1 ? parts[parts.length - 1] : 'Unknown';
    }
    
    function extractDependencyNames(deps) {
        if (!deps) return [];
        const names = [];
        if (deps.imports) names.push(...deps.imports.map(imp => imp.module || imp));
        if (deps.external) names.push(...deps.external);
        return names.slice(0, 10); // 限制显示数量
    }
    
    function extractApiNames(api) {
        if (!api || !Array.isArray(api)) return [];
        return api.map(item => {
            if (typeof item === 'string') return item;
            return item.name || item.symbol || String(item);
        }).slice(0, 10); // 限制显示数量
    }
    
    function renderStaticAnalysis(analysis) {
        if (!analysis) {
            return '<p style="color: var(--vscode-descriptionForeground);">暂无静态分析结果</p>';
        }
        
        let html = "<div>";
        if (analysis.dependencies && analysis.dependencies.length > 0) {
            html += '<div style="margin-bottom: 8px;"><strong>依赖:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
            for (let i = 0; i < analysis.dependencies.length; i++) {
                html += '<li>' + analysis.dependencies[i] + '</li>';
            }
            html += '</ul></div>';
        }
        if (analysis.exports && analysis.exports.length > 0) {
            html += '<div><strong>导出:</strong><ul style="margin: 4px 0; padding-left: 16px;">';
            for (let i = 0; i < analysis.exports.length; i++) {
                html += '<li>' + analysis.exports[i] + '</li>';
            }
            html += '</ul></div>';
        }
        html += "</div>";
        return html;
    }
    
    // ✅ 导出 API（统一签名 + CSP 支持）
    global.cardManager = { 
        mount, 
        showCard, 
        updateCard, 
        close,
        // 兼容旧的方法名
        show, 
        update,
        // RuntimeStylesheet 注入方法
        setRuntimeStyles(stylesInstance) {
            runtimeStyles = stylesInstance;
            console.log('[analysisCard] ✅ RuntimeStylesheet 已注入');
        }
    };
    
    console.info('[analysisCard] ✅ cardManager 已就绪（UMD/IIFE）- 支持可拖拽卡片');
    
    // 自动挂载到默认容器
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!layer) {
                mount('#card-layer');
            }
        });
    }
    
})(window);
