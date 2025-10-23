import { AnalysisResult } from '../AnalysisOrchestrator';
/**
 * 🎯 启发式分析器 - 基于文件名、路径、扩展名的快速推测
 *
 * 优势：毫秒级响应，适合悬停即时显示
 * 覆盖：文件类型识别、目录角色推测、常见配置文件识别
 */
export declare class HeuristicAnalyzer {
    analyze(filePath: string): Promise<AnalysisResult>;
    private isDirectory;
    /**
     * 📁 目录启发式分析
     */
    private analyzeDirHeuristics;
    /**
     * 📄 文件启发式分析
     */
    private analyzeFileHeuristics;
    /**
     * 🎯 特定文件名分析
     */
    private getSpecificFileAnalysis;
    /**
     * 🔧 扩展名分析
     */
    private getExtensionAnalysis;
    /**
     * 🔍 JS/TS 文件细分分析
     */
    private analyzeJsTs;
    /**
     * 🌐 根据扩展名获取语言
     */
    private getLanguageByExtension;
}
