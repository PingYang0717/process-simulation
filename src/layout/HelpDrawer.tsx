import { Drawer, Typography } from 'antd';

/** 操作說明：照「想做什麼」分組，一句話講完 */
const HELP: [string, [string, string][]][] = [
  ['移動', [
    ['整塊搬', '在區域裡面按住拖。'],
    ['推一條邊', '滑到邊上（游標變雙箭頭）按住拖，整段弧線一起動、兩端的角不動。按住 Shift 只推那一小段。'],
    ['拉節點', '滑到藍色節點按住拖，只會改到它和左右兩個節點之間的線。按住 Shift 只動這一點。'],
    ['輸入數值', '選好後在右欄「移動」填水平、垂直各幾 px，或右鍵選「移動到…」。'],
    ['往外推', '選一段邊，在右欄或右鍵選「往外推」，填幾 px（負值往內縮）。'],
    ['微調', '方向鍵一次 1 px；Shift + 方向鍵一次 10 px。'],
  ]],
  ['節點', [
    ['新增', '在邊上雙擊，或右鍵邊選「在這裡新增節點」。'],
    ['刪除', '選節點後按 Delete（形狀不變，只是不再顯示）。'],
    ['看全部的點', '按住 V。'],
  ]],
  ['選取', [
    ['選一個', '點一下；Shift 點可以加選，Ctrl 點加選或取消。左邊清單也可以點。'],
    ['選一堆', '在空白處拖出一個框；或點左邊清單的材質名稱選整組。'],
    ['換材質', '右鍵區域，或在右欄「材質」選。'],
  ]],
  ['畫面', [
    ['縮放', '滑鼠滾輪、觸控板捏合或 Ctrl＋滾動；按 F 看整張圖。'],
    ['移動畫面', '觸控板雙指移動；在圖片外面按住拖；按住空白鍵拖；或按右下角的手形按鈕（H）。'],
    ['對照原圖', '上方切到「前後比對」並排看；任何時候按住 B 暫時看原圖。'],
    ['復原', 'Ctrl+Z 復原、Ctrl+Y 重做、Esc 取消選取。'],
  ]],
];

export function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer title="怎麼操作" open={open} onClose={onClose} width={420}>
      <div className="help">
        {HELP.map(([group, items]) => (
          <section key={group}>
            <Typography.Title level={5}>{group}</Typography.Title>
            <dl>
              {items.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
