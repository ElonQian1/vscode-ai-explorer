// src/shared/utils/MarkdownRenderer.ts
/**
 * 🎨 Markdown渲染工具
 * 为AI Explorer提供统一的Markdown解析和渲染功能
 */

import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

export class MarkdownRenderer {
    private static instance: MarkdownRenderer;
    
    private constructor() {
        this.configureMarked();
    }
    
    public static getInstance(): MarkdownRenderer {
        if (!MarkdownRenderer.instance) {
            MarkdownRenderer.instance = new MarkdownRenderer();
        }
        return MarkdownRenderer.instance;
    }
    
    /**
     * 配置marked解析器
     */
    private configureMarked(): void {
        // 使用marked-highlight扩展配置语法高亮
        marked.use(markedHighlight({
            highlight(code: string, language: string) {
                if (language && hljs.getLanguage(language)) {
                    try {
                        return hljs.highlight(code, { language }).value;
                    } catch (err) {
                        console.warn('代码高亮失败:', err);
                    }
                }
                return hljs.highlightAuto(code).value;
            }
        }));

        // 配置其他选项
        marked.setOptions({
            breaks: true, // 支持GFM换行
            gfm: true,    // 启用GitHub Flavored Markdown
        });
    }
    
    /**
     * 渲染Markdown为HTML
     */
    public renderToHtml(markdown: string): string {
        if (!markdown || typeof markdown !== 'string') {
            return '';
        }
        
        try {
            // 使用marked.parse进行同步解析
            const result = marked.parse(markdown);
            // 如果返回Promise，则返回占位符（这种情况不应该出现在同步调用中）
            if (typeof result === 'string') {
                return result;
            } else {
                console.warn('marked返回了Promise，使用同步解析失败');
                return this.escapeHtml(markdown).replace(/\n/g, '<br>');
            }
        } catch (error) {
            console.error('Markdown渲染失败:', error);
            return `<p>渲染失败: ${this.escapeHtml(markdown)}</p>`;
        }
    }
    
    /**
     * 渲染纯文本，如果不是MD格式则直接返回
     */
    public renderText(text: string): string {
        if (!text) return '';
        
        // 检查是否包含MD语法
        if (this.containsMarkdown(text)) {
            return this.renderToHtml(text);
        } else {
            // 纯文本，添加基本的HTML转义和换行处理
            return this.escapeHtml(text).replace(/\n/g, '<br>');
        }
    }
    
    /**
     * 检查文本是否包含Markdown语法
     */
    private containsMarkdown(text: string): boolean {
        const markdownPatterns = [
            /\*\*.*?\*\*/,   // 粗体 **text**
            /\*.*?\*/,       // 斜体 *text*
            /`.*?`/,         // 行内代码 `code`
            /#{1,6}\s/,      // 标题 # ## ###
            /^\s*[-*+]\s/m,  // 列表 - * +
            /^\s*\d+\.\s/m,  // 数字列表 1. 2.
        ];
        
        return markdownPatterns.some(pattern => pattern.test(text));
    }
    
    /**
     * HTML转义
     */
    private escapeHtml(text: string): string {
        if (typeof document !== 'undefined') {
            // 浏览器环境
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        } else {
            // Node.js环境或无DOM环境，手动转义
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }
    }
    
    /**
     * 获取语法高亮CSS
     */
    public getHighlightCss(): string {
        // 使用GitHub风格的代码高亮主题
        return `
        /* Highlight.js GitHub theme */
        .hljs {
            background: #f8f8f8;
            color: #333;
            border-radius: 4px;
            padding: 8px 12px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.4;
        }
        
        .hljs-comment,
        .hljs-quote {
            color: #998;
            font-style: italic;
        }
        
        .hljs-keyword,
        .hljs-selector-tag,
        .hljs-subst {
            color: #333;
            font-weight: bold;
        }
        
        .hljs-number,
        .hljs-literal,
        .hljs-variable,
        .hljs-template-variable,
        .hljs-tag .hljs-attr {
            color: #008080;
        }
        
        .hljs-string,
        .hljs-doctag {
            color: #d14;
        }
        
        .hljs-title,
        .hljs-section,
        .hljs-selector-id {
            color: #900;
            font-weight: bold;
        }
        
        .hljs-subst {
            font-weight: normal;
        }
        
        .hljs-type,
        .hljs-class .hljs-title {
            color: #458;
            font-weight: bold;
        }
        
        .hljs-tag,
        .hljs-name,
        .hljs-attribute {
            color: #000080;
            font-weight: normal;
        }
        
        .hljs-regexp,
        .hljs-link {
            color: #009926;
        }
        
        .hljs-symbol,
        .hljs-bullet {
            color: #990073;
        }
        
        .hljs-built_in,
        .hljs-builtin-name {
            color: #0086b3;
        }
        
        .hljs-meta {
            color: #999;
            font-weight: bold;
        }
        
        .hljs-deletion {
            background: #fdd;
        }
        
        .hljs-addition {
            background: #dfd;
        }
        
        .hljs-emphasis {
            font-style: italic;
        }
        
        .hljs-strong {
            font-weight: bold;
        }
        `;
    }
}