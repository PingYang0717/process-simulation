# TCAD 剖面編輯器 Demo（PNG 進、PNG 出）

依[實作計畫 v2](https://claude.ai/artifact/KqhJMem6XE65TePBWxN1J5) 與 [prototype v2](https://claude.ai/artifact/NeDDQiBf2bhuWmuo6xMsVv) 實作的展示用頁面：載入 TCAD 輸出的剖面 PNG，自動分割成區域，在圖上編輯，輸出一張尺寸與輸入完全相同的 PNG。不接宿主、不含測試。

```bash
npm install
npm run dev     # 開 http://localhost:5173
```

## 功能

- **三個方向槽**：X / Y / Z 各裝一張 PNG（預設為內建範例），各自的模型、Undo/Redo、基準；彼此不推導。
- **載入與分割**：量化調色盤（佔比 ≥ 0.05%）→ 4 鄰接連通元件（< 12 px 碎片併入鄰居）→ 邊界鏈 → Douglas-Peucker（0.6 px）→ 共用頂點的多邊形。材質名稱以最近色對上已知色票表，另加 VOID。
- **比例**：1 px = ? nm（預設 0.5），只影響顯示的 nm 數值；Δ 標籤同時顯示 nm 與影像 px。
- **拖拉規則**：
  - 區域：整塊搬動，第一次移動時分離與鄰居共用的頂點，只搬自己；空出的地方用「回填材質」（預設 VOID），搬到的地方蓋在上層。
  - 邊／頂點：連動，共用頂點一起動，不留縫。
  - 所有頂點夾在影像範圍內。
- **輸出**：從原圖出發，只重畫變動的區域（依 labels 精確清除舊像素，再以像素中心掃描線填新形狀，不反鋸齒）；未編輯時與輸入逐像素相同。右側即時預覽、相異像素數、下載 PNG。
- **其他**：區域／邊／頂點選取、框選、多區域同步編輯對應邊／頂點、凸起／凹陷、雙擊插頂點、Spec Preview 與基準差異、底圖切換（原圖／輸出／無）、縮放平移。

## 結構

```
src/
  model/    types、geometry、ops（moveVertices、clampToWorld、detachRegions、insertVertexOnEdge、insertBump）
  raster/   quantize、components、chains（邊界鏈 → Model）、importRaster、exportRaster、demo（三張範例圖）
  editor/   useEditor（三槽狀態、手勢、選取、基準、Undo）、mirror、view
  canvas/   RasterUnderlay（底圖 canvas）、SectionCanvas（SVG 編輯層）
  panels/   LeftPanel、RightPanels
```
