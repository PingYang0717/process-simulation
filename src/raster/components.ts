/**
 * 連通元件：4 鄰接 flood fill，每個同色色塊一個 label；
 * 小於 minArea 的碎片併入相鄰中面積最大的色塊。回傳重新編號後的 labels 與每個 label 的調色盤索引。
 */
export function components(index: Uint16Array, W: number, H: number, minArea = 12): { labels: Int32Array; count: number; colorOf: number[] } {
  const labels = new Int32Array(W * H).fill(-1);
  const color: number[] = [];
  const area: number[] = [];
  const stack: number[] = [];
  const neighbors = (p: number) => {
    const x = p % W, y = (p - x) / W;
    return [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
  };
  for (let p = 0; p < W * H; p++) {
    if (labels[p] >= 0) continue;
    const id = color.length;
    const c = index[p];
    color.push(c);
    let a = 0;
    stack.push(p);
    labels[p] = id;
    while (stack.length) {
      const q = stack.pop()!;
      a++;
      for (const nb of neighbors(q)) {
        if (nb >= 0 && labels[nb] < 0 && index[nb] === c) {
          labels[nb] = id;
          stack.push(nb);
        }
      }
    }
    area.push(a);
  }

  const parent = color.map((_, i) => i);
  for (let id = 0; id < color.length; id++) {
    if (area[id] >= minArea) continue;
    const touch = new Map<number, number>();
    for (let p = 0; p < W * H; p++) {
      if (labels[p] !== id) continue;
      for (const nb of neighbors(p)) if (nb >= 0 && labels[nb] !== id) touch.set(labels[nb], (touch.get(labels[nb]) ?? 0) + 1);
    }
    let best = -1, bestArea = -1;
    touch.forEach((_, other) => {
      if (area[other] > bestArea) { bestArea = area[other]; best = other; }
    });
    if (best >= 0) parent[id] = best;
  }

  const root = (i: number) => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  const renum = new Map<number, number>();
  const colorOf: number[] = [];
  for (let id = 0; id < color.length; id++) {
    const r = root(id);
    if (!renum.has(r)) {
      renum.set(r, colorOf.length);
      colorOf.push(color[r]);
    }
  }
  for (let p = 0; p < W * H; p++) labels[p] = renum.get(root(labels[p]))!;
  return { labels, count: colorOf.length, colorOf };
}
