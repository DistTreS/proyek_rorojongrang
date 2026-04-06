import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { ROLES } from '../constants/rbac';
import { useAuth } from '../context/useAuth';

const REPORT_TYPE_CONFIG = [
  {
    value: 'daily',
    label: 'Harian',
    endpoint: '/reports/daily',
    roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  },
  {
    value: 'monthly',
    label: 'Bulanan',
    endpoint: '/reports/monthly',
    roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  },
  {
    value: 'semester',
    label: 'Semester',
    endpoint: '/reports/semester',
    roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  },
  {
    value: 'rombels',
    label: 'Per Rombel',
    endpoint: '/reports/rombels',
    roles: [ROLES.GURU, ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  },
  {
    value: 'teacher-subject',
    label: 'Per Guru & Mapel',
    endpoint: '/reports/teacher-subject',
    roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  },
  {
    value: 'global',
    label: 'Global',
    endpoint: '/reports/global',
    roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  },
  {
    value: 'students',
    label: 'Per Siswa',
    endpoint: '/reports/students',
    roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  },
  {
    value: 'slots',
    label: 'Per Jam Pelajaran',
    endpoint: '/reports/slots',
    roles: [ROLES.KEPALA_SEKOLAH, ROLES.STAFF_TU, ROLES.WAKASEK]
  }
];

const extractFilenameFromDisposition = (disposition, fallback) => {
  if (!disposition) return fallback;
  const match = disposition.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const getRowLabel = (row, type) => {
  if (type === 'teacher-subject') {
    return row.label || `${row.teacher?.name || '-'} • ${row.subject?.name || '-'}`;
  }
  if (type === 'students') {
    return row.student?.name || row.label || '-';
  }
  if (type === 'rombels') {
    return row.rombel?.name || row.label || '-';
  }
  if (type === 'slots') {
    if (row.timeSlot?.label) return row.timeSlot.label;
    if (row.timeSlot?.startTime && row.timeSlot?.endTime) return `${row.timeSlot.startTime}-${row.timeSlot.endTime}`;
  }
  return row.label || row.date || row.month || '-';
};

const getRowSubLabel = (row, type) => {
  if (type === 'students') return row.student?.nis ? `NIS: ${row.student.nis}` : '';
  if (type === 'teacher-subject') return row.subject?.code ? `Kode: ${row.subject.code}` : '';
  if (type === 'slots') return row.timeSlot?.dayOfWeek ? `Hari ke-${row.timeSlot.dayOfWeek}` : '';
  return '';
};

const Laporan = () => {
  const { roles } = useAuth();
  const [type, setType] = useState('daily');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const visibleReportTypes = useMemo(() => {
    return REPORT_TYPE_CONFIG.filter((item) => item.roles.some((role) => roles.includes(role)));
  }, [roles]);

  useEffect(() => {
    if (!visibleReportTypes.length) return;
    const hasCurrent = visibleReportTypes.some((item) => item.value === type);
    if (!hasCurrent) {
      setType(visibleReportTypes[0].value);
    }
  }, [visibleReportTypes, type]);

  const currentType = useMemo(
    () => visibleReportTypes.find((item) => item.value === type) || null,
    [visibleReportTypes, type]
  );

  const roleReportScope = useMemo(() => {
    if (roles.includes(ROLES.KEPALA_SEKOLAH)) {
      return 'Kepala sekolah: akses laporan monitoring lengkap + export (harian, bulanan, semester, rombel, guru/mapel, global).';
    }
    if (roles.includes(ROLES.GURU)) {
      return 'Guru: akses laporan operasional pembelajaran + export (harian, bulanan, semester, rombel).';
    }
    return 'Akses laporan mengikuti role akun Anda.';
  }, [roles]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentType) return;

    setError(null);
    setLoading(true);
    try {
      const response = await api.get(currentType.endpoint, {
        params: { dateFrom, dateTo }
      });
      const payload = response.data;
      const normalizedRows = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
      setData(payload);
      setRows(normalizedRows);
    } catch (err) {
      setData(null);
      setRows([]);
      setError(err.response?.data?.message || 'Gagal memuat laporan');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    if (!currentType) return;
    if (!dateFrom || !dateTo) {
      setError('Isi rentang tanggal terlebih dahulu sebelum export');
      return;
    }

    setError(null);
    setExporting(true);
    try {
      const response = await api.get('/reports/export', {
        params: {
          type: currentType.value,
          dateFrom,
          dateTo,
          format
        },
        responseType: 'blob'
      });

      const contentDisposition = response.headers['content-disposition'];
      const fallbackName = `laporan-${currentType.value}.${format}`;
      const filename = extractFilenameFromDisposition(contentDisposition, fallbackName);

      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal export laporan');
    } finally {
      setExporting(false);
    }
  };

  const renderGlobal = () => {
    if (!data) return null;
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Ringkasan Laporan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-emerald-50 rounded-3xl p-5 text-center">
            <div className="text-4xl font-semibold text-emerald-600">{data.summary?.hadir || 0}</div>
            <div className="text-sm text-emerald-700 mt-1">Hadir</div>
          </div>
          <div className="bg-amber-50 rounded-3xl p-5 text-center">
            <div className="text-4xl font-semibold text-amber-600">{data.summary?.izin || 0}</div>
            <div className="text-sm text-amber-700 mt-1">Izin</div>
          </div>
          <div className="bg-blue-50 rounded-3xl p-5 text-center">
            <div className="text-4xl font-semibold text-blue-600">{data.summary?.sakit || 0}</div>
            <div className="text-sm text-blue-700 mt-1">Sakit</div>
          </div>
          <div className="bg-rose-50 rounded-3xl p-5 text-center">
            <div className="text-4xl font-semibold text-rose-600">{data.summary?.alpa || 0}</div>
            <div className="text-sm text-rose-700 mt-1">Alpa</div>
          </div>
          <div className="bg-neutral-50 rounded-3xl p-5 text-center">
            <div className="text-4xl font-semibold">{data.summary?.total || 0}</div>
            <div className="text-sm text-neutral-600 mt-1">Total</div>
          </div>
        </div>
      </Card>
    );
  };

  const renderTable = () => {
    if (!rows.length) return null;
    return (
      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-xs font-semibold text-slate-500">
                <th className="py-4 text-left">Nama / Keterangan</th>
                <th className="py-4 text-center">Hadir</th>
                <th className="py-4 text-center">Izin</th>
                <th className="py-4 text-center">Sakit</th>
                <th className="py-4 text-center">Alpa</th>
                <th className="py-4 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${currentType?.value || 'type'}-${index}`} className="border-b hover:bg-neutral-50">
                  <td className="py-4">
                    <div className="font-medium">{getRowLabel(row, currentType?.value)}</div>
                    {getRowSubLabel(row, currentType?.value) && (
                      <div className="text-xs text-slate-500">{getRowSubLabel(row, currentType?.value)}</div>
                    )}
                  </td>
                  <td className="py-4 text-center">{row.hadir || 0}</td>
                  <td className="py-4 text-center">{row.izin || 0}</td>
                  <td className="py-4 text-center">{row.sakit || 0}</td>
                  <td className="py-4 text-center">{row.alpa || 0}</td>
                  <td className="py-4 text-center font-semibold">{row.total || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold text-slate-900">Laporan Absensi</h1>
        <p className="text-slate-600 mt-1">{roleReportScope}</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Jenis Laporan</label>
            <Select value={type} onChange={(e) => setType(e.target.value)} disabled={!visibleReportTypes.length}>
              {visibleReportTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Dari Tanggal</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Sampai Tanggal</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required />
          </div>

          <div className="md:col-span-3 flex flex-col sm:flex-row gap-3">
            <Button type="submit" size="lg" disabled={loading || !currentType}>
              {loading ? 'Memuat Laporan...' : 'Tampilkan Laporan'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => handleExport('xlsx')}
              disabled={exporting || !currentType}
            >
              {exporting ? 'Export...' : 'Export XLSX'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => handleExport('csv')}
              disabled={exporting || !currentType}
            >
              {exporting ? 'Export...' : 'Export CSV'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-4 bg-slate-50 border-slate-200">
        <div className="flex flex-wrap gap-2">
          {visibleReportTypes.map((item) => (
            <Badge key={item.value} variant={item.value === type ? 'success' : 'default'}>
              {item.label}
            </Badge>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      {data && (
        <>
          {type === 'global' ? renderGlobal() : renderTable()}
        </>
      )}
    </div>
  );
};

export default Laporan;
