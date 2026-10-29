import { DownloadOutlined, DownOutlined, QuestionCircleOutlined, RedoOutlined, UndoOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Divider, Dropdown, Segmented, Space, Tooltip, Typography } from 'antd';
import type { Underlay } from '../canvas/RasterUnderlay';
import { CUTS } from '../editor/useEditor';
import type { Editor } from '../editor/useEditor';
import type { CutId } from '../model/types';

/** 頂端列：剖面方向、復原、檢視模式、上傳、匯出、說明 */
export function HeaderBar({ ed, underlay, setUnderlay, onUpload, onExportPng, onExportLabels, onHelp }: {
  ed: Editor; underlay: Underlay; setUnderlay: (u: Underlay) => void;
  onUpload: () => void; onExportPng: () => void; onExportLabels: () => void; onHelp: () => void;
}) {
  const view = underlay === 'compare' ? 'compare' : underlay === 'original' ? 'original' : 'edit';
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6"><path d="M2 13h12M4 13V8a4 4 0 0 1 8 0v5" /></svg>
        </span>
        <span className="brand-name">Section Editor</span>
      </div>
      <Divider type="vertical" />
      <Segmented
        value={ed.cut}
        onChange={(v) => ed.setCut(v as CutId)}
        options={CUTS.map((c) => ({ label: c.name, value: c.id }))}
        aria-label="剖面方向"
      />
      <Typography.Text type="secondary" ellipsis style={{ maxWidth: 220 }}>{ed.imported.source ?? '內建範例'}</Typography.Text>
      <div className="grow" />
      <Space size={4}>
        <Tooltip title="復原（Ctrl+Z）"><Button type="text" icon={<UndoOutlined />} disabled={!ed.history.length} onClick={ed.undo} aria-label="復原" /></Tooltip>
        <Tooltip title="重做（Ctrl+Y）"><Button type="text" icon={<RedoOutlined />} disabled={!ed.future.length} onClick={ed.redo} aria-label="重做" /></Tooltip>
      </Space>
      <Segmented
        value={view}
        onChange={(v) => setUnderlay(v === 'compare' ? 'compare' : v === 'original' ? 'original' : 'output')}
        options={[{ label: '編輯', value: 'edit' }, { label: '前後比對', value: 'compare' }, { label: '原圖', value: 'original' }]}
        aria-label="檢視"
      />
      <div className="grow" />
      <Button icon={<UploadOutlined />} onClick={onUpload}>上傳 PNG</Button>
      <Dropdown
        trigger={['click']}
        menu={{ items: [
          { key: 'png', label: '匯出 PNG（與原圖同尺寸）', onClick: onExportPng },
          { key: 'labels', label: '匯出材質編號圖', onClick: onExportLabels },
        ] }}
      >
        <Button type="primary" icon={<DownloadOutlined />}>匯出 <DownOutlined style={{ fontSize: 10 }} /></Button>
      </Dropdown>
      <Tooltip title="操作說明"><Button type="text" icon={<QuestionCircleOutlined />} onClick={onHelp} aria-label="操作說明" /></Tooltip>
    </header>
  );
}
