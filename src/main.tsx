import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import './index.css';

// Limpieza de cachés heredadas y actualización automática ante nuevos despliegues en dominio propio
if (typeof window !== 'undefined') {
  try {
    sessionStorage.removeItem('chinmi_asset_reload_once');
  } catch {
    // ignore
  }

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      if (!sessionStorage.getItem('chinmi_preload_reload_once')) {
        sessionStorage.setItem('chinmi_preload_reload_once', '1');
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });

  if ('caches' in window) {
    caches.delete('chinmi-app-v1').catch(() => {});
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((reg) => {
          reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

