import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Gem, LogOut, Menu as MenuIcon, Plus, UserRound, HandCoins } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { visibleNavigation } from '@/app/navigation';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu, MenuItem, MenuDivider, Avatar } from '@/components/ui/Controls';
import { PageLoader } from '@/components/ui/Feedback';
import { useCollectPayment } from '@/features/payments/CollectPaymentProvider';
import { formatDate } from '@/lib/format';
import { useToday } from '@/lib/hooks';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Sidebar({ open, onNavigate }) {
  const { can, organization } = useAuth();
  const groups = visibleNavigation(can);
  return (
    <aside className={`sidebar${open ? ' sidebar--open' : ''}`} aria-label="Main navigation">
      <div className="sidebar__brand">
        <div className="sidebar__logo">{organization?.logoUrl ? <img src={organization.logoUrl} alt="" /> : <Gem size={20} aria-hidden />}</div>
        <div style={{ minWidth: 0 }}>
          <div className="sidebar__name truncate">{organization?.name ?? 'Shadi Hall'}</div>
          <div className="sidebar__tagline truncate">{organization?.tagline ?? 'Hall management'}</div>
        </div>
      </div>
      <nav className="sidebar__nav">
        {groups.map((group) => (
          <div className="nav-group" key={group.label ?? 'main'}>
            {group.label && <div className="nav-group__label">{group.label}</div>}
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link" onClick={onNavigate}>
                <item.icon size={18} aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">Shadi Hall Manager · v1.0</div>
    </aside>
  );
}

function Topbar({ onMenu }) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const collectPayment = useCollectPayment();
  const today = useToday();

  return (
    <header className="topbar">
      <IconButton className="topbar__menu-button" icon={MenuIcon} label="Open menu" variant="ghost" onClick={onMenu} />
      <div className="topbar__greeting">
        <div className="topbar__title">
          {greeting()}, {user?.name?.split(' ')[0]}
        </div>
        <div className="topbar__date">{formatDate(today, 'EEEE, d MMMM yyyy')}</div>
      </div>
      <div className="topbar__actions">
        {can('payments.create') && (
          <Button variant="gold" icon={HandCoins} onClick={() => collectPayment()} aria-label="Collect payment" className="topbar__action">
            <span className="topbar__label">Collect payment</span>
          </Button>
        )}
        {can('bookings.create') && (
          <Button variant="primary" icon={Plus} to="/bookings/new" aria-label="New booking" className="topbar__action">
            <span className="topbar__label">New booking</span>
          </Button>
        )}
        <Menu
          trigger={({ toggle }) => (
            <button type="button" className="btn btn--ghost" onClick={toggle} aria-label="Account menu" style={{ paddingLeft: 6, paddingRight: 6 }}>
              <Avatar name={user?.name} />
            </button>
          )}
        >
          <div className="menu__label">
            <div className="strong" style={{ color: 'var(--ink)' }}>
              {user?.name}
            </div>
            {user?.role?.name}
          </div>
          <MenuDivider />
          <MenuItem icon={UserRound} onClick={() => navigate('/account')}>
            My account
          </MenuItem>
          <MenuItem
            icon={LogOut}
            danger
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
}

export function AppShell() {
  // The mobile menu remembers the page it was opened on, so navigating anywhere closes it.
  const [menuOpenOn, setMenuOpenOn] = useState(null);
  const location = useLocation();
  const menuOpen = menuOpenOn === location.pathname;
  const closeMenu = () => setMenuOpenOn(null);

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onNavigate={closeMenu} />
      {menuOpen && <div className="sidebar-backdrop" onClick={closeMenu} aria-hidden />}
      <div className="main">
        <Topbar onMenu={() => setMenuOpenOn(location.pathname)} />
        <main className="page">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
