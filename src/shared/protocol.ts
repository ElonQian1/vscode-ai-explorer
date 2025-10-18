// src/shared/protocol.ts
// [tags: Protocol, Message Contract]
/**
 * 统一的消息协议定义
 * 
 * 功能：
 * - 定义 Webview ↔ Extension 的所有消息类型
 * - 使用 zod 进行运行时校验
 * - 避免消息常量拼写错误和类型不匹配
 * 
 * 约定：
 * - W2E_ 前缀：Webview → Extension
 * - E2W_ 前缀：Extension → Webview
 * - SYSTEM_ 前缀：系统级别消息（ready/ping/pong）
 */

import { z } from 'zod';

// ========== 系统级别消息 ==========

/** Webview 就绪信号 */
export const SYSTEM_WEBVIEW_READY = 'webview-ready' as const;

/** 握手探针：Ping */
export const SYSTEM_PING = 'PING' as const;

/** 握手探针：Pong */
export const SYSTEM_PONG = 'PONG' as const;

// ========== Webview → Extension 消息 ==========

/** 下钻到子文件夹 */
export const W2E_DRILL = 'drill' as const;

/** 返回上一级 */
export const W2E_DRILL_UP = 'drill-up' as const;

/** 分析文件 */
export const W2E_ANALYZE_FILE = 'analyze-file' as const;

/** 打开文件 */
export const W2E_OPEN_FILE = 'open-file' as const;

/** 在资源管理器中显示 */
export const W2E_REVEAL_IN_EXPLORER = 'reveal-in-explorer' as const;

/** 节点点击 */
export const W2E_NODE_CLICK = 'node-click' as const;

/** 节点双击 */
export const W2E_NODE_DOUBLE_CLICK = 'node-double-click' as const;

/** 节点移动 */
export const W2E_NODE_MOVED = 'node-moved' as const;

/** 打开源文件并跳转到指定行 */
export const W2E_OPEN_SOURCE = 'open-source' as const;

/** 错误报告 */
export const W2E_ERROR = 'error' as const;

// ========== Extension → Webview 消息 ==========

/** 初始化图表 */
export const E2W_INIT_GRAPH = 'init-graph' as const;

/** 显示分析卡片 */
export const E2W_SHOW_ANALYSIS_CARD = 'show-analysis-card' as const;

/** 更新分析卡片 */
export const E2W_UPDATE_ANALYSIS_CARD = 'update-analysis-card' as const;

/** 分析错误 */
export const E2W_ANALYSIS_ERROR = 'analysis-error' as const;

/** 下钻结果（用于冒烟测试） */
export const E2W_DRILL_RESULT = 'drill-result' as const;

// ========== Zod 校验 Schema ==========

/** 路径 payload */
export const PathPayloadSchema = z.object({
    path: z.string().min(1, '路径不能为空'),
});

/** 下钻消息 */
export const DrillMessageSchema = z.object({
    type: z.literal(W2E_DRILL),
    payload: PathPayloadSchema,
});

/** 上钻消息 */
export const DrillUpMessageSchema = z.object({
    type: z.literal(W2E_DRILL_UP),
    payload: PathPayloadSchema.optional(),
});

/** 分析文件消息 */
export const AnalyzeFileMessageSchema = z.object({
    type: z.literal(W2E_ANALYZE_FILE),
    payload: z.object({
        path: z.string(),
        force: z.boolean().optional(),
    }),
});

/** 打开文件消息 */
export const OpenFileMessageSchema = z.object({
    type: z.literal(W2E_OPEN_FILE),
    payload: PathPayloadSchema,
});

/** Ping 消息 */
export const PingMessageSchema = z.object({
    type: z.literal(SYSTEM_PING),
});

/** Pong 消息 */
export const PongMessageSchema = z.object({
    type: z.literal(SYSTEM_PONG),
});

/** 下钻结果消息 */
export const DrillResultMessageSchema = z.object({
    type: z.literal(E2W_DRILL_RESULT),
    payload: z.object({
        ok: z.boolean(),
        path: z.string(),
        error: z.string().optional(),
    }),
});

/** Webview → Extension 所有消息的联合类型 */
export const WebviewToExtensionMessageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal(SYSTEM_WEBVIEW_READY) }),
    PingMessageSchema,
    DrillMessageSchema,
    DrillUpMessageSchema,
    AnalyzeFileMessageSchema,
    OpenFileMessageSchema,
    z.object({ type: z.literal(W2E_REVEAL_IN_EXPLORER), payload: PathPayloadSchema }),
    z.object({ type: z.literal(W2E_NODE_CLICK), payload: z.any() }),
    z.object({ type: z.literal(W2E_NODE_DOUBLE_CLICK), payload: z.any() }),
    z.object({ type: z.literal(W2E_NODE_MOVED), payload: z.any() }),
    z.object({ type: z.literal(W2E_OPEN_SOURCE), payload: z.any() }),
    z.object({ type: z.literal(W2E_ERROR), payload: z.any() }),
]);

/** Extension → Webview 所有消息的联合类型 */
export const ExtensionToWebviewMessageSchema = z.discriminatedUnion('type', [
    PongMessageSchema,
    DrillResultMessageSchema,
    z.object({ type: z.literal(E2W_INIT_GRAPH), payload: z.any() }),
    z.object({ type: z.literal(E2W_SHOW_ANALYSIS_CARD), payload: z.any() }),
    z.object({ type: z.literal(E2W_UPDATE_ANALYSIS_CARD), payload: z.any() }),
    z.object({ type: z.literal(E2W_ANALYSIS_ERROR), payload: z.any() }),
]);

// ========== TypeScript 类型导出 ==========

export type WebviewToExtensionMessage = z.infer<typeof WebviewToExtensionMessageSchema>;
export type ExtensionToWebviewMessage = z.infer<typeof ExtensionToWebviewMessageSchema>;
export type DrillMessage = z.infer<typeof DrillMessageSchema>;
export type DrillUpMessage = z.infer<typeof DrillUpMessageSchema>;
export type AnalyzeFileMessage = z.infer<typeof AnalyzeFileMessageSchema>;
export type DrillResultMessage = z.infer<typeof DrillResultMessageSchema>;

// ========== 辅助函数 ==========

/**
 * 安全解析消息（带类型校验）
 * 
 * @param raw - 原始消息对象
 * @returns 解析结果，失败返回 null 并打印错误
 * 
 * @example
 * ```typescript
 * const msg = parseWebviewMessage(rawMessage);
 * if (msg?.type === W2E_DRILL) {
 *   console.log('下钻到:', msg.payload.path);
 * }
 * ```
 */
export function parseWebviewMessage(raw: unknown): WebviewToExtensionMessage | null {
    const result = WebviewToExtensionMessageSchema.safeParse(raw);
    if (!result.success) {
        console.error('[Protocol] 消息解析失败:', result.error.format());
        return null;
    }
    return result.data;
}

/**
 * 安全解析扩展消息
 */
export function parseExtensionMessage(raw: unknown): ExtensionToWebviewMessage | null {
    const result = ExtensionToWebviewMessageSchema.safeParse(raw);
    if (!result.success) {
        console.error('[Protocol] 消息解析失败:', result.error.format());
        return null;
    }
    return result.data;
}

/**
 * 创建类型安全的消息构建器
 */
export const MessageBuilder = {
    /** 创建下钻消息 */
    drill: (path: string): DrillMessage => ({
        type: W2E_DRILL,
        payload: { path },
    }),

    /** 创建上钻消息 */
    drillUp: (path?: string): DrillUpMessage => ({
        type: W2E_DRILL_UP,
        payload: path ? { path } : undefined,
    }),

    /** 创建分析文件消息 */
    analyzeFile: (path: string, force = false): AnalyzeFileMessage => ({
        type: W2E_ANALYZE_FILE,
        payload: { path, force },
    }),

    /** 创建 Ping 消息 */
    ping: () => ({
        type: SYSTEM_PING,
    }),

    /** 创建 Pong 消息 */
    pong: () => ({
        type: SYSTEM_PONG,
    }),

    /** 创建下钻结果消息 */
    drillResult: (ok: boolean, path: string, error?: string): DrillResultMessage => ({
        type: E2W_DRILL_RESULT,
        payload: { ok, path, error },
    }),
};
