import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { ROLES } from '../constants/rbac';
import { useAuth } from '../context/useAuth';
import { isValidDateRange } from '../utils/temporalValidation';

const REPORT_TYPE_CONFIG = [
  { value: 'daily',          label: 'Harian',             endpoint: '/reports/daily',          icon: '📅', desc: 'Kehadiran siswa per hari', roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
  { value: 'monthly',        label: 'Bulanan',            endpoint: '/reports/monthly',         icon: '📆', desc: 'Rekapitulasi per bulan',    roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
  { value: 'semester',       label: 'Semester',           endpoint: '/reports/semester',        icon: '📊', desc: 'Rekapitulasi per semester', roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
  { value: 'rombels',        label: 'Per Rombel',         endpoint: '/reports/rombels',         icon: '🏫', desc: 'Statistik kehadiran rombel', roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
  { value: 'teacher-subject',label: 'Per Guru & Mapel',  endpoint: '/reports/teacher-subject', icon: '👨‍🏫', desc: 'Kehadiran per guru & mapel', roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
  { value: 'global',         label: 'Global',             endpoint: '/reports/global',          icon: '🌐', desc: 'Ringkasan kehadiran global',  roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
  { value: 'students',       label: 'Per Siswa',          endpoint: '/reports/students',        icon: '🎓', desc: 'Detail kehadiran per siswa',  roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
  { value: 'slots',          label: 'Per Jam Pelajaran',  endpoint: '/reports/slots',           icon: '🕐', desc: 'Kehadiran per jam pelajaran', roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK] },
];

const extractFilenameFromDisposition = (disposition, fallback) => {
  if (!disposition) return fallback;
  const match = disposition.match(/filename\*?=(?:UTF-8'')?\"?([^";]+)\"?/i);
  if (!match?.[1]) return fallback;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
};

const getRowLabel = (row, type) => {
  if (type === 'daily')          return row.student?.name || row.label || '-';
  if (type === 'teacher-subject') return row.label || `${row.teacher?.name || '-'} • ${row.subject?.name || '-'}`;
  if (type === 'students')       return row.student?.name || row.label || '-';
  if (type === 'rombels')        return row.rombel?.name || row.label || '-';
  if (type === 'slots') {
    if (row.timeSlot?.label) return row.timeSlot.label;
    if (row.timeSlot?.startTime && row.timeSlot?.endTime) return `${row.timeSlot.startTime}–${row.timeSlot.endTime}`;
  }
  return row.label || row.date || row.month || '-';
};

const getRowSubLabel = (row, type) => {
  if (type === 'daily')          return [row.date, row.rombel?.name, row.dayStatusLabel].filter(Boolean).join(' · ');
  if (type === 'students')       return row.student?.nis ? `NIS: ${row.student.nis}` : '';
  if (type === 'teacher-subject') return row.subject?.code ? `Kode: ${row.subject.code}` : '';
  if (type === 'slots')          return row.timeSlot?.dayOfWeek ? `Hari ke-${row.timeSlot.dayOfWeek}` : '';
  return '';
};

const AttendanceBar = ({ hadir = 0, total = 0 }) => {
  if (!total) return <span className="text-slate-300 text-xs">—</span>;
  const pct = Math.round((hadir / total) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
        {pct}%
      </span>
    </div>
  );
};

const StatCell = ({ value, color }) => (
  <td className="px-3 py-3 text-center tabular-nums">
    <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold ${value > 0 ? color : 'text-slate-300'}`}>
      {value || 0}
    </span>
  </td>
);

const Laporan = () => {
  const { roles } = useAuth();
  const [type,      setType]      = useState('daily');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [data,      setData]      = useState(null);
  const [rows,      setRows]      = useState([]);
  const [search,    setSearch]    = useState('');
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);

  const visibleReportTypes = useMemo(
    () => REPORT_TYPE_CONFIG.filter(item => item.roles.some(role => roles.includes(role))),
    [roles]
  );

  useEffect(() => {
    if (!visibleReportTypes.length) return;
    if (!visibleReportTypes.some(item => item.value === type)) setType(visibleReportTypes[0].value);
  }, [visibleReportTypes, type]);

  const currentType = useMemo(
    () => visibleReportTypes.find(item => item.value === type) || null,
    [visibleReportTypes, type]
  );

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(row => {
      const label = getRowLabel(row, type).toLowerCase();
      const sub   = getRowSubLabel(row, type).toLowerCase();
      return label.includes(q) || sub.includes(q);
    });
  }, [rows, search, type]);

  const summary = useMemo(() => {
    if (!filteredRows.length) return null;
    return filteredRows.reduce((acc, row) => ({
      hadir: acc.hadir + (row.hadir || 0),
      izin:  acc.izin  + (row.izin  || 0),
      sakit: acc.sakit + (row.sakit || 0),
      alpa:  acc.alpa  + (row.alpa  || 0),
      total: acc.total + (row.total || 0),
    }), { hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 });
  }, [filteredRows]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentType) return;
    setError(null);
    if (!dateFrom || !dateTo) { setError('Rentang tanggal wajib diisi'); return; }
    if (!isValidDateRange(dateFrom, dateTo)) { setError('Tanggal sampai harus setelah atau sama dengan tanggal dari'); return; }
    setLoading(true);
    try {
      const response = await api.get(currentType.endpoint, { params: { dateFrom, dateTo } });
      const payload = response.data;
      const normalizedRows = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
      setData(payload); setRows(normalizedRows); setSearch('');
    } catch (err) {
      setData(null); setRows([]);
      setError(err.response?.data?.message || 'Gagal memuat laporan');
    } finally { setLoading(false); }
  };

  const handleExport = async (format) => {
    if (!currentType) return;
    if (!dateFrom || !dateTo) { setError('Isi rentang tanggal terlebih dahulu sebelum export'); return; }
    if (!isValidDateRange(dateFrom, dateTo)) { setError('Tanggal sampai harus setelah atau sama dengan tanggal dari'); return; }
    setError(null); setExporting(true);
    try {
      const response = await api.get('/reports/export', {
        params: { type: currentType.value, dateFrom, dateTo, format },
        responseType: 'blob'
      });
      const filename = extractFilenameFromDisposition(
        response.headers['content-disposition'],
        `laporan-${currentType.value}.${format}`
      );
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setError(err.response?.data?.message || 'Gagal export laporan'); }
    finally { setExporting(false); }
  };

  const renderGlobal = () => {
    if (type !== 'global' || !data) return null;
    const s = data.summary || {};
    const total = s.total || 0;
    const cards = [
      { label: 'Hadir',  value: s.hadir || 0, bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-500' },
      { label: 'Izin',   value: s.izin  || 0, bg: 'bg-amber-50',   text: 'text-amber-600',   bar: 'bg-amber-400'  },
      { label: 'Sakit',  value: s.sakit || 0, bg: 'bg-sky-50',     text: 'text-sky-600',     bar: 'bg-sky-400'    },
      { label: 'Alpa',   value: s.alpa  || 0, bg: 'bg-rose-50',    text: 'text-rose-600',    bar: 'bg-rose-500'   },
      { label: 'Total',  value: total,         bg: 'bg-slate-50',   text: 'text-slate-700',   bar: 'bg-slate-300'  },
    ];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(({ label, value, bg, text, bar }) => {
          const pct = total ? Math.round((value / total) * 100) : 0;
          return (
            <Card key={label} className={`p-5 ${bg} border-0`}>
              <div className={`text-3xl font-bold tabular-nums ${text}`}>{value.toLocaleString('id-ID')}</div>
              <div className="text-sm font-medium text-slate-600 mt-1">{label}</div>
              {label !== 'Total' && (
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{pct}% dari total</div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  const hasRows = filteredRows.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laporan Absensi</h1>
          <p className="text-slate-500 text-sm mt-0.5">Analisis dan ekspor data kehadiran siswa dalam berbagai format</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleExport('xlsx')} disabled={exporting || !data}>
            {exporting ? '...' : '↓ XLSX'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('csv')} disabled={exporting || !data}>
            {exporting ? '...' : '↓ CSV'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleReportTypes.map(item => (
          <button
            key={item.value}
            onClick={() => { setType(item.value); setData(null); setRows([]); setSearch(''); }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold border transition-all ${
              item.value === type
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
            }`}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentType?.icon}</span>
            <div>
              <span className="font-bold text-slate-800">{currentType?.label}</span>
              <span className="text-slate-400 text-sm ml-2">— {currentType?.desc}</span>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dari Tanggal</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo || undefined} required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Sampai Tanggal</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom || undefined} required />
            </div>
            <div className="lg:col-span-2 flex gap-3">
              <Button type="submit" disabled={loading || !currentType} className="flex-1">
                {loading ? (
                  <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Memuat...</span>
                ) : 'Tampilkan Laporan'}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}

      {type === 'global' && data && renderGlobal()}

      {data && type !== 'global' && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Hasil Laporan</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                {filteredRows.length} baris
              </span>
            </div>
            <div className="w-full sm:w-56">
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari dalam hasil..." className="text-sm" />
            </div>
          </div>

          {summary && (
            <div className="flex flex-wrap gap-4 px-5 py-3 bg-slate-50/60 border-b border-slate-100 text-sm">
              {[
                { label: 'Hadir', value: summary.hadir, color: 'text-emerald-700 font-bold' },
                { label: 'Izin',  value: summary.izin,  color: 'text-amber-700 font-bold'   },
                { label: 'Sakit', value: summary.sakit, color: 'text-sky-700 font-bold'      },
                { label: 'Alpa',  value: summary.alpa,  color: 'text-rose-700 font-bold'     },
                { label: 'Total', value: summary.total, color: 'text-slate-700 font-bold'    },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-xs">{label}:</span>
                  <span className={`tabular-nums ${color}`}>{value.toLocaleString('id-ID')}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-xs">% Hadir:</span>
                <span className={`tabular-nums font-bold ${
                  summary.total ? (summary.hadir / summary.total >= 0.8 ? 'text-emerald-700' : summary.hadir / summary.total >= 0.6 ? 'text-amber-700' : 'text-rose-700') : 'text-slate-400'
                }`}>
                  {summary.total ? Math.round((summary.hadir / summary.total) * 100) : 0}%
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="min-w-[180px]">Nama / Keterangan</th>
                  {currentType?.value === 'daily' && <th>Status</th>}
                  <th>Hadir</th>
                  <th>Izin</th>
                  <th>Sakit</th>
                  <th>Alpa</th>
                  <th>Total</th>
                  <th className="min-w-[120px]">% Hadir</th>
                </tr>
              </thead>
              <tbody>
                {!hasRows && (
                  <tr>
                    <td colSpan={currentType?.value === 'daily' ? 8 : 7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <span className="text-4xl">📋</span>
                        <span className="text-sm">{search ? 'Tidak ada hasil yang cocok' : 'Tidak ada data untuk ditampilkan'}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredRows.map((row, idx) => {
                  const total = row.total || 0;
                  return (
                    <tr key={`${currentType?.value}-${idx}`}>
                      <td>
                        <div className="font-semibold text-slate-900">{getRowLabel(row, currentType?.value)}</div>
                        {getRowSubLabel(row, currentType?.value) && (
                          <div className="text-xs text-slate-400 mt-0.5">{getRowSubLabel(row, currentType?.value)}</div>
                        )}
                      </td>
                      {currentType?.value === 'daily' && (
                        <td className="text-center">
                          <Badge variant={row.dayStatusLabel === 'Efektif' ? 'success' : 'default'} size="xs">
                            {row.dayStatusLabel || '-'}
                          </Badge>
                        </td>
                      )}
                      <StatCell value={row.hadir || 0} color="text-emerald-700 bg-emerald-50" />
                      <StatCell value={row.izin  || 0} color="text-amber-700 bg-amber-50"   />
                      <StatCell value={row.sakit  || 0} color="text-sky-700 bg-sky-50"       />
                      <StatCell value={row.alpa   || 0} color="text-rose-700 bg-rose-50"     />
                      <td className="px-3 py-3 text-center font-bold tabular-nums text-slate-700">{total}</td>
                      <td className="px-3 py-3">
                        <AttendanceBar hadir={row.hadir || 0} total={total} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Laporan;
