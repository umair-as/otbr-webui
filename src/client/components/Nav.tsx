import { NavLink } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/', icon: 'dashboard' },
  { label: 'Topology', path: '/topology', icon: 'hub' },
  { label: 'Diagnostics', path: '/diagnostics', icon: 'troubleshoot' },
  { label: 'Commissioner', path: '/commissioner', icon: 'supervisor_account' },
  { label: 'Network', path: '/network', icon: 'wifi' },
  { label: 'Dataset', path: '/dataset', icon: 'storage' },
  { label: 'Energy Scan', path: '/energy', icon: 'bolt' },
] as const;

interface NavProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export default function Nav({ collapsed, onNavigate }: NavProps) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-4 py-3 text-[15px] font-medium transition-colors ${
              isActive
                ? 'border-l-[3px] border-accent bg-accent/10 text-accent-hover'
                : 'border-l-[3px] border-transparent text-content hover:bg-content/5'
            } ${collapsed ? 'justify-center px-0' : ''}`
          }
          title={collapsed ? item.label : undefined}
        >
          <span
            className={`material-icons text-[24px]`}
          >
            {item.icon}
          </span>
          {!collapsed && <span>{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
