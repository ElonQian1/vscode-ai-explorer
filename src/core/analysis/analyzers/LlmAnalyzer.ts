// src/core/analysis/analyzers/LlmAnalyzer.ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AnalysisResult } from '../AnalysisOrchestrator';
import { ModelRouter } from '../model/ModelRouter';

/**
 * 🤖 LLM分析器 - 基于大语言模型的智能总结
 * 
 * 功能：生成面向人类的自然语言总结，理解代码意图和业务逻辑
 * 策略：仅在必要时触发，避免过度使用API
 */
export class LlmAnalyzer {
  
  constructor(private router: ModelRouter) {}

  async analyze(filePath: string, astResult: AnalysisResult): Promise<AnalysisResult> {
    try {
      const isDirectory = await this.isDirectory(filePath);
      
      if (isDirectory) {
        return this.analyzeDirWithLlm(filePath, astResult);
      }

      const content = await this.readFileContent(filePath);
      if (!content || content.length > 50000) { // 跳过空文件和超大文件
        return astResult;
      }

      const prompt = await this.buildPrompt();
      const llmResponse = await this.router.smartCall(prompt, {
        path: filePath,
        code: this.truncateContent(content),
        partial: {
          heuristic_summary: astResult.summary,
          role: astResult.role,
          exports: astResult.exports,
          deps: astResult.deps
        }
      });

      const parsed = this.parseLlmResponse(llmResponse);
      
      return {
        ...astResult,
        summary: parsed.summary || astResult.summary,
        role: parsed.role?.length ? parsed.role : astResult.role,
        language: parsed.language || astResult.language,
        exports: parsed.exports?.length ? parsed.exports : astResult.exports,
        deps: parsed.deps?.length ? parsed.deps : astResult.deps,
        related: parsed.related?.length ? parsed.related : astResult.related,
        version: 'llm.v1',
        timestamp: Date.now(),
        source: 'llm'
      };

    } catch (error) {
      console.warn(`LLM analysis failed for ${filePath}:`, error);
      return {
        ...astResult,
        version: 'llm.failed',
        timestamp: Date.now(),
        source: 'llm'
      };
    }
  }

  private async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async readFileContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return '';
    }
  }

  /**
   * 📁 LLM分析目录
   */
  private async analyzeDirWithLlm(dirPath: string, astResult: AnalysisResult): Promise<AnalysisResult> {
    try {
      // 读取目录内容概览
      const entries = await fs.readdir(dirPath);
      const fileTypes = new Map<string, number>();
      
      for (const entry of entries.slice(0, 50)) {
        const ext = path.extname(entry).toLowerCase();
        fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
      }

      const prompt = await this.buildDirPrompt();
      const llmResponse = await this.router.smartCall(prompt, {
        path: dirPath,
        files: entries.slice(0, 20),
        fileTypes: Object.fromEntries(fileTypes),
        partial: astResult
      });

      const parsed = this.parseLlmResponse(llmResponse);
      
      return {
        ...astResult,
        summary: parsed.summary || astResult.summary,
        role: parsed.role?.length ? parsed.role : astResult.role,
        version: 'llm.v1',
        timestamp: Date.now(),
        source: 'llm'
      };
    } catch (error) {
      return astResult;
    }
  }

  /**
   * 📝 构建文件分析Prompt
   */
  private async buildPrompt(): Promise<string> {
    try {
      const promptPath = path.join(process.cwd(), 'prompts', 'file_summary.system.txt');
      return await fs.readFile(promptPath, 'utf8');
    } catch {
      // 回退到内置prompt
      return this.getDefaultFilePrompt();
    }
  }

  /**
   * 📁 构建目录分析Prompt
   */
  private async buildDirPrompt(): Promise<string> {
    try {
      const promptPath = path.join(process.cwd(), 'prompts', 'dir_summary.system.txt');
      return await fs.readFile(promptPath, 'utf8');
    } catch {
      return this.getDefaultDirPrompt();
    }
  }

  /**
   * 🎯 默认文件分析Prompt
   */
  private getDefaultFilePrompt(): string {
    return `你是"代码文件用途判定器"。输入：文件路径、源码片段、启发式/AST 提示。
产出 JSON（严格）：{"summary", "role", "language", "exports", "deps", "related"}

规则：
- summary: 用一句中文概括这个文件是干嘛的（≤30字，给非程序员看）
- role: 从 ["入口","页面","组件","服务","工具函数","配置","类型定义","样式","测试","脚本"] 中选择（数组）
- language: 编程语言（小写）
- exports: 主要导出的函数/类名（数组，最多5个）
- deps: 重要的外部依赖包名（数组，最多8个）
- related: 相关文件名（数组，最多5个）

约束：
- 不编造：看不到的信息留空数组
- 输出严格JSON格式，不要额外文字
- summary要通俗易懂，避免技术术语

输入：
文件路径: {{path}}
源码内容: {{code}}
初步分析: {{partial}}`;
  }

  /**
   * 📁 默认目录分析Prompt
   */
  private getDefaultDirPrompt(): string {
    return `你是"目录用途判定器"。分析目录结构，输出JSON。

产出格式：{"summary", "role", "language", "exports", "deps", "related"}

规则：
- summary: 这个目录是干嘛的（≤25字）
- role: 从 ["源码","测试","文档","配置","构建","资源","工具"] 中选（数组）
- exports: 子目录名称（数组）
- related: 重要文件名（数组，最多5个）

输入：
目录路径: {{path}}
文件列表: {{files}}
文件类型统计: {{fileTypes}}
初步分析: {{partial}}`;
  }

  /**
   * ✂️ 截断内容避免Token超限
   */
  private truncateContent(content: string): string {
    const maxLength = 8000; // 约2000 tokens
    
    if (content.length <= maxLength) {
      return content;
    }

    // 保留开头和结尾
    const headLength = Math.floor(maxLength * 0.7);
    const tailLength = maxLength - headLength - 100;
    
    const head = content.substring(0, headLength);
    const tail = content.substring(content.length - tailLength);
    
    return head + '\n\n/* ... 中间内容省略 ... */\n\n' + tail;
  }

  /**
   * 🔍 解析LLM响应
   */
  private parseLlmResponse(response: string): Partial<AnalysisResult> {
    try {
      // 尝试直接解析JSON
      const parsed = JSON.parse(response);
      return {
        summary: parsed.summary,
        role: Array.isArray(parsed.role) ? parsed.role : [],
        language: parsed.language,
        exports: Array.isArray(parsed.exports) ? parsed.exports : [],
        deps: Array.isArray(parsed.deps) ? parsed.deps : [],
        related: Array.isArray(parsed.related) ? parsed.related : []
      };
    } catch (error) {
      // 尝试从响应中提取JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            summary: parsed.summary,
            role: Array.isArray(parsed.role) ? parsed.role : [],
            language: parsed.language,
            exports: Array.isArray(parsed.exports) ? parsed.exports : [],
            deps: Array.isArray(parsed.deps) ? parsed.deps : [],
            related: Array.isArray(parsed.related) ? parsed.related : []
          };
        } catch {
          // JSON解析失败
        }
      }

      // 如果都失败了，尝试提取summary
      const summaryMatch = response.match(/summary['":\s]*([^,}\n]+)/i);
      if (summaryMatch) {
        return {
          summary: summaryMatch[1].replace(/['"]/g, '').trim()
        };
      }

      console.warn('Failed to parse LLM response:', response);
      return {};
    }
  }
}