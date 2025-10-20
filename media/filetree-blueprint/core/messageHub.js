/**
 * MessageHub - 统一消息桥（第四刀）
 * 
 * 职责：
 * 1. 统一 postMessage 发送接口（Webview → Extension）
 * 2. 统一 onMessage 接收处理（Extension → Webview）
 * 3. 提供语义化 API（uiMoved/saveNotes/loadNotes）
 * 4. 集中日志记录（方便调试）
 * 
 * 设计原则：
 * - 语义化封装（隐藏 type/payload 细节）
 * - 类型安全（参数校验）
 * - 可测试（纯函数设计）
 * - 防御式编程（null 检查、错误捕获）
 */

/**
 * 创建消息中心
 * @param {Object} vscode - VSCode API 实例（window.vscode）
 * @returns {Object} MessageHub 实例
 */
export function createMessageHub(vscode) {
  if (!vscode) {
    console.error('[MessageHub] vscode 实例不能为空');
    return null;
  }

  // 私有状态
  const listeners = new Map(); // type -> Set<handler>

  /**
   * 发送消息到 Extension
   * @private
   * @param {string} type - 消息类型
   * @param {Object} payload - 消息负载
   */
  function sendMessage(type, payload) {
    if (!type) {
      console.error('[MessageHub] 消息类型不能为空');
      return;
    }

    const message = { type, payload };
    console.log(`[MessageHub] → Extension: ${type}`, payload);

    try {
      vscode.postMessage(message);
    } catch (error) {
      console.error(`[MessageHub] 发送消息失败: ${type}`, error);
    }
  }

  /**
   * 注册消息监听器
   * @param {string} type - 消息类型
   * @param {Function} handler - 处理函数 (payload) => void
   */
  function on(type, handler) {
    if (!type || typeof handler !== 'function') {
      console.error('[MessageHub] 无效的监听器注册');
      return;
    }

    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }

    listeners.get(type).add(handler);
    console.log(`[MessageHub] 注册监听器: ${type} (count=${listeners.get(type).size})`);
  }

  /**
   * 移除消息监听器
   * @param {string} type - 消息类型
   * @param {Function} handler - 处理函数
   */
  function off(type, handler) {
    if (!listeners.has(type)) return;

    listeners.get(type).delete(handler);
    console.log(`[MessageHub] 移除监听器: ${type} (remaining=${listeners.get(type).size})`);

    // 清理空集合
    if (listeners.get(type).size === 0) {
      listeners.delete(type);
    }
  }

  /**
   * 分发消息到监听器
   * @param {Object} message - 消息对象 { type, payload }
   */
  function dispatch(message) {
    if (!message || !message.type) {
      console.warn('[MessageHub] 无效的消息格式', message);
      return;
    }

    const { type, payload } = message;
    console.log(`[MessageHub] ← Extension: ${type}`, payload);

    if (!listeners.has(type)) {
      console.warn(`[MessageHub] 无监听器: ${type}`);
      return;
    }

    const handlers = listeners.get(type);
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[MessageHub] 处理器错误: ${type}`, error);
      }
    });
  }

  // ========== 语义化 API ==========

  /**
   * 通知 Extension：UI 元素已移动（卡片/节点）
   * @param {string} path - 元素路径
   * @param {{x: number, y: number}} position - 新位置
   */
  function uiMoved(path, position) {
    if (!path || !position) {
      console.error('[MessageHub] uiMoved: 缺少必需参数');
      return;
    }

    sendMessage('card-moved', {
      path,
      position: { x: position.x, y: position.y }
    });
  }

  /**
   * 通知 Extension：保存备注
   * @param {string} path - 文件路径
   * @param {string} notes - 备注内容
   */
  function saveNotes(path, notes) {
    if (!path) {
      console.error('[MessageHub] saveNotes: 路径不能为空');
      return;
    }

    sendMessage('save-notes', {
      path,
      notes: notes || ''
    });
  }

  /**
   * 请求 Extension：加载备注
   * @param {string} path - 文件路径
   */
  function loadNotes(path) {
    if (!path) {
      console.error('[MessageHub] loadNotes: 路径不能为空');
      return;
    }

    sendMessage('load-notes', { path });
  }

  /**
   * 通知 Extension：向上钻取
   * @param {string} targetPath - 目标路径
   */
  function drillUp(targetPath) {
    sendMessage('drill-up', { path: targetPath });
  }

  /**
   * 通知 Extension：向下钻取
   * @param {string} targetPath - 目标路径
   */
  function drillDown(targetPath) {
    sendMessage('drill-down', { path: targetPath });
  }

  /**
   * 通知 Extension：聚焦文件
   * @param {string} fsPath - 文件系统路径
   */
  function focusFile(fsPath) {
    if (!fsPath) {
      console.error('[MessageHub] focusFile: 路径不能为空');
      return;
    }

    sendMessage('focus-file', { fsPath });
  }

  /**
   * 请求 Extension：打开文件
   * @param {string} fsPath - 文件系统路径
   */
  function openFile(fsPath) {
    if (!fsPath) {
      console.error('[MessageHub] openFile: 路径不能为空');
      return;
    }

    sendMessage('open-file', { fsPath });
  }

  /**
   * 通知 Extension：显示 Toast
   * @param {string} message - 提示消息
   * @param {'info'|'warning'|'error'} level - 级别
   */
  function showToast(message, level = 'info') {
    if (!message) return;

    sendMessage('show-toast', { message, level });
  }

  /**
   * 请求 Extension：重新布局
   */
  function requestReflow() {
    sendMessage('request-reflow', {});
  }

  /**
   * 通知 Extension：准备就绪
   */
  function ready() {
    sendMessage('webview-ready', {});
    console.log('[MessageHub] Webview 已准备就绪');
  }

  // ========== 监听器语义化包装 ==========

  /**
   * 监听备注加载完成
   * @param {Function} handler - (path, notes) => void
   */
  function onNotesLoaded(handler) {
    on('notes-loaded', (payload) => {
      if (payload && payload.path !== undefined) {
        handler(payload.path, payload.notes || '');
      }
    });
  }

  /**
   * 监听图数据更新
   * @param {Function} handler - (graph) => void
   */
  function onGraphUpdated(handler) {
    on('graph-updated', (payload) => {
      if (payload && payload.graph) {
        handler(payload.graph);
      }
    });
  }

  /**
   * 监听布局完成
   * @param {Function} handler - (layout) => void
   */
  function onLayoutReady(handler) {
    on('layout-ready', (payload) => {
      if (payload && payload.layout) {
        handler(payload.layout);
      }
    });
  }

  /**
   * 监听错误消息
   * @param {Function} handler - (error) => void
   */
  function onError(handler) {
    on('error', (payload) => {
      if (payload && payload.message) {
        handler(payload.message);
      }
    });
  }

  // 公开 API
  return {
    // 低级 API（通用）
    send: sendMessage,
    on,
    off,
    dispatch,

    // 语义化 API（发送）
    uiMoved,
    saveNotes,
    loadNotes,
    drillUp,
    drillDown,
    focusFile,
    openFile,
    showToast,
    requestReflow,
    ready,

    // 语义化 API（监听）
    onNotesLoaded,
    onGraphUpdated,
    onLayoutReady,
    onError,

    // 内部状态（只读）
    get listenerCount() {
      let total = 0;
      listeners.forEach(set => total += set.size);
      return total;
    }
  };
}

/**
 * 初始化全局消息监听（自动分发）
 * @param {Object} messageHub - MessageHub 实例
 */
export function setupMessageListener(messageHub) {
  if (!messageHub) {
    console.error('[MessageHub] 无法设置监听器：实例为空');
    return;
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    messageHub.dispatch(message);
  });

  console.log('[MessageHub] 全局消息监听已设置');
}
