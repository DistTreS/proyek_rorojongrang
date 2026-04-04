import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ROLE_LABELS } from '../constants/rbac';
import { getVisibleNavSections } from '../config/navigation';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Icon from './ui/Icon';
import { motion, AnimatePresence } from 'framer-motion';

// Icon mapping berdasarkan path
const iconMap = {
  '/': 'Home',
  '/pengampu': 'BookOpen',
  '/jadwal': 'Calendar',
  '/presensi': 'ClipboardCheck',
  '/siswa': 'Users',
  '/rombel': 'Users',
  '/mapel': 'Book',
  '/tendik': 'UserCog',
  '/period': 'Clock',
  '/laporan': 'BarChart3',
  '/catatan': 'MessageSquare',
  '/profil': 'User',
  '/user-access': 'Shield',
};

const Layout = ({ children }) => {
  const { roles, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navSections = useMemo(() => getVisibleNavSections(roles), [roles]);
  const roleLabels = useMemo(() => 
    roles.length ? roles.map(role => ROLE_LABELS[role] || role) : ['Guest'], 
    [roles]
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="flex min-h-screen">
        
        {/* Sidebar Desktop - Fixed & Compact */}
        <aside className="hidden w-72 flex-col border-r border-neutral-200 bg-white lg:flex h-screen sticky top-0">
          
          {/* Logo */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-bold text-2xl">S</div>
              <div>
                <div className="text-xl font-semibold text-slate-900">SIA SMA 1</div>
                <p className="text-xs -mt-0.5 text-neutral-500">Hiliran Gumanti</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 overflow-y-auto">
            {navSections.map((section) => (
              <div key={section.key} className="mb-6">
                <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  {section.label}
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'text-neutral-600 hover:bg-neutral-100'
                        }`
                      }
                    >
                      <Icon name={iconMap[item.path] || 'Circle'} size={20} />
                      {item.resolvedLabel}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer - Role + Logout (selalu di bawah) */}
          <div className="px-6 py-6 border-t border-neutral-100">

            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={logout}
            >
              Logout
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Mobile Header */}
          <header className="lg:hidden flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
            <Button variant="secondary" size="sm" onClick={() => setMobileOpen(true)}>
              Menu
            </Button>
            <div className="text-lg font-semibold text-slate-900">SIA SMA 1</div>
            <div className="text-xs text-neutral-500">{roleLabels[0]}</div>
          </header>

          {/* Mobile Menu */}
          <AnimatePresence>
            {mobileOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 lg:hidden">
                <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
                <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl">
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="h-9 w-9 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-bold text-2xl">S</div>
                      <div className="text-xl font-semibold">SIA SMA 1</div>
                    </div>

                    <nav className="space-y-8">
                      {navSections.map((section) => (
                        <div key={section.key}>
                          <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                            {section.label}
                          </div>
                          <div className="space-y-1">
                            {section.items.map((item) => (
                              <NavLink
                                key={item.key}
                                to={item.path}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) =>
                                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                                    isActive ? 'bg-emerald-50 text-emerald-700' : 'text-neutral-600 hover:bg-neutral-100'
                                  }`
                                }
                              >
                                <Icon name={iconMap[item.path] || 'Circle'} size={20} />
                                {item.resolvedLabel}
                              </NavLink>
                            ))}
                          </div>
                        </div>
                      ))}
                    </nav>
                  </div>

                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {roleLabels.map((role) => (
                        <Badge key={role} variant="success">{role}</Badge>
                      ))}
                    </div>
                    <Button variant="secondary" className="w-full" onClick={logout}>
                      Logout
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content */}
          <main className="flex-1 p-6 lg:p-10 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;