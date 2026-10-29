import { App as AntApp, ConfigProvider } from 'antd';
import zhTW from 'antd/locale/zh_TW';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// antd 預設主題（主色 #1677ff）；字型加上中文字族
createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    locale={zhTW}
    theme={{ token: { fontFamily: "Inter, 'Noto Sans TC', -apple-system, 'PingFang TC', 'Microsoft JhengHei', sans-serif" } }}
    button={{ autoInsertSpace: false }}
  >
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>,
);
