# **系統功能規格書 (FSD) \- 聖經經文選讀與語音朗讀系統**

**版本：** v1.16

**修改主旨：** 整合 GitHub Pages 部署環境要求至系統架構與技術選型中，確保純靜態網頁的高效運作。

**文件日期：** 2026-04-24

**專案目標：** 開發一個純前端的單頁應用程式 (SPA)，讀取 rcuv.json，允許使用者透過聯動的下拉式選單選擇起始與結束經文，即時顯示內容、同步網址參數，並提供高穩定性的語音朗讀功能。

## **1\. 系統架構與技術選型**

* **前端核心：** 原生 HTML5, CSS3, JavaScript (ES6+)。不依賴大型框架 (如 React/Vue) 以維持極致的輕量化與載入速度。  
* **部署環境 (Deployment)：** 專為 **GitHub Pages** 靜態網頁託管環境設計。系統完全不依賴後端伺服器，利用純前端靜態資源與原生 API，確保資料拉取、PWA 離線快取與語音功能皆能在 GitHub Pages 上正常且高效地運作。  
* **樣式框架：** Tailwind CSS (透過 CDN 引入，與舊專案一致)。  
* **資料來源與本地儲存 (Cache)：** 非同步載入上層目錄的 ../rcuv.json。透過 CDN 引入 localforage 函式庫操作 IndexedDB 進行本地快取。首次下載後即存入瀏覽器，後續開啟直接從本地讀取，達成「秒開」並完全支援斷網下的離線操作。  
* **圖示方案 (Icons)：** 全面採用內聯 SVG (Inline SVG)。不引入任何外部圖示字體庫（如 Lucide 或 FontAwesome），直接將所需圖示的 \<svg\> 程式碼寫入 HTML 中，以追求極致載入效能與完全的離線可用性。  
* **狀態管理：** 以 URL Query Parameters 為單一真相來源 (Single Source of Truth, SSOT)。  
* **語音引擎：** Web Speech API (speechSynthesis)，並沿用舊專案中已實作的長文分段 (Chunking) 與 Wake Lock API 防休眠機制。

## **2\. 核心功能模組 (Core Modules)**

### **2.1 PWA 體驗與執行環境防護 (Environment Guards)**

* **防範 LINE/FB 內建瀏覽器 (Anti In-App Browser)：** 由於 Web Speech API 與 IndexedDB 在 LINE/FB 內建瀏覽器中常遭阻擋或功能受限。系統在 \<head\> 載入時需立即檢測 navigator.userAgent，若偵測到 Line、FBAV 等字眼，嘗試附帶 ?openExternalBrowser=1 參數重構網址以強制喚起系統預設瀏覽器。  
* **降級引導：** 若無法強制喚起外部瀏覽器且發生載入錯誤，則在全域狀態列 (statusText) 顯示專屬的防呆提示，並提供一個醒目的「一鍵複製網址」按鈕，引導使用者手動至 Safari 或 Chrome 貼上開啟。  
* **PWA 桌面安裝引導：** \* 攔截 beforeinstallprompt 事件，儲存安裝對象。  
  * 提供安裝按鈕，針對 Android 觸發原生安裝提示；針對 iOS (Safari) 則彈出專屬教學 Modal (指示點擊分享按鈕 \-\> 加入主畫面)。

### **2.2 資料初始化與預處理模組**

* **首次載入與全域狀態 (Global Status)：** 系統頂部配置一個全域狀態提示列 (statusText)。在資料下載或處理時顯示「載入中...」。所有的 \<select\> 選單預設必須加上 disabled 屬性，待準備就緒後再解鎖並隱藏提示列。若發生 Fetch 失敗或語音引擎崩潰，此區域將轉換為顯眼的紅色警告框顯示具體錯誤代碼。  
* **資料獲取與 IndexedDB 快取：** 系統啟動時，優先檢查 IndexedDB 是否已存在完整的 rcuv\_data。若存在，則直接讀取記憶體渲染；若不存在，再透過 fetch('../rcuv.json') 載入，解析成功後異步透過 localforage 寫入 IndexedDB，以節省未來高達 3MB\~5MB 的頻寬消耗。  
* **書卷清單建構：** 遍歷 JSON 第一層 key，建立「書卷排序陣列 (Book Order Array)」。系統內建以下中英文縮寫對照表，供後續網址解析器轉換使用：  
  * **舊約：** Gen (創世記), Ex (出埃及記), Lev (利未記), Num (民數記), Deut (申命記), Josh (約書亞記), Judg (士師記), Ruth (路得記), 1Sam (撒母耳記上), 2Sam (撒母耳記下), 1Kings (列王紀上), 2Kings (列王紀下), 1Chron (歷代志上), 2Chron (歷代志下), Ezra (以斯拉記), Neh (尼希米記), Est (以斯帖記), Job (約伯記), Ps (詩篇), Prov (箴言), Eccles (傳道書), Song (雅歌), Isa (以賽亞書), Jer (耶利米書), Lam (耶利米哀歌), Ezek (以西結書), Dan (但以理書), Hos (何西阿書), Joel (約珥書), Amos (阿摩司書), Obad (俄巴底亞書), Jonah (約拿書), Mic (彌迦書), Nah (那鴻書), Hab (哈巴谷書), Zeph (西番雅書), Hag (哈該書), Zech (撒迦利亞書), Mal (瑪拉基書)。  
  * **新約：** Matt (馬太福音), Mark (馬可福音), Luke (路加福音), John (約翰福音), Acts (使徒行傳), Rom (羅馬書), 1Cor (哥林多前書), 2Cor (哥林多後書), Gal (加拉太書), Eph (以弗所書), Phil (腓立比書), Col (歌羅西書), 1Thess (帖撒羅尼迦前書), 2Thess (帖撒羅尼迦後書), 1Tim (提摩太前書), 2Tim (提摩太後書), Titus (提多書), Philem (腓利門書), Heb (希伯來書), James (雅各書), 1Pet (彼得前書), 2Pet (彼得後書), 1John (約翰一書), 2John (約翰二書), 3John (約翰三書), Jude (猶大書), Rev (啟示錄)。  
* **註解處理 (Annotation Handling)：** 觀察到 rcuv.json 內容包含 ?註：...? 格式的字串。系統需具備正規表達式 (Regular Expression) 處理能力：  
  * **畫面渲染 (UI 顯示時)：** 使用正規表達式 /\\?註：(.\*?)\\?/g 進行匹配。為了防範 XSS 與引號破壞 HTML，需先將註解內容 ($1) 中的 \['"&\<\>\] 進行 HTML 跳脫處理 (Escape)。接著將其替換為可點擊的互動元素：\<span class="inline-flex items-center justify-center cursor-pointer text-xl ml-1 opacity-80 hover:opacity-100 hover:scale-110 transition-transform" onclick="showFootnoteModal('註：${safeFootnote}')" title="點擊查看註釋"\>📝\</span\>。  
  * **語音朗讀 (TTS 發音時)：** 為配合沉浸式追蹤 (Auto-scrolling) 的字元索引對齊，必須如同舊專案**從 DOM 擷取純文字**送入語音。針對已渲染的經文 (span.text-stone-800)，使用 innerText.replace(/📝/g, '') \+ ' ' 剔除表情符號並加上空格；針對書卷標題 (h5)，則加上句號與換行 。\\n。

### **2.3 網址參數與狀態同步模組 (Two-way Binding)**

網址參數格式微縮化 (Minification)：為提升分享體驗，改採精簡的 ?ref= 格式。

* **URL to UI 解析器支援格式：**  
  * ?ref=Gen1:1-5 (第 1 章 1 到 5 節)  
  * ?ref=Gen1:1-2:5 (第 1 章 1 節到第 2 章 5 節)  
  * ?ref=Gen1 (代表第 1 章全部)  
  * ?ref=Gen1-2 (代表第 1 到 2 章全部)  
  * ?ref=Gen1-2:5 (代表第 1 章第 1 節到第 2 章第 5 節)  
  * ?ref=Gen (代表創世記全部)  
  * *預設狀態：若無參數或解析失敗，預設載入「創世記 第 1 章 第 1 節 至 第 1 節」。*  
* **URL to UI (載入時)：**  
  1. 解析 window.location.search 參數並填入對應的 \<select\> 元素。  
  2. **動態網頁標題：** 依據解析後的經文範圍，自動更新網頁 \<head\> 中的 \<title\> 標籤，格式如「創世記 1:1-2:5」。  
* **UI to URL (變更時)：**  
  1. 當選單改變時，依據選取狀態反向編譯出最精簡的 ?ref= 格式。  
  2. 使用 history.pushState(null, '', newUrl) 更新網址列。  
  3. **動態網頁標題：** 同步更新 \<title\> 標籤。  
  4. 觸發「經文抽取與渲染」函式。

### **2.4 聯動式下拉選單模組 (Cascading Dropdowns)**

由於實務上不應跨書卷閱讀，本專案**正式取消支援「跨書卷顯示」**。

* **書卷選單：** 改為全域單一的 \<select id="book"\>。  
* **起始章節選單：** 動態生成該書的章數與節數選單。  
* **結束章節選單：** 動態生成對應的章數與節數選單。  
* **防呆機制 (Validation)：**  
  * 確保「結束章」![][image1]「起始章」。若「結束章」![][image2]「起始章」，則確保「結束節」![][image1]「起始節」。  
  * 發生衝突時，自動將結束端的值向起始端同步。

### **2.5 經文抽取模組 (Extraction Engine)**

必須透過 Object.keys(chapterData).map(Number).sort((a, b) \=\> a \- b) 進行數值排序。演算情境簡化為兩種：

1. **同章 (例如：創1:1 \- 1:5)：** 取 v \>= fv 且 v \<= tv 的節數。  
2. **跨章 (例如：創1:26 \- 2:3)：** 首章取 v \>= fv，中間章全取，末章取 v \<= tv。

### **2.6 語音朗讀模組 (TTS Engine)**

* **語音過濾與優選機制 (Voice Prioritization)：** 嚴格過濾 zh, cmn, Chinese 與 TW, taiwan 的選項。比對關鍵字 (HsiaoChen, HsiaoYu, Online, Natural, Premium) 優先顯示高擬真清單。將使用者設定即時存入本地端。  
* **文本組裝與索引映射 (Mapping)：** 朗讀前推入 mappings 陣列（記錄 startIndex、endIndex 與目標 element），滾動目標為 el.closest('div.mb-3')。  
* **長文分段 (Chunking) 演算法：** 正則切分並以 MAX \= 250 字元為上限合併。  
* **穩定性防護：** \_currentUtterance 防 GC 回收，wakeLock 防螢幕休眠，並在 utterance.onerror 拋出例外時寫入全域 statusText UI。  
* **暫停與恢復 (Pause & Resume) 機制：**  
  * **暫停 (Pause)：** 點擊暫停時，全域 isPaused=true，呼叫 synth.cancel()，記錄當前塊索引 (idx)。  
  * **恢復 (Resume)：** 點擊繼續時，isPaused=false，從斷點索引 (idx) 開始重新送入佇列。  
  * **停止 (Stop)：** 清空索引與佇列，呼叫 synth.cancel()。  
* **沉浸式追蹤 (Auto-scrolling)：** 目標捲動位置 targetScrollTop \= container.scrollTop \+ (elRect.top \- containerRect.top) \- 48，並操作 scrollTo 平滑捲動。

## **3\. 使用者介面 (UI) 佈局規劃**

UI 採響應式設計 (Mobile First)，使用 Tailwind 實作。

### **3.1 頂部區塊 (Header)**

* 系統標題：「聖經經文選讀與朗讀」。  
* **全域狀態列 (Global Status Text)：** 位於標題下方，預設隱藏。用於顯示「載入中...」或各種錯誤訊息 (如 LINE 瀏覽器阻擋、TTS 錯誤等)。  
* **分享與設定區：**  
  * 提供包含內聯 SVG 圖示的「設定 (Settings)」按鈕。  
  * 提供包含內聯 SVG 圖示的「一鍵複製網址 (Copy Link)」按鈕。  
  * **整合 Web Share API：** 若裝置支援，則取代為「分享 (Share)」按鈕，呼叫系統原生分享。

### **3.2 控制面板 (Control Panel)**

* **全域書卷選擇：** \<select id="book-select"\>  
* **「從 (From)」區塊：** \<select id="from-chapter"\>, \<select id="from-verse"\>  
* **「到 (To)」區塊：** \<select id="to-chapter"\>, \<select id="to-verse"\>  
  *(所有選單在資料載入完成前預設為 disabled)*

### **3.3 動作列與播放控制 UI (Action Bar)**

三元切換狀態，全按鈕採用內聯 SVG：

* **狀態 1 (未播放)：** 顯示 \[▶️\] 按鈕。隱藏暫停與停止。  
* **狀態 2 (播放中)：** 隱藏朗讀。顯示 \[⏸️\] 與 \[⏹️\] 按鈕。  
* **狀態 3 (暫停中)：** 隱藏朗讀。顯示 \[▶️\] (繼續) 與 \[⏹️\] 按鈕。

### **3.4 經文顯示區 (Display Area)**

* **節號處理邏輯：** Flexbox 頂部對齊。節號標籤 \<strong\> 需具備 w-6 text-right shrink-0 select-none pt-\[2px\]，確保複製時不干擾。  
* 朗讀時，運用 utterance.onstart 實作自動捲動追蹤。

### **3.5 彈出視窗群 (Modals)**

1. **註解彈出視窗 (Note Modal)：** 顯示 ?註：...? 的詳細內容。  
2. **PWA 安裝教學 (Install Modals)：** 包含原生 Android 安裝提示，以及針對 iOS Safari 的「手動安裝圖文教學」對話框。

### **3.6 語音設定面板 (Settings Panel)**

* 包含語音選擇器 \<select id="voiceSelector"\> 與語速選擇器 \<select id="rateSelector"\>。

## **4\. 開發實作階段規劃 (Milestones)**

* **Phase 1: 資料快取與防護環境**  
  * 建構 HTML/Tailwind 骨架，加入純內聯 SVG 圖示。  
  * 實作 LINE/FB 內建瀏覽器攔截與降級提示 (statusText)。  
  * 實作 IndexedDB (CDN 引入 localforage) 快取機制。  
* **Phase 2: URL 解析與狀態聯動**  
  * 建立中英文書卷名稱對照表，實作 ?ref 正則解析器與反向編譯器。  
  * 實作動態 \<title\> 標籤更新功能，綁定 Web Share API。  
* **Phase 3: 經文抽取演算法**  
  * 實作同章、跨章兩種情境的資料萃取迴圈 (數值排序解析 Key)。  
  * 實作畫面渲染，包含正則轉換註解為互動按鈕與 HTML 內容跳脫。  
* **Phase 4: 語音引擎與進階控制整合**  
  * 移植 speakTextChunks、GC 防護、 Wake Lock 與語音過濾優選機制。  
  * 實作狀態儲存式「暫停 (Pause)」與「恢復 (Resume)」邏輯與 DOM 映射。  
* **Phase 5: 測試與發布**  
  * 測試拔除網路後的 PWA 離線讀取與各類微縮 URL 邊界情況。  
  * 觸發 PWA 安裝教學 Modal 的邏輯。

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAXCAYAAADUUxW8AAAAq0lEQVR4XmNgGAWkAzk5uVx5eflkcXFxbnQ5YgEz0AAroEF/gPRUdEmSANCAdUCD/snIyOihyxEFgAYoQg0wB3IZ0eWJAtLS0sJAg2qA+LqsrKw/ujxRAKhxMtCA/woKChzocrgAKCDPA/EvkAvQJbECoC1JQA2vQDS6HE4AimtgIOUDNT4EaoxAl8cKQHELimOSQxaoKR6oeTvZcTo0ASvQz5LEYnTNQwwAALrxIqmSCsLBAAAAAElFTkSuQmCC>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAXCAYAAADUUxW8AAAANklEQVR4XmNgGAWjgOZATk7ur7y8/H9isays7GR0MwYAiIuLiwGdI0ksVlBQ4EA3YxSMAqwAAHZaFwthOCgAAAAAAElFTkSuQmCC>