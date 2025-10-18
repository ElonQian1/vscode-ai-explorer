// media/filetree-blueprint/SmokeProbe.js
// [tags: Debug, Smoke Test, Dev Only]
/**
 * 冒烟探针 - 用于验证 Webview ↔ Extension 通道是否正常
 * 
 * 功能：
 * - 启动时自动发送 PING，等待 PONG 确认通道连接
 * - 提供可视化测试按钮（双击触发 DRILL）
 * - 显示连接状态和最近事件
 * - 仅在开发模式显示（生产环境可移除）
 * 
 * 用法：
 * 1. 在 HTML 中引入此脚本
 * 2. 调用 initSmokeProbe() 初始化
 * 3. 查看页面顶部的状态栏
 */

(function() {
    // 🚨 修复：统一VS Code API获取，避免重复调用
    if (!window.__vscode && typeof acquireVsCodeApi === 'function') {
        window.__vscode = acquireVsCodeApi();
    }
    const vscode = window.__vscode;
    let channelStatus = 'disconnected';
    let lastEvent = '无';
    let probeElement = null;

    /**
     * 创建探针 UI
     */
    function createProbeUI() {
        const probe = document.createElement('div');
        probe.id = 'smoke-probe';
        probe.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 32px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 12px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
            z-index: 999999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        `;

        probe.innerHTML = `
            <div style="display: flex; align-items: center; gap: 16px;">
                <span style="font-weight: 600;">🔍 Smoke Probe</span>
                <span id="probe-channel">通道: <span id="channel-status">🔌 Disconnected</span></span>
                <span id="probe-event">最近事件: <span id="last-event">无</span></span>
            </div>
            <button 
                id="probe-test-btn" 
                style="
                    padding: 4px 12px;
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 4px;
                    color: white;
                    cursor: pointer;
                    font-size: 11px;
                "
            >
                双击测试 DRILL
            </button>
        `;

        document.body.insertBefore(probe, document.body.firstChild);
        probeElement = probe;

        // 绑定测试按钮
        const testBtn = document.getElementById('probe-test-btn');
        testBtn.addEventListener('dblclick', () => {
            console.log('[Smoke] 用户双击测试按钮，发送 DRILL');
            updateLastEvent('双击测试按钮');
            vscode.postMessage({
                type: 'drill',
                payload: { path: '/' }
            });
        });

        return probe;
    }

    /**
     * 更新通道状态
     */
    function updateChannelStatus(status) {
        channelStatus = status;
        const statusEl = document.getElementById('channel-status');
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
     * 更新最近事件
     */
    function updateLastEvent(event) {
        lastEvent = event;
        const eventEl = document.getElementById('last-event');
        if (eventEl) {
            eventEl.textContent = event;
        }
    }

    /**
     * 发送 PING 探测
     */
    function sendPing() {
        console.log('[Smoke] 🔔 发送 PING 探测...');
        updateLastEvent('发送 PING');
        vscode.postMessage({ type: 'PING' });
    }

    /**
     * 监听 Extension 消息
     */
    function setupMessageListener() {
        window.addEventListener('message', (event) => {
            const msg = event.data;
            console.log('[Smoke] 📨 收到消息:', msg);

            switch (msg?.type) {
                case 'PONG':
                    console.log('[Smoke] ✅ 收到 PONG，通道正常');
                    updateChannelStatus('connected');
                    updateLastEvent('收到 PONG ✅');
                    // ✅ 握手成功后立即请求初始化
                    console.log('[Smoke] 📨 发送 REQUEST_INIT');
                    vscode.postMessage({ type: 'REQUEST_INIT' });
                    updateLastEvent('发送 REQUEST_INIT');
                    break;

                case 'drill-result':
                case 'DRILL_RESULT':
                    console.log('[Smoke] ✅ 收到 DRILL_RESULT:', msg.payload);
                    updateLastEvent(`DRILL ${msg.payload?.ok ? '成功' : '失败'}`);
                    if (!msg.payload?.ok) {
                        console.error('[Smoke] DRILL 失败:', msg.payload?.error);
                    }
                    break;

                case 'init-graph':
                    console.log('[Smoke] 📊 收到 init-graph');
                    updateLastEvent('收到 init-graph');
                    break;

                case 'INIT_RESULT':
                    console.log('[Smoke] 📊 收到 INIT_RESULT:', msg.payload);
                    if (msg.payload?.ok) {
                        const graph = msg.payload.graph;
                        updateLastEvent(`初始化成功 (${graph?.nodes?.length || 0} nodes)`);
                    } else {
                        updateLastEvent(`初始化失败: ${msg.payload?.reason}`);
                    }
                    break;

                default:
                    updateLastEvent(`收到 ${msg?.type}`);
            }
        });
    }

    /**
     * 监听用户交互事件（辅助诊断）
     */
    function setupEventProbe() {
        // 监听所有双击事件
        document.addEventListener('dblclick', (e) => {
            const target = e.target;
            const className = target.className || '(无类名)';
            const id = target.id || '(无ID)';
            console.log('[Smoke] 🖱️ 双击事件:', {
                tag: target.tagName,
                className,
                id,
                path: e.composedPath().map(el => el.tagName || el.nodeName).join(' → ')
            });
            updateLastEvent(`双击: ${target.tagName}.${className}`);
        }, true); // 使用捕获阶段

        // 监听单击事件
        document.addEventListener('click', (e) => {
            const target = e.target;
            console.log('[Smoke] 🖱️ 单击:', target.className || target.tagName);
        }, true);
    }

    /**
     * 初始化探针
     */
    function initSmokeProbe() {
        console.log('[Smoke] 🔍 初始化冒烟探针...');

        // 创建 UI
        createProbeUI();

        // 设置消息监听
        setupMessageListener();

        // 设置事件探针
        setupEventProbe();

        // 延迟 500ms 发送 PING（等待 Extension 准备好）
        setTimeout(() => {
            sendPing();
        }, 500);

        // 每 10 秒自动重新 PING（保持心跳）
        setInterval(() => {
            if (channelStatus !== 'connected') {
                console.log('[Smoke] ⏰ 心跳：重新 PING');
                sendPing();
            }
        }, 10000);

        console.log('[Smoke] ✅ 冒烟探针已启动');
    }

    // 暴露到全局（方便手动调用）
    window.initSmokeProbe = initSmokeProbe;
    window.sendPing = sendPing;

    // 自动启动（当 DOM 就绪时）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSmokeProbe);
    } else {
        initSmokeProbe();
    }
})();
