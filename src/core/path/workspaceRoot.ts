// src/core/path/workspaceRoot.ts
/* src/core/path/workspaceRoot.ts */
import * as vscode from 'vscode';

const GS_KEY = 'aiExplorer.workspaceRootFsPath';
const LAST_KNOWN_KEY = 'aiExplorer.lastKnownRootFsPath';

export async function getWorkspaceRoot(ctx: vscode.ExtensionContext): Promise<vscode.Uri | undefined> {
  // 1) 优先 VS Code 提供的 workspaceFolders
  const wf = vscode.workspace.workspaceFolders;
  if (wf && wf.length > 0) return wf[0].uri;

  // 2) 其次用最近一次成功解析记录
  const last = ctx.globalState.get<string>(LAST_KNOWN_KEY) || ctx.globalState.get<string>(GS_KEY);
  if (last) return vscode.Uri.file(last);

  // 3) 兜底：询问用户（一次）
  const pick = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: '选择工作区根目录（AI Explorer）'
  });
  if (pick && pick[0]) {
    await setManualWorkspaceRoot(pick[0], ctx);
    return pick[0];
  }

  return undefined;
}

export async function setManualWorkspaceRoot(uri: vscode.Uri, ctx: vscode.ExtensionContext) {
  await ctx.globalState.update(GS_KEY, uri.fsPath);
}

export async function rememberLastKnownRoot(absPath: string, ctx: vscode.ExtensionContext) {
  // 记录"最近一次成功解析"的根，供无 workspaceFolders 时复用
  const root = vscode.Uri.file(absPath).with({ path: vscode.Uri.file(absPath).path.split('/').slice(0, -1).join('/') });
  await ctx.globalState.update(LAST_KNOWN_KEY, root.fsPath);
}