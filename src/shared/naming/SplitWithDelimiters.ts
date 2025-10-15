/**
 * SplitWithDelimiters.ts
 * 
 * 作用：把文件名拆成【词元数组】+【分隔符数组】，保持原始分隔符（- _ . 空串）与扩展名
 * 
 * 例： "analyze_element_hierarchy.cjs"
 *   → tokens: ["analyze","element","hierarchy"]
 *   → delims: ["_","_",""]    // tokens[i] 后跟 delims[i]
 *   → ext: "cjs"
 * 
 * 核心特性：
 * - 保留原始分隔符类型（_ - . 空格 驼峰分隔等）
 * - 支持驼峰、kebab-case、snake_case、dot.case
 * - 识别缩写（白名单机制：API/HTML/URL等）
 * - 支持数字缩写（numeronym：i18n/l10n/k8s/e2e）
 * - 字母/数字边界拆分（JSON2CSV → JSON|2|CSV）
 * 
 * 驼峰三类边界：
 * 1. aB / 9A：小写/数字 → 大写（useForm → use|Form）
 * 2. ABc：连续大写后接"大写+小写"（HTMLParser → HTML|Parser）
 * 3. 字母↔数字边界（Ab12 → Ab|12, v2X → v2|X）
 */

import * as vscode from 'vscode';

export type TokenPiece = {
  /** 原始字符串 */
  raw: string;
  /** 小写形式 */
  lower: string;
  /** 类型：普通单词 | 缩写 | 数字 */
  type: 'word' | 'acronym' | 'num';
};

export type SplitResult = {
  /** 词元数组 */
  tokens: TokenPiece[];
  /** 分隔符数组（tokens[i] 后跟 delims[i]） */
  delims: string[];
  /** 扩展名 */
  ext: string;
};

/**
 * 分词并保留分隔符
 */
export function splitWithDelimiters(fileName: string): SplitResult {
  // 1. 分离扩展名
  const i = fileName.lastIndexOf('.');
  const base = i > 0 ? fileName.slice(0, i) : fileName;
  const ext = i > 0 ? fileName.slice(i + 1).toLowerCase() : '';

  // 2. 先按非字母数字分隔，保留分隔符
  const parts: Array<{ t?: string; d?: string }> = [];
  base.replace(/([A-Za-z0-9]+)|([^A-Za-z0-9]+)/g, (_, word, delim) => {
    if (word) parts.push({ t: word });
    if (delim) parts.push({ d: delim });
    return '';
  });

  // 3. 再把驼峰拆开，但保留"分隔符段"的原样
  const tokens: TokenPiece[] = [];
  const delims: string[] = [];

  for (let idx = 0; idx < parts.length; ) {
    const p = parts[idx];
    
    if (p.t) {
      // 对"词段"做驼峰/数字边界拆分（增强版）
      const segs = splitCamelAndDigits(p.t);

      for (let s = 0; s < segs.length; s++) {
        const raw = segs[s];
        tokens.push(classify(raw));

        // 确定这个 token 后面的分隔符
        if (s === segs.length - 1) {
          // 最后一个驼峰段，看后续是否有分隔符
          const next = parts[idx + 1];
          if (next && next.d) {
            delims.push(next.d);
            idx += 2;  // 跳过 word + delim
          } else {
            delims.push('');  // 驼峰段后无分隔符
            idx += 1;
          }
        } else {
          // 驼峰内部，没有分隔符（或者用空串表示）
          delims.push('');
        }
      }
    } else {
      // 连续分隔符（极少见），跳过
      idx += 1;
    }
  }

  return { tokens, delims, ext };
}

/**
 * 驼峰和数字边界拆分（增强版）
 * 规则：
 * 1. aB / 9A：小写/数字 → 大写
 * 2. ABc：连续大写后接"大写+小写"
 * 3. 字母 ↔ 数字边界
 */
function splitCamelAndDigits(s: string): string[] {
  return s
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')      // aB / 9A
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, ' ')    // ABc
    .replace(/(?<=[a-zA-Z])(?=\d)/g, ' ')         // A9 (字母→数字)
    .replace(/(?<=\d)(?=[a-zA-Z])/g, ' ')         // 9A (数字→字母)
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 分类词元类型（增强版，支持白名单和 numeronym）
 */
function classify(raw: string): TokenPiece {
  const lower = raw.toLowerCase();
  
  // 1. numeronym 识别（i18n/l10n/k8s/e2e）
  if (/^(i18n|l10n|k8s|e2e)$/i.test(raw)) {
    return { raw, lower, type: 'word' };
  }
  
  // 2. 纯数字
  if (/^\d+$/.test(raw)) {
    return { raw, lower: raw, type: 'num' };
  }
  
  // 3. 全大写：仅白名单才当 acronym，其它当普通词
  if (/^[A-Z]{2,}$/.test(raw)) {
    const allowlist = getAcronymAllowlist();
    if (allowlist.has(raw)) {
      return { raw, lower, type: 'acronym' };  // 白名单缩写：API/HTML/URL等
    } else {
      return { raw, lower, type: 'word' };     // 普通词：DEBUG/WARNING等
    }
  }
  
  // 4. 普通单词
  return { raw, lower, type: 'word' };
}

/**
 * 获取缩写白名单（可配置）
 */
function getAcronymAllowlist(): Set<string> {
  const config = vscode.workspace.getConfiguration('aiExplorer');
  const list = config.get<string[]>('alias.acronymAllowlist', [
    'UI', 'API', 'HTTP', 'HTTPS', 'URL', 'URI', 'DOM',
    'ID', 'UUID', 'CPU', 'GPU', 'DB', 'SQL', 'ORM',
    'TCP', 'UDP', 'TLS', 'SSL', 'SDK', 'CLI', 'CI', 'CD',
    'JWT', 'CSS', 'HTML', 'JS', 'TS', 'JSX', 'TSX',
    'JSON', 'XML', 'CSV', 'PNG', 'JPG', 'GIF', 'SVG',
    'PDF', 'MD', 'IOS', 'OS'  // 注意：OS 是缩写，但 iOS 会被拆成 i|OS
  ]);
  return new Set(list);
}

/**
 * 重建文件名（保留分隔符）
 * @param mapped 翻译后的词元数组
 * @param delims 分隔符数组
 * @param ext 扩展名
 * @param keepExt 是否保留扩展名
 */
export function rebuildWithDelimiters(
  mapped: string[],
  delims: string[],
  ext: string,
  keepExt: boolean = true
): string {
  let result = '';
  
  for (let i = 0; i < mapped.length; i++) {
    result += mapped[i] + (delims[i] || '');
  }
  
  if (keepExt && ext) {
    result += '.' + ext;
  }
  
  // 清理 Windows 文件名非法字符
  result = result.replace(/[\\/:*?"<>|]/g, '·');
  
  // 限制长度（Windows 路径限制）
  if (result.length > 120) {
    result = result.slice(0, 120);
  }
  
  return result;
}
