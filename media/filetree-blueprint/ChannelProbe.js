// media/filetree-blueprint/ChannelProbe.js
// [tags: Debug, Smoke Test, Channel Verification]
/**
 * 最小化事件→消息通道冒烟测试
 * 
 * 目标：验证双击事件触发 + PING/PONG 通道畅通
 * 
 * 验收标准：
 * 1. Webview 控制台出现 "channel ok"
 * 2. 扩展输出中出现 "DRILL_TO"
 * 3. 双击任意位置都能触发 console.log
 */

(function() {
    const vscode = acquireVsCodeApi();
    let probeRunning = false;

    // 🔍 Step 1a: 页面 mount 立刻发送 PING
    function initChannelProbe() {
        if (probeRunning) return;
        probeRunning = true;

        console.log('[ChannelProbe] 🔔 发送 PING 测试通道...');
        vscode.postMessage({ type: 'PING' });

        // 监听 PONG 回复
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg?.type === 'PONG') {
                console.log('[ChannelProbe] ✅ 收到 PONG - channel ok');
                document.body.style.border = '3px solid #4ade80'; // 绿色边框表示通道正常
            }
        });

        // 🔍 Step 1b: 全局双击监听器
        document.addEventListener('dblclick', (e) => {
            console.log('[ChannelProbe] 🖱️ 检测到双击事件:', {
                target: e.target.tagName,
                className: e.target.className,
                clientX: e.clientX,
                clientY: e.clientY
            });

            // 发送 DRILL_TO 消息测试
            vscode.postMessage({ 
                type: 'DRILL_TO', 
                path: '/',
                metadata: {
                    probe: true,
                    timestamp: Date.now(),
                    targetElement: e.target.tagName + '.' + (e.target.className || 'no-class')
                }
            });

            // 视觉反馈
            const flash = document.createElement('div');
            flash.style.cssText = `
                position: fixed;
                top: ${e.clientY - 20}px;
                left: ${e.clientX - 20}px;
                width: 40px;
                height: 40px;
                background: rgba(96, 165, 250, 0.8);
                border-radius: 50%;
                pointer-events: none;
                z-index: 999999;
                animation: probe-flash 0.6s ease-out forwards;
            `;
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 600);
        }, true); // 使用捕获阶段

        console.log('[ChannelProbe] ✅ 通道探针已启动');
    }

    // CSS 动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes probe-flash {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // 延迟启动（等待 DOM 就绪）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChannelProbe);
    } else {
        setTimeout(initChannelProbe, 100);
    }

    // 暴露到全局（手动测试用）
    window.channelProbe = {
        sendPing: () => vscode.postMessage({ type: 'PING' }),
        sendDrill: (path = '/') => vscode.postMessage({ type: 'DRILL_TO', path }),
        testClick: () => {
            console.log('[ChannelProbe] 🧪 手动触发点击测试');
            document.body.click();
            document.body.dispatchEvent(new MouseEvent('dblclick', {
                bubbles: true,
                clientX: 100,
                clientY: 100
            }));
        }
    };
})();