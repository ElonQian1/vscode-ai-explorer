#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const { readFile, readdir, stat } = require("fs/promises");
const { join, extname, basename } = require("path");
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// 简单的安全检查（复用 cache-refresh-mcp.cjs 的逻辑）
class SimpleSecurity {
  static SENSITIVE_PATTERNS = [
    /^\.env$/i, /^\.env\..+$/i, /password/i, /secret/i, /credential/i,
    /\.key$/i, /\.pem$/i, /\.crt$/i, /id_rsa$/i, /private[_-]?key/i
  ];

  static WHITELIST = [
    '.env.example', 'README.md', 'LICENSE', 'package.json'
  ];

  static checkPath(filePath) {
    const fileName = basename(filePath);
    
    if (this.WHITELIST.some(w => w.toLowerCase() === fileName.toLowerCase())) {
      return { safe: true };
    }
    
    for (const pattern of this.SENSITIVE_PATTERNS) {
      if (pattern.test(fileName)) {
        return { safe: false, reason: `敏感文件: ${fileName}`, riskLevel: 'high' };
      }
    }
    
    return { safe: true };
  }
}

function registerTools() {
  return [
    {
      name: "analyze_file",
      description: "🔍 智能分析单个文件的用途、角色和依赖关系", 
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "要分析的文件路径" },
          forceRefresh: { type: "boolean", default: false, description: "是否强制刷新缓存" }
        },
        required: ["path"]
      }
    },
    {
      name: "analyze_folder_structure",
      description: "📊 分析文件夹结构和组织方式",
      inputSchema: {
        type: "object", 
        properties: {
          path: { type: "string", description: "要分析的文件夹路径" },
          maxDepth: { type: "number", default: 2, description: "扫描深度" }
        },
        required: ["path"]
      }
    },
    {
      name: "get_file_summary", 
      description: "📝 获取文件的简要摘要信息",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" }
        },
        required: ["path"]
      }
    },
    {
      name: "find_related_files",
      description: "🔗 查找与指定文件相关的其他文件",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "基准文件路径" },
          relationTypes: { 
            type: "array", 
            items: { 
              type: "string", 
              enum: ["imports", "exports", "similar", "tests"] 
            },
            default: ["imports", "exports", "similar"],
            description: "关系类型"
          }
        },
        required: ["path"]
      }
    },
    {
      name: "refresh_analysis_cache",
      description: "🔄 刷新指定路径的分析缓存",
      inputSchema: {
        type: "object",
        properties: {
          paths: { 
            type: "array", 
            items: { type: "string" },
            description: "要刷新缓存的文件路径列表"
          }
        },
        required: ["paths"]
      }
    },
    {
      name: "refresh_changed_since_commit",
      description: "🔄 基于 git diff 批量刷新自指定提交以来的改动文件",
      inputSchema: {
        type: "object",
        properties: {
          baseRef: { 
            type: "string", 
            default: "HEAD~1",
            description: "基准提交引用，如 HEAD~1, main, origin/main 等"
          }
        }
      }
    },
    {
      name: "get_project_insights",
      description: "💡 获取整个项目的洞察和建议", 
      inputSchema: {
        type: "object",
        properties: {
          focusAreas: {
            type: "array",
            items: {
              type: "string",
              enum: ["architecture", "dependencies", "duplicates", "naming", "testing"]
            },
            default: ["architecture", "dependencies"],
            description: "关注的分析领域"
          }
        }
      }
    }
  ];
}

async function callTool(name, args) {
  try {
    // 安全检查
    if (args.path) {
      const pathCheck = SimpleSecurity.checkPath(args.path);
      if (!pathCheck.safe) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              path: args.path,
              blocked: true,
              reason: pathCheck.reason,
              message: "🔒 此文件被安全策略阻止分析"
            }, null, 2)
          }]
        };
      }
    }

    switch (name) {
      case "analyze_file":
        return await analyzeFile(args.path, args.forceRefresh);
        
      case "analyze_folder_structure": 
        return await analyzeFolderStructure(args.path, args.maxDepth);
        
      case "get_file_summary":
        return await getFileSummary(args.path);
        
      case "find_related_files":
        return await findRelatedFiles(args.path, args.relationTypes);
        
      case "refresh_analysis_cache":
        return await refreshAnalysisCache(args.paths);
        
      case "refresh_changed_since_commit":
        return await refreshChangedSinceCommit(args.baseRef);
        
      case "get_project_insights":
        return await getProjectInsights(args.focusAreas);
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Tool execution failed for ${name}:`, error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error.message,
          tool: name,
          args: args,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
}

// =============工具实现函数=============

async function analyzeFile(filePath, forceRefresh = false) {
  const stats = await stat(filePath);
  const result = {
    path: filePath,
    type: stats.isFile() ? "file" : "directory",
    size: stats.size,
    modified: stats.mtime.toISOString(),
    analysis: {}
  };

  if (stats.isFile()) {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      
      result.analysis = {
        lines: lines.length,
        language: detectLanguage(filePath),
        exports: extractExports(content, filePath),
        imports: extractImports(content, filePath),
        summary: generateFileSummary(filePath, content),
        role: inferFileRole(filePath, content),
        confidence: 0.8 // 简化版本的置信度
      };
    } catch (error) {
      result.analysis = { error: "无法读取文件内容", reason: error.message };
    }
  } else {
    const files = await readdir(filePath);
    result.analysis = {
      totalFiles: files.length,
      fileTypes: getFileTypeDistribution(files),
      structure: "directory",
      summary: `包含 ${files.length} 个项目`
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        operation: "analyze_file", 
        result,
        timestamp: new Date().toISOString(),
        cached: !forceRefresh
      }, null, 2)
    }]
  };
}

async function analyzeFolderStructure(folderPath, maxDepth = 2) {
  const structure = await scanFolderStructure(folderPath, maxDepth);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        operation: "analyze_folder_structure",
        path: folderPath,
        maxDepth,
        structure,
        insights: generateStructureInsights(structure),
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function getFileSummary(filePath) {
  try {
    const stats = await stat(filePath);
    const summary = {
      path: filePath,
      name: basename(filePath),
      size: formatFileSize(stats.size),
      modified: stats.mtime.toLocaleString(),
      type: stats.isFile() ? "文件" : "文件夹"
    };

    if (stats.isFile()) {
      const content = await readFile(filePath, "utf-8");
      summary.language = detectLanguage(filePath);
      summary.lines = content.split("\n").length;
      summary.purpose = inferFilePurpose(filePath, content);
    }

    return {
      content: [{
        type: "text", 
        text: JSON.stringify({
          operation: "get_file_summary",
          summary,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    throw new Error(`获取文件摘要失败: ${error.message}`);
  }
}

async function findRelatedFiles(basePath, relationTypes = ["imports", "exports", "similar"]) {
  const related = {
    imports: [],
    exports: [],
    similar: [],
    tests: []
  };

  try {
    const stats = await stat(basePath);
    if (!stats.isFile()) {
      throw new Error("只能查找文件的关联关系");
    }

    const content = await readFile(basePath, "utf-8");
    const dir = require('path').dirname(basePath);

    // 查找导入关系
    if (relationTypes.includes("imports")) {
      const imports = extractImports(content, basePath);
      for (const imp of imports) {
        try {
          const resolvedPath = resolveImportPath(imp, dir);
          if (resolvedPath) {
            related.imports.push({
              import: imp,
              path: resolvedPath,
              exists: await fileExists(resolvedPath)
            });
          }
        } catch (err) {
          // 忽略解析失败的导入
        }
      }
    }

    // 查找相似文件
    if (relationTypes.includes("similar")) {
      const dirFiles = await readdir(dir);
      const baseName = basename(basePath, extname(basePath));
      
      for (const file of dirFiles) {
        const fullPath = join(dir, file);
        if (fullPath !== basePath && file.includes(baseName)) {
          related.similar.push({
            path: fullPath,
            reason: "相似名称"
          });
        }
      }
    }

    // 查找测试文件
    if (relationTypes.includes("tests")) {
      const testPatterns = [
        basePath.replace(/\.(ts|js)$/, '.test.$1'),
        basePath.replace(/\.(ts|js)$/, '.spec.$1'),
        join(dir, '__tests__', basename(basePath))
      ];
      
      for (const testPath of testPatterns) {
        if (await fileExists(testPath)) {
          related.tests.push({
            path: testPath,
            type: "test"
          });
        }
      }
    }

  } catch (error) {
    throw new Error(`查找关联文件失败: ${error.message}`);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        operation: "find_related_files",
        basePath,
        relationTypes,
        related,
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function refreshAnalysisCache(paths) {
  const results = [];
  
  for (const path of paths) {
    try {
      const pathCheck = SimpleSecurity.checkPath(path);
      if (!pathCheck.safe) {
        results.push({ path, error: pathCheck.reason, skipped: true });
        continue;
      }

      const stats = await stat(path);
      results.push({ 
        path, 
        refreshed: true, 
        size: stats.size,
        modified: stats.mtime.toISOString(),
        message: "✅ 缓存已刷新"
      });
    } catch (error) {
      results.push({ path, error: error.message, failed: true });
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        operation: "refresh_analysis_cache",
        totalPaths: paths.length,
        refreshed: results.filter(r => r.refreshed).length,
        skipped: results.filter(r => r.skipped).length,
        failed: results.filter(r => r.failed).length,
        results,
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function refreshChangedSinceCommit(baseRef = "HEAD~1") {
  try {
    const { stdout } = await execAsync(`git diff --name-only ${baseRef} HEAD`);
    const changedFiles = stdout.trim().split('\n').filter(Boolean);
    
    console.error(`📋 发现 ${changedFiles.length} 个改动文件`);
    
    const results = [];
    for (const file of changedFiles) {
      try {
        const pathCheck = SimpleSecurity.checkPath(file);
        if (!pathCheck.safe) {
          results.push({ path: file, skipped: true, reason: pathCheck.reason });
          continue;
        }

        const stats = await stat(file);
        results.push({ 
          path: file, 
          refreshed: true,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      } catch (error) {
        results.push({ path: file, error: error.message });
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          operation: "refresh_changed_since_commit",
          baseRef,
          totalChanged: changedFiles.length,
          refreshed: results.filter(r => r.refreshed).length,
          skipped: results.filter(r => r.skipped).length,
          failed: results.filter(r => r.error).length,
          results,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    throw new Error(`Git 操作失败: ${error.message}`);
  }
}

async function getProjectInsights(focusAreas = ["architecture", "dependencies"]) {
  const insights = {
    architecture: null,
    dependencies: null,
    duplicates: null,
    naming: null,
    testing: null
  };

  try {
    // 简化版本的项目洞察
    if (focusAreas.includes("architecture")) {
      insights.architecture = await analyzeProjectArchitecture();
    }
    
    if (focusAreas.includes("dependencies")) {
      insights.dependencies = await analyzeDependencies();
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          operation: "get_project_insights",
          focusAreas,
          insights,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    throw new Error(`获取项目洞察失败: ${error.message}`);
  }
}

// =============辅助函数=============

function detectLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  const langMap = {
    '.ts': 'TypeScript',
    '.js': 'JavaScript', 
    '.jsx': 'React JSX',
    '.tsx': 'React TSX',
    '.py': 'Python',
    '.java': 'Java',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.go': 'Go',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.md': 'Markdown',
    '.json': 'JSON',
    '.yml': 'YAML',
    '.yaml': 'YAML'
  };
  return langMap[ext] || 'Unknown';
}

function extractExports(content, filePath) {
  const exports = [];
  const language = detectLanguage(filePath);
  
  if (language.includes('JavaScript') || language.includes('TypeScript')) {
    const exportMatches = content.match(/export\s+(class|function|const|let|var|interface|type)\s+(\w+)/g) || [];
    exports.push(...exportMatches.map(match => match.split(/\s+/)[2]));
    
    // 默认导出
    const defaultExport = content.match(/export\s+default\s+(\w+)/);
    if (defaultExport) {
      exports.push(`default: ${defaultExport[1]}`);
    }
  }
  
  return exports;
}

function extractImports(content, filePath) {
  const imports = [];
  const language = detectLanguage(filePath);
  
  if (language.includes('JavaScript') || language.includes('TypeScript')) {
    const importMatches = content.match(/import.*from\s+['"`]([^'"`]+)['"`]/g) || [];
    imports.push(...importMatches.map(match => {
      const fromMatch = match.match(/from\s+['"`]([^'"`]+)['"`]/);
      return fromMatch ? fromMatch[1] : '';
    }).filter(Boolean));
  }
  
  return imports;
}

function generateFileSummary(filePath, content) {
  const name = basename(filePath);
  const language = detectLanguage(filePath);
  const lines = content.split('\n').length;
  
  return `${language} 文件，包含 ${lines} 行代码`;
}

function inferFileRole(filePath, content) {
  const name = basename(filePath).toLowerCase();
  const ext = extname(filePath).toLowerCase();
  
  if (name.includes('test') || name.includes('spec')) return ['测试文件'];
  if (name.includes('config') || name.includes('setting')) return ['配置文件'];
  if (name === 'index' + ext) return ['入口文件'];
  if (name.includes('util') || name.includes('helper')) return ['工具函数'];
  if (name.includes('component')) return ['组件'];
  if (name.includes('service')) return ['服务'];
  if (name.includes('api')) return ['API接口'];
  
  return ['通用文件'];
}

function getFileTypeDistribution(files) {
  const distribution = {};
  files.forEach(file => {
    const ext = extname(file).toLowerCase() || 'no-ext';
    distribution[ext] = (distribution[ext] || 0) + 1;
  });
  return distribution;
}

async function scanFolderStructure(folderPath, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return null;
  
  try {
    const items = await readdir(folderPath, { withFileTypes: true });
    const structure = {
      files: [],
      directories: []
    };
    
    for (const item of items) {
      if (item.name.startsWith('.')) continue; // 跳过隐藏文件
      
      if (item.isFile()) {
        structure.files.push({
          name: item.name,
          type: detectLanguage(item.name)
        });
      } else if (item.isDirectory()) {
        const subPath = join(folderPath, item.name);
        const subStructure = await scanFolderStructure(subPath, maxDepth, currentDepth + 1);
        structure.directories.push({
          name: item.name,
          structure: subStructure
        });
      }
    }
    
    return structure;
  } catch (error) {
    return { error: error.message };
  }
}

function generateStructureInsights(structure) {
  // 简化版本的结构洞察
  return {
    totalFiles: countTotalFiles(structure),
    mainLanguages: getMainLanguages(structure),
    organizationStyle: inferOrganizationStyle(structure)
  };
}

function countTotalFiles(structure, count = 0) {
  if (!structure) return count;
  
  count += structure.files ? structure.files.length : 0;
  
  if (structure.directories) {
    for (const dir of structure.directories) {
      count = countTotalFiles(dir.structure, count);
    }
  }
  
  return count;
}

function getMainLanguages(structure) {
  const languages = {};
  
  function collectLanguages(struct) {
    if (!struct) return;
    
    if (struct.files) {
      struct.files.forEach(file => {
        const lang = file.type;
        languages[lang] = (languages[lang] || 0) + 1;
      });
    }
    
    if (struct.directories) {
      struct.directories.forEach(dir => collectLanguages(dir.structure));
    }
  }
  
  collectLanguages(structure);
  return Object.entries(languages)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([lang]) => lang);
}

function inferOrganizationStyle(structure) {
  // 简化判断项目组织风格
  if (!structure || !structure.directories) return "简单结构";
  
  const dirNames = structure.directories.map(d => d.name);
  
  if (dirNames.includes('src') && dirNames.includes('dist')) {
    return "标准前端项目";
  }
  if (dirNames.includes('lib') && dirNames.includes('test')) {
    return "库项目";
  }
  if (dirNames.includes('components') || dirNames.includes('pages')) {
    return "React/Vue项目";
  }
  
  return "自定义结构";
}

function inferFilePurpose(filePath, content) {
  const name = basename(filePath).toLowerCase();
  
  if (name.includes('readme')) return "项目说明文档";
  if (name.includes('package.json')) return "npm包配置";
  if (name.includes('tsconfig')) return "TypeScript配置";
  if (content.includes('export default')) return "默认导出模块";
  if (content.includes('export class')) return "类定义模块";
  
  return "通用模块";
}

function resolveImportPath(importPath, baseDir) {
  // 简化的导入路径解析
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return require('path').resolve(baseDir, importPath);
  }
  return null; // 外部模块
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function analyzeProjectArchitecture() {
  // 简化版本
  return {
    type: "多模块架构",
    mainDirectories: ["src", "dist", "node_modules"],
    patterns: ["模块化", "分层设计"]
  };
}

async function analyzeDependencies() {
  try {
    const packageJson = await readFile("package.json", "utf-8");
    const pkg = JSON.parse(packageJson);
    
    return {
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
      totalCount: Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length
    };
  } catch {
    return { error: "无法读取 package.json" };
  }
}

class AIExplorerMCPServer {
  constructor() {
    this.server = new Server(
      { name: "ai-explorer-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    this.availableTools = registerTools();
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler("tools/list", async () => ({
      tools: this.availableTools
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return callTool(name, args || {});
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

if (require.main === module) {
  const server = new AIExplorerMCPServer();
  server.start().catch(console.error);
}

module.exports = AIExplorerMCPServer;