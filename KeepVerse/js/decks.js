/* v1.0.0 - 內建與自建 Deck 載入、JSON 格式驗證匯入匯出與非破壞性洗牌 */

import { formatRef, parseRef } from './bible.js';
import { loadCustomDecks } from './storage.js';

function normalizeCardList(rawCards) {
  const validCards = [];
  const invalidRefs = [];
  for (const item of rawCards) {
    if (typeof item !== 'string') {
      invalidRefs.push(String(item));
      continue;
    }
    const parsed = parseRef(item);
    if (parsed) {
      validCards.push(formatRef(parsed));
    } else {
      invalidRefs.push(item);
    }
  }
  return { validCards, invalidRefs };
}

/**
 * 從 ./decks/index.json 載入全部內建 Deck 檔案。
 * @returns {Promise<Array<{ id: string, filename: string, name: string, cards: string[], builtin: true }>>}
 */
export async function loadBuiltinDecks() {
  const indexRes = await fetch('./decks/index.json');
  if (!indexRes.ok) {
    throw new Error(`無法載入內建 Deck 清單 (${indexRes.status})`);
  }
  const filenames = await indexRes.json();
  if (!Array.isArray(filenames)) return [];

  const loaded = await Promise.all(
    filenames.map(async (filename) => {
      const res = await fetch(`./decks/${filename}`);
      if (!res.ok) throw new Error(`無法載入 Deck: ${filename}`);
      const data = await res.json();
      const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : filename;
      const rawCards = Array.isArray(data?.cards) ? data.cards : [];
      const { validCards } = normalizeCardList(rawCards);
      return {
        id: `builtin:${filename}`,
        filename,
        name,
        cards: validCards,
        builtin: true,
      };
    })
  );

  return loaded.filter((d) => d.cards.length > 0);
}

/**
 * 合併內建 Deck 與使用者自建 Deck 清單。
 * @param {Array} builtinDecks
 * @returns {Array}
 */
export function getAllDecks(builtinDecks) {
  const custom = loadCustomDecks().map((d) => ({
    ...d,
    builtin: false,
  }));
  return [...builtinDecks, ...custom];
}

/**
 * 驗證匯入的 Deck JSON 格式與經文出處是否皆存在於 rcuv.json。
 * @param {string | object} rawInput
 * @returns {{ ok: boolean, deck?: { name: string, cards: string[] }, invalidRefs?: string[], error?: string }}
 */
export function validateDeckJson(rawInput) {
  let obj = rawInput;
  if (typeof rawInput === 'string') {
    try {
      obj = JSON.parse(rawInput);
    } catch {
      return { ok: false, error: 'JSON 格式錯誤，請確認括號與引號是否完整。' };
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Deck 格式須為包含 name 與 cards 的 JSON 物件。' };
  }

  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) {
    return { ok: false, error: '請提供非空白的 Deck 名稱 (name)。' };
  }

  if (!Array.isArray(obj.cards) || obj.cards.length === 0) {
    return { ok: false, error: 'cards 須為至少包含一張經文的陣列。' };
  }

  const { validCards, invalidRefs } = normalizeCardList(obj.cards);
  if (invalidRefs.length > 0) {
    return {
      ok: false,
      invalidRefs,
      error: `以下經文出處無法於經文庫中找到或格式不符：${invalidRefs.join('、')}`,
    };
  }

  return { ok: true, deck: { name, cards: validCards } };
}

/**
 * 將 Deck 序列化為共用標準 JSON 格式（永遠保留原卡片順序，不受洗牌狀態影響）。
 * @param {{ name: string, cards: string[] }} deck
 * @returns {string}
 */
export function serializeDeck(deck) {
  return JSON.stringify(
    {
      name: deck.name,
      cards: deck.cards,
    },
    null,
    2
  );
}

/**
 * 以 Fisher-Yates 演算法產生僅用於記憶體顯示的洗牌索引陣列，絕不更動原 Deck JSON。
 * @param {number} length
 * @returns {number[]}
 */
export function createShuffledOrder(length) {
  const order = Array.from({ length }, (_, idx) => idx);
  if (length <= 1) return order;

  const shuffleOnce = () => {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  };

  shuffleOnce();
  if (order.every((v, idx) => v === idx)) {
    shuffleOnce();
    if (order.every((v, idx) => v === idx)) {
      [order[0], order[1]] = [order[1], order[0]];
    }
  }
  return order;
}
