// Version: 1.1.0 | Subject: 實作逐行 Chunk 批次朗讀、螢幕 WakeLock 防休眠、速度調節 Bar、斷點暫停/繼續控制與 Alex/Ava 英語語音評分

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
  const btnStop = document.getElementById('btnStop');
  const btnSpeedDown = document.getElementById('btnSpeedDown');
  const btnSpeedUp = document.getElementById('btnSpeedUp');
  const speedValue = document.getElementById('speedValue');
  const loopToggle = document.getElementById('loopToggle');
  const loopContainer = document.getElementById('loopContainer');
  const charCount = document.getElementById('charCount');
  const btnClear = document.getElementById('btnClear');
  const voiceBadgeText = document.getElementById('voiceBadgeText');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const soundWaves = document.getElementById('soundWaves');

  // 播放與控制狀態管理
  let isPlaying = false;
  let isPaused = false;
  let isLooping = false;
  let currentSpeed = 1.0;
  let currentUtteranceIndex = 0;
  let textChunks = [];
  let availableVoices = [];
  let keepAliveTimer = null;
  let wakeLockSentinel = null;

  // 常數設定
  const STORAGE_KEY_TEXT = 'light_tts_user_text';
  const STORAGE_KEY_LOOP = 'light_tts_loop_state';
  const STORAGE_KEY_SPEED = 'light_tts_playback_speed';

  /**
   * 1. Markdown 語法清洗過濾器
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

    // 整理多餘空行與空白
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * 2. 逐行 Chunk 批次分割演算法 (防長文本引擎崩潰)
   */
  function splitTextIntoLineChunks(text) {
    if (!text) return [];

    // 先以換行（\n）為首要切分基準
    const lines = text.split('\n');
    const chunks = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 若單一行長度超過 120 字，進一步依句子標點符號進行子分割
      if (line.length > 120) {
        const sentences = line.split(/([。！？!?]+)/g);
        let subBuffer = '';
        for (let j = 0; j < sentences.length; j++) {
          const part = sentences[j];
          if (!part) continue;
          subBuffer += part;
          if (/[。！？!?]/.test(part) || subBuffer.length >= 80) {
            if (subBuffer.trim().length > 0) {
              chunks.push(subBuffer.trim());
            }
            subBuffer = '';
          }
        }
        if (subBuffer.trim().length > 0) {
          chunks.push(subBuffer.trim());
        }
      } else {
        chunks.push(line);
      }
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * 3. 文本語言自動辨識
   */
  function detectTextLanguage(text) {
    if (!text || text.trim().length === 0) {
      return navigator.language || 'zh-TW';
    }

    const hasChinese = /[\u4e00-\u9fa5]/.test(text);
    if (hasChinese) {
      const navLang = (navigator.language || '').toLowerCase();
      if (navLang.includes('cn')) return 'zh-CN';
      if (navLang.includes('hk')) return 'zh-HK';
      return 'zh-TW';
    }

    const hasJapanese = /[\u3040-\u30ff]/.test(text);
    if (hasJapanese) return 'ja-JP';

    const hasKorean = /[\uac00-\ud7af]/.test(text);
    if (hasKorean) return 'ko-KR';

    return 'en-US';
  }

  /**
   * 4. 跨平台頂級自然語音權重評分引擎 (升級 Alex, Ava, Jenny 等旗艦模型加權)
   */
  function calculateVoiceScore(voice, targetLang) {
    let score = 0;
    const vLang = (voice.lang || '').replace('_', '-');
    const vName = (voice.name || '').toLowerCase();
    const tLang = targetLang.replace('_', '-');

    // 1. 語言匹配
    if (vLang.toLowerCase() === tLang.toLowerCase()) {
      score += 100;
    } else if (vLang.split('-')[0].toLowerCase() === tLang.split('-')[0].toLowerCase()) {
      score += 50;
    } else {
      return -1; // 語言完全不符，剔除
    }

    // 2. 旗艦自然人聲特定模型名稱加權 (特別針對 Alex, Ava, Evan, Jenny 等)
    if (vName.includes('ava')) score += 95;
    if (vName.includes('alex')) score += 90; // macOS / iOS 傳奇高自然度呼吸聲模型
    if (vName.includes('evan')) score += 90;
    if (vName.includes('jenny')) score += 95; // Windows Edge 頂級神經網路旗艦女聲
    if (vName.includes('guy')) score += 95;   // Windows Edge 頂級神經網路旗艦男聲
    if (vName.includes('aria')) score += 90;
    if (vName.includes('allison')) score += 80;
    if (vName.includes('nathan')) score += 80;
    if (vName.includes('tom')) score += 75;
    if (vName.includes('serena')) score += 75;

    // 3. 頂級神經網路 / 高音質通用標籤加權
    if (vName.includes('natural') || vName.includes('neural')) score += 90;
    if (vName.includes('premium')) score += 80;
    if (vName.includes('enhanced')) score += 75;
    if (vName.includes('siri')) score += 70;
    if (vName.includes('online')) score += 50;

    // 4. 雲端神經網路聲音加權 (localService 為 false)
    if (voice.localService === false) score += 40;

    // 5. 品牌優質語音引擎加權
    if (vName.includes('google')) score += 25;
    if (vName.includes('microsoft')) score += 20;
    if (vName.includes('apple')) score += 15;

    // 6. 降權與避開項目
    // 針對 Samantha：若非 Enhanced/Premium 則降權，讓 Alex/Ava 絕對優先
    if (vName.includes('samantha') && !vName.includes('enhanced') && !vName.includes('premium')) {
      score -= 35;
    }
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
                             voice.name.toLowerCase().includes('neural') || 
                             voice.name.toLowerCase().includes('premium') || 
                             voice.name.toLowerCase().includes('enhanced') || 
                             voice.name.toLowerCase().includes('alex') || 
                             voice.name.toLowerCase().includes('ava') || 
                             voice.name.toLowerCase().includes('siri') || 
                             voice.localService === false);
      const icon = isHighQuality ? '✨' : '🌿';
      voiceBadgeText.textContent = `${icon} 最佳適配語音：${voice.name} (${voice.lang})`;
    } else {
      voiceBadgeText.textContent = '載入系統語音中...';
    }
  }

  /**
   * 5. Screen Wake Lock API 螢幕防熄滅管理
   */
  async function acquireWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        if (wakeLockSentinel === null) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
          });
        }
      } catch (err) {
        console.warn('Wake Lock 申請失敗:', err);
      }
    }
  }

  async function releaseWakeLock() {
    if (wakeLockSentinel !== null) {
      try {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
      } catch (err) {
        console.warn('Wake Lock 釋放失敗:', err);
      }
    }
  }

  // 監聽分頁能見度切換，返回時若仍朗讀則重新申請鎖定
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isPlaying && !isPaused) {
      await acquireWakeLock();
    }
  });

  /**
   * 6. Keep-Alive 定時器 (防 Chrome/Android 朗讀超過 15 秒中斷)
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
   * 7. 逐行 Chunk 批次播放控制器
   */
  function playTextChunks() {
    if (currentUtteranceIndex >= textChunks.length) {
      // 全文朗讀完畢
      if (isLooping) {
        statusText.textContent = '單輪完畢，準備循環重播...';
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
    if (!isPlaying || isPaused) return;

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

    utterance.rate = currentSpeed;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (isPlaying && !isPaused) {
        currentUtteranceIndex++;
        playTextChunks();
      }
    };

    utterance.onerror = (event) => {
      console.warn('SpeechSynthesis error:', event);
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        if (isPlaying && !isPaused) {
          currentUtteranceIndex++;
          playTextChunks();
        }
      }
    };

    statusText.textContent = `正在朗讀 (第 ${currentUtteranceIndex + 1} / ${textChunks.length} 行)...`;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * 8. 播放 / 暫停 / 繼續 / 停止 核心狀態轉換
   */

  // 開始全新朗讀
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

    window.speechSynthesis.cancel();

    // 產生分行 Chunk
    textChunks = splitTextIntoLineChunks(cleanedText);
    currentUtteranceIndex = 0;
    isPlaying = true;
    isPaused = false;

    updatePlaybackUI('playing');
    acquireWakeLock();
    startKeepAlive();

    playTextChunks();
  }

  // 暫停朗讀 (記下當前 chunk 斷點)
  function pauseSpeech() {
    if (!isPlaying) return;

    isPlaying = false;
    isPaused = true;

    stopKeepAlive();
    releaseWakeLock();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    updatePlaybackUI('paused');
  }

  // 繼續朗讀 (從暫停的 chunk 恢復播放)
  function resumeSpeech() {
    if (!isPaused) return;

    isPlaying = true;
    isPaused = false;

    updatePlaybackUI('playing');
    acquireWakeLock();
    startKeepAlive();

    playTextChunks();
  }

  // 完全停止朗讀並重置行進度
  function stopSpeech() {
    isPlaying = false;
    isPaused = false;
    currentUtteranceIndex = 0;
    textChunks = [];

    stopKeepAlive();
    releaseWakeLock();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    updatePlaybackUI('stopped');
  }

  /**
   * 9. 更新播放控制 UI 狀態
   */
  function updatePlaybackUI(state) {
    if (state === 'playing') {
      btnPlay.className = 'btn-play-main is-playing';
      playText.textContent = '暫停朗讀';
      // 暫停圖示 (雙豎線)
      playIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1.5" />
          <rect x="14" y="4" width="4" height="16" rx="1.5" />
        </svg>`;
      btnStop.disabled = false;
      statusIndicator.classList.remove('is-hidden');
      soundWaves.style.display = 'inline-flex';
    } else if (state === 'paused') {
      btnPlay.className = 'btn-play-main is-paused';
      playText.textContent = '繼續朗讀';
      // 播放圖示 (三角形)
      playIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>`;
      btnStop.disabled = false;
      statusIndicator.classList.remove('is-hidden');
      soundWaves.style.display = 'none';
      statusText.textContent = `已暫停於第 ${currentUtteranceIndex + 1} / ${textChunks.length} 行`;
    } else {
      // stopped
      btnPlay.className = 'btn-play-main';
      playText.textContent = '開始朗讀';
      playIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>`;
      btnStop.disabled = true;
      statusIndicator.classList.add('is-hidden');
    }
  }

  /**
   * 10. 速度調節器控制 (- 0.1x / + 0.1x)
   */
  function setSpeed(speed) {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(speed * 10) / 10));
    currentSpeed = clamped;
    speedValue.textContent = `${currentSpeed.toFixed(1)}x`;
    localStorage.setItem(STORAGE_KEY_SPEED, currentSpeed.toString());
  }

  /**
   * 11. 更新字數統計
   */
  function updateCharCount() {
    const len = textInput.value.length;
    charCount.textContent = `${len} 字`;
  }

  /**
   * 12. 事件監聽與綁定
   */
  function initEvents() {
    // 播放 / 暫停 / 繼續 主按鈕
    btnPlay.addEventListener('click', () => {
      if (isPlaying) {
        pauseSpeech();
      } else if (isPaused) {
        resumeSpeech();
      } else {
        startSpeech();
      }
    });

    // 停止按鈕
    btnStop.addEventListener('click', () => {
      stopSpeech();
    });

    // 語速減少按鈕 (-)
    btnSpeedDown.addEventListener('click', () => {
      setSpeed(currentSpeed - 0.1);
    });

    // 語速增加按鈕 (+)
    btnSpeedUp.addEventListener('click', () => {
      setSpeed(currentSpeed + 0.1);
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

    // 輸入文字即時存檔與字數更新
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
        if (isPlaying || isPaused) stopSpeech();
      }
    });

    // 語音清單非同步載入監聽
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        availableVoices = window.speechSynthesis.getVoices();
        updateVoiceBadge(textInput.value);
      };
    }
  }

  /**
   * 13. 載入並還原儲存狀態
   */
  function restoreState() {
    // 還原輸入文本
    const savedText = localStorage.getItem(STORAGE_KEY_TEXT);
    if (savedText !== null) {
      textInput.value = savedText;
    } else {
      textInput.value = `# 紙上聽聲
歡迎使用**紙上聽聲**，這是一個支援 PWA 離線安裝的極簡朗讀工具。

- 自動過濾 [Markdown 語法](https://example.com)
- 智慧挑選最佳音質語音
- 支援分行批次朗讀與斷點暫停
- 支援語速調節與循環播放

請點擊下方「開始朗讀」按鈕，聆聽溫暖自然的聲音。`;
    }

    // 還原循環狀態
    const savedLoop = localStorage.getItem(STORAGE_KEY_LOOP);
    if (savedLoop === 'true') {
      loopToggle.checked = true;
      isLooping = true;
      loopContainer.classList.add('is-active');
    }

    // 還原語速設定
    const savedSpeed = localStorage.getItem(STORAGE_KEY_SPEED);
    if (savedSpeed !== null) {
      const parsedSpeed = parseFloat(savedSpeed);
      if (!isNaN(parsedSpeed) && parsedSpeed >= 0.5 && parsedSpeed <= 2.0) {
        setSpeed(parsedSpeed);
      } else {
        setSpeed(1.0);
      }
    } else {
      setSpeed(1.0);
    }

    updateCharCount();

    // 初始載入語音清單
    if ('speechSynthesis' in window) {
      availableVoices = window.speechSynthesis.getVoices();
      updateVoiceBadge(textInput.value);
      setTimeout(() => {
        if (!availableVoices || availableVoices.length === 0) {
          availableVoices = window.speechSynthesis.getVoices();
          updateVoiceBadge(textInput.value);
        }
      }, 500);
    }
  }

  /**
   * 14. 註冊 PWA Service Worker
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
