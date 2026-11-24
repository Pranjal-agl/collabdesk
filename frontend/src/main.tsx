import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from './lib/auth';
import { Background } from './components/Background';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Background />
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ style: { background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' } }} />
    </BrowserRouter>
  </StrictMode>,
);
