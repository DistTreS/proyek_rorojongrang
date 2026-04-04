import { useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';

const reportTypes = [
  { value: 'global', label: 'Global' },
  { value: 'students', label: 'Per Siswa' },
  { value: 'rombels', label: 'Per Rombel' },
  { value: 'slots', label: 'Per Jam Pelajaran' },
  { value: 'daily', label: 'Harian' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'semester', label: 'Semester' }
];

const Laporan = () => {
  const [type, setType] = useState('global');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data } = await api.get(`/reports/${type}`, {
        params: { dateFrom, dateTo }
      });
      setData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat laporan');
    } finally {
      setLoading(false);
    }
  };

  const renderGlobal = () => {
    if (!data) return null;
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Ringkasan Laporan</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
    if (!Array.isArray(data)) return null;
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
              {data.map((row, index) => (
                <tr key={index} className="border-b hover:bg-neutral-50">
                  <td className="py-4 font-medium">{row.label || row.student?.name || row.rombel?.name || row.date || row.month}</td>
                  <td className="py-4 text-center">{row.hadir}</td>
                  <td className="py-4 text-center">{row.izin}</td>
                  <td className="py-4 text-center">{row.sakit}</td>
                  <td className="py-4 text-center">{row.alpa}</td>
                  <td className="py-4 text-center font-semibold">{row.total}</td>
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
        <p className="text-slate-600 mt-1">Global, per siswa, per rombel, harian, bulanan, dan semester</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Jenis Laporan</label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {reportTypes.map(item => (
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

          <div className="md:col-span-3">
            <Button type="submit" size="lg" disabled={loading} className="w-full md:w-auto">
              {loading ? 'Memuat Laporan...' : 'Tampilkan Laporan'}
            </Button>
          </div>
        </form>
      </Card>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      {/* Hasil Laporan */}
      {data && (
        <>
          {type === 'global' ? renderGlobal() : renderTable()}
        </>
      )}
    </div>
  );
};

export default Laporan;