import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Toaster } from '@/components/ui/sonner.jsx'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog.jsx'

// 注：此前这里有一段 window.fetch 全局猴补，把 /api/ 请求改写到
// http://localhost:3001。它只处理 string 型 input，EventSource /
// XMLHttpRequest 都会被绕过，导致桌面端功能静默失效。
// 现已由 lib/apiClient.js 统一出口取代，不再需要全局劫持。

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ConfirmDialogProvider>
        <App />
        <Toaster />
      </ConfirmDialogProvider>
    </ErrorBoundary>
  </StrictMode>,
)
