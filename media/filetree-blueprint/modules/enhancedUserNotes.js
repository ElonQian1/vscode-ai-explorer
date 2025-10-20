/**
 * 增强版用户备注UI组件 (UMD模块)
 * 支持富文本、标签管理、待办事项、评分等功能
 * 
 * 特性：
 * - 📝 富文本评论系统（支持Markdown）
 * - 🏷️ 标签管理（颜色分类）
 * - ✅ 待办事项列表
 * - ⭐ 文件评分系统
 * - 🔗 相关链接管理
 * - 📊 优先级和状态管理
 * - 💾 实时保存和同步
 */

(function (global, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        global.enhancedUserNotes = factory();
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // ===== 状态管理 =====
    const notesStore = new Map(); // filePath -> UserNotes
    let currentFilePath = null;
    
    // ===== 用户备注数据结构 =====
    const Priority = {
        CRITICAL: 'critical',
        HIGH: 'high', 
        MEDIUM: 'medium',
        LOW: 'low',
        NONE: 'none'
    };
    
    const FileStatus = {
        ACTIVE: 'active',
        REVIEW: 'review', 
        DEPRECATED: 'deprecated',
        ARCHIVE: 'archive',
        TESTING: 'testing',
        DONE: 'done'
    };
    
    const TagColor = {
        RED: 'red',
        ORANGE: 'orange',
        YELLOW: 'yellow', 
        GREEN: 'green',
        BLUE: 'blue',
        PURPLE: 'purple',
        PINK: 'pink',
        GRAY: 'gray'
    };

    // ===== 工具函数 =====
    function generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    function createEmptyUserNotes(filePath) {
        const now = Date.now();
        return {
            filePath,
            priority: Priority.NONE,
            status: FileStatus.ACTIVE,
            tags: [],
            comments: [],
            todos: [],
            links: [],
            customFields: {},
            metadata: {
                createdAt: now,
                lastEditedAt: now,
                editCount: 0,
                version: '1.0.0'
            }
        };
    }
    
    function getPriorityDisplay(priority) {
        switch (priority) {
            case Priority.CRITICAL:
                return { icon: '🔴', label: '紧急', color: '#ff4757' };
            case Priority.HIGH:
                return { icon: '🟠', label: '高', color: '#ff7f50' };
            case Priority.MEDIUM:
                return { icon: '🟡', label: '中', color: '#ffa502' };
            case Priority.LOW:
                return { icon: '🟢', label: '低', color: '#7bed9f' };
            case Priority.NONE:
            default:
                return { icon: '⚪', label: '无', color: '#747d8c' };
        }
    }
    
    function getStatusDisplay(status) {
        switch (status) {
            case FileStatus.ACTIVE:
                return { icon: '🚀', label: '活跃', color: '#2ed573' };
            case FileStatus.REVIEW:
                return { icon: '👀', label: 'Review', color: '#ffa502' };
            case FileStatus.DEPRECATED:
                return { icon: '⚠️', label: '废弃', color: '#ff4757' };
            case FileStatus.ARCHIVE:
                return { icon: '📦', label: '归档', color: '#747d8c' };
            case FileStatus.TESTING:
                return { icon: '🧪', label: '测试', color: '#5352ed' };
            case FileStatus.DONE:
                return { icon: '✅', label: '完成', color: '#2ed573' };
            default:
                return { icon: '❓', label: '未知', color: '#747d8c' };
        }
    }
    
    function getTagColorValue(color) {
        const colorMap = {
            [TagColor.RED]: '#ff4757',
            [TagColor.ORANGE]: '#ffa502',
            [TagColor.YELLOW]: '#ffda79',
            [TagColor.GREEN]: '#7bed9f',
            [TagColor.BLUE]: '#70a1ff',
            [TagColor.PURPLE]: '#5352ed',
            [TagColor.PINK]: '#ff6b81',
            [TagColor.GRAY]: '#747d8c'
        };
        return colorMap[color] || colorMap[TagColor.GRAY];
    }

    // ===== 主要UI渲染类 =====
    class EnhancedUserNotesUI {
        constructor(container, filePath, initialData = null) {
            this.container = container;
            this.filePath = filePath;
            this.data = initialData || createEmptyUserNotes(filePath);
            this.isDirty = false;
            
            currentFilePath = filePath;
            notesStore.set(filePath, this.data);
            
            this.render();
        }
        
        render() {
            this.container.innerHTML = `
                <div class="enhanced-notes-container" style="
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    height: 100%;
                    overflow-y: auto;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                ">
                    ${this.renderHeader()}
                    ${this.renderTabs()}
                    ${this.renderActiveTab()}
                    ${this.renderFooter()}
                </div>
            `;
            
            this.setupEventListeners();
        }
        
        renderHeader() {
            const priorityDisplay = getPriorityDisplay(this.data.priority);
            const statusDisplay = getStatusDisplay(this.data.status);
            
            return `
                <div class="notes-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                ">
                    <div class="file-info" style="flex: 1;">
                        <h4 style="margin: 0; font-size: 13px; color: var(--vscode-titleBar-activeForeground);">
                            📝 ${this.getFileName()}
                        </h4>
                        <div style="display: flex; gap: 8px; margin-top: 4px;">
                            <span class="priority-badge" style="
                                background: ${priorityDisplay.color}20;
                                color: ${priorityDisplay.color};
                                padding: 2px 6px;
                                border-radius: 12px;
                                font-size: 10px;
                                border: 1px solid ${priorityDisplay.color}40;
                            ">
                                ${priorityDisplay.icon} ${priorityDisplay.label}
                            </span>
                            <span class="status-badge" style="
                                background: ${statusDisplay.color}20;
                                color: ${statusDisplay.color};
                                padding: 2px 6px;
                                border-radius: 12px;
                                font-size: 10px;
                                border: 1px solid ${statusDisplay.color}40;
                            ">
                                ${statusDisplay.icon} ${statusDisplay.label}
                            </span>
                        </div>
                    </div>
                    <div class="header-stats" style="text-align: right; font-size: 10px; color: var(--vscode-descriptionForeground);">
                        <div>💬 ${this.data.comments.length} | 🏷️ ${this.data.tags.length} | ✅ ${this.data.todos.length}</div>
                        <div>${this.formatLastEditTime()}</div>
                    </div>
                </div>
            `;
        }
        
        renderTabs() {
            const tabs = [
                { id: 'overview', label: '概览', icon: '📊' },
                { id: 'comments', label: '评论', icon: '💬' },
                { id: 'todos', label: '待办', icon: '✅' },
                { id: 'tags', label: '标签', icon: '🏷️' },
                { id: 'settings', label: '设置', icon: '⚙️' }
            ];
            
            return `
                <div class="notes-tabs" style="
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-tab-inactiveBackground);
                    border-radius: 6px 6px 0 0;
                ">
                    ${tabs.map(tab => `
                        <button class="tab-button ${this.activeTab === tab.id ? 'active' : ''}" 
                                data-tab="${tab.id}"
                                style="
                                    flex: 1;
                                    padding: 8px 4px;
                                    border: none;
                                    background: ${this.activeTab === tab.id ? 'var(--vscode-tab-activeBackground)' : 'transparent'};
                                    color: ${this.activeTab === tab.id ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)'};
                                    cursor: pointer;
                                    font-size: 10px;
                                    border-radius: 4px;
                                    transition: all 0.2s ease;
                                ">
                            ${tab.icon} ${tab.label}
                        </button>
                    `).join('')}
                </div>
            `;
        }
        
        renderActiveTab() {
            const currentTab = this.activeTab || 'overview';
            
            return `
                <div class="tab-content" style="flex: 1; overflow-y: auto;">
                    ${this.renderTabContent(currentTab)}
                </div>
            `;
        }
        
        renderTabContent(tabId) {
            switch (tabId) {
                case 'overview':
                    return this.renderOverviewTab();
                case 'comments':
                    return this.renderCommentsTab();
                case 'todos':
                    return this.renderTodosTab();
                case 'tags':
                    return this.renderTagsTab();
                case 'settings':
                    return this.renderSettingsTab();
                default:
                    return '<div>未知标签页</div>';
            }
        }
        
        renderOverviewTab() {
            const completedTodos = this.data.todos.filter(t => t.completed).length;
            const todoProgress = this.data.todos.length > 0 ? 
                (completedTodos / this.data.todos.length * 100).toFixed(1) : 0;
            
            return `
                <div class="overview-content" style="display: flex; flex-direction: column; gap: 12px;">
                    <!-- 快速统计 -->
                    <div class="stats-grid" style="
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                    ">
                        <div class="stat-card" style="
                            background: var(--vscode-editor-background);
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 6px;
                            padding: 8px;
                            text-align: center;
                        ">
                            <div style="font-size: 18px; color: var(--vscode-charts-blue);">💬</div>
                            <div style="font-size: 14px; font-weight: bold;">${this.data.comments.length}</div>
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground);">评论</div>
                        </div>
                        <div class="stat-card" style="
                            background: var(--vscode-editor-background);
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 6px;
                            padding: 8px;
                            text-align: center;
                        ">
                            <div style="font-size: 18px; color: var(--vscode-charts-orange);">✅</div>
                            <div style="font-size: 14px; font-weight: bold;">${completedTodos}/${this.data.todos.length}</div>
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground);">待办完成</div>
                        </div>
                    </div>
                    
                    <!-- 进度条 -->
                    <div class="progress-section">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-size: 11px; font-weight: bold;">任务完成度</span>
                            <span style="font-size: 11px; color: var(--vscode-descriptionForeground);">${todoProgress}%</span>
                        </div>
                        <div style="
                            width: 100%;
                            height: 6px;
                            background: var(--vscode-progressBar-background);
                            border-radius: 3px;
                            overflow: hidden;
                        ">
                            <div style="
                                width: ${todoProgress}%;
                                height: 100%;
                                background: var(--vscode-progressBar-background);
                                transition: width 0.3s ease;
                            "></div>
                        </div>
                    </div>
                    
                    <!-- 最近评论 -->
                    <div class="recent-comments">
                        <h5 style="margin: 0 0 6px 0; font-size: 11px; color: var(--vscode-titleBar-activeForeground);">📝 最近评论</h5>
                        <div style="max-height: 120px; overflow-y: auto;">
                            ${this.data.comments.slice(-3).map(comment => `
                                <div class="comment-preview" style="
                                    background: var(--vscode-input-background);
                                    border: 1px solid var(--vscode-input-border);
                                    border-radius: 4px;
                                    padding: 6px;
                                    margin-bottom: 4px;
                                    font-size: 10px;
                                    line-height: 1.4;
                                ">
                                    ${this.truncateText(comment.content, 100)}
                                    <div style="color: var(--vscode-descriptionForeground); margin-top: 2px;">
                                        ${new Date(comment.createdAt).toLocaleString()}
                                    </div>
                                </div>
                            `).join('')}
                            ${this.data.comments.length === 0 ? '<div style="color: var(--vscode-descriptionForeground); font-size: 10px; text-align: center; padding: 20px;">暂无评论</div>' : ''}
                        </div>
                    </div>
                    
                    <!-- 标签云 -->
                    <div class="tags-cloud">
                        <h5 style="margin: 0 0 6px 0; font-size: 11px; color: var(--vscode-titleBar-activeForeground);">🏷️ 标签</h5>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${this.data.tags.map(tag => `
                                <span class="tag-chip" style="
                                    background: ${getTagColorValue(tag.color)}20;
                                    color: ${getTagColorValue(tag.color)};
                                    border: 1px solid ${getTagColorValue(tag.color)}40;
                                    padding: 2px 6px;
                                    border-radius: 12px;
                                    font-size: 9px;
                                ">
                                    ${tag.name}
                                </span>
                            `).join('')}
                            ${this.data.tags.length === 0 ? '<span style="color: var(--vscode-descriptionForeground); font-size: 10px;">暂无标签</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        renderCommentsTab() {
            return `
                <div class="comments-content" style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
                    <!-- 添加评论 -->
                    <div class="add-comment-section" style="
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 6px;
                        padding: 8px;
                    ">
                        <textarea id="new-comment-input" placeholder="添加新评论..."
                                 style="
                                     width: 100%;
                                     height: 60px;
                                     border: 1px solid var(--vscode-input-border);
                                     background: var(--vscode-input-background);
                                     color: var(--vscode-input-foreground);
                                     border-radius: 4px;
                                     padding: 6px;
                                     font-family: var(--vscode-font-family);
                                     font-size: 11px;
                                     resize: vertical;
                                     box-sizing: border-box;
                                 "></textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <label style="font-size: 10px; color: var(--vscode-descriptionForeground);">
                                    <input type="checkbox" id="pin-comment-cb"> 置顶评论
                                </label>
                            </div>
                            <button id="add-comment-btn" style="
                                background: var(--vscode-button-background);
                                color: var(--vscode-button-foreground);
                                border: none;
                                padding: 6px 12px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">💬 添加评论</button>
                        </div>
                    </div>
                    
                    <!-- 评论列表 -->
                    <div class="comments-list" style="flex: 1; overflow-y: auto;">
                        ${this.renderCommentsList()}
                    </div>
                </div>
            `;
        }
        
        renderCommentsList() {
            if (this.data.comments.length === 0) {
                return `
                    <div style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100px;
                        color: var(--vscode-descriptionForeground);
                        font-size: 11px;
                    ">
                        <div style="font-size: 24px; margin-bottom: 8px;">💭</div>
                        <div>还没有评论，添加第一条吧！</div>
                    </div>
                `;
            }
            
            // 按置顶和时间排序
            const sortedComments = [...this.data.comments].sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return b.createdAt - a.createdAt;
            });
            
            return sortedComments.map((comment, index) => `
                <div class="comment-item" data-id="${comment.id}" style="
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    ${comment.pinned ? 'border-color: var(--vscode-focusBorder);' : ''}
                    border-radius: 6px;
                    padding: 8px;
                    margin-bottom: 8px;
                    position: relative;
                ">
                    ${comment.pinned ? '<div style="position: absolute; top: 4px; right: 4px; color: var(--vscode-focusBorder); font-size: 10px;">📌</div>' : ''}
                    
                    <div class="comment-content" style="
                        font-size: 11px;
                        line-height: 1.4;
                        margin-bottom: 6px;
                        padding-right: 60px;
                        white-space: pre-wrap;
                    ">${this.escapeHtml(comment.content)}</div>
                    
                    <div class="comment-meta" style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-size: 9px;
                        color: var(--vscode-descriptionForeground);
                    ">
                        <span>${new Date(comment.createdAt).toLocaleString()}</span>
                        <div class="comment-actions" style="display: flex; gap: 8px;">
                            <button class="edit-comment" data-id="${comment.id}" style="
                                background: none;
                                border: none;
                                color: var(--vscode-textLink-foreground);
                                cursor: pointer;
                                font-size: 9px;
                            ">编辑</button>
                            <button class="toggle-pin" data-id="${comment.id}" style="
                                background: none;
                                border: none;
                                color: var(--vscode-textLink-foreground);
                                cursor: pointer;
                                font-size: 9px;
                            ">${comment.pinned ? '取消置顶' : '置顶'}</button>
                            <button class="delete-comment" data-id="${comment.id}" style="
                                background: none;
                                border: none;
                                color: var(--vscode-errorForeground);
                                cursor: pointer;
                                font-size: 9px;
                            ">删除</button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        renderTodosTab() {
            return `
                <div class="todos-content" style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
                    <!-- 添加待办 -->
                    <div class="add-todo-section" style="
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 6px;
                        padding: 8px;
                    ">
                        <input type="text" id="new-todo-input" placeholder="添加新的待办事项..."
                               style="
                                   width: 100%;
                                   border: 1px solid var(--vscode-input-border);
                                   background: var(--vscode-input-background);
                                   color: var(--vscode-input-foreground);
                                   border-radius: 4px;
                                   padding: 6px;
                                   font-family: var(--vscode-font-family);
                                   font-size: 11px;
                                   box-sizing: border-box;
                               ">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                            <select id="todo-priority" style="
                                background: var(--vscode-dropdown-background);
                                border: 1px solid var(--vscode-dropdown-border);
                                color: var(--vscode-dropdown-foreground);
                                padding: 4px;
                                border-radius: 3px;
                                font-size: 10px;
                            ">
                                <option value="">无优先级</option>
                                <option value="low">🟢 低</option>
                                <option value="medium">🟡 中</option>
                                <option value="high">🟠 高</option>
                                <option value="critical">🔴 紧急</option>
                            </select>
                            <button id="add-todo-btn" style="
                                background: var(--vscode-button-background);
                                color: var(--vscode-button-foreground);
                                border: none;
                                padding: 6px 12px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">✅ 添加待办</button>
                        </div>
                    </div>
                    
                    <!-- 待办列表 -->
                    <div class="todos-list" style="flex: 1; overflow-y: auto;">
                        ${this.renderTodosList()}
                    </div>
                </div>
            `;
        }
        
        renderTodosList() {
            if (this.data.todos.length === 0) {
                return `
                    <div style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100px;
                        color: var(--vscode-descriptionForeground);
                        font-size: 11px;
                    ">
                        <div style="font-size: 24px; margin-bottom: 8px;">✅</div>
                        <div>还没有待办事项，添加一个开始吧！</div>
                    </div>
                `;
            }
            
            // 按优先级和完成状态排序
            const sortedTodos = [...this.data.todos].sort((a, b) => {
                if (a.completed && !b.completed) return 1;
                if (!a.completed && b.completed) return -1;
                
                const priorityOrder = {
                    'critical': 0, 'high': 1, 'medium': 2, 'low': 3, '': 4
                };
                return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
            });
            
            return sortedTodos.map(todo => {
                const priorityDisplay = getPriorityDisplay(todo.priority);
                return `
                    <div class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}" style="
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 6px;
                        padding: 8px;
                        margin-bottom: 6px;
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        ${todo.completed ? 'opacity: 0.6;' : ''}
                    ">
                        <input type="checkbox" class="todo-checkbox" data-id="${todo.id}" 
                               ${todo.completed ? 'checked' : ''}
                               style="margin-top: 2px;">
                        
                        <div style="flex: 1;">
                            <div class="todo-content" style="
                                font-size: 11px;
                                line-height: 1.4;
                                ${todo.completed ? 'text-decoration: line-through;' : ''}
                            ">${this.escapeHtml(todo.content)}</div>
                            
                            <div class="todo-meta" style="
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                margin-top: 4px;
                                font-size: 9px;
                                color: var(--vscode-descriptionForeground);
                            ">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    ${todo.priority ? `
                                        <span style="
                                            background: ${priorityDisplay.color}20;
                                            color: ${priorityDisplay.color};
                                            padding: 1px 4px;
                                            border-radius: 8px;
                                            font-size: 8px;
                                        ">
                                            ${priorityDisplay.icon} ${priorityDisplay.label}
                                        </span>
                                    ` : ''}
                                    <span>${new Date(todo.createdAt).toLocaleDateString()}</span>
                                </div>
                                <button class="delete-todo" data-id="${todo.id}" style="
                                    background: none;
                                    border: none;
                                    color: var(--vscode-errorForeground);
                                    cursor: pointer;
                                    font-size: 9px;
                                ">删除</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        renderTagsTab() {
            return `
                <div class="tags-content" style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
                    <!-- 添加标签 -->
                    <div class="add-tag-section" style="
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 6px;
                        padding: 8px;
                    ">
                        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                            <input type="text" id="new-tag-input" placeholder="标签名称..."
                                   style="
                                       flex: 1;
                                       border: 1px solid var(--vscode-input-border);
                                       background: var(--vscode-input-background);
                                       color: var(--vscode-input-foreground);
                                       border-radius: 4px;
                                       padding: 6px;
                                       font-size: 11px;
                                   ">
                            <select id="tag-color" style="
                                background: var(--vscode-dropdown-background);
                                border: 1px solid var(--vscode-dropdown-border);
                                color: var(--vscode-dropdown-foreground);
                                padding: 4px;
                                border-radius: 3px;
                                font-size: 10px;
                            ">
                                <option value="blue">🔵 蓝色</option>
                                <option value="green">🟢 绿色</option>
                                <option value="red">🔴 红色</option>
                                <option value="yellow">🟡 黄色</option>
                                <option value="purple">🟣 紫色</option>
                                <option value="orange">🟠 橙色</option>
                                <option value="pink">🩷 粉色</option>
                                <option value="gray">⚫ 灰色</option>
                            </select>
                        </div>
                        <button id="add-tag-btn" style="
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            padding: 6px 12px;
                            border-radius: 3px;
                            cursor: pointer;
                            font-size: 10px;
                            width: 100%;
                        ">🏷️ 添加标签</button>
                    </div>
                    
                    <!-- 标签列表 -->
                    <div class="tags-list" style="flex: 1; overflow-y: auto;">
                        ${this.renderTagsList()}
                    </div>
                </div>
            `;
        }
        
        renderTagsList() {
            if (this.data.tags.length === 0) {
                return `
                    <div style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100px;
                        color: var(--vscode-descriptionForeground);
                        font-size: 11px;
                    ">
                        <div style="font-size: 24px; margin-bottom: 8px;">🏷️</div>
                        <div>还没有标签，创建一个来分类文件吧！</div>
                    </div>
                `;
            }
            
            return this.data.tags.map(tag => `
                <div class="tag-item" data-id="${tag.name}" style="
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 6px;
                    padding: 8px;
                    margin-bottom: 6px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="tag-color-indicator" style="
                            width: 12px;
                            height: 12px;
                            background: ${getTagColorValue(tag.color)};
                            border-radius: 50%;
                            border: 1px solid ${getTagColorValue(tag.color)}60;
                        "></span>
                        <div>
                            <div style="font-size: 11px; font-weight: bold;">${this.escapeHtml(tag.name)}</div>
                            ${tag.description ? `<div style="font-size: 9px; color: var(--vscode-descriptionForeground);">${this.escapeHtml(tag.description)}</div>` : ''}
                        </div>
                    </div>
                    
                    <div class="tag-actions" style="display: flex; gap: 8px;">
                        <button class="edit-tag" data-name="${tag.name}" style="
                            background: none;
                            border: none;
                            color: var(--vscode-textLink-foreground);
                            cursor: pointer;
                            font-size: 9px;
                        ">编辑</button>
                        <button class="delete-tag" data-name="${tag.name}" style="
                            background: none;
                            border: none;
                            color: var(--vscode-errorForeground);
                            cursor: pointer;
                            font-size: 9px;
                        ">删除</button>
                    </div>
                </div>
            `).join('');
        }
        
        renderSettingsTab() {
            const priorityDisplay = getPriorityDisplay(this.data.priority);
            const statusDisplay = getStatusDisplay(this.data.status);
            
            return `
                <div class="settings-content" style="display: flex; flex-direction: column; gap: 12px;">
                    <!-- 文件状态设置 -->
                    <div class="settings-section">
                        <h5 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-titleBar-activeForeground);">📊 文件状态</h5>
                        
                        <div style="margin-bottom: 8px;">
                            <label style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; display: block;">优先级</label>
                            <select id="file-priority" style="
                                width: 100%;
                                background: var(--vscode-dropdown-background);
                                border: 1px solid var(--vscode-dropdown-border);
                                color: var(--vscode-dropdown-foreground);
                                padding: 6px;
                                border-radius: 3px;
                                font-size: 11px;
                            ">
                                <option value="none" ${this.data.priority === Priority.NONE ? 'selected' : ''}>⚪ 无</option>
                                <option value="low" ${this.data.priority === Priority.LOW ? 'selected' : ''}>🟢 低</option>
                                <option value="medium" ${this.data.priority === Priority.MEDIUM ? 'selected' : ''}>🟡 中</option>
                                <option value="high" ${this.data.priority === Priority.HIGH ? 'selected' : ''}>🟠 高</option>
                                <option value="critical" ${this.data.priority === Priority.CRITICAL ? 'selected' : ''}>🔴 紧急</option>
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 8px;">
                            <label style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; display: block;">状态</label>
                            <select id="file-status" style="
                                width: 100%;
                                background: var(--vscode-dropdown-background);
                                border: 1px solid var(--vscode-dropdown-border);
                                color: var(--vscode-dropdown-foreground);
                                padding: 6px;
                                border-radius: 3px;
                                font-size: 11px;
                            ">
                                <option value="active" ${this.data.status === FileStatus.ACTIVE ? 'selected' : ''}>🚀 活跃</option>
                                <option value="review" ${this.data.status === FileStatus.REVIEW ? 'selected' : ''}>👀 Review</option>
                                <option value="testing" ${this.data.status === FileStatus.TESTING ? 'selected' : ''}>🧪 测试</option>
                                <option value="done" ${this.data.status === FileStatus.DONE ? 'selected' : ''}>✅ 完成</option>
                                <option value="deprecated" ${this.data.status === FileStatus.DEPRECATED ? 'selected' : ''}>⚠️ 废弃</option>
                                <option value="archive" ${this.data.status === FileStatus.ARCHIVE ? 'selected' : ''}>📦 归档</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- 评分系统 -->
                    <div class="settings-section">
                        <h5 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-titleBar-activeForeground);">⭐ 文件评分</h5>
                        
                        <div style="margin-bottom: 6px;">
                            <label style="font-size: 10px; color: var(--vscode-descriptionForeground);">代码质量 (1-5)</label>
                            <input type="range" id="quality-rating" min="1" max="5" 
                                   value="${this.data.rating?.codeQuality || 3}"
                                   style="width: 100%; margin: 4px 0;">
                            <div style="font-size: 9px; text-align: center; color: var(--vscode-descriptionForeground);">
                                ${'⭐'.repeat(this.data.rating?.codeQuality || 3)}
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 6px;">
                            <label style="font-size: 10px; color: var(--vscode-descriptionForeground);">重要性 (1-5)</label>
                            <input type="range" id="importance-rating" min="1" max="5" 
                                   value="${this.data.rating?.importance || 3}"
                                   style="width: 100%; margin: 4px 0;">
                            <div style="font-size: 9px; text-align: center; color: var(--vscode-descriptionForeground);">
                                ${'⭐'.repeat(this.data.rating?.importance || 3)}
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 6px;">
                            <label style="font-size: 10px; color: var(--vscode-descriptionForeground);">复杂度 (1-5)</label>
                            <input type="range" id="complexity-rating" min="1" max="5" 
                                   value="${this.data.rating?.complexity || 3}"
                                   style="width: 100%; margin: 4px 0;">
                            <div style="font-size: 9px; text-align: center; color: var(--vscode-descriptionForeground);">
                                ${'⭐'.repeat(this.data.rating?.complexity || 3)}
                            </div>
                        </div>
                    </div>
                    
                    <!-- 数据管理 -->
                    <div class="settings-section">
                        <h5 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-titleBar-activeForeground);">🛠️ 数据管理</h5>
                        
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <button id="export-notes" style="
                                background: var(--vscode-button-secondaryBackground);
                                color: var(--vscode-button-secondaryForeground);
                                border: none;
                                padding: 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">📤 导出备注数据</button>
                            
                            <button id="clear-all-notes" style="
                                background: var(--vscode-errorBackground);
                                color: var(--vscode-errorForeground);
                                border: 1px solid var(--vscode-errorBorder);
                                padding: 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">🗑️ 清空所有数据</button>
                        </div>
                    </div>
                    
                    <!-- 元数据信息 -->
                    <div class="settings-section">
                        <h5 style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-titleBar-activeForeground);">ℹ️ 元数据</h5>
                        <div style="font-size: 10px; color: var(--vscode-descriptionForeground); line-height: 1.4;">
                            <div>版本: ${this.data.metadata.version}</div>
                            <div>创建: ${new Date(this.data.metadata.createdAt).toLocaleString()}</div>
                            <div>更新: ${new Date(this.data.metadata.lastEditedAt).toLocaleString()}</div>
                            <div>编辑次数: ${this.data.metadata.editCount}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        renderFooter() {
            return `
                <div class="notes-footer" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-top: 1px solid var(--vscode-panel-border);
                ">
                    <div style="font-size: 10px; color: var(--vscode-descriptionForeground);">
                        ${this.isDirty ? '● 有未保存的更改' : '✓ 已保存'}
                    </div>
                    <button id="save-all-changes" ${!this.isDirty ? 'disabled' : ''} style="
                        background: ${this.isDirty ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)'};
                        color: ${this.isDirty ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)'};
                        border: none;
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: ${this.isDirty ? 'pointer' : 'not-allowed'};
                        font-size: 10px;
                    ">💾 保存更改</button>
                </div>
            `;
        }
        
        setupEventListeners() {
            // 标签页切换
            this.container.querySelectorAll('.tab-button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tabId = e.target.dataset.tab;
                    this.activeTab = tabId;
                    this.render();
                });
            });
            
            // 保存按钮
            const saveBtn = this.container.querySelector('#save-all-changes');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveChanges());
            }
            
            // 根据当前标签页设置事件监听器
            this.setupTabSpecificListeners();
        }
        
        setupTabSpecificListeners() {
            const currentTab = this.activeTab || 'overview';
            
            switch (currentTab) {
                case 'comments':
                    this.setupCommentsListeners();
                    break;
                case 'todos':
                    this.setupTodosListeners();
                    break;
                case 'tags':
                    this.setupTagsListeners();
                    break;
                case 'settings':
                    this.setupSettingsListeners();
                    break;
            }
        }
        
        setupCommentsListeners() {
            // 添加评论
            const addBtn = this.container.querySelector('#add-comment-btn');
            const input = this.container.querySelector('#new-comment-input');
            const pinCheckbox = this.container.querySelector('#pin-comment-cb');
            
            const addComment = () => {
                const content = input.value.trim();
                if (!content) return;
                
                const comment = {
                    id: generateId(),
                    content,
                    createdAt: Date.now(),
                    pinned: pinCheckbox.checked,
                    tags: []
                };
                
                this.data.comments.push(comment);
                this.markDirty();
                input.value = '';
                pinCheckbox.checked = false;
                this.render();
            };
            
            if (addBtn) addBtn.addEventListener('click', addComment);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        addComment();
                    }
                });
            }
            
            // 评论操作
            this.container.querySelectorAll('.delete-comment').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const commentId = e.target.dataset.id;
                    this.data.comments = this.data.comments.filter(c => c.id !== commentId);
                    this.markDirty();
                    this.render();
                });
            });
            
            this.container.querySelectorAll('.toggle-pin').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const commentId = e.target.dataset.id;
                    const comment = this.data.comments.find(c => c.id === commentId);
                    if (comment) {
                        comment.pinned = !comment.pinned;
                        this.markDirty();
                        this.render();
                    }
                });
            });
        }
        
        setupTodosListeners() {
            // 添加待办
            const addBtn = this.container.querySelector('#add-todo-btn');
            const input = this.container.querySelector('#new-todo-input');
            const prioritySelect = this.container.querySelector('#todo-priority');
            
            const addTodo = () => {
                const content = input.value.trim();
                if (!content) return;
                
                const todo = {
                    id: generateId(),
                    content,
                    completed: false,
                    createdAt: Date.now(),
                    priority: prioritySelect.value || undefined
                };
                
                this.data.todos.push(todo);
                this.markDirty();
                input.value = '';
                prioritySelect.value = '';
                this.render();
            };
            
            if (addBtn) addBtn.addEventListener('click', addTodo);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addTodo();
                    }
                });
            }
            
            // 待办操作
            this.container.querySelectorAll('.todo-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const todoId = e.target.dataset.id;
                    const todo = this.data.todos.find(t => t.id === todoId);
                    if (todo) {
                        todo.completed = e.target.checked;
                        if (todo.completed) {
                            todo.completedAt = Date.now();
                        } else {
                            delete todo.completedAt;
                        }
                        this.markDirty();
                        this.render();
                    }
                });
            });
            
            this.container.querySelectorAll('.delete-todo').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const todoId = e.target.dataset.id;
                    this.data.todos = this.data.todos.filter(t => t.id !== todoId);
                    this.markDirty();
                    this.render();
                });
            });
        }
        
        setupTagsListeners() {
            // 添加标签
            const addBtn = this.container.querySelector('#add-tag-btn');
            const nameInput = this.container.querySelector('#new-tag-input');
            const colorSelect = this.container.querySelector('#tag-color');
            
            const addTag = () => {
                const name = nameInput.value.trim();
                if (!name) return;
                
                // 检查是否已存在
                if (this.data.tags.some(t => t.name === name)) {
                    alert('标签已存在！');
                    return;
                }
                
                const tag = {
                    name,
                    color: colorSelect.value || 'blue',
                    createdAt: Date.now()
                };
                
                this.data.tags.push(tag);
                this.markDirty();
                nameInput.value = '';
                colorSelect.value = 'blue';
                this.render();
            };
            
            if (addBtn) addBtn.addEventListener('click', addTag);
            if (nameInput) {
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                    }
                });
            }
            
            // 标签操作
            this.container.querySelectorAll('.delete-tag').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tagName = e.target.dataset.name;
                    this.data.tags = this.data.tags.filter(t => t.name !== tagName);
                    this.markDirty();
                    this.render();
                });
            });
        }
        
        setupSettingsListeners() {
            // 优先级和状态更改
            const prioritySelect = this.container.querySelector('#file-priority');
            const statusSelect = this.container.querySelector('#file-status');
            
            if (prioritySelect) {
                prioritySelect.addEventListener('change', (e) => {
                    this.data.priority = e.target.value || Priority.NONE;
                    this.markDirty();
                });
            }
            
            if (statusSelect) {
                statusSelect.addEventListener('change', (e) => {
                    this.data.status = e.target.value || FileStatus.ACTIVE;
                    this.markDirty();
                });
            }
            
            // 评分更改
            ['quality', 'importance', 'complexity'].forEach(type => {
                const slider = this.container.querySelector(`#${type}-rating`);
                if (slider) {
                    slider.addEventListener('input', (e) => {
                        if (!this.data.rating) {
                            this.data.rating = { ratedAt: Date.now() };
                        }
                        
                        if (type === 'quality') {
                            this.data.rating.codeQuality = parseInt(e.target.value);
                        } else if (type === 'importance') {
                            this.data.rating.importance = parseInt(e.target.value);
                        } else if (type === 'complexity') {
                            this.data.rating.complexity = parseInt(e.target.value);
                        }
                        
                        this.data.rating.ratedAt = Date.now();
                        this.markDirty();
                        
                        // 更新星级显示
                        const stars = '⭐'.repeat(parseInt(e.target.value));
                        e.target.nextElementSibling.textContent = stars;
                    });
                }
            });
            
            // 数据管理
            const exportBtn = this.container.querySelector('#export-notes');
            const clearBtn = this.container.querySelector('#clear-all-notes');
            
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportNotes());
            }
            
            if (clearBtn) {
                clearBtn.addEventListener('click', () => this.clearAllNotes());
            }
        }
        
        // ===== 工具方法 =====
        getFileName() {
            return this.filePath.split('/').pop() || this.filePath;
        }
        
        formatLastEditTime() {
            if (!this.data.metadata.lastEditedAt) return '尚未编辑';
            
            const now = Date.now();
            const diff = now - this.data.metadata.lastEditedAt;
            
            if (diff < 60000) return '刚刚';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
            
            return new Date(this.data.metadata.lastEditedAt).toLocaleDateString();
        }
        
        truncateText(text, maxLength) {
            if (text.length <= maxLength) return this.escapeHtml(text);
            return this.escapeHtml(text.substr(0, maxLength)) + '...';
        }
        
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        markDirty() {
            this.isDirty = true;
            this.data.metadata.lastEditedAt = Date.now();
            this.data.metadata.editCount++;
        }
        
        async saveChanges() {
            if (!this.isDirty) return;
            
            try {
                // 发送到后端保存
                if (window.vscode) {
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error('保存超时')), 5000);
                        
                        const handleMessage = (event) => {
                            const message = event.data;
                            if (message.type === 'user-notes-saved' && message.payload.filePath === this.filePath) {
                                clearTimeout(timeout);
                                window.removeEventListener('message', handleMessage);
                                
                                if (message.payload.success) {
                                    resolve();
                                } else {
                                    reject(new Error(message.payload.error || '保存失败'));
                                }
                            }
                        };
                        
                        window.addEventListener('message', handleMessage);
                        
                        window.vscode.postMessage({
                            type: 'save-enhanced-user-notes',
                            payload: {
                                filePath: this.filePath,
                                notes: this.data
                            }
                        });
                    });
                }
                
                this.isDirty = false;
                this.render();
                
                console.log(`[enhancedUserNotes] ✅ 保存成功: ${this.filePath}`);
                
            } catch (error) {
                console.error(`[enhancedUserNotes] ❌ 保存失败: ${this.filePath}`, error);
                alert(`保存失败: ${error.message}`);
            }
        }
        
        exportNotes() {
            const dataStr = JSON.stringify(this.data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.getFileName()}-notes-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        clearAllNotes() {
            if (!confirm('确定要清空所有备注数据吗？此操作不可撤销！')) {
                return;
            }
            
            this.data = createEmptyUserNotes(this.filePath);
            this.markDirty();
            this.activeTab = 'overview';
            this.render();
        }
    }

    // ===== 公共API =====
    return {
        // 类和常量导出
        EnhancedUserNotesUI,
        Priority,
        FileStatus,
        TagColor,
        
        // 工具函数导出
        createEmptyUserNotes,
        generateId,
        getPriorityDisplay,
        getStatusDisplay,
        getTagColorValue,
        
        // 创建UI实例
        create: function(container, filePath, initialData) {
            return new EnhancedUserNotesUI(container, filePath, initialData);
        },
        
        // 获取存储的数据
        getStoredNotes: function(filePath) {
            return notesStore.get(filePath);
        }
    };
});