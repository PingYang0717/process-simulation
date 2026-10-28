import { useRef, useState } from 'react';
import { CUTS } from '../editor/useEditor';
import type { Editor } from '../editor/useEditor';
import { decodeImage, importRaster } from '../raster/importRaster';
import type { RasterImage } from '../model/types';
import { Section } from './ui';

/** 操作說明：照「想做什麼」分組，一句話講完 */
const HELP: [string, [string, string][]][] = [
  ['移動', [
    ['整塊搬', '在區域裡面按住拖。'],
    ['推一條邊', '滑到邊上（游標變雙箭頭）按住拖，整段弧線一起動、兩端的角不動。按住 Shift 只推那一小段。'],
    ['拉節點', '滑到藍色節點按住拖，只會改到它和左右兩個節點之間的線。按住 Shift 只動這一點。'],
    ['微調', '選好後按方向鍵，一次 1 像素；Shift + 方向鍵一次 10。'],
  ]],
  ['節點', [
    ['新增', '在邊上雙擊。'],
    ['刪除', '點選節點後按 Delete（形狀不變，只是不再顯示）。'],
    ['看全部的點', '按住 V。'],
  ]],
  ['選取', [
    ['選一個', '點一下；Shift 點可以加選，Ctrl 點加選或取消。'],
    ['選一堆', '在空白處拖出一個框。'],
    ['換材質', '在區域上按右鍵。'],
  ]],
  ['畫面', [
    ['縮放／移動', '滾輪縮放；按住空白鍵拖曳移動；按 F 看整張圖。'],
    ['對照原圖', '按住 B 暫時看原圖。'],
    ['復原', 'Ctrl+Z 復原、Ctrl+Y 重做、Esc 取消選取。'],
  ]],
];

export function LeftPanel({ ed }: { ed: Editor }) {
  const [busy, setBusy] = useState(false);
  const [minPx, setMinPx] = useState(12);
  const source = useRef<{ img: RasterImage; name?: string } | null>(null);
  const cut = CUTS.find((c) => c.id === ed.cut)!;
  const segment = async (img: RasterImage, name?: string) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 0));
    ed.loadImage({ ...importRaster(img, ed.nmPerPx, { minPx }), source: name });
    setBusy(false);
  };
  const { imported } = ed;
  const materialCount = ed.materials.filter((m) => !m.isVoid).length;
  return (
    <aside className="left">
      <Section title="剖面方向">
        {CUTS.map((c) => (
          <button key={c.id} className={'cut' + (ed.cut === c.id ? ' on' : '')} onClick={() => ed.setCut(c.id)}>
            <b>{c.name}</b>
          </button>
        ))}
      </Section>

      <Section title={`輸入圖片（${cut.name}）`}>
        <div className="small">
          {imported.source ?? '內建範例'}
          <br />
          <span className="dim">{imported.width} × {imported.height} 像素 · {materialCount} 種材質 · {ed.model.regions.length} 個區域</span>
        </div>
        <label className="file">
          <input
            type="file"
            accept="image/png,image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              source.current = { img: await decodeImage(f), name: f.name };
              segment(source.current.img, f.name);
              e.target.value = '';
            }}
          />
          上傳 PNG…
        </label>
        <button
          onClick={() => {
            source.current = { img: cut.demo() };
            segment(source.current.img);
          }}
          disabled={busy}
        >
          用範例
        </button>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="num" style={{ width: 96 }}>
            <span>1 像素 = ? nm</span>
            <input type="number" step={0.05} value={ed.nmPerPx} onChange={(e) => { const v = +e.target.value; if (v > 0) ed.setNmPerPx(v); }} />
          </label>
          <label className="num" style={{ width: 96 }}>
            <span>忽略小色塊</span>
            <input type="number" step={1} min={0} value={minPx} onChange={(e) => setMinPx(Math.max(0, +e.target.value))} />
          </label>
          <button
            onClick={() => segment(source.current?.img ?? { width: imported.width, height: imported.height, data: imported.original }, source.current?.name ?? imported.source)}
            disabled={busy}
          >
            重新分區
          </button>
        </div>
        <small className="dim">
          比例只影響畫面上顯示的 nm，不影響輸出。面積小於「忽略小色塊」像素數的色塊會併進旁邊的區域（填 0 表示全部保留），改完按「重新分區」。
        </small>
      </Section>

      <Section title="怎麼操作">
        <div className="help">
          {HELP.map(([group, items]) => (
            <div key={group}>
              <h4>{group}</h4>
              <dl>
                {items.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Section>
    </aside>
  );
}
