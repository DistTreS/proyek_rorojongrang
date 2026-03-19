import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ROLE_LABELS } from '../constants/rbac';
import { getVisibleNavSections } from '../config/navigation';

const Layout = ({ children }) => {
  const { roles, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navSections = useMemo(() => getVisibleNavSections(roles), [roles]);
  const roleLabels = useMemo(() => (
    roles.length ? roles.map((role) => ROLE_LABELS[role] || role) : ['Guest']
  ), [roles]);

  const navClass = ({ isActive }) => (
    `flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col border-r border-slate-200 bg-white px-6 py-8 lg:flex">
          <div className="text-lg font-semibold text-slate-900">SIA SMA 1 Hiliran Gumanti</div>
          <p className="mt-1 text-xs text-slate-500">Dashboard berbasis role</p>
          <nav className="mt-8 flex flex-col gap-6">
            {navSections.map((section) => (
              <div key={section.key} className="space-y-2">
                <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {section.label}
                </div>
                <div className="flex flex-col gap-2">
                  {section.items.map((item) => (
                    <NavLink key={item.key} to={item.path} className={navClass}>
                      {item.resolvedLabel}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-auto space-y-3 pt-8">
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {roleLabels.map((role) => (
                <span key={role} className="rounded-full bg-emerald-100 px-3 py-1">
                  {role}
                </span>
              ))}
            </div>
            <button
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:hidden">
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={() => setMobileOpen(true)}
            >
              Menu
            </button>
            <div className="text-sm font-semibold text-slate-900">SIA SMA 1 Hiliran Gumanti</div>
            <div className="text-xs text-slate-500">{roleLabels[0]}</div>
          </header>

          {mobileOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
              <div className="absolute left-0 top-0 h-full w-72 bg-white px-6 py-8 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">SIA SMA 1 Hiliran Gumanti</div>
                    <div className="text-xs text-slate-500">Dashboard berbasis role</div>
                  </div>
                  <button
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                    onClick={() => setMobileOpen(false)}
                  >
                    Tutup
                  </button>
                </div>
                <nav className="mt-6 flex flex-col gap-6">
                  {navSections.map((section) => (
                    <div key={section.key} className="space-y-2">
                      <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {section.label}
                      </div>
                      <div className="flex flex-col gap-2">
                        {section.items.map((item) => (
                          <NavLink
                            key={item.key}
                            to={item.path}
                            className={navClass}
                            onClick={() => setMobileOpen(false)}
                          >
                            {item.resolvedLabel}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
                <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {roleLabels.map((role) => (
                    <span key={role} className="rounded-full bg-emerald-100 px-3 py-1">
                      {role}
                    </span>
                  ))}
                </div>
                <button
                  className="mt-6 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                  onClick={logout}
                >
                  Logout
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 px-6 py-8 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
