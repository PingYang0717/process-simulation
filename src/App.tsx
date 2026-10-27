import { SectionCanvas } from './canvas/SectionCanvas';
import { useEditor } from './editor/useEditor';
import { CUTS } from './model/device';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';

const MODE_NAME = { region: '區域', edge: '邊', vertex: '頂點' } as const;

export function App() {
  const ed = useEditor();
  const cut = CUTS.find((c) => c.id === ed.cut)!;
  const selCount = ed.mode === 'region' ? ed.regionSel.length : ed.itemSel.length;
  return (
    <div className="app">
      <LeftPanel ed={ed} />
      <main className="center">
        <div className="ctool">
          <span className="title">
            {cut.name}
            <small>{cut.desc}</small>
          </span>
          <span className="grow" />
          <button onClick={ed.undo} disabled={!ed.history.length} title="Ctrl/⌘+Z">復原</button>
          <button onClick={ed.redo} disabled={!ed.future.length} title="Ctrl/⌘+Shift+Z">重做</button>
          <button onClick={ed.reset}>重設全部</button>
        </div>
        <SectionCanvas ed={ed} />
        <div className="status">
          <span>模式 {MODE_NAME[ed.mode]}</span>
          <span>· 已選 {selCount}</span>
          {ed.mode !== 'region' && <span>· 編輯範圍 {ed.scope.length ? `${ed.scope.length} 個區域` : '全部'}</span>}
          {ed.mode === 'edge' && <span>· 綁定參數的邊 {ed.bindings.size}</span>}
          <span className="grow" />
          {ed.drag && <span className="hot">拖拉中</span>}
          <span>歷史 {ed.history.length}/50</span>
        </div>
      </main>
      <RightPanel ed={ed} />
    </div>
  );
}
