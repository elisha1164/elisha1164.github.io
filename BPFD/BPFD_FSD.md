# **系統功能規格書 (Functional Specification Document)**

**專案名稱：** 聖經大故事家庭靈修小工具

**文件版本：** v1.9

**文件狀態：** 確認中 (Pending Approval)

## **1\. 專案概述**

本專案旨在開發一款專為「家庭」設計的 PWA 一頁式網頁靈修工具。專案基於既有且經過千錘百鍊的「358 天讀經計畫」底層架構，進行業務邏輯的抽換與資料來源的整合。

**核心目標與價值：**

1. **家庭友善的節奏：** 考量到家庭靈修的實際執行難度，系統將進度設定為每週 3 天，為期 50 週（共分為五個大部份，涵蓋聖經宏觀的敘事脈絡）。一年 52 週中預留 2 週（如聖誕週與復活週）作為彈性緩衝，總計 150 天的靈修內容。  
2. **零壓力追蹤：** 系統採用「絕對開始日」與「指定星期」推算法，自動略過非閱讀日，避免使用者產生「落後進度」的心理壓力。  
3. **無障礙體驗：** 提供全自動的語音朗讀功能（TTS），支援背景播放與巨觀/微觀畫面自動捲動，適合家長在通勤、做家事或睡前陪伴孩子時，以「聆聽」的方式完成靈修。

## **2\. 系統架構與技術選型**

為確保產品的長效維護性、極致的載入速度，以及對低階行動裝置的友善度，本專案堅持「輕量化」與「無後端」的設計哲學。

* **核心架構：** 原生 HTML/JS/CSS 單一檔案架構 (Single Page Application, SPA)。不依賴 React、Vue 等重量級前端框架，確保在任何網路環境下皆能瞬間載入，且大幅簡化離線快取 (Service Worker) 的實作複雜度。  
* **樣式庫：** Tailwind CSS (CDN 引入)。利用實用性類別 (Utility-first) 快速構建響應式介面，並嚴格定義在不同斷點（sm, md, lg）下的卡片排版與字體縮放。  
* **圖示與字體：** 採用 Lucide Icons (CDN) 作為全域向量圖示庫，確保高解析度螢幕下的清晰度；字體以 PingFang TC 與 Microsoft JhengHei 作為主要無襯線字體，經文區塊則強制採用 Serif (襯線體) 以提升長文閱讀體驗。  
* **資料儲存機制：** 採用 HTML5 LocalStorage。進度、使用者偏好、語音設定皆完全儲存於客戶端，徹底免去資料庫維護成本，同時保障使用者的隱私。  
* **音訊引擎：** 原生 Web Speech API (TTS)。**完全繼承**舊專案的「Android 安全模式」演算法（包含 Chunk 切割、錯誤攔截、狀態防抖），無需支付任何第三方雲端語音 (如 AWS Polly / Google TTS) 費用。  
* **資料來源 (純 JSON)：** devotional.json (靈修主體結構) 與 rcuv.json (和合本修訂版經文結構)。**\[架構瘦身\]** 由於全面捨棄舊專案的 CSV 格式改用 JSON，系統必須**全面移除 PapaParse 函式庫**的依賴，進一步提升載入效能。  
* **明確廢棄模組 (Deprecated Modules)：** 為避免開發者參考舊程式碼時產生混淆，新專案已**永久移除**「YouTube 輔助影片區塊 (含老張批註)」以及「前往原文連結按鈕」。所有 DOM 結構與相關 JS 邏輯均不需實作。

## **3\. 資料處理與結構定義**

系統初始化階段 (Initialization Phase) 必須非同步拉取這兩個 JSON 檔案，並在記憶體中建立 O(1) 複雜度的檢索字典。

### **3.1 載入狀態與錯誤反饋 UI (Loading & Error States)**

* **狀態標示：** 在拉取 JSON 資料時，主控台必須顯示明確的狀態文字（如 \<p id="statusText"\>正在從伺服器下載資料...\</p\>）。  
* **優雅降級：** 若 fetch 失敗（例如無網路、檔案遺失），必須隱藏載入文字，並渲染帶有紅色高亮背景的錯誤提示，絕對禁止給使用者看見無法互動的「白畫面」。  
* **破除快取機制 (Cache Busting)：** 為防止 PWA 與瀏覽器強制快取導致使用者永遠拉取到舊的 JSON 資料，所有的 fetch 請求必須在網址後方帶上系統版本號或時間戳記參數（例如：fetch('devotional.json?v=' \+ APP\_VERSION)），確保伺服器端資料庫有修改時，客戶端能確實同步更新。

### **3.2 靈修資料 (devotional.json) 預處理**

* **降維扁平化邏輯 (Flattening)：** 原始 JSON 為多層樹狀結構 (part \-\> part\_content \-\> devotions)。系統啟提時，會執行一次性遍歷，將其展平為以全局天數 (globalDay，範圍 1\~150) 為 Key 的字典物件 devotionDict。此舉可避免在每次切換天數時重複執行巢狀搜尋。  
* **字典節點結構規範：** 扁平化後的每一天節點，將擴充並包含其父層級的脈絡屬性：  
  * global\_day: 1\~150 之間的整數。  
  * part\_title: 該天所屬的部份標題 (例如：第一部分 神創造祂的國度)。  
  * week\_number: 當前進度所屬的週次 (1\~50)。計算公式嚴格定義為：Math.ceil(globalDay / 3)。  
  * is\_review\_week: 布林值。判斷是否為復習週，條件判斷式為：week\_number % 10 \=== 0。  
  * qa\_data: 完整繼承自父節點 part\_content 的問答資料 (包含 unit\_title, question 與 answer)。  
  * day\_data: 當日專屬內容，涵蓋 bible\_reading (經文出處陣列)、devotion\_title (標題)、devotion\_content (靈修短文)、reflection\_content (討論問題)。

### **3.3 經文資料 (rcuv.json) 預處理與對接**

* **O(1) 多層次檢索：** 完全保留舊專案的樹狀快取結構 rcuvIndex\[書卷名\]\[章節號\]\[節數\]。  
* **隱形字元過濾 (Sanitization)：** 在讀取與比對字串前，必須使用工具函式將 \\uFEFF (BOM)、\\u200B-\\u200D (Zero-width spaces) 等隱形字元剔除，防止 JSON 索引匹配失敗。  
* **參照字串解析器 (Reference Parser)：** 沿用且強化 parseChaptersWithVerses() 模組。系統將讀取 devotional.json 內的 parsed\_reference 或 bible\_reading 陣列（如："chapters": "1:1" 或 "chapters": "1-3"），轉換為可直接查詢 rcuvIndex 的陣列物件。  
* **容錯機制：** 若解析器遇到無法識別的書卷名稱或超出現有範圍的章節，將在控制台輸出警告，並在 UI 經文區塊優雅地顯示「無法載入此段經文，請翻閱實體聖經」，避免整個畫面崩潰。

## **4\. 核心業務邏輯：進度計算與渲染**

有別於舊專案每天皆有進度，新專案導入了高度彈性的「指定星期」推演算法。

### **4.1 動態進度計算引擎 (Dynamic Pacing Engine)**

* **系統邊界：** 最短天數為第 1 天，最長天數上限為 150 天 (50 週 × 每週 3 天)。  
* **參數輸入：** 1\. startDate (字串，YYYY-MM-DD)：使用者在設定精靈中決定的第一天。  
  2\. readingDays (陣列，包含三個 0\~6 的整數)：使用者指定的一週三讀星期（例如：\[1, 3, 5\] 代表週一、三、五）。  
* **時區偏移校正防護 (Timezone Offset Correction)：**  
  當使用者點擊「設為今日」或系統內部利用 new Date() 產生日期的字串時，**絕對禁止直接使用 new Date().toISOString().split('T')\[0\]**。因為 ISO 格式為 UTC 時間，台灣使用者（UTC+8）在上午 8 點前操作時會取到「昨天」的日期，導致進度推算大亂。  
  **必須嚴格使用舊專案公式：** new Date(Date.now() \- (new Date().getTimezoneOffset()\*60\*1000)).toISOString().split('T')\[0\] 來確保產生的 YYYY-MM-DD 精準對應使用者的在地時間。  
* **強制校準機制 (Forced Calibration for Start Date)：**  
  當使用者儲存設定時，若 startDate 對應的星期不在 readingDays 陣列中（例如選了週二開始，但閱讀日是週一、三、五），系統必須在背景自動將 startDate 往後推演至「下一個合法的閱讀日」（即週三），再寫入 LocalStorage。確保進度推算基準的絕對純淨與不重疊。  
* **推演演算法 (The Pacing Algorithm)：**  
  取代舊版的單純相減。給定今日日期 (today)，從 startDate 逐日遞增 (+1 day) 迭代至 today。在迴圈中，檢查當前迭代日期的 getDay() 是否包含在 readingDays 陣列中，若包含，則 readingDayCount 累加 1。  
* **歷史防偏機制與精確反推 (Dynamic Anchor Reset)：** 更改「閱讀日」設定時，為了不打亂已完成的進度，必須以系統當下紀錄的目標天數 (Day X) 為基準進行反推。  
  **反推演算法定義：** 首先檢查系統「今日」是否符合新規則，若不符合，則往後尋找最近的合法閱讀日，將其暫時定為基準日；接著，從該基準日逐日往回推算，每遇到一個符合新規則的閱讀日就扣除 1 天，直到扣除了 (X-1) 天為止，得出精確的新 startDate 進行覆寫。

### **4.2 復習週邏輯 (Review Week Handling)**

* **觸發條件：** 每逢第 10、20、30、40、50 週（即 week\_number 為 10 的倍數），該週的三天進度自動觸發復習模式。  
* **介面渲染限制 (UI Rendering Rules)：**  
  為了降低使用者的認知負擔，聚焦於過去九週的總結：  
  1. **隱藏 Q\&A 區塊：** 完全從 DOM 樹中隱藏或卸載「當週經文問答」的卡片。  
  2. **隱藏經文區塊：** 隱藏「今日經文 (Scripture)」區塊，不進行 rcuv.json 的查詢操作。  
  3. **保留核心：** 僅顯示當日的「靈修短文 (Devotion)」與「討論問題 (Reflection)」。  
  4. **語音佇列動態調整：** 在「一鍵全部朗讀」被點擊時，排程器必須動態檢查 is\_review\_week，跳過問答與經文的語音生成，直接朗讀短文與討論問題。

### **4.3 頁面載入定位邏輯 (智慧防焦慮機制)**

為提供良好的使用者體驗，避免使用者在超前進度時產生「怎麼還有那麼多」的未來焦慮，系統在初始化載入時，必須嚴格依循舊專案的「智慧載入定位邏輯」來決定當下應顯示的天數：

1. **尋找首個未讀天數：** 系統啟動時，先遍歷 1 到 150 的閱讀進度紀錄 (family\_devo\_progress)，找出第一個未被打勾（即 false 或 undefined）的天數，設為 firstUnreadDay。預設的載入目標天數 (targetLoadDay) 初始等於此天數。  
2. **完讀極限防護 (Undefined Crash Prevention)：** 若遍歷後發現 150 天皆已打勾，代表 firstUnreadDay 將為 undefined。此時必須強制將 firstUnreadDay 設為 150，防止後續算式產生 NaN 導致無效載入與白畫面崩潰。  
3. **計算系統真實天數：** 依據儲存的 startDate 與閱讀日規則，利用進度計算引擎推算出「今天」在系統中理應到達的真實進度天數，設為 actualTodayIndex。  
4. **超前進度防護校正：** 將 firstUnreadDay 與 actualTodayIndex 進行比對：  
   * **若 firstUnreadDay \> actualTodayIndex（代表超前閱讀）：** 系統**必須退回一天**，將 targetLoadDay 強制修正為 Math.max(1, firstUnreadDay \- 1)。亦即，讓畫面停留在使用者「最後一個已完成的進度」，避免提早顯示未來的排程造成心理壓力。  
   * **若 firstUnreadDay \<= actualTodayIndex（代表進度落後或剛好符合）：** 維持 targetLoadDay \= firstUnreadDay，直接導向使用者當下最需要完成的進度。  
5. **執行定位：** 最終將決定的 targetLoadDay 傳入頁面渲染主函式進行畫面載入。

### **4.4 全年完讀慶祝與智慧重置機制 (Full-Year Completion & Smart Reset Mechanism)**

完成為期 50 週、共 150 天的家庭靈修是一項極具挑戰性且值得紀念的里程碑。為了給予家庭最高程度的正向心理回饋與成就感，系統設有完善的「全數完讀偵測」與「慶祝/重置雙軌機制」。此機制不僅繼承舊專案的恭喜跳窗邏輯，更針對家庭靈修的情境進行了深度優化與擴寫。

1. **靜默且即時的完讀偵測 (Silent & Real-time Completion Detection)：**  
   * **觸發時機：** 系統會在兩種情境下觸發進度檢查：第一，使用者手動在畫面中勾選「標記為已讀」的 Checkbox 時；第二，使用者利用「一鍵全部朗讀」功能，系統於語音佇列播放完畢並自動將進度打勾時。  
   * **底層邏輯：** 每次觸發時，系統會在背景執行迴圈，快速遍歷 family\_devo\_progress 字典中的所有 150 天紀錄，計算值為 true 的總數。  
   * **防擾鎖定機制：** 若偵測到已讀總數精準達到 150 天，系統會進一步檢查 localStorage 中是否存在 congrats\_shown 的已展示標記。唯有在「達成 150 天」且「尚未展示過慶祝視窗」的雙重條件下，才會派發慶祝事件。這能有效防止使用者在完讀後，因誤觸取消打勾又重新打勾，導致慶祝視窗不斷重複彈出的惱人狀況。  
2. **情感化設計的慶祝視窗 (Emotionally Designed Congrats Modal UI)：**  
   一旦觸發完讀事件，系統會強制中斷其他不必要的視覺干擾，在畫面正中央彈出最高層級 (z-index) 的慶祝 Modal。  
   * **視覺聚焦：** 背景將套用深色半透明與毛玻璃濾鏡 (bg-stone-900/40 backdrop-blur-sm)，將使用者的視覺焦點完全集中在視窗上。  
   * **動態與排版：** 視窗頂部配置帶有無限跳躍動畫 (animate-bounce) 的「🎉」Emoji，營造歡慶氛圍。標題以溫暖明亮、高對比的色彩（如 text-amber-600）顯示「恭喜完成全年家庭靈修！」。  
   * **共鳴文案引導：** 內文不採用冰冷的系統提示，而是以感性的口吻肯定家庭這 50 週（150 天）來的堅持與毅力，恭喜他們走完了這趟指向耶穌的大故事旅程，並溫和地詢問是否準備好重置紀錄，為下一輪的閱讀之旅做準備。  
3. **使用者決策與雙軌後續行為 (User Actions & Dual-Track Routing)：**  
   視窗底部將提供兩個極具對比性且意圖明確的操作按鈕，賦予使用者（家長）完全的控制權，絕不強制執行破壞性操作：  
   * **主路線 A：「🚀 立即重置進度」(Primary Action \- Immediate Reset)：**  
     點擊此按鈕代表家庭準備好展開新一輪的 50 週靈修。  
     * **資料淨空與保留：** 系統會徹底清空 family\_devo\_progress 字典中的所有打勾狀態，同時移除 congrats\_shown 標記（確保下一輪完讀時能再次慶祝）。但會**絕對保留**使用者的語音偏好（tts\_voice\_name, tts\_rate）與每週閱讀日設定（family\_devo\_reading\_days）。  
     * **智慧錨點與重置確認提示 (Smart Anchor & Confirmation Prompt)：** 由於「明天」不一定符合家庭預設的「每週三天閱讀日」，系統不能粗暴地將起算日設定為明天。點擊重置後，系統會依據當下的 family\_devo\_reading\_days 設定，精準推算出「下一個最近的合法閱讀日」。接著，畫面會彈出一個確認提示框，明確告知：「**預計 X年 X月 X日 重新開始，每週 A、B、C 繼續家庭靈修時光。**」  
     * **後續決策 (Follow-up Decisions)：** 提示框會提供兩個選項：  
       1. **「確定」**：接受系統推算的日期，將該日期寫入 family\_devo\_start\_date，畫面導回 Day 1，並彈出成功重置的提示。  
       2. **「重新設定閱讀日」**：若家庭希望在新一輪改變閱讀步調（例如從原本的週一三五改為週二四六），點擊此按鈕將直接開啟「設定閱讀日」Modal。完成新規則設定後，系統會再次以新規則推算出正確的起算日並完成重置。  
   * **副路線 B：「稍後再說」(Secondary Action \- Reminisce & Delay)：**  
     這是一條為了「成就感保留」而設計的安全退路。  
     * 點擊後，系統僅會將 Modal 隱藏關閉，不會進行任何資料重置。  
     * 由於 congrats\_shown 標記已經在視窗彈出時寫入，使用者後續在 1\~150 天之間自由切換、回顧過去滿滿的綠色「✅ 已完成」打勾紀錄時，都不會再被視窗打擾。  
     * 這允許家庭細細品味他們一整年的努力軌跡。當他們未來真正準備好要重新開始時，隨時可以點擊右上角的「進階設定選單」，透過內建的「進度重置」功能手動觸發上述的智慧重置流程。

## **5\. 使用者介面與互動設計 (UI/UX)**

沿用舊專案具質感的卡片式設計風格、圓角 (rounded-2xl) 以及溫暖的配色基調 (stone / amber)，以營造家庭溫馨感。

### **5.1 通用互動規範 (General UI/UX Rules)**

* **Modal「點擊背景關閉」防呆 (Click Outside to Close)：** 所有系統彈出視窗（如：經文註釋、手動安裝教學、閱讀日設定等 Modal），必須在最外層遮罩元素綁定 onclick="if(event.target \=== this) closeModal()"。讓使用者不必精準點擊關閉按鈕，點擊灰色半透明背景即可流暢關閉視窗，提升單手操作體驗。

### **5.2 初始設定精靈 (Setup Wizard)**

當系統偵測不到 localStorage 中的開始日期設定時，強制彈出全螢幕的設定精靈（帶有毛玻璃 backdrop-blur 背景）。

* **多重跳窗衝突防護 (Modal Collision Prevention)：** 系統載入時，若同時滿足「需顯示 PWA 安裝提示」與「需顯示新手精靈」，系統必須利用 setTimeout 延遲精靈的觸發，直到 PWA 提示關閉後，才接續彈出精靈，絕對避免 Modal 疊加卡死畫面。  
* **步驟一：歡迎與開始日期** 提供預設為「今天」的 Date Picker。說明文字需強調：「這是一趟 50 週的旅程，什麼時候開始都是好日子。」  
* 步驟二：設定家庭專屬閱讀日  
  嚴格邏輯區  
  顯示週日至週六的 7 個 Checkbox。  
  * **互動約束：** 利用 JavaScript 監聽勾選狀態。當陣列長度達到 3 時，立刻將其餘 4 個未勾選的 Checkbox 加上 disabled 屬性，並改變其外觀透明度 (opacity-50 cursor-not-allowed)。  
  * **解鎖條件：** 下一步（完成設定）按鈕預設為停用 (disabled)，必須精準勾滿 3 天才能點擊。  
  * **幽靈日期篡改防護 (Calibration UI Feedback)：** 若使用者選擇的「開始日期」並非選定的「閱讀日」，點擊儲存並觸發「開始日強制校準」時，必須在畫面上（或精靈完成的過渡畫面）**即時渲染提示文字**（例如：「*已為您自動將開始日校準為最近的閱讀日：X 月 X 日*」），確保變更必有反饋，避免使用者產生系統故障篡改日期的錯覺。  
* **步驟三：資料遷移 (可選)**  
  提供「匯入既有進度」的替代按鈕。內部存儲 Key 全面變更為 family\_devo\_... (如 family\_devo\_start\_date)，以防止與舊專案的 gemini\_... 變數發生衝突或互相覆寫。備份檔命名亦統一更新為 Family\_Devo\_Backup\_YYYYMMDD.json。  
  * **老手匯入防導覽打擾 (Import Bypass)：** 當使用者在此步驟選擇匯入備份並成功覆寫資料後，系統在觸發網頁重整前，必須立刻將 localStorage.setItem('tour\_completed', 'true') 寫入。防止老玩家匯入進度後，系統依然強制執行冗長的新手導覽。

### **5.3 閱讀主視圖 (Reading View Layout)**

採用垂直流暢的模組化排版，向下捲動即是完整的每日體驗。包含以下模組：

1. **頂部控制與導航列 (Top Navigation Bar)：**  
   * **天數切換器：**\< 週次 \[weeknum\]-\[((global\_day \- 1\) % 3\) \+ 1\] \>，有兩個輸入值都支援直接輸入數字跳轉。按下 \< 與 \> 時會一天一天跳，如 1-1 ➔ 1-2 ➔ 1-3 ➔ 2-1 ➔ 2-2 ...  
   * **導航防呆 (Boundary Disabling)：** 當進度為 Day 1 時，左側 \< 按鈕必須加入 disabled 屬性與 opacity-50 樣式；當進度為 Day 150 時，右側 \> 按鈕亦同，防止使用者跳出系統邊界。  
   * **絕對日期顯示：** 顯示系統推算的真實日期 (例如：2026年5月14日)。  
   * **脈絡麵包屑 (Breadcrumbs)：** 顯示當前進度所屬的宏觀位置，例如：「第二部分 墮落與應許」。  
2. **主控台卡片 (Dashboard Card)：**  
   * 大標題：當日靈修主題 (Devotion Title)。  
   * 互動按鈕：醒目的狀態切換按鈕，點擊時帶有 transition-colors duration-300 的平滑微動畫。按鈕與其所在的卡片背景需遵循以下三種嚴格的色彩與文案連動邏輯：  
     * **狀態一：已讀 (isRead)** \- 標示已完成。卡片背景為 bg-green-50，標題為 text-green-800。按鈕文案顯示「✅ 已完成閱讀」(text-green-700)，勾選框為 text-green-600。  
     * **狀態二：未來進度 (isFuture)** \- 系統推算的實際天數尚未到達該日。卡片背景為 bg-stone-100，標題為 text-stone-500。按鈕文案顯示「標記為已讀」(text-stone-500)，勾選框為 text-stone-400。  
     * **狀態三：待閱讀 (Past & Unread)** \- 已到達或已過但尚未閱讀的天數（即落後進度）。卡片背景為 bg-red-50，標題為 text-red-800。按鈕文案顯示「⭕ 待閱讀...」(text-red-600)，勾選框為 text-red-600。  
   * 包含「🎧 一鍵全部朗讀」主控按鈕。  
3. **經文問答卡片 (Q\&A Card)，復習週自動隱藏：**  
   * **單元標題渲染 (Unit Title)：** 在卡片內容最上方，必須先以次標題的視覺層級（例如：加粗或特殊顏色）渲染出該問題所屬的 unit\_title，幫助家庭掌握當前對話的核心焦點。  
   * 清爽的對話框排版，區分 Q (問題) 與 A (解答)，使用較大的字體以便家長與孩子互動問答。  
4. **今日經文卡片 (Scripture Card)，復習週自動隱藏：**  
   * 採用 Serif 襯線體 (font-serif)，並設定較大行距 (leading-loose) 以利長文閱讀。  
   * **複雜參照解析 (Complex Reference Parsing)：** 有別於舊專案單一書卷的限制，新專案 devotional.json 中的 bible\_reading 是一個陣列（例如 \[{"book": "創世記", "chapters": "1:1-5"}, {"book": "約翰福音", "chapters": "1:1"}\]）。系統需遍歷該陣列，逐一解析每項物件的書卷與章節字串（支援逗號分隔、冒號指定節數、連字號範圍），再向 rcuv.json 提取精確節數。  
   * **標題分組渲染 (Heading Grouping)：** 為避免版面混亂，連續同書卷、同章節的經文必須合併在同一個 \<h5 class="text-2xl font-bold text-stone-800 mb-4 border-b"\>書卷名 第 X 章\</h5\> 標題之下。當偵測到書卷或章節跳躍時，才產生新的標題。  
   * **節數排版 (Verse Typography)：** 每一節經文需使用 Flexbox 排版。節數本身 (\<strong class="text-stone-400 font-bold mr-3 text-base w-6 text-right shrink-0 select-none pt-\[2px\]"\>) 靠左固定寬度對齊，經文主體 (\<span class="text-stone-800 text-lg"\>) 接續其後，確保多行經文換行時左側邊界能完美切齊，不與節數重疊。  
   * **註釋氣泡轉換 (Footnote Interactivity)：** 繼承舊專案的註解處理邏輯，必須以正則表達式攔截 rcuv.json 內的 ?註：(.\*?)\\? 格式字串，將其替換為可點擊的互動圖示（📝）。點擊後會觸發 showFootnoteModal 顯示完整註釋內容。  
   * **空陣列動態隱藏 (Empty Array Dynamic Hiding)：** 若 bible\_reading 為空陣列 \[\]（如 Day 2），系統不得顯示「找不到經文」等字眼，而是必須將整個「今日經文」卡片的 DOM 節點隱藏 (hidden class)，確保 TTS 不會試圖朗讀空白卡片，維持版面俐落。  
5. **靈修短文卡片 (Devotion Card)：**  
   * **Markdown 換行解析防護 (Line-Break Processing)：** 在進行任何 Markdown 格式（粗體、斜體、引用）的轉換前，**必須優先處理換行符號**。將 JSON 字串中的 \\n\\n 或 \\n 轉換為 HTML 的 \<p\> 或 \<br\> 標籤，絕對禁止在渲染時發生文字黏成一坨的排版災難。  
   * 渲染 devotion\_content。支援基礎 Markdown 語法（利用正則表達式轉換 \*\*粗體\*\*、\*斜體\*、\> 引用）。引用區塊會有左側高亮邊框 (border-l-4)。  
   * **空白狀態防護 (Empty State Fallback)：** 當日若無短文，需自動填入「此天無靈修短文。」字樣避免版面崩塌。  
6. **討論問題卡片 (Reflection Card)：**  
   * 位於畫面最底部，背景色使用淺暖色 (bg-amber-50) 以區分文本性質，引導家庭進入討論時間。  
7. **互動與 UX 保護機制 (Interaction Safeguards)：**  
   * **雙重捲動軸重置 (Dual Scroll-Reset)：** 在 SPA 中切換天數時，系統必須強制執行 window.scrollTo({ top: 0, behavior: 'smooth' });，同時重置經文與短文等帶有內部 overflow-y-auto 區塊的 scrollTop \= 0。否則使用者切換天數後，畫面會錯誤地停留在卡片最下方。  
8. **頁尾與版權宣告 (Footer & Fixed Indicators)：**  
   * **固定版本號：** 畫面右下角需有以 fixed 定位的淺色字體顯示當前版本號（如 v1.0），供使用者回報問題時核對。  
   * **頁尾宣告：** 內容結束後需加上 Footer，明確標示「和合本修訂版版權屬香港聖經公會所有，蒙允准使用」等必要版權資訊，並保留「老張工具間」的外部連結按鈕。

### **5.4 右上角進階設定選單 (Advanced Settings Menu)**

位於畫面右上角的齒輪圖示，點擊可展開懸浮選單，點擊選單外區域則自動關閉。此選單匯集了所有系統級設定與除錯功能：

1. **核心設定區 (Core Settings)**  
   * **語音與語速 (Voice & Rate)：** \* voiceSelector：下拉式選單，動態載入系統過濾後的高品質中文語音清單（去除廠牌名稱前綴以保持簡潔）。  
     * rateSelector：提供語速切換，包含「慢速 (0.8)」、「正常 (1.0)」、「稍快 (1.2)」與「快速 (1.5)」。切換後即時寫入 localStorage。  
   * **開始日期 (Start Date)：** 提供 Date Picker 讓使用者微調起算日，並配備「設為今日」的快速按鈕。修改後系統會即時重新推算所有進度並更新畫面。  
2. **進階功能列表 (Advanced Features)**  
   * **設定閱讀日 (Set Reading Days)：** 點擊後開啟閱讀日設定 Modal，允許重新勾選每週的 3 天閱讀日。  
     * **歷史校準提示 (Calibration Notice)：** 套用變更時，系統必須根據歷史防偏機制重新推算開始日期，並跳出顯眼的提示區塊告知使用者：「為了不打亂已完成的讀經進度，系統將自動重新校準開始日期至 X年X月X日」。  
   * **匯出與匯入 (Export & Import)：**  
     * 匯出：將 family\_devo\_... 系列參數打包為 .json 備份檔，預設檔名為 Family\_Devo\_Backup\_YYYYMMDD.json。  
     * 匯入：呼叫隱藏的 \<input type="file"\> 讀取 JSON 檔，驗證格式正確後覆寫 localStorage，並觸發頁面重整 (window.location.reload()) 套用。  
   * **安裝到桌面 (Install PWA)：** 手動觸發 PWA 安裝機制（呼叫 triggerInstall()），詳細邏輯見 7.2 節。  
   * **重新導覽 (Retrigger Tour)：** 重新啟動 Driver.js 新手導覽流程。  
   * **問題回報與建議 (Feedback)：** 點擊後會呼叫 getSystemInfo() 收集使用者的裝置資訊（OS 與瀏覽器版本），並透過 URL Query Parameters 將 OS、Browser 與「目前閱讀天數」自動帶入外部 Google Form 的預設欄位中，大幅降低使用者回報門檻並協助除錯。  
   * **手動進度重置 (Manual Reset)：** 標示為紅色危險區。點擊後會彈出二次確認 Modal (resetConfirmModal)。  
     * **文案衝突防護 (Text Collision)：** 這裡的二次確認 Modal 必須與「完讀慶祝重置」**明確切分**。手動重置的文案應偏向危險警告（例如：「確定要放棄當前進度，重新開始嗎？」），絕對不可在此處顯示任何慶祝或規劃新一輪的字眼，以免導致半途放棄的使用者產生 UX 認知錯亂。  
     * 執行重置時，提供「匯出再重置」與「立即重置」兩個防呆按鈕，將清空所有 family\_devo\_progress 紀錄，並重新觸發 4.4 全年完讀慶祝與智慧重置機制 中的重置起算日邏輯。

### **5.5 新手導覽系統 (Onboarding Tour)**

為協助初次使用的家庭快速熟悉系統功能，本專案必須完整繼承並引入第三方套件 Driver.js 作為新手導覽核心。

1. **觸發時機：**  
   * **自動觸發：** 當頁面初始化或完成「初始設定精靈」後，系統檢查若 localStorage.getItem('tour\_completed') 不存在，且網址無 ?pwa=1 的推廣參數干擾時，自動執行導覽。  
   * **手動觸發：** 使用者隨時可從右上角的「進階設定選單」點擊「重新導覽」觸發 (startTour())。  
2. **導覽設定與樣式 (Configuration)：**  
   呼叫 driver.js.driver({...})，設定必須包含：顯示進度條 (showProgress: true)、開啟平滑過渡動畫 (animate: true)，並將按鈕文字中文化 (doneBtnText: '完成', nextBtnText: '下一步', prevBtnText: '上一步')。  
   * **客製化 CSS 覆寫 (Tailwind Alignment)：** 必須在 \<style\> 中宣告 .driver-popover-footer button { border-radius: 6px \!important; text-shadow: none \!important; }，將預設的過時外觀修飾為符合 Tailwind 現代風格的圓角按鈕。  
3. **動態步驟與綁定元素 (Dynamic Steps)：**  
   導覽步驟需配合新專案的版塊結構進行順序編排：  
   * **步驟 1 (歡迎)：** 無綁定元素。標題為「👋 歡迎」，向家庭說明導覽僅需 1 分鐘。  
   * **步驟 2 (日期切換)：** 綁定頂部導航列 (\#tour-day-selector)。說明可透過左右按鈕或直接輸入數字切換週次進度。  
   * **步驟 3 (每日進度)：** 綁定主控台卡片 (\#titleHeaderBox)。提示完成當日進度後記得打勾，並強調資料僅存於本機設備。  
   * **步驟 4 (自動語音)：** 綁定「一鍵全部朗讀」按鈕 (\#playAllBtn)。特別說明此功能可讓家庭在做家事或睡前，自動接力朗讀短文、經文與問題。  
   * **步驟 5 (經文問答)：** 動態檢查，若當前非復習週且卡片存在，則綁定「經文問答卡片」。說明這適合家長與孩子互動的環節。  
   * **步驟 6 (今日經文)：** 動態檢查，若當前非復習週且卡片存在，則綁定「今日經文卡片」。  
   * **步驟 7 (靈修短文)：** 綁定「靈修短文卡片」。說明這有助於將本日進度串聯至聖經大故事。  
   * **步驟 8 (討論問題)：** 綁定「討論問題卡片」。引導家庭於讀完後進入反思討論。  
   * **步驟 9 (進階設定)：** 綁定右上角設定圖示 (\#settingsBtn)。提示未來修改日期、設定閱讀日或備份都在此處。  
   * **步驟 10 (結束)：** 無綁定元素。祝褔語與導覽結束宣告。  
4. **狀態紀錄 (State Persistence)：**  
   在 Driver.js 的 onDestroyStarted 回呼函式中，必須將 localStorage.setItem('tour\_completed', 'true') 寫入，然後調用 driverObj.destroy()，確保使用者未來開啟網頁時不再受到自動跳窗干擾。

## **6\. 語音系統 (TTS Engine) \- 嚴格繼承區**

語音功能是本專案的 UX 核心。為徹底根除 Android / iOS 系統底層對 Web Speech API 的各種限制（例如長字串假死、背景遭垃圾回收機制 GC 清除等），必須**一字不漏地繼承**並實作以下邏輯：

### **6.1 核心機制與狀態管理**

* **全域狀態管控 (window.\_speechState)：** 所有播放任務必須註冊到此全域物件中。物件需包含當前的文本塊陣列 (chunks)、播放索引 (idx)、暫停標記 (isPaused)、以及防抖鎖 (debounceTimer)。  
* **分塊演算法 (Chunking Algorithm)：** 不論文本多長，都必須攔截並送入 speakTextChunks()。演算法會依據標點符號（。！？；.\!?;\\n）進行安全切割，並強制限制每個發聲單元 (SpeechSynthesisUtterance) 不得超過 250 個字元 (MAX \= 250)。這是防止 Android TTS 引擎崩潰的唯一解法。  
* **防抖與錯誤攔截 (Debounce & Error Handling)：**  
  暫停/繼續操作必須加上 300ms 的防抖鎖，避免使用者連續狂按導致系統 API 阻塞。所有 utterance.onerror 必須被攔截，若錯誤碼為 interrupted 視為正常手動暫停，其他則在控制台輸出並強制接續下一個 Chunk。  
* **防止 iOS Safari 垃圾回收 (GC 防崩潰機制)：**  
  **強制要求：** 在每次建立 SpeechSynthesisUtterance 物件時，必須寫入 window.\_currentUtterance \= utterance; 將該物件掛載於全域。這是避免 Safari 瀏覽器在螢幕休眠時，透過 GC 誤殺發聲物件而導致語音永久中斷的唯一救贖法。

### **6.2 介面連動與自動捲動**

* **三元播放控制 UI (The Tri-State Controller) 與全域排程連動機制：**  
  為了確保視覺狀態與 TTS 引擎狀態的絕對一致性，介面上每個包含文字的區塊（如主控台的「全域播放」、經文區塊、靈修短文區塊、討論問題區塊）都必須實作一組由三個按鈕組成的連動群組：**Play（朗讀 / 繼續）**、**Pause（暫停）**、**Stop（停止）**。這些按鈕的顯示狀態皆由單一中心函式 updatePlaybackUI() 全權調度，具體規則如下：  
  1. **初始化與重置狀態 (Default/Stop State)：**  
     當頁面載入或執行 handleStop() 後，系統會將 window.\_speechState 清空。此時 updatePlaybackUI() 必須將畫面上所有的 Pause 與 Stop 按鈕隱藏 (hidden class)，並顯示所有的 Play 按鈕，同時將按鈕文字還原為初始狀態（例如：「一鍵全部朗讀」、「朗讀經文」、「朗讀問題」）。  
  2. **觸發播放與連動代理 (Active Grouping)：**  
     當使用者點擊任一區塊的 Play 按鈕時，系統會在 window.\_speechState 中標記當前的 activeSection（例如：content, scripture, reflection 或 global）。  
     * **全域代理原則：** 無論目前是哪一個子區塊正在播放，主控台的「一鍵全部朗讀」群組都必須作為**全域代理控制器**同步連動。也就是說，如果使用者點擊了經文區塊的朗讀，主控台上的全域按鈕也會同步切換為「暫停」狀態，允許使用者在頂部隨時掌控播放。  
     * **互斥原則：** 正在播放的區塊與全域代理按鈕會進入 Active 狀態，而畫面上其他未播放的區塊，其按鈕皆保持在初始化狀態（僅顯示還原的 Play 按鈕）。  
  3. **播放與暫停的動態切換 (Playing vs. Paused Logic)：**  
     在 Active 群組中，根據 window.\_speechState.isPaused 的布林值進行切換：  
     * **播放中 (\!isPaused)：** 隱藏該群組的 Play 按鈕，同時顯示 Pause 與 Stop 按鈕。  
     * **暫停中 (isPaused)：** 隱藏 Pause 按鈕，重新顯示 Play 按鈕，但**必須動態將其文案修改為「繼續」**（例如：全域按鈕改為「繼續全部」或「繼續目前段落」，子區塊按鈕改為「繼續」），同時 Stop 按鈕保持顯示，讓使用者明確知道目前處於中斷狀態，且可以選擇接續或徹底放棄。  
* **巨觀與微觀視角追蹤 (Macro/Micro Scrolling)：** \* *巨觀：* 切換不同卡片朗讀時，自動將該卡片捲動至畫面頂端向下 24px 處。  
  * *微觀：* 朗讀「今日經文」時，必須根據目前唸到的 startIndex 與 endIndex，精準匹配並將對應的經文節數 DOM 元素捲動至容器可視範圍內，實現「唱KTV般」的跟讀體驗。**重要防呆：捲動時必須保留 48px 的頂部偏移量 (offset \= 48\)**，以防止正在朗讀的文字貼齊螢幕最頂部或被上方 UI 遮擋，確保最舒適的視覺落點。

### **6.3 語音朗讀前的「文本淨化」與「停頓標記」魔法 (TTS Text Sanitization)**

將畫面上顯示的文字原封不動地餵給 TTS 引擎會產生極差的聆聽體驗。必須繼承舊專案的巧思並針對新專案的 Markdown 結構進行嚴格的預處理：

1. **標點停頓強制注入 (Forced Pause Injection)：**  
   當系統收集經文的 \<h5 class="...border-b"\>書卷名 第 X 章\</h5\> 標題，或是 Q\&A 卡片的標題時，必須在收集的字串後方**強制加上全形句號 。**（例：el.innerText \+ '。\\n'）。這個微小的 Hack 可以強迫 TTS 引擎在讀完標題與本文之間產生自然的呼吸停頓。  
2. **UI 圖示剝離 (Emoji Stripping)：**  
   畫面上為了互動性而渲染的 Emoji（例如經文註解的 📝 符號）必須透過正則表達式 .replace(/📝/g, '') 徹底清除。否則語音引擎會在朗讀經文時突然念出「備忘錄」或「便條紙」，嚴重破壞靈修氛圍。  
3. **Markdown 語法淨化 (Markdown Stripping)：**  
   新專案的靈修短文支援 Markdown 格式，在餵給 TTS 前，必須使用正則表達式清除所有 \*\* (粗體)、\* (斜體) 以及 \> (引用標籤)，以防止語音引擎將這些排版符號生硬地念成「星號星號」。

### **6.4 一鍵朗讀排程器 (Master Queue)**

handlePlayAll() 函數需依據新專案的版塊結構重寫排程佇列，為避免語音「生硬地朗讀空白模組」，必須在排程時加入嚴謹的實體驗證。執行順序與條件如下：

1. **朗讀主標題 (TTS Title Assembly)：** 語音字串必須嚴格組裝為：「第 \[week\_number\] 週，第 \[((global\_day \- 1\) % 3\) \+ 1\] 天。今日進度：\[devotion\_title\]。」，賦予明確的每日推進儀式感。  
2. **空陣列防護 (Empty QA Validation)：** 檢查 is\_review\_week 若為 false，**且確保 qa\_data.question 與 qa\_data.answer 確實有實質內容**，才朗讀：「本週問答」+ 問與答內容。  
3. **空陣列防護 (Empty Scripture Validation)：** 檢查 is\_review\_week 若為 false，**且確保 bible\_reading 陣列長度大於 0**，才朗讀：「今日經文」+ 經文內容。  
4. 朗讀：「靈修短文」+ 短文內容。  
5. 朗讀：「討論問題」+ 問題內容。

每個任務結束後，透過回呼函數 (Callback) 觸發下一個任務，確保非同步執行的絕對順序。

### **6.5 語音篩選、優先匹配機制與非同步掛載 (Voice List Handling)**

為確保跨平台與跨瀏覽器的語音體驗品質一致，並避免選單中混入無效或外用語音，必須完全繼承舊專案的 populateVoiceList() 邏輯：

1. **TTS 非同步載入防護 (onvoiceschanged)：**  
   Chrome 等多數 Webkit 瀏覽器的語音清單是**非同步載入**的。如果只在初始化時呼叫一次 getVoices()，選單將會是一片空白。必須綁定事件：if (speechSynthesis.onvoiceschanged \!== undefined) speechSynthesis.onvoiceschanged \= populateVoiceList;，以確保語音包載入完成後能自動渲染選單。  
2. **語言與地域初步過濾：**  
   呼叫 speechSynthesis.getVoices() 獲取系統所有語音後，首先過濾出語言代碼包含 zh, cmn 或名稱包含 Chinese，**並且**同時具備台灣地域特徵（包含 TW 或名稱含 taiwan）的繁體中文語音。若該裝置上毫無台灣語音，則退而求其次放寬為所有中文語音作為 Base Pool。  
3. **高品質自然語音優先匹配 (Priority Keywords)：**  
   建立高品質關鍵字池：\['HsiaoChen', 'HsiaoYu', 'Online', 'Natural', 'Premium'\]。對 Base Pool 進行第二輪比對，若存在符合上述任一關鍵字的自然語音（例如微軟的 Azure Online 語音），則直接捨棄普通的機械音，僅將這些高品質語音存入最終的候選名單 voices 中。  
4. **介面顯示優化與預設綁定：**  
   * **顯示淨化：** 渲染至 voiceSelector 下拉選單時，必須利用 replace('Microsoft ', '').replace('Google ', '') 拔除冗餘的廠牌名稱，讓介面保持清爽。  
   * **預設選取：** 若 localStorage 中無 tts\_voice\_name 的歷史紀錄，系統應在迴圈中自動尋找名稱包含 HsiaoChen (曉臻) 或 國語 的語音，並將其 selected 屬性設為 true，免除使用者的初始設定成本。

## **7\. PWA 與系統整合 (System Integration)**

確保小工具能像原生 APP 一樣在手機桌面上獨立運作，系統需嚴格實作以下 PWA 機制：

### **7.1 PWA 基礎設定與桌面圖示 (Manifest & Icons)**

* 在 HTML \<head\> 區塊必須引入 manifest.json，供系統辨識安裝參數。  
* **圖示定義：** 統一使用 icon-192.png (供 PWA 與 favicon 使用) 與 icon-180.png (Apple Touch Icon)。  
* **iOS 專屬 Meta 標籤：** 必須加上 \<meta name="apple-mobile-web-app-capable" content="yes"\>、\<meta name="apple-mobile-web-app-status-bar-style" content="black"\>，並將 \<meta name="apple-mobile-web-app-title"\> 的屬性值設定為符合本專案的名稱（如「家庭靈修」）。

### **7.2 安裝機制與選單入口 (Install Trigger & Menu)**

* **原生安裝事件攔截：** 系統載入時監聽 beforeinstallprompt 事件，使用 e.preventDefault() 攔截瀏覽器預設跳窗，並將事件物件存入 deferredPrompt 以供後續手動觸發。  
* **觸發邏輯 (triggerInstall)：** 提供「安裝到桌面 (APP)」按鈕於右上角進階設定選單 (\#installMenuBtn)。點擊時：  
  * 若 deferredPrompt 存在，調用原生 .prompt()，讓系統執行一鍵安裝。  
  * 若為 iOS 或不支援原生安裝的環境 (deferredPrompt 不存在)，則觸發手動安裝教學的 Modal (manualInstallModal)，圖文並茂地教導使用者如何透過「分享 \-\> 加入主畫面」將網頁捷徑釘選至桌面。

### **7.3 情境式安裝提醒 (Contextual Prompting)**

* 為輔助習慣養成，系統設有主動跳窗提醒。當使用者在整個專案生命週期中，**「第一次」將任何一天的進度打勾標記為已讀時**，系統將呼叫 checkAndShowInstallPrompt()。  
* 若 localStorage 中無 install\_prompt\_shown 的紀錄，系統會彈出一個全版提示框 (installPromptModal)，以溫馨文案鼓勵使用者將此工具加入桌面。點擊「立即安裝到桌面」將接續執行 triggerInstall() 邏輯；關閉後寫入標記，未來不再騷擾使用者。

### **7.4 螢幕喚醒鎖 (WakeLock API)**

* 完全保留舊邏輯。在 TTS 觸發 onstart 時呼叫 navigator.wakeLock.request('screen')，在 onend 或 onerror 且佇列清空時呼叫 release()。必須同時綁定 document.visibilitychange，在使用者切換回網頁時重新申請喚醒鎖。

### **7.5 PWA 安裝防護與路由淨化 (PWA Routing Guard)**

* 保留對網址參數 ?pwa=1 的偵測。一旦偵測到此安裝推廣參數，立即使用 history.replaceState 清洗網址列。這是為了避免 iOS Safari 將帶有參數的網址建置成桌面捷徑，導致後續每次開啟都會重複觸發安裝彈出視窗的無限迴圈。

### **7.6 防護 APP 內建瀏覽器 (In-App Browser Escape)**

* 頂部必須包含 User Agent 偵測腳本。一旦發現使用者在 LINE、Facebook 或 Instagram 的內建瀏覽器中開啟（這些環境通常不支援 TTS 且會封鎖 LocalStorage），應立刻彈出全版警告。  
* **自動跳脫參數 (Auto Escape Routing)：** 系統不僅顯示警告，還必須在第一時間嘗試自動在網址尾端加上 ?openExternalBrowser=1 並強制重整 (window.location.replace)。這是利用部分 APP 內建瀏覽器底層漏洞，強制喚醒外部 Safari / Chrome 的第一道防線。  
* **手動複製防線：** 若自動跳脫失敗，介面上需提供「一鍵複製系統網址」按鈕，引導使用者自行複製並貼到外部瀏覽器。

### **7.7 跨日背景甦醒自動重整機制 (Background Wake-up Reload)**

這是一個極度重要的隱形 UX 防護。使用者經常會將 PWA 或網頁掛在手機的背景中好幾天不關閉。

* **觸發機制：** 必須監聽 visibilitychange 事件。  
* **執行條件：** 當使用者將網頁從背景切換回前景 (visibilityState \=== 'visible') 時，系統必須比對當下時間與網頁初始載入時間 (APP\_LOAD\_TIME)。若時間差大於 12 小時 (12 \* 60 \* 60 \* 1000)，則強制執行 window.location.reload()。  
* **價值：** 確保系統重新抓取使用者裝置的真實日期，防止「今天」的變數停留在昨天，導致進度推算引擎 (Pacing Engine) 發生嚴重的偏移錯誤。

## **8\. 儲存層與狀態管理 (Storage Definition)**

為保障此新專案與同一網域下可能存在的舊專案互不干擾，新專案全面定義並使用專屬的 LocalStorage 命名空間。

* **核心進度鍵值：**  
  * family\_devo\_start\_date：(String) 格式為 YYYY-MM-DD，絕對開始日。  
  * family\_devo\_reading\_days：(Array) 格式為 \[0, 2, 4\]，精確存儲設定精靈中勾選的三個閱讀日。  
  * family\_devo\_progress：(JSON Stringified Object) 格式為 { "1": true, "2": true, "3": false, ... }，追蹤 150 天中每一天的打勾狀態。  
* **跨專案共用鍵值 (可選繼承)：**  
  * tts\_voice\_name：(String) 系統語音引擎名稱偏好。  
  * tts\_rate：(String) 朗讀速度（如 "1.0", "1.2"），這兩者可與舊專案共用，讓老使用者無需重新設定語音。  
* **備份與還原：**  
  按下匯出時，必須將上述所有設定與進度打包成單一 JSON 物件，並轉換為 Blob 觸發下載。匯入時，需驗證 JSON 結構是否包含 family\_devo\_progress 等特徵鍵值，防止誤載入舊專案的備份檔。

**審核指示：**

這份擴充版的 FSD 已經詳盡描述了每一個技術環節與實作邊界。請確認上述規格是否精確涵蓋您的所有需求與期待？如無異議，我將依據此份沒有模糊空間的文件，為您啟動單一 HTML 檔案的程式碼實作。