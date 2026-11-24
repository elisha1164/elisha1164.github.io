/* v1.2.8 - 中英文經文隨機挖空、首字母提示與加權編輯距離區塊差異批改 */

const PUNCT_SPACE_RE = /[\p{P}\p{S}\s]+/gu;
const SINGLE_PUNCT_SPACE_RE = /^[\p{P}\p{S}\s]$/u;
const TOKEN_SPLIT_RE = /[\p{P}\p{S}\s]+|[^\p{P}\p{S}\s]+/gu;
const EN_WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
const BLANK_CHAR = '＿';
const EN_BLANK_WORD = '____';
const TARGET_BLANK_RATIO = 0.6;

/**
 * 移除所有標點符號與空白，保留嚴格字元供中文背誦比對（不做異體字轉換）。
 * @param {string} text
 * @returns {string}
 */
export function stripForCheck(text) {
  return String(text || '').replace(PUNCT_SPACE_RE, '');
}

function computeDiffOps(a, b, isEqual) {
  const m = a.length;
  const n = b.length;
  const cols = n + 1;
  const insDelCost = Math.min(m, n) + 1;
  const subCost = 2 * insDelCost - 1;
  const dp = new Int32Array((m + 1) * cols);

  for (let i = 1; i <= m; i += 1) {
    dp[i * cols] = i * insDelCost;
  }
  for (let j = 1; j <= n; j += 1) {
    dp[j] = j * insDelCost;
  }

  for (let i = 1; i <= m; i += 1) {
    const rowOff = i * cols;
    const prevOff = (i - 1) * cols;
    for (let j = 1; j <= n; j += 1) {
      const diag = dp[prevOff + (j - 1)] + (isEqual(a[i - 1], b[j - 1]) ? 0 : subCost);
      const up = dp[prevOff + j] + insDelCost;
      const left = dp[rowOff + (j - 1)] + insDelCost;
      let best = diag;
      if (up < best) best = up;
      if (left < best) best = left;
      dp[rowOff + j] = best;
    }
  }

  const revOps = [];
  const gapExtras = [];
  const gapMissings = [];

  const flushGap = () => {
    // revOps 會於結尾 reverse，因此先推 missing 再推 extra，
    // 反轉後即呈現同一錯誤區塊內「先紅（extra）後藍（missing）」且維持由左至右順序。
    for (let k = 0; k < gapMissings.length; k += 1) {
      revOps.push(gapMissings[k]);
    }
    for (let k = 0; k < gapExtras.length; k += 1) {
      revOps.push(gapExtras[k]);
    }
    gapMissings.length = 0;
    gapExtras.length = 0;
  };

  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const cur = dp[i * cols + j];
    if (i > 0 && j > 0 && isEqual(a[i - 1], b[j - 1]) && cur === dp[(i - 1) * cols + (j - 1)]) {
      flushGap();
      revOps.push({ type: 'equal', actIdx: i - 1, expIdx: j - 1 });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && cur === dp[(i - 1) * cols + (j - 1)] + subCost) {
      gapExtras.push({ type: 'extra', actIdx: i - 1, expIdx: null });
      gapMissings.push({ type: 'missing', actIdx: null, expIdx: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && cur === dp[i * cols + (j - 1)] + insDelCost) {
      gapMissings.push({ type: 'missing', actIdx: null, expIdx: j - 1 });
      j -= 1;
    } else {
      gapExtras.push({ type: 'extra', actIdx: i - 1, expIdx: null });
      i -= 1;
    }
  }

  flushGap();
  return revOps.reverse();
}

function createSegmentAccumulator() {
  const segments = [];
  let tailChar = '';

  const push = (type, text) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.text += text;
    } else {
      segments.push({ type, text });
    }
    tailChar = text[text.length - 1];
  };

  return { segments, push, getTailChar: () => tailChar };
}

function compareChineseVerse(expectedRaw, inputRaw) {
  const b = [];
  const punctSlots = [''];
  for (const ch of Array.from(String(expectedRaw || ''))) {
    if (SINGLE_PUNCT_SPACE_RE.test(ch)) {
      punctSlots[punctSlots.length - 1] += ch;
    } else {
      b.push(ch);
      punctSlots.push('');
    }
  }

  const a = Array.from(stripForCheck(inputRaw));
  if (a.length === b.length && a.every((ch, idx) => ch === b[idx])) {
    return { ok: true, segments: [] };
  }

  const ops = computeDiffOps(a, b, (x, y) => x === y);
  const acc = createSegmentAccumulator();
  acc.push('equal', punctSlots[0]);

  for (const op of ops) {
    if (op.type === 'extra') {
      acc.push('extra', a[op.actIdx]);
    } else {
      acc.push(op.type, b[op.expIdx]);
      acc.push('equal', punctSlots[op.expIdx + 1]);
    }
  }

  return { ok: false, segments: acc.segments };
}

function extractEnglishTokens(text) {
  const src = String(text || '');
  const words = [];
  const slots = [];
  let lastIdx = 0;

  for (const match of src.matchAll(EN_WORD_RE)) {
    slots.push(src.slice(lastIdx, match.index));
    const raw = match[0];
    words.push({
      raw,
      norm: raw.replace(/['’]/g, '').toLowerCase(),
    });
    lastIdx = match.index + raw.length;
  }
  slots.push(src.slice(lastIdx));

  return { words, slots };
}

function compareEnglishVerse(expectedRaw, inputRaw) {
  const { words: b, slots: punctSlots } = extractEnglishTokens(expectedRaw);
  const { words: a } = extractEnglishTokens(inputRaw);

  if (a.length === b.length && a.every((w, idx) => w.norm === b[idx].norm)) {
    return { ok: true, segments: [] };
  }

  const ops = computeDiffOps(a, b, (x, y) => x.norm === y.norm);
  const acc = createSegmentAccumulator();
  acc.push('equal', punctSlots[0]);

  let pendingExtraSpace = false;
  for (const op of ops) {
    if (op.type === 'extra') {
      const tail = acc.getTailChar();
      if (tail && !/[\s“‘"'(\[-]$/.test(tail)) {
        acc.push('equal', ' ');
      }
      acc.push('extra', a[op.actIdx].raw);
      pendingExtraSpace = true;
    } else {
      if (pendingExtraSpace) {
        acc.push('equal', ' ');
        pendingExtraSpace = false;
      }
      acc.push(op.type, b[op.expIdx].raw);
      acc.push('equal', punctSlots[op.expIdx + 1]);
    }
  }

  return { ok: false, segments: acc.segments };
}

/**
 * 依語言比對經文（忽略標點與空白，於錯誤批改結果中保留原文標點以利閱讀）。
 * @param {string} expectedRaw
 * @param {string} inputRaw
 * @param {'zh' | 'en'} [lang]
 * @returns {{ ok: boolean, segments: Array<{ type: 'equal' | 'extra' | 'missing', text: string }> }}
 */
export function compareVerse(expectedRaw, inputRaw, lang = 'zh') {
  return lang === 'en'
    ? compareEnglishVerse(expectedRaw, inputRaw)
    : compareChineseVerse(expectedRaw, inputRaw);
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickBlankLength(rem, ratio) {
  if (rem <= 4) return rem;
  if (rem === 5) return ratio < TARGET_BLANK_RATIO ? 3 : 2;
  const maxChoice = Math.min(4, rem - 2);
  const preferLarge = ratio < TARGET_BLANK_RATIO - 0.05;
  if (preferLarge && maxChoice >= 3) return randInt(3, maxChoice);
  return randInt(2, maxChoice);
}

function buildClauseMask(len, processedBefore, blankedBefore) {
  const mask = new Array(len).fill(false);
  if (len <= 1) return { mask, blanks: 0 };

  if (len <= 3) {
    const ratio = processedBefore > 0 ? blankedBefore / processedBefore : 0;
    const prob = Math.min(0.92, Math.max(0.25, TARGET_BLANK_RATIO + (TARGET_BLANK_RATIO - ratio) * 1.5));
    if (Math.random() < prob) {
      mask.fill(true);
      return { mask, blanks: len };
    }
    return { mask, blanks: 0 };
  }

  let pos = 0;
  let localBlanks = 0;
  const initRatio = processedBefore > 0 ? blankedBefore / processedBefore : 0.45;
  let nextIsBlank = Math.random() < Math.min(0.85, Math.max(0.18, 0.58 + (TARGET_BLANK_RATIO - initRatio) * 1.8));

  while (pos < len) {
    const rem = len - pos;
    const curRatio = (blankedBefore + localBlanks) / Math.max(1, processedBefore + pos);

    if (nextIsBlank) {
      if (rem < 2) break;
      const bLen = pickBlankLength(rem, curRatio);
      for (let k = 0; k < bLen; k += 1) {
        mask[pos + k] = true;
      }
      localBlanks += bLen;
      pos += bLen;
      nextIsBlank = false;
    } else {
      let vLen = curRatio < TARGET_BLANK_RATIO - 0.08 ? 1 : randInt(1, Math.min(2, rem));
      if (rem - vLen === 1) {
        vLen = rem <= 3 ? rem : Math.max(1, vLen - 1);
      }
      if (rem <= 3 && curRatio >= TARGET_BLANK_RATIO) {
        vLen = rem;
      }
      pos += vLen;
      nextIsBlank = true;
    }
  }

  return { mask, blanks: localBlanks };
}

function generateChineseRandomBlanks(text) {
  const rawTokens = String(text || '').match(TOKEN_SPLIT_RE);
  if (!rawTokens) return '';

  const tokens = rawTokens.map((t) => ({
    isPunct: /^[\p{P}\p{S}\s]+$/u.test(t),
    chars: Array.from(t),
    mask: null,
  }));

  let totalChars = 0;
  let processedChars = 0;
  let blankedChars = 0;
  let longestIdx = -1;

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.isPunct) continue;
    totalChars += tok.chars.length;
    if (longestIdx === -1 || tok.chars.length > tokens[longestIdx].chars.length) {
      longestIdx = i;
    }
    const { mask, blanks } = buildClauseMask(tok.chars.length, processedChars, blankedChars);
    tok.mask = mask;
    processedChars += tok.chars.length;
    blankedChars += blanks;
  }

  if (totalChars >= 2 && blankedChars === 0 && longestIdx !== -1 && tokens[longestIdx].chars.length >= 2) {
    const target = tokens[longestIdx];
    const span = Math.min(3, target.chars.length);
    for (let k = 0; k < span; k += 1) target.mask[k] = true;
  }

  return tokens
    .map((tok) => {
      if (tok.isPunct) return tok.chars.join('');
      return tok.chars.map((ch, idx) => (tok.mask[idx] ? BLANK_CHAR : ch)).join('');
    })
    .join('');
}

function generateEnglishRandomBlanks(text) {
  const { words, slots } = extractEnglishTokens(text);
  const count = words.length;
  if (count === 0) return String(text || '');

  const mask = new Array(count).fill(false);
  let pos = 0;
  let blanked = 0;
  let nextIsBlank = Math.random() < 0.65;

  while (pos < count) {
    const rem = count - pos;
    const curRatio = pos > 0 ? blanked / pos : 0.45;

    if (nextIsBlank) {
      const span = Math.min(rem, randInt(1, curRatio < TARGET_BLANK_RATIO ? 3 : 2));
      for (let k = 0; k < span; k += 1) {
        mask[pos + k] = true;
      }
      blanked += span;
      pos += span;
      nextIsBlank = false;
    } else {
      const vSpan = Math.min(rem, curRatio < TARGET_BLANK_RATIO - 0.1 ? 1 : randInt(1, 2));
      pos += vSpan;
      nextIsBlank = true;
    }
  }

  if (blanked === 0) {
    mask[Math.floor(count / 2)] = true;
  }

  let out = slots[0];
  for (let i = 0; i < count; i += 1) {
    out += (mask[i] ? EN_BLANK_WORD : words[i].raw) + slots[i + 1];
  }
  return out;
}

/**
 * 產生隨機挖空提示字串（中文隱藏 2–4 字，英文隱藏 1–3 個單字，皆約 60% 並保留標點）。
 * @param {string} text
 * @param {'zh' | 'en'} [lang]
 * @returns {string}
 */
export function generateRandomBlanks(text, lang = 'zh') {
  return lang === 'en' ? generateEnglishRandomBlanks(text) : generateChineseRandomBlanks(text);
}

/**
 * 將英文經文轉換為各單字首字母提示（保留大小寫與標點）。
 * @param {string} text
 * @returns {string}
 */
export function toEnglishInitials(text) {
  return String(text || '').replace(EN_WORD_RE, (word) => word[0]);
}
