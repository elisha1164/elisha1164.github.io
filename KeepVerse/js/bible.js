/* v1.1.0 - 中英文聖經資料庫 (../rcuv.json, ../esv2016.json) 讀取、註釋清理與雙語出處解析 */

const BOOK_PAIRS = [
  ['創世記', 'Genesis'],
  ['出埃及記', 'Exodus'],
  ['利未記', 'Leviticus'],
  ['民數記', 'Numbers'],
  ['申命記', 'Deuteronomy'],
  ['約書亞記', 'Joshua'],
  ['士師記', 'Judges'],
  ['路得記', 'Ruth'],
  ['撒母耳記上', '1 Samuel'],
  ['撒母耳記下', '2 Samuel'],
  ['列王紀上', '1 Kings'],
  ['列王紀下', '2 Kings'],
  ['歷代志上', '1 Chronicles'],
  ['歷代志下', '2 Chronicles'],
  ['以斯拉記', 'Ezra'],
  ['尼希米記', 'Nehemiah'],
  ['以斯帖記', 'Esther'],
  ['約伯記', 'Job'],
  ['詩篇', 'Psalm'],
  ['箴言', 'Proverbs'],
  ['傳道書', 'Ecclesiastes'],
  ['雅歌', 'Song of Solomon'],
  ['以賽亞書', 'Isaiah'],
  ['耶利米書', 'Jeremiah'],
  ['耶利米哀歌', 'Lamentations'],
  ['以西結書', 'Ezekiel'],
  ['但以理書', 'Daniel'],
  ['何西阿書', 'Hosea'],
  ['約珥書', 'Joel'],
  ['阿摩司書', 'Amos'],
  ['俄巴底亞書', 'Obadiah'],
  ['約拿書', 'Jonah'],
  ['彌迦書', 'Micah'],
  ['那鴻書', 'Nahum'],
  ['哈巴谷書', 'Habakkuk'],
  ['西番雅書', 'Zephaniah'],
  ['哈該書', 'Haggai'],
  ['撒迦利亞書', 'Zechariah'],
  ['瑪拉基書', 'Malachi'],
  ['馬太福音', 'Matthew'],
  ['馬可福音', 'Mark'],
  ['路加福音', 'Luke'],
  ['約翰福音', 'John'],
  ['使徒行傳', 'Acts'],
  ['羅馬書', 'Romans'],
  ['哥林多前書', '1 Corinthians'],
  ['哥林多後書', '2 Corinthians'],
  ['加拉太書', 'Galatians'],
  ['以弗所書', 'Ephesians'],
  ['腓立比書', 'Philippians'],
  ['歌羅西書', 'Colossians'],
  ['帖撒羅尼迦前書', '1 Thessalonians'],
  ['帖撒羅尼迦後書', '2 Thessalonians'],
  ['提摩太前書', '1 Timothy'],
  ['提摩太後書', '2 Timothy'],
  ['提多書', 'Titus'],
  ['腓利門書', 'Philemon'],
  ['希伯來書', 'Hebrews'],
  ['雅各書', 'James'],
  ['彼得前書', '1 Peter'],
  ['彼得後書', '2 Peter'],
  ['約翰一書', '1 John'],
  ['約翰二書', '2 John'],
  ['約翰三書', '3 John'],
  ['猶大書', 'Jude'],
  ['啟示錄', 'Revelation'],
];

const ZH_TO_EN = new Map(BOOK_PAIRS);
const EN_NORM_TO_PAIR = new Map();
for (const [zh, en] of BOOK_PAIRS) {
  EN_NORM_TO_PAIR.set(en.toLowerCase(), { zh, en });
}
EN_NORM_TO_PAIR.set('psalms', { zh: '詩篇', en: 'Psalm' });
EN_NORM_TO_PAIR.set('song of songs', { zh: '雅歌', en: 'Song of Solomon' });
EN_NORM_TO_PAIR.set('revelations', { zh: '啟示錄', en: 'Revelation' });

let biblePromise = null;
let rcuvData = null;
let esvData = null;

function normEnglishBook(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveZhBook(book) {
  if (rcuvData?.[book]) return book;
  return EN_NORM_TO_PAIR.get(normEnglishBook(book))?.zh || '';
}

async function fetchJsonOrThrow(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法載入${label} (${res.status})`);
  return res.json();
}

/**
 * 載入並快取上層目錄的 rcuv.json 與 esv2016.json 聖經資料。
 * @returns {Promise<{ rcuv: Record<string, any>, esv: Record<string, any> }>}
 */
export async function loadBible() {
  if (rcuvData && esvData) return { rcuv: rcuvData, esv: esvData };
  if (!biblePromise) {
    biblePromise = Promise.all([
      fetchJsonOrThrow('../rcuv.json', '中文經文資料庫'),
      fetchJsonOrThrow('../esv2016.json', '英文經文資料庫'),
    ])
      .then(([rcuv, esv]) => {
        rcuvData = rcuv;
        esvData = esv;
        return { rcuv, esv };
      })
      .catch((err) => {
        biblePromise = null;
        throw err;
      });
  }
  return biblePromise;
}

/**
 * 清除經文內的註釋與多餘空白，回傳純淨經文。
 * @param {string} raw
 * @param {'zh' | 'en'} [lang]
 * @returns {string}
 */
export function cleanVerseText(raw, lang = 'zh') {
  const str = String(raw || '');
  if (lang === 'en') {
    return str
      .replace(/([.!?])([A-Za-z])/g, '$1 $2')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return str
    .replace(/\?註：[^?]*\?/g, '')
    .replace(/\u3000/g, '')
    .trim();
}

/**
 * 取得指定語言的 66 卷書卷名稱清單。
 * @param {'zh' | 'en'} [lang]
 * @returns {string[]}
 */
export function getBooks(lang = 'zh') {
  if (!rcuvData) return [];
  if (lang === 'en') {
    return BOOK_PAIRS.map(([, en]) => en);
  }
  return Object.keys(rcuvData);
}

/**
 * 將書卷名稱轉換為目標語言（'zh' 或 'en'）。
 * @param {string} book
 * @param {'zh' | 'en'} targetLang
 * @returns {string}
 */
export function translateBookName(book, targetLang) {
  const zh = resolveZhBook(book);
  if (!zh) return '';
  return targetLang === 'en' ? (ZH_TO_EN.get(zh) || '') : zh;
}

/**
 * 取得指定書卷的所有章數（依數字升冪排列，支援中英文書名）。
 * @param {string} book
 * @returns {number[]}
 */
export function getChapters(book) {
  const zh = resolveZhBook(book);
  const bookObj = rcuvData?.[zh];
  if (!bookObj) return [];
  return Object.keys(bookObj)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

/**
 * 取得指定書卷與章數的所有節數（依數字升冪排列，支援中英文書名）。
 * @param {string} book
 * @param {number|string} chapter
 * @returns {number[]}
 */
export function getVerses(book, chapter) {
  const zh = resolveZhBook(book);
  const chapObj = rcuvData?.[zh]?.[String(chapter)];
  if (!chapObj) return [];
  return Object.keys(chapObj)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

/**
 * 解析並驗證同章中／英文經文出處字串（如「約翰福音 3:16」或「John 3:16」、「1 Corinthians 13:4-7」）。
 * @param {string} refStr
 * @returns {{ lang: 'zh' | 'en', book: string, zhBook: string, chapter: number, startVerse: number, endVerse: number } | null}
 */
export function parseRef(refStr) {
  if (!rcuvData || !esvData || typeof refStr !== 'string') return null;
  const trimmed = refStr.trim();
  const isEnglish = /[A-Za-z]/.test(trimmed);
  const pattern = isEnglish
    ? /^(.+?)\s+(\d+)\s*[:：]\s*(\d+)(?:\s*[-–—~～]\s*(\d+))?$/
    : /^(.+?)\s*(\d+)\s*[:：]\s*(\d+)(?:\s*[-–—~～]\s*(\d+))?$/;

  const match = trimmed.match(pattern);
  if (!match) return null;

  const rawBook = match[1].trim();
  const chapter = Number(match[2]);
  const startVerse = Number(match[3]);
  const endVerse = match[4] ? Number(match[4]) : startVerse;

  if (!Number.isInteger(chapter) || !Number.isInteger(startVerse) || !Number.isInteger(endVerse)) {
    return null;
  }
  if (startVerse < 1 || endVerse < startVerse) return null;

  let book = rawBook;
  let zhBook = rawBook;
  let dataset = rcuvData;
  let lang = 'zh';

  if (isEnglish) {
    const pair = EN_NORM_TO_PAIR.get(normEnglishBook(rawBook));
    if (!pair) return null;
    book = pair.en;
    zhBook = pair.zh;
    dataset = esvData;
    lang = 'en';
  }

  const chapObj = dataset[zhBook]?.[String(chapter)];
  if (!chapObj) return null;

  for (let v = startVerse; v <= endVerse; v += 1) {
    if (typeof chapObj[String(v)] !== 'string') return null;
  }

  return { lang, book, zhBook, chapter, startVerse, endVerse };
}

/**
 * 取得經文出處的語言代碼（'zh' 或 'en'）。
 * @param {string} refStr
 * @returns {'zh' | 'en'}
 */
export function getRefLang(refStr) {
  return parseRef(refStr)?.lang || 'zh';
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
 * 取得指定出處範圍的純淨連接經文（不含節號與註釋）。
 * @param {string} refStr
 * @returns {string}
 */
export function getPassageText(refStr) {
  const parsed = parseRef(refStr);
  if (!parsed) return '';
  const dataset = parsed.lang === 'en' ? esvData : rcuvData;
  const chapObj = dataset[parsed.zhBook][String(parsed.chapter)];
  const parts = [];
  for (let v = parsed.startVerse; v <= parsed.endVerse; v += 1) {
    parts.push(cleanVerseText(chapObj[String(v)], parsed.lang));
  }
  return parts.join(parsed.lang === 'en' ? ' ' : '');
}
