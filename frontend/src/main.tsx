import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from './lib/auth';
import './index.css';
import { startSmoothScroll } from './lib/smoothScroll';

startSmoothScroll();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* "user": framer-motion drops transform animations when the OS asks for reduced motion. */}
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <App />
        </AuthProvider>
      </MotionConfig>
      <Toaster
        position="bottom-left"
        closeButton
        toastOptions={{
          style: {
            background: '#18211C',
            color: '#FBFCF8',
            border: 'none',
            borderRadius: '3px',
            fontFamily: '"Archivo Variable", Archivo, system-ui, sans-serif',
            fontSize: '14px',
          },
        }}
      />
    </BrowserRouter>
  </StrictMode>,
);
