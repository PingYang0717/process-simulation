# TCAD 剖面編輯器 Demo

依[實作計畫](https://claude.ai/artifact/DurNU8xAEsm2umm6jcbXGw)「Demo 決議」實作的展示用頁面：純 SVG + React，不接宿主、不保存、不含測試。

```bash
npm install
npm run dev     # 開 http://localhost:5173
```

## 功能

- **三個剖面**：X-Cut（沿通道）、Y-Cut（跨 fin）、Z-Cut（俯視），由同一組元件參數產生。
- **共用參數連動**：Lg、Gate pitch、Spacer、Wfin、Fin pitch、Hfin、Gate 高、Tox。
  - 右側「元件參數」直接輸入，或在邊模式拖**橘色虛線**的綁定邊。
  - 參數改變時，各剖面只把產生器裡的頂點位移同一個 Δ；自由編輯（插入的頂點、凸起）保留不動。
  - 參數有上下限（例如 Lg ≤ pitch − 2×spacer − 4），超過就 clamp；自由拖拉不檢查。
- **自由編輯**（只影響目前剖面）：區域／邊／頂點三種模式（1/2/3）、點選與框選、拖拉、方向鍵微調、數值輸入、沿法線位移、凸起／凹陷、雙擊邊插頂點。
- **多結構同步編輯**：編輯範圍內多個形狀相近的區域，拖其中一個的邊／頂點，其他對應項目一起動。
- **Spec Preview**：W/H/x/y 與相對基準的 Δ、已選邊長度、多選外框；可釘選基準。
- **Undo/Redo**：全域一條歷史（三剖面 + 參數），上限 50 步。
- **視圖**：滾輪以游標為中心縮放、Space+拖／中鍵／平移模式、+/−/F、比例尺與格線自動換刻度。

## 結構

```
src/
  model/      types、geometry、build（合併頂點 + heal）、ops、materials、device（參數、產生器、連動、綁定）
  editor/     useEditor（狀態、手勢、選取、基準、Undo）、mirror、view
  canvas/     SectionCanvas（SVG 畫布）
  panels/     LeftPanel、RightPanel
```
