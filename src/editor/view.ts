/** 螢幕 px = 影像 px × s + t */
export interface View { s: number; tx: number; ty: number }
export interface Size { w: number; h: number }

export const MIN_S = 0.2;
export const MAX_S = 80;

/** 取 1/2/5×10ⁿ 中，換成螢幕 px 最接近 targetPx 的值（pxPerUnit：每單位幾個螢幕 px） */
export function niceStep(pxPerUnit: number, targetPx = 70): number {
  const raw = targetPx / pxPerUnit;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** 帶正負號；0 顯示 ± */
export const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;
