/* v1.0.0 - 本機 localStorage 持久化：自建 Deck、全空白背熟時間與偏好設定 */

const KEYS = {
  customDecks: 'keepverse_custom_decks_v1',
  mastery: 'keepverse_mastery_v1',
  prefs: 'keepverse_prefs_v1',
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
 * 讀取全部經文卡的「全空白」最近一次無失誤時間對照表。
 * @returns {Record<string, string>}
 */
export function loadMasteryMap() {
  const map = readJson(KEYS.mastery, {});
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

/**
 * 記錄指定經文在「全空白」模式無失誤通過的時間。
 * @param {string} canonicalRef
 * @returns {string} ISO 時間字串
 */
export function recordMastery(canonicalRef) {
  const map = loadMasteryMap();
  const nowIso = new Date().toISOString();
  map[canonicalRef] = nowIso;
  writeJson(KEYS.mastery, map);
  return nowIso;
}

/**
 * 取得指定經文的最近背熟 ISO 時間字串。
 * @param {string} canonicalRef
 * @returns {string | null}
 */
export function getMastery(canonicalRef) {
  const map = loadMasteryMap();
  return typeof map[canonicalRef] === 'string' ? map[canonicalRef] : null;
}

/**
 * 將 ISO 時間字串格式化為易於判斷是否需複習的相對時間文字。
 * @param {string | null} isoStr
 * @returns {string}
 */
export function formatRelativeMastery(isoStr) {
  if (!isoStr) return '尚未背熟';
  const date = new Date(isoStr);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return '尚未背熟';

  const diffMs = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;

  const days = Math.floor(hours / 24);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${days} 天前（${mm}/${dd}）`;
}

/**
 * 讀取介面偏好設定（目前選擇的 Deck 與主題）。
 * @returns {{ activeDeckId: string | null, theme: 'system' | 'light' | 'dark' }}
 */
export function loadPrefs() {
  const prefs = readJson(KEYS.prefs, {});
  const theme = prefs?.theme === 'light' || prefs?.theme === 'dark' ? prefs.theme : 'system';
  const activeDeckId = typeof prefs?.activeDeckId === 'string' ? prefs.activeDeckId : null;
  return { activeDeckId, theme };
}

/**
 * 儲存介面偏好設定。
 * @param {{ activeDeckId: string | null, theme: 'system' | 'light' | 'dark' }} prefs
 */
export function savePrefs(prefs) {
  writeJson(KEYS.prefs, prefs);
}
