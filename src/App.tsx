import { Badge, Flex, Modal, Tabs, Typography } from 'antd';
import { useMemo, useRef, useState } from 'react';
import { SectionCanvas } from './canvas/SectionCanvas';
import type { Underlay } from './canvas/RasterUnderlay';
import { useEditor } from './editor/useEditor';
import { ChangesTab } from './layout/ChangesTab';
import { DisplayTab } from './layout/DisplayTab';
import { HeaderBar } from './layout/HeaderBar';
import { HelpDrawer } from './layout/HelpDrawer';
import { Inspector } from './layout/Inspector';
import { RegionList } from './layout/RegionList';
import { UploadPanel } from './layout/UploadPanel';
import { exportRaster } from './raster/exportRaster';
import type { ExportResult } from './raster/exportRaster';
import { VOID_ID } from './raster/importRaster';
import { downloadLabels, downloadPng } from './ui/download';

export function App() {
  const ed = useEditor();
  const [started, setStarted] = useState(false); // 第一次使用先看上傳頁
  const [underlay, setUnderlay] = useState<Underlay>('output');
  const [alpha, setAlpha] = useState(0.3);
  const [showDiff, setShowDiff] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [backfill, setBackfill] = useState(VOID_ID);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [tab, setTab] = useState('props');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const last = useRef<ExportResult | null>(null);
  // 拖拉中即時重算（約 20 ms / 640×360）；超過 1M 像素的大圖才沿用上一次，放開再算
  const big = ed.imported.width * ed.imported.height > 1_000_000;
  const result = useMemo(() => {
    if (big && ed.dragging && last.current && last.current.data.length === ed.imported.original.length) return last.current;
    const r = exportRaster(ed.imported, ed.model, ed.materials, backfill);
    last.current = r;
    return r;
  }, [ed.imported, ed.model, ed.materials, backfill, big && ed.dragging]);
  const changed = useMemo(() => new Set(result.changed), [result]);
  const W = ed.imported.width, H = ed.imported.height;
  const exportPng = () => downloadPng(result, W, H, ed.imported.source, ed.cut);
  const exportLabels = () => downloadLabels(result, W, H, ed.imported.source, ed.cut);

  if (!started) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6"><path d="M2 13h12M4 13V8a4 4 0 0 1 8 0v5" /></svg>
            </span>
            <span className="brand-name">Section Editor</span>
          </div>
        </header>
        <div className="welcome">
          <div className="welcome-inner">
            <Typography.Title level={3} style={{ margin: 0 }}>開始編輯剖面</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 24px' }}>
              上傳 TCAD 輸出的剖面 PNG，系統會自動依顏色分出各個區域。編輯完匯出的 PNG 尺寸與原圖相同，沒改到的像素完全不變。
            </Typography.Paragraph>
            <UploadPanel ed={ed} firstRun onDone={() => setStarted(true)} />
          </div>
        </div>
      </div>
    );
  }

  const pct = ((result.diffPx / (W * H)) * 100).toFixed(2);
  return (
    <div className="app">
      <HeaderBar
        ed={ed}
        underlay={underlay}
        setUnderlay={setUnderlay}
        onUpload={() => setUploadOpen(true)}
        onExportPng={exportPng}
        onExportLabels={exportLabels}
        onHelp={() => setHelpOpen(true)}
      />
      <div className="body">
        <RegionList ed={ed} changed={changed} collapsed={leftCollapsed} setCollapsed={setLeftCollapsed} onSettings={() => setTab('display')} />
        <main className="stage">
          <SectionCanvas ed={ed} underlay={underlay} result={result} overlayAlpha={alpha} showDiff={showDiff} showLabels={showLabels} />
        </main>
        <aside className="inspector">
          <Tabs
            activeKey={tab}
            onChange={setTab}
            className="insp-tabs"
            items={[
              { key: 'props', label: '屬性', children: <div className="insp-body"><Inspector ed={ed} changed={changed} /></div> },
              {
                key: 'changes',
                label: <Flex align="center" gap={6}>改動{result.changed.length > 0 && <Badge count={result.changed.length} size="small" color="#1677ff" />}</Flex>,
                children: <div className="insp-body"><ChangesTab ed={ed} result={result} onExportPng={exportPng} onExportLabels={exportLabels} /></div>,
              },
              {
                key: 'display',
                label: '顯示',
                children: (
                  <div className="insp-body">
                    <DisplayTab
                      ed={ed}
                      showDiff={showDiff} setShowDiff={setShowDiff}
                      showLabels={showLabels} setShowLabels={setShowLabels}
                      alpha={alpha} setAlpha={setAlpha}
                      backfill={backfill} setBackfill={setBackfill}
                      onLoadSettings={() => setUploadOpen(true)}
                    />
                  </div>
                ),
              },
            ]}
          />
          <div className="insp-foot">
            <span className={'dot' + (result.diffPx ? ' warn' : '')} />
            {result.diffPx ? `已改動 ${result.diffPx.toLocaleString()} 個像素（${pct}%）` : '尚未改動，輸出與原圖完全相同'}
            {result.diffPx > 0 && tab !== 'changes' && <Typography.Link style={{ marginLeft: 'auto' }} onClick={() => setTab('changes')}>查看改動</Typography.Link>}
          </div>
        </aside>
      </div>

      <Modal title="上傳 PNG" open={uploadOpen} onCancel={() => setUploadOpen(false)} footer={null} width={720} destroyOnHidden>
        <UploadPanel ed={ed} firstRun={false} onDone={() => setUploadOpen(false)} />
      </Modal>
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
