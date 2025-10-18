// media/filetree-blueprint/DebugBanner.js
// [tags: Debug, Observability, Dev Only]
/**
 * 调试横幅 - 显示状态机和诊断信息
 * 
 * 功能：
 * - 显示连接状态（Connected/Disconnected）
 * - 显示当前路径和面包屑导航
 * - 显示最近事件队列（最多 5 条）
 * - 显示 navStack 导航栈
 * - 可折叠/展开详细信息
 * 
 * 用法：
 * 1. 在 HTML 中引入此脚本
 * 2. 调用 initDebugBanner() 初始化
 * 3. 调用 updateDebugState() 更新状态
 */

(function() {
    let bannerElement = null;
    let state = {
        channel: 'disconnected',
        currentPath: '/',
        navStack: ['/'],
        recentEvents: [], // 最近 5 个事件
        graphType: 'filetree',
        nodeCount: 0,
        edgeCount: 0
    };

    /**
     * 创建横幅 UI
     */
    function createBannerUI() {
        const banner = document.createElement('div');
        banner.id = 'debug-banner';
        banner.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #1e293b;
            color: #e2e8f0;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
            z-index: 999998;
            box-shadow: 0 -2px 8px rgba(0,0,0,0.2);
            border-top: 2px solid #475569;
        `;

        banner.innerHTML = `
            <div id="banner-header" style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                cursor: pointer;
                user-select: none;
                background: #0f172a;
            ">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <span style="font-weight: 600; color: #60a5fa;">🔍 Debug Banner</span>
                    <span id="banner-channel">Channel: <span id="banner-channel-status">🔌 Disconnected</span></span>
                    <span id="banner-path">Path: <span id="banner-path-value">/</span></span>
                    <span id="banner-graph">Graph: <span id="banner-graph-value">filetree (0 nodes, 0 edges)</span></span>
                </div>
                <span id="banner-toggle" style="color: #94a3b8;">▼ 展开详情</span>
            </div>
            <div id="banner-details" style="
                display: none;
                padding: 12px;
                background: #1e293b;
                border-top: 1px solid #334155;
                max-height: 200px;
                overflow-y: auto;
            ">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <h4 style="margin: 0 0 8px 0; color: #60a5fa; font-size: 12px;">导航栈</h4>
                        <div id="banner-navstack" style="color: #cbd5e1; line-height: 1.6;">
                            <code>/</code>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 8px 0; color: #60a5fa; font-size: 12px;">最近事件</h4>
                        <ul id="banner-events" style="
                            margin: 0;
                            padding: 0 0 0 16px;
                            color: #cbd5e1;
                            line-height: 1.6;
                            list-style: circle;
                        ">
                            <li>暂无事件</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(banner);
        bannerElement = banner;

        // 绑定折叠/展开
        const header = document.getElementById('banner-header');
        const details = document.getElementById('banner-details');
        const toggle = document.getElementById('banner-toggle');

        header.addEventListener('click', () => {
            const isHidden = details.style.display === 'none';
            details.style.display = isHidden ? 'block' : 'none';
            toggle.textContent = isHidden ? '▲ 收起详情' : '▼ 展开详情';
        });

        return banner;
    }

    /**
     * 更新通道状态
     */
    function updateChannelStatus(status) {
        state.channel = status;
        const statusEl = document.getElementById('banner-channel-status');
        if (statusEl) {
            if (status === 'connected') {
                statusEl.textContent = '✅ Connected';
                statusEl.style.color = '#4ade80';
            } else {
                statusEl.textContent = '🔌 Disconnected';
                statusEl.style.color = '#fbbf24';
            }
        }
    }

    /**
     * 更新当前路径
     */
    function updateCurrentPath(path) {
        state.currentPath = path;
        const pathEl = document.getElementById('banner-path-value');
        if (pathEl) {
            pathEl.textContent = path;
            pathEl.title = path; // 悬停显示完整路径
        }
    }

    /**
     * 更新导航栈
     */
    function updateNavStack(stack) {
        state.navStack = stack || ['/'];
        const stackEl = document.getElementById('banner-navstack');
        if (stackEl) {
            stackEl.innerHTML = stack.map((p, i) => {
                const isActive = i === stack.length - 1;
                return `<code style="
                    display: block;
                    padding: 2px 4px;
                    margin: 2px 0;
                    background: ${isActive ? '#334155' : 'transparent'};
                    color: ${isActive ? '#60a5fa' : '#cbd5e1'};
                    border-left: 2px solid ${isActive ? '#60a5fa' : 'transparent'};
                ">${p}</code>`;
            }).join('');
        }
    }

    /**
     * 添加事件到队列
     */
    function addEvent(event) {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        state.recentEvents.unshift(`[${timestamp}] ${event}`);
        
        // 保留最近 5 条
        if (state.recentEvents.length > 5) {
            state.recentEvents.pop();
        }

        const eventsEl = document.getElementById('banner-events');
        if (eventsEl) {
            eventsEl.innerHTML = state.recentEvents
                .map(e => `<li>${e}</li>`)
                .join('');
        }
    }

    /**
     * 更新图表信息
     */
    function updateGraphInfo(type, nodeCount, edgeCount) {
        state.graphType = type;
        state.nodeCount = nodeCount;
        state.edgeCount = edgeCount;

        const graphEl = document.getElementById('banner-graph-value');
        if (graphEl) {
            graphEl.textContent = `${type} (${nodeCount} nodes, ${edgeCount} edges)`;
        }
    }

    /**
     * 更新所有状态（从外部调用）
     */
    function updateDebugState(updates) {
        if (updates.channel !== undefined) {
            updateChannelStatus(updates.channel);
        }
        if (updates.currentPath !== undefined) {
            updateCurrentPath(updates.currentPath);
        }
        if (updates.navStack !== undefined) {
            updateNavStack(updates.navStack);
        }
        if (updates.event !== undefined) {
            addEvent(updates.event);
        }
        if (updates.graph !== undefined) {
            updateGraphInfo(
                updates.graph.type || 'filetree',
                updates.graph.nodeCount || 0,
                updates.graph.edgeCount || 0
            );
        }
    }

    /**
     * 初始化横幅
     */
    function initDebugBanner() {
        console.log('[DebugBanner] 🔍 初始化调试横幅...');

        // 创建 UI
        createBannerUI();

        // 监听消息（自动更新状态）
        window.addEventListener('message', (event) => {
            const msg = event.data;
            
            switch (msg?.type) {
                case 'PONG':
                    updateChannelStatus('connected');
                    addEvent('收到 PONG ✅');
                    break;

                case 'init-graph':
                    const graph = msg.payload;
                    updateGraphInfo(
                        graph?.type || 'filetree',
                        graph?.nodes?.length || 0,
                        graph?.edges?.length || 0
                    );
                    addEvent('收到 init-graph');
                    break;

                case 'drill-result':
                case 'DRILL_RESULT':
                    const result = msg.payload;
                    addEvent(`DRILL ${result?.ok ? '成功' : '失败'}: ${result?.path || '未知'}`);
                    if (result?.currentPath) {
                        updateCurrentPath(result.currentPath);
                    }
                    if (result?.navStack) {
                        updateNavStack(result.navStack);
                    }
                    break;

                case 'drill-up-result':
                case 'DRILL_UP_RESULT':
                    const upResult = msg.payload;
                    addEvent(`上钻 ${upResult?.ok ? '成功' : '失败'}`);
                    if (upResult?.currentPath) {
                        updateCurrentPath(upResult.currentPath);
                    }
                    if (upResult?.navStack) {
                        updateNavStack(upResult.navStack);
                    }
                    break;

                default:
                    if (msg?.type) {
                        addEvent(`收到消息: ${msg.type}`);
                    }
            }
        });

        // 监听双击事件（诊断）
        document.addEventListener('dblclick', (e) => {
            const target = e.target;
            const className = target.className || '(无类名)';
            addEvent(`双击: ${target.tagName}.${className}`);
        }, true);

        console.log('[DebugBanner] ✅ 调试横幅已启动');
    }

    // 暴露到全局
    window.initDebugBanner = initDebugBanner;
    window.updateDebugState = updateDebugState;

    // 自动启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDebugBanner);
    } else {
        initDebugBanner();
    }
})();
