/* v1.5.1 - 本機 localStorage 持久化：分譯本背熟與難度記錄、舊版資料遷移、卡組與篩選偏好 */

const KEYS = {
  customDecks: 'keepverse_custom_decks_v1',
  deckOrder: 'keepverse_deck_order_v1',
  mastery: 'keepverse_mastery_v1',
  prefs: 'keepverse_prefs_v1',
  cardLevels: 'keepverse_card_levels_v1',
  lastCards: 'keepverse_last_cards_v1',
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private mode restrictions safely
  }
}

/**
 * 讀取使用者自建的 Deck 清單。
 * @returns {Array<{ id: string, name: string, cards: string[] }>}
 */
export function loadCustomDecks() {
  const list = readJson(KEYS.customDecks, []);
  if (!Array.isArray(list)) return [];
  return list.filter(
    (d) => d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cards)
  );
}

/**
 * 儲存使用者自建的 Deck 清單。
 * @param {Array<{ id: string, name: string, cards: string[] }>} decks
 */
export function saveCustomDecks(decks) {
  writeJson(KEYS.customDecks, decks);
}

/**
 * 讀取使用者自訂的卡組排序 ID 清單。
 * @returns {string[]}
 */
export function loadDeckOrder() {
  const list = readJson(KEYS.deckOrder, []);
  if (!Array.isArray(list)) return [];
  return list.filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * 儲存卡組排序 ID 清單。
 * @param {string[]} deckIds
 */
export function saveDeckOrder(deckIds) {
  writeJson(KEYS.deckOrder, deckIds);
}

function makeScopedKey(translationId, canonicalRef) {
  return `${translationId}|${canonicalRef}`;
}

function pickNewerIso(a, b) {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return tb >= ta ? b : a;
}

/**
 * 將 v1.4.x 舊版未分譯本的背熟記錄與難度遷移至 `${translationId}|${canonicalRef}`，並正規化最後停留經文與自建卡組出處。
 * @param {(ref: string) => string | null} canonicalizeFn
 * @param {string} [defaultZhId]
 * @param {string} [defaultEnId]
 */
export function migrateLegacyStorage(canonicalizeFn, defaultZhId = 'rcuv', defaultEnId = 'esv') {
  if (typeof canonicalizeFn !== 'function') return;

  const rawMastery = readJson(KEYS.mastery, {});
  if (rawMastery && typeof rawMastery === 'object' && !Array.isArray(rawMastery)) {
    const nextMastery = {};
    let masteryChanged = false;
    for (const [key, iso] of Object.entries(rawMastery)) {
      if (typeof iso !== 'string') {
        masteryChanged = true;
        continue;
      }
      if (key.includes('|')) {
        nextMastery[key] = nextMastery[key] ? pickNewerIso(nextMastery[key], iso) : iso;
      } else {
        const isEn = /[A-Za-z]/.test(key);
        const canon = canonicalizeFn(key) || key;
        const scoped = makeScopedKey(isEn ? defaultEnId : defaultZhId, canon);
        nextMastery[scoped] = nextMastery[scoped] ? pickNewerIso(nextMastery[scoped], iso) : iso;
        masteryChanged = true;
      }
    }
    if (masteryChanged) {
      writeJson(KEYS.mastery, nextMastery);
    }
  }

  const rawLevels = readJson(KEYS.cardLevels, {});
  if (rawLevels && typeof rawLevels === 'object' && !Array.isArray(rawLevels)) {
    const nextLevels = {};
    let levelsChanged = false;
    for (const [key, lv] of Object.entries(rawLevels)) {
      if (key.includes('|')) {
        nextLevels[key] = lv;
      } else {
        const isEn = /[A-Za-z]/.test(key);
        const canon = canonicalizeFn(key) || key;
        const scoped = makeScopedKey(isEn ? defaultEnId : defaultZhId, canon);
        if (!(scoped in nextLevels)) {
          nextLevels[scoped] = lv;
        }
        levelsChanged = true;
      }
    }
    if (levelsChanged) {
      writeJson(KEYS.cardLevels, nextLevels);
    }
  }

  const rawLastCards = readJson(KEYS.lastCards, {});
  if (rawLastCards && typeof rawLastCards === 'object' && !Array.isArray(rawLastCards)) {
    let lastChanged = false;
    const nextLast = {};
    for (const [deckId, ref] of Object.entries(rawLastCards)) {
      if (typeof ref === 'string' && ref) {
        const canon = canonicalizeFn(ref) || ref;
        if (canon !== ref) lastChanged = true;
        nextLast[deckId] = canon;
      }
    }
    if (lastChanged) {
      writeJson(KEYS.lastCards, nextLast);
    }
  }

  const customDecks = loadCustomDecks();
  if (customDecks.length > 0) {
    let decksChanged = false;
    const nextDecks = customDecks.map((d) => {
      const nextCards = d.cards.map((r) => {
        const c = canonicalizeFn(r) || r;
        if (c !== r) decksChanged = true;
        return c;
      });
      if (!Array.isArray(d.sections) || d.sections.length === 0) {
        return { ...d, cards: nextCards };
      }
      const nextSections = d.sections.map((s) => ({
        ...s,
        cards: Array.isArray(s.cards)
          ? s.cards.map((r) => {
              const c = canonicalizeFn(r) || r;
              if (c !== r) decksChanged = true;
              return c;
            })
          : [],
      }));
      return { ...d, cards: nextCards, sections: nextSections };
    });
    if (decksChanged) {
      saveCustomDecks(nextDecks);
    }
  }
}

/**
 * 讀取指定譯本全部經文卡的「全空白」最近一次無失誤時間對照表。
 * @param {string} [translationId]
 * @returns {Record<string, string>}
 */
export function loadMasteryMap(translationId = 'rcuv') {
  const map = readJson(KEYS.mastery, {});
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const prefix = `${translationId}|`;
  const scoped = {};
  for (const [key, val] of Object.entries(map)) {
    if (key.startsWith(prefix) && typeof val === 'string') {
      scoped[key.slice(prefix.length)] = val;
    }
  }
  return scoped;
}

/**
 * 記錄指定譯本與經文在「全空白」模式無失誤通過的時間。
 * @param {string} canonicalRef
 * @param {string} [translationId]
 * @returns {string} ISO 時間字串
 */
export function recordMastery(canonicalRef, translationId = 'rcuv') {
  const raw = readJson(KEYS.mastery, {});
  const safeMap = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const nowIso = new Date().toISOString();
  safeMap[makeScopedKey(translationId, canonicalRef)] = nowIso;
  writeJson(KEYS.mastery, safeMap);
  return nowIso;
}

/**
 * 取得指定譯本與經文的最近背熟 ISO 時間字串。
 * @param {string} canonicalRef
 * @param {string} [translationId]
 * @returns {string | null}
 */
export function getMastery(canonicalRef, translationId = 'rcuv') {
  const raw = readJson(KEYS.mastery, {});
  const val = raw?.[makeScopedKey(translationId, canonicalRef)];
  return typeof val === 'string' ? val : null;
}

/**
 * 計算指定經文距離本機今天零點的天數（未背熟或無效日期回傳 null）。
 * @param {string | null} isoStr
 * @returns {number | null}
 */
export function getMasteryDaysAgo(isoStr) {
  if (!isoStr) return null;
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.max(0, Math.round((todayStart - targetStart) / 86400000));
}

/**
 * 將 ISO 時間字串格式化為易於判斷是否需複習的相對時間文字。
 * @param {string | null} isoStr
 * @returns {string}
 */
export function formatRelativeMastery(isoStr) {
  const days = getMasteryDaysAgo(isoStr);
  if (days === null) return '還沒背熟';
  return days === 0 ? '今天剛背熟' : `${days} 天前背熟`;
}

/**
 * 讀取介面偏好設定（目前選擇的譯本、卡組、主題與卡片篩選模式／天數）。
 * @returns {{ translation: string | null, activeDeckId: string | null, theme: 'system' | 'light' | 'dark', filterMode: 'all' | 'unmastered' | 'stale', filterDays: number }}
 */
export function loadPrefs() {
  const prefs = readJson(KEYS.prefs, {});
  const translation =
    typeof prefs?.translation === 'string' && prefs.translation.trim()
      ? prefs.translation.trim()
      : null;
  const theme = prefs?.theme === 'light' || prefs?.theme === 'dark' ? prefs.theme : 'system';
  const activeDeckId = typeof prefs?.activeDeckId === 'string' ? prefs.activeDeckId : null;
  const rawFilter = Number(prefs?.filterDays);
  const hasValidDays = Number.isInteger(rawFilter) && rawFilter >= 1;
  const filterDays = hasValidDays ? Math.min(rawFilter, 999) : 3;
  const filterMode =
    prefs?.filterMode === 'all' ||
    prefs?.filterMode === 'unmastered' ||
    prefs?.filterMode === 'stale'
      ? prefs.filterMode
      : (hasValidDays ? 'stale' : 'all');
  return { translation, activeDeckId, theme, filterMode, filterDays };
}

/**
 * 儲存介面偏好設定。
 * @param {{ translation?: string | null, activeDeckId: string | null, theme: 'system' | 'light' | 'dark', filterMode?: 'all' | 'unmastered' | 'stale', filterDays?: number }} prefs
 */
export function savePrefs(prefs) {
  writeJson(KEYS.prefs, prefs);
}

/**
 * 取得指定譯本與經文卡片上次停留的難度（1–4，預設為 1）。
 * @param {string} canonicalRef
 * @param {string} [translationId]
 * @returns {1 | 2 | 3 | 4}
 */
export function getCardLevel(canonicalRef, translationId = 'rcuv') {
  if (!canonicalRef) return 1;
  const map = readJson(KEYS.cardLevels, {});
  const lv = map?.[makeScopedKey(translationId, canonicalRef)];
  return lv === 1 || lv === 2 || lv === 3 || lv === 4 ? lv : 1;
}

/**
 * 記錄指定譯本與經文卡片的目前難度（1–4）。
 * @param {string} canonicalRef
 * @param {1 | 2 | 3 | 4} level
 * @param {string} [translationId]
 */
export function saveCardLevel(canonicalRef, level, translationId = 'rcuv') {
  if (!canonicalRef) return;
  const map = readJson(KEYS.cardLevels, {});
  const safeMap = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  safeMap[makeScopedKey(translationId, canonicalRef)] = level;
  writeJson(KEYS.cardLevels, safeMap);
}

/**
 * 取得指定 Deck 上次停留的經文出處。
 * @param {string} deckId
 * @returns {string | null}
 */
export function getDeckLastCard(deckId) {
  if (!deckId) return null;
  const map = readJson(KEYS.lastCards, {});
  const ref = map?.[deckId];
  return typeof ref === 'string' && ref ? ref : null;
}

/**
 * 記錄指定 Deck 目前停留的經文出處。
 * @param {string} deckId
 * @param {string} canonicalRef
 */
export function saveDeckLastCard(deckId, canonicalRef) {
  if (!deckId || !canonicalRef) return;
  const map = readJson(KEYS.lastCards, {});
  const safeMap = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  safeMap[deckId] = canonicalRef;
  writeJson(KEYS.lastCards, safeMap);
}
