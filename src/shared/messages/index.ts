// src/shared/messages/index.ts
// [module: shared] [tags: Messages, Types]
/**
 * Webview ⇄ Extension 消息契约
 * 
 * 这是 Webview 和 Extension 之间通信的唯一消息定义来源
 * 所有模块都应该引用这个文件，而不是自己定义消息类型
 * 
 * 设计原则：
 * 1. 类型安全 - 使用 TypeScript 联合类型确保消息结构正确
 * 2. 单一来源 - 避免字段名不一致导致的 bug
 * 3. 可观测性 - 每个关键步骤都有 ACK 消息
 */

import { FileCapsule } from '../../features/file-analysis/types';
import { Graph } from '../../features/filetree-blueprint/domain/FileTreeScanner';

// ============================================================================
// Webview → Extension (前端发给后端的消息)
// ============================================================================

/**
 * Webview 准备就绪
 */
export interface ReadyMessage {
    type: 'ready';
}

/**
 * ✅ Phase 7: Webview 脚本加载完成，已准备好接收消息
 */
export interface WebviewReadyMessage {
    type: 'webview-ready';
}

/**
 * 节点点击事件
 */
export interface NodeClickMessage {
    type: 'node-click';
    payload: {
        nodeId: string;
        label: string;
        type: 'file' | 'folder';
        data?: any;
    };
}

/**
 * 节点双击事件
 */
export interface NodeDoubleClickMessage {
    type: 'node-double-click';
    payload: {
        nodeId: string;
        label: string;
        type: 'file' | 'folder';
        data?: {
            path: string;
            isRoot?: boolean;
        };
    };
}

/**
 * 请求分析文件
 */
export interface AnalyzeFileMessage {
    type: 'analyze-file';
    payload: {
        /** 文件绝对路径 */
        path: string;
        /** 是否强制重新分析 */
        force?: boolean;
    };
}

/**
 * 确认已显示分析卡片 (ACK)
 */
export interface AnalysisCardShownMessage {
    type: 'analysis-card-shown';
    payload: {
        /** 文件路径 */
        file: string;
    };
}

/**
 * 打开源文件
 */
export interface OpenSourceMessage {
    type: 'open-source';
    payload: {
        /** 文件路径 */
        file: string;
        /** 起始行号 (1-based) */
        line?: number;
        /** 结束行号 (1-based) */
        endLine?: number;
    };
}

/**
 * 下钻到子文件夹
 */
export interface DrillMessage {
    type: 'drill';
    payload: {
        /** 文件夹路径 */
        path: string;
    };
}

/**
 * 返回上级目录
 */
export interface DrillUpMessage {
    type: 'drill-up';
}

/**
 * 打开文件
 */
export interface OpenFileMessage {
    type: 'open-file';
    payload: {
        /** 文件路径 */
        path: string;
    };
}

/**
 * 在资源管理器中显示
 */
export interface RevealInExplorerMessage {
    type: 'reveal-in-explorer';
    payload: {
        /** 文件路径 */
        path: string;
    };
}

/**
 * 返回上级目录 (备用)
 */
export interface GoUpMessage {
    type: 'go-up';
    payload: {
        /** 当前路径 */
        currentPath: string;
    };
}

/**
 * 节点移动事件
 */
export interface NodeMovedMessage {
    type: 'node-moved';
    payload: {
        /** 节点ID */
        nodeId: string;
        /** 新位置 */
        position: {
            x: number;
            y: number;
        };
    };
}

/**
 * 确认已接收 init-graph 消息 (ACK)
 */
export interface AckInitGraphMessage {
    type: 'ack:init-graph';
    payload: {
        /** 图表标题 */
        title?: string;
        /** 节点数量 */
        nodeCount?: number;
    };
}

/**
 * Webview 错误报告
 */
export interface ErrorMessage {
    type: 'error';
    payload: {
        /** 错误消息 */
        message: string;
        /** 错误堆栈 */
        stack?: string;
    };
}

/**
 * 保存用户备注 (旧版)
 */
export interface SaveUserNotesMessage {
    type: 'save-user-notes';
    payload: {
        filePath: string;
        notes: {
            comments?: string[];
            tags?: string[];
            priority?: 'low' | 'medium' | 'high';
        };
    };
}

/**
 * 获取用户备注 (旧版)
 */
export interface GetUserNotesMessage {
    type: 'get-user-notes';
    payload: {
        filePath: string;
    };
}

/**
 * 保存增强版用户备注
 */
export interface SaveEnhancedUserNotesMessage {
    type: 'save-enhanced-user-notes';
    payload: {
        filePath: string;
        notes: {
            filePath: string;
            priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
            status: 'active' | 'review' | 'deprecated' | 'archive' | 'testing' | 'done';
            tags: Array<{
                name: string;
                color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';
                description?: string;
                createdAt: number;
            }>;
            comments: Array<{
                id: string;
                content: string;
                createdAt: number;
                pinned: boolean;
                tags: string[];
            }>;
            todos: Array<{
                id: string;
                content: string;
                completed: boolean;
                createdAt: number;
                completedAt?: number;
                priority?: 'critical' | 'high' | 'medium' | 'low';
                tags?: string[];
            }>;
            links: Array<{
                id: string;
                title: string;
                url: string;
                description?: string;
                category: 'documentation' | 'reference' | 'example' | 'issue' | 'other';
                createdAt: number;
            }>;
            rating?: {
                codeQuality: number; // 1-5
                importance: number; // 1-5  
                complexity: number; // 1-5
                ratedAt: number;
            };
            customFields: Record<string, any>;
            metadata: {
                createdAt: number;
                lastEditedAt: number;
                editCount: number;
                version: string;
            };
        };
    };
}

/**
 * 获取增强版用户备注
 */
export interface GetEnhancedUserNotesMessage {
    type: 'get-enhanced-user-notes';
    payload: {
        filePath: string;
    };
}

/**
 * Webview → Extension 消息联合类型
 */
export type WebviewToExtension =
    | ReadyMessage
    | WebviewReadyMessage
    | NodeClickMessage
    | NodeDoubleClickMessage
    | AnalyzeFileMessage
    | AnalysisCardShownMessage
    | AckInitGraphMessage
    | OpenSourceMessage
    | DrillMessage
    | DrillUpMessage
    | OpenFileMessage
    | RevealInExplorerMessage
    | GoUpMessage
    | NodeMovedMessage
    | ErrorMessage
    | SaveUserNotesMessage
    | GetUserNotesMessage
    | SaveEnhancedUserNotesMessage
    | GetEnhancedUserNotesMessage;

// ============================================================================
// Extension → Webview (后端发给前端的消息)
// ============================================================================

/**
 * 初始化图表数据
 */
export interface InitGraphMessage {
    type: 'init-graph';
    payload: Graph;
}

/**
 * 显示分析卡片 (静态分析结果)
 */
export interface ShowAnalysisCardMessage {
    type: 'show-analysis-card';
    payload: FileCapsule & {
        /** 是否正在进行 AI 分析 */
        loading?: boolean;
    };
}

/**
 * 更新分析卡片 (AI 增强结果)
 */
export interface UpdateAnalysisCardMessage {
    type: 'update-analysis-card';
    payload: FileCapsule & {
        /** 是否正在加载 */
        loading?: boolean;
        /** AI 分析错误信息 (如果有) */
        aiError?: string;
    };
}

/**
 * 分析失败
 */
export interface AnalysisErrorMessage {
    type: 'analysis-error';
    payload: {
        /** 文件路径 */
        file: string;
        /** 错误消息 */
        message: string;
    };
}

/**
 * 打开帮助浮层
 */
export interface OpenHelpMessage {
    type: 'open-help';
}

/**
 * 用户备注数据响应 (旧版)
 */
export interface UserNotesDataMessage {
    type: 'user-notes-data';
    payload: {
        filePath: string;
        notes: {
            comments: string[];
            tags: string[];
            priority?: 'low' | 'medium' | 'high';
            lastEditedAt?: number;
        };
    };
}

/**
 * 用户备注保存成功确认 (旧版)
 */
export interface UserNotesSavedMessage {
    type: 'user-notes-saved';
    payload: {
        filePath: string;
        success: boolean;
        error?: string;
    };
}

/**
 * 增强版用户备注数据响应
 */
export interface EnhancedUserNotesDataMessage {
    type: 'enhanced-user-notes-data';
    payload: {
        filePath: string;
        notes: {
            filePath: string;
            priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
            status: 'active' | 'review' | 'deprecated' | 'archive' | 'testing' | 'done';
            tags: Array<{
                name: string;
                color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';
                description?: string;
                createdAt: number;
            }>;
            comments: Array<{
                id: string;
                content: string;
                createdAt: number;
                pinned: boolean;
                tags: string[];
            }>;
            todos: Array<{
                id: string;
                content: string;
                completed: boolean;
                createdAt: number;
                completedAt?: number;
                priority?: 'critical' | 'high' | 'medium' | 'low';
                tags?: string[];
            }>;
            links: Array<{
                id: string;
                title: string;
                url: string;
                description?: string;
                category: 'documentation' | 'reference' | 'example' | 'issue' | 'other';
                createdAt: number;
            }>;
            rating?: {
                codeQuality: number;
                importance: number;
                complexity: number;
                ratedAt: number;
            };
            customFields: Record<string, any>;
            metadata: {
                createdAt: number;
                lastEditedAt: number;
                editCount: number;
                version: string;
            };
        };
        success?: boolean;
        error?: string;
    };
}

/**
 * 增强版用户备注保存成功确认
 */
export interface EnhancedUserNotesSavedMessage {
    type: 'enhanced-user-notes-saved';
    payload: {
        filePath: string;
        success: boolean;
        error?: string;
    };
}

/**
 * Extension → Webview 消息联合类型
 */
export type ExtensionToWebview =
    | InitGraphMessage
    | ShowAnalysisCardMessage
    | UpdateAnalysisCardMessage
    | AnalysisErrorMessage
    | OpenHelpMessage
    | UserNotesDataMessage
    | UserNotesSavedMessage
    | EnhancedUserNotesDataMessage
    | EnhancedUserNotesSavedMessage;

// ============================================================================
// 类型守卫 (Type Guards)
// ============================================================================

/**
 * 检查是否为特定类型的消息
 */
export function isMessageOfType<T extends { type: string }>(
    message: any,
    type: T['type']
): message is T {
    return message && typeof message === 'object' && message.type === type;
}

// ============================================================================
// 消息创建辅助函数 (Message Builders)
// ============================================================================

/**
 * 创建显示分析卡片消息
 */
export function createShowAnalysisCardMessage(
    capsule: FileCapsule,
    loading: boolean = true
): ShowAnalysisCardMessage {
    return {
        type: 'show-analysis-card',
        payload: {
            ...capsule,
            loading
        }
    };
}

/**
 * 创建更新分析卡片消息
 */
export function createUpdateAnalysisCardMessage(
    capsule: FileCapsule,
    loading: boolean = false,
    aiError?: string
): UpdateAnalysisCardMessage {
    return {
        type: 'update-analysis-card',
        payload: {
            ...capsule,
            loading,
            aiError
        }
    };
}

/**
 * 创建分析错误消息
 */
export function createAnalysisErrorMessage(
    file: string,
    message: string
): AnalysisErrorMessage {
    return {
        type: 'analysis-error',
        payload: { file, message }
    };
}

/**
 * 创建用户备注数据消息
 */
export function createUserNotesDataMessage(
    filePath: string,
    notes: {
        comments: string[];
        tags: string[];
        priority?: 'low' | 'medium' | 'high';
        lastEditedAt?: number;
    }
): UserNotesDataMessage {
    return {
        type: 'user-notes-data',
        payload: { filePath, notes }
    };
}

/**
 * 创建用户备注保存成功消息
 */
export function createUserNotesSavedMessage(
    filePath: string,
    success: boolean,
    error?: string
): UserNotesSavedMessage {
    return {
        type: 'user-notes-saved',
        payload: { filePath, success, error }
    };
}

/**
 * 创建分析文件请求消息
 */
export function createAnalyzeFileMessage(
    path: string,
    force: boolean = false
): AnalyzeFileMessage {
    return {
        type: 'analyze-file',
        payload: { path, force }
    };
}

/**
 * 创建卡片已显示确认消息
 */
export function createAnalysisCardShownMessage(
    file: string
): AnalysisCardShownMessage {
    return {
        type: 'analysis-card-shown',
        payload: { file }
    };
}

// ============================================================================
// 导出说明
// ============================================================================

/**
 * 使用示例：
 * 
 * 后端 (BlueprintPanel.ts):
 * ```typescript
 * import { WebviewToExtension, createShowAnalysisCardMessage } from '../../shared/messages';
 * 
 * private async handleMessage(message: WebviewToExtension): Promise<void> {
 *     if (message.type === 'analyze-file') {
 *         const capsule = await analyzeFile(message.payload.path);
 *         const msg = createShowAnalysisCardMessage(capsule, true);
 *         this.panel.webview.postMessage(msg);
 *     }
 * }
 * ```
 * 
 * 前端 (graphView.js):
 * ```javascript
 * // @ts-check
 * /// <reference path="../../shared/messages/index.ts" />
 * 
 * window.addEventListener('message', (e) => {
 *     const msg = e.data;
 *     if (msg.type === 'show-analysis-card') {
 *         window.cardManager?.showCard(msg.payload);
 *     }
 * });
 * ```
 */
