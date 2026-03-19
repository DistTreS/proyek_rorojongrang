import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import DonutChart from '../components/DonutChart';
import { getRoleSummary, getVisibleNavSections } from '../config/navigation';
import { ROLE_LABELS } from '../constants/rbac';

const Dashboard = () => {
  const { logout, roles } = useAuth();
  const [profile, setProfile] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api.get('/users/me')
      .then((res) => {
        if (!active) return;
        setProfile(res.data);
      })
      .catch((err) => {
        if (!active) return;
        const message = err.response?.data?.message || 'Gagal memuat profil';
        setError(message);
        if (err.response?.status === 401) {
          logout();
        }
      });

    api.get('/dashboard/overview')
      .then((res) => {
        if (!active) return;
        setOverview(res.data);
      })
      .catch(() => {
        if (!active) return;
        setOverview(null);
      });

    return () => {
      active = false;
    };
  }, [logout]);

  const chartData = overview ? [
    { label: 'Hadir', value: overview.attendanceSummary?.hadir || 0, color: '#1f6f54' },
    { label: 'Izin', value: overview.attendanceSummary?.izin || 0, color: '#f0b429' },
    { label: 'Sakit', value: overview.attendanceSummary?.sakit || 0, color: '#3b82f6' },
    { label: 'Alpa', value: overview.attendanceSummary?.alpa || 0, color: '#ef4444' }
  ] : [];
  const effectiveRoles = profile?.roles?.length ? profile.roles : roles;
  const roleSummary = getRoleSummary(effectiveRoles);
  const navSections = useMemo(() => {
    return getVisibleNavSections(effectiveRoles).map((section) => ({
      ...section,
      items: section.items.filter((item) => item.path !== '/')
    })).filter((section) => section.items.length);
  }, [effectiveRoles]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">Ringkasan sistem akademik dan status penjadwalan.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {profile && (
        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {profile.tendik?.name || profile.username}
            </h2>
            <div className="text-sm text-slate-500">{profile.email}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {profile.roles.map((role) => (
              <span key={role} className="rounded-full bg-emerald-100 px-3 py-1">
                {ROLE_LABELS[role] || role}
              </span>
            ))}
          </div>
        </div>
      )}

      {roleSummary.focus && (
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Fokus Role
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">
            {roleSummary.focus.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            {roleSummary.focus.description}
          </p>
          <div className="mt-4 text-sm font-medium text-emerald-700">
            Role utama: {roleSummary.primaryRoleLabel}
          </div>
        </div>
      )}

      {!!navSections.length && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Akses Cepat</h2>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              Menu sesuai role
            </span>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {navSections.map((section) => (
              <div key={section.key} className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {section.label}
                </div>
                <div className="grid gap-3">
                  {section.items.map((item) => (
                    <Link
                      key={item.key}
                      to={item.path}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                    >
                      <div className="text-sm font-semibold text-slate-900">{item.resolvedLabel}</div>
                      <div className="mt-1 text-sm text-slate-600">{item.summary}</div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {overview && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Statistik Utama</h2>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Periode {overview.period?.name || '-'}
              </span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
                <div className="text-2xl font-semibold text-slate-900">{overview.students}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Siswa</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
                <div className="text-2xl font-semibold text-slate-900">{overview.rombels}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Rombel</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
                <div className="text-2xl font-semibold text-slate-900">{overview.teachingAssignments}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Pengampu</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
                <div className="text-lg font-semibold text-slate-900">{overview.period?.name || '-'}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Periode Aktif</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Presensi Bulan Ini</h2>
            <p className="mt-1 text-xs text-slate-500">
              Periode {overview.dateRange?.from} s/d {overview.dateRange?.to}
            </p>
            <div className="mt-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <DonutChart data={chartData} />
              <div className="grid gap-3 text-sm text-slate-700">
                {chartData.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                    <span className="w-16">{item.label}</span>
                    <span className="font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Dashboard;
