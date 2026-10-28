# TCAD 剖面編輯器 Demo（PNG 進、PNG 出，聰明游標）

依[實作計畫 v3](https://claude.ai/artifact/KqhJMem6XE65TePBWxN1J5) 與 [prototype v3](https://claude.ai/artifact/6YygUuSbEYrrVZFYRdNcwm) 實作的展示用頁面：載入 TCAD 輸出的剖面 PNG，自動分割成區域，在圖上編輯，輸出一張尺寸與輸入完全相同的 PNG。不接宿主、不含測試。

```bash
npm install
npm run dev     # 開 http://localhost:5173
```

## 功能

- **三個方向槽**：X / Y / Z 各裝一張 PNG（預設為內建範例），各自的模型、Undo/Redo、基準；彼此不推導。
- **載入與分割**：關閉色彩管理解碼（`createImageBitmap` 的 `colorSpaceConversion: 'none'`）→ 量化調色盤（佔比 ≥ 0.05%）→ 4 鄰接連通元件（小於門檻的碎片併入鄰居，門檻可設、0 = 全部保留，顯示併入數）→ 邊界鏈 → Douglas-Peucker（0.6 px）→ 共用頂點的多邊形。簡化後每一段記下原始像素輪廓。
- **單位**：內部一律是影像 px 且永遠整數；1 px = ? nm 只影響顯示（尺規、Spec、Δ 標籤同時顯示 px 與 nm）。
- **聰明游標（無模式）**：靠近「角」→ 十字，拖頂點；靠近邊 → 雙箭頭，推整段平滑邊（兩端的角當錨點，Shift 只推單一小段）；區域內部 → 四箭頭，整塊搬動；空白處 → 框選。把手只在已選或游標所在的區域出現：「角」（往前後各走約 6 px 取方向，夾角 ≥ 50°）是方塊，永遠有；其他頂點是圓點，放大到與鄰點相距 ≥ 14 螢幕 px 才出現（按住 V 全部顯示）。
- **修飾鍵**：Shift 加選、Ctrl/⌘ 切換、按住 V/E/R 暫時只抓頂點/邊/區域、Alt 點邊插頂點、右鍵區域開材質選單、Ctrl/⌘+A、Esc（先清把手再清區域）。
- **拖拉規則**：
  - 區域：第一次移動時分離與鄰居共用的頂點，只搬自己；空出的地方用回填材質（預設 VOID），搬到的地方蓋在上層；方向鍵同規則。
  - 邊／頂點，連帶推動（預設）：貼在外面、厚度均勻（≤ 16 px、變化 ≤ 2.5 px）的薄層跟著位移，最多 3 層；狀態列顯示「連帶 N 層」。
  - 邊／頂點，防穿層（關掉連帶時）：位移逐步縮小，直到與鄰居其餘邊至少留 1 px；狀態列顯示「已擋住」。
  - 往外推 N px（浮動工具列，負值往內）：已選邊沿平滑後的法線、遠離點選的那個區域移動（共用邊算游標所在那側）；連帶開時襯層以保形偏移跟著推。
  - 已選 ≥ 2 個區域時，其他區域的對應邊／頂點一起動（可關）。所有頂點夾在影像範圍內。
- **輸出**：從原圖出發，只重畫變動的區域（依 labels 精確清除舊像素）。整塊整數位移 → 像素複製；否則每段沿用原始像素輪廓（兩端位移不同時沿輪廓長度內插位移），只有新插的頂點用直線，像素中心掃描線填色、不反鋸齒。未編輯時與輸入逐像素相同。顯示相異像素數、重畫方式、材質面積帳、警告（顏色不在調色盤、重疊覆蓋、厚度 < 2 px）；下載 PNG 與材質編號圖（灰階 = 材質索引）。
- **畫面 = 輸出**：區域輪廓與選取邊用與輸出相同的規則畫，藍線貼著像素邊。
- **材質名稱**：顏色與已知色票幾乎相同才套名稱，否則顯示「材質 n」與色碼；材質面板雙擊可改名，區域名稱跟著改。
- **其他**：浮動工具列（設 VOID、移到最上層、往外推、四方向 1 px）、相異像素標紅、區域名稱、Spec Preview 與基準差異、底圖切換（原圖／輸出／無）、縮放 1:1 / 8× / 適合視窗、平移。

## 結構

```
src/
  model/    types、geometry、ops（moveVertices、clampToWorld、detachRegions、insertVertexOnEdge、insertBump）、
            drag（isCorner、smoothEdgeGroup、propagateLayers、violates）
  raster/   quantize、components、chains（邊界鏈 → Model + 原始輪廓）、importRaster、exportRaster、demo（三張範例圖）
  editor/   useEditor（三槽狀態、聰明游標、手勢、選取、基準、Undo）、mirror、view
  canvas/   RasterUnderlay（底圖 + 相異疊圖）、SectionCanvas（SVG 編輯層、浮動工具列、右鍵選單）
  panels/   LeftPanel、RightPanels
```
