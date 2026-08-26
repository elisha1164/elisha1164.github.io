// Version: 1.0.0 | Subject: 智慧語音評分選擇器、Markdown 清洗過濾與 TTS 播放循環控制

/**
 * 紙上聽聲 - 核心語音朗讀與應用邏輯
 */
(function () {
  'use strict';

  // DOM 元素快取
  const textInput = document.getElementById('textInput');
  const btnPlay = document.getElementById('btnPlay');
  const playIcon = document.getElementById('playIcon');
  const playText = document.getElementById('playText');
  const loopToggle = document.getElementById('loopToggle');
  const loopContainer = document.getElementById('loopContainer');
  const charCount = document.getElementById('charCount');
  const btnClear = document.getElementById('btnClear');
  const voiceBadgeText = document.getElementById('voiceBadgeText');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  // 播放狀態管理
  let isPlaying = false;
  let isLooping = false;
  let currentUtteranceIndex = 0;
  let textChunks = [];
  let availableVoices = [];
  let keepAliveTimer = null;

  // 常數設定
  const STORAGE_KEY_TEXT = 'light_tts_user_text';
  const STORAGE_KEY_LOOP = 'light_tts_loop_state';

  /**
   * 1. Markdown 語法清洗過濾器
   * 將使用者輸入的 Markdown 語法轉換為乾淨自然的純文字，供 TTS 引擎朗讀
   */
  function cleanMarkdown(mdText) {
    if (!mdText) return '';

    let text = mdText;

    // 移除程式碼區塊 ```code```
    text = text.replace(/```[\s\S]*?```/g, '');

    // 移除行內程式碼 `code`
    text = text.replace(/`([^`]+)`/g, '$1');

    // 移除圖片 ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');

    // 轉換連結 [title](url) -> title
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

    // 移除標題符號 (#, ##, ### 等)
    text = text.replace(/^#{1,6}\s+/gm, '');

    // 移除粗體與斜體 (***, **, *, ___, __, _)
    text = text.replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2');

    // 移除刪除線 (~~text~~)
    text = text.replace(/~~(.*?)~~/g, '$1');

    // 移除引用符號 (>)
    text = text.replace(/^\s*>\s+/gm, '');

    // 移除水平分割線 (---, ***, ___ 等)
    text = text.replace(/^[-*_]{3,}\s*$/gm, '');

    // 移除無序與有序清單符號 (-, *, +, 1.)
    text = text.replace(/^\s*[-*+]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');

    // 移除 HTML 標籤
    text = text.replace(/<[^>]+>/g, '');

    // 去除多餘空行與空白
    text = text.replace(/\n\s*\n/g, '\n');
    text = text.trim();

    return text;
  }

  /**
   * 2. 文本語言自動辨識
   */
  function detectTextLanguage(text) {
    if (!text || text.trim().length === 0) {
      return navigator.language || 'zh-TW';
    }

    // 判斷是否含有中文字元
    const hasChinese = /[\u4e00-\u9fa5]/.test(text);
    if (hasChinese) {
      // 依使用者瀏覽器語系偏好 zh-TW, zh-HK 或 zh-CN
      const navLang = (navigator.language || '').toLowerCase();
      if (navLang.includes('cn')) {
        return 'zh-CN';
      }
      if (navLang.includes('hk')) {
        return 'zh-HK';
      }
      return 'zh-TW';
    }

    // 判斷是否含有日文假名
    const hasJapanese = /[\u3040-\u30ff]/.test(text);
    if (hasJapanese) return 'ja-JP';

    // 判斷是否含有韓文字元
    const hasKorean = /[\uac00-\ud7af]/.test(text);
    if (hasKorean) return 'ko-KR';

    // 預設英語或其他語系
    return 'en-US';
  }

  /**
   * 3. 跨平台頂級自然語音權重評分引擎 (Smart Voice Scorer)
   * 支援 Windows (Online/Natural), macOS/iOS (Premium/Enhanced/Siri), Android (Google Network)
   */
  function calculateVoiceScore(voice, targetLang) {
    let score = 0;
    const vLang = (voice.lang || '').replace('_', '-');
    const vName = (voice.name || '').toLowerCase();
    const tLang = targetLang.replace('_', '-');

    // 1. 語言精確匹配 (+100) / 前綴匹配 (+50)
    if (vLang.toLowerCase() === tLang.toLowerCase()) {
      score += 100;
    } else if (vLang.split('-')[0].toLowerCase() === tLang.split('-')[0].toLowerCase()) {
      score += 50;
    } else {
      return -1; // 語言完全不符，剔除
    }

    // 2. 頂級神經網路 / 自然音質關鍵字加權 (+50 ~ +90)
    if (vName.includes('natural') || vName.includes('neural')) score += 90;
    if (vName.includes('premium')) score += 80;
    if (vName.includes('enhanced')) score += 70;
    if (vName.includes('siri')) score += 65;
    if (vName.includes('online')) score += 50;

    // 3. 雲端神經網路聲音加權 (Edge/Chrome/Android 雲端聲音 localService 為 false)
    if (voice.localService === false) {
      score += 40;
    }

    // 4. 品牌優質語音引擎加權
    if (vName.includes('google')) score += 25;
    if (vName.includes('microsoft')) score += 20;
    if (vName.includes('apple')) score += 15;

    // 5. 扣分項目：避開傳統生硬壓縮/舊版語音
    if (vName.includes('compact')) score -= 60;
    if (vName.includes('desktop')) score -= 40;
    if (vName.includes('espeak')) score -= 80;
    if (vName.includes('local')) score -= 10;

    return score;
  }

  /**
   * 挑選最適合的頂級語音
   */
  function getBestVoiceForText(text) {
    if (!availableVoices || availableVoices.length === 0) {
      if ('speechSynthesis' in window) {
        availableVoices = window.speechSynthesis.getVoices();
      }
    }

    if (!availableVoices || availableVoices.length === 0) return null;

    const targetLang = detectTextLanguage(text);
    let bestVoice = null;
    let highestScore = -100;

    for (const voice of availableVoices) {
      const score = calculateVoiceScore(voice, targetLang);
      if (score > highestScore) {
        highestScore = score;
        bestVoice = voice;
      }
    }

    // 若該語言無特定評分，嘗試取預設聲音
    if (!bestVoice) {
      bestVoice = availableVoices.find(v => v.default) || availableVoices[0];
    }

    return bestVoice;
  }

  /**
   * 更新畫面頂部的語音資訊徽章
   */
  function updateVoiceBadge(sampleText) {
    if (!('speechSynthesis' in window)) {
      voiceBadgeText.textContent = '此裝置瀏覽器不支援語音合成';
      return;
    }

    const voice = getBestVoiceForText(sampleText || textInput.value);
    if (voice) {
      const isHighQuality = (voice.name.toLowerCase().includes('natural') || 
                             voice.name.toLowerCase().includes('premium') || 
                             voice.name.toLowerCase().includes('enhanced') || 
                             voice.name.toLowerCase().includes('siri') || 
                             voice.localService === false);
      const icon = isHighQuality ? '✨' : '🌿';
      voiceBadgeText.textContent = `${icon} 最佳適配語音：${voice.name} (${voice.lang})`;
    } else {
      voiceBadgeText.textContent = '載入系統語音中...';
    }
  }

  /**
   * 4. 語意分句演算法 (防瀏覽器行動端長文本超時斷流)
   */
  function splitTextIntoSentences(text) {
    if (!text) return [];

    // 以標點符號與換行進行分句
    const sentenceEndings = /([。！？!?\n]+)/g;
    const parts = text.split(sentenceEndings);
    const result = [];
    let buffer = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      buffer += part;
      // 當累積到句子結尾或字數達到 80 字以上時切割
      if (sentenceEndings.test(part) || buffer.length >= 80) {
        if (buffer.trim().length > 0) {
          result.push(buffer.trim());
        }
        buffer = '';
      }
    }

    if (buffer.trim().length > 0) {
      result.push(buffer.trim());
    }

    return result.length > 0 ? result : [text];
  }

  /**
   * 5. TTS 播放控制
   */
  function playTextChunks() {
    if (currentUtteranceIndex >= textChunks.length) {
      // 朗讀完整文本完畢
      if (isLooping) {
        statusText.textContent = '單輪完畢，準備循環重播...';
        // 間隔短暫停頓後重新開始
        setTimeout(() => {
          if (isPlaying && isLooping) {
            currentUtteranceIndex = 0;
            playNextChunk();
          }
        }, 800);
      } else {
        stopSpeech();
      }
      return;
    }

    playNextChunk();
  }

  function playNextChunk() {
    if (!isPlaying) return;

    const chunk = textChunks[currentUtteranceIndex];
    if (!chunk) {
      currentUtteranceIndex++;
      playTextChunks();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    const bestVoice = getBestVoiceForText(chunk);

    if (bestVoice) {
      utterance.voice = bestVoice;
      utterance.lang = bestVoice.lang;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      currentUtteranceIndex++;
      playTextChunks();
    };

    utterance.onerror = (event) => {
      console.warn('SpeechSynthesis error:', event);
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        currentUtteranceIndex++;
        playTextChunks();
      }
    };

    statusText.textContent = `正在朗讀 (${currentUtteranceIndex + 1}/${textChunks.length})...`;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * 啟動 Keep-Alive 定時器 (解決 Chrome/Android 朗讀逾 15 秒停止之已知 Bug)
   */
  function startKeepAlive() {
    stopKeepAlive();
    keepAliveTimer = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  /**
   * 開始朗讀
   */
  function startSpeech() {
    const rawText = textInput.value;
    const cleanedText = cleanMarkdown(rawText);

    if (!cleanedText) {
      alert('請先在輸入框中輸入欲朗讀的文字。');
      textInput.focus();
      return;
    }

    if (!('speechSynthesis' in window)) {
      alert('抱歉，您的裝置或瀏覽器不支援 Web Speech API 語音朗讀。');
      return;
    }

    // 停止先前的朗讀
    window.speechSynthesis.cancel();

    // 準備文本段落
    textChunks = splitTextIntoSentences(cleanedText);
    currentUtteranceIndex = 0;
    isPlaying = true;

    // 更新 UI 狀態為播放中
    setPlayButtonUI(true);
    statusIndicator.classList.remove('is-hidden');
    startKeepAlive();

    // 開始播放第一個句子
    playTextChunks();
  }

  /**
   * 停止朗讀
   */
  function stopSpeech() {
    isPlaying = false;
    currentUtteranceIndex = 0;
    textChunks = [];
    stopKeepAlive();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setPlayButtonUI(false);
    statusIndicator.classList.add('is-hidden');
  }

  /**
   * 切換播放/停止按鈕 UI
   */
  function setPlayButtonUI(playing) {
    if (playing) {
      btnPlay.classList.add('is-playing');
      playText.textContent = '停止朗讀';
      // 停止圖示 (方形)
      playIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>`;
    } else {
      btnPlay.classList.remove('is-playing');
      playText.textContent = '開始朗讀';
      // 播放圖示 (三角形)
      playIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>`;
    }
  }

  /**
   * 更新字數統計
   */
  function updateCharCount() {
    const len = textInput.value.length;
    charCount.textContent = `${len} 字`;
  }

  /**
   * 6. 事件監聽與初始化
   */
  function initEvents() {
    // 播放/停止主按鈕點擊
    btnPlay.addEventListener('click', () => {
      if (isPlaying) {
        stopSpeech();
      } else {
        startSpeech();
      }
    });

    // 循環播放切換
    loopToggle.addEventListener('change', (e) => {
      isLooping = e.target.checked;
      if (isLooping) {
        loopContainer.classList.add('is-active');
      } else {
        loopContainer.classList.remove('is-active');
      }
      localStorage.setItem(STORAGE_KEY_LOOP, isLooping ? 'true' : 'false');
    });

    // 點擊循環膠囊也能觸發
    loopContainer.addEventListener('click', (e) => {
      if (e.target !== loopToggle) {
        loopToggle.checked = !loopToggle.checked;
        loopToggle.dispatchEvent(new Event('change'));
      }
    });

    // 輸入文字自動存檔與字數更新
    textInput.addEventListener('input', () => {
      updateCharCount();
      localStorage.setItem(STORAGE_KEY_TEXT, textInput.value);
      updateVoiceBadge(textInput.value);
    });

    // 清空文字
    btnClear.addEventListener('click', () => {
      if (!textInput.value) return;
      if (confirm('確定要清空輸入框中的所有文字嗎？')) {
        textInput.value = '';
        updateCharCount();
        localStorage.removeItem(STORAGE_KEY_TEXT);
        updateVoiceBadge('');
        if (isPlaying) stopSpeech();
      }
    });

    // 語音清單就緒監聽 (Chrome / Android / Edge 非同步載入機制)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        availableVoices = window.speechSynthesis.getVoices();
        updateVoiceBadge(textInput.value);
      };
    }
  }

  /**
   * 載入預設儲存狀態
   */
  function restoreState() {
    // 還原使用者輸入的文字
    const savedText = localStorage.getItem(STORAGE_KEY_TEXT);
    if (savedText !== null) {
      textInput.value = savedText;
    } else {
      // 預設範例文本（包含 Markdown 標記，方便直接體驗）
      textInput.value = `# 紙上聽聲
歡迎使用**紙上聽聲**，這是一個支援 PWA 離線安裝的極簡朗讀工具。

- 自動過濾 [Markdown 語法](https://example.com)
- 智慧挑選最佳音質語音
- 支援單次與循環播放

請點擊下方「開始朗讀」按鈕，聆聽溫暖自然的聲音。`;
    }

    // 還原循環狀態
    const savedLoop = localStorage.getItem(STORAGE_KEY_LOOP);
    if (savedLoop === 'true') {
      loopToggle.checked = true;
      isLooping = true;
      loopContainer.classList.add('is-active');
    }

    updateCharCount();

    // 初始載入語音清單
    if ('speechSynthesis' in window) {
      availableVoices = window.speechSynthesis.getVoices();
      updateVoiceBadge(textInput.value);
      // 部分瀏覽器延遲加載保護
      setTimeout(() => {
        if (!availableVoices || availableVoices.length === 0) {
          availableVoices = window.speechSynthesis.getVoices();
          updateVoiceBadge(textInput.value);
        }
      }, 500);
    }
  }

  /**
   * 註冊 PWA Service Worker
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((registration) => {
            console.log('PWA ServiceWorker 註冊成功，範圍:', registration.scope);
          })
          .catch((err) => {
            console.warn('PWA ServiceWorker 註冊失敗:', err);
          });
      });
    }
  }

  // 應用程式初始化
  initEvents();
  restoreState();
  registerServiceWorker();
})();
