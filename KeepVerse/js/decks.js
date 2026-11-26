/* v1.3.0 - 內建與自建卡組載入、分區標題 (sections) 支援、JSON 驗證匯入匯出與非破壞性洗牌 */

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

function buildCardSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return [];
  const result = [];
  for (const sec of sections) {
    const title = typeof sec?.title === 'string' ? sec.title.trim() : '';
    const cards = Array.isArray(sec?.cards) ? sec.cards : [];
    for (let i = 0; i < cards.length; i += 1) {
      result.push(title);
    }
  }
  return result;
}

function normalizeDeckContent(rawObj) {
  if (Array.isArray(rawObj?.sections) && rawObj.sections.length > 0) {
    const validSections = [];
    const flatCards = [];
    const cardSections = [];
    for (const sec of rawObj.sections) {
      const title = typeof sec?.title === 'string' ? sec.title.trim() : '';
      const rawCards = Array.isArray(sec?.cards) ? sec.cards : [];
      const { validCards } = normalizeCardList(rawCards);
      if (validCards.length > 0) {
        validSections.push({ title, cards: validCards });
        flatCards.push(...validCards);
        for (let i = 0; i < validCards.length; i += 1) {
          cardSections.push(title);
        }
      }
    }
    return { cards: flatCards, sections: validSections, cardSections };
  }

  const rawCards = Array.isArray(rawObj?.cards) ? rawObj.cards : [];
  const { validCards } = normalizeCardList(rawCards);
  return { cards: validCards, sections: undefined, cardSections: [] };
}

/**
 * 從 ./decks/index.json 載入全部內建卡組檔案。
 * @returns {Promise<Array<{ id: string, filename: string, name: string, cards: string[], sections?: Array<{ title: string, cards: string[] }>, cardSections: string[], builtin: true }>>}
 */
export async function loadBuiltinDecks() {
  const indexRes = await fetch('./decks/index.json');
  if (!indexRes.ok) {
    throw new Error(`無法載入內建卡組清單 (${indexRes.status})`);
  }
  const filenames = await indexRes.json();
  if (!Array.isArray(filenames)) return [];

  const loaded = await Promise.all(
    filenames.map(async (filename) => {
      const res = await fetch(`./decks/${filename}`);
      if (!res.ok) throw new Error(`無法載入卡組：${filename}`);
      const data = await res.json();
      const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : filename;
      const { cards, sections, cardSections } = normalizeDeckContent(data);
      return {
        id: `builtin:${filename}`,
        filename,
        name,
        cards,
        ...(sections ? { sections } : {}),
        cardSections,
        builtin: true,
      };
    })
  );

  return loaded.filter((d) => d.cards.length > 0);
}

/**
 * 合併內建卡組與使用者自建卡組清單。
 * @param {Array} builtinDecks
 * @returns {Array}
 */
export function getAllDecks(builtinDecks) {
  const custom = loadCustomDecks().map((d) => {
    const hasSections = Array.isArray(d.sections) && d.sections.length > 0;
    return {
      ...d,
      cardSections: hasSections ? buildCardSections(d.sections) : [],
      builtin: false,
    };
  });
  return [...builtinDecks, ...custom];
}

/**
 * 驗證匯入的卡組 JSON 格式（支援 cards 或 sections）與經文出處是否皆存在於經文庫。
 * @param {string | object} rawInput
 * @returns {{ ok: boolean, deck?: { name: string, cards: string[], sections?: Array<{ title: string, cards: string[] }> }, invalidRefs?: string[], error?: string }}
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
    return { ok: false, error: '卡組格式須為包含 name 與 cards（或 sections）的 JSON 物件。' };
  }

  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) {
    return { ok: false, error: '請提供非空白的卡組名稱 (name)。' };
  }

  if (Array.isArray(obj.sections)) {
    if (obj.sections.length === 0) {
      return { ok: false, error: 'sections 須為至少包含一個分區的陣列。' };
    }

    const validSections = [];
    const flatCards = [];
    const allInvalid = [];

    for (const sec of obj.sections) {
      if (!sec || typeof sec !== 'object' || Array.isArray(sec)) {
        return { ok: false, error: 'sections 內每一項皆須為包含 title 與 cards 的物件。' };
      }
      const title = typeof sec.title === 'string' ? sec.title.trim() : '';
      if (!title) {
        return { ok: false, error: '每個分區皆須提供非空白的 title。' };
      }
      if (!Array.isArray(sec.cards) || sec.cards.length === 0) {
        return { ok: false, error: '每個分區的 cards 須為至少包含一張經文的陣列。' };
      }
      const { validCards, invalidRefs } = normalizeCardList(sec.cards);
      if (invalidRefs.length > 0) {
        allInvalid.push(...invalidRefs);
      }
      validSections.push({ title, cards: validCards });
      flatCards.push(...validCards);
    }

    if (allInvalid.length > 0) {
      return {
        ok: false,
        invalidRefs: allInvalid,
        error: `以下經文出處無法於經文庫中找到或格式不符：${allInvalid.join('、')}`,
      };
    }

    return { ok: true, deck: { name, cards: flatCards, sections: validSections } };
  }

  if (!Array.isArray(obj.cards) || obj.cards.length === 0) {
    return { ok: false, error: '請提供非空的 cards 或 sections 陣列。' };
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
 * 將卡組序列化為共用標準 JSON 格式（永遠保留原卡片與分區順序，不受洗牌狀態影響）。
 * @param {{ name: string, cards: string[], sections?: Array<{ title: string, cards: string[] }> }} deck
 * @returns {string}
 */
export function serializeDeck(deck) {
  if (Array.isArray(deck.sections) && deck.sections.length > 0) {
    return JSON.stringify(
      {
        name: deck.name,
        sections: deck.sections.map((s) => ({ title: s.title, cards: s.cards })),
      },
      null,
      2
    );
  }
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
 * 以 Fisher-Yates 演算法產生僅用於記憶體顯示的洗牌索引陣列，絕不更動原卡組 JSON。
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
