import type { Editor } from '../editor/useEditor';
import { CUTS } from '../model/device';
import type { CutId, Mode } from '../model/types';
import { Section } from './ui';

function CutIcon({ id }: { id: CutId }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 } as const;
  return (
    <svg className="cuticon" width={30} height={30} viewBox="0 0 30 30">
      {id === 'x' && (<><rect x={3} y={17} width={24} height={9} {...s} /><rect x={7} y={7} width={5} height={10} {...s} /><rect x={18} y={7} width={5} height={10} {...s} /></>)}
      {id === 'y' && (<><rect x={3} y={21} width={24} height={5} {...s} /><rect x={7} y={10} width={4} height={11} {...s} /><rect x={19} y={10} width={4} height={11} {...s} /><path d="M4 21 V6 H26 V21" {...s} /></>)}
      {id === 'z' && (<><rect x={3} y={3} width={24} height={24} {...s} /><path d="M3 11 H27 M3 19 H27" {...s} /><path d="M11 3 V27 M19 3 V27" {...s} strokeDasharray="2 2" /></>)}
    </svg>
  );
}

const MODES: { id: Mode; label: string; key: string }[] = [
  { id: 'region', label: '區域', key: '1' },
  { id: 'edge', label: '邊', key: '2' },
  { id: 'vertex', label: '頂點', key: '3' },
];

const KEYS: [string, string][] = [
  ['1 / 2 / 3', '區域／邊／頂點模式'],
  ['點選', '選取單一'],
  ['Shift+點', '加入選取'],
  ['Ctrl/⌘+點', '切換選取'],
  ['空白處拖拉', '框選（+Shift 累加）'],
  ['Ctrl/⌘+A', '全選'],
  ['Esc', '取消選取'],
  ['方向鍵', '微調 1 nm（Shift 10、Alt 0.1）'],
  ['雙擊邊', '插入頂點'],
  ['拖橘色虛線邊', '改共用參數，三剖面連動'],
  ['滾輪', '以游標為中心縮放'],
  ['Space+拖／中鍵', '平移'],
  ['+ / − / F', '放大／縮小／適合視窗'],
  ['Ctrl/⌘+Z', '復原'],
  ['Ctrl/⌘+Shift+Z / Y', '重做'],
];

export function LeftPanel({ ed }: { ed: Editor }) {
  return (
    <aside className="left">
      <Section title="剖面方向">
        {CUTS.map((c) => (
          <button key={c.id} className={`cut ${ed.cut === c.id ? 'on' : ''}`} onClick={() => ed.switchCut(c.id)}>
            <CutIcon id={c.id} />
            <span>
              <b>{c.name}</b>
              <small>{c.desc}</small>
            </span>
          </button>
        ))}
        <small className="dim">三個剖面共用元件參數；Undo 為全域一條歷史。</small>
      </Section>
      <Section title="選取模式">
        <div className="seg">
          {MODES.map((m) => (
            <button key={m.id} className={ed.mode === m.id ? 'on' : ''} onClick={() => ed.setMode(m.id)}>
              {m.label} <span className="mono dim2">{m.key}</span>
            </button>
          ))}
        </div>
        <div className="opts">
          <label className="chk"><input type="checkbox" checked={ed.mirror} onChange={(e) => ed.setMirror(e.target.checked)} />多結構同步編輯（對應邊／頂點）</label>
          <label className="chk"><input type="checkbox" checked={ed.panMode} onChange={(e) => ed.setPanMode(e.target.checked)} />平移模式（手形工具）</label>
        </div>
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
