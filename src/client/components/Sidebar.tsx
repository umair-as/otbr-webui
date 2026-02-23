import Nav from './Nav';

declare const __APP_VERSION__: string;

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCollapsedToggle: () => void;
  onMobileClose: () => void;
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onCollapsedToggle,
  onMobileClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onMobileClose}
          data-testid="sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-16 bottom-0 z-40 flex flex-col border-r border-border bg-surface transition-all duration-200 md:relative md:top-0 ${
          mobileOpen ? 'left-0' : '-left-72 md:left-0'
        } ${collapsed ? 'w-20' : 'w-72'}`}
      >
        <div className="flex-1 overflow-y-auto">
          <Nav collapsed={collapsed} onNavigate={onMobileClose} />
        </div>

        {/* Branding footer */}
        <div className="border-t border-border px-4 py-3">
          {collapsed ? (
            <a
              href="https://github.com/umair-uas/rpi5-iot-gateway"
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-center text-content-muted hover:text-content-secondary"
              aria-label="GitHub repository"
            >
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm text-content-secondary">
                <span className="font-medium">IoT GW OS</span>
                <span className="ml-1.5 text-content-muted">{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}</span>
              </div>
              <a
                href="https://github.com/umair-uas/rpi5-iot-gateway"
                target="_blank"
                rel="noopener noreferrer"
                className="text-content-muted hover:text-content-secondary"
                aria-label="GitHub repository"
              >
                <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onCollapsedToggle}
          className="hidden border-t border-border p-3 text-content-muted hover:text-content-secondary md:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="material-icons text-[22px]">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </aside>
    </>
  );
}
