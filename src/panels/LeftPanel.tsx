import { useRef, useState } from 'react';
import { CUTS } from '../editor/useEditor';
import type { Editor } from '../editor/useEditor';
import { decodeImage, importRaster } from '../raster/importRaster';
import type { RasterImage } from '../model/types';
import { Section } from './ui';

const KEYS: [string, string][] = [
  ['游標靠近頂點', '變十字 → 拖那顆頂點'],
  ['游標靠近邊', '變雙箭頭 → 推整段平滑邊（Shift 只推一小段）；外層襯層預設跟著走'],
  ['區域內部', '變四箭頭 → 整塊搬動（鄰居不動，空位回填）'],
  ['空白處拖拉', '框選區域'],
  ['Shift / Ctrl 點', '加選 / 切換'],
  ['按住 V / E / R', '暫時只抓 頂點 / 邊 / 區域'],
  ['Alt 點邊', '插入頂點'],
  ['右鍵區域', '材質選單'],
  ['方向鍵', '1 px（Shift 10 px）'],
  ['滾輪 / Space 拖', '縮放 / 平移'],
  ['Ctrl+Z / Y、Esc', 'Undo / Redo、取消'],
];

export function LeftPanel({ ed }: { ed: Editor }) {
  const [busy, setBusy] = useState(false);
  const [minPx, setMinPx] = useState(12);
  const source = useRef<RasterImage | null>(null);
  const cut = CUTS.find((c) => c.id === ed.cut)!;
  const segment = async (img: RasterImage) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 0));
    ed.loadImage(importRaster(img, ed.nmPerPx, { minPx }));
    setBusy(false);
  };
  const { imported } = ed;
  return (
    <aside className="left">
      <Section title="TCAD Cut Direction">
        {CUTS.map((c) => (
          <button key={c.id} className={'cut' + (ed.cut === c.id ? ' on' : '')} onClick={() => ed.setCut(c.id)}>
            <span>
              <b>{c.name}</b>
              <small>{c.desc}</small>
            </span>
          </button>
        ))}
        <small className="dim">每個方向各自一張 PNG，各自保留編輯與 Undo。</small>
      </Section>

      <Section title={`輸入影像（${cut.name}）`}>
        <div className="small">
          {imported.width} × {imported.height} px　{imported.palette.length} 色　{ed.model.regions.length} 區域
          {imported.merged ? `　併入碎片 ${imported.merged}` : ''}
        </div>
        <label className="file">
          <input
            type="file"
            accept="image/png,image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              source.current = await decodeImage(f);
              segment(source.current);
            }}
          />
          載入 PNG…
        </label>
        <button
          onClick={() => {
            source.current = cut.demo();
            segment(source.current);
          }}
          disabled={busy}
        >
          載入範例
        </button>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="num" style={{ width: 90 }}>
            <span>1 px = ? nm</span>
            <input type="number" step={0.05} value={ed.nmPerPx} onChange={(e) => { const v = +e.target.value; if (v > 0) ed.setNmPerPx(v); }} />
          </label>
          <label className="num" style={{ width: 90 }}>
            <span>碎片門檻 px</span>
            <input type="number" step={1} min={0} value={minPx} onChange={(e) => setMinPx(Math.max(0, +e.target.value))} />
          </label>
          <button
            onClick={() => segment(source.current ?? { width: imported.width, height: imported.height, data: imported.original })}
            disabled={busy}
          >
            重新分割
          </button>
        </div>
        <small className="dim">載入時不做色彩管理；比例只影響顯示的 nm。小於門檻的色塊會併入鄰居（設 0 表示全部保留）。</small>
      </Section>

      <Section title="怎麼操作">
        <table className="keys">
          <tbody>
            {KEYS.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </aside>
  );
}
