import { AnalysisResult } from '../AnalysisOrchestrator';
/**
 * 🔍 AST分析器 - 基于语法树的结构化分析
 *
 * 功能：提取导出、依赖、函数签名、类定义等结构化信息
 * 支持：JavaScript、TypeScript、JSON、Package.json 等
 */
export declare class AstAnalyzer {
    analyze(filePath: string, heuristicResult: AnalysisResult): Promise<AnalysisResult>;
    private isDirectory;
    /**
     * 📁 分析目录结构
     */
    private analyzeDirStructure;
    /**
     * 🔍 分析 JavaScript/TypeScript 文件
     */
    private analyzeJavaScriptTypeScript;
    /**
     * 📄 分析 JSON 文件
     */
    private analyzeJson;
    /**
     * 🎨 分析 Vue 文件
     */
    private analyzeVue;
    /**
     * 📝 分析 Markdown 文件
     */
    private analyzeMarkdown;
}
