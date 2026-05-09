import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

function renderApp(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');

  // Mock fetch so Dashboard's useNodeInfo hook doesn't make real requests
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
});

describe('App', () => {
  it('renders the dashboard page on /', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders the header with app title', () => {
    renderApp();
    expect(screen.getByText('Thread Border Router')).toBeInTheDocument();
  });

  it('renders the WebSocket status badge', () => {
    renderApp();
    // Mock WS stays in CONNECTING state → badge shows "Connecting"
    expect(screen.getByText('Connecting')).toBeInTheDocument();
  });

  it('renders all 7 nav links', () => {
    renderApp();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Topology/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Diagnostics/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Commissioner/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Network/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dataset/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Energy Scan/ })).toBeInTheDocument();
  });

  it('highlights the active nav link with accent color', () => {
    renderApp('/topology');
    const topologyLink = screen.getByRole('link', { name: /Topology/ });
    expect(topologyLink.className).toContain('bg-accent/10');
    expect(topologyLink.className).toContain('text-accent-hover');
    expect(topologyLink.className).toContain('border-accent');
  });

  it('does not highlight inactive nav links', () => {
    renderApp('/topology');
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/ });
    expect(dashboardLink.className).not.toContain('bg-accent/10');
    expect(dashboardLink.className).toContain('border-transparent');
  });

  it('navigates to a different page when clicking a nav link', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('link', { name: /Topology/ }));
    expect(screen.getByRole('heading', { name: 'Topology' })).toBeInTheDocument();
  });

  it('renders each page at its route', () => {
    renderApp('/diagnostics');
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
  });
});

describe('Theme toggle', () => {
  it('renders the theme toggle button', () => {
    renderApp();
    // Default is 'system' mode (no localStorage), so label says "Switch to light mode"
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
  });

  it('cycles through system → light → dark → system', async () => {
    const user = userEvent.setup();
    renderApp();

    // Initial: system mode → click switches to light
    const sysBtn = screen.getByRole('button', { name: /switch to light mode/i });
    await user.click(sysBtn);
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Light → dark
    const lightBtn = screen.getByRole('button', { name: /switch to dark mode/i });
    await user.click(lightBtn);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Dark → system
    const darkBtn = screen.getByRole('button', { name: /switch to system mode/i });
    await user.click(darkBtn);
    expect(localStorage.getItem('theme')).toBeNull();
  });
});

describe('Branding footer', () => {
  it('renders project identity and source link', () => {
    renderApp();
    expect(screen.getByText('RPi5 IoT Gateway OS')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
  });

  it('links to correct GitHub repositories', () => {
    renderApp();
    const gwLink = screen.getByText('RPi5 IoT Gateway OS').closest('a');
    const otbrLink = screen.getByText('Source').closest('a');
    expect(gwLink).toHaveAttribute('href', 'https://github.com/umair-as/rpi5-iot-gateway');
    expect(otbrLink).toHaveAttribute('href', 'https://github.com/umair-as/otbr-webui');
  });
});
