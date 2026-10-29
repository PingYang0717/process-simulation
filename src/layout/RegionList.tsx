import { EditOutlined, LeftOutlined, MenuOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, Tag, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { Editor } from '../editor/useEditor';
import { Swatch } from '../ui/Swatch';

/**
 * 左欄：依材質分組的區域清單。點區域選取（Shift 加選、Ctrl 切換），點材質標題選整組；
 * 材質名稱旁的筆可改名（區域名稱跟著改）。
 */
export function RegionList({ ed, changed, collapsed, setCollapsed, onSettings }: {
  ed: Editor; changed: Set<string>; collapsed: boolean; setCollapsed: (v: boolean) => void; onSettings: () => void;
}) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const groups = useMemo(() => {
    const byMat = new Map<string, typeof ed.model.regions>();
    ed.model.regions.forEach((r) => {
      if (!byMat.has(r.material)) byMat.set(r.material, []);
      byMat.get(r.material)!.push(r);
    });
    const num = (label: string) => parseInt(label.split(' ').pop() ?? '0', 10) || 0;
    return ed.materials
      .filter((m) => byMat.has(m.id))
      .map((m) => ({ mat: m, regions: [...byMat.get(m.id)!].sort((a, b) => num(a.label) - num(b.label)) }))
      .map((g) => ({ ...g, shown: q ? g.regions.filter((r) => r.label.toLowerCase().includes(q.toLowerCase()) || g.mat.name.toLowerCase().includes(q.toLowerCase())) : g.regions }))
      .filter((g) => g.shown.length);
  }, [ed.model, ed.materials, q]);

  if (collapsed) {
    return (
      <aside className="sider collapsed">
        <Tooltip title="展開區域清單" placement="right"><Button type="text" icon={<MenuOutlined />} onClick={() => setCollapsed(false)} aria-label="展開區域清單" /></Tooltip>
      </aside>
    );
  }
  const sel = new Set(ed.regionSel);
  const how = (e: React.MouseEvent) => (e.shiftKey ? 'add' : e.ctrlKey || e.metaKey ? 'toggle' : 'set') as 'add' | 'toggle' | 'set';
  return (
    <aside className="sider">
      <div className="sider-head">
        <Typography.Text strong>區域 <Typography.Text type="secondary">{ed.model.regions.length}</Typography.Text></Typography.Text>
        <Tooltip title="收合"><Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setCollapsed(true)} aria-label="收合左欄" /></Tooltip>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <Input allowClear prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} placeholder="搜尋區域或材質" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="sider-body">
        {groups.map(({ mat, regions, shown }) => {
          const allOn = regions.every((r) => sel.has(r.id));
          const only = regions.length === 1 ? regions[0] : null; // 只有一個區域的材質：標題列就是那個區域
          return (
            <div key={mat.id} className="group">
              <div className={'group-head' + (allOn ? ' on' : '') + (only && allOn ? ' sel' : '')}>
                <Swatch fill={mat.fill} isVoid={mat.isVoid} />
                {editing === mat.id ? (
                  <Input
                    size="small"
                    autoFocus
                    defaultValue={mat.name}
                    onBlur={(e) => { ed.renameMaterial(mat.id, e.target.value.trim()); setEditing(null); }}
                    onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
                    onKeyDown={(e) => { if (e.key === 'Escape') { (e.target as HTMLInputElement).value = mat.name; setEditing(null); } }}
                  />
                ) : (
                  <>
                    <button type="button" className="group-name" onClick={(e) => ed.selectRegions(regions.map((r) => r.id), how(e))} title={only ? `選取 ${only.label}` : '選取這個材質的全部區域'}>
                      {only ? only.label : mat.name}
                    </button>
                    {only && changed.has(only.id) && <Tag color="orange" bordered={false} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>已改</Tag>}
                    <Tooltip title="改材質名稱"><Button type="text" size="small" className="group-edit" icon={<EditOutlined />} onClick={() => setEditing(mat.id)} aria-label={`改 ${mat.name} 的名稱`} /></Tooltip>
                    {!only && <span className="group-count">{regions.length}</span>}
                  </>
                )}
              </div>
              {!only && shown.map((r) => (
                <button type="button" key={r.id} className={'item' + (sel.has(r.id) ? ' on' : '')} onClick={(e) => ed.selectRegions([r.id], how(e))}>
                  <span className="item-name">{r.label}</span>
                  {changed.has(r.id) && <Tag color="orange" bordered={false} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>已改</Tag>}
                </button>
              ))}
            </div>
          );
        })}
        {!groups.length && <Typography.Text type="secondary" style={{ display: 'block', padding: 16 }}>找不到符合的區域</Typography.Text>}
      </div>
      <div className="sider-foot">
        <span>{ed.imported.width} × {ed.imported.height} px · 1 px = {ed.nmPerPx} nm</span>
        <Typography.Link onClick={onSettings}>設定</Typography.Link>
      </div>
    </aside>
  );
}
