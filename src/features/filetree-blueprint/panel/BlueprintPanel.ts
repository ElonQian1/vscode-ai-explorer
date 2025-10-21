// src/features/filetree-blueprint/panel/BlueprintPanel.ts
// [module: filetree-blueprint] [tags: Webview, Panel]
/**
 * 蓝图面板管理器
 * 负责创建和管理 Webview 面板，处理前后端消息通信
 */

import * as vscode from "vscode";
import * as path from "path";
import { Logger } from "../../../core/logging/Logger";
import { Graph, Node } from "../domain/FileTreeScanner";
import { FileAnalysisService } from "../../file-analysis/FileAnalysisService";
import { EnhancedAnalysisUseCase } from "../usecases/EnhancedAnalysisUseCase"; // ✅ 新增：引入增强分析用例
import {
  WebviewToExtension,
  ExtensionToWebview,
  createShowAnalysisCardMessage,
  createUpdateAnalysisCardMessage,
  createAnalysisErrorMessage,
  createUserNotesDataMessage,
  createUserNotesSavedMessage,
  EnhancedUserNotesDataMessage,
  EnhancedUserNotesSavedMessage,
} from "../../../shared/messages";
import {
  toAbsolute,
  getWorkspaceRelative,
} from "../../../shared/utils/pathUtils";
import {
  resolveTargetToFileAndRoot,
  toPosix,
  relativePosix,
  toAbsoluteUri,
} from "./resolveTarget";
import { generateWebviewHtml } from "./WebviewTemplate"; // ✅ 引入模板生成器
import {
  W2E_DRILL,
  W2E_DRILL_UP,
  SYSTEM_PING,
  SYSTEM_PONG,
  E2W_INIT_GRAPH,
  E2W_DRILL_RESULT,
} from "../../../shared/protocol"; // ✅ 引入协议常量
import { getWorkspaceRoot } from "../../../core/path/workspaceRoot"; // ✅ 引入统一工作区根服务
import { relToAbs } from "../../../core/path/pathMapper"; // ✅ 引入路径映射工具
import { getWebviewHtml, getNonce } from "../utils/webviewHost"; // ✅ 新增：引入CSP安全工具
import { PositionsStore } from "../storage/PositionsStore"; // ✅ Phase 1: 位置持久化
import { NotesStore } from "../storage/NotesStore"; // ✅ Phase 1: 备注持久化

/**
 * 面板状态：保存根目录、当前聚焦路径、导航栈等
 */
interface PanelState {
  /** 面板的根目录（必填，所有相对路径都基于此）*/
  rootUri: vscode.Uri;
  /** 当前聚焦的子目录（相对 rootUri 的 POSIX 路径，如 '/src/lib'）*/
  focusPath: string;
  /** 下钻/上钻导航栈 */
  navStack: string[];
  /** Webview 是否已就绪 */
  webviewReady: boolean;
  /** 消息队列（在 ready 之前排队）*/
  messageQueue: ExtensionToWebview[];
  /** ✨ M7: Feature 过滤器（文件路径列表，null 表示显示全部）*/
  featureFilter: string[] | null;
}

export class BlueprintPanel {
  private static currentPanel: BlueprintPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private logger: Logger;
  private currentGraph?: Graph;
  private extensionUri: vscode.Uri;
  private statusBarItem?: vscode.StatusBarItem;
  private fileAnalysisService: FileAnalysisService;
  private enhancedAnalysisUseCase: EnhancedAnalysisUseCase; // ✅ 新增：增强分析用例
  private context: vscode.ExtensionContext; // ✅ 新增：Extension Context

  // ✅ Phase 1: 持久化存储服务
  private positionsStore: PositionsStore;
  private notesStore: NotesStore;

  // ✅ Phase 7: 统一状态管理
  private state: PanelState;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    logger: Logger,
    context: vscode.ExtensionContext, // ✅ 新增参数
    rootUri: vscode.Uri // ✅ 接收根目录
  ) {
    this.panel = panel;
    this.logger = logger;
    this.extensionUri = extensionUri;
    this.context = context; // ✅ 保存context
    this.fileAnalysisService = new FileAnalysisService(logger);
    this.enhancedAnalysisUseCase = new EnhancedAnalysisUseCase(logger, context); // ✅ 初始化增强分析用例

    // ✅ Phase 1: 初始化持久化存储服务
    this.positionsStore = new PositionsStore(rootUri);
    this.notesStore = new NotesStore(rootUri, "default");
    this.logger.info(
      `[BlueprintPanel] 💾 初始化存储服务: ${this.positionsStore.getStorePath()}`
    );

    // ✅ 初始化状态
    this.state = {
      rootUri,
      focusPath: "/",
      navStack: ["/"],
      webviewReady: false,
      messageQueue: [],
      featureFilter: null, // ✨ M7: 默认不过滤，显示全部
    };

        // ✅ 使用CSP安全的HTML生成器（传递架构配置）
        const useNewArchitecture = vscode.workspace.getConfiguration('filetreeBlueprint').get<boolean>('useNewArchitecture', false); // 暂时默认false直到bundle.js修复
        this.panel.webview.html = getWebviewHtml(this.panel.webview, extensionUri, useNewArchitecture);    // 监听面板销毁
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // 处理来自 Webview 的消息
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    // 显示状态栏提示
    this.showStatusBarHint();
  }

  /**
   * 创建或显示蓝图面板
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    logger: Logger,
    context: vscode.ExtensionContext, // ✅ 新增：Extension Context
    targetUri?: vscode.Uri, // ✅ 第4个参数：目标 Uri
    title: string = "文件树蓝图" // ✅ 第5个参数：标题
  ): BlueprintPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // 如果已有面板，直接显示
    if (BlueprintPanel.currentPanel) {
      BlueprintPanel.currentPanel.panel.reveal(column);
      return BlueprintPanel.currentPanel;
    }

    // ✅ 解析根目录
    const rootUri = targetUri || vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootUri) {
      throw new Error("无法确定工作区根目录");
    }

    // 创建新面板
    const panel = vscode.window.createWebviewPanel(
      "fileTreeBlueprint",
      title,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "media"),
          vscode.Uri.joinPath(extensionUri, "out"),
        ],
      }
    );

    BlueprintPanel.currentPanel = new BlueprintPanel(
      panel,
      extensionUri,
      logger,
      context,
      rootUri
    ); // ✅ 传入 context 和 rootUri
    return BlueprintPanel.currentPanel;
  }

  /**
   * 显示图表数据
   */
  /**
   * 显示图数据
   * ✨ M7: 支持 Feature 过滤
   */
  public showGraph(graph: Graph): void {
    this.currentGraph = graph;

    // ✨ M7: 如果设置了 Feature 过滤器，进行过滤
    let filteredGraph = graph;
    if (this.state.featureFilter && this.state.featureFilter.length > 0) {
      filteredGraph = this.filterGraphByFeature(
        graph,
        this.state.featureFilter
      );
      this.logger.info(
        `[M7] Feature 过滤: ${graph.nodes.length} → ${filteredGraph.nodes.length} 个节点`
      );
    }

    this.panel.title = filteredGraph.title;

    // ✅ Phase 7: 使用安全发送（带队列）
    this.safePostMessage({
      type: "init-graph",
      payload: filteredGraph,
    });

    this.logger.info(
      `显示蓝图: ${filteredGraph.title} (${filteredGraph.nodes.length} 个节点)`
    );
  }

  /**
   * ✨ M7: 设置 Feature 过滤器
   * @param files 要显示的文件路径列表（null 表示显示全部）
   */
  public setFeatureFilter(files: string[] | null): void {
    this.state.featureFilter = files;

    if (files && files.length > 0) {
      this.logger.info(`[M7] 设置 Feature 过滤器: ${files.length} 个文件`);
    } else {
      this.logger.info(`[M7] 清除 Feature 过滤器，显示全部`);
    }

    // 如果当前已有图数据，重新渲染
    if (this.currentGraph) {
      this.showGraph(this.currentGraph);
    }
  }

  /**
   * 发送消息到 Webview (类型安全)
   * 已废弃：请使用 safePostMessage
   */
  private sendMessage(message: ExtensionToWebview): void {
    this.panel.webview.postMessage(message);
  }

  /**
   * ✅ Phase 7: 安全发送消息（带队列机制）
   * 在 Webview 未就绪时将消息加入队列，就绪后统一发送
   */
  private async safePostMessage(message: ExtensionToWebview): Promise<void> {
    if (!this.state.webviewReady) {
      this.state.messageQueue.push(message);
      this.logger.debug(`[UI] (defer) 排队消息: ${message.type}`, {
        queueLength: this.state.messageQueue.length,
      });
      return;
    }

    const ok = await this.panel.webview.postMessage(message);
    const hasPayload = "payload" in message ? "(有payload)" : "";
    this.logger.debug(
      `[UI] postMessage: ${message.type} ${ok ? "✅" : "❌"} ${hasPayload}`
    );

    if (!ok) {
      this.logger.warn(
        `[UI] ⚠️ 消息发送失败: ${message.type}，可能 Webview 已释放`
      );
    }
  }

  /**
   * ✅ Phase 7: 处理 Webview 就绪信号
   * 收到 webview-ready 后，立即发送所有排队消息
   */
  private async handleWebviewReady(): Promise<void> {
    this.logger.info(
      `[UI] 🎉 Webview 已就绪，开始发送排队消息: ${this.state.messageQueue.length} 条`
    );

    this.state.webviewReady = true;

    // 发送所有排队消息
    for (const msg of this.state.messageQueue) {
      const ok = await this.panel.webview.postMessage(msg);
      this.logger.debug(`[UI] 发送排队消息: ${msg.type} ${ok ? "✅" : "❌"}`);
    }

    // 清空队列
    this.state.messageQueue = [];

    this.logger.info("[UI] ✅ 排队消息发送完成");

    // ✅ 修复：如果已有 currentGraph，重新发送 init-graph（以防在 ready 之前就调用了 showGraph）
    if (this.currentGraph) {
      this.logger.info("[UI] 🔄 检测到已有图表数据，重新发送 init-graph");

      // ✅ Phase 1: 使用新的 PositionsStore 加载位置
      const savedPositions = await this.positionsStore.getAll();

      await this.safePostMessage({
        type: "init-graph",
        payload: {
          ...this.currentGraph,
          savedPositions, // 附带保存的位置
        },
      });

      // ✅ Phase 1: 发送位置数据（单独发送，避免混入 Graph）
      await this.sendSavedPositions();
    }
  }

  /**
   * 处理来自 Webview 的消息
   * 使用类型安全的消息契约
   */
  private async handleMessage(message: WebviewToExtension): Promise<void> {
    this.logger.debug(`收到 Webview 消息: ${message.type}`);

    switch (message.type) {
      case "webview-ready":
        // ✅ Phase 7: Webview 脚本已加载完成，可以发送消息了
        await this.handleWebviewReady();
        break;

      case "ready":
        // Webview 已就绪（旧的 ready 保留兼容性）
        if (this.currentGraph) {
          await this.safePostMessage({
            type: "init-graph",
            payload: this.currentGraph,
          });
        }
        break;

      case "node-click":
        await this.handleNodeClick(message.payload);
        break;

      case "node-double-click":
        await this.handleNodeDoubleClick(message.payload);
        break;

      case "drill":
        // 下钻到子文件夹
        await this.handleDrill(message.payload);
        break;

      case "drill-up":
        // 返回上一级
        await this.handleDrillUp();
        break;

      case "open-file":
        await this.openFile(message.payload.path);
        break;

      case "reveal-in-explorer":
        await this.revealInExplorer(message.payload.path);
        break;

      case "go-up":
        await this.handleGoUpDirectory(message.payload.currentPath);
        break;

      case "analyze-file":
        // 分析文件并返回FileCapsule
        await this.handleAnalyzeFile(message.payload);
        break;

      case "analysis-card-shown":
        // ✅ ACK: Webview确认已显示卡片
        this.logger.info(`[ACK] Webview 已显示卡片: ${message.payload?.file}`);
        break;

      case "ack:init-graph":
        // ✅ ACK: Webview确认已接收init-graph消息
        this.logger.debug("[ACK] Webview已确认init-graph");
        break;

      case "open-source":
        // 打开源文件并跳转到指定行
        await this.handleOpenSource(message.payload);
        break;

      case "node-moved":
        // 处理节点移动（手写图等场景）
        // 对于文件树蓝图,这个消息通常不需要处理
        this.logger.debug(
          `节点移动: ${message.payload.nodeId}`,
          message.payload.position
        );
        break;

      case "error":
        this.logger.error("Webview 错误:", message.payload);
        vscode.window.showErrorMessage(`蓝图错误: ${message.payload.message}`);
        break;

      case "save-user-notes":
        await this.handleSaveUserNotes(message.payload);
        break;

      case "get-user-notes":
        await this.handleGetUserNotes(message.payload);
        break;

      case "save-enhanced-user-notes":
        await this.handleSaveEnhancedUserNotes(message.payload);
        break;

      case "get-enhanced-user-notes":
        await this.handleGetEnhancedUserNotes(message.payload);
        break;

      case "card-moved":
        // ✅ Phase 1: 持久化卡片位置
        await this.handleCardMoved(message.payload);
        break;

      case "save-notes":
        // ✅ Phase 1: 保存备注
        await this.handleSaveNotes(message.payload);
        break;

      case "load-notes":
        // ✅ Phase 1: 加载备注
        await this.handleLoadNotes(message.payload);
        break;

      case "save-notes":
        // Priority 3: 持久化备注 (新版消息协议)
        await this.handleSaveNotes(message.payload);
        break;

      default:
        // ✅ 处理功能筛选变化 (临时绕过类型检查)
        if ((message as any).type === "filter-change") {
          await this.handleFilterChange((message as any).payload);
          break;
        }

        // 🔍 处理调试消息（开发模式专用）
        const debugMessage = message as any;
        if (debugMessage.type === "PING") {
          this.logger.debug("[Smoke] 收到 PING，回复 PONG");
          await this.panel.webview.postMessage({ type: "PONG" });
          return;
        }

        if (debugMessage.type === "REQUEST_INIT") {
          this.logger.info("[Init] 收到初始化请求，开始选根和生成图数据");
          await this.handleInitRequest();
          return;
        }

        // ✅ 忽略ACK消息，避免"未知消息类型"警告
        const msgType = debugMessage.type;
        if (
          msgType &&
          typeof msgType === "string" &&
          msgType.startsWith("ack:")
        ) {
          this.logger.debug(`[ACK] 忽略确认消息: ${msgType}`);
          return;
        }

        // TypeScript 确保所有消息类型都被处理
        const exhaustiveCheck: never = message;
        this.logger.warn(`未知消息类型:`, exhaustiveCheck);
    }
  }

  /**
   * 处理初始化请求：选根 + 生成初始图数据
   */
  private async handleInitRequest(): Promise<void> {
    try {
      // 1. 获取工作区根目录
      const root = await getWorkspaceRoot(this.context);
      if (!root) {
        this.logger.warn("[Init] 无法确定工作区根目录，发送失败结果");
        // 🔧 TODO: 统一错误消息格式
        return;
      }

      this.logger.info(`[Init] 选定工作区根: ${root.fsPath}`);

      // 2. ✅ 恢复真实的FileTreeScanner扫描
      const { FileTreeScanner } = await import("../domain/FileTreeScanner");
      const scanner = new FileTreeScanner(this.logger);
      const graph = await scanner.scanPathShallow(root, root);

      // 3. ✅ 按朋友建议补齐元数据，确保前端渲染器前置条件满足
      graph.metadata = {
        ...(graph.metadata ?? {}),
        graphType: "filetree", // 前端根据此字段绑定交互逻辑
      };

      // 4. 发送正确的消息契约 'init-graph'
      await this.panel.webview.postMessage({
        type: "init-graph",
        payload: graph,
      });

      // 5. 同时调用showGraph显示图表
      this.showGraph(graph);

      this.logger.info(
        `[Init] 初始化完成: ${graph.nodes.length} nodes, ${graph.edges.length} edges`
      );
    } catch (error) {
      this.logger.error("[Init] 初始化失败", error);
      // 🔧 TODO: 统一错误处理，暂时先确保图数据能正常显示
    }
  }

  /**
   * 处理节点点击
   */
  private async handleNodeClick(nodeData: any): Promise<void> {
    this.logger.debug(`节点被点击: ${nodeData.label}`);
    // 可以在状态栏显示节点信息
    vscode.window.setStatusBarMessage(`选中: ${nodeData.label}`, 3000);
  }

  /**
   * 处理节点双击（文件夹下钻）
   */
  private async handleNodeDoubleClick(nodeData: any): Promise<void> {
    this.logger.info(`节点被双击: ${nodeData.label} (${nodeData.type})`);

    if (nodeData.type === "folder" && nodeData.data) {
      // 如果是根节点，提示用户
      if (nodeData.data?.isRoot) {
        vscode.window.showInformationMessage(
          `当前已在 "${nodeData.label}" 目录中。双击子文件夹可下钻，点击"返回上级"可返回。`
        );
        return;
      }

      // 使用绝对路径（优先使用 absPath，回退到 path）
      const absPath = nodeData.data.absPath || nodeData.data.path;

      this.logger.info(`下钻到: ${absPath}`);

      vscode.commands.executeCommand(
        "filetreeBlueprint.openFromPath",
        vscode.Uri.file(absPath)
      );
    } else if (nodeData.type === "file" && nodeData.data) {
      // 获取绝对路径
      const absPath = nodeData.data.absPath || nodeData.data.path;

      // 如果 path 是相对路径，需要转换为绝对路径
      let filePath = absPath;
      if (
        !path.isAbsolute(absPath) &&
        this.currentGraph?.metadata?.workspaceRoot
      ) {
        filePath = toAbsolute(
          absPath,
          this.currentGraph.metadata.workspaceRoot
        );
      }

      await this.openFile(filePath);
    }
  }

  /**
   * 处理下钻到子文件夹（在同一面板内刷新）
   */
  private async handleDrill(payload: any): Promise<void> {
    const folderPath = payload?.path;

    this.logger.info(`[handleDrill] 收到下钻请求, payload:`, payload);
    this.logger.info(`[handleDrill] 提取的 folderPath:`, folderPath);

    if (!folderPath) {
      this.logger.warn("下钻消息缺少路径信息");
      return;
    }

    // ✅ 使用统一的工作区根服务
    const root = await getWorkspaceRoot(this.context);
    if (!root) {
      this.logger.warn("[handleDrill] 无法确定工作区根目录");
      vscode.window.showWarningMessage(
        "AI Explorer：未能识别工作区根目录，请选择一个根目录。"
      );
      return;
    }

    this.logger.info(`下钻到: ${folderPath}`);

    try {
      // ✅ 使用统一路径映射：相对路径 → 绝对路径
      const absFolder = relToAbs(folderPath, root);
      this.logger.info(`[handleDrill] 路径映射: ${folderPath} → ${absFolder}`);

      // 使用 FileTreeScanner 扫描子目录
      const { FileTreeScanner } = await import("../domain/FileTreeScanner");
      const scanner = new FileTreeScanner(this.logger);
      const target = vscode.Uri.file(absFolder);
      const graph = await scanner.scanPathShallow(target, root);

      // 在同一面板显示新图
      this.showGraph(graph);
      this.panel.title = `蓝图: ${path.basename(folderPath)}`;

      this.logger.info(`已刷新到子目录: ${absFolder}`);
    } catch (error) {
      this.logger.error("下钻失败", error);
      vscode.window.showErrorMessage(`无法打开文件夹: ${folderPath}`);
    }
  }

  /**
   * 处理返回上一级（在同一面板内刷新）
   */
  private async handleDrillUp(): Promise<void> {
    const currentPath = this.currentGraph?.metadata?.rootPath;

    if (!currentPath) {
      this.logger.warn("无法确定当前路径");
      return;
    }

    // ✅ 使用 state.rootUri 而不是从 metadata 获取
    const workspaceRoot = this.state.rootUri.fsPath;

    this.logger.info(
      `[handleDrillUp] 当前路径: ${currentPath}, 工作区根: ${workspaceRoot}`
    );

    // 如果已经是根目录，不能再往上
    if (currentPath === workspaceRoot) {
      vscode.window.showInformationMessage("已到达工作区根目录");
      return;
    }

    // 计算父目录
    const parentPath = path.dirname(currentPath);

    // 防止超出工作区根目录
    if (parentPath.length < workspaceRoot.length) {
      this.logger.warn("尝试超出工作区根目录，返回到工作区根");

      const { FileTreeScanner } = await import("../domain/FileTreeScanner");
      const scanner = new FileTreeScanner(this.logger);
      const graph = await scanner.scanPathShallow(
        this.state.rootUri,
        this.state.rootUri
      );

      this.showGraph(graph);
      this.panel.title = `蓝图: ${path.basename(workspaceRoot)}`;
      return;
    }

    // 打开父目录的蓝图
    this.logger.info(`返回到父目录: ${parentPath}`);

    try {
      const uri = vscode.Uri.file(parentPath);

      const { FileTreeScanner } = await import("../domain/FileTreeScanner");
      const scanner = new FileTreeScanner(this.logger);
      const graph = await scanner.scanPathShallow(uri, this.state.rootUri);

      this.showGraph(graph);
      this.panel.title = `蓝图: ${path.basename(parentPath)}`;

      this.logger.info(`已返回到上级目录: ${parentPath}`);
    } catch (error) {
      this.logger.error("返回上级失败", error);
      vscode.window.showErrorMessage("无法返回上级目录");
    }
  }

  /**
   * 处理返回上级目录
   */
  private async handleGoUpDirectory(currentPath: string): Promise<void> {
    this.logger.info(`返回上级目录，当前路径: ${currentPath}`);

    try {
      const workspaceRoot = this.currentGraph?.metadata?.workspaceRoot;

      if (!workspaceRoot) {
        vscode.window.showWarningMessage("无法确定工作区根目录");
        return;
      }

      // 如果已经是根目录，不能再往上
      if (currentPath === workspaceRoot || currentPath === "/") {
        vscode.window.showInformationMessage("已到达工作区根目录");
        return;
      }

      // 计算父目录
      const parentPath = path.dirname(currentPath);

      // 防止超出工作区根目录
      if (parentPath.length < workspaceRoot.length) {
        this.logger.warn("尝试超出工作区根目录");
        vscode.commands.executeCommand(
          "filetreeBlueprint.openFromPath",
          vscode.Uri.file(workspaceRoot)
        );
        return;
      }

      // 打开父目录的蓝图
      this.logger.info(`返回到父目录: ${parentPath}`);
      vscode.commands.executeCommand(
        "filetreeBlueprint.openFromPath",
        vscode.Uri.file(parentPath)
      );
    } catch (error) {
      this.logger.error("返回上级失败", error);
      vscode.window.showErrorMessage("无法返回上级目录");
    }
  }

  /**
   * 打开文件
   */
  private async openFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
      this.logger.info(`打开文件: ${filePath}`);
    } catch (error) {
      this.logger.error(`打开文件失败: ${filePath}`, error);
      vscode.window.showErrorMessage(
        `无法打开文件: ${path.basename(filePath)}`
      );
    }
  }

  /**
   * 处理文件分析请求
   *
   * 使用S3胶囊缓存系统:
   * 1. 缓存优先：先检查缓存，立即返回已有结果
   * 2. 静态分析：如果无缓存，执行静态分析并立即显示
   * 3. 后台AI分析：异步执行AI分析，完成后更新卡片
   * 4. 增量更新：AI结果不覆盖用户备注
   */
  private async handleAnalyzeFile(payload: any): Promise<void> {
    let filePath = payload?.path;
    const force = payload?.force || false;

    this.logger.info(`[S3缓存分析] 收到请求, path=${filePath}, force=${force}`);

    if (!filePath) {
      this.logger.warn("分析文件消息缺少路径信息");
      return;
    }

    // 如果传入的是相对路径，转换为绝对路径
    if (!path.isAbsolute(filePath)) {
      const workspaceRoot = this.currentGraph?.metadata?.workspaceRoot;

      if (!workspaceRoot) {
        this.logger.error(
          `[分析文件] 无法获取工作区根目录，currentGraph=${!!this.currentGraph}`
        );
        vscode.window.showErrorMessage(`无法分析文件：未找到工作区根目录`);
        return;
      }

      const oldPath = filePath;
      filePath = toAbsolute(filePath, workspaceRoot);
      this.logger.info(`[分析文件] 路径转换: ${oldPath} → ${filePath}`);
    }

    try {
      // ✅ 使用S3胶囊缓存系统的增强分析
      const result = await this.enhancedAnalysisUseCase.analyzeFile({
        filePath,
        forceRefresh: force,
        includeAI: true,
        progressCallback: async (stage, progress) => {
          this.logger.info(`[S3分析进度] ${filePath} - ${stage}: ${progress}%`);

          // ✅ 当AI分析完成时，获取最新数据并更新UI
          if (stage === "complete" && progress === 100) {
            try {
              const updatedResult =
                await this.enhancedAnalysisUseCase.analyzeFile({
                  filePath,
                  forceRefresh: false,
                  includeAI: false, // 只获取缓存，不重新分析
                });

              if (updatedResult.success && updatedResult.data) {
                const fileCapsule =
                  this.enhancedAnalysisUseCase.convertToFileCapsule(
                    updatedResult.data
                  );
                const updateMessage = createUpdateAnalysisCardMessage(
                  fileCapsule,
                  false
                );
                await this.safePostMessage(updateMessage);
                this.logger.info(
                  `[S3缓存UI] AI分析完成，已更新卡片: ${filePath}`
                );
              }
            } catch (error) {
              this.logger.warn(
                `[S3缓存UI] AI完成后更新失败: ${filePath}`,
                error
              );
            }
          }
        },
      });

      if (result.success && result.data) {
        // ✅ 立即发送分析结果（可能是缓存或静态分析）
        const fileCapsule = this.enhancedAnalysisUseCase.convertToFileCapsule(
          result.data
        );
        const isLoading =
          !result.data.ai || Object.keys(result.data.ai).length === 0;
        const showMessage = createShowAnalysisCardMessage(
          fileCapsule,
          isLoading
        );
        await this.safePostMessage(showMessage);

        this.logger.info(
          `[S3缓存UI] 已发送分析卡片: ${filePath}, 来源=${
            result.fromCache ? "缓存" : "实时分析"
          }, AI状态=${isLoading ? "加载中" : "已完成"}`
        );
      } else {
        throw new Error(result.error || "分析失败");
      }
    } catch (error) {
      this.logger.error(`[S3缓存分析] 分析失败: ${filePath}`, error);

      // ✅ 发送错误消息
      const errorMsg = createAnalysisErrorMessage(
        filePath,
        error instanceof Error ? error.message : "分析失败"
      );
      await this.safePostMessage(errorMsg);

      vscode.window.showErrorMessage(`分析失败: ${path.basename(filePath)}`);
    }
  }

  /**
   * 处理打开源文件请求
   */
  private async handleOpenSource(payload: any): Promise<void> {
    const filePath = payload?.file;
    const startLine = payload?.line || 1;
    const endLine = payload?.endLine || startLine;

    this.logger.info(`[打开源文件] ${filePath}:${startLine}-${endLine}`);

    if (!filePath) {
      this.logger.warn("打开源文件消息缺少路径信息");
      return;
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
      });

      // 跳转到指定行并高亮
      const range = new vscode.Range(
        new vscode.Position(startLine - 1, 0),
        new vscode.Position(endLine - 1, 999)
      );
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      this.logger.info(`已打开并跳转到: ${filePath}:${startLine}`);
    } catch (error) {
      this.logger.error(`打开源文件失败: ${filePath}`, error);
      vscode.window.showErrorMessage(
        `无法打开文件: ${path.basename(filePath)}`
      );
    }
  }

  /**
   * 检测文件语言
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      ".ts": "typescript",
      ".js": "javascript",
      ".py": "python",
      ".java": "java",
      ".cpp": "cpp",
      ".c": "c",
      ".rs": "rust",
      ".go": "go",
      ".rb": "ruby",
      ".php": "php",
    };
    return langMap[ext] || "unknown";
  }

  /**
   * 在资源管理器中显示
   */
  private async revealInExplorer(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand("revealInExplorer", uri);
      this.logger.info(`在资源管理器中显示: ${filePath}`);
    } catch (error) {
      this.logger.error(`显示失败: ${filePath}`, error);
    }
  }

  /**
   * 🚨 紧急修复：生成简化的HTML内容，确保画布能显示
   * ✨ Phase 2: 支持新架构切换（通过配置项控制）
   */
  private getEmergencyHtml(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const csp = webview.cspSource;

    // ✨ Phase 2: 读取配置，决定使用新架构还是旧架构
    const useNewArchitecture = vscode.workspace
      .getConfiguration("filetreeBlueprint")
      .get<boolean>("useNewArchitecture", true);
    this.logger.info(
      `[Phase 2] 使用架构: ${
        useNewArchitecture ? "新架构 (bundle.js)" : "旧架构 (graphView.js)"
      }`
    );

    // 🚨 修复：确保所有资源都用asWebviewUri转换
    const mediaBase = vscode.Uri.joinPath(
      extensionUri,
      "media",
      "filetree-blueprint"
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(mediaBase, "index.css")
    );

    // 生成 nonce 用于 CSP（必须在scriptTags之前定义）
    const nonce = getNonce();

    // 🔧 本地ELK引擎（避免CDN CSP拦截）
    const elkUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "vendor", "elk.bundled.js")
    );

    // ✨ Phase 2: 新架构所需模块（ES6模块化）
    let scriptTags = "";
    if (useNewArchitecture) {
      // ✨ M8: 使用打包后的 bundle.js（单文件，包含所有模块 + elk）
      const bundleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "dist", "bundle.js")
      );

      scriptTags = `
    <!-- ✨ M8: 新架构 - 打包版本（bundle.js） -->
    <!-- ELK布局引擎（全局UMD） -->
    <script nonce="${nonce}" src="${elkUri}"></script>
    
    <!-- 新架构打包文件（包含所有ES6模块） -->
    <script nonce="${nonce}" type="module" src="${bundleUri}"></script>
`;
    } else {
      // 旧架构：单文件 + UMD模块
      const mainScriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "graphView.js")
      );
      const smokeProbeUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "SmokeProbe.js")
      );
      const debugBannerUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "DebugBanner.js")
      );
      const analysisCardUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "modules", "analysisCard.js")
      );
      const messageContractsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "contracts", "messageContracts.js")
      );
      const blueprintCardUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "modules", "blueprintCard.js")
      );
      const oldLayoutEngineUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "modules", "layoutEngine.js")
      );
      const validationTestUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "validation-test.js")
      );
      const styleManagerUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "modules", "styleManager.js")
      );
      const bootScriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "boot-script.js")
      );
      const elkTestUri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaBase, "elk-test.js")
      );

      scriptTags = `
    <!-- 🔧 旧架构 - 保持向后兼容 -->
    <!-- ELK + 基础组件 + 蓝图卡片系统 + 画布逻辑 -->
    <script nonce="${nonce}" src="${elkUri}"></script>
    <script nonce="${nonce}" src="${styleManagerUri}"></script>
    <!-- <script nonce="${nonce}" src="${smokeProbeUri}"></script> -->
    <!-- <script nonce="${nonce}" src="${debugBannerUri}"></script> -->
    <script nonce="${nonce}" src="${messageContractsUri}"></script>
    <script nonce="${nonce}" src="${oldLayoutEngineUri}"></script>
    <script nonce="${nonce}" src="${blueprintCardUri}"></script>
    <script nonce="${nonce}" src="${analysisCardUri}"></script>
    <script nonce="${nonce}" src="${mainScriptUri}"></script>
    <script nonce="${nonce}" src="${elkTestUri}"></script>
    <script nonce="${nonce}" src="${validationTestUri}"></script>
    <script nonce="${nonce}" src="${bootScriptUri}"></script>
`;
    }

    // 🚨 急救CSS：确保容器有高度，兼容原有的图表结构 + 卡片层
    const emergencyStyles = `
            html, body { 
                height: 100%; 
                margin: 0; 
                padding: 0; 
                background: var(--vscode-editor-background, #1e1e1e); 
                color: var(--vscode-foreground, #cccccc);
                font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
            }
            #graph-root { 
                height: 100vh; 
                width: 100vw; 
                position: relative;
                background: var(--vscode-editor-background, #1e1e1e);
            }
            /* 兼容原有结构 */
            #canvasWrap, #canvas {
                height: 100%;
                width: 100%;
                position: relative;
            }
            .empty-state {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                opacity: 0.7;
                z-index: 1;
            }
            .empty-state h3 {
                margin: 0 0 12px 0;
                font-size: 18px;
                color: var(--vscode-foreground, #cccccc);
            }
            .empty-state p {
                margin: 8px 0;
                color: var(--vscode-descriptionForeground, #999);
            }
            /* 🎯 卡片层样式 */
            .card-layer { 
                position: absolute; 
                inset: 0; 
                pointer-events: none; 
                z-index: 1500; 
            }
            
            /* 🎨 蓝图卡片样式（新系统） */
            .bp-card { 
                position: absolute; 
                pointer-events: auto; 
                z-index: 3; 
                background: var(--vscode-editor-background, #1e1e1e); 
                color: var(--vscode-foreground, #cccccc); 
                border-radius: 8px; 
                box-shadow: 0 8px 20px rgba(0,0,0,.35);
                border: 1px solid var(--vscode-panel-border, rgba(255,255,255,.12)); 
                min-width: 360px;
                width: 520px;
                height: 420px;
                display: flex;
                flex-direction: column;
            }
            .bp-card.pinned { 
                box-shadow: 0 12px 28px rgba(0,0,0,.25); 
                border-color: var(--vscode-focusBorder, #0078d4);
            }
            
            /* 📊 旧分析卡片样式（兼容） */
            .analysis-card { 
                position: absolute; 
                pointer-events: auto; 
                min-width: 360px; 
                max-width: 560px;
                background: var(--vscode-editor-background, #1e1e1e); 
                color: var(--vscode-foreground, #cccccc); 
                border-radius: 12px; 
                box-shadow: 0 8px 28px rgba(0,0,0,.45);
                border: 1px solid var(--vscode-panel-border, rgba(255,255,255,.08)); 
            }
            .analysis-card .header { 
                cursor: move; 
                padding: 10px 14px; 
                font-weight: 600; 
                border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,.06)); 
                background: var(--vscode-tab-activeBackground, rgba(255,255,255,.05));
                border-radius: 12px 12px 0 0;
                user-select: none;
            }
            .analysis-card .body { 
                padding: 12px 14px; 
                max-height: 50vh; 
                overflow: auto; 
            }
            .analysis-card .close { 
                position: absolute; 
                right: 10px; 
                top: 8px; 
                opacity: .7; 
                background: none;
                border: none;
                color: var(--vscode-foreground, #cccccc);
                cursor: pointer;
                font-size: 16px;
                width: 24px;
                height: 24px;
                border-radius: 3px;
            }
            .analysis-card .close:hover {
                background: var(--vscode-button-hoverBackground, rgba(255,255,255,.1));
                opacity: 1;
            }
        `;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none'; 
        img-src ${csp} https:; 
        script-src ${csp} 'nonce-${nonce}';
        style-src ${csp} 'nonce-${nonce}' 'unsafe-inline';
        font-src ${csp} https:;
    ">
    <link rel="stylesheet" href="${styleUri}">
    <style nonce="${nonce}">${emergencyStyles}</style>
    <title>文件树蓝图 - CSP修复版</title>
</head>
<body>
    <!-- 统计信息工具栏 -->
    <div id="toolbar" style="position: fixed; top: 10px; left: 10px; z-index: 1000; background: rgba(0,0,0,0.7); padding: 8px; border-radius: 4px; color: white; font-size: 12px;">
        <span id="stat-total-nodes">0 nodes</span> | 
        <span id="stat-total-edges">0 edges</span>
    </div>
    
    <!-- 面包屑导航 -->
    <div id="breadcrumb" style="position: fixed; top: 50px; left: 10px; z-index: 1000; background: rgba(0,0,0,0.7); padding: 6px; border-radius: 4px; color: white; font-size: 11px; max-width: 80%;"></div>

    <!-- 主画布容器 -->
    <div id="graph-root">
        <div class="empty-state">
            <h3>🎨 画布已加载</h3>
            <p>正在初始化图表数据...</p>
            <p><small>如果长时间无数据，请检查Debug Banner状态</small></p>
        </div>
    </div>
    
    <!-- 🎯 浮动卡片挂载层：绝对定位在顶层 -->
    <div id="card-layer" class="card-layer" aria-live="polite"></div>
    
    ${scriptTags}
</body>
</html>`;
  }

  /**
   * 显示状态栏提示（15秒后自动隐藏）
   */
  private showStatusBarHint(): void {
    const config = vscode.workspace.getConfiguration("filetreeBlueprint");
    const showHint = config.get<boolean>("showStatusBarHint", true);

    if (!showHint) {
      return;
    }

    // 创建状态栏项
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );

    this.statusBarItem.text =
      "$(graph) 空格+拖拽=平移 · 滚轮=缩放 · 双击文件夹=下钻 · ?=帮助";
    this.statusBarItem.tooltip =
      "蓝图视图快捷操作\n\n• 空格 + 拖拽：平移画布\n• 滚轮：缩放\n• 拖拽节点：移动节点\n• 双击文件夹：下钻\n• ? 键：打开帮助\n\n已优化防抖动：坐标取整 · rAF 节流 · GPU 合成层";
    this.statusBarItem.command = "filetreeBlueprint.openHelp";
    this.statusBarItem.show();

    // 添加到可销毁列表
    this.disposables.push(this.statusBarItem);

    // 15 秒后自动隐藏
    setTimeout(() => {
      if (this.statusBarItem) {
        this.statusBarItem.hide();
      }
    }, 15000);

    this.logger.debug("状态栏提示已显示，将在 15 秒后隐藏");
  }

  /**
   * 打开帮助浮层
   */
  public openHelp(): void {
    this.sendMessage({ type: "open-help" });
    this.logger.debug("已发送打开帮助消息到 Webview");
  }

  /**
   * 处理保存用户备注请求
   */
  private async handleSaveUserNotes(payload: any): Promise<void> {
    const { filePath, notes } = payload;

    this.logger.info(`[用户备注] 保存备注: ${filePath}`);

    if (!filePath) {
      this.logger.warn("保存用户备注消息缺少路径信息");
      return;
    }

    try {
      // 使用增强分析用例保存用户备注
      await this.enhancedAnalysisUseCase.saveUserNotes(filePath, notes);

      // 发送成功确认消息
      const successMessage = createUserNotesSavedMessage(filePath, true);
      await this.safePostMessage(successMessage);

      this.logger.info(`[用户备注] 备注保存成功: ${filePath}`);
    } catch (error) {
      this.logger.error(`[用户备注] 保存失败: ${filePath}`, error);

      // 发送失败消息
      const errorMessage = createUserNotesSavedMessage(
        filePath,
        false,
        error instanceof Error ? error.message : "保存失败"
      );
      await this.safePostMessage(errorMessage);
    }
  }

  /**
   * 处理获取用户备注请求
   */
  private async handleGetUserNotes(payload: any): Promise<void> {
    const { filePath } = payload;

    this.logger.info(`[用户备注] 获取备注: ${filePath}`);

    if (!filePath) {
      this.logger.warn("获取用户备注消息缺少路径信息");
      return;
    }

    try {
      // 使用增强分析用例获取胶囊数据
      const result = await this.enhancedAnalysisUseCase.analyzeFile({
        filePath,
        forceRefresh: false,
        includeAI: false, // 只获取缓存，不执行AI分析
      });

      let notes = {
        comments: [] as string[],
        tags: [] as string[],
        priority: undefined as "low" | "medium" | "high" | undefined,
        lastEditedAt: undefined as number | undefined,
      };

      if (result.success && result.data?.notes) {
        notes = {
          comments: result.data.notes.comments || [],
          tags: result.data.notes.tags || [],
          priority: result.data.notes.priority,
          lastEditedAt: result.data.notes.lastEditedAt,
        };
      }

      // 发送用户备注数据
      const dataMessage = createUserNotesDataMessage(filePath, notes);
      await this.safePostMessage(dataMessage);

      this.logger.info(`[用户备注] 备注获取成功: ${filePath}`, notes);
    } catch (error) {
      this.logger.error(`[用户备注] 获取失败: ${filePath}`, error);

      // 发送空的备注数据作为降级
      const emptyNotes = {
        comments: [],
        tags: [],
        priority: undefined,
        lastEditedAt: undefined,
      };
      const dataMessage = createUserNotesDataMessage(filePath, emptyNotes);
      await this.safePostMessage(dataMessage);
    }
  }

  /**
   * 处理保存增强版用户备注请求
   */
  private async handleSaveEnhancedUserNotes(payload: any): Promise<void> {
    const { filePath, notes } = payload;

    this.logger.info(`[增强备注] 保存增强版备注: ${filePath}`);

    if (!filePath || !notes) {
      this.logger.warn("保存增强版用户备注消息缺少必要信息");
      return;
    }

    try {
      // 使用增强分析用例保存增强版用户备注
      await this.enhancedAnalysisUseCase.saveEnhancedUserNotes(filePath, notes);

      // 发送成功确认消息
      const successMessage: EnhancedUserNotesSavedMessage = {
        type: "enhanced-user-notes-saved",
        payload: {
          filePath,
          success: true,
        },
      };
      await this.safePostMessage(successMessage);

      this.logger.info(`[增强备注] 增强版备注保存成功: ${filePath}`);
    } catch (error) {
      this.logger.error(`[增强备注] 保存失败: ${filePath}`, error);

      // 发送失败消息
      const errorMessage: EnhancedUserNotesSavedMessage = {
        type: "enhanced-user-notes-saved",
        payload: {
          filePath,
          success: false,
          error: error instanceof Error ? error.message : "保存失败",
        },
      };
      await this.safePostMessage(errorMessage);
    }
  }

  /**
   * 处理获取增强版用户备注请求
   */
  private async handleGetEnhancedUserNotes(payload: any): Promise<void> {
    const { filePath } = payload;

    this.logger.info(`[增强备注] 获取增强版备注: ${filePath}`);

    if (!filePath) {
      this.logger.warn("获取增强版用户备注消息缺少路径信息");
      return;
    }

    try {
      // 使用增强分析用例获取或创建增强版用户备注
      const notes =
        await this.enhancedAnalysisUseCase.getOrCreateEnhancedUserNotes(
          filePath
        );

      // 将 UserNotes 转换为消息格式
      const messageNotes = this.convertUserNotesToMessage(notes);

      // 发送增强版用户备注数据
      const dataMessage: EnhancedUserNotesDataMessage = {
        type: "enhanced-user-notes-data",
        payload: {
          filePath,
          notes: messageNotes,
          success: true,
        },
      };
      await this.safePostMessage(dataMessage);

      this.logger.info(`[增强备注] 增强版备注获取成功: ${filePath}`, {
        commentsCount: notes.comments?.length || 0,
        todosCount: notes.todos?.length || 0,
        tagsCount: notes.tags?.length || 0,
        priority: notes.priority,
        status: notes.status,
      });
    } catch (error) {
      this.logger.error(`[增强备注] 获取失败: ${filePath}`, error);

      // 发送空的增强版备注数据作为降级
      const { createEmptyUserNotes } = await import("../types/UserNotes");
      const emptyNotes = createEmptyUserNotes(filePath);
      const messageNotes = this.convertUserNotesToMessage(emptyNotes);

      const dataMessage: EnhancedUserNotesDataMessage = {
        type: "enhanced-user-notes-data",
        payload: {
          filePath,
          notes: messageNotes,
          success: false,
          error: error instanceof Error ? error.message : "获取失败",
        },
      };
      await this.safePostMessage(dataMessage);
    }
  }

  /**
   * 将 UserNotes 转换为消息格式
   */
  private convertUserNotesToMessage(notes: any): any {
    return {
      filePath: notes.filePath,
      priority: notes.priority,
      status: notes.status,
      tags: notes.tags || [],
      comments: (notes.comments || []).map((comment: any) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        pinned: comment.pinned ?? false,
        tags: comment.tags ?? [],
      })),
      todos: (notes.todos || []).map((todo: any) => ({
        id: todo.id,
        content: todo.content,
        completed: todo.completed,
        createdAt: todo.createdAt,
        completedAt: todo.completedAt,
        priority: todo.priority === "none" ? undefined : todo.priority,
        tags: todo.tags ?? [],
      })),
      links: notes.links || [],
      rating: notes.rating,
      customFields: notes.customFields || {},
      metadata: notes.metadata,
    };
  }

  /**
   * 处理功能筛选条件变化
   * 从FeatureRenderer模块调用，重新渲染功能子图
   */
  private async handleFilterChange(payload: any): Promise<void> {
    const { featureId, relevanceThreshold, keywords, maxHops } = payload;

    this.logger.info(`[功能筛选] 筛选条件变化:`, {
      featureId,
      relevanceThreshold,
      keywords,
      maxHops,
    });

    // 🎯 触发 FeatureRenderer 重新渲染
    try {
      // 动态导入 FeatureRenderer
      const { FeatureRenderer } = await import("../app/FeatureRenderer");

      // 创建渲染器实例
      const renderer = new FeatureRenderer();

      // 构建 FeaturePayload
      const featurePayload = {
        featureId: featureId || "default-feature",
        seeds: [], // TODO: 从当前图数据提取种子文件
        keywords: keywords || [],
        relevanceThreshold: relevanceThreshold || 30,
        maxHops: maxHops || 3,
        returnGraph: false, // 直接渲染，不返回
      };

      // 重新渲染功能子图
      await renderer.renderFeature(featurePayload);

      this.logger.info("[功能筛选] 功能子图重新渲染完成");
    } catch (error) {
      this.logger.error("[功能筛选] 重新渲染失败:", error);
      vscode.window.showErrorMessage(`功能筛选失败: ${error}`);
    }
  }

  /**
   * Priority 3: 处理卡片移动消息 (持久化位置)
   */
  /**
   * ✅ Phase 1: 使用 PositionsStore 处理卡片移动持久化
   */
  private async handleCardMoved(payload: any): Promise<void> {
    const { path, position } = payload;

    if (!path || !position) {
      this.logger.warn("[持久化] 卡片移动消息缺少必要参数");
      return;
    }

    try {
      // 使用 PositionsStore 保存位置
      await this.positionsStore.set(
        path,
        Math.round(position.x),
        Math.round(position.y)
      );

      this.logger.info(
        `[持久化] ✅ 卡片位置已保存: ${path} (${position.x}, ${position.y})`
      );
    } catch (error) {
      this.logger.error("[持久化] ❌ 保存位置失败:", error);
    }
  }

  /**
   * ✅ Phase 1: 处理备注保存（save-notes）
   */
  private async handleSaveNotes(payload: any): Promise<void> {
    const { path, notes } = payload;

    if (!path) {
      this.logger.warn("[持久化] 保存备注消息缺少路径参数");
      return;
    }

    try {
      await this.notesStore.write(path, notes || "");
      this.logger.info(`[持久化] ✅ 备注已保存: ${path}`);

      // 通知 Webview 保存成功
      await this.safePostMessage({
        type: "notes-saved",
        payload: { path },
      });
    } catch (error) {
      this.logger.error("[持久化] ❌ 保存备注失败:", error);
    }
  }

  /**
   * ✅ Phase 1: 处理备注加载（load-notes）
   */
  private async handleLoadNotes(payload: any): Promise<void> {
    const { path } = payload;

    if (!path) {
      this.logger.warn("[持久化] 加载备注消息缺少路径参数");
      return;
    }

    try {
      const notes = await this.notesStore.read(path);
      this.logger.info(`[持久化] ✅ 备注已加载: ${path}`);

      // 发送备注内容到 Webview
      await this.safePostMessage({
        type: "notes-loaded",
        payload: { path, notes },
      });
    } catch (error) {
      this.logger.error("[持久化] ❌ 加载备注失败:", error);

      // 发送空备注
      await this.safePostMessage({
        type: "notes-loaded",
        payload: { path, notes: "" },
      });
    }
  }

  /**
   * ✅ Phase 1: Webview 准备就绪后，发送已保存的位置数据
   */
  private async sendSavedPositions(): Promise<void> {
    try {
      const positions = await this.positionsStore.getAll();

      await this.safePostMessage({
        type: "ui/positions",
        payload: positions,
      });

      this.logger.info(
        `[持久化] ✅ 已发送位置数据: ${Object.keys(positions).length} 条`
      );
    } catch (error) {
      this.logger.error("[持久化] ❌ 发送位置数据失败:", error);
    }
  }

  // 旧代码（待删除）
  private async OLD_handleCardMoved_DEPRECATED(payload: any): Promise<void> {
    const { path, position } = payload;

    if (!path || !position) {
      this.logger.warn("[持久化] 卡片移动消息缺少必要参数");
      return;
    }

    try {
      // 加载或创建 positions.json
      const cacheDir = this.getCacheDirectory();
      const positionsPath = vscode.Uri.joinPath(cacheDir, "positions.json");

      let positions: Record<string, { x: number; y: number }> = {};

      try {
        const content = await vscode.workspace.fs.readFile(positionsPath);
        positions = JSON.parse(content.toString());
      } catch {
        // 文件不存在，使用空对象
      }

      // 更新位置
      positions[path] = {
        x: Math.round(position.x),
        y: Math.round(position.y),
      };

      // 保存到文件
      await vscode.workspace.fs.writeFile(
        positionsPath,
        Buffer.from(JSON.stringify(positions, null, 2))
      );

      this.logger.debug(
        `[持久化] 卡片位置已保存: ${path} -> (${position.x}, ${position.y})`
      );
    } catch (error) {
      this.logger.error("[持久化] 保存卡片位置失败:", error);
    }
  }

  /**
   * ✨ M7: 根据 Feature 过滤图数据
   * @param graph 原始图数据
   * @param featureFiles 要保留的文件路径列表
   * @returns 过滤后的图数据
   */
  private filterGraphByFeature(graph: Graph, featureFiles: string[]): Graph {
    // 将文件路径转为 Set 以提高查找性能（支持绝对路径和相对路径）
    const fileSet = new Set<string>();
    featureFiles.forEach((f) => {
      fileSet.add(f.toLowerCase());
      // 也添加文件名（不带路径）
      const fileName = f.split("/").pop() || f.split("\\").pop();
      if (fileName) {
        fileSet.add(fileName.toLowerCase());
      }
    });

    // 过滤节点：只保留在 featureFiles 中的文件
    const filteredNodes = graph.nodes.filter((node) => {
      // 检查节点的 id 或 label 是否在 featureFiles 中
      const nodeId = node.id.toLowerCase();
      const nodeLabel = node.label.toLowerCase();
      return fileSet.has(nodeId) || fileSet.has(nodeLabel);
    });

    // 提取保留的节点 ID
    const retainedNodeIds = new Set(filteredNodes.map((n) => n.id));

    // 过滤边：只保留两端节点都存在的边
    const filteredEdges = graph.edges.filter((edge) => {
      const fromNode =
        typeof edge.from === "string" ? edge.from : edge.from.node;
      const toNode = typeof edge.to === "string" ? edge.to : edge.to.node;
      return retainedNodeIds.has(fromNode) && retainedNodeIds.has(toNode);
    });

    // 构建新的图对象
    const filteredGraph: Graph = {
      ...graph,
      title: `Feature: ${featureFiles.length} files`, // ✨ M7: 标题显示文件数
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        ...graph.metadata,
        featureFilter: featureFiles, // 记录过滤信息
        originalNodeCount: graph.nodes.length,
        filteredNodeCount: filteredNodes.length,
      },
    };

    this.logger.info(`[M7] Feature 过滤完成:`, {
      original: graph.nodes.length,
      filtered: filteredNodes.length,
      edges: `${graph.edges.length} → ${filteredEdges.length}`,
    });

    return filteredGraph;
  }

  /**
   * Priority 3: 加载保存的卡片位置
   */
  /**
   * ✅ Phase 1: 已废弃 - 使用 PositionsStore 代替
   * 获取缓存目录（保留，其他地方可能还在使用）
   */
  private getCacheDirectory(): vscode.Uri {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("未打开工作区");
    }
    return vscode.Uri.joinPath(
      workspaceFolder.uri,
      ".ai-explorer-cache",
      "filetree-blueprint"
    );
  }

  /**
   * 简单字符串 hash 函数
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    BlueprintPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }

    this.logger.info("蓝图面板已关闭");
  }
}
