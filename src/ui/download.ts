import type { ExportResult } from '../raster/exportRaster';

const save = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const toPng = (img: ImageData, name: string) => {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  c.toBlob((b) => b && save(b, name), 'image/png');
};

/** 檔名：原檔名去副檔名，沒有就用剖面方向 */
const stem = (source: string | undefined, cut: string) => (source ? source.replace(/\.[^.]+$/, '') : `tcad-${cut}`);

export function downloadPng(result: ExportResult, W: number, H: number, source: string | undefined, cut: string) {
  toPng(new ImageData(new Uint8ClampedArray(result.data), W, H), `${stem(source, cut)}-edited.png`);
}

/** 材質編號圖：每像素灰階 = 材質在清單中的順序（0 起算） */
export function downloadLabels(result: ExportResult, W: number, H: number, source: string | undefined, cut: string) {
  const img = new ImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = result.labelMap[i];
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  toPng(img, `${stem(source, cut)}-labels.png`);
}
