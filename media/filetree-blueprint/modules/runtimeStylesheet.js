// media/filetree-blueprint/modules/runtimeStylesheet.js
// 🔒 CSP安全的运行时样式表管理器
// 用于动态设置元素样式，绕开 inline style 限制

/**
 * 运行时样式表管理器
 * 通过修改CSS规则而非inline style来实现动态样式
 */
class RuntimeStylesheet {
    constructor(nonce) {
        this.nonce = nonce;
        this.sheet = null;
        this.rules = new Map(); // 记录已创建的规则
        this.init();
    }

    /**
     * 初始化：创建带nonce的<style>元素
     */
    init() {
        const styleEl = document.createElement('style');
        if (this.nonce) {
            styleEl.setAttribute('nonce', this.nonce);
        }
        styleEl.setAttribute('data-type', 'runtime-styles');
        document.head.appendChild(styleEl);
        this.sheet = styleEl.sheet;
        console.log('[RuntimeStylesheet] ✅ 初始化完成，nonce:', this.nonce ? '已设置' : '未设置');
    }

    /**
     * 设置元素位置（使用transform）
     * @param {string} selector - CSS选择器或类名
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     */
    setPosition(selector, x, y) {
        const cleanSelector = selector.startsWith('.') ? selector : `.${selector}`;
        const rule = `${cleanSelector} { transform: translate(${Math.round(x)}px, ${Math.round(y)}px); }`;
        this.upsertRule(cleanSelector, rule);
    }

    /**
     * 设置元素left/top（用于兼容老代码）
     * @param {string} selector - CSS选择器或类名
     * @param {number} left - left值（px）
     * @param {number} top - top值（px）
     */
    setLeftTop(selector, left, top) {
        const cleanSelector = selector.startsWith('.') ? selector : `.${selector}`;
        const rule = `${cleanSelector} { left: ${Math.round(left)}px; top: ${Math.round(top)}px; }`;
        this.upsertRule(cleanSelector, rule);
    }

    /**
     * 设置z-index
     * @param {string} selector - CSS选择器或类名
     * @param {number} zIndex - z-index值
     */
    setZIndex(selector, zIndex) {
        const cleanSelector = selector.startsWith('.') ? selector : `.${selector}`;
        const rule = `${cleanSelector} { z-index: ${zIndex}; }`;
        this.upsertRule(cleanSelector, rule);
    }

    /**
     * 设置CSS变量
     * @param {string} selector - CSS选择器或类名
     * @param {string} varName - 变量名（不含--前缀）
     * @param {string} value - 变量值
     */
    setCSSVar(selector, varName, value) {
        const cleanSelector = selector.startsWith('.') ? selector : `.${selector}`;
        const cssVarName = varName.startsWith('--') ? varName : `--${varName}`;
        const rule = `${cleanSelector} { ${cssVarName}: ${value}; }`;
        this.upsertRule(cleanSelector, rule);
    }

    /**
     * 设置任意CSS属性
     * @param {string} selector - CSS选择器或类名
     * @param {Object|string} properties - CSS属性对象 {prop: value} 或CSS字符串
     */
    setProperties(selector, properties) {
        const cleanSelector = selector.startsWith('.') ? selector : `.${selector}`;
        
        let declarations;
        if (typeof properties === 'string') {
            // 如果是字符串，直接使用（兼容旧代码）
            declarations = properties.endsWith(';') ? properties : properties + ';';
        } else if (typeof properties === 'object' && properties !== null) {
            // 如果是对象，转换为声明字符串
            declarations = Object.entries(properties)
                .map(([prop, value]) => `${prop}: ${value};`)
                .join(' ');
        } else {
            console.error('[RuntimeStylesheet] setProperties: properties must be object or string', properties);
            return;
        }
        
        const rule = `${cleanSelector} { ${declarations} }`;
        this.upsertRule(cleanSelector, rule);
    }

    /**
     * 插入或更新规则
     * @private
     */
    upsertRule(selector, ruleText) {
        // 如果已存在，先删除旧规则
        if (this.rules.has(selector)) {
            const oldIndex = this.rules.get(selector);
            try {
                this.sheet.deleteRule(oldIndex);
                // 删除后索引会变化，需要更新所有索引
                this.rebuildRuleIndex();
            } catch (e) {
                console.warn('[RuntimeStylesheet] 删除规则失败:', e);
            }
        }

        // 插入新规则
        try {
            const index = this.sheet.cssRules.length;
            this.sheet.insertRule(ruleText, index);
            this.rules.set(selector, index);
        } catch (e) {
            console.error('[RuntimeStylesheet] 插入规则失败:', ruleText, e);
        }
    }

    /**
     * 重建规则索引（删除规则后需要）
     * @private
     */
    rebuildRuleIndex() {
        this.rules.clear();
        for (let i = 0; i < this.sheet.cssRules.length; i++) {
            const rule = this.sheet.cssRules[i];
            if (rule.selectorText) {
                this.rules.set(rule.selectorText, i);
            }
        }
    }

    /**
     * 删除规则
     * @param {string} selector - CSS选择器或类名
     */
    deleteRule(selector) {
        const cleanSelector = selector.startsWith('.') ? selector : `.${selector}`;
        if (this.rules.has(cleanSelector)) {
            const index = this.rules.get(cleanSelector);
            try {
                this.sheet.deleteRule(index);
                this.rebuildRuleIndex();
            } catch (e) {
                console.error('[RuntimeStylesheet] 删除规则失败:', e);
            }
        }
    }

    /**
     * 清空所有规则
     */
    clear() {
        while (this.sheet.cssRules.length > 0) {
            this.sheet.deleteRule(0);
        }
        this.rules.clear();
    }
}

// 导出全局实例（在graphView.js中初始化）
if (typeof window !== 'undefined') {
    window.RuntimeStylesheet = RuntimeStylesheet;
}
