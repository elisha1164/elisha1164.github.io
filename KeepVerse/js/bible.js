/* v1.5.3 - 譯本目錄載入、按需讀取與快取檢查（不綁定快取版號）、多中文譯本詩篇標題濾除及標準出處解析 */

const ESV_PSALM_HEADING_RE = /^(?:[^a-z]*?(?:[.?!]["”]|[.:])\s*)+/;
const ZH_PSALM_VOL_RE = /^第[一二三四五]卷（[^）]*）/;
const ZH_PSALM_HEADING_RE =
  /^(?:(?:「[^」]*」|[^。「？！])+(?:詩|歌|祈禱|禱告|聖詠團長[^。]*|給樂隊指揮[^。]*|教誨人|向耶和華說話|向耶和華所唱的|傾吐苦情|殺了一萬二千人|擊殺了一萬兩千個以東人)。|(?:那時[^。「？！]*(?:「[^」]*[。？！]」|。))|(?:在耶和華解救他[^。]+。他說：))+/;

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

const ZH_BOOK_ALIASES = new Map([
  ['約翰壹書', '約翰一書'],
  ['約翰貳書', '約翰二書'],
  ['約翰參書', '約翰三書'],
]);

let catalogPromise = null;
let translationsCatalog = [];
let activeTranslationId = null;
const translationData = new Map();
const loadingPromises = new Map();

function normEnglishBook(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveZhBook(book) {
  if (ZH_TO_EN.has(book)) return book;
  const aliased = ZH_BOOK_ALIASES.get(book);
  if (aliased && ZH_TO_EN.has(aliased)) return aliased;
  return EN_NORM_TO_PAIR.get(normEnglishBook(book))?.zh || '';
}

async function fetchJsonOrThrow(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法載入${label} (${res.status})`);
  return res.json();
}

function findTranslationEntry(id) {
  return translationsCatalog.find((t) => t.id === id) || translationsCatalog[0] || null;
}

function getActiveDataset() {
  return activeTranslationId ? (translationData.get(activeTranslationId) || null) : null;
}

/**
 * 讀取外部 translations.json 譯本目錄，第一筆為預設譯本。
 * @returns {Promise<Array<{ id: string, shortLabel: string, name: string, lang: 'zh' | 'en', path: string }>>}
 */
export async function loadTranslationsCatalog() {
  if (translationsCatalog.length > 0) return translationsCatalog;
  if (!catalogPromise) {
    catalogPromise = fetchJsonOrThrow('./translations.json', '譯本清單')
      .then((list) => {
        if (!Array.isArray(list)) {
          throw new Error('translations.json 格式須為陣列');
        }
        const normalized = list
          .filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              item.id.trim() &&
              typeof item.path === 'string' &&
              item.path.trim()
          )
          .map((item) => ({
            id: item.id.trim(),
            shortLabel:
              typeof item.shortLabel === 'string' && item.shortLabel.trim()
                ? item.shortLabel.trim()
                : item.id.trim().toUpperCase(),
            name:
              typeof item.name === 'string' && item.name.trim()
                ? item.name.trim()
                : item.id.trim(),
            lang: item.lang === 'en' ? 'en' : 'zh',
            path: item.path.trim(),
          }));
        if (normalized.length === 0) {
          throw new Error('translations.json 未包含任何有效譯本');
        }
        translationsCatalog = normalized;
        return translationsCatalog;
      })
      .catch((err) => {
        catalogPromise = null;
        throw err;
      });
  }
  return catalogPromise;
}

/**
 * 取得已載入的譯本目錄陣列。
 * @returns {Array<{ id: string, shortLabel: string, name: string, lang: 'zh' | 'en', path: string }>}
 */
export function getTranslations() {
  return translationsCatalog;
}

/**
 * 取得預設譯本 ID（translations.json 第一筆）。
 * @returns {string}
 */
export function getDefaultTranslationId() {
  return translationsCatalog[0]?.id || 'rcuv';
}

/**
 * 取得目前作用中的譯本設定物件。
 * @returns {{ id: string, shortLabel: string, name: string, lang: 'zh' | 'en', path: string } | null}
 */
export function getActiveTranslation() {
  if (activeTranslationId) {
    return translationsCatalog.find((t) => t.id === activeTranslationId) || null;
  }
  return translationsCatalog[0] || null;
}

/**
 * 判斷指定譯本是否已載入到記憶體。
 * @param {string} id
 * @returns {boolean}
 */
export function isTranslationLoaded(id) {
  return translationData.has(id);
}

/**
 * 檢查指定譯本是否已存於記憶體或離線快取中。
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function hasOfflineTranslation(id) {
  if (translationData.has(id)) return true;
  const entry = translationsCatalog.find((t) => t.id === id);
  if (!entry || typeof caches === 'undefined') return false;
  try {
    return Boolean(await caches.match(entry.path));
  } catch {
    return false;
  }
}

/**
 * 按需載入並切換至指定譯本 JSON；僅於載入成功後更新作用中譯本。
 * @param {string} id
 * @returns {Promise<{ id: string, shortLabel: string, name: string, lang: 'zh' | 'en', path: string }>}
 */
export async function loadTranslation(id) {
  await loadTranslationsCatalog();
  const entry = findTranslationEntry(id);
  if (!entry) {
    throw new Error('找不到可用的譯本設定');
  }

  if (translationData.has(entry.id)) {
    activeTranslationId = entry.id;
    return entry;
  }

  let promise = loadingPromises.get(entry.id);
  if (!promise) {
    promise = fetchJsonOrThrow(entry.path, entry.name)
      .then((data) => {
        translationData.set(entry.id, data);
        loadingPromises.delete(entry.id);
        return data;
      })
      .catch((err) => {
        loadingPromises.delete(entry.id);
        throw err;
      });
    loadingPromises.set(entry.id, promise);
  }

  await promise;
  activeTranslationId = entry.id;
  return entry;
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
 * 取得指定語言的 66 卷書卷名稱清單（依目前譯本所含書卷順序）。
 * @param {'zh' | 'en'} [lang]
 * @returns {string[]}
 */
export function getBooks(lang = getActiveTranslation()?.lang || 'zh') {
  const dataset = getActiveDataset();
  return BOOK_PAIRS.filter(([zh]) => !dataset || Boolean(dataset[zh])).map(([zh, en]) =>
    lang === 'en' ? en : zh
  );
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
  const bookObj = getActiveDataset()?.[zh];
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
  const chapObj = getActiveDataset()?.[zh]?.[String(chapter)];
  if (!chapObj) return [];
  return Object.keys(chapObj)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

function parseRefStructure(refStr) {
  if (typeof refStr !== 'string') return null;
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

  const zhBook = resolveZhBook(rawBook);
  const enBook = zhBook ? ZH_TO_EN.get(zhBook) : '';
  if (!zhBook || !enBook) return null;

  return {
    zhBook,
    enBook,
    book: zhBook,
    chapter,
    startVerse,
    endVerse,
    sourceLang: isEnglish ? 'en' : 'zh',
  };
}

/**
 * 將任意中／英文經文出處正規化為不綁定譯本的標準中文出處字串（如「John 3:16」→「約翰福音 3:16」）。
 * @param {string} refStr
 * @returns {string | null}
 */
export function canonicalizeRef(refStr) {
  const parsed = parseRefStructure(refStr);
  return parsed ? formatRef(parsed, 'zh') : null;
}

/**
 * 解析並驗證同章中／英文經文出處字串（依目前作用中譯本驗證章節存在性）。
 * @param {string} refStr
 * @returns {{ zhBook: string, enBook: string, book: string, chapter: number, startVerse: number, endVerse: number, sourceLang: 'zh' | 'en' } | null}
 */
export function parseRef(refStr) {
  const parsed = parseRefStructure(refStr);
  if (!parsed) return null;

  const dataset = getActiveDataset();
  if (!dataset) return null;

  const chapObj = dataset[parsed.zhBook]?.[String(parsed.chapter)];
  if (!chapObj) return null;

  for (let v = parsed.startVerse; v <= parsed.endVerse; v += 1) {
    if (typeof chapObj[String(v)] !== 'string') return null;
  }

  return parsed;
}

/**
 * 將已解析的出處物件格式化為指定語言的出處字串（預設為標準中文格式）。
 * @param {{ book?: string, zhBook?: string, enBook?: string, chapter: number, startVerse: number, endVerse: number }} parsed
 * @param {'zh' | 'en'} [lang]
 * @returns {string}
 */
export function formatRef(parsed, lang = 'zh') {
  if (!parsed) return '';
  let bookName = parsed.book || '';
  if (lang === 'en') {
    bookName = parsed.enBook || translateBookName(bookName, 'en') || bookName;
  } else {
    bookName = parsed.zhBook || translateBookName(bookName, 'zh') || bookName;
  }
  const base = `${bookName} ${parsed.chapter}:${parsed.startVerse}`;
  return parsed.endVerse > parsed.startVerse ? `${base}-${parsed.endVerse}` : base;
}

/**
 * 將標準出處依指定語言格式化供介面顯示（如英文譯本下將「約翰福音 3:16」顯示為「John 3:16」）。
 * @param {string} refStr
 * @param {'zh' | 'en'} [lang]
 * @returns {string}
 */
export function formatDisplayRef(refStr, lang = getActiveTranslation()?.lang || 'zh') {
  const parsed = parseRefStructure(refStr);
  if (!parsed) return String(refStr || '');
  return formatRef(parsed, lang);
}

function stripPsalmHeading(text, lang) {
  if (lang === 'en') {
    return text.replace(ESV_PSALM_HEADING_RE, '').trim();
  }
  return text
    .replace(ZH_PSALM_VOL_RE, '')
    .replace(ZH_PSALM_HEADING_RE, '')
    .trim();
}

/**
 * 取得指定譯本與出處範圍的純淨連接經文（不含節號、註釋與詩篇第一節標題）。
 * @param {string} refStr
 * @param {string} [translationId]
 * @returns {string}
 */
export function getPassageText(refStr, translationId = activeTranslationId) {
  const entry = translationsCatalog.find((t) => t.id === translationId) || getActiveTranslation();
  if (!entry) return '';
  const dataset = translationData.get(entry.id);
  if (!dataset) return '';

  const parsed = parseRefStructure(refStr);
  if (!parsed) return '';

  const chapObj = dataset[parsed.zhBook]?.[String(parsed.chapter)];
  if (!chapObj) return '';

  const parts = [];
  for (let v = parsed.startVerse; v <= parsed.endVerse; v += 1) {
    const raw = chapObj[String(v)];
    if (typeof raw !== 'string') return '';
    let cleaned = cleanVerseText(raw, entry.lang);
    if (parsed.zhBook === '詩篇' && v === 1) {
      cleaned = stripPsalmHeading(cleaned, entry.lang);
    }
    parts.push(cleaned);
  }
  return parts.join(entry.lang === 'en' ? ' ' : '');
}
