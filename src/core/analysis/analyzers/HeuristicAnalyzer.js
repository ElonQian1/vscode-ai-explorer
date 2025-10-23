// src/core/analysis/analyzers/HeuristicAnalyzer.ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
/**
 * 🎯 启发式分析器 - 基于文件名、路径、扩展名的快速推测
 *
 * 优势：毫秒级响应，适合悬停即时显示
 * 覆盖：文件类型识别、目录角色推测、常见配置文件识别
 */
export class HeuristicAnalyzer {
    async analyze(filePath) {
        const fileName = path.basename(filePath).toLowerCase();
        const dirName = path.dirname(filePath);
        const ext = path.extname(fileName);
        const isDirectory = await this.isDirectory(filePath);
        const analysis = isDirectory
            ? this.analyzeDirHeuristics(filePath, fileName)
            : this.analyzeFileHeuristics(filePath, fileName, ext);
        return {
            path: filePath,
            summary: analysis.summary,
            role: analysis.roles,
            language: analysis.language,
            exports: [],
            deps: [],
            related: [],
            version: 'heuristic.v1',
            timestamp: Date.now(),
            source: 'heuristic'
        };
    }
    async isDirectory(filePath) {
        try {
            const stat = await fs.stat(filePath);
            return stat.isDirectory();
        }
        catch {
            // 如果无法访问，基于路径判断（没有扩展名通常是目录）
            return !path.extname(filePath);
        }
    }
    /**
     * 📁 目录启发式分析
     */
    analyzeDirHeuristics(filePath, dirName) {
        const lowerDir = dirName.toLowerCase();
        // 源码目录
        if (lowerDir.includes('src') || lowerDir.includes('source')) {
            return { summary: '源代码目录', roles: ['源码'], language: undefined };
        }
        // 测试目录
        if (lowerDir.includes('test') || lowerDir.includes('spec') || lowerDir.includes('__test__')) {
            return { summary: '测试文件目录', roles: ['测试'], language: undefined };
        }
        // 文档目录
        if (lowerDir.includes('doc') || lowerDir.includes('docs') || lowerDir === 'documentation') {
            return { summary: '文档目录', roles: ['文档'], language: undefined };
        }
        // 配置目录
        if (lowerDir.includes('config') || lowerDir.includes('conf') || lowerDir === 'settings') {
            return { summary: '配置文件目录', roles: ['配置'], language: undefined };
        }
        // 库文件目录
        if (lowerDir.includes('lib') || lowerDir.includes('library') || lowerDir === 'vendor') {
            return { summary: '库文件目录', roles: ['库'], language: undefined };
        }
        // 资源目录
        if (lowerDir.includes('asset') || lowerDir.includes('resource') || lowerDir.includes('static') || lowerDir.includes('public')) {
            return { summary: '资源文件目录', roles: ['资源'], language: undefined };
        }
        // 工具目录
        if (lowerDir.includes('util') || lowerDir.includes('helper') || lowerDir.includes('tool')) {
            return { summary: '工具类目录', roles: ['工具函数'], language: undefined };
        }
        // UI组件目录
        if (lowerDir.includes('component') || lowerDir.includes('widget') || lowerDir.includes('ui')) {
            return { summary: 'UI组件目录', roles: ['组件'], language: undefined };
        }
        // 服务目录
        if (lowerDir.includes('service') || lowerDir.includes('api') || lowerDir.includes('server')) {
            return { summary: '服务层目录', roles: ['服务'], language: undefined };
        }
        // 数据模型目录
        if (lowerDir.includes('model') || lowerDir.includes('entity') || lowerDir.includes('schema')) {
            return { summary: '数据模型目录', roles: ['类型定义'], language: undefined };
        }
        // 构建目录
        if (lowerDir.includes('build') || lowerDir.includes('dist') || lowerDir.includes('out')) {
            return { summary: '构建输出目录', roles: ['构建'], language: undefined };
        }
        // 脚本目录
        if (lowerDir.includes('script') || lowerDir.includes('bin')) {
            return { summary: '脚本目录', roles: ['脚本'], language: undefined };
        }
        return { summary: '普通目录', roles: [], language: undefined };
    }
    /**
     * 📄 文件启发式分析
     */
    analyzeFileHeuristics(filePath, fileName, ext) {
        // 特定文件名识别
        const specificFiles = this.getSpecificFileAnalysis(fileName);
        if (specificFiles)
            return specificFiles;
        // 扩展名分析
        return this.getExtensionAnalysis(fileName, ext);
    }
    /**
     * 🎯 特定文件名分析
     */
    getSpecificFileAnalysis(fileName) {
        const fileMap = {
            'package.json': { summary: 'Node.js 项目配置文件', roles: ['配置'], language: 'json' },
            'tsconfig.json': { summary: 'TypeScript 编译配置', roles: ['配置'], language: 'json' },
            'webpack.config.js': { summary: 'Webpack 打包配置', roles: ['配置'], language: 'javascript' },
            'vite.config.js': { summary: 'Vite 构建配置', roles: ['配置'], language: 'javascript' },
            'rollup.config.js': { summary: 'Rollup 打包配置', roles: ['配置'], language: 'javascript' },
            '.gitignore': { summary: 'Git 忽略文件配置', roles: ['配置'] },
            '.gitattributes': { summary: 'Git 属性配置', roles: ['配置'] },
            'readme.md': { summary: '项目说明文档', roles: ['文档'], language: 'markdown' },
            'changelog.md': { summary: '变更日志文档', roles: ['文档'], language: 'markdown' },
            'contributing.md': { summary: '贡献指南文档', roles: ['文档'], language: 'markdown' },
            'license': { summary: '开源许可证', roles: ['文档'] },
            'dockerfile': { summary: 'Docker 容器配置', roles: ['配置'] },
            'docker-compose.yml': { summary: 'Docker Compose 配置', roles: ['配置'], language: 'yaml' },
            '.env': { summary: '环境变量配置', roles: ['配置'] },
            '.env.example': { summary: '环境变量模板', roles: ['配置'] },
            'makefile': { summary: '构建脚本配置', roles: ['脚本'] },
            '.eslintrc.js': { summary: 'ESLint 代码检查配置', roles: ['配置'], language: 'javascript' },
            '.prettierrc': { summary: 'Prettier 代码格式配置', roles: ['配置'], language: 'json' },
            'jest.config.js': { summary: 'Jest 测试框架配置', roles: ['配置'], language: 'javascript' },
        };
        return fileMap[fileName] || null;
    }
    /**
     * 🔧 扩展名分析
     */
    getExtensionAnalysis(fileName, ext) {
        // 测试文件检测
        if (fileName.includes('test') || fileName.includes('spec') || fileName.includes('.test.') || fileName.includes('.spec.')) {
            const lang = this.getLanguageByExtension(ext);
            return { summary: '测试文件', roles: ['测试'], language: lang };
        }
        // 配置文件检测
        if (fileName.includes('config') || fileName.includes('setting') || fileName.includes('conf.')) {
            const lang = this.getLanguageByExtension(ext);
            return { summary: '配置模块', roles: ['配置'], language: lang };
        }
        // 基于扩展名的通用分析
        switch (ext) {
            case '.ts':
            case '.js':
                return this.analyzeJsTs(fileName);
            case '.tsx':
            case '.jsx':
                return { summary: 'React 组件文件', roles: ['组件'], language: ext === '.tsx' ? 'typescript' : 'javascript' };
            case '.vue':
                return { summary: 'Vue 组件文件', roles: ['组件'], language: 'vue' };
            case '.css':
            case '.scss':
            case '.sass':
            case '.less':
                return { summary: '样式表文件', roles: ['样式'], language: ext.slice(1) };
            case '.html':
            case '.htm':
                return { summary: 'HTML 页面文件', roles: ['页面'], language: 'html' };
            case '.md':
            case '.markdown':
                return { summary: 'Markdown 文档', roles: ['文档'], language: 'markdown' };
            case '.json':
                return { summary: 'JSON 数据文件', roles: ['配置'], language: 'json' };
            case '.yml':
            case '.yaml':
                return { summary: 'YAML 配置文件', roles: ['配置'], language: 'yaml' };
            case '.sql':
                return { summary: 'SQL 数据库脚本', roles: ['脚本'], language: 'sql' };
            case '.py':
                return { summary: 'Python 脚本', roles: ['脚本'], language: 'python' };
            case '.java':
                return { summary: 'Java 类文件', roles: ['类'], language: 'java' };
            case '.rs':
                return { summary: 'Rust 源码文件', roles: ['源码'], language: 'rust' };
            case '.go':
                return { summary: 'Go 源码文件', roles: ['源码'], language: 'go' };
            case '.php':
                return { summary: 'PHP 脚本文件', roles: ['脚本'], language: 'php' };
            case '.rb':
                return { summary: 'Ruby 脚本文件', roles: ['脚本'], language: 'ruby' };
            default:
                return { summary: `${ext || '未知类型'} 文件`, roles: [], language: undefined };
        }
    }
    /**
     * 🔍 JS/TS 文件细分分析
     */
    analyzeJsTs(fileName) {
        const lower = fileName.toLowerCase();
        const language = fileName.endsWith('.ts') ? 'typescript' : 'javascript';
        if (lower.includes('util') || lower.includes('helper')) {
            return { summary: '工具函数模块', roles: ['工具函数'], language };
        }
        if (lower.includes('service') || lower.includes('api')) {
            return { summary: '服务层逻辑', roles: ['服务'], language };
        }
        if (lower.includes('component') || lower.includes('widget')) {
            return { summary: '组件模块', roles: ['组件'], language };
        }
        if (lower.includes('model') || lower.includes('entity') || lower.includes('type')) {
            return { summary: '数据模型定义', roles: ['类型定义'], language };
        }
        if (lower.includes('router') || lower.includes('route')) {
            return { summary: '路由配置', roles: ['配置'], language };
        }
        if (lower.includes('index') || lower === 'main.js' || lower === 'app.js') {
            return { summary: '入口文件', roles: ['入口'], language };
        }
        return { summary: `${language === 'typescript' ? 'TypeScript' : 'JavaScript'} 模块`, roles: [], language };
    }
    /**
     * 🌐 根据扩展名获取语言
     */
    getLanguageByExtension(ext) {
        const langMap = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascript',
            '.tsx': 'typescript',
            '.vue': 'vue',
            '.py': 'python',
            '.java': 'java',
            '.rs': 'rust',
            '.go': 'go',
            '.php': 'php',
            '.rb': 'ruby',
            '.css': 'css',
            '.scss': 'scss',
            '.sass': 'sass',
            '.less': 'less',
            '.html': 'html',
            '.md': 'markdown',
            '.json': 'json',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.sql': 'sql'
        };
        return langMap[ext];
    }
}
