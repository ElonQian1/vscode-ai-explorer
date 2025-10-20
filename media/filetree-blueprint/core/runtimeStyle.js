/**
 * RuntimeStyle - CSP安全的动态样式管理器
 * 通过动态插入/更新 CSS 规则实现位置控制，避免 inline style
 */

export function createRuntimeStyle(nonce) {
    const style = document.createElement('style');
    if (nonce) {
        style.setAttribute('nonce', nonce);
    }
    style.dataset.source = 'runtime-style';
    document.head.appendChild(style);
    
    const sheet = style.sheet;
    const ruleMap = new Map(); // className -> ruleIndex
    
    /**
     * 生成 CSS 规则文本
     */
    function cssRule(className, x, y) {
        return `.${className} { transform: translate(${x}px, ${y}px); position: absolute; }`;
    }
    
    /**
     * 生成 z-index 规则文本
     */
    function zIndexRule(className, zIndex) {
        return `.${className} { z-index: ${zIndex}; }`;
    }
    
    /**
     * 生成通用属性规则
     */
    function propertyRule(className, properties) {
        return `.${className} { ${properties} }`;
    }
    
    return {
        /**
         * 设置元素位置（通过 transform）
         * @param {string} className - CSS 类名
         * @param {number} x - X 坐标
         * @param {number} y - Y 坐标
         * @returns {string} 类名（便于添加到元素）
         */
        setPos(className, x, y) {
            const rule = cssRule(className, Math.round(x), Math.round(y));
            
            if (ruleMap.has(className)) {
                const i = ruleMap.get(className);
                try {
                    sheet.deleteRule(i);
                    sheet.insertRule(rule, i);
                } catch (e) {
                    console.warn('[RuntimeStyle] 更新规则失败:', e);
                }
            } else {
                try {
                    const i = sheet.cssRules.length;
                    sheet.insertRule(rule, i);
                    ruleMap.set(className, i);
                } catch (e) {
                    console.warn('[RuntimeStyle] 插入规则失败:', e);
                }
            }
            
            // 返回类名便于添加到元素
            return className;
        },
        
        /**
         * 设置 z-index
         * @param {string} selector - CSS 选择器
         * @param {number} zIndex - z-index 值
         */
        setZIndex(selector, zIndex) {
            const className = selector.replace(/^\./, '');
            const rule = zIndexRule(className, zIndex);
            
            if (ruleMap.has(className + '-z')) {
                const i = ruleMap.get(className + '-z');
                try {
                    sheet.deleteRule(i);
                    sheet.insertRule(rule, i);
                } catch (e) {
                    console.warn('[RuntimeStyle] 更新 z-index 失败:', e);
                }
            } else {
                try {
                    const i = sheet.cssRules.length;
                    sheet.insertRule(rule, i);
                    ruleMap.set(className + '-z', i);
                } catch (e) {
                    console.warn('[RuntimeStyle] 插入 z-index 失败:', e);
                }
            }
        },
        
        /**
         * 设置通用 CSS 属性
         * @param {string} selector - CSS 选择器
         * @param {string} properties - CSS 属性字符串
         */
        setProperties(selector, properties) {
            const className = selector.replace(/^[.#]/, '');
            const key = className + '-props';
            const rule = propertyRule(className.replace(/^\./, ''), properties);
            
            if (ruleMap.has(key)) {
                const i = ruleMap.get(key);
                try {
                    sheet.deleteRule(i);
                    sheet.insertRule(rule, i);
                } catch (e) {
                    console.warn('[RuntimeStyle] 更新属性失败:', e);
                }
            } else {
                try {
                    const i = sheet.cssRules.length;
                    sheet.insertRule(rule, i);
                    ruleMap.set(key, i);
                } catch (e) {
                    console.warn('[RuntimeStyle] 插入属性失败:', e);
                }
            }
        },
        
        /**
         * 移除规则
         * @param {string} className - 类名
         */
        removeRule(className) {
            if (ruleMap.has(className)) {
                const i = ruleMap.get(className);
                try {
                    sheet.deleteRule(i);
                    ruleMap.delete(className);
                } catch (e) {
                    console.warn('[RuntimeStyle] 删除规则失败:', e);
                }
            }
        },
        
        /**
         * 清除所有规则
         */
        clearAll() {
            try {
                while (sheet.cssRules.length > 0) {
                    sheet.deleteRule(0);
                }
                ruleMap.clear();
            } catch (e) {
                console.warn('[RuntimeStyle] 清除所有规则失败:', e);
            }
        }
    };
}

/**
 * 生成稳定的哈希类名
 * @param {string} str - 输入字符串
 * @returns {string} 哈希后的类名
 */
export function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i) | 0;
    }
    return 'h' + (h >>> 0).toString(36);
}
