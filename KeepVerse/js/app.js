/* v1.3.5 - KeepVerse 主應用控制器：修正 Android 外部 App 跳轉誤判為已安裝 PWA */

import {
  formatRef,
  getBooks,
  getChapters,
  getPassageText,
  getRefLang,
  getVerses,
  loadBible,
  translateBookName,
} from './bible.js';
import {
  createShuffledOrder,
  getAllDecks,
  loadBuiltinDecks,
  serializeDeck,
  validateDeckJson,
} from './decks.js';
import { compareVerse, generateRandomBlanks, toEnglishInitials } from './diff.js';
import {
  formatRelativeMastery,
  getCardLevel,
  getDeckLastCard,
  getMastery,
  loadCustomDecks,
  loadMasteryMap,
  loadPrefs,
  recordMastery,
  saveCardLevel,
  saveCustomDecks,
  saveDeckLastCard,
  savePrefs,
} from './storage.js';
import { toZhuyinInitials } from './zhuyin.js';

const THEME_ICONS = {
  system: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
};

const THEME_LABELS = {
  system: '深淺色：跟隨系統',
  light: '深淺色：淺色',
  dark: '深淺色：深色',
};

const SVG = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  retry: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  nextLevel: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
};

const state = {
  builtinDecks: [],
  decks: [],
  activeDeckId: null,
  displayOrder: [],
  isShuffled: false,
  orderPos: 0,
  level: 1,
  blankCache: new Map(),
  theme: 'system',
  isComposing: false,
  editor: {
    editingDeckId: null,
    cards: [],
    pickerLang: 'zh',
  },
};

const el = {
  levelBtns: Array.from(document.querySelectorAll('.level-btn')),
  level3Btn: document.getElementById('level3Btn'),
  level3Glyph: document.getElementById('level3Glyph'),
  installBtn: document.getElementById('installBtn'),
  menuBtn: document.getElementById('menuBtn'),
  shuffleDot: document.getElementById('shuffleDot'),
  cardSection: document.getElementById('cardSection'),
  cardRef: document.getElementById('cardRef'),
  cardCounter: document.getElementById('cardCounter'),
  verseFull: document.getElementById('verseFull'),
  level1Actions: document.getElementById('level1Actions'),
  level1NextBtn: document.getElementById('level1NextBtn'),
  quizArea: document.getElementById('quizArea'),
  hintText: document.getElementById('hintText'),
  inputWrap: document.getElementById('inputWrap'),
  recallInput: document.getElementById('recallInput'),
  submitBtn: document.getElementById('submitBtn'),
  checkResult: document.getElementById('checkResult'),
  postCheckActions: document.getElementById('postCheckActions'),
  cardMastery: document.getElementById('cardMastery'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  drawerBackdrop: document.getElementById('drawerBackdrop'),
  drawer: document.getElementById('drawer'),
  drawerDeckName: document.getElementById('drawerDeckName'),
  drawerShuffleBadge: document.getElementById('drawerShuffleBadge'),
  shuffleBtn: document.getElementById('shuffleBtn'),
  unshuffleBtn: document.getElementById('unshuffleBtn'),
  themeBtn: document.getElementById('themeBtn'),
  themeIcon: document.getElementById('themeIcon'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn'),
  drawerMainView: document.getElementById('drawerMainView'),
  tabCards: document.getElementById('tabCards'),
  tabDecks: document.getElementById('tabDecks'),
  panelCards: document.getElementById('panelCards'),
  panelDecks: document.getElementById('panelDecks'),
  cardList: document.getElementById('cardList'),
  deckList: document.getElementById('deckList'),
  newDeckBtn: document.getElementById('newDeckBtn'),
  openImportBtn: document.getElementById('openImportBtn'),
  editorView: document.getElementById('editorView'),
  editorBackBtn: document.getElementById('editorBackBtn'),
  editorTitle: document.getElementById('editorTitle'),
  editorSectionNotice: document.getElementById('editorSectionNotice'),
  editorNameInput: document.getElementById('editorNameInput'),
  pickLangZh: document.getElementById('pickLangZh'),
  pickLangEn: document.getElementById('pickLangEn'),
  pickBook: document.getElementById('pickBook'),
  pickChapter: document.getElementById('pickChapter'),
  pickStartVerse: document.getElementById('pickStartVerse'),
  pickEndVerse: document.getElementById('pickEndVerse'),
  pickerPreview: document.getElementById('pickerPreview'),
  addCardBtn: document.getElementById('addCardBtn'),
  editorCardCount: document.getElementById('editorCardCount'),
  editorCardList: document.getElementById('editorCardList'),
  editorError: document.getElementById('editorError'),
  saveDeckBtn: document.getElementById('saveDeckBtn'),
  ioView: document.getElementById('ioView'),
  ioBackBtn: document.getElementById('ioBackBtn'),
  ioTitle: document.getElementById('ioTitle'),
  exportPane: document.getElementById('exportPane'),
  exportTextarea: document.getElementById('exportTextarea'),
  copyJsonBtn: document.getElementById('copyJsonBtn'),
  downloadJsonBtn: document.getElementById('downloadJsonBtn'),
  importPane: document.getElementById('importPane'),
  importFileInput: document.getElementById('importFileInput'),
  importTextarea: document.getElementById('importTextarea'),
  importError: document.getElementById('importError'),
  confirmImportBtn: document.getElementById('confirmImportBtn'),
  iosInstallBackdrop: document.getElementById('iosInstallBackdrop'),
  iosInstallModal: document.getElementById('iosInstallModal'),
  closeIosInstallBtn: document.getElementById('closeIosInstallBtn'),
  confirmIosInstallBtn: document.getElementById('confirmIosInstallBtn'),
  toast: document.getElementById('toast'),
};

let toastTimer = null;
let exportingDeckName = 'deck';
let deferredInstallPrompt = window.__kvDeferredPrompt || null;

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2200);
}

function applyTheme(theme) {
  state.theme = theme;
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  el.themeIcon.innerHTML = THEME_ICONS[theme];
  el.themeBtn.setAttribute('aria-label', THEME_LABELS[theme]);
  el.themeBtn.setAttribute('title', THEME_LABELS[theme]);
}

function getActiveDeck() {
  return state.decks.find((d) => d.id === state.activeDeckId) || state.decks[0] || null;
}

function getCurrentRef() {
  const deck = getActiveDeck();
  if (!deck || state.displayOrder.length === 0) return '';
  const cardIdx = state.displayOrder[state.orderPos];
  return deck.cards[cardIdx] || '';
}

function getCurrentSection() {
  const deck = getActiveDeck();
  if (!deck || state.displayOrder.length === 0) return '';
  const cardIdx = state.displayOrder[state.orderPos];
  return deck.cardSections?.[cardIdx] || '';
}

function clearRecallSession() {
  el.inputWrap.hidden = false;
  el.recallInput.value = '';
  el.checkResult.innerHTML = '';
  el.checkResult.hidden = true;
  el.postCheckActions.innerHTML = '';
  el.postCheckActions.hidden = true;
}

function restoreCardContext() {
  const deck = getActiveDeck();
  const ref = getCurrentRef();
  state.level = ref ? getCardLevel(ref) : 1;
  if (deck && ref) {
    saveDeckLastCard(deck.id, ref);
  }
}

function resetDisplayOrder(deck) {
  const count = deck ? deck.cards.length : 0;
  state.displayOrder = Array.from({ length: count }, (_, idx) => idx);
  state.isShuffled = false;
  state.orderPos = 0;
  state.blankCache.clear();
}

function selectDeck(deckId, { closeDrawerAfter = false } = {}) {
  const deck = state.decks.find((d) => d.id === deckId) || state.decks[0];
  if (!deck) return;
  state.activeDeckId = deck.id;
  resetDisplayOrder(deck);
  const lastRef = getDeckLastCard(deck.id);
  const savedIdx = lastRef ? deck.cards.indexOf(lastRef) : -1;
  state.orderPos = savedIdx >= 0 ? savedIdx : 0;
  restoreCardContext();
  clearRecallSession();
  savePrefs({ activeDeckId: deck.id, theme: state.theme });
  renderAll();
  if (closeDrawerAfter) closeDrawer();
}

function renderShuffleIndicators() {
  el.shuffleDot.hidden = !state.isShuffled;
  el.drawerShuffleBadge.hidden = !state.isShuffled;
  el.unshuffleBtn.hidden = !state.isShuffled;
}

function renderCard() {
  const deck = getActiveDeck();
  const total = state.displayOrder.length;
  const ref = getCurrentRef();

  el.levelBtns.forEach((btn) => {
    const active = Number(btn.dataset.level) === state.level;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  if (!deck || total === 0 || !ref) {
    el.cardSection.textContent = '';
    el.cardSection.hidden = true;
    el.cardRef.textContent = '尚無經文';
    el.cardCounter.textContent = '0/0';
    el.verseFull.textContent = '';
    el.verseFull.hidden = false;
    el.level1Actions.hidden = true;
    el.quizArea.hidden = true;
    el.cardMastery.textContent = '還沒背熟';
    el.level3Glyph.textContent = 'ㄅ';
    el.level3Btn.setAttribute('aria-label', '剩注音聲母');
    el.level3Btn.setAttribute('title', '剩注音聲母');
    el.verseFull.classList.remove('is-english');
    el.hintText.classList.remove('is-english');
    el.checkResult.classList.remove('is-english');
    return;
  }

  const lang = getRefLang(ref);
  const isEn = lang === 'en';
  const text = getPassageText(ref);

  el.level3Glyph.textContent = isEn ? 'A' : 'ㄅ';
  const level3Label = isEn ? '剩單字首字母' : '剩注音聲母';
  el.level3Btn.setAttribute('aria-label', level3Label);
  el.level3Btn.setAttribute('title', level3Label);
  el.verseFull.classList.toggle('is-english', isEn);
  el.hintText.classList.toggle('is-english', isEn);
  el.checkResult.classList.toggle('is-english', isEn);

  const section = getCurrentSection();
  el.cardSection.textContent = section;
  el.cardSection.hidden = !section;
  el.cardRef.textContent = ref;
  el.cardCounter.textContent = `${state.orderPos + 1}/${total}`;
  el.cardMastery.textContent = formatRelativeMastery(getMastery(ref));

  if (state.level === 1) {
    el.verseFull.textContent = text;
    el.verseFull.classList.toggle('is-long', isEn ? text.length > 180 : text.length > 75);
    el.verseFull.hidden = false;
    el.level1Actions.hidden = false;
    el.quizArea.hidden = true;
    return;
  }

  el.verseFull.hidden = true;
  el.level1Actions.hidden = true;
  el.quizArea.hidden = false;

  if (state.level === 2) {
    if (!state.blankCache.has(state.orderPos)) {
      state.blankCache.set(state.orderPos, generateRandomBlanks(text, lang));
    }
    el.hintText.textContent = state.blankCache.get(state.orderPos);
    el.hintText.hidden = false;
  } else if (state.level === 3) {
    el.hintText.textContent = isEn ? toEnglishInitials(text) : toZhuyinInitials(text);
    el.hintText.hidden = false;
  } else {
    el.hintText.textContent = '';
    el.hintText.hidden = true;
  }
}

function renderCardList() {
  const deck = getActiveDeck();
  el.cardList.innerHTML = '';
  if (!deck) return;

  const masteryMap = loadMasteryMap();
  let lastSection = '';
  state.displayOrder.forEach((cardIdx, pos) => {
    const ref = deck.cards[cardIdx];
    if (!state.isShuffled) {
      const secTitle = deck.cardSections?.[cardIdx] || '';
      if (secTitle && secTitle !== lastSection) {
        const headerLi = document.createElement('li');
        headerLi.className = 'list-section-header';
        headerLi.textContent = secTitle;
        el.cardList.appendChild(headerLi);
        lastSection = secTitle;
      }
    }
    const li = document.createElement('li');
    li.className = 'list-row';
    if (pos === state.orderPos) li.classList.add('is-active');

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = `${pos + 1}. ${ref}`;

    const meta = document.createElement('span');
    meta.className = 'row-meta';
    meta.textContent = formatRelativeMastery(masteryMap[ref] || null);

    li.append(title, meta);
    li.addEventListener('click', () => {
      if (pos !== state.orderPos) {
        state.blankCache.clear();
      }
      state.orderPos = pos;
      restoreCardContext();
      clearRecallSession();
      renderAll();
      closeDrawer();
    });
    el.cardList.appendChild(li);
  });
}

function createIconActionButton(svgHtml, label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  btn.innerHTML = svgHtml;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function renderDeckList() {
  el.deckList.innerHTML = '';
  const activeDeck = getActiveDeck();

  state.decks.forEach((deck) => {
    const li = document.createElement('li');
    li.className = 'list-row';
    if (activeDeck && deck.id === activeDeck.id) li.classList.add('is-active');

    const main = document.createElement('div');
    main.className = 'row-main';

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = deck.name;

    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = `${deck.cards.length} 張卡片`;

    main.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (deck.builtin) {
      actions.appendChild(
        createIconActionButton(SVG.copy, '複製卡組', () => copyDeckToCustom(deck))
      );
      actions.appendChild(
        createIconActionButton(SVG.export, '匯出卡組', () => openExportView(deck))
      );
    } else {
      actions.appendChild(
        createIconActionButton(SVG.edit, '編輯卡組', () => openEditorView(deck))
      );
      actions.appendChild(
        createIconActionButton(SVG.export, '匯出卡組', () => openExportView(deck))
      );
      actions.appendChild(
        createIconActionButton(SVG.trash, '刪除卡組', () => deleteCustomDeck(deck))
      );
    }

    li.append(main, actions);
    li.addEventListener('click', () => selectDeck(deck.id, { closeDrawerAfter: true }));
    el.deckList.appendChild(li);
  });
}

function renderAll() {
  const deck = getActiveDeck();
  el.drawerDeckName.textContent = deck ? deck.name : 'KeepVerse';
  renderShuffleIndicators();
  renderCard();
  renderCardList();
  renderDeckList();
}

function setLevel(newLevel) {
  if (state.level === newLevel) return;
  state.level = newLevel;
  saveCardLevel(getCurrentRef(), newLevel);
  clearRecallSession();
  renderCard();
}

function stepCard(delta) {
  const total = state.displayOrder.length;
  if (total === 0) return;
  state.orderPos = (state.orderPos + delta + total) % total;
  state.blankCache.clear();
  restoreCardContext();
  clearRecallSession();
  renderAll();
}

function createPostCheckBtn(svgHtml, label, primary, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = primary ? 'pill-btn primary-pill' : 'pill-btn';
  btn.innerHTML = `${svgHtml}<span>${label}</span>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderPostCheckActions(isSuccess) {
  el.postCheckActions.innerHTML = '';
  if (isSuccess) {
    if (state.level === 4) {
      el.postCheckActions.appendChild(
        createPostCheckBtn(SVG.nextLevel, '下一張卡片', true, () => {
          stepCard(1);
        })
      );
      el.postCheckActions.hidden = false;
      return;
    }
    if (state.level !== 2 && state.level !== 3) {
      el.postCheckActions.hidden = true;
      return;
    }
    el.postCheckActions.appendChild(
      createPostCheckBtn(SVG.retry, '再練一次', false, () => {
        clearRecallSession();
        if (state.level === 2) {
          state.blankCache.delete(state.orderPos);
          renderCard();
        }
        el.recallInput.focus();
      })
    );
    el.postCheckActions.appendChild(
      createPostCheckBtn(SVG.nextLevel, '下個難度', true, () => {
        setLevel(state.level + 1);
        el.recallInput.focus();
      })
    );
    el.postCheckActions.hidden = false;
    return;
  }

  el.postCheckActions.appendChild(
    createPostCheckBtn(SVG.retry, '再練一次', false, () => {
      clearRecallSession();
      el.recallInput.focus();
    })
  );
  el.postCheckActions.hidden = false;
}

function runCheck() {
  if (state.level === 1) return;
  const ref = getCurrentRef();
  if (!ref) return;
  const lang = getRefLang(ref);
  const expected = getPassageText(ref);
  const res = compareVerse(expected, el.recallInput.value, lang);

  el.recallInput.blur();
  el.inputWrap.hidden = true;
  el.checkResult.innerHTML = '';
  el.checkResult.hidden = false;

  if (res.ok) {
    const msg = document.createElement('div');
    msg.className = 'check-success';
    if (state.level === 4) {
      const iso = recordMastery(ref);
      saveCardLevel(ref, 1);
      el.cardMastery.textContent = formatRelativeMastery(iso);
      msg.textContent = '恭喜！完全正確，已更新上次背熟時間。';
      renderCardList();
    } else {
      msg.textContent = '恭喜！經文背誦完全正確。';
    }
    el.checkResult.appendChild(msg);
    renderPostCheckActions(true);
    return;
  }

  const frag = document.createDocumentFragment();
  res.segments.forEach((seg) => {
    if (seg.type === 'equal') {
      const span = document.createElement('span');
      span.className = 'diff-eq';
      span.textContent = seg.text;
      frag.appendChild(span);
    } else if (seg.type === 'extra') {
      const del = document.createElement('del');
      del.className = 'diff-extra';
      del.textContent = seg.text;
      frag.appendChild(del);
    } else {
      const strong = document.createElement('strong');
      strong.className = 'diff-missing';
      strong.textContent = seg.text;
      frag.appendChild(strong);
    }
  });
  el.checkResult.appendChild(frag);
  renderPostCheckActions(false);
}

/* 抽屜視圖切換 */
function showDrawerView(viewName) {
  el.drawerMainView.hidden = viewName !== 'main';
  el.editorView.hidden = viewName !== 'editor';
  el.ioView.hidden = viewName !== 'io';
}

function setDrawerTab(tab) {
  const isCards = tab === 'cards';
  el.tabCards.classList.toggle('is-active', isCards);
  el.tabDecks.classList.toggle('is-active', !isCards);
  el.tabCards.setAttribute('aria-selected', String(isCards));
  el.tabDecks.setAttribute('aria-selected', String(!isCards));
  el.panelCards.hidden = !isCards;
  el.panelDecks.hidden = isCards;
}

function openDrawer() {
  renderCardList();
  renderDeckList();
  showDrawerView('main');
  el.drawerBackdrop.hidden = false;
  el.drawer.hidden = false;
}

function closeDrawer() {
  el.drawerBackdrop.hidden = true;
  el.drawer.hidden = true;
}

/* 洗牌（僅變動記憶體 displayOrder，不動 JSON） */
function shuffleCurrentDeck() {
  const deck = getActiveDeck();
  if (!deck || deck.cards.length <= 1) {
    showToast('至少需要兩張卡片才可洗牌');
    return;
  }
  state.displayOrder = createShuffledOrder(deck.cards.length);
  state.isShuffled = true;
  state.orderPos = 0;
  state.blankCache.clear();
  restoreCardContext();
  clearRecallSession();
  renderAll();
  showToast('已洗牌（不更動原卡組順序）');
}

function unshuffleCurrentDeck() {
  const deck = getActiveDeck();
  if (!deck) return;
  resetDisplayOrder(deck);
  restoreCardContext();
  clearRecallSession();
  renderAll();
  showToast('已恢復原順序');
}

/* 複製／刪除自建卡組 */
function copyDeckToCustom(deck) {
  const custom = loadCustomDecks();
  const newDeck = {
    id: `custom:${Date.now()}`,
    name: `${deck.name}（副本）`,
    cards: [...deck.cards],
    ...(deck.sections?.length
      ? { sections: deck.sections.map((s) => ({ title: s.title, cards: [...s.cards] })) }
      : {}),
  };
  custom.push(newDeck);
  saveCustomDecks(custom);
  state.decks = getAllDecks(state.builtinDecks);
  selectDeck(newDeck.id);
  setDrawerTab('decks');
  showToast('已複製卡組');
}

function deleteCustomDeck(deck) {
  if (!window.confirm(`確定要刪除「${deck.name}」嗎？`)) return;
  const custom = loadCustomDecks().filter((d) => d.id !== deck.id);
  saveCustomDecks(custom);
  state.decks = getAllDecks(state.builtinDecks);
  if (state.activeDeckId === deck.id) {
    selectDeck(state.decks[0]?.id || null);
  } else {
    renderAll();
  }
  showToast('已刪除卡組');
}

/* 自建／編輯卡組與同章起迄經文選取器 */
function fillSelect(selectEl, items, suffix = '') {
  selectEl.innerHTML = '';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = String(item);
    opt.textContent = `${item}${suffix}`;
    selectEl.appendChild(opt);
  });
}

function updatePickerPreview() {
  const ref = formatRef({
    book: el.pickBook.value,
    chapter: Number(el.pickChapter.value),
    startVerse: Number(el.pickStartVerse.value),
    endVerse: Number(el.pickEndVerse.value),
  });
  el.pickerPreview.classList.toggle('is-english', state.editor.pickerLang === 'en');
  el.pickerPreview.textContent = getPassageText(ref);
}

function syncEndVerseOptions(preferredEnd = null) {
  const book = el.pickBook.value;
  const chapter = Number(el.pickChapter.value);
  const start = Number(el.pickStartVerse.value);
  const verses = getVerses(book, chapter).filter((v) => v >= start);
  fillSelect(el.pickEndVerse, verses, '節');
  if (preferredEnd && verses.includes(preferredEnd)) {
    el.pickEndVerse.value = String(preferredEnd);
  } else {
    el.pickEndVerse.value = String(start);
  }
  updatePickerPreview();
}

function syncStartVerseOptions(preferredStart = null, preferredEnd = null) {
  const book = el.pickBook.value;
  const chapter = Number(el.pickChapter.value);
  const verses = getVerses(book, chapter);
  fillSelect(el.pickStartVerse, verses, '節');
  if (preferredStart && verses.includes(preferredStart)) {
    el.pickStartVerse.value = String(preferredStart);
  }
  syncEndVerseOptions(preferredEnd);
}

function syncChapterOptions(preferredChapter = null, preferredStart = null, preferredEnd = null) {
  const chapters = getChapters(el.pickBook.value);
  fillSelect(el.pickChapter, chapters, '章');
  if (preferredChapter && chapters.includes(preferredChapter)) {
    el.pickChapter.value = String(preferredChapter);
  }
  syncStartVerseOptions(preferredStart, preferredEnd);
}

function setPickerLang(lang) {
  state.editor.pickerLang = lang;
  const isEn = lang === 'en';
  el.pickLangZh.classList.toggle('is-active', !isEn);
  el.pickLangEn.classList.toggle('is-active', isEn);
  el.pickLangZh.setAttribute('aria-pressed', String(!isEn));
  el.pickLangEn.setAttribute('aria-pressed', String(isEn));

  const prevBook = el.pickBook.value;
  const prevChap = Number(el.pickChapter.value);
  const prevStart = Number(el.pickStartVerse.value);
  const prevEnd = Number(el.pickEndVerse.value);

  const books = getBooks(lang);
  fillSelect(el.pickBook, books);
  const translated = translateBookName(prevBook, lang);
  const fallback = isEn ? 'John' : '約翰福音';
  el.pickBook.value = books.includes(translated) ? translated : (books.includes(fallback) ? fallback : books[0]);

  syncChapterOptions(prevChap, prevStart, prevEnd);
}

function initPicker() {
  state.editor.pickerLang = 'zh';
  const books = getBooks('zh');
  fillSelect(el.pickBook, books);
  if (books.includes('約翰福音')) {
    el.pickBook.value = '約翰福音';
  }
  syncChapterOptions(3, 16, 16);
}

function renderEditorCards() {
  el.editorCardCount.textContent = String(state.editor.cards.length);
  el.editorCardList.innerHTML = '';

  state.editor.cards.forEach((ref, idx) => {
    const li = document.createElement('li');
    li.className = 'list-row';

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = `${idx + 1}. ${ref}`;

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (idx > 0) {
      actions.appendChild(
        createIconActionButton(SVG.up, '上移', () => {
          const list = state.editor.cards;
          [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
          renderEditorCards();
        })
      );
    }
    if (idx < state.editor.cards.length - 1) {
      actions.appendChild(
        createIconActionButton(SVG.down, '下移', () => {
          const list = state.editor.cards;
          [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
          renderEditorCards();
        })
      );
    }
    actions.appendChild(
      createIconActionButton(SVG.remove, '移除卡片', () => {
        state.editor.cards.splice(idx, 1);
        renderEditorCards();
      })
    );

    li.append(title, actions);
    el.editorCardList.appendChild(li);
  });
}

function openEditorView(deck = null) {
  state.editor.editingDeckId = deck ? deck.id : null;
  state.editor.cards = deck ? [...deck.cards] : [];
  el.editorTitle.textContent = deck ? '編輯卡組' : '自建卡組';
  el.editorSectionNotice.hidden = !(deck?.sections?.length > 0);
  el.editorNameInput.value = deck ? deck.name : '';
  el.editorError.hidden = true;
  renderEditorCards();
  showDrawerView('editor');
}

function saveEditorDeck() {
  const name = el.editorNameInput.value.trim();
  if (!name) {
    el.editorError.textContent = '請輸入卡組名稱。';
    el.editorError.hidden = false;
    return;
  }
  if (state.editor.cards.length === 0) {
    el.editorError.textContent = '請至少加入一張經文卡片。';
    el.editorError.hidden = false;
    return;
  }

  const custom = loadCustomDecks();
  let targetId = state.editor.editingDeckId;

  if (targetId) {
    const idx = custom.findIndex((d) => d.id === targetId);
    if (idx !== -1) {
      custom[idx] = { id: targetId, name, cards: [...state.editor.cards] };
    }
  } else {
    targetId = `custom:${Date.now()}`;
    custom.push({ id: targetId, name, cards: [...state.editor.cards] });
  }

  saveCustomDecks(custom);
  state.decks = getAllDecks(state.builtinDecks);
  selectDeck(targetId);
  setDrawerTab('decks');
  showDrawerView('main');
  showToast('已儲存卡組');
}

/* 匯出／匯入 */
function openExportView(deck) {
  exportingDeckName = deck.name;
  el.ioTitle.textContent = `匯出：${deck.name}`;
  el.exportTextarea.value = serializeDeck(deck);
  el.exportPane.hidden = false;
  el.importPane.hidden = true;
  showDrawerView('io');
}

function openImportView() {
  el.ioTitle.textContent = '匯入卡組';
  el.importTextarea.value = '';
  el.importFileInput.value = '';
  el.importError.hidden = true;
  el.exportPane.hidden = true;
  el.importPane.hidden = false;
  showDrawerView('io');
}

function handleConfirmImport() {
  const result = validateDeckJson(el.importTextarea.value);
  if (!result.ok) {
    el.importError.textContent = result.error;
    el.importError.hidden = false;
    return;
  }

  const custom = loadCustomDecks();
  const newDeck = {
    id: `custom:${Date.now()}`,
    name: result.deck.name,
    cards: result.deck.cards,
    ...(result.deck.sections?.length ? { sections: result.deck.sections } : {}),
  };
  custom.push(newDeck);
  saveCustomDecks(custom);
  state.decks = getAllDecks(state.builtinDecks);
  selectDeck(newDeck.id, { closeDrawerAfter: true });
  showToast(`已匯入「${newDeck.name}」`);
}

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function updateInstallBtnVisibility() {
  el.installBtn.hidden = isStandaloneMode() || (!deferredInstallPrompt && !isIosDevice());
}

function openIosInstallModal() {
  el.iosInstallBackdrop.hidden = false;
  el.iosInstallModal.hidden = false;
}

function closeIosInstallModal() {
  el.iosInstallBackdrop.hidden = true;
  el.iosInstallModal.hidden = true;
}

async function handleInstallClick() {
  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    window.__kvDeferredPrompt = null;
    updateInstallBtnVisibility();
    await promptEvent.prompt();
    try {
      await promptEvent.userChoice;
    } catch {
      // Ignore canceled prompt error
    }
    return;
  }
  if (isIosDevice()) {
    openIosInstallModal();
  }
}

function bindEvents() {
  el.levelBtns.forEach((btn) => {
    btn.addEventListener('click', () => setLevel(Number(btn.dataset.level)));
  });

  el.prevBtn.addEventListener('click', () => stepCard(-1));
  el.nextBtn.addEventListener('click', () => stepCard(1));
  el.level1NextBtn.addEventListener('click', () => {
    setLevel(2);
    el.recallInput.focus();
  });

  el.recallInput.addEventListener('compositionstart', () => {
    state.isComposing = true;
  });
  el.recallInput.addEventListener('compositionend', () => {
    state.isComposing = false;
  });
  el.recallInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (state.isComposing || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    runCheck();
  });
  el.submitBtn.addEventListener('click', runCheck);

  el.installBtn.addEventListener('click', handleInstallClick);
  el.closeIosInstallBtn.addEventListener('click', closeIosInstallModal);
  el.confirmIosInstallBtn.addEventListener('click', closeIosInstallModal);
  el.iosInstallBackdrop.addEventListener('click', closeIosInstallModal);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    window.__kvDeferredPrompt = e;
    updateInstallBtnVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    window.__kvDeferredPrompt = null;
    updateInstallBtnVisibility();
    showToast('已安裝 KeepVerse');
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallBtnVisibility);

  el.menuBtn.addEventListener('click', openDrawer);
  el.closeDrawerBtn.addEventListener('click', closeDrawer);
  el.drawerBackdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.iosInstallModal.hidden) {
      closeIosInstallModal();
      return;
    }
    if (!el.drawer.hidden) closeDrawer();
  });

  el.shuffleBtn.addEventListener('click', shuffleCurrentDeck);
  el.unshuffleBtn.addEventListener('click', unshuffleCurrentDeck);
  el.themeBtn.addEventListener('click', () => {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    applyTheme(next);
    savePrefs({ activeDeckId: state.activeDeckId, theme: next });
    showToast(THEME_LABELS[next]);
  });

  el.tabCards.addEventListener('click', () => setDrawerTab('cards'));
  el.tabDecks.addEventListener('click', () => setDrawerTab('decks'));
  el.newDeckBtn.addEventListener('click', () => openEditorView(null));
  el.openImportBtn.addEventListener('click', openImportView);

  el.editorBackBtn.addEventListener('click', () => showDrawerView('main'));
  el.ioBackBtn.addEventListener('click', () => showDrawerView('main'));

  el.pickLangZh.addEventListener('click', () => setPickerLang('zh'));
  el.pickLangEn.addEventListener('click', () => setPickerLang('en'));
  el.pickBook.addEventListener('change', () => syncChapterOptions());
  el.pickChapter.addEventListener('change', () => syncStartVerseOptions());
  el.pickStartVerse.addEventListener('change', () => {
    syncEndVerseOptions(Number(el.pickStartVerse.value));
  });
  el.pickEndVerse.addEventListener('change', updatePickerPreview);

  el.addCardBtn.addEventListener('click', () => {
    const ref = formatRef({
      book: el.pickBook.value,
      chapter: Number(el.pickChapter.value),
      startVerse: Number(el.pickStartVerse.value),
      endVerse: Number(el.pickEndVerse.value),
    });
    if (!ref) return;
    state.editor.cards.push(ref);
    el.editorError.hidden = true;
    renderEditorCards();
    showToast(`已加入 ${ref}`);
  });
  el.saveDeckBtn.addEventListener('click', saveEditorDeck);

  el.copyJsonBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.exportTextarea.value);
      showToast('已複製到剪貼簿');
    } catch {
      el.exportTextarea.select();
      document.execCommand('copy');
      showToast('已複製到剪貼簿');
    }
  });

  el.downloadJsonBtn.addEventListener('click', () => {
    const blob = new Blob([el.exportTextarea.value], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportingDeckName.replace(/[\\/:*?"<>|]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  el.importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    el.importTextarea.value = await file.text();
    el.importError.hidden = true;
  });

  el.confirmImportBtn.addEventListener('click', handleConfirmImport);
}

async function init() {
  const prefs = loadPrefs();
  applyTheme(prefs.theme);
  updateInstallBtnVisibility();
  bindEvents();

  try {
    await loadBible();
    initPicker();
    state.builtinDecks = await loadBuiltinDecks();
    state.decks = getAllDecks(state.builtinDecks);

    const initialDeck =
      state.decks.find((d) => d.id === prefs.activeDeckId) || state.decks[0] || null;
    if (initialDeck) {
      selectDeck(initialDeck.id);
    } else {
      renderAll();
    }
  } catch (err) {
    el.cardRef.textContent = '載入失敗';
    el.verseFull.textContent = err?.message || '請確認網路連線或重新整理頁面。';
  }
}

init();
