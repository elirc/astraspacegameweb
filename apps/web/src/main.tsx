import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { Recovery } from './AccountExtras';
import { Legal } from './Legal';
import './style.css';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 1500 } },
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        {new URLSearchParams(location.search).has('legal') ? (
          <Legal />
        ) : new URLSearchParams(location.search).has('reset') ||
          new URLSearchParams(location.search).has('recover') ? (
          <Recovery />
        ) : (
          <App />
        )}
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
if ('serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register('/sw.js');
