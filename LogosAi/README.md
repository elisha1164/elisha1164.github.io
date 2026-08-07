<!-- Version: v1.0.6 | Summary: Added Open Graph OG tags, LINE browser auto-escape, and top-right PWA install button for LogosAI -->

# LogosAI - 聖經神學對話助手 (Scripture & Theology Assistant)

**LogosAI** 是一個結合尖端 AI 科技與嚴謹聖經神學的單頁問答系統 (HTML/CSS/JS)，旨在高舉聖經的最高權威，為使用者（包含學生與大眾）提供精準、全面且明確引用聖經經文的神學解答。

## 🌟 主要功能特色

- **高舉聖經 (Sola Scriptura)**：系統提示詞嚴格規範回歸「聖經的立場是…」，絕不高舉特定人為神學框架或宗派名稱。
- **📱 靜音免打擾 PWA 安裝**：
  - 右上角提供「安裝 App」按鈕（僅在未安裝時出現，不自動跳彈窗干擾）。
  - **Android**：點擊觸發原生 PWA 安裝對話框。
  - **iOS**：點擊彈出 Safari 「加到主畫面」三步驟指引。
- **💬 LINE 內建瀏覽器自動跳脫**：
  - 自動偵測 LINE 內建 WebView，Android 自動以 Chrome 開啟，iOS 自動帶參數跳脫至外部 Safari 瀏覽器，確保 PWA 與分享功能 100% 正常。
- **🌐 Open Graph (OG) 社群分享標籤**：
  - 完整支援 Facebook, LINE, X/Twitter 社群預覽卡片（包含標題、摘要說明與圖示預覽）。
- **神學過濾與提示詞保密**：非神學議題自動禮貌婉拒以節省 API Token；System Prompt 放於後端隱藏，防止 F12 側錄或 Prompt 探測。
- **IndexedDB 歷史對話暫存**：對話紀錄自動儲存在瀏覽器 IndexedDB 中，重新整理或重開網頁對話不丟失，並支援一鍵清除。
- **多功能匯出與分享**：
  - 手機端：觸發原生系統分享 (`navigator.share`) 至 LINE、郵件、AirDrop 等。
  - 電腦端：支援「一鍵複製全文」與「下載 `.md` / `.txt` 檔案」。
- **極致 UI/UX 體驗**：
  - 深色 (Dark Mode) / 淺色 (Light Mode) 可隨時切換。
  - Markdown 語法自動渲染（經文引用方塊、標題、清單高亮）。
  - 打字機效果與沉穩神學學術視覺風格。
- **Gemini 3.6 Flash 模型支援**：預設調用 Google `gemini-3.6-flash` 模型。

---

## 🚀 部署指南 (GitHub Pages + Cloudflare Workers 免費託管)

### 步驟 1：部署前端網頁至 GitHub Pages
1. 將本專案的 `index.html` 上傳至您的 GitHub 儲存庫 (Repository)。
2. 在 GitHub 儲存庫設定頁面 (`Settings` -> `Pages`)：
   - Source 選擇 `Deploy from a branch`
   - Branch 選擇 `main` (或 `master`) 的 `/ (root)`。
3. 點擊 `Save`，幾分鐘後即可取得免費的 GitHub Pages 網址 (例如：`https://username.github.io/repository-name/`)。

---

### 步驟 2：部署 Cloudflare Worker 後端代理 (隱藏 API Key 與 System Prompt)
Cloudflare Workers 提供每日 **100,000 次免費請求**，可完全防範 API Key 與 System Prompt 洩漏。

1. 註冊並登入 [Cloudflare 官網](https://dash.cloudflare.com/)。
2. 進入左側選單 `Workers & Pages` -> 點擊 `Create Application` -> 選擇 `Create Worker`。
3. 為 Worker 命名（例如 `logos-ai-proxy`），點擊 `Deploy`。
4. 點擊 `Edit code`，將本專案的 [`worker.js`](file:///c:/Agent_Workspace/Light_coder/worker.js) 全部內容複製貼上取代預設代碼，點擊右上方 `Save and deploy`。
5. **設定 GEMINI_API_KEY 環境變數**：
   - 返回 Worker 設定頁面 -> 點擊 `Settings` -> `Variables` (變數)。
   - 在 `Environment Variables` 點擊 `Add variable`：
     - **Variable name**: `GEMINI_API_KEY`
     - **Value**: 貼上您的 Google Gemini API Key
     - 勾選 `Encrypt` (加密隱藏) 點擊 `Save and deploy`。
6. 複製該 Worker 的 URL 網址（例如 `https://logos-ai-proxy.your-subdomain.workers.dev`）。

---

### 步驟 3：在網頁設定中填入 Worker 網址
1. 開啟您的 GitHub Pages 網頁。
2. 點擊右上角 **⚙️ 設定圖示**。
3. 在「Cloudflare Worker 代理網址」輸入框中貼上步驟 2 取得的 Worker URL。
4. 點擊「儲存設定」，即可開始安全體驗！

---

## 📄 版本資訊
- **Version**: v1.0.0
- **License**: MIT
