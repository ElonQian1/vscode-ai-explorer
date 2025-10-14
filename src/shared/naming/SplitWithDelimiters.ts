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
 * - 识别缩写（API/HTML）和数字
 */

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
      // 可能是驼峰，拆成多段
      const segs = p.t
        .replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')  // camelCase 边界
        .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, ' ')  // HTMLParser → HTML Parser
        .split(/\s+/)
        .filter(Boolean);

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
 * 分类词元类型
 */
function classify(raw: string): TokenPiece {
  // 纯数字
  if (/^\d+$/.test(raw)) {
    return { raw, lower: raw, type: 'num' };
  }
  
  // 全大写缩写（长度 >= 2）
  if (/^[A-Z]{2,}$/.test(raw)) {
    return { raw, lower: raw.toLowerCase(), type: 'acronym' };
  }
  
  // 普通单词
  return { raw, lower: raw.toLowerCase(), type: 'word' };
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
