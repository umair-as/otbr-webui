import Nav from './Nav';

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
