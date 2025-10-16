// src/features/file-analysis/StaticAnalyzer.ts
// [module: file-analysis] [tags: Analysis, Static]
/**
 * 静态代码分析器
 * 负责解析代码结构,提取API、依赖等信息
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../../core/logging/Logger';
import { ApiSymbol, OutDependency, Evidence } from './types';

export class StaticAnalyzer {
    private logger: Logger;
    private evidenceCounter = 0;
    private evidenceMap: Record<string, Evidence> = {};

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 分析单个文件
     */
    public async analyzeFile(filePath: string): Promise<{
        api: ApiSymbol[];
        deps: { out: OutDependency[] };
        evidence: Record<string, Evidence>;
        contentHash: string;
        lang: string;
    }> {
        this.logger.info(`[StaticAnalyzer] 开始分析: ${filePath}`);
        this.evidenceCounter = 0;
        this.evidenceMap = {};

        try {
            // 读取文件内容
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(content).toString('utf8');

            // 计算内容哈希
            const contentHash = this.calculateHash(text);

            // 检测语言
            const lang = this.detectLanguage(filePath);

            // 根据语言选择分析策略
            let api: ApiSymbol[] = [];
            let deps: { out: OutDependency[] } = { out: [] };

            if (lang === 'typescript' || lang === 'javascript') {
                const result = await this.analyzeTypeScript(filePath, text);
                api = result.api;
                deps = result.deps;
            } else if (lang === 'python') {
                const result = await this.analyzePython(filePath, text);
                api = result.api;
                deps = result.deps;
            } else {
                // 其他语言使用通用分析
                const result = await this.analyzeGeneric(filePath, text);
                api = result.api;
                deps = result.deps;
            }

            this.logger.info(`[StaticAnalyzer] 分析完成: ${api.length} APIs, ${deps.out.length} deps`);

            return {
                api,
                deps,
                evidence: this.evidenceMap,
                contentHash,
                lang
            };
        } catch (error) {
            this.logger.error(`[StaticAnalyzer] 分析失败: ${filePath}`, error);
            throw error;
        }
    }

    /**
     * 分析 TypeScript/JavaScript 文件
     */
    private async analyzeTypeScript(filePath: string, content: string): Promise<{
        api: ApiSymbol[];
        deps: { out: OutDependency[] };
    }> {
        const api: ApiSymbol[] = [];
        const depsMap = new Map<string, { count: number; evidence: string[] }>();

        const lines = content.split('\n');

        // 提取 import 语句
        lines.forEach((line, idx) => {
            const importMatch = line.match(/import\s+.*?from\s+['"](.+?)['"]/);
            if (importMatch) {
                const moduleName = importMatch[1];
                const evidenceId = this.addEvidence(filePath, idx + 1, idx + 1, line);
                
                if (!depsMap.has(moduleName)) {
                    depsMap.set(moduleName, { count: 0, evidence: [] });
                }
                const dep = depsMap.get(moduleName)!;
                dep.count++;
                dep.evidence.push(evidenceId);
            }
        });

        // 提取导出的函数
        const functionRegex = /export\s+(async\s+)?function\s+(\w+)\s*\((.*?)\)/g;
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            const name = match[2];
            const params = match[3];
            const lineNum = content.substring(0, match.index).split('\n').length;
            const evidenceId = this.addEvidence(filePath, lineNum, lineNum, match[0]);

            api.push({
                name,
                kind: 'function',
                signature: `function ${name}(${params})`,
                evidence: [evidenceId],
                exported: true
            });
        }

        // 提取导出的类
        const classRegex = /export\s+class\s+(\w+)/g;
        while ((match = classRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split('\n').length;
            const evidenceId = this.addEvidence(filePath, lineNum, lineNum + 5, match[0]);

            api.push({
                name,
                kind: 'class',
                signature: `class ${name}`,
                evidence: [evidenceId],
                exported: true
            });
        }

        // 提取导出的接口
        const interfaceRegex = /export\s+interface\s+(\w+)/g;
        while ((match = interfaceRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split('\n').length;
            const evidenceId = this.addEvidence(filePath, lineNum, lineNum + 3, match[0]);

            api.push({
                name,
                kind: 'interface',
                signature: `interface ${name}`,
                evidence: [evidenceId],
                exported: true
            });
        }

        // 提取导出的类型别名
        const typeRegex = /export\s+type\s+(\w+)\s*=/g;
        while ((match = typeRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split('\n').length;
            const evidenceId = this.addEvidence(filePath, lineNum, lineNum, match[0]);

            api.push({
                name,
                kind: 'type',
                signature: `type ${name}`,
                evidence: [evidenceId],
                exported: true
            });
        }

        // 提取导出的常量
        const constRegex = /export\s+const\s+(\w+)/g;
        while ((match = constRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split('\n').length;
            const evidenceId = this.addEvidence(filePath, lineNum, lineNum, match[0]);

            api.push({
                name,
                kind: 'const',
                signature: `const ${name}`,
                evidence: [evidenceId],
                exported: true
            });
        }

        // 转换依赖Map为数组
        const deps = Array.from(depsMap.entries()).map(([module, data]) => ({
            module,
            count: data.count,
            evidence: data.evidence,
            isRelative: module.startsWith('.') || module.startsWith('/')
        }));

        return { api, deps: { out: deps } };
    }

    /**
     * 分析 Python 文件
     */
    private async analyzePython(filePath: string, content: string): Promise<{
        api: ApiSymbol[];
        deps: { out: OutDependency[] };
    }> {
        const api: ApiSymbol[] = [];
        const depsMap = new Map<string, { count: number; evidence: string[] }>();

        const lines = content.split('\n');

        // 提取 import 语句
        lines.forEach((line, idx) => {
            // import module
            const importMatch = line.match(/^import\s+(\w+)/);
            if (importMatch) {
                const moduleName = importMatch[1];
                const evidenceId = this.addEvidence(filePath, idx + 1, idx + 1, line);
                
                if (!depsMap.has(moduleName)) {
                    depsMap.set(moduleName, { count: 0, evidence: [] });
                }
                const dep = depsMap.get(moduleName)!;
                dep.count++;
                dep.evidence.push(evidenceId);
            }

            // from module import ...
            const fromMatch = line.match(/^from\s+(\w+)\s+import/);
            if (fromMatch) {
                const moduleName = fromMatch[1];
                const evidenceId = this.addEvidence(filePath, idx + 1, idx + 1, line);
                
                if (!depsMap.has(moduleName)) {
                    depsMap.set(moduleName, { count: 0, evidence: [] });
                }
                const dep = depsMap.get(moduleName)!;
                dep.count++;
                dep.evidence.push(evidenceId);
            }
        });

        // 提取函数定义
        const functionRegex = /^def\s+(\w+)\s*\((.*?)\)/gm;
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            const name = match[1];
            const params = match[2];
            const lineNum = content.substring(0, match.index).split('\n').length;
            const evidenceId = this.addEvidence(filePath, lineNum, lineNum, match[0]);

            api.push({
                name,
                kind: 'function',
                signature: `def ${name}(${params})`,
                evidence: [evidenceId],
                exported: !name.startsWith('_')
            });
        }

        // 提取类定义
        const classRegex = /^class\s+(\w+)/gm;
        while ((match = classRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split('\n').length;
            const evidenceId = this.addEvidence(filePath, lineNum, lineNum + 3, match[0]);

            api.push({
                name,
                kind: 'class',
                signature: `class ${name}`,
                evidence: [evidenceId],
                exported: !name.startsWith('_')
            });
        }

        const deps = Array.from(depsMap.entries()).map(([module, data]) => ({
            module,
            count: data.count,
            evidence: data.evidence,
            isRelative: module.startsWith('.')
        }));

        return { api, deps: { out: deps } };
    }

    /**
     * 通用分析 (用于其他语言)
     */
    private async analyzeGeneric(filePath: string, content: string): Promise<{
        api: ApiSymbol[];
        deps: { out: OutDependency[] };
    }> {
        // 通用分析暂时只返回基础信息
        this.logger.info(`[StaticAnalyzer] 使用通用分析: ${filePath}`);
        
        return {
            api: [],
            deps: { out: [] }
        };
    }

    /**
     * 添加证据
     */
    private addEvidence(file: string, startLine: number, endLine: number, code: string): string {
        const evidenceId = `ev${++this.evidenceCounter}`;
        const hash = crypto.createHash('sha256').update(code).digest('hex').substring(0, 16);
        
        this.evidenceMap[evidenceId] = {
            file,
            lines: [startLine, endLine],
            sha256: hash
        };
        
        return evidenceId;
    }

    /**
     * 计算文件内容哈希
     */
    private calculateHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * 检测文件语言
     */
    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const langMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.rs': 'rust',
            '.go': 'go',
            '.rb': 'ruby',
            '.php': 'php',
            '.cs': 'csharp',
            '.swift': 'swift',
            '.kt': 'kotlin'
        };
        return langMap[ext] || 'unknown';
    }
}
