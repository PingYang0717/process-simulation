import { useEffect, useRef } from 'react';
import type { Imported } from '../model/types';
import type { View } from '../editor/view';

export type Underlay = 'original' | 'output' | 'none';

/** 底圖：原圖或輸出結果，依 view 變換、不平滑（放大看得到像素） */
export function RasterUnderlay({ imported, output, underlay, view, w, h }: { imported: Imported; output?: Uint8ClampedArray; underlay: Underlay; view: View; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (underlay === 'none') return;
    const data = underlay === 'output' ? output : imported.original;
    if (!data) return;
    off.current ??= document.createElement('canvas');
    const img = off.current;
    img.width = imported.width;
    img.height = imported.height;
    img.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), img.width, img.height), 0, 0);
    ctx.imageSmoothingEnabled = false;
    const k = imported.nmPerPx * view.s;
    ctx.setTransform(k, 0, 0, k, view.tx, view.ty);
    ctx.drawImage(img, 0, 0);
  }, [underlay, output, imported, view, w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
