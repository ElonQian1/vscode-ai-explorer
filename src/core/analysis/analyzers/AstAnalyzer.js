// src/core/analysis/analyzers/AstAnalyzer.ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
/**
 * 🔍 AST分析器 - 基于语法树的结构化分析
 *
 * 功能：提取导出、依赖、函数签名、类定义等结构化信息
 * 支持：JavaScript、TypeScript、JSON、Package.json 等
 */
export class AstAnalyzer {
    async analyze(filePath, heuristicResult) {
        try {
            const isDirectory = await this.isDirectory(filePath);
            if (isDirectory) {
                return this.analyzeDirStructure(filePath, heuristicResult);
            }
            const content = await fs.readFile(filePath, 'utf8');
            const ext = path.extname(filePath).toLowerCase();
            let structuredInfo;
            switch (ext) {
                case '.js':
                case '.ts':
                case '.jsx':
                case '.tsx':
                    structuredInfo = await this.analyzeJavaScriptTypeScript(content, filePath);
                    break;
                case '.json':
                    structuredInfo = await this.analyzeJson(content, filePath);
                    break;
                case '.vue':
                    structuredInfo = await this.analyzeVue(content);
                    break;
                case '.md':
                    structuredInfo = await this.analyzeMarkdown(content);
                    break;
                default:
                    // 对于其他文件类型，返回基础结构化信息
                    structuredInfo = {
                        exports: [],
                        deps: [],
                        summary: heuristicResult.summary,
                        related: []
                    };
            }
            return {
                ...heuristicResult,
                summary: structuredInfo.summary || heuristicResult.summary,
                exports: structuredInfo.exports,
                deps: structuredInfo.deps,
                related: structuredInfo.related,
                version: 'ast.v1',
                timestamp: Date.now(),
                source: 'ast'
            };
        }
        catch (error) {
            console.warn(`AST analysis failed for ${filePath}:`, error);
            // 返回启发式结果，但标记为AST尝试过
            return {
                ...heuristicResult,
                version: 'ast.failed',
                timestamp: Date.now(),
                source: 'ast'
            };
        }
    }
    async isDirectory(filePath) {
        try {
            const stat = await fs.stat(filePath);
            return stat.isDirectory();
        }
        catch {
            return false;
        }
    }
    /**
     * 📁 分析目录结构
     */
    async analyzeDirStructure(dirPath, heuristicResult) {
        try {
            const entries = await fs.readdir(dirPath);
            const files = entries.filter(entry => !entry.startsWith('.'));
            const subDirs = [];
            const relatedFiles = [];
            for (const entry of entries.slice(0, 20)) { // 限制数量避免过度分析
                try {
                    const entryPath = path.join(dirPath, entry);
                    const stat = await fs.stat(entryPath);
                    if (stat.isDirectory()) {
                        subDirs.push(entry);
                    }
                    else {
                        relatedFiles.push(entry);
                    }
                }
                catch {
                    // 忽略无法访问的文件
                }
            }
            // 增强目录总结
            let enhancedSummary = heuristicResult.summary;
            if (files.length > 0) {
                const hasComponents = relatedFiles.some(f => f.includes('component') || f.includes('Component'));
                const hasTests = relatedFiles.some(f => f.includes('test') || f.includes('spec'));
                const hasConfigs = relatedFiles.some(f => f.includes('config') || f.endsWith('.json'));
                if (hasComponents)
                    enhancedSummary += '，包含组件文件';
                if (hasTests)
                    enhancedSummary += '，包含测试文件';
                if (hasConfigs)
                    enhancedSummary += '，包含配置文件';
            }
            return {
                ...heuristicResult,
                summary: enhancedSummary,
                exports: subDirs,
                deps: [],
                related: relatedFiles.slice(0, 10), // 限制相关文件数量
                version: 'ast.v1',
                timestamp: Date.now(),
                source: 'ast'
            };
        }
        catch (error) {
            return heuristicResult;
        }
    }
    /**
     * 🔍 分析 JavaScript/TypeScript 文件
     */
    async analyzeJavaScriptTypeScript(content, filePath) {
        const exports = [];
        const deps = [];
        const related = [];
        let summary = '';
        // 简单的正则匹配（避免引入重量级 AST 解析器）
        // 1. 提取 export 声明
        const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:class\s+(\w+)|function\s+(\w+)|const\s+(\w+)|let\s+(\w+)|var\s+(\w+)|interface\s+(\w+)|type\s+(\w+))/g);
        for (const match of exportMatches) {
            const exportName = match[1] || match[2] || match[3] || match[4] || match[5] || match[6] || match[7];
            if (exportName)
                exports.push(exportName);
        }
        // 提取 export { ... } 形式
        const namedExports = content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g);
        for (const match of namedExports) {
            const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
            exports.push(...names);
        }
        // 2. 提取 import 依赖
        const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"](.*?)['"]/g);
        for (const match of importMatches) {
            const dep = match[1];
            if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
                deps.push(dep);
            }
        }
        // 3. 生成智能总结
        const fileName = path.basename(filePath, path.extname(filePath));
        if (exports.length > 0) {
            const mainExports = exports.slice(0, 3);
            if (exports.some(e => /Component|Widget/.test(e))) {
                summary = `${fileName} - React/Vue组件，导出: ${mainExports.join(', ')}`;
            }
            else if (exports.some(e => /Service|API|Client/.test(e))) {
                summary = `${fileName} - 服务模块，提供: ${mainExports.join(', ')}`;
            }
            else if (exports.some(e => /util|helper|tool/i.test(e))) {
                summary = `${fileName} - 工具函数，包含: ${mainExports.join(', ')}`;
            }
            else if (exports.some(e => /Type|Interface|Model/.test(e))) {
                summary = `${fileName} - 类型定义，声明: ${mainExports.join(', ')}`;
            }
            else {
                summary = `${fileName} - 模块，导出: ${mainExports.join(', ')}${exports.length > 3 ? ' 等' : ''}`;
            }
        }
        // 4. 查找相关文件（基于 import 中的相对路径）
        const relativeImports = content.matchAll(/import\s+.*?\s+from\s+['"](\..*?)['"]/g);
        for (const match of relativeImports) {
            const relativePath = match[1];
            const resolvedPath = path.resolve(path.dirname(filePath), relativePath);
            related.push(path.basename(resolvedPath));
        }
        return { exports, deps, summary, related };
    }
    /**
     * 📄 分析 JSON 文件
     */
    async analyzeJson(content, filePath) {
        try {
            const data = JSON.parse(content);
            const fileName = path.basename(filePath);
            let summary = '';
            let exports = [];
            let deps = [];
            if (fileName === 'package.json') {
                summary = `${data.name || 'Node.js项目'} - ${data.description || '项目配置'}`;
                exports = Object.keys(data.scripts || {});
                deps = Object.keys({ ...data.dependencies, ...data.devDependencies });
            }
            else if (fileName === 'tsconfig.json') {
                summary = 'TypeScript编译配置';
                exports = data.compilerOptions ? Object.keys(data.compilerOptions) : [];
            }
            else if (data && typeof data === 'object') {
                const keys = Object.keys(data).slice(0, 5);
                summary = `JSON配置文件，包含: ${keys.join(', ')}`;
                exports = keys;
            }
            return { exports, deps, summary, related: [] };
        }
        catch {
            return { exports: [], deps: [], summary: 'JSON文件（格式错误）', related: [] };
        }
    }
    /**
     * 🎨 分析 Vue 文件
     */
    async analyzeVue(content) {
        const exports = [];
        const deps = [];
        let summary = 'Vue组件';
        // 提取 component name
        const nameMatch = content.match(/name\s*:\s*['"](.*?)['"]/);
        if (nameMatch) {
            exports.push(nameMatch[1]);
            summary = `Vue组件: ${nameMatch[1]}`;
        }
        // 提取 props
        const propsMatch = content.match(/props\s*:\s*\{([^}]+)\}/);
        if (propsMatch) {
            const props = propsMatch[1].match(/(\w+)\s*:/g);
            if (props) {
                exports.push(...props.map(p => p.replace(':', '').trim()));
            }
        }
        // 提取 import 依赖
        const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"](.*?)['"]/g);
        for (const match of importMatches) {
            const dep = match[1];
            if (!dep.startsWith('.')) {
                deps.push(dep);
            }
        }
        return { exports, deps, summary, related: [] };
    }
    /**
     * 📝 分析 Markdown 文件
     */
    async analyzeMarkdown(content) {
        const exports = [];
        let summary = '';
        // 提取标题作为"导出"
        const headings = content.match(/^#+\s+(.*)$/gm);
        if (headings) {
            exports.push(...headings.map(h => h.replace(/^#+\s+/, '')).slice(0, 5));
        }
        // 生成总结
        const firstHeading = exports[0];
        if (firstHeading) {
            summary = `文档: ${firstHeading}`;
        }
        else {
            summary = 'Markdown文档';
        }
        // 查找链接作为"相关"
        const links = content.match(/\[([^\]]+)\]\(([^)]+)\)/g);
        const related = links ? links.map(link => {
            const match = link.match(/\[([^\]]+)\]/);
            return match ? match[1] : '';
        }).filter(Boolean).slice(0, 5) : [];
        return { exports, deps: [], summary, related };
    }
}
