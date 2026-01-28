import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const dayLabels = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu'
};

const Jadwal = () => {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const loadPeriods = async () => {
    try {
      const { data } = await api.get('/period');
      setPeriods(data);
      const active = data.find((p) => p.isActive);
      if (active && !selectedPeriod) {
        setSelectedPeriod(String(active.id));
      }
    } catch (err) {
      setError('Gagal memuat periode');
    }
  };

  const loadSchedule = async (periodId) => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/schedule', { params: { periodId } });
      setSchedule(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      loadSchedule(selectedPeriod);
    }
  }, [selectedPeriod]);

  const handleGenerate = async () => {
    if (!selectedPeriod) {
      setError('Pilih periode terlebih dahulu');
      return;
    }
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await api.post('/schedule/generate', { periodId: Number(selectedPeriod) });
      setMessage(data.message || 'Jadwal digenerate');
      loadSchedule(selectedPeriod);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal generate jadwal');
    } finally {
      setGenerating(false);
    }
  };

  const rows = useMemo(() => {
    return schedule.map((item) => ({
      id: item.id,
      rombel: item.teachingAssignment?.rombel?.name || '- ',
      day: dayLabels[item.timeSlot?.dayOfWeek] || '-',
      time: item.timeSlot ? `${item.timeSlot.startTime} - ${item.timeSlot.endTime}` : '-',
      subject: item.teachingAssignment?.subject?.name || '-',
      teacher: item.teachingAssignment?.teacher?.name || '-',
      label: item.timeSlot?.label || '-'
    }));
  }, [schedule]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Jadwal Pelajaran</h1>
          <p className="text-sm text-slate-600">Generate otomatis dengan CP-SAT + GA dan lihat jadwal mingguan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">Pilih periode</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name}</option>
            ))}
          </select>
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
            type="button"
            onClick={handleGenerate}
            disabled={generating || !selectedPeriod}
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Jadwal Mingguan</h2>
          <span className="text-xs text-slate-500">{rows.length} sesi</span>
        </div>
        <div className="mt-5 hidden grid-cols-[1.2fr_0.8fr_1.2fr_1.2fr_1.1fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Rombel</div>
          <div>Hari</div>
          <div>Jam</div>
          <div>Mapel</div>
          <div>Guru</div>
          <div>Label</div>
        </div>
        <div className="mt-4 grid gap-4">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_0.8fr_1.2fr_1.2fr_1.1fr_0.8fr] md:items-center"
            >
              <div className="text-sm font-semibold text-slate-900">{row.rombel}</div>
              <div className="text-sm text-slate-700">{row.day}</div>
              <div className="text-sm text-slate-700">{row.time}</div>
              <div className="text-sm text-slate-700">{row.subject}</div>
              <div className="text-sm text-slate-700">{row.teacher}</div>
              <div className="text-sm text-slate-700">{row.label}</div>
            </div>
          ))}
          {!rows.length && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada jadwal untuk periode ini.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Jadwal;
