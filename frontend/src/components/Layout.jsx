import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ROLE_LABELS } from '../constants/rbac';
import { getVisibleNavSections } from '../config/navigation';
import Icon from './ui/Icon';
import { motion, AnimatePresence } from 'framer-motion';

const iconMap = {
  '/': 'LayoutDashboard',
  '/pengampu': 'BookOpen',
  '/jadwal': 'CalendarDays',
  '/presensi': 'ClipboardCheck',
  '/siswa': 'GraduationCap',
  '/rombel': 'Users',
  '/mapel': 'BookMarked',
  '/tendik': 'UserCog',
  '/period': 'Clock',
  '/laporan': 'BarChart3',
  '/catatan': 'MessageSquare',
  '/profil': 'CircleUser',
  '/user-access': 'ShieldCheck',
};

/* ─── Sidebar Nav Item ─────────────────────────────────── */
const NavItem = ({ item, onClick }) => (
  <NavLink
    to={item.path}
    onClick={onClick}
    className={({ isActive }) =>
      `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
        isActive
          ? 'bg-emerald-500/20 text-emerald-300'
          : 'text-white/60 hover:bg-white/[0.07] hover:text-white/90'
      }`
    }
  >
    {({ isActive }) => (
      <>
        <span className={`flex-shrink-0 transition-colors ${isActive ? 'text-emerald-400' : 'text-white/40 group-hover:text-white/70'}`}>
          <Icon name={iconMap[item.path] || 'Circle'} size={18} />
        </span>
        <span className="truncate">{item.resolvedLabel}</span>
        {isActive && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        )}
      </>
    )}
  </NavLink>
);

/* ─── Sidebar Content ──────────────────────────────────── */
const SidebarContent = ({ navSections, roleLabels, logout, onClose }) => (
  <div className="flex h-full flex-col" style={{ background: 'var(--sidebar-bg)' }}>
    {/* Logo */}
    <div className="px-5 pt-6 pb-5">
      <div className="flex items-center gap-3">
        <div className="relative h-9 w-9 flex-shrink-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-900/40">
            S
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0f1629]" />
        </div>
        <div>
          <div className="text-sm font-bold text-white leading-tight">SIA SMA N 1</div>
          <div className="text-[11px] text-white/40 leading-tight mt-0.5">Hiliran Gumanti</div>
        </div>
      </div>
    </div>

    {/* Divider */}
    <div className="mx-5 h-px bg-white/[0.06]" />

    {/* Role chip */}
    <div className="px-5 py-3">
      <div className="flex flex-wrap gap-1.5">
        {roleLabels.map(role => (
          <span key={role} className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
            {role}
          </span>
        ))}
      </div>
    </div>

    {/* Nav */}
    <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-2 space-y-5">
      {navSections.map(section => (
        <div key={section.key}>
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white/25">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map(item => (
              <NavItem key={item.key} item={item} onClick={onClose} />
            ))}
          </div>
        </div>
      ))}
    </nav>

    {/* Logout */}
    <div className="p-4 border-t border-white/[0.06]">
      <button
        onClick={logout}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/50 transition-all hover:bg-white/[0.07] hover:text-rose-400"
      >
        <Icon name="LogOut" size={17} />
        <span>Keluar</span>
      </button>
    </div>
  </div>
);

/* ─── Layout ───────────────────────────────────────────── */
const Layout = ({ children }) => {
  const { roles, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const navSections = useMemo(() => getVisibleNavSections(roles), [roles]);
  const roleLabels  = useMemo(() =>
    roles.length ? roles.map(r => ROLE_LABELS[r] || r) : ['Guest'],
    [roles]
  );

  // Derive page title from current nav
  const pageTitle = useMemo(() => {
    for (const s of navSections) {
      for (const item of s.items) {
        if (item.path === location.pathname) return item.resolvedLabel;
      }
    }
    if (location.pathname === '/') return 'Dashboard';
    return '';
  }, [location.pathname, navSections]);

  return (
    <div className="flex min-h-screen bg-[var(--surface-page)]">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex w-64 xl:w-68 flex-col flex-shrink-0 sticky top-0 h-screen z-20">
        <SidebarContent
          navSections={navSections}
          roleLabels={roleLabels}
          logout={logout}
          onClose={null}
        />
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* ── Top Bar (Desktop + Mobile) ── */}
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-100 bg-white/80 backdrop-blur-md px-4 sm:px-6 py-3.5">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <Icon name="Menu" size={20} />
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            {pageTitle && (
              <h1 className="text-base font-semibold text-slate-800 truncate">{pageTitle}</h1>
            )}
          </div>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">S</div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 overflow-auto px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute left-0 top-0 h-full w-72 shadow-2xl overflow-hidden"
            >
              <SidebarContent
                navSections={navSections}
                roleLabels={roleLabels}
                logout={() => { setMobileOpen(false); logout(); }}
                onClose={() => setMobileOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Layout;