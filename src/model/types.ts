export type XY = [number, number]; // 影像 px，y 軸往下為正

/**
 * src：整塊搬動時從鄰居分離出來的頂點，記住原本的頂點 id（輸出時用來找原始輪廓）；
 * ox/oy：使用者新增的節點在原圖上的位置（原始模型裡沒有它）
 */
export interface Vertex { id: string; x: number; y: number; src?: string; ox?: number; oy?: number }
/** 區域 id = r<label>，與 Imported.labels 對得上 */
export interface Region { id: string; label: string; material: string; loop: string[]; holes?: string[][] }
export interface World { x0: number; x1: number; yTop: number; yBot: number }
/** handles：畫面上顯示、可拖的節點（其他頂點只是貼著像素輪廓的點）；放在 Model 裡，新增／刪除可 Undo */
export interface Model { vertices: Record<string, Vertex>; regions: Region[]; world: World; handles: string[] }
export interface Edge { key: string; a: string; b: string; regions: string[] } // 由 loop 推導，不存

export interface Material { id: string; name: string; fill: string; isVoid?: boolean }

export type CutId = 'x' | 'y' | 'z';

export interface RasterImage { width: number; height: number; data: Uint8ClampedArray }

/** 簡化後的一段邊（edgeKey）對應的原始像素輪廓，from 為 pts[0] 那端的頂點 id */
export interface ExactSeg { from: string; pts: XY[] }

/** 載入時的快照，不變；輸出只看它與目前 Model 的差異 */
export interface Imported {
  width: number;
  height: number;
  original: Uint8ClampedArray; // RGBA，輸出的起點
  labels: Int32Array; // 每像素的區域編號
  labelMaterial: string[]; // 每個 label 載入時的材質 id
  palette: string[]; // 調色盤 hex
  materials: Material[]; // palette 每色一個 + VOID
  model: Model; // 分割結果（px），也是 regionChanged 的比較基準
  exact: Map<string, ExactSeg>; // 簡化邊 → 原始像素輪廓
  merged: number; // 併入鄰居的碎片數
  source?: string; // 檔名；內建範例為空
  nmPerPx: number; // 只影響顯示
}

export interface Baseline { model: Model; label: string; pinned: boolean }

export interface CutState { imported: Imported; model: Model; history: Model[]; future: Model[]; baseline: Baseline | null }
