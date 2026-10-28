export type XY = [number, number]; // nm，y 軸往下為正

export interface Vertex { id: string; x: number; y: number }
/** 區域 id = r<label>，與 Imported.labels 對得上 */
export interface Region { id: string; label: string; material: string; loop: string[]; holes?: string[][] }
export interface World { x0: number; x1: number; yTop: number; yBot: number }
export interface Model { vertices: Record<string, Vertex>; regions: Region[]; world: World }
export interface Edge { key: string; a: string; b: string; regions: string[] } // 由 loop 推導，不存

export interface Material { id: string; name: string; fill: string; isVoid?: boolean }

export type CutId = 'x' | 'y' | 'z';
export type Mode = 'region' | 'edge' | 'vertex';

export interface RasterImage { width: number; height: number; data: Uint8ClampedArray }

/** 載入時的快照，不變；輸出只看它與目前 Model 的差異 */
export interface Imported {
  width: number;
  height: number;
  original: Uint8ClampedArray; // RGBA，輸出的起點
  labels: Int32Array; // 每像素的區域編號
  palette: string[]; // 調色盤 hex
  materials: Material[]; // palette 每色一個 + VOID
  model: Model; // 分割結果（nm）
  nmPerPx: number;
}

export interface Baseline { model: Model; label: string; pinned: boolean }

export interface CutState { imported: Imported; model: Model; history: Model[]; future: Model[]; baseline: Baseline | null }
