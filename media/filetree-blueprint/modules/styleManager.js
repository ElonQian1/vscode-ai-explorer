/**
 * 🎨 运行时样式管理器 - CSP兼容的动态样式解决方案
 * 
 * 通过一个带nonce的<style>标签管理所有动态样式，
 * 完全避免内联style属性导致的CSP拦截问题。
 */
class StyleManager {
    constructor(nonce) {
        // 创建运行时样式容器
        this.styleEl = document.createElement('style');
        this.styleEl.id = 'runtime-styles';
        this.styleEl.setAttribute('nonce', nonce);
        document.head.appendChild(this.styleEl);
        
        this.sheet = this.styleEl.sheet;
        this.rules = new Map(); // 规则映射
        
        console.log('[StyleManager] ✅ 初始化完成，nonce:', nonce);
    }
    
    /**
     * 设置元素几何位置和尺寸
     */
    setRect(domId, { x, y, w, h, position = 'absolute' }) {
        const selector = `#${CSS.escape(domId)}`;
        const cssText = `
            position: ${position};
            left: ${x}px;
            top: ${y}px;
            width: ${w}px;
            height: ${h}px;
        `;
        this._upsertRule(selector, cssText);
    }
    
    /**
     * 设置CSS自定义属性（变量）
     */
    setVars(domId, vars) {
        const selector = `#${CSS.escape(domId)}`;
        const cssText = Object.entries(vars)
            .map(([key, value]) => `--${key}: ${value}`)
            .join('; ');
        this._upsertRule(selector + '__vars', `${selector} { ${cssText} }`);
    }
    
    /**
     * 添加类名规则
     */
    addClassRule(className, cssText) {
        const selector = `.${className}`;
        this._upsertRule(selector, `${selector} { ${cssText} }`);
    }
    
    /**
     * 设置元素内联样式（通过CSS选择器）
     */
    setElementStyle(domId, cssText) {
        const selector = `#${CSS.escape(domId)}`;
        this._upsertRule(selector, `${selector} { ${cssText} }`);
    }
    
    /**
     * 移除规则
     */
    removeRule(key) {
        if (this.rules.has(key)) {
            try {
                const index = this._findRuleIndex(key);
                if (index !== -1) {
                    this.sheet.deleteRule(index);
                }
            } catch (e) {
                console.warn('[StyleManager] 删除规则失败:', key, e);
            }
            this.rules.delete(key);
        }
    }
    
    /**
     * 批量设置样式
     */
    setBatch(styles) {
        Object.entries(styles).forEach(([key, cssText]) => {
            if (key.startsWith('#')) {
                this.setElementStyle(key.slice(1), cssText);
            } else if (key.startsWith('.')) {
                this.addClassRule(key.slice(1), cssText);
            } else {
                this._upsertRule(key, cssText);
            }
        });
    }
    
    /**
     * 清空所有运行时样式
     */
    clear() {
        this.styleEl.textContent = '';
        this.rules.clear();
    }
    
    // 私有方法：插入或更新规则
    _upsertRule(key, ruleText) {
        try {
            // 先删除旧规则
            this.removeRule(key);
            
            // 插入新规则
            const index = this.sheet.cssRules.length;
            this.sheet.insertRule(ruleText, index);
            this.rules.set(key, ruleText);
            
        } catch (e) {
            console.warn('[StyleManager] 规则插入失败:', key, e);
        }
    }
    
    // 私有方法：查找规则索引
    _findRuleIndex(key) {
        const targetText = this.rules.get(key);
        if (!targetText) return -1;
        
        for (let i = 0; i < this.sheet.cssRules.length; i++) {
            if (this.sheet.cssRules[i].cssText.includes(key)) {
                return i;
            }
        }
        return -1;
    }
    
    /**
     * 调试：打印所有规则
     */
    debug() {
        console.log('[StyleManager] 当前规则:', {
            count: this.rules.size,
            rules: Array.from(this.rules.entries())
        });
    }
}

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StyleManager;
} else {
    window.StyleManager = StyleManager;
}