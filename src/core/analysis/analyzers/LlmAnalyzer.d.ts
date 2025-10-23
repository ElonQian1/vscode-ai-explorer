import { AnalysisResult } from '../AnalysisOrchestrator';
import { ModelRouter } from '../model/ModelRouter';
/**
 * 🤖 LLM分析器 - 基于大语言模型的智能总结
 *
 * 功能：生成面向人类的自然语言总结，理解代码意图和业务逻辑
 * 策略：仅在必要时触发，避免过度使用API
 */
export declare class LlmAnalyzer {
    private router;
    constructor(router: ModelRouter);
    analyze(filePath: string, astResult: AnalysisResult): Promise<AnalysisResult>;
    private isDirectory;
    private readFileContent;
    /**
     * 📁 LLM分析目录
     */
    private analyzeDirWithLlm;
    /**
     * 📝 构建文件分析Prompt
     */
    private buildPrompt;
    /**
     * 📁 构建目录分析Prompt
     */
    private buildDirPrompt;
    /**
     * 🎯 默认文件分析Prompt
     */
    private getDefaultFilePrompt;
    /**
     * 📁 默认目录分析Prompt
     */
    private getDefaultDirPrompt;
    /**
     * ✂️ 截断内容避免Token超限
     */
    private truncateContent;
    /**
     * 🔍 解析LLM响应
     */
    private parseLlmResponse;
}
