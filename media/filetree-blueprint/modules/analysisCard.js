/**
 * 文件分析卡片模块
 * 负责卡片的显示、更新、关闭
 * 
 * 类型定义参考：
 * @see {import('../../../src/features/file-analysis/types').FileCapsule} FileCapsule
 * @see {import('../../../src/shared/messages').ShowAnalysisCardMessage} ShowAnalysisCardMessage
 * @see {import('../../../src/shared/messages').UpdateAnalysisCardMessage} UpdateAnalysisCardMessage
 */

export class AnalysisCardManager {
    /**
     * @param {any} vscode - VSCode API
     */
    constructor(vscode) {
        this.vscode = vscode;
        this.cardOpenedAt = 0;
        this.currentCard = null;
    }

    /**
     * 显示分析卡片
     * @param {Object} capsule - FileCapsule 数据 (包含 file, lang, api, deps 等字段)
     * @param {boolean} [capsule.loading] - 是否正在加载
     * @returns {boolean} 是否渲染成功
     */
    showCard(capsule) {
        console.log('[分析卡片] 显示:', capsule);
        
        try {
            this._ensureHost();
            this.closeCard(); // 确保单例

            const host = document.getElementById('analysis-host');
            
            // 创建遮罩层（带300ms保护期）
            const backdrop = this._createBackdrop();
            host.appendChild(backdrop);

            // 创建卡片
            const card = this._createCard(capsule);
            host.appendChild(card);

            // 使用 rAF 确保 DOM 已插入后再添加 show 类
            requestAnimationFrame(() => {
                this.cardOpenedAt = performance.now();
                card.classList.add('show');
                console.log('[分析卡片] 已添加 show 类，卡片应该可见');
            });

            this.currentCard = {
                element: card,
                capsule: capsule
            };

            console.log('[分析卡片] 渲染完成，返回 true');
            return true;
            
        } catch (error) {
            console.error('[分析卡片] 渲染失败:', error);
            return false;
        }
    }

    /**
     * 更新卡片内容（AI分析完成后）
     * @param {Object} capsule - 更新后的 FileCapsule
     */
    updateCard(capsule) {
        console.log('[分析卡片] AI更新:', capsule);
        
        const host = document.getElementById('analysis-host');
        if (!host) {
            console.warn('[分析卡片] 容器不存在,执行完整渲染');
            this.showCard(capsule);
            return;
        }

        const card = host.querySelector('.analysis-card');
        if (!card || card.dataset.file !== capsule.file) {
            console.warn('[分析卡片] 文件不匹配,执行完整渲染');
            this.showCard(capsule);
            return;
        }

        // 移除 Loading 徽章
        const loadingBadge = card.querySelector('.loading-badge');
        if (loadingBadge) {
            loadingBadge.remove();
            console.log('[分析卡片] 已移除 loading 徽章');
        }

        // 更新各个 Tab 内容
        this._updateTabContent(card, capsule);

        console.log('[分析卡片] AI更新完成');
    }

    /**
     * 关闭卡片
     */
    closeCard() {
        const host = document.getElementById('analysis-host');
        if (host) {
            host.innerHTML = '';
            this.currentCard = null;
            console.log('[分析卡片] 已关闭');
        }
    }

    /**
     * 确保容器存在
     * @private
     */
    _ensureHost() {
        let host = document.getElementById('analysis-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'analysis-host';
            host.className = 'analysis-host';
            document.getElementById('canvas').appendChild(host);
        }
    }

    /**
     * 创建遮罩层
     * @private
     */
    _createBackdrop() {
        const backdrop = document.createElement('div');
        backdrop.className = 'analysis-backdrop';
        backdrop.addEventListener('click', (e) => {
            const elapsed = performance.now() - this.cardOpenedAt;
            if (elapsed < 300) {
                // 防止双击第二下立即关闭卡片
                console.log('[分析卡片] 保护期内，忽略点击关闭', elapsed);
                e.stopPropagation();
                return;
            }
            console.log('[分析卡片] 点击遮罩关闭');
            this.closeCard();
        });
        return backdrop;
    }

    /**
     * 创建卡片元素
     * @private
     */
    _createCard(capsule) {
        const card = document.createElement('div');
        card.className = 'analysis-card';
        card.setAttribute('data-file', capsule.file);
        
        const loadingBadge = capsule.loading 
            ? '<span class="loading-badge">⏳ AI分析中...</span>' 
            : '';

        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${this._escapeHtml(capsule.file.split(/[/\\]/).pop())}</span>
                    ${loadingBadge}
                </div>
                <div class="card-actions">
                    <button class="btn-icon" data-action="open" title="打开源文件">📂</button>
                    <button class="btn-icon" data-action="refresh" title="刷新分析">↻</button>
                    <button class="btn-icon" data-action="close" title="关闭">✕</button>
                </div>
            </div>

            <div class="card-tabs">
                <button class="tab-btn active" data-tab="overview">概览</button>
                <button class="tab-btn" data-tab="api">API</button>
                <button class="tab-btn" data-tab="deps">依赖</button>
                <button class="tab-btn" data-tab="evidence">证据</button>
            </div>

            <div class="card-content">
                <div class="tab-pane active" data-pane="overview">
                    ${this._renderOverviewTab(capsule)}
                </div>
                <div class="tab-pane" data-pane="api">
                    ${this._renderApiTab(capsule)}
                </div>
                <div class="tab-pane" data-pane="deps">
                    ${this._renderDepsTab(capsule)}
                </div>
                <div class="tab-pane" data-pane="evidence">
                    ${this._renderEvidenceTab(capsule)}
                </div>
            </div>
        `;

        this._bindCardEvents(card, capsule);
        return card;
    }

    /**
     * 绑定卡片事件
     * @private
     */
    _bindCardEvents(card, capsule) {
        // Tab 切换
        card.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                card.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const tabName = btn.dataset.tab;
                card.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
                card.querySelector(`.tab-pane[data-pane="${tabName}"]`).classList.add('active');
            });
        });

        // 操作按钮
        card.querySelector('[data-action="open"]')?.addEventListener('click', () => {
            this.vscode.postMessage({
                type: 'open-source',
                payload: { file: capsule.file, line: 1 }
            });
        });

        card.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
            this.vscode.postMessage({
                type: 'analyze-file',
                payload: { path: capsule.file, force: true }
            });
        });

        card.querySelector('[data-action="close"]')?.addEventListener('click', () => {
            this.closeCard();
        });

        // 证据链接
        this._bindEvidenceLinks(card, capsule);
    }

    /**
     * 绑定证据链接
     * @private
     */
    _bindEvidenceLinks(card, capsule) {
        card.querySelectorAll('[data-evidence]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const evidenceId = link.dataset.evidence;
                const evidence = capsule.evidence?.[evidenceId];
                if (evidence) {
                    this.vscode.postMessage({
                        type: 'open-source',
                        payload: {
                            file: evidence.file,
                            line: evidence.lines[0],
                            endLine: evidence.lines[1]
                        }
                    });
                }
            });
        });
    }

    /**
     * 更新 Tab 内容
     * @private
     */
    _updateTabContent(card, capsule) {
        const overviewPane = card.querySelector('.tab-pane[data-pane="overview"]');
        const apiPane = card.querySelector('.tab-pane[data-pane="api"]');
        const depsPane = card.querySelector('.tab-pane[data-pane="deps"]');
        const evidencePane = card.querySelector('.tab-pane[data-pane="evidence"]');

        if (overviewPane) overviewPane.innerHTML = this._renderOverviewTab(capsule);
        if (apiPane) apiPane.innerHTML = this._renderApiTab(capsule);
        if (depsPane) depsPane.innerHTML = this._renderDepsTab(capsule);
        if (evidencePane) evidencePane.innerHTML = this._renderEvidenceTab(capsule);

        // 重新绑定证据链接
        this._bindEvidenceLinks(card, capsule);
    }

    /**
     * 渲染概览 Tab
     * @private
     */
    _renderOverviewTab(capsule) {
        const summary = capsule.summary?.zh || capsule.summary?.en || '暂无摘要';
        const facts = capsule.facts || [];
        const inferences = capsule.inferences || [];
        const recommendations = capsule.recommendations || [];
        
        return `
            <div class="overview-section">
                <h4>📝 摘要</h4>
                <p class="summary">${this._escapeHtml(summary)}</p>
                
                ${facts.length > 0 ? `
                    <h4>✅ 事实</h4>
                    <ul class="fact-list">
                        ${facts.map(f => `
                            <li>
                                ${this._escapeHtml(f.text)}
                                ${(f.evidence || []).map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[证据]</a>`).join(' ')}
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
                
                ${inferences.length > 0 ? `
                    <h4>💡 AI 推断</h4>
                    <ul class="inference-list">
                        ${inferences.map(i => `
                            <li>
                                ${this._escapeHtml(i.text)}
                                <span class="confidence">置信度: ${(i.confidence * 100).toFixed(0)}%</span>
                                ${(i.evidence || []).map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[证据]</a>`).join(' ')}
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
                
                ${recommendations.length > 0 ? `
                    <h4>💡 AI 建议</h4>
                    <ul class="recommendation-list">
                        ${recommendations.map(r => `
                            <li class="rec-${r.priority || 'medium'}">
                                <div class="rec-header">
                                    <span class="rec-priority">${this._getPriorityEmoji(r.priority)}</span>
                                    <span class="rec-text">${this._escapeHtml(r.text)}</span>
                                </div>
                                <div class="rec-reason">原因: ${this._escapeHtml(r.reason || '')}</div>
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
                
                <div class="meta-info">
                    <span>最后验证: ${this._formatTime(capsule.lastVerifiedAt)}</span>
                    ${!capsule.loading ? '<span class="badge-ai">🤖 AI增强</span>' : ''}
                </div>
            </div>
        `;
    }

    /**
     * 渲染 API Tab
     * @private
     */
    _renderApiTab(capsule) {
        const apis = capsule.api || [];
        if (apis.length === 0) {
            return '<p class="empty">暂无API信息</p>';
        }

        return `
            <div class="api-section">
                <ul class="api-list">
                    ${apis.map(api => `
                        <li class="api-item">
                            <div class="api-header">
                                <span class="api-name">${this._escapeHtml(api.name)}</span>
                                <span class="api-kind">${api.kind}</span>
                            </div>
                            <div class="api-signature">${this._escapeHtml(api.signature || '')}</div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * 渲染依赖 Tab
     * @private
     */
    _renderDepsTab(capsule) {
        const outDeps = capsule.deps?.out || [];
        const inDeps = capsule.deps?.inSample || [];

        return `
            <div class="deps-section">
                ${outDeps.length > 0 ? `
                    <h4>出依赖 (${outDeps.length})</h4>
                    <ul class="deps-list">
                        ${outDeps.map(dep => `
                            <li class="dep-item">
                                <span class="dep-module">${this._escapeHtml(dep.module)}</span>
                                <span class="dep-count">${dep.count} 次引用</span>
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p class="empty">无出依赖</p>'}
                
                ${inDeps.length > 0 ? `
                    <h4>入依赖 (${inDeps.length})</h4>
                    <ul class="deps-list">
                        ${inDeps.map(dep => `
                            <li class="dep-item">
                                <span class="dep-module">${this._escapeHtml(dep.file)}</span>
                                <span class="dep-count">${dep.count} 次引用</span>
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p class="empty">无入依赖信息</p>'}
            </div>
        `;
    }

    /**
     * 渲染证据 Tab
     * @private
     */
    _renderEvidenceTab(capsule) {
        const evidence = capsule.evidence || {};
        const entries = Object.entries(evidence);

        if (entries.length === 0) {
            return '<p class="empty">暂无证据</p>';
        }

        return `
            <div class="evidence-section">
                <ul class="evidence-list">
                    ${entries.map(([id, ev]) => `
                        <li class="evidence-item">
                            <div class="evidence-file">${this._escapeHtml(ev.file)}</div>
                            <div class="evidence-lines" data-evidence="${id}">
                                第 ${ev.lines[0]} - ${ev.lines[1]} 行
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * 工具方法
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _getPriorityEmoji(priority) {
        const map = {
            'high': '🔴',
            'medium': '🟡',
            'low': '🟢'
        };
        return map[priority] || '🔵';
    }

    _formatTime(timestamp) {
        if (!timestamp) return '未知';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
        return date.toLocaleDateString();
    }
}
