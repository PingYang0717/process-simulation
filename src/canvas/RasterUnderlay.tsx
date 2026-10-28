import { useEffect, useRef } from 'react';
import type { Imported } from '../model/types';
import type { View } from '../editor/view';

export type Underlay = 'original' | 'output' | 'none';

const toCanvas = (cache: { current: HTMLCanvasElement | null }, img: ImageData) => {
  cache.current ??= document.createElement('canvas');
  const c = cache.current;
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
};

/** 底圖：原圖或輸出結果，加上相異像素紅色疊圖；依 view 變換、不平滑（放大看得到像素） */
export function RasterUnderlay({ imported, output, diffMask, showDiff, underlay, view, w, h }: {
  imported: Imported; output: Uint8ClampedArray; diffMask: Uint8Array; showDiff: boolean; underlay: Underlay; view: View; w: number; h: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const diff = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { width: W, height: H } = imported;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(view.s, 0, 0, view.s, view.tx, view.ty);
    if (underlay !== 'none') {
      const data = underlay === 'output' ? output : imported.original;
      ctx.drawImage(toCanvas(base, new ImageData(new Uint8ClampedArray(data), W, H)), 0, 0);
    }
    if (showDiff && diffMask.some((v) => v)) {
      const img = new ImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        if (!diffMask[i]) continue;
        img.data[i * 4] = 226; img.data[i * 4 + 1] = 75; img.data[i * 4 + 2] = 74; img.data[i * 4 + 3] = 170;
      }
      ctx.drawImage(toCanvas(diff, img), 0, 0);
    }
  }, [underlay, output, diffMask, showDiff, imported, view, w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
