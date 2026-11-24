import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { WebSocketProvider } from '../context/WebSocketContext';
import ErrorBoundary from './ErrorBoundary';
import Footer from './Footer';
import Header from './Header';
import Sidebar from './Sidebar';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <ThemeProvider>
      <WebSocketProvider>
        <div className="flex h-screen flex-col">
          <Header onMenuToggle={() => setMobileOpen((v) => !v)} />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              collapsed={collapsed}
              mobileOpen={mobileOpen}
              onCollapsedToggle={() => setCollapsed((v) => !v)}
              onMobileClose={() => setMobileOpen(false)}
            />
            <main className="flex-1 overflow-y-auto bg-page p-8">
              <ErrorBoundary resetKey={pathname}>
                <Outlet />
              </ErrorBoundary>
            </main>
          </div>
          <Footer />
        </div>
      </WebSocketProvider>
    </ThemeProvider>
  );
}
