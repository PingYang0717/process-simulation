import { InboxOutlined } from '@ant-design/icons';
import { App, Button, Flex, InputNumber, Typography, Upload } from 'antd';
import { useState } from 'react';
import { CUTS } from '../editor/useEditor';
import type { Editor } from '../editor/useEditor';
import type { CutId } from '../model/types';
import { decodeImage, importRaster } from '../raster/importRaster';

const { Text } = Typography;

/**
 * 上傳：選剖面方向 → 拖放 PNG → 自動分區。第一次使用時是整頁，之後在對話框裡。
 * 也可以在這裡改「忽略小色塊」後重新分區目前的圖。
 */
export function UploadPanel({ ed, firstRun, onDone }: { ed: Editor; firstRun: boolean; onDone: () => void }) {
  const { message } = App.useApp();
  const [target, setTarget] = useState<CutId>(ed.cut);
  const [minPx, setMinPx] = useState<number | null>(12);
  const [busy, setBusy] = useState(false);
  const load = async (file: File) => {
    setBusy(true);
    try {
      const img = await decodeImage(file);
      ed.setCut(target);
      ed.loadImage({ ...importRaster(img, ed.nmPerPx, { minPx: minPx ?? 12 }), source: file.name });
      message.success(`已載入 ${file.name}`);
      onDone();
    } catch {
      message.error('這個檔案讀不出來，請確認是 PNG 圖檔');
    } finally {
      setBusy(false);
    }
  };
  const resplit = () => {
    const imp = ed.cuts[target].imported;
    ed.setCut(target);
    ed.loadImage({ ...importRaster({ width: imp.width, height: imp.height, data: imp.original }, imp.nmPerPx, { minPx: minPx ?? 12 }), source: imp.source });
    message.success('已重新分區');
    onDone();
  };
  return (
    <Flex vertical gap={20}>
      <div className="slots" role="radiogroup" aria-label="剖面方向">
        {CUTS.map((c) => {
          const src = ed.cuts[c.id].imported.source;
          return (
            <button type="button" key={c.id} role="radio" aria-checked={target === c.id} className={'slot' + (target === c.id ? ' on' : '')} onClick={() => setTarget(c.id)}>
              <span className="slot-mark">{c.name[0]}</span>
              <span className="slot-text">
                <b>{c.name}</b>
                <small className={src ? 'ok' : ''}>{src ?? (firstRun ? '尚未上傳' : '內建範例')}</small>
              </span>
            </button>
          );
        })}
      </div>
      <Upload.Dragger
        accept="image/png"
        showUploadList={false}
        disabled={busy}
        beforeUpload={(file) => { load(file); return false; }}
        style={{ padding: firstRun ? '48px 0' : '24px 0' }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">把 {CUTS.find((c) => c.id === target)!.name} 的 PNG 拖到這裡，或點一下選檔案</p>
        <p className="ant-upload-hint">只放結構本身最好：圖上的文字、尺寸線、圖例會被當成區域</p>
      </Upload.Dragger>
      <div className="load-settings">
        <label className="field">
          <span>每個像素代表多少 nm</span>
          <InputNumber min={0.001} step={0.05} value={ed.nmPerPx} onChange={(v) => v && v > 0 && ed.setNmPerPx(v)} addonAfter="nm" />
          <Text type="secondary" style={{ fontSize: 12 }}>只影響畫面上顯示的 nm，不影響輸出的圖</Text>
        </label>
        <label className="field">
          <span>忽略小色塊</span>
          <InputNumber min={0} step={1} precision={0} value={minPx} onChange={setMinPx} addonAfter="像素" />
          <Text type="secondary" style={{ fontSize: 12 }}>比這個小的色塊會併到旁邊的區域；填 0 表示全部保留</Text>
        </label>
      </div>
      <Flex gap={12} align="center">
        {firstRun ? (
          <>
            <Text type="secondary">手邊還沒有圖？</Text>
            <Button onClick={() => { ed.setCut(target); onDone(); }}>用範例試試看</Button>
          </>
        ) : (
          <>
            <Button onClick={resplit}>用新的「忽略小色塊」重新分區 {CUTS.find((c) => c.id === target)!.name}</Button>
            <Text type="secondary" style={{ fontSize: 12 }}>重新分區會清掉這張圖的編輯</Text>
          </>
        )}
      </Flex>
    </Flex>
  );
}
