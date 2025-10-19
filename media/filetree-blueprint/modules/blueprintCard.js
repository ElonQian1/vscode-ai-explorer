/**
 * 蓝图卡片组件 (UMD模块)
 * 支持可拖拽、可固定、多Tab、语义缩放的虚幻引擎风格卡片
 * 
 * 设计目标：
 * - 替换模态框为画布上层的浮动卡片
 * - 支持多卡片并存，互不遮挡交互
 * - 卡片展开时通知布局引擎重新排列其他节点
 * - Tab式内容组织：概览/依赖/AI/备注
 * - 位置和状态持久化
 */

(function (global, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        // CommonJS
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // 浏览器全局
        global.blueprintCard = factory();
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // ===== 状态管理 =====
    const cardStore = new Map(); // path -> CardInstance
    let mountLayer = null;
    let nextZIndex = 2000;
    let layoutEngine = null; // 外部布局引擎注入

    // ===== 卡片实例类 =====
    class CardInstance {
        constructor(path, options = {}) {
            this.path = path;
            this.options = {
                width: 520,
                height: 420,
                x: 120,
                y: 120,
                pinned: false,
                activeTab: 'overview',
                ...options
            };
            
            this.dom = null;
            this.data = null;
            this.dragging = false;
            this.dragStart = { x: 0, y: 0, cardX: 0, cardY: 0 };
            
            this.create();
        }

        create() {
            const card = document.createElement('div');
            card.className = 'blueprint-card';
            card.id = `blueprint-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // 使用StyleManager设置位置和z-index
            if (window.styleManager) {
                window.styleManager.setRect(card.id, {
                    x: this.options.x,
                    y: this.options.y,
                    w: this.options.width,
                    h: this.options.height,
                    position: 'absolute'
                });
                window.styleManager.setVars(card.id, {
                    'z-index': nextZIndex++
                });
            } else {
                console.warn('[BlueprintCard] StyleManager未初始化，使用内联样式降级');
                card.style.cssText = `
                    position: absolute;
                    left: ${this.options.x}px;
                    top: ${this.options.y}px;
                    width: ${this.options.width}px;
                    height: ${this.options.height}px;
                    z-index: ${nextZIndex++};
                    pointer-events: auto;
                    background: var(--vscode-editor-background, #1e1e1e);
                    border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.12));
                    border-radius: 8px;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    transition: transform 0.15s ease-out;
                `;
            }
            
            // 卡片头部
            const header = document.createElement('div');
            header.className = 'blueprint-card-header';
            header.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                background: var(--vscode-tab-activeBackground, rgba(255,255,255,0.05));
                border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
                cursor: move;
                user-select: none;
                flex-shrink: 0;
            `;
            
            const title = document.createElement('div');
            title.className = 'card-title';
            title.style.cssText = `
                font-weight: 600;
                font-size: 13px;
                color: var(--vscode-foreground);
                flex: 1;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            `;
            title.textContent = this.getFileName(this.path);
            
            const controls = document.createElement('div');
            controls.className = 'card-controls';
            controls.style.cssText = `
                display: flex;
                gap: 4px;
            `;
            
            // 固定按钮
            const pinBtn = document.createElement('button');
            pinBtn.className = 'pin-btn';
            pinBtn.innerHTML = this.options.pinned ? '📌' : '📍';
            pinBtn.title = this.options.pinned ? '取消固定' : '固定卡片';
            pinBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--vscode-foreground);
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                font-size: 12px;
            `;
            pinBtn.onclick = (e) => {
                e.stopPropagation();
                this.togglePin();
            };
            
            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.className = 'close-btn';
            closeBtn.innerHTML = '✕';
            closeBtn.title = '关闭卡片';
            closeBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--vscode-foreground);
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 12px;
            `;
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.close();
            };
            
            controls.appendChild(pinBtn);
            controls.appendChild(closeBtn);
            header.appendChild(title);
            header.appendChild(controls);
            
            // Tab导航栏
            const tabNav = document.createElement('div');
            tabNav.className = 'tab-nav';
            tabNav.style.cssText = `
                display: flex;
                background: var(--vscode-editor-background);
                border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
                flex-shrink: 0;
            `;
            
            const tabs = [
                { id: 'overview', label: '概览', icon: '📋' },
                { id: 'deps', label: '依赖', icon: '🔗' },
                { id: 'ai', label: 'AI', icon: '🤖' },
                { id: 'notes', label: '备注', icon: '📝' }
            ];
            
            tabs.forEach(tab => {
                const tabBtn = document.createElement('button');
                tabBtn.className = `tab-btn tab-${tab.id}`;
                tabBtn.innerHTML = `${tab.icon} ${tab.label}`;
                tabBtn.style.cssText = `
                    background: none;
                    border: none;
                    color: var(--vscode-foreground);
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 11px;
                    border-bottom: 2px solid transparent;
                    transition: all 0.15s ease;
                    ${tab.id === this.options.activeTab ? 'border-bottom-color: var(--vscode-focusBorder);' : ''}
                `;
                
                tabBtn.onclick = () => this.switchTab(tab.id);
                tabNav.appendChild(tabBtn);
            });
            
            // 内容区域
            const content = document.createElement('div');
            content.className = 'card-content';
            content.style.cssText = `
                flex: 1;
                overflow: auto;
                padding: 12px;
            `;
            
            // 组装卡片
            card.appendChild(header);
            card.appendChild(tabNav);
            card.appendChild(content);
            
            this.dom = card;
            this.header = header;
            this.content = content;
            this.tabNav = tabNav;
            this.pinBtn = pinBtn;
            
            // 设置拖拽
            this.setupDrag();
            
            // 挂载到容器
            if (mountLayer) {
                mountLayer.appendChild(card);
                console.log(`[blueprintCard] ✅ 创建卡片: ${this.path} (${this.options.width}x${this.options.height})`);
            }
        }

        setupDrag() {
            this.header.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return; // 不响应按钮点击
                
                this.dragging = true;
                this.dragStart = {
                    x: e.clientX,
                    y: e.clientY,
                    cardX: this.options.x,
                    cardY: this.options.y
                };
                
                if (window.styleManager) {
                    window.styleManager.setElementStyle(this.dom.id, `
                        cursor: grabbing !important;
                        z-index: ${nextZIndex++} !important;
                        transform: scale(1.02) !important;
                    `);
                } else {
                    this.dom.style.cursor = 'grabbing';
                    this.dom.style.zIndex = nextZIndex++;
                    this.dom.style.transform = 'scale(1.02)';
                }
                
                e.preventDefault();
                e.stopPropagation();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!this.dragging) return;
                
                const dx = e.clientX - this.dragStart.x;
                const dy = e.clientY - this.dragStart.y;
                
                this.options.x = this.dragStart.cardX + dx;
                this.options.y = this.dragStart.cardY + dy;
                
                // 网格吸附 (可选)
                if (e.shiftKey) {
                    const gridSize = 20;
                    this.options.x = Math.round(this.options.x / gridSize) * gridSize;
                    this.options.y = Math.round(this.options.y / gridSize) * gridSize;
                }
                
                if (window.styleManager) {
                    window.styleManager.setElementStyle(this.dom.id, `
                        left: ${this.options.x}px !important;
                        top: ${this.options.y}px !important;
                    `);
                } else {
                    this.dom.style.left = this.options.x + 'px';
                    this.dom.style.top = this.options.y + 'px';
                }
            });
            
            document.addEventListener('mouseup', () => {
                if (this.dragging) {
                    this.dragging = false;
                    if (window.styleManager) {
                        window.styleManager.setElementStyle(this.dom.id, `
                            cursor: move !important;
                            transform: scale(1) !important;
                        `);
                    } else {
                        this.dom.style.cursor = 'move';
                        this.dom.style.transform = 'scale(1)';
                    }
                    
                    // 保存位置
                    this.saveState();
                    
                    console.log(`[blueprintCard] 📍 拖拽完成: ${this.path} -> (${this.options.x}, ${this.options.y})`);
                }
            });
        }

        switchTab(tabId) {
            this.options.activeTab = tabId;
            
            // 更新Tab样式
            this.tabNav.querySelectorAll('.tab-btn').forEach(btn => {
                if (btn.classList.contains(`tab-${tabId}`)) {
                    btn.style.borderBottomColor = 'var(--vscode-focusBorder)';
                } else {
                    btn.style.borderBottomColor = 'transparent';
                }
            });
            
            // 渲染对应内容
            this.renderTabContent(tabId);
            this.saveState();
        }

        renderTabContent(tabId) {
            if (!this.data) {
                this.content.innerHTML = '<div class="loading-message">正在加载数据...</div>';
                return;
            }
            
            switch (tabId) {
                case 'overview':
                    this.renderOverview();
                    break;
                case 'deps':
                    this.renderDependencies();
                    break;
                case 'ai':
                    this.renderAIAnalysis();
                    break;
                case 'notes':
                    this.renderNotes();
                    break;
            }
        }

        renderOverview() {
            const { data } = this;
            const fileInfo = data.meta || data.fileInfo || {};
            
            this.content.innerHTML = `
                <div class="overview-section">
                    <h4 class="section-title">📁 文件信息</h4>
                    <div class="section-content">
                        <div>路径: <code>${this.path}</code></div>
                        <div>大小: ${this.formatFileSize(fileInfo.size || 0)}</div>
                        <div>类型: ${fileInfo.extension || data.lang || 'Unknown'}</div>
                        <div>修改: ${fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleDateString() : 'Unknown'}</div>
                    </div>
                </div>
                
                ${data.static ? `
                <div class="overview-section overview-section--spaced">
                    <h4 class="section-title">🔍 静态分析</h4>
                    <div class="section-content">
                        <div>导出: ${data.static.exports?.length || 0} 个</div>
                        <div>依赖: ${data.static.deps?.in?.length || 0} 个输入, ${data.static.deps?.out?.length || 0} 个输出</div>
                        ${data.static.summary ? `<div class="summary-text">"${data.static.summary}"</div>` : ''}
                    </div>
                </div>
                ` : ''}
            `;
        }

        renderDependencies() {
            const deps = this.data?.static?.deps || this.data?.deps || { in: [], out: [] };
            
            this.content.innerHTML = `
                <div class="deps-section">
                    <h4 style="margin: 0 0 8px 0; color: var(--vscode-foreground); font-size: 13px;">📥 输入依赖 (${deps.in?.length || 0})</h4>
                    <div style="max-height: 120px; overflow-y: auto; margin-bottom: 16px;">
                        ${(deps.in || []).map(dep => `
                            <div style="font-size: 11px; padding: 4px 8px; margin: 2px 0; background: var(--vscode-input-background); border-radius: 4px; cursor: pointer;" 
                                 title="点击跳转到 ${dep}">📄 ${dep}</div>
                        `).join('') || '<div style="color: var(--vscode-descriptionForeground); font-size: 12px;">无输入依赖</div>'}
                    </div>
                    
                    <h4 style="margin: 0 0 8px 0; color: var(--vscode-foreground); font-size: 13px;">📤 输出依赖 (${deps.out?.length || 0})</h4>
                    <div style="max-height: 120px; overflow-y: auto;">
                        ${(deps.out || []).map(dep => `
                            <div style="font-size: 11px; padding: 4px 8px; margin: 2px 0; background: var(--vscode-input-background); border-radius: 4px; cursor: pointer;" 
                                 title="点击跳转到 ${dep}">📄 ${dep}</div>
                        `).join('') || '<div style="color: var(--vscode-descriptionForeground); font-size: 12px;">无输出依赖</div>'}
                    </div>
                </div>
            `;
            
            // 添加依赖点击事件
            this.content.querySelectorAll('[title^="点击跳转到"]').forEach(el => {
                el.onclick = () => {
                    const depPath = el.title.replace('点击跳转到 ', '');
                    this.onDependencyClick?.(depPath);
                };
            });
        }

        renderAIAnalysis() {
            const ai = this.data?.ai || {};
            
            this.content.innerHTML = `
                <div class="ai-section">
                    ${ai.inferences?.length ? `
                        <h4 class="section-title">🧠 AI 推断</h4>
                        <div class="ai-inferences">
                            ${ai.inferences.map(inf => `
                                <div class="ai-item ai-item--inference">
                                    ${inf}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${ai.suggestions?.length ? `
                        <h4 class="section-title">💡 改进建议</h4>
                        <div class="ai-suggestions">
                            ${ai.suggestions.map(sug => `
                                <div class="ai-item ai-item--suggestion">
                                    ${sug}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${!ai.inferences?.length && !ai.suggestions?.length ? `
                        <div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">
                            <div style="font-size: 24px; margin-bottom: 8px;">🤖</div>
                            <div>暂无AI分析结果</div>
                            <div style="font-size: 11px; margin-top: 4px;">AI正在分析中...</div>
                        </div>
                    ` : ''}
                    
                    ${ai.lastModel ? `
                        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border); font-size: 10px; color: var(--vscode-descriptionForeground);">
                            模型: ${ai.lastModel} | 更新时间: ${ai.lastAt ? new Date(ai.lastAt).toLocaleString() : '未知'}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        renderNotes() {
            const notes = this.data?.notes || {};
            const markdown = notes.md || '';
            
            this.content.innerHTML = `
                <div class="notes-section">
                    <textarea 
                        id="notes-${this.path.replace(/[^a-zA-Z0-9]/g, '_')}"
                        placeholder="在此添加您的备注和笔记...&#10;&#10;支持 Markdown 格式：&#10;- **粗体** *斜体*&#10;- # 标题&#10;- - 列表项&#10;- [链接](url)"
                        style="
                            width: 100%; 
                            height: 280px; 
                            border: 1px solid var(--vscode-input-border); 
                            background: var(--vscode-input-background); 
                            color: var(--vscode-input-foreground);
                            padding: 8px;
                            border-radius: 4px;
                            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
                            font-size: 12px;
                            resize: vertical;
                            line-height: 1.4;
                        "
                    >${markdown}</textarea>
                    
                    <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 10px; color: var(--vscode-descriptionForeground);">
                            ${notes.updatedAt ? `最后更新: ${new Date(notes.updatedAt).toLocaleString()}` : '尚未保存'}
                            ${notes.author ? ` | 作者: ${notes.author}` : ''}
                        </div>
                        <button id="save-notes-${this.path.replace(/[^a-zA-Z0-9]/g, '_')}" 
                                style="
                                    background: var(--vscode-button-background);
                                    color: var(--vscode-button-foreground);
                                    border: none;
                                    padding: 4px 8px;
                                    border-radius: 3px;
                                    font-size: 11px;
                                    cursor: pointer;
                                ">💾 保存</button>
                    </div>
                </div>
            `;
            
            // 设置保存事件
            const saveBtn = this.content.querySelector(`#save-notes-${this.path.replace(/[^a-zA-Z0-9]/g, '_')}`);
            const textarea = this.content.querySelector(`#notes-${this.path.replace(/[^a-zA-Z0-9]/g, '_')}`);
            
            if (saveBtn && textarea) {
                saveBtn.onclick = () => this.saveNotes(textarea.value);
                
                // 自动保存 (防抖)
                let saveTimeout;
                textarea.oninput = () => {
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => this.saveNotes(textarea.value), 2000);
                };
            }
        }

        saveNotes(content) {
            if (!this.data) this.data = {};
            if (!this.data.notes) this.data.notes = {};
            
            this.data.notes.md = content;
            this.data.notes.updatedAt = new Date().toISOString();
            this.data.notes.author = 'Current User'; // 可以从VS Code API获取
            
            // 通知扩展端保存
            this.onNotesChange?.(this.path, this.data.notes);
            
            // 更新界面显示
            const statusEl = this.content.querySelector('.notes-section div div');
            if (statusEl) {
                statusEl.textContent = `最后更新: ${new Date().toLocaleString()} | 作者: ${this.data.notes.author}`;
            }
            
            console.log(`[blueprintCard] 💾 保存备注: ${this.path} (${content.length} 字符)`);
        }

        togglePin() {
            this.options.pinned = !this.options.pinned;
            this.pinBtn.innerHTML = this.options.pinned ? '📌' : '📍';
            this.pinBtn.title = this.options.pinned ? '取消固定' : '固定卡片';
            
            // 视觉反馈
            if (this.options.pinned) {
                this.dom.style.borderColor = 'var(--vscode-focusBorder)';
                this.dom.style.boxShadow = '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px var(--vscode-focusBorder)';
            } else {
                this.dom.style.borderColor = 'var(--vscode-panel-border, rgba(255,255,255,0.12))';
                this.dom.style.boxShadow = '0 12px 40px rgba(0,0,0,0.5)';
            }
            
            this.saveState();
            console.log(`[blueprintCard] 📌 ${this.options.pinned ? '固定' : '取消固定'}: ${this.path}`);
        }

        close() {
            if (this.dom && this.dom.parentElement) {
                // 动画关闭
                this.dom.style.transform = 'scale(0.8)';
                this.dom.style.opacity = '0';
                this.dom.style.transition = 'all 0.2s ease-out';
                
                setTimeout(() => {
                    this.dom.remove();
                    cardStore.delete(this.path);
                    
                    // 通知布局引擎节点收起
                    this.onClose?.(this.path);
                    
                    console.log(`[blueprintCard] ❌ 关闭卡片: ${this.path}`);
                }, 200);
            }
        }

        updateData(newData) {
            // 增量合并数据，不覆盖用户备注
            if (!this.data) this.data = {};
            
            // 保护用户备注
            const preservedNotes = this.data.notes;
            
            // 合并新数据
            this.data = {
                ...this.data,
                ...newData,
                ai: {
                    ...(this.data.ai || {}),
                    ...(newData.ai || {})
                }
            };
            
            // 恢复用户备注
            if (preservedNotes) {
                this.data.notes = preservedNotes;
            }
            
            // 重新渲染当前Tab
            this.renderTabContent(this.options.activeTab);
            
            console.log(`[blueprintCard] 🔄 更新数据: ${this.path}`);
        }

        saveState() {
            // 保存卡片状态到localStorage
            const state = {
                x: this.options.x,
                y: this.options.y,
                width: this.options.width,
                height: this.options.height,
                pinned: this.options.pinned,
                activeTab: this.options.activeTab
            };
            
            try {
                localStorage.setItem(`blueprint-card-${this.path}`, JSON.stringify(state));
            } catch (e) {
                console.warn('[blueprintCard] 保存状态失败:', e);
            }
        }

        loadState() {
            try {
                const saved = localStorage.getItem(`blueprint-card-${this.path}`);
                if (saved) {
                    const state = JSON.parse(saved);
                    Object.assign(this.options, state);
                    return true;
                }
            } catch (e) {
                console.warn('[blueprintCard] 加载状态失败:', e);
            }
            return false;
        }

        getFileName(path) {
            if (!path) return 'Unknown';
            return path.split(/[\\/]/).pop() || path;
        }

        formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
    }

    // ===== 公共API =====
    const api = {
        /**
         * 挂载卡片层
         */
        mount(selector) {
            mountLayer = document.querySelector(selector);
            if (!mountLayer) {
                console.error('[blueprintCard] ❌ 找不到挂载容器:', selector);
                return false;
            }
            
            // 设置挂载层样式
            mountLayer.style.cssText = `
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 1500;
                overflow: hidden;
            `;
            
            console.log('[blueprintCard] ✅ 挂载成功:', selector);
            return true;
        },

        /**
         * 显示卡片
         */
        showCard(path, data = null, options = {}) {
            if (cardStore.has(path)) {
                // 已存在，更新数据并置顶
                const card = cardStore.get(path);
                if (data) card.updateData(data);
                card.dom.style.zIndex = nextZIndex++;
                return card;
            }
            
            // 创建新卡片
            const card = new CardInstance(path, options);
            if (card.loadState()) {
                // 恢复保存的状态
                card.dom.style.left = card.options.x + 'px';
                card.dom.style.top = card.options.y + 'px';
                card.dom.style.width = card.options.width + 'px';
                card.dom.style.height = card.options.height + 'px';
                card.switchTab(card.options.activeTab);
            }
            
            if (data) card.updateData(data);
            cardStore.set(path, card);
            
            // 通知布局引擎节点展开
            card.onOpen?.(path, {
                width: card.options.width,
                height: card.options.height
            });
            
            return card;
        },

        /**
         * 更新卡片数据
         */
        updateCard(path, data) {
            const card = cardStore.get(path);
            if (card) {
                card.updateData(data);
                return true;
            }
            return false;
        },

        /**
         * 关闭卡片
         */
        closeCard(path) {
            const card = cardStore.get(path);
            if (card) {
                card.close();
                return true;
            }
            return false;
        },

        /**
         * 关闭所有卡片
         */
        closeAll() {
            const paths = Array.from(cardStore.keys());
            paths.forEach(path => this.closeCard(path));
        },

        /**
         * 获取所有卡片
         */
        getAllCards() {
            return Array.from(cardStore.values());
        },

        /**
         * 设置事件回调
         */
        setCallbacks(callbacks) {
            const { onOpen, onClose, onNotesChange, onDependencyClick } = callbacks;
            
            // 为所有现有卡片设置回调
            cardStore.forEach(card => {
                if (onOpen) card.onOpen = onOpen;
                if (onClose) card.onClose = onClose;
                if (onNotesChange) card.onNotesChange = onNotesChange;
                if (onDependencyClick) card.onDependencyClick = onDependencyClick;
            });
            
            // 为新卡片设置默认回调
            this._defaultCallbacks = callbacks;
        },

        /**
         * 注入布局引擎
         */
        setLayoutEngine(engine) {
            layoutEngine = engine;
        }
    };

    return api;
});