import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import DonutChart from '../components/DonutChart';
import { getRoleSummary, getVisibleNavSections } from '../config/navigation';
import { ROLE_LABELS } from '../constants/rbac';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Icon from '../components/ui/Icon';
import { motion } from 'framer-motion';

const navIconMap = {
  '/':           'LayoutDashboard',
  '/pengampu':   'BookOpen',
  '/jadwal':     'CalendarDays',
  '/presensi':   'ClipboardCheck',
  '/siswa':      'GraduationCap',
  '/rombel':     'Users',
  '/mapel':      'BookMarked',
  '/tendik':     'UserCog',
  '/period':     'Clock',
  '/laporan':    'BarChart3',
  '/catatan':    'MessageSquare',
  '/profil':     'CircleUser',
  '/user-access':'ShieldCheck',
};

const StatCard = ({ label, value, icon, color = 'emerald', delay = 0 }) => {
  const palette = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700', ring: 'ring-emerald-100' },
    sky:     { bg: 'bg-sky-50',     icon: 'text-sky-600',     val: 'text-sky-700',     ring: 'ring-sky-100'     },
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  val: 'text-violet-700',  ring: 'ring-violet-100'  },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-700',   ring: 'ring-amber-100'   },
  };
  const p = palette[color] ?? palette.emerald;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className="p-5 flex items-center gap-4">
        <div className={`h-12 w-12 flex-shrink-0 flex items-center justify-center rounded-2xl ${p.bg} ring-1 ${p.ring}`}>
          <Icon name={icon} size={22} className={p.icon} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className={`text-2xl font-extrabold mt-0.5 ${p.val}`}>{value ?? '—'}</p>
        </div>
      </Card>
    </motion.div>
  );
};

const QuickLink = ({ item, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, delay }}
  >
    <Link
      to={item.path}
      className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 hover:border-emerald-200 hover:shadow-md transition-all duration-150"
    >
      <div className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-50 group-hover:bg-emerald-50 transition-colors">
        <Icon
          name={navIconMap[item.path] || 'Circle'}
          size={17}
          className="text-slate-400 group-hover:text-emerald-600 transition-colors"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors truncate">
          {item.resolvedLabel}
        </p>
        {item.summary && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{item.summary}</p>
        )}
      </div>
      <Icon name="ChevronRight" size={15} className="text-slate-300 group-hover:text-emerald-400 flex-shrink-0 transition-colors" />
    </Link>
  </motion.div>
);

const AttRow = ({ color, label, value, total }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
      <span className="w-10 text-right text-xs text-slate-400">{pct}%</span>
    </div>
  );
};

const Dashboard = () => {
  const { logout, roles }  = useAuth();
  const [profile, setProfile]   = useState(null);
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    let active = true;
    api.get('/users/me')
      .then(r  => { if (active) setProfile(r.data); })
      .catch(e => { if (e.response?.status === 401) logout(); });
    api.get('/dashboard/overview')
      .then(r  => { if (active) setOverview(r.data); })
      .catch(() => {});
    return () => { active = false; };
  }, [logout]);

  const effectiveRoles = profile?.roles?.length ? profile.roles : roles;
  const roleSummary    = getRoleSummary(effectiveRoles);
  const navSections    = useMemo(() =>
    getVisibleNavSections(effectiveRoles)
      .map(s => ({ ...s, items: s.items.filter(i => i.path !== '/') }))
      .filter(s => s.items.length > 0),
    [effectiveRoles]
  );

  const att = overview?.attendanceSummary ?? {};
  const attTotal = (att.hadir ?? 0) + (att.izin ?? 0) + (att.sakit ?? 0) + (att.alpa ?? 0);

  const chartData = [
    { label: 'Hadir', value: att.hadir ?? 0,  color: '#10b981' },
    { label: 'Izin',  value: att.izin  ?? 0,  color: '#f59e0b' },
    { label: 'Sakit', value: att.sakit ?? 0,  color: '#3b82f6' },
    { label: 'Alpa',  value: att.alpa  ?? 0,  color: '#f43f5e' },
  ];

  const now = new Date();
  const greeting =
    now.getHours() < 11 ? 'Selamat Pagi' :
    now.getHours() < 15 ? 'Selamat Siang' :
    now.getHours() < 18 ? 'Selamat Sore'  : 'Selamat Malam';

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f1629] to-[#1a2744] p-6 sm:p-8 text-white shadow-xl"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/3 h-40 w-40 rounded-full bg-emerald-700/10 blur-2xl" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-emerald-400 text-sm font-semibold">
              {greeting} ☀️
            </p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">
              {profile ? (profile.tendik?.name || profile.username) : '...'}
            </h2>
            <p className="mt-1 text-white/50 text-sm">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          {profile && (
            <div className="flex flex-wrap gap-2">
              {profile.roles.map(role => (
                <Badge key={role} variant="success" dot className="text-[11px]">
                  {ROLE_LABELS[role] || role}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {roleSummary.focus && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <Card variant="gradient" className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-emerald-100">
                <Icon name="Sparkles" size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Fokus Role Anda</p>
                <h3 className="mt-0.5 text-lg font-bold text-slate-900">{roleSummary.focus.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{roleSummary.focus.description}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {overview && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Siswa"   value={overview.students}            icon="GraduationCap" color="emerald" delay={0.08} />
          <StatCard label="Rombel Aktif"  value={overview.rombels}             icon="Users"         color="sky"     delay={0.12} />
          <StatCard label="Pengampu"      value={overview.teachingAssignments} icon="BookOpen"      color="violet"  delay={0.16} />
          <StatCard label="Periode Aktif" value={overview.period?.name ?? '-'} icon="CalendarDays"  color="amber"   delay={0.20} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {navSections.length > 0 && (
          <div className="lg:col-span-3 space-y-5">
            <h2 className="section-title px-0.5">Akses Cepat</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {navSections.flatMap(s =>
                s.items.map((item, i) => (
                  <QuickLink key={item.key} item={item} delay={0.06 * i} />
                ))
              )}
            </div>
          </div>
        )}

        {overview && (
          <div className="lg:col-span-2 space-y-5">
            <h2 className="section-title px-0.5">Presensi Bulan Ini</h2>
            <Card className="p-5 sm:p-6">
              <p className="text-xs text-slate-400 mb-5">
                Periode {overview.period?.name ?? '—'}
              </p>
              <div className="flex flex-col items-center gap-6">
                <DonutChart data={chartData} />
                <div className="w-full space-y-3.5">
                  {chartData.map(item => (
                    <AttRow
                      key={item.label}
                      color={item.color}
                      label={item.label}
                      value={item.value}
                      total={attTotal}
                    />
                  ))}
                  <div className="border-t border-slate-100 pt-3 flex justify-between text-xs text-slate-500">
                    <span>Total</span>
                    <span className="font-semibold text-slate-700">{attTotal}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
