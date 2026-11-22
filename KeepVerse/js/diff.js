/* v1.0.0 - 經文隨機挖空演算法與嚴格逐字比對（LCS 差異標註） */

const PUNCT_SPACE_RE = /[\p{P}\p{S}\s]+/gu;
const TOKEN_SPLIT_RE = /[\p{P}\p{S}\s]+|[^\p{P}\p{S}\s]+/gu;
const BLANK_CHAR = '＿';
const TARGET_BLANK_RATIO = 0.6;

/**
 * 移除所有標點符號與空白，保留嚴格字元供背誦比對（不做異體字轉換）。
 * @param {string} text
 * @returns {string}
 */
export function stripForCheck(text) {
  return String(text || '').replace(PUNCT_SPACE_RE, '');
}

/**
 * 嚴格逐字比對經文（僅忽略標點與空白），產出分段差異。
 * extra 表示使用者多打或打錯的字；missing 表示少打或應有的字。
 * @param {string} expectedRaw
 * @param {string} inputRaw
 * @returns {{ ok: boolean, segments: Array<{ type: 'equal' | 'extra' | 'missing', text: string }> }}
 */
export function compareVerse(expectedRaw, inputRaw) {
  const expected = stripForCheck(expectedRaw);
  const actual = stripForCheck(inputRaw);

  if (expected === actual) {
    return { ok: true, segments: [] };
  }

  const a = Array.from(actual);
  const b = Array.from(expected);
  const m = a.length;
  const n = b.length;
  const cols = n + 1;
  const dp = new Int32Array((m + 1) * cols);

  for (let i = 1; i <= m; i += 1) {
    const rowOff = i * cols;
    const prevOff = (i - 1) * cols;
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[rowOff + j] = dp[prevOff + j - 1] + 1;
      } else {
        const up = dp[prevOff + j];
        const left = dp[rowOff + j - 1];
        dp[rowOff + j] = up >= left ? up : left;
      }
    }
  }

  const revOps = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      revOps.push({ type: 'equal', text: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i * cols + (j - 1)] >= dp[(i - 1) * cols + j])) {
      revOps.push({ type: 'missing', text: b[j - 1] });
      j -= 1;
    } else {
      revOps.push({ type: 'extra', text: a[i - 1] });
      i -= 1;
    }
  }

  const segments = [];
  for (let k = revOps.length - 1; k >= 0; k -= 1) {
    const op = revOps[k];
    const last = segments[segments.length - 1];
    if (last && last.type === op.type) {
      last.text += op.text;
    } else {
      segments.push({ type: op.type, text: op.text });
    }
  }

  return { ok: false, segments };
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
      if (rem < 2) break; // Keep trailing 1 char visible so blanks stay 2..4 long
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

/**
 * 產生隨機挖空提示字串：隱藏約 60% 國字，以 2-4 個相鄰「＿」組成空白區塊並保留標點。
 * @param {string} text
 * @returns {string}
 */
export function generateRandomBlanks(text) {
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

  // Fallback guard: ensure at least one 2-4 char blank block exists when verse has >= 2 chars
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
