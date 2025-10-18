// src/core/path/pathMapper.ts
/* src/core/path/pathMapper.ts */
import * as path from 'path';
import * as vscode from 'vscode';

export function normalizeRel(p: string): string {
  // '/src/lib' -> 'src/lib'；去前导斜杠；统一为 POSIX 再按平台转
  const noLead = p.replace(/^[\\/]+/, '');
  return noLead.replace(/\\/g, '/');
}

export function relToAbs(rel: string, root: vscode.Uri): string {
  const norm = normalizeRel(rel);            // 'src/lib'
  const plat = norm.split('/').join(path.sep); // Windows 下变成 'src\lib'
  return path.join(root.fsPath, plat);
}

export function absToRel(abs: string, root: vscode.Uri): string {
  const rel = path.relative(root.fsPath, abs);
  return rel.split(path.sep).join('/'); // 统一成 posix 供 Webview 使用
}