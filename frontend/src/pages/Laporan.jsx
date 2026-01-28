import { useState } from 'react';
import api from '../services/api';

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

  const handleSubmit = async (event) => {
    event.preventDefault();
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
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Ringkasan</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-2xl font-semibold text-slate-900">{data.summary?.hadir || 0}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Hadir</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-2xl font-semibold text-slate-900">{data.summary?.izin || 0}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Izin</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-2xl font-semibold text-slate-900">{data.summary?.sakit || 0}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Sakit</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-2xl font-semibold text-slate-900">{data.summary?.alpa || 0}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Alpa</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="text-2xl font-semibold text-emerald-700">{data.summary?.total || 0}</div>
            <div className="text-xs uppercase tracking-wide text-emerald-700">Total</div>
          </div>
        </div>
      </div>
    );
  };

  const renderTable = () => {
    if (!Array.isArray(data)) return null;
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mt-1 hidden grid-cols-[1.6fr_repeat(5,0.6fr)] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Nama</div>
          <div>Hadir</div>
          <div>Izin</div>
          <div>Sakit</div>
          <div>Alpa</div>
          <div>Total</div>
        </div>
        <div className="mt-4 grid gap-4">
          {data.map((row, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.6fr_repeat(5,0.6fr)] md:items-center"
            >
              <div className="text-sm font-semibold text-slate-900">
                {row.label || row.student?.name || row.rombel?.name || row.timeSlot?.label || row.date || row.month}
              </div>
              <div className="text-sm text-slate-700">{row.hadir}</div>
              <div className="text-sm text-slate-700">{row.izin}</div>
              <div className="text-sm text-slate-700">{row.sakit}</div>
              <div className="text-sm text-slate-700">{row.alpa}</div>
              <div className="text-sm font-semibold text-slate-900">{row.total}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Laporan Absensi</h1>
        <p className="text-sm text-slate-600">Global, per siswa, per rombel, per jam pelajaran, harian, bulanan, semester.</p>
      </div>

      <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Jenis Laporan
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            >
              {reportTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Dari
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sampai
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {type === 'global' ? renderGlobal() : renderTable()}
    </section>
  );
};

export default Laporan;
