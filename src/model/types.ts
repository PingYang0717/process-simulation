export type XY = [number, number]; // nm，y 軸往下為正

export interface Vertex { id: string; x: number; y: number }
export interface Region { id: string; label: string; material: string; kind: string; loop: string[] } // 頂點 id 環
export interface World { x0: number; x1: number; yTop: number; yBot: number } // 剖面範圍
export interface Model { vertices: Record<string, Vertex>; regions: Region[]; world: World }
export interface Edge { key: string; a: string; b: string; regions: string[] } // 由 loop 推導，不存

export interface RegionSpec { id: string; label: string; material: string; kind: string; pts: XY[] }

export interface Material { id: string; name: string; fill: string }
export type CutId = 'x' | 'y' | 'z';

export type ParamKey = 'Lg' | 'Pg' | 'Tsp' | 'Wfin' | 'Pf' | 'Hfin' | 'Hg' | 'Tox';
export type Params = Record<ParamKey, number>;

/** 全域文件：三個剖面 + 共用參數，Undo 的單位 */
export interface Doc { cuts: Record<CutId, Model>; params: Params }

export type Mode = 'region' | 'edge' | 'vertex';
