/**
 * 蓝图卡片系统消息契约定义
 * 
 * 标准化扩展端与Webview之间的通信协议，确保：
 * 1. 消息不丢失 (ACK确认机制)
 * 2. 增量更新 (AI结果流式合并)
 * 3. 数据一致性 (用户备注不被覆盖)
 */

(function (global, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        global.messageContracts = factory();
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // ===== 消息类型定义 =====
    
    /**
     * 扩展端 -> Webview 消息类型
     */
    const ExtensionToWebviewTypes = {
        // 图表相关
        INIT_GRAPH: 'init-graph',
        UPDATE_GRAPH: 'update-graph',
        
        // 蓝图卡片相关
        SHOW_ANALYSIS_CARD: 'show-analysis-card',        // 显示分析卡片
        UPDATE_ANALYSIS_CARD: 'update-analysis-card',    // 更新卡片数据
        CLOSE_ANALYSIS_CARD: 'close-analysis-card',      // 关闭卡片
        
        // 胶囊数据
        SYNC_CAPSULE_DATA: 'sync-capsule-data',          // 同步胶囊数据
        
        // 系统消息
        WEBVIEW_READY_ACK: 'webview-ready-ack'           // 确认Webview就绪
    };

    /**
     * Webview -> 扩展端 消息类型
     */
    const WebviewToExtensionTypes = {
        // 生命周期
        WEBVIEW_READY: 'webview-ready',                  // Webview初始化完成
        
        // 用户交互
        NODE_DOUBLE_CLICK: 'node-double-click',          // 双击节点
        NODE_CONTEXT_MENU: 'node-context-menu',          // 右键菜单
        
        // 卡片操作
        CARD_OPENED: 'card-opened',                      // 卡片已打开
        CARD_CLOSED: 'card-closed',                      // 卡片已关闭
        CARD_MOVED: 'card-moved',                        // 卡片位置改变
        CARD_PINNED: 'card-pinned',                      // 卡片固定状态改变
        
        // 数据操作
        SAVE_NOTES: 'save-notes',                        // 保存用户备注
        REQUEST_AI_ANALYSIS: 'request-ai-analysis',      // 请求AI分析
        
        // 确认消息 (ACK)
        ACK_SHOW_ANALYSIS_CARD: 'ack:show-analysis-card',
        ACK_UPDATE_ANALYSIS_CARD: 'ack:update-analysis-card',
        ACK_INIT_GRAPH: 'ack:init-graph'
    };

    // ===== 数据结构定义 =====

    /**
     * 卡片数据结构
     */
    const CardDataSchema = {
        // 基础信息
        path: '',                    // 文件路径
        meta: {                      // 文件元信息
            size: 0,
            extension: '',
            lastModified: '',
            encoding: 'utf-8'
        },
        
        // 静态分析结果
        static: {
            summary: '',             // 一句话描述
            exports: [               // 导出符号
                {
                    name: '',
                    type: '',        // function|class|const|type
                    signature: '',
                    line: 0
                }
            ],
            deps: {                  // 依赖关系
                in: [],              // 输入依赖路径数组
                out: []              // 输出依赖路径数组
            }
        },
        
        // AI分析结果
        ai: {
            inferences: [],          // AI推断结果数组
            suggestions: [],         // 改进建议数组
            lastModel: '',           // 使用的模型
            lastAt: '',              // 分析时间 ISO string
            confidence: 0.0          // 置信度 0-1
        },
        
        // 用户备注 (永不覆盖)
        notes: {
            md: '',                  // Markdown内容
            updatedAt: '',           // 更新时间 ISO string
            author: '',              // 作者
            version: 1               // 备注版本号
        },
        
        // 元数据
        version: 1,                  // 数据结构版本
        contentHash: ''              // 文件内容哈希
    };

    /**
     * 卡片状态结构
     */
    const CardStateSchema = {
        path: '',
        position: { x: 120, y: 120 },
        size: { width: 520, height: 420 },
        pinned: false,
        activeTab: 'overview',       // overview|deps|ai|notes
        zIndex: 2000
    };

    // ===== 消息工厂函数 =====

    /**
     * 创建显示分析卡片消息
     */
    function createShowAnalysisCardMessage(path, data, options = {}) {
        return {
            type: ExtensionToWebviewTypes.SHOW_ANALYSIS_CARD,
            payload: {
                path,
                data: validateCardData(data),
                options: {
                    position: { x: 120, y: 120 },
                    size: { width: 520, height: 420 },
                    activeTab: 'overview',
                    ...options
                },
                timestamp: Date.now(),
                messageId: generateMessageId()
            }
        };
    }

    /**
     * 创建更新分析卡片消息 (增量)
     */
    function createUpdateAnalysisCardMessage(path, updates) {
        return {
            type: ExtensionToWebviewTypes.UPDATE_ANALYSIS_CARD,
            payload: {
                path,
                updates: validateCardUpdates(updates),
                timestamp: Date.now(),
                messageId: generateMessageId(),
                incremental: true  // 标记为增量更新
            }
        };
    }

    /**
     * 创建ACK确认消息
     */
    function createAckMessage(originalType, payload = {}) {
        const ackType = `ack:${originalType}`;
        return {
            type: ackType,
            payload: {
                ...payload,
                timestamp: Date.now(),
                ackId: generateMessageId()
            }
        };
    }

    /**
     * 创建节点双击消息
     */
    function createNodeDoubleClickMessage(nodeId, nodeData) {
        return {
            type: WebviewToExtensionTypes.NODE_DOUBLE_CLICK,
            payload: {
                nodeId,
                nodeData,
                timestamp: Date.now(),
                messageId: generateMessageId()
            }
        };
    }

    /**
     * 创建保存备注消息
     */
    function createSaveNotesMessage(path, notes) {
        return {
            type: WebviewToExtensionTypes.SAVE_NOTES,
            payload: {
                path,
                notes: {
                    md: notes.md || '',
                    updatedAt: new Date().toISOString(),
                    author: notes.author || 'Current User',
                    version: (notes.version || 0) + 1
                },
                timestamp: Date.now(),
                messageId: generateMessageId()
            }
        };
    }

    /**
     * 创建卡片移动消息 (持久化位置)
     */
    function createCardMovedMessage(path, position) {
        return {
            type: WebviewToExtensionTypes.CARD_MOVED,
            payload: {
                path,
                position: {
                    x: Math.round(position.x),
                    y: Math.round(position.y)
                },
                timestamp: Date.now(),
                messageId: generateMessageId()
            }
        };
    }

    // ===== 数据验证函数 =====

    /**
     * 验证卡片数据结构
     */
    function validateCardData(data) {
        if (!data || typeof data !== 'object') {
            return { path: '', version: 1 };
        }

        return {
            path: data.path || '',
            meta: validateMeta(data.meta),
            static: validateStatic(data.static),
            ai: validateAI(data.ai),
            notes: validateNotes(data.notes),
            version: data.version || 1,
            contentHash: data.contentHash || ''
        };
    }

    /**
     * 验证卡片更新数据 (增量)
     */
    function validateCardUpdates(updates) {
        const validated = {};
        
        if (updates.static) validated.static = validateStatic(updates.static);
        if (updates.ai) validated.ai = validateAI(updates.ai);
        if (updates.meta) validated.meta = validateMeta(updates.meta);
        // 注意：notes 通常不在增量更新中，由用户操作单独触发
        
        return validated;
    }

    function validateMeta(meta) {
        if (!meta || typeof meta !== 'object') return {};
        return {
            size: typeof meta.size === 'number' ? meta.size : 0,
            extension: typeof meta.extension === 'string' ? meta.extension : '',
            lastModified: typeof meta.lastModified === 'string' ? meta.lastModified : '',
            encoding: typeof meta.encoding === 'string' ? meta.encoding : 'utf-8'
        };
    }

    function validateStatic(staticData) {
        if (!staticData || typeof staticData !== 'object') return {};
        return {
            summary: typeof staticData.summary === 'string' ? staticData.summary : '',
            exports: Array.isArray(staticData.exports) ? staticData.exports : [],
            deps: {
                in: Array.isArray(staticData.deps?.in) ? staticData.deps.in : [],
                out: Array.isArray(staticData.deps?.out) ? staticData.deps.out : []
            }
        };
    }

    function validateAI(ai) {
        if (!ai || typeof ai !== 'object') return {};
        return {
            inferences: Array.isArray(ai.inferences) ? ai.inferences : [],
            suggestions: Array.isArray(ai.suggestions) ? ai.suggestions : [],
            lastModel: typeof ai.lastModel === 'string' ? ai.lastModel : '',
            lastAt: typeof ai.lastAt === 'string' ? ai.lastAt : '',
            confidence: typeof ai.confidence === 'number' ? Math.max(0, Math.min(1, ai.confidence)) : 0
        };
    }

    function validateNotes(notes) {
        if (!notes || typeof notes !== 'object') return {};
        return {
            md: typeof notes.md === 'string' ? notes.md : '',
            updatedAt: typeof notes.updatedAt === 'string' ? notes.updatedAt : '',
            author: typeof notes.author === 'string' ? notes.author : '',
            version: typeof notes.version === 'number' ? notes.version : 1
        };
    }

    // ===== 工具函数 =====

    /**
     * 生成唯一消息ID
     */
    function generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 安全的消息发送 (带重试)
     */
    function safeSendMessage(vscode, message, maxRetries = 3) {
        return new Promise((resolve, reject) => {
            let retries = 0;
            
            function attempt() {
                try {
                    vscode.postMessage(message);
                    
                    // 对于需要ACK的消息，设置超时
                    if (message.type.includes('show-') || message.type.includes('update-')) {
                        const timeout = setTimeout(() => {
                            if (retries < maxRetries) {
                                retries++;
                                console.warn(`[messageContracts] 重试发送消息 (${retries}/${maxRetries}):`, message.type);
                                attempt();
                            } else {
                                reject(new Error(`消息发送失败，已重试 ${maxRetries} 次: ${message.type}`));
                            }
                        }, 2000);
                        
                        // 监听ACK (这里需要在实际使用时设置监听器)
                        // 收到ACK后 clearTimeout(timeout) 并 resolve()
                    } else {
                        resolve();
                    }
                } catch (error) {
                    if (retries < maxRetries) {
                        retries++;
                        setTimeout(attempt, 1000);
                    } else {
                        reject(error);
                    }
                }
            }
            
            attempt();
        });
    }

    /**
     * 消息合并策略 (用于增量更新)
     */
    function mergeCardData(existing, updates) {
        if (!existing) return updates;
        if (!updates) return existing;
        
        // 深度合并，但保护用户备注
        const merged = {
            ...existing,
            ...updates,
            ai: {
                ...(existing.ai || {}),
                ...(updates.ai || {})
            },
            static: {
                ...(existing.static || {}),
                ...(updates.static || {}),
                deps: {
                    ...(existing.static?.deps || {}),
                    ...(updates.static?.deps || {})
                }
            },
            // 用户备注永远不被增量更新覆盖
            notes: existing.notes || updates.notes
        };
        
        return merged;
    }

    // ===== 导出API =====
    return {
        // 消息类型
        ExtensionToWebviewTypes,
        WebviewToExtensionTypes,
        
        // 数据结构模板
        CardDataSchema,
        CardStateSchema,
        
        // 消息工厂
        createShowAnalysisCardMessage,
        createUpdateAnalysisCardMessage,
        createAckMessage,
        createNodeDoubleClickMessage,
        createSaveNotesMessage,
        createCardMovedMessage,
        
        // 验证函数
        validateCardData,
        validateCardUpdates,
        
        // 工具函数
        generateMessageId,
        safeSendMessage,
        mergeCardData
    };
});