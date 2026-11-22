/* v1.0.0 - 和合本修訂版 (rcuv.json) 經文讀取、註釋清理與同章出處解析 */

let biblePromise = null;
let bibleData = null;

/**
 * 載入並快取 rcuv.json 聖經資料。
 * @returns {Promise<Record<string, Record<string, Record<string, string>>>>}
 */
export async function loadBible() {
  if (bibleData) return bibleData;
  if (!biblePromise) {
    biblePromise = fetch('./rcuv.json')
      .then((res) => {
        if (!res.ok) throw new Error(`無法載入經文資料庫 (${res.status})`);
        return res.json();
      })
      .then((data) => {
        bibleData = data;
        return data;
      })
      .catch((err) => {
        biblePromise = null;
        throw err;
      });
  }
  return biblePromise;
}

/**
 * 清除經文內的「?註：...?」註釋與全形空白，回傳純淨經文。
 * @param {string} raw
 * @returns {string}
 */
export function cleanVerseText(raw) {
  return String(raw || '')
    .replace(/\?註：[^?]*\?/g, '')
    .replace(/\u3000/g, '')
    .trim();
}

/**
 * 取得所有書卷名稱清單。
 * @returns {string[]}
 */
export function getBooks() {
  if (!bibleData) return [];
  return Object.keys(bibleData);
}

/**
 * 取得指定書卷的所有章數（依數字升冪排列）。
 * @param {string} book
 * @returns {number[]}
 */
export function getChapters(book) {
  const bookObj = bibleData?.[book];
  if (!bookObj) return [];
  return Object.keys(bookObj)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

/**
 * 取得指定書卷與章數的所有節數（依數字升冪排列）。
 * @param {string} book
 * @param {number|string} chapter
 * @returns {number[]}
 */
export function getVerses(book, chapter) {
  const chapObj = bibleData?.[book]?.[String(chapter)];
  if (!chapObj) return [];
  return Object.keys(chapObj)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

/**
 * 解析並驗證同章經文出處字串（如「約翰福音 3:16」或「羅馬書 8:28-29」）。
 * @param {string} refStr
 * @returns {{ book: string, chapter: number, startVerse: number, endVerse: number } | null}
 */
export function parseRef(refStr) {
  if (!bibleData || typeof refStr !== 'string') return null;
  const trimmed = refStr.trim();
  const match = trimmed.match(/^(.+?)\s*(\d+)\s*[:：]\s*(\d+)(?:\s*[-–—~～]\s*(\d+))?$/);
  if (!match) return null;

  const book = match[1].trim();
  const chapter = Number(match[2]);
  const startVerse = Number(match[3]);
  const endVerse = match[4] ? Number(match[4]) : startVerse;

  if (!Number.isInteger(chapter) || !Number.isInteger(startVerse) || !Number.isInteger(endVerse)) {
    return null;
  }
  if (startVerse < 1 || endVerse < startVerse) return null;

  const chapObj = bibleData[book]?.[String(chapter)];
  if (!chapObj) return null;

  for (let v = startVerse; v <= endVerse; v += 1) {
    if (typeof chapObj[String(v)] !== 'string') return null;
  }

  return { book, chapter, startVerse, endVerse };
}

/**
 * 將已解析的出處物件格式化為標準字串。
 * @param {{ book: string, chapter: number, startVerse: number, endVerse: number }} parsed
 * @returns {string}
 */
export function formatRef(parsed) {
  if (!parsed) return '';
  const base = `${parsed.book} ${parsed.chapter}:${parsed.startVerse}`;
  return parsed.endVerse > parsed.startVerse ? `${base}-${parsed.endVerse}` : base;
}

/**
 * 取得指定出處範圍的純淨無縫連接經文（不含節號與註釋）。
 * @param {string} refStr
 * @returns {string}
 */
export function getPassageText(refStr) {
  const parsed = parseRef(refStr);
  if (!parsed) return '';
  const chapObj = bibleData[parsed.book][String(parsed.chapter)];
  const parts = [];
  for (let v = parsed.startVerse; v <= parsed.endVerse; v += 1) {
    parts.push(cleanVerseText(chapObj[String(v)]));
  }
  return parts.join('');
}
