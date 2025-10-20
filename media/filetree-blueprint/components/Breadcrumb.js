/**
 * Breadcrumb 组件 (CSP-safe)
 * 面包屑导航，纯 class 控制样式
 */

function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

export function mountBreadcrumb(container) {
    const el = document.createElement('div');
    el.className = 'breadcrumb';
    container.appendChild(el);
    
    return {
        /**
         * 更新面包屑内容
         * @param {Array<{label: string, href?: string, mode?: string}>} parts 
         */
        update(parts) {
            if (!parts || parts.length === 0) {
                el.innerHTML = '';
                return;
            }
            
            const items = parts.map((p, i) => {
                const safe = escapeHtml(p.label);
                const isLast = i === parts.length - 1;
                
                // 返回上级按钮（第一个元素）
                if (i === 0 && p.href) {
                    return `<button class="breadcrumb-btn" data-href="${escapeHtml(p.href)}">↑ 返回上级</button>`;
                }
                
                // 模式标签
                if (p.mode) {
                    return `<span class="breadcrumb-mode">${safe}</span>`;
                }
                
                // 路径
                return p.href
                    ? `<a class="breadcrumb-link" data-href="${escapeHtml(p.href)}">${safe}</a>${isLast ? '' : '<span class="breadcrumb-sep">/</span>'}`
                    : `<span class="breadcrumb-path">${safe}</span>${isLast ? '' : '<span class="breadcrumb-sep">/</span>'}`;
            }).join('');
            
            el.innerHTML = items;
            
            // 绑定点击事件（使用事件委托）
            el.querySelectorAll('[data-href]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const href = link.dataset.href;
                    if (href && window.vscode) {
                        window.vscode.postMessage({
                            type: 'drill-up',
                            payload: { path: href }
                        });
                    }
                });
            });
        },
        
        /**
         * 清空面包屑
         */
        clear() {
            el.innerHTML = '';
        }
    };
}
