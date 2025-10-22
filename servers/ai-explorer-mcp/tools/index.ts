// servers/ai-explorer-mcp/tools/index.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  AnalysisOrchestrator,
  AnalysisResult,
} from "../../../src/core/analysis/AnalysisOrchestrator";
import { AstAnalyzer } from "../../../src/core/analysis/analyzers/AstAnalyzer";
import { HeuristicAnalyzer } from "../../../src/core/analysis/analyzers/HeuristicAnalyzer";
import { LlmAnalyzer } from "../../../src/core/analysis/analyzers/LlmAnalyzer";
import { AnalysisCache } from "../../../src/core/analysis/cache/AnalysisCache";
import { createModelRouter } from "../../../src/core/analysis/model/ModelRouter";

/**
 * 🛠️ MCP 工具注册器
 *
 * 为 GitHub Copilot 提供项目分析工具集
 */

// 全局分析器实例（延迟初始化）
let globalOrchestrator: AnalysisOrchestrator | null = null;

/**
 * 🏭 获取或创建全局分析器实例
 */
async function getOrchestrator(): Promise<AnalysisOrchestrator> {
  if (!globalOrchestrator) {
    // 获取工作区根目录
    const workspaceRoot = process.cwd();

    // 初始化组件
    const cache = new AnalysisCache(workspaceRoot);
    const heuristic = new HeuristicAnalyzer();
    const ast = new AstAnalyzer();
    const modelRouter = createModelRouter();
    const llm = new LlmAnalyzer(modelRouter);

    globalOrchestrator = new AnalysisOrchestrator(cache, heuristic, ast, llm);
    console.error(
      `Analysis orchestrator initialized for workspace: ${workspaceRoot}`
    );
  }

  return globalOrchestrator;
}

/**
 * 🔍 分析指定路径的文件或文件夹
 */
async function analyzePath(args: {
  path: string;
  force_refresh?: boolean;
}): Promise<AnalysisResult> {
  const { path: targetPath, force_refresh = false } = args;

  if (!targetPath) {
    throw new Error("路径参数是必需的");
  }

  // 验证路径存在性
  try {
    await fs.access(targetPath);
  } catch (error) {
    throw new Error(`路径不存在或无法访问: ${targetPath}`);
  }

  const orchestrator = await getOrchestrator();
  const result = await orchestrator.analyze(targetPath, force_refresh);

  console.error(
    `[MCP] Analyzed ${targetPath}: ${result.summary} (${result.source})`
  );
  return result;
}

/**
 * 📋 获取缓存的分析摘要
 */
async function getSummary(args: {
  path: string;
}): Promise<AnalysisResult | null> {
  const { path: targetPath } = args;

  if (!targetPath) {
    throw new Error("路径参数是必需的");
  }

  const orchestrator = await getOrchestrator();
  // 直接从缓存获取，不触发新分析
  const cached = await (orchestrator as any).cache.get(targetPath);

  if (cached) {
    console.error(`[MCP] Cache hit for ${targetPath}: ${cached.summary}`);
  } else {
    console.error(`[MCP] No cache found for ${targetPath}`);
  }

  return cached;
}

/**
 * 🔗 查找相关文件
 */
async function listRelated(args: {
  path: string;
  max_results?: number;
}): Promise<string[]> {
  const { path: targetPath, max_results = 10 } = args;

  if (!targetPath) {
    throw new Error("路径参数是必需的");
  }

  // 首先分析目标文件获取依赖信息
  const result = await analyzePath({ path: targetPath });

  const relatedPaths = new Set<string>();

  // 从分析结果中提取相关文件
  if (result.related) {
    result.related.forEach((rel) => relatedPaths.add(rel));
  }

  // 基于依赖查找相关文件
  if (result.deps) {
    for (const dep of result.deps) {
      // 尝试在项目中查找依赖对应的文件
      const possiblePaths = await findDepFiles(dep, path.dirname(targetPath));
      possiblePaths.forEach((p) => relatedPaths.add(p));
    }
  }

  // 查找同目录下的相关文件
  const dirPath = path.dirname(targetPath);
  const siblingFiles = await findSiblingFiles(targetPath, dirPath);
  siblingFiles.forEach((f) => relatedPaths.add(f));

  const results = Array.from(relatedPaths).slice(0, max_results);
  console.error(
    `[MCP] Found ${results.length} related files for ${targetPath}`
  );

  return results;
}

/**
 * 📊 获取项目概览
 */
async function getProjectOverview(args: {
  root_path: string;
  max_depth?: number;
}): Promise<{
  summary: string;
  key_files: AnalysisResult[];
  structure: any;
  stats: any;
}> {
  const { root_path: rootPath, max_depth = 3 } = args;

  if (!rootPath) {
    throw new Error("根路径参数是必需的");
  }

  // 扫描项目结构
  const structure = await scanProjectStructure(rootPath, max_depth);
  const keyFiles = await identifyKeyFiles(rootPath);

  // 分析关键文件
  const analyzedFiles: AnalysisResult[] = [];
  for (const filePath of keyFiles.slice(0, 10)) {
    // 限制分析数量
    try {
      const result = await analyzePath({ path: filePath });
      analyzedFiles.push(result);
    } catch (error) {
      console.error(`Failed to analyze ${filePath}:`, error);
    }
  }

  const orchestrator = await getOrchestrator();
  const stats = await orchestrator.getStats();

  // 生成项目摘要
  const summary = generateProjectSummary(analyzedFiles, structure);

  console.error(`[MCP] Generated project overview for ${rootPath}`);

  return {
    summary,
    key_files: analyzedFiles,
    structure,
    stats,
  };
}

/**
 * 🧹 清除缓存
 */
async function clearCache(args: {
  path?: string;
}): Promise<{ message: string; cleared: number }> {
  const orchestrator = await getOrchestrator();

  if (args.path) {
    // 清除特定路径的缓存
    await (orchestrator as any).cache.delete(args.path);
    console.error(`[MCP] Cleared cache for ${args.path}`);
    return { message: `已清除 ${args.path} 的缓存`, cleared: 1 };
  } else {
    // 清除全部缓存
    await (orchestrator as any).cache.clear();
    console.error("[MCP] Cleared all cache");
    return { message: "已清除全部缓存", cleared: -1 };
  }
}

// 辅助函数

/**
 * 🔍 查找依赖对应的文件
 */
async function findDepFiles(dep: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];

  // 如果是相对路径依赖
  if (dep.startsWith(".")) {
    const resolvedPath = path.resolve(baseDir, dep);
    const extensions = ["", ".js", ".ts", ".jsx", ".tsx", ".json"];

    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      try {
        await fs.access(fullPath);
        results.push(fullPath);
        break;
      } catch {
        // 文件不存在，继续尝试
      }
    }
  }

  return results;
}

/**
 * 📂 查找同目录相关文件
 */
async function findSiblingFiles(
  targetPath: string,
  dirPath: string
): Promise<string[]> {
  const results: string[] = [];
  const baseName = path.basename(targetPath, path.extname(targetPath));

  try {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      if (filePath === targetPath) continue;

      // 查找同名不同扩展名的文件
      const fileBaseName = path.basename(file, path.extname(file));
      if (fileBaseName === baseName || file.includes(baseName)) {
        results.push(filePath);
      }
    }
  } catch (error) {
    console.error(`Failed to read directory ${dirPath}:`, error);
  }

  return results;
}

/**
 * 🏗️ 扫描项目结构
 */
async function scanProjectStructure(
  rootPath: string,
  maxDepth: number
): Promise<any> {
  // 简化的结构扫描
  const structure: any = {
    name: path.basename(rootPath),
    type: "directory",
    children: [],
  };

  if (maxDepth <= 0) return structure;

  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });

    for (const entry of entries.slice(0, 20)) {
      // 限制数量
      if (entry.name.startsWith(".")) continue;

      const entryPath = path.join(rootPath, entry.name);
      const child: any = {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      };

      if (entry.isDirectory() && maxDepth > 1) {
        child.children = (
          await scanProjectStructure(entryPath, maxDepth - 1)
        ).children;
      }

      structure.children.push(child);
    }
  } catch (error) {
    console.error(`Failed to scan ${rootPath}:`, error);
  }

  return structure;
}

/**
 * 🔑 识别项目中的关键文件
 */
async function identifyKeyFiles(rootPath: string): Promise<string[]> {
  const keyFiles: string[] = [];

  // 预定义的关键文件
  const importantFiles = [
    "package.json",
    "tsconfig.json",
    "README.md",
    "LICENSE",
    "src/index.ts",
    "src/main.ts",
    "src/app.ts",
    "index.js",
    "main.js",
  ];

  for (const file of importantFiles) {
    const filePath = path.join(rootPath, file);
    try {
      await fs.access(filePath);
      keyFiles.push(filePath);
    } catch {
      // 文件不存在，跳过
    }
  }

  return keyFiles;
}

/**
 * 📝 生成项目摘要
 */
function generateProjectSummary(
  analyzedFiles: AnalysisResult[],
  structure: any
): string {
  const packageFile = analyzedFiles.find((f) =>
    f.path.endsWith("package.json")
  );
  const readmeFile = analyzedFiles.find((f) => f.path.endsWith("README.md"));

  let summary = "";

  if (packageFile) {
    summary += `这是一个 Node.js 项目。`;
  }

  if (readmeFile) {
    summary += `项目包含说明文档。`;
  }

  const languages = new Set(
    analyzedFiles.map((f) => f.language).filter(Boolean)
  );
  if (languages.size > 0) {
    summary += `主要使用 ${Array.from(languages).join(", ")} 语言。`;
  }

  const roles = analyzedFiles.flatMap((f) => f.role || []);
  const roleCount = roles.reduce((acc, role) => {
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topRoles = Object.entries(roleCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([role]) => role);

  if (topRoles.length > 0) {
    summary += `主要包含 ${topRoles.join("、")} 等文件。`;
  }

  return summary || "项目分析中...";
}

/**
 * 📋 注册所有MCP工具
 */
export async function registerTools(): Promise<
  Record<string, (args: any) => Promise<any>>
> {
  return {
    analyze_path: analyzePath,
    get_summary: getSummary,
    list_related: listRelated,
    get_project_overview: getProjectOverview,
    clear_cache: clearCache,
  };
}
