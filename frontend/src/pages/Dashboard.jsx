import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import DonutChart from '../components/DonutChart';
import { getRoleSummary, getVisibleNavSections } from '../config/navigation';
import { ROLE_LABELS } from '../constants/rbac';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

const Dashboard = () => {
  const { logout, roles } = useAuth();
  const [profile, setProfile] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    api.get('/users/me')
      .then((res) => { if (active) setProfile(res.data); })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.message || 'Gagal memuat profil');
          if (err.response?.status === 401) logout();
        }
      });

    api.get('/dashboard/overview')
      .then((res) => { if (active) setOverview(res.data); })
      .catch(() => {});

    return () => { active = false; };
  }, [logout]);

  const chartData = overview ? [
    { label: 'Hadir', value: overview.attendanceSummary?.hadir || 0, color: '#22c55e' },
    { label: 'Izin', value: overview.attendanceSummary?.izin || 0, color: '#eab308' },
    { label: 'Sakit', value: overview.attendanceSummary?.sakit || 0, color: '#3b82f6' },
    { label: 'Alpa', value: overview.attendanceSummary?.alpa || 0, color: '#ef4444' }
  ] : [];

  const effectiveRoles = profile?.roles?.length ? profile.roles : roles;
  const roleSummary = getRoleSummary(effectiveRoles);
  const navSections = useMemo(() => 
    getVisibleNavSections(effectiveRoles)
      .map(s => ({ ...s, items: s.items.filter(i => i.path !== '/') }))
      .filter(s => s.items.length > 0), 
    [effectiveRoles]
  );

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">
            Selamat Datang Kembali 👋
          </h1>
          {profile && (
            <p className="text-xl text-slate-600 mt-1">
              {profile.tendik?.name || profile.username}
            </p>
          )}
        </div>

        {profile && (
          <div className="flex flex-wrap gap-2">
            {profile.roles.map(role => (
              <Badge key={role} variant="success">
                {ROLE_LABELS[role] || role}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Role Focus Card */}
      {roleSummary.focus && (
        <Card className="p-6 bg-gradient-to-r from-emerald-50 to-white border-emerald-100">
          <div className="text-emerald-700 text-sm font-semibold uppercase tracking-widest">Fokus Role Anda</div>
          <h2 className="text-2xl font-semibold text-slate-900 mt-1">{roleSummary.focus.title}</h2>
          <p className="text-slate-600 mt-3 leading-relaxed">{roleSummary.focus.description}</p>
        </Card>
      )}

      {/* Quick Access */}
      {!!navSections.length && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-5">Akses Cepat</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {navSections.map(section => (
              <div key={section.key}>
                <p className="text-xs font-semibold uppercase text-neutral-400 mb-3">{section.label}</p>
                <div className="space-y-3">
                  {section.items.map(item => (
                    <Link
                      key={item.key}
                      to={item.path}
                      className="block p-5 rounded-3xl border border-neutral-100 hover:border-emerald-200 hover:shadow-md transition-all group"
                    >
                      <p className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                        {item.resolvedLabel}
                      </p>
                      {item.summary && <p className="text-sm text-slate-500 mt-1">{item.summary}</p>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Statistics & Presensi */}
      {overview && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Statistik */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-6">Statistik Utama</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-neutral-50 rounded-3xl p-6 text-center">
                <p className="text-4xl font-semibold text-emerald-600">{overview.students}</p>
                <p className="text-sm text-neutral-500 mt-1">Total Siswa</p>
              </div>
              <div className="bg-neutral-50 rounded-3xl p-6 text-center">
                <p className="text-4xl font-semibold text-emerald-600">{overview.rombels}</p>
                <p className="text-sm text-neutral-500 mt-1">Rombel Aktif</p>
              </div>
              <div className="bg-neutral-50 rounded-3xl p-6 text-center">
                <p className="text-4xl font-semibold text-emerald-600">{overview.teachingAssignments}</p>
                <p className="text-sm text-neutral-500 mt-1">Pengampu</p>
              </div>
              <div className="bg-neutral-50 rounded-3xl p-6 text-center">
                <p className="text-xl font-semibold text-slate-900">{overview.period?.name || '-'}</p>
                <p className="text-sm text-neutral-500 mt-1">Periode Aktif</p>
              </div>
            </div>
          </Card>

          {/* Presensi Chart */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-1">Presensi Bulan Ini</h2>
            <p className="text-xs text-neutral-500">Periode {overview.period?.name || '-'}</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mt-8">
              <DonutChart data={chartData} />
              <div className="flex-1 space-y-5 w-full max-w-xs">
                {chartData.map(item => (
                  <div key={item.label} className="flex items-center gap-4">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="flex-1 text-sm font-medium">{item.label}</span>
                    <span className="font-semibold text-lg">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
