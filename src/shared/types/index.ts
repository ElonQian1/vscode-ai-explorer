// src/shared/types/index.ts
// [module: shared] [tags: Types, Interfaces, Common]
/**
 * 共享类型定义文件
 * 供所有模块使用的通用类型和接口
 */

export interface ModuleConfig {
    moduleId: string;
    name: string;
    scope: string[];
    entry: string[];
    searchTags: string[];
}

export interface AIRequest {
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface AIResponse {
    content: string;
    model?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface TranslationRequest {
    text: string;
    sourceLanguage?: string;
    targetLanguage: string;
    context?: string;
}

export interface TranslationResult {
    original: string;
    translated: string;
    confidence?: number;
    cached?: boolean;
    source?: 'dictionary' | 'rule' | 'ai' | 'cache' | 'fallback' | 'error';
    timestamp?: number;
}

export interface FileNode {
    path: string;
    name: string;
    alias?: string;
    type: 'file' | 'directory';
    children?: FileNode[];
}

export interface UMLNode {
    id: string;
    label: string;
    type: 'class' | 'interface' | 'function' | 'method' | 'property';
    visibility: 'public' | 'private' | 'protected';
    position?: { x: number; y: number };
}

export interface UMLEdge {
    from: string;
    to: string;
    type: 'extends' | 'implements' | 'uses' | 'calls';
    label?: string;
}

export interface UMLGraph {
    nodes: UMLNode[];
    edges: UMLEdge[];
    metadata?: {
        filePath: string;
        language: string;
        generatedAt: Date;
    };
}