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

    // ===== CSP安全的DOM创建辅助函数 =====
    function el(tag, className, attrs = {}) {
        const element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        for (const [key, value] of Object.entries(attrs)) {
            if (key === 'text') {
                element.textContent = value;
            } else if (key === 'html') {
                element.innerHTML = value;
            } else {
                element.setAttribute(key, String(value));
            }
        }
        return element;
    }

    // ===== 状态管理 =====
    const cardStore = new Map(); // path -> CardInstance
    let mountLayer = null;
    let nextZIndex = 2000;
    let layoutEngine = null; // 外部布局引擎注入
    let runtimeStyles = null; // RuntimeStylesheet 实例 (从外部注入)

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
            const card = el('div', 'bp-card');
            card.id = `bp-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // 使用CSS变量设置位置(CSP安全)
            card.style.setProperty('--x', `${this.options.x}px`);
            card.style.setProperty('--y', `${this.options.y}px`);
            card.setAttribute('data-x', this.options.x);
            card.setAttribute('data-y', this.options.y);
            
            // 卡片头部
            const header = el('div', 'bp-header');
            
            const title = el('div', 'bp-title', {
                text: this.getFileName(this.path)
            });
            
            const controls = el('div', 'bp-header-actions');
            
            // 固定按钮
            const pinBtn = el('button', 'bp-icon-btn pin-btn', {
                html: this.options.pinned ? '📌' : '📍',
                title: this.options.pinned ? '取消固定' : '固定卡片'
            });
            if (this.options.pinned) {
                pinBtn.classList.add('is-active');
            }
            pinBtn.onclick = (e) => {
                e.stopPropagation();
                this.togglePin();
            };
            
            // 关闭按钮
            const closeBtn = el('button', 'bp-icon-btn close-btn', {
                html: '✕',
                title: '关闭卡片'
            });
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.close();
            };
            
            controls.appendChild(pinBtn);
            controls.appendChild(closeBtn);
            header.appendChild(title);
            header.appendChild(controls);
            
            // Tab导航栏
            const tabNav = el('div', 'bp-tabs');
            
            const tabs = [
                { id: 'overview', label: '概览', icon: '📋' },
                { id: 'deps', label: '依赖', icon: '🔗' },
                { id: 'ai', label: 'AI', icon: '🤖' },
                { id: 'notes', label: '备注', icon: '📝' }
            ];
            
            tabs.forEach(tab => {
                const tabBtn = el('button', 'bp-tab-btn', {
                    html: `${tab.icon} ${tab.label}`
                });
                tabBtn.setAttribute('data-tab', tab.id);
                
                if (tab.id === this.options.activeTab) {
                    tabBtn.classList.add('is-active');
                }
                
                tabBtn.onclick = () => this.switchTab(tab.id);
                tabNav.appendChild(tabBtn);
            });
            
            // 内容区域
            const content = el('div', 'bp-panel-host');
            
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
                
                // CSP-safe: 使用 RuntimeStylesheet 设置 z-index
                this.dom.classList.add('is-dragging');
                if (runtimeStyles) {
                    const zClass = `zindex-${this.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    this.dom.classList.add(zClass);
                    runtimeStyles.setZIndex(`.${zClass}`, nextZIndex++);
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
                
                // CSP-safe: 使用 CSS 变量更新位置
                this.dom.style.setProperty('--x', `${this.options.x}px`);
                this.dom.style.setProperty('--y', `${this.options.y}px`);
            });
            
            document.addEventListener('mouseup', () => {
                if (this.dragging) {
                    this.dragging = false;
                    // CSP-safe: 移除拖拽状态类
                    this.dom.classList.remove('is-dragging');
                    
                    // 保存位置
                    this.saveState();
                    
                    console.log(`[blueprintCard] 📍 拖拽完成: ${this.path} -> (${this.options.x}, ${this.options.y})`);
                }
            });
        }

        switchTab(tabId) {
            this.options.activeTab = tabId;
            
            // 更新Tab样式 (CSP-safe)
            this.tabNav.querySelectorAll('.bp-tab-btn').forEach(btn => {
                if (btn.classList.contains(`tab-${tabId}`)) {
                    btn.classList.add('is-active');
                } else {
                    btn.classList.remove('is-active');
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
                <div class="bp-deps-section">
                    <h4 class="bp-deps-title">📥 输入依赖 (${deps.in?.length || 0})</h4>
                    <div class="bp-deps-list">
                        ${(deps.in || []).map(dep => `
                            <div class="bp-dep-item" data-dep-path="${dep}" title="点击跳转到 ${dep}">📄 ${dep}</div>
                        `).join('') || '<div class="bp-deps-empty">无输入依赖</div>'}
                    </div>
                    
                    <h4 class="bp-deps-title">📤 输出依赖 (${deps.out?.length || 0})</h4>
                    <div class="bp-deps-list">
                        ${(deps.out || []).map(dep => `
                            <div class="bp-dep-item" data-dep-path="${dep}" title="点击跳转到 ${dep}">📄 ${dep}</div>
                        `).join('') || '<div class="bp-deps-empty">无输出依赖</div>'}
                    </div>
                </div>
            `;
            
            // 添加依赖点击事件
            this.content.querySelectorAll('.bp-dep-item').forEach(el => {
                el.onclick = () => {
                    const depPath = el.dataset.depPath;
                    this.onDependencyClick?.(depPath);
                };
            });
        }

        renderAIAnalysis() {
            const ai = this.data?.ai || {};
            
            this.content.innerHTML = `
                <div class="bp-ai-section">
                    ${ai.inferences?.length ? `
                        <h4 class="bp-section-title">🧠 AI 推断</h4>
                        <div class="bp-ai-list">
                            ${ai.inferences.map(inf => `
                                <div class="bp-ai-item bp-ai-item--inference">
                                    ${inf}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${ai.suggestions?.length ? `
                        <h4 class="bp-section-title">💡 改进建议</h4>
                        <div class="bp-ai-list">
                            ${ai.suggestions.map(sug => `
                                <div class="bp-ai-item bp-ai-item--suggestion">
                                    ${sug}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${!ai.inferences?.length && !ai.suggestions?.length ? `
                        <div class="bp-ai-empty">
                            <div class="bp-ai-empty-icon">🤖</div>
                            <div class="bp-ai-empty-text">暂无AI分析结果</div>
                            <div class="bp-ai-empty-hint">AI正在分析中...</div>
                        </div>
                    ` : ''}
                    
                    ${ai.lastModel ? `
                        <div class="bp-ai-meta">
                            模型: ${ai.lastModel} | 更新时间: ${ai.lastAt ? new Date(ai.lastAt).toLocaleString() : '未知'}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        renderNotes() {
            // 检测是否有增强版用户备注数据
            if (this.data?.enhancedUserNotes || this.shouldUseEnhancedNotes()) {
                this.renderEnhancedNotes();
                return;
            }
            
            // 兼容旧版用户备注(来自S3缓存系统)
            const userNotes = this.data?.userNotes || {};
            const comments = userNotes.comments || [];
            const tags = userNotes.tags || [];
            const priority = userNotes.priority || '';
            const lastEdited = userNotes.lastEditedAt;
            
            const safeId = this.path.replace(/[^a-zA-Z0-9]/g, '_');
            
            this.content.innerHTML = `
                <div class="bp-notes-legacy">
                    <!-- 升级提示 -->
                    <div class="bp-upgrade-prompt">
                        <div class="bp-upgrade-prompt-text">🎉 新版备注系统已上线!</div>
                        <button id="upgrade-notes-${safeId}" class="bp-upgrade-btn">🚀 升级到增强版备注</button>
                    </div>
                    
                    <!-- 优先级选择 -->
                    <div class="bp-priority-section">
                        <h4 class="bp-section-title">⚡ 优先级</h4>
                        <div class="bp-priority-selector">
                            <label class="bp-priority-label"><input type="radio" name="priority-${safeId}" value="high" ${priority === 'high' ? 'checked' : ''}> 🔴 高</label>
                            <label class="bp-priority-label"><input type="radio" name="priority-${safeId}" value="medium" ${priority === 'medium' ? 'checked' : ''}> 🟡 中</label>
                            <label class="bp-priority-label"><input type="radio" name="priority-${safeId}" value="low" ${priority === 'low' ? 'checked' : ''}> 🟢 低</label>
                            <label class="bp-priority-label"><input type="radio" name="priority-${safeId}" value="" ${!priority ? 'checked' : ''}> ⚪ 无</label>
                        </div>
                    </div>
                    
                    <!-- 标签管理 -->
                    <div class="bp-tags-section">
                        <h4 class="bp-section-title">🏷️ 标签</h4>
                        <div class="bp-tags-container">
                            <div class="bp-tags-display" id="tags-display-${safeId}">
                                ${tags.map(tag => `
                                    <span class="bp-tag-item" data-tag="${tag}">
                                        ${tag} 
                                        <span class="bp-tag-remove" onclick="window.blueprintCard.removeTag('${this.path}', '${tag}')">×</span>
                                    </span>
                                `).join('')}
                            </div>
                            <div class="bp-tags-input-row">
                                <input type="text" id="tag-input-${safeId}" class="bp-tag-input" placeholder="添加标签...">
                                <button id="add-tag-${safeId}" class="bp-tag-add-btn">+ 添加</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 评论列表 -->
                    <div class="bp-comments-section">
                        <h4 class="bp-section-title">💭 评论备注</h4>
                        <div class="bp-comments-list" id="comments-list-${safeId}">
                            ${comments.map((comment, index) => `
                                <div class="bp-comment-item" data-index="${index}">
                                    <div class="bp-comment-content">${this.escapeHtml(comment)}</div>
                                    <button class="bp-comment-remove" onclick="window.blueprintCard.removeComment('${this.path}', ${index})">删除</button>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="bp-comment-input-section">
                            <textarea id="comment-input-${safeId}" class="bp-comment-textarea" placeholder="添加新评论..."></textarea>
                            <div class="bp-comment-actions">
                                <button id="add-comment-${safeId}" class="bp-comment-add-btn">💬 添加评论</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 状态信息 -->
                    <div class="bp-notes-footer">
                        <div class="bp-notes-status">
                            ${lastEdited ? `最后编辑: ${new Date(lastEdited).toLocaleString()}` : '尚未保存'} (旧版)
                        </div>
                        <button id="save-all-notes-${safeId}" class="bp-notes-save-btn">💾 保存所有更改</button>
                    </div>
                </div>
            `;
            
            // 设置事件监听器
            this.setupNotesEventListeners(safeId);
            
            // 设置升级按钮
            this.setupUpgradeButton(safeId);
        }
        
        /**
         * 渲染增强版用户备注界面
         */
        renderEnhancedNotes() {
            // 清空容器并创建增强版UI
            this.content.innerHTML = '<div id="enhanced-notes-container" class="bp-enhanced-notes-container"></div>';
            
            // 请求获取增强版用户备注数据
            this.requestEnhancedUserNotes();
        }
        
        /**
         * 检查是否应该使用增强版备注
         */
        shouldUseEnhancedNotes() {
            // 检查localStorage中的用户偏好设置
            const preference = localStorage.getItem('user-notes-preference');
            return preference === 'enhanced';
        }
        
        /**
         * 设置升级按钮事件
         */
        setupUpgradeButton(safeId) {
            const upgradeBtn = this.content.querySelector(`#upgrade-notes-${safeId}`);
            if (upgradeBtn) {
                upgradeBtn.addEventListener('click', () => {
                    // 保存用户偏好
                    localStorage.setItem('user-notes-preference', 'enhanced');
                    
                    // 迁移现有数据到增强版格式
                    this.migrateToEnhancedNotes();
                    
                    // 重新渲染增强版界面
                    this.renderEnhancedNotes();
                });
            }
        }
        
        /**
         * 迁移旧版数据到增强版格式
         */
        migrateToEnhancedNotes() {
            const userNotes = this.data?.userNotes || {};
            
            // 创建增强版数据结构
            const enhancedNotes = {
                filePath: this.path,
                priority: this.mapPriorityToEnhanced(userNotes.priority),
                status: 'active',
                tags: (userNotes.tags || []).map(tag => ({
                    name: tag,
                    color: 'blue',
                    createdAt: Date.now()
                })),
                comments: (userNotes.comments || []).map((content, index) => ({
                    id: `migrated-${index}-${Date.now()}`,
                    content,
                    createdAt: userNotes.lastEditedAt || Date.now(),
                    pinned: false,
                    tags: []
                })),
                todos: [],
                links: [],
                customFields: {},
                metadata: {
                    createdAt: userNotes.lastEditedAt || Date.now(),
                    lastEditedAt: Date.now(),
                    editCount: 1,
                    version: '1.0.0'
                }
            };
            
            // 保存到增强版格式
            this.data.enhancedUserNotes = enhancedNotes;
            
            console.log('[BlueprintCard] 数据迁移完成', { 
                from: userNotes, 
                to: enhancedNotes 
            });
        }
        
        /**
         * 映射旧版优先级到增强版格式
         */
        mapPriorityToEnhanced(oldPriority) {
            const priorityMap = {
                'high': 'high',
                'medium': 'medium',
                'low': 'low'
            };
            return priorityMap[oldPriority] || 'none';
        }
        
        /**
         * 请求增强版用户备注数据
         */
        requestEnhancedUserNotes() {
            // 请求后端获取增强版用户备注
            if (window.vscode) {
                console.log('[BlueprintCard] 请求增强版用户备注:', this.path);
                
                window.vscode.postMessage({
                    type: 'get-enhanced-user-notes',
                    payload: {
                        filePath: this.path
                    }
                });
            }
        }
        
        /**
         * 处理增强版用户备注数据响应
         */
        handleEnhancedUserNotesData(data) {
            console.log('[BlueprintCard] 收到增强版用户备注数据:', data);
            
            // 更新本地数据
            this.data.enhancedUserNotes = data.notes;
            
            // 初始化增强版UI组件
            this.initEnhancedNotesUI(data.notes);
        }
        
        /**
         * 初始化增强版备注UI组件
         */
        initEnhancedNotesUI(notesData) {
            const container = this.content.querySelector('#enhanced-notes-container');
            if (!container) {
                console.error('[BlueprintCard] 增强版备注容器未找到');
                return;
            }
            
            // 检查是否已加载增强版UI模块
            if (typeof window.enhancedUserNotes !== 'undefined') {
                // 创建增强版UI实例
                const enhancedUI = window.enhancedUserNotes.create(
                    container,
                    this.path,
                    notesData
                );
                
                // 保存UI实例引用
                this.enhancedNotesUI = enhancedUI;
                
                console.log('[BlueprintCard] 增强版备注UI初始化完成');
                
            } else {
                // 动态加载增强版UI模块
                this.loadEnhancedNotesModule().then(() => {
                    this.initEnhancedNotesUI(notesData);
                }).catch(error => {
                    console.error('[BlueprintCard] 增强版备注模块加载失败:', error);
                    // 降级到简化界面
                    this.renderSimplifiedEnhancedNotes(notesData);
                });
            }
        }
        
        /**
         * 动态加载增强版备注模块
         */
        loadEnhancedNotesModule() {
            return new Promise((resolve, reject) => {
                if (typeof window.enhancedUserNotes !== 'undefined') {
                    resolve();
                    return;
                }
                
                const script = document.createElement('script');
                script.src = 'modules/enhancedUserNotes.js';
                script.onload = () => {
                    console.log('[BlueprintCard] 增强版备注模块加载成功');
                    resolve();
                };
                script.onerror = (error) => {
                    console.error('[BlueprintCard] 增强版备注模块加载失败:', error);
                    reject(error);
                };
                document.head.appendChild(script);
            });
        }
        
        /**
         * 渲染简化的增强版备注界面（降级方案）
         */
        renderSimplifiedEnhancedNotes(notesData) {
            const container = this.content.querySelector('#enhanced-notes-container');
            if (!container) return;
            
            container.innerHTML = `
                <div class="bp-fallback-container">
                    <div class="bp-fallback-icon">⚠️</div>
                    <div class="bp-fallback-title">增强版备注组件加载失败</div>
                    <div class="bp-fallback-hint">
                        正在使用简化模式显示备注数据
                    </div>
                    
                    <div class="bp-fallback-data">
                        <div class="bp-fallback-item">
                            <strong>优先级:</strong> ${this.getPriorityDisplay(notesData.priority)}
                        </div>
                        <div class="bp-fallback-item">
                            <strong>状态:</strong> ${this.getStatusDisplay(notesData.status)}
                        </div>
                        <div class="bp-fallback-item">
                            <strong>评论:</strong> ${notesData.comments?.length || 0} 条
                        </div>
                        <div class="bp-fallback-item">
                            <strong>待办:</strong> ${notesData.todos?.length || 0} 项
                        </div>
                        <div class="bp-fallback-item">
                            <strong>标签:</strong> ${notesData.tags?.length || 0} 个
                        </div>
                    </div>
                    
                    <button onclick="location.reload()" class="bp-fallback-reload-btn">🔄 重新加载</button>
                </div>
            `;
        }
        
        /**
         * 获取优先级显示文本
         */
        getPriorityDisplay(priority) {
            const displays = {
                'critical': '🔴 紧急',
                'high': '🟠 高',
                'medium': '🟡 中',
                'low': '🟢 低',
                'none': '⚪ 无'
            };
            return displays[priority] || '❓ 未知';
        }
        
        /**
         * 获取状态显示文本
         */
        getStatusDisplay(status) {
            const displays = {
                'active': '🚀 活跃',
                'review': '👀 Review',
                'deprecated': '⚠️ 废弃',
                'archive': '📦 归档',
                'testing': '🧪 测试',
                'done': '✅ 完成'
            };
            return displays[status] || '❓ 未知';
        }
        
        /**
         * 显示增强版备注错误
         */
        showEnhancedNotesError(error) {
            const container = this.content.querySelector('#enhanced-notes-container');
            if (container) {
                container.innerHTML = `
                    <div class="bp-error-container">
                        <div class="bp-error-icon">❌</div>
                        <div class="bp-error-title">
                            增强版备注加载失败
                        </div>
                        <div class="bp-error-message">
                            ${error || '未知错误'}
                        </div>
                        <button onclick="location.reload()" class="bp-error-reload-btn">🔄 重新加载</button>
                    </div>
                `;
            }
        }
        
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        setupNotesEventListeners(safeId) {
            // 标签添加
            const tagInput = this.content.querySelector(`#tag-input-${safeId}`);
            const addTagBtn = this.content.querySelector(`#add-tag-${safeId}`);
            
            const addTag = () => {
                const tagValue = tagInput.value.trim();
                if (tagValue) {
                    this.addTag(tagValue);
                    tagInput.value = '';
                }
            };
            
            if (addTagBtn) addTagBtn.onclick = addTag;
            if (tagInput) {
                tagInput.onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                    }
                };
            }
            
            // 评论添加
            const commentInput = this.content.querySelector(`#comment-input-${safeId}`);
            const addCommentBtn = this.content.querySelector(`#add-comment-${safeId}`);
            
            const addComment = () => {
                const commentValue = commentInput.value.trim();
                if (commentValue) {
                    this.addComment(commentValue);
                    commentInput.value = '';
                }
            };
            
            if (addCommentBtn) addCommentBtn.onclick = addComment;
            
            // 优先级更改
            const priorityInputs = this.content.querySelectorAll(`input[name="priority-${safeId}"]`);
            priorityInputs.forEach(input => {
                input.onchange = () => {
                    this.updatePriority(input.value);
                };
            });
            
            // 保存所有更改
            const saveAllBtn = this.content.querySelector(`#save-all-notes-${safeId}`);
            if (saveAllBtn) {
                saveAllBtn.onclick = () => this.saveUserNotes();
            }
        }
        
        addTag(tag) {
            if (!this.data) this.data = {};
            if (!this.data.userNotes) this.data.userNotes = { comments: [], tags: [] };
            if (!this.data.userNotes.tags) this.data.userNotes.tags = [];
            
            if (!this.data.userNotes.tags.includes(tag)) {
                this.data.userNotes.tags.push(tag);
                this.refreshNotesDisplay();
            }
        }
        
        addComment(comment) {
            if (!this.data) this.data = {};
            if (!this.data.userNotes) this.data.userNotes = { comments: [], tags: [] };
            if (!this.data.userNotes.comments) this.data.userNotes.comments = [];
            
            this.data.userNotes.comments.push(comment);
            this.refreshNotesDisplay();
        }
        
        updatePriority(priority) {
            if (!this.data) this.data = {};
            if (!this.data.userNotes) this.data.userNotes = { comments: [], tags: [] };
            
            this.data.userNotes.priority = priority || undefined;
            console.log(`[blueprintCard] 优先级更新为: ${priority || '无'}`);
        }
        
        refreshNotesDisplay() {
            if (this.options.activeTab === 'notes') {
                this.renderTabContent('notes');
            }
        }
        
        saveUserNotes() {
            if (!this.data?.userNotes) {
                console.log(`[blueprintCard] 没有用户备注需要保存: ${this.path}`);
                return;
            }
            
            // 更新最后编辑时间
            this.data.userNotes.lastEditedAt = Date.now();
            
            // 发送到后端保存
            if (window.vscode) {
                window.vscode.postMessage({
                    type: 'save-user-notes',
                    payload: {
                        filePath: this.path,
                        notes: {
                            comments: this.data.userNotes.comments || [],
                            tags: this.data.userNotes.tags || [],
                            priority: this.data.userNotes.priority
                        }
                    }
                });
                console.log(`[blueprintCard] 💾 保存用户备注: ${this.path}`, this.data.userNotes);
            } else {
                console.warn(`[blueprintCard] vscode API 不可用，无法保存备注`);
            }
        }

        saveNotes(content) {
            // 保持向后兼容的旧方法（现在转换为使用新的用户备注系统）
            if (content && content.trim()) {
                this.addComment(content);
                this.saveUserNotes();
            }
            console.log(`[blueprintCard] 💾 保存备注(兼容模式): ${this.path} (${content?.length || 0} 字符)`);
        }

        togglePin() {
            this.options.pinned = !this.options.pinned;
            this.pinBtn.innerHTML = this.options.pinned ? '📌' : '📍';
            this.pinBtn.title = this.options.pinned ? '取消固定' : '固定卡片';
            
            // CSP-safe: 使用 class 替代 inline style
            if (this.options.pinned) {
                this.dom.classList.add('is-pinned');
            } else {
                this.dom.classList.remove('is-pinned');
            }
            
            this.saveState();
            console.log(`[blueprintCard] 📌 ${this.options.pinned ? '固定' : '取消固定'}: ${this.path}`);
        }

        close() {
            if (this.dom && this.dom.parentElement) {
                // CSP-safe: 使用 class 实现动画关闭
                this.dom.classList.add('is-closed');
                
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
            
            // 使用bp-card-layer class (已在bp.css中定义)
            if (!mountLayer.classList.contains('bp-card-layer')) {
                mountLayer.classList.add('bp-card-layer');
            }
            
            console.log('[blueprintCard] ✅ 挂载成功:', selector);
            return true;
        },

        /**
         * 显示卡片
         */
        showCard(path, data = null, options = {}) {
            if (cardStore.has(path)) {
                // 已存在，更新数据并置顶 (CSP-safe)
                const card = cardStore.get(path);
                if (data) card.updateData(data);
                if (runtimeStyles) {
                    const zClass = `zindex-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    card.dom.classList.add(zClass);
                    runtimeStyles.setZIndex(`.${zClass}`, nextZIndex++);
                }
                return card;
            }
            
            // 创建新卡片
            const card = new CardInstance(path, options);
            if (card.loadState()) {
                // 恢复保存的状态 (CSP-safe: 使用 CSS 变量)
                card.dom.style.setProperty('--x', `${card.options.x}px`);
                card.dom.style.setProperty('--y', `${card.options.y}px`);
                card.dom.style.setProperty('--bp-card-w', `${card.options.width}px`);
                card.dom.style.setProperty('--bp-card-h', `${card.options.height}px`);
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
         * 注入 RuntimeStylesheet 实例 (CSP-safe)
         */
        setRuntimeStyles(stylesInstance) {
            runtimeStyles = stylesInstance;
            console.log('[blueprintCard] ✅ RuntimeStylesheet 已注入');
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
        },

        /**
         * 全局方法：移除标签
         */
        removeTag(path, tag) {
            const card = cardStore.get(path);
            if (card && card.data && card.data.userNotes && card.data.userNotes.tags) {
                const index = card.data.userNotes.tags.indexOf(tag);
                if (index > -1) {
                    card.data.userNotes.tags.splice(index, 1);
                    card.refreshNotesDisplay();
                }
            }
        },

        /**
         * 全局方法：移除评论
         */
        removeComment(path, index) {
            const card = cardStore.get(path);
            if (card && card.data && card.data.userNotes && card.data.userNotes.comments) {
                card.data.userNotes.comments.splice(index, 1);
                card.refreshNotesDisplay();
            }
        },

        /**
         * 获取指定路径的卡片实例
         */
        getCard(path) {
            return cardStore.get(path);
        },
        
        /**
         * 处理增强版用户备注数据消息
         */
        handleEnhancedUserNotesData(message) {
            const { filePath, notes, success, error } = message.payload;
            const card = cardStore.get(filePath);
            
            if (card) {
                console.log('[BlueprintCard] 处理增强版用户备注数据:', filePath, success);
                
                if (success) {
                    card.handleEnhancedUserNotesData(message.payload);
                } else {
                    console.error('[BlueprintCard] 获取增强版用户备注失败:', error);
                    // 显示错误信息或降级处理
                    card.showEnhancedNotesError(error);
                }
            } else {
                console.warn('[BlueprintCard] 未找到对应的卡片实例:', filePath);
            }
        },
        
        /**
         * 处理增强版用户备注保存结果消息
         */
        handleEnhancedUserNotesSaved(message) {
            const { filePath, success, error } = message.payload;
            const card = cardStore.get(filePath);
            
            if (card) {
                console.log('[BlueprintCard] 增强版用户备注保存结果:', filePath, success);
                
                if (success) {
                    // 通知UI保存成功
                    if (card.enhancedNotesUI && typeof card.enhancedNotesUI.onSaveSuccess === 'function') {
                        card.enhancedNotesUI.onSaveSuccess();
                    }
                } else {
                    console.error('[BlueprintCard] 增强版用户备注保存失败:', error);
                    // 通知UI保存失败
                    if (card.enhancedNotesUI && typeof card.enhancedNotesUI.onSaveError === 'function') {
                        card.enhancedNotesUI.onSaveError(error);
                    }
                }
            } else {
                console.warn('[BlueprintCard] 未找到对应的卡片实例:', filePath);
            }
        }
    };

    // 暴露全局方法到window，供HTML onclick使用
    if (typeof window !== 'undefined') {
        window.blueprintCard = api;
    }

    return api;
});