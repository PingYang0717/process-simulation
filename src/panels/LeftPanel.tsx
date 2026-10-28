import { useRef, useState } from 'react';
import { CUTS } from '../editor/useEditor';
import type { Editor } from '../editor/useEditor';
import { decodeImage, importRaster } from '../raster/importRaster';
import type { Mode, RasterImage } from '../model/types';
import { NumField, Section } from './ui';

const MODES: [Mode, string][] = [['region', '區域 1'], ['edge', '邊 2'], ['vertex', '頂點 3']];

const KEYS: [string, string][] = [
  ['點選', '選單一'],
  ['Shift + 點', '加入選取'],
  ['Ctrl/⌘ + 點', '切換選取'],
  ['空白處拖拉', '框選（+Shift 累加）'],
  ['Ctrl/⌘ + A', '全選'],
  ['Esc', '取消選取'],
  ['方向鍵', '微移 1 nm（Shift 10、Alt 0.1）'],
  ['滾輪', '以游標為中心縮放'],
  ['Space + 拖／中鍵', '平移（H 切換手形）'],
  ['+ / − / F', '放大／縮小／適合視窗'],
  ['Ctrl/⌘ + Z / Y', 'Undo / Redo'],
  ['1 / 2 / 3', '區域／邊／頂點模式'],
  ['雙擊邊', '插入頂點（邊模式）'],
];

export function LeftPanel({ ed, nmPerPx, setNmPerPx }: { ed: Editor; nmPerPx: number; setNmPerPx: (v: number) => void }) {
  const [busy, setBusy] = useState(false);
  const source = useRef<RasterImage | null>(null);
  const cut = CUTS.find((c) => c.id === ed.cut)!;
  const segment = async (img: RasterImage) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 0));
    ed.loadImage(importRaster(img, nmPerPx));
    setBusy(false);
  };
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
          {ed.imported.width} × {ed.imported.height} px　{ed.imported.palette.length} 色　{ed.model.regions.length} 區域
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
          載入範例（{cut.desc}）
        </button>
        <div className="row" style={{ marginTop: 8 }}>
          <NumField label="1 px = ? nm" value={nmPerPx} onChange={(v) => v > 0 && setNmPerPx(v)} step={0.05} w={110} />
          <button
            onClick={() => segment(source.current ?? { width: ed.imported.width, height: ed.imported.height, data: ed.imported.original })}
            disabled={busy}
          >
            重新分割
          </button>
        </div>
        <small className="dim">
          輸出尺寸永遠等於輸入（{ed.imported.width} × {ed.imported.height}），比例只影響顯示的 nm 數值。
        </small>
      </Section>

      <Section title="選取模式">
        <div className="seg">
          {MODES.map(([m, label]) => (
            <button key={m} className={ed.mode === m ? 'on' : ''} onClick={() => ed.setMode(m)}>{label}</button>
          ))}
        </div>
      </Section>

      <Section title="拖拉規則">
        <div className="small"><b>區域</b>：整塊搬動，只動自己；空出來的地方用「回填材質」填，搬到的地方蓋在上面。</div>
        <div className="small"><b>邊／頂點</b>：連動，相鄰材質跟著變形，不留縫。</div>
        <small className="dim">頂點不會被拖出影像範圍。</small>
      </Section>

      <Section title="快捷鍵">
        <table className="keys">
          <tbody>
            {KEYS.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
    </aside>
  );
}
