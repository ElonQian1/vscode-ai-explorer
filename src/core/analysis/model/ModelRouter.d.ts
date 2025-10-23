export interface ChatModel {
    name: string;
    maxTokens: number;
    call(prompt: string, inputs: Record<string, any>): Promise<string>;
}
/**
 * 🤖 模型路由器 - OpenAI ↔ 混元双路智能切换
 *
 * 策略：
 * - 首选OpenAI（质量更稳定）
 * - 混元回退（性价比高，长文本友好）
 * - 自动检测配置可用性
 * - 智能错误恢复
 */
export declare class ModelRouter {
    private primary;
    private secondary;
    private primaryHealth;
    private secondaryHealth;
    private lastHealthCheck;
    private readonly healthCheckInterval;
    constructor(primary: ChatModel, secondary: ChatModel);
    smartCall(prompt: string, inputs: Record<string, any>): Promise<string>;
    /**
     * 🏥 健康检查
     */
    private checkHealth;
    /**
     * 🤔 决策是否优先使用备用模型
     */
    private shouldPreferSecondary;
    /**
     * 📊 获取模型状态
     */
    getStatus(): {
        primary: {
            name: string;
            healthy: boolean;
        };
        secondary: {
            name: string;
            healthy: boolean;
        };
    };
}
/**
 * 🔑 OpenAI模型实现
 */
export declare class OpenAIModel implements ChatModel {
    name: string;
    maxTokens: number;
    private apiKey;
    private baseUrl;
    constructor();
    call(prompt: string, inputs: Record<string, any>): Promise<string>;
    private formatInputs;
}
/**
 * 🇨🇳 腾讯混元模型实现
 */
export declare class HunyuanModel implements ChatModel {
    name: string;
    maxTokens: number;
    private secretId;
    private secretKey;
    private region;
    constructor();
    call(prompt: string, inputs: Record<string, any>): Promise<string>;
    private callDirectAPI;
    private formatInputs;
}
/**
 * 🏭 模型路由器工厂
 */
export declare function createModelRouter(): ModelRouter;
