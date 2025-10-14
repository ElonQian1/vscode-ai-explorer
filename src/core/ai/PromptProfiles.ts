// src/core/ai/PromptProfiles.ts
// [module: core] [tags: Prompt, Template, Profile, AI]
/**
 * AI 提示模板配置
 * 为不同功能模块提供优化的提示词模板
 */

export interface PromptProfile {
    id: string;
    name: string;
    description: string;
    temperature: number;
    maxTokens: number;
    model?: string;
    systemPrompt: string;
    userPromptTemplate: string;
}

export class PromptProfiles {
    private static profiles: Map<string, PromptProfile> = new Map();

    static {
        // 注册内置提示配置
        this.registerProfile({
            id: 'file-translation',
            name: '文件名翻译',
            description: '将英文文件名翻译为中文，保持简洁和专业性',
            temperature: 0.3,
            maxTokens: 200,
            systemPrompt: `你是一个专业的文件名翻译助手。你的任务是将英文文件名翻译为简洁、准确的中文。

规则：
1. 保持技术术语的准确性（如 API、HTTP、JSON 等可保留英文）
2. 文件扩展名不翻译
3. 避免过度翻译，保持可读性
4. 优先使用常见的中文技术术语
5. 保持简洁，避免冗长的描述

输出格式：只返回翻译后的文件名，不需要解释。`,
            userPromptTemplate: '请将以下文件名翻译为中文：\n{{filename}}\n\n上下文（文件夹结构）：\n{{context}}'
        });

        this.registerProfile({
            id: 'uml-generation',
            name: 'UML 图表生成',
            description: '分析代码结构并生成 UML 图表描述',
            temperature: 0.2,
            maxTokens: 1500,
            systemPrompt: `你是一个代码分析专家，专门生成 UML 类图和关系图。

分析任务：
1. 识别代码中的类、接口、函数、方法
2. 分析类之间的继承、实现、依赖关系
3. 提取方法的可见性（public、private、protected）
4. 生成标准的 UML 描述

输出格式：返回 JSON 格式的 UML 图表数据，包含：
- nodes: 节点列表（类、接口、函数等）
- edges: 关系列表（继承、实现、调用等）
- metadata: 元数据（语言、文件路径等）

请确保输出的 JSON 格式正确，可以直接解析。`,
            userPromptTemplate: '请分析以下{{language}}代码，生成 UML 图表数据：\n\n文件路径：{{filePath}}\n\n代码内容：\n```{{language}}\n{{code}}\n```'
        });

        this.registerProfile({
            id: 'code-comment-translation',
            name: '代码注释翻译',
            description: '将代码注释翻译为中文，用于 UML 图表的中文标签',
            temperature: 0.4,
            maxTokens: 800,
            systemPrompt: `你是一个代码注释翻译专家，负责将英文注释和标识符翻译为简洁的中文。

规则：
1. 保持技术术语的准确性
2. 类名、方法名翻译要简洁明了
3. 保持编程概念的准确性
4. 适合在图表中显示的简短标签

输出格式：返回 JSON 对象，包含原文和译文的映射关系。`,
            userPromptTemplate: '请翻译以下代码元素的名称和注释：\n{{elements}}\n\n上下文：{{context}}'
        });
    }

    /**
     * 注册提示配置
     */
    static registerProfile(profile: PromptProfile): void {
        this.profiles.set(profile.id, profile);
    }

    /**
     * 获取提示配置
     */
    static getProfile(id: string): PromptProfile | null {
        return this.profiles.get(id) || null;
    }

    /**
     * 获取所有配置
     */
    static getAllProfiles(): PromptProfile[] {
        return Array.from(this.profiles.values());
    }

    /**
     * 渲染提示模板
     */
    static renderPrompt(profileId: string, variables: Record<string, string>): {
        systemPrompt: string;
        userPrompt: string;
        profile: PromptProfile;
    } | null {
        const profile = this.getProfile(profileId);
        if (!profile) {
            return null;
        }

        let userPrompt = profile.userPromptTemplate;
        
        // 替换模板变量
        Object.entries(variables).forEach(([key, value]) => {
            const placeholder = `{{${key}}}`;
            userPrompt = userPrompt.replace(new RegExp(placeholder, 'g'), value);
        });

        return {
            systemPrompt: profile.systemPrompt,
            userPrompt,
            profile
        };
    }

    /**
     * 为特定模块创建缓存键
     */
    static createCacheKey(profileId: string, variables: Record<string, string>): string {
        const variableHash = Object.entries(variables)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${this.hashString(v)}`)
            .join('|');
        
        return `${profileId}:${this.hashString(variableHash)}`;
    }

    private static hashString(str: string): string {
        let hash = 0;
        if (str.length === 0) {
            return hash.toString();
        }
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash).toString(36);
    }
}