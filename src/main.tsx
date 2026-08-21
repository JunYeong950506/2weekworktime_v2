import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import App from './App';
import CafeNumberAlertDialog from './features/cafe-number-alert/CafeNumberAlertDialog';
import './index.css';

dayjs.locale('ko');

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isCafeAlertPage = normalizedPath === '/cafe-alert';

if (isCafeAlertPage) {
  document.title = '카페 번호표 알림';
  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', '카페 번호표 알림');
  document
    .querySelector('link[rel="manifest"]')
    ?.setAttribute('href', '/cafe-alert.webmanifest');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isCafeAlertPage ? (
      <CafeNumberAlertDialog
        open
        onClose={() => window.location.assign('/')}
      />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
