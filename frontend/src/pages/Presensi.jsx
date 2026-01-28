import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const statusOptions = [
  { value: 'hadir', label: 'Hadir' },
  { value: 'izin', label: 'Izin' },
  { value: 'sakit', label: 'Sakit' },
  { value: 'alpa', label: 'Alpa' }
];

const emptyForm = {
  date: '',
  rombelId: '',
  timeSlotId: '',
  studentId: '',
  status: 'hadir',
  note: ''
};

const Presensi = () => {
  const [attendances, setAttendances] = useState([]);
  const [students, setStudents] = useState([]);
  const [rombels, setRombels] = useState([]);
  const [slots, setSlots] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [attendanceRes, studentRes, rombelRes, slotRes, periodRes] = await Promise.all([
        api.get('/attendance'),
        api.get('/siswa'),
        api.get('/rombel'),
        api.get('/jam'),
        api.get('/period')
      ]);
      setAttendances(attendanceRes.data);
      setStudents(studentRes.data || []);
      setRombels(rombelRes.data || []);
      setSlots(slotRes.data || []);
      setPeriods(periodRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat presensi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const payload = {
      date: form.date,
      rombelId: form.rombelId ? Number(form.rombelId) : null,
      timeSlotId: form.timeSlotId ? Number(form.timeSlotId) : null,
      studentId: form.studentId ? Number(form.studentId) : null,
      status: form.status,
      note: form.note.trim() || null
    };

    try {
      if (editingId) {
        await api.put(`/attendance/${editingId}`, payload);
      } else {
        await api.post('/attendance', payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan presensi');
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      date: item.date,
      rombelId: item.rombel?.id || '',
      timeSlotId: item.timeSlot?.id || '',
      studentId: item.student?.id || '',
      status: item.status,
      note: item.note || ''
    });
  };

  const handleDelete = async (item) => {
    if (!confirm('Hapus presensi ini?')) return;
    try {
      await api.delete(`/attendance/${item.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus presensi');
    }
  };

  const periodMap = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);
  const rombelMap = useMemo(() => new Map(rombels.map((r) => [r.id, r])), [rombels]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Presensi</h1>
          <p className="text-sm text-slate-600">Input dan pantau kehadiran siswa.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700"
          type="button"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Memuat...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Presensi' : 'Tambah Presensi'}</h2>
            {editingId && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Mode Edit
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Tanggal
              <input
                type="date"
                value={form.date}
                onChange={(e) => updateForm('date', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Rombel
              <select
                value={form.rombelId}
                onChange={(e) => updateForm('rombelId', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">Pilih rombel</option>
                {rombels.map((rombel) => (
                  <option key={rombel.id} value={rombel.id}>{rombel.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Jam
              <select
                value={form.timeSlotId}
                onChange={(e) => updateForm('timeSlotId', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">Pilih jam</option>
                {slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.dayOfWeek} - {slot.startTime} / {slot.endTime}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Siswa
              <select
                value={form.studentId}
                onChange={(e) => updateForm('studentId', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">Pilih siswa</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                value={form.status}
                onChange={(e) => updateForm('status', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Catatan
              <input
                value={form.note}
                onChange={(e) => updateForm('note', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
              type="submit"
            >
              {editingId ? 'Simpan Perubahan' : 'Tambah'}
            </button>
            {editingId && (
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                type="button"
                onClick={resetForm}
              >
                Batal
              </button>
            )}
          </div>
        </form>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Presensi</h2>
            <span className="text-xs text-slate-500">{attendances.length} data</span>
          </div>
          <div className="mt-5 hidden grid-cols-[1fr_1.4fr_1.1fr_0.8fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Tanggal</div>
            <div>Siswa</div>
            <div>Rombel</div>
            <div>Status</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {attendances.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1.4fr_1.1fr_0.8fr_0.8fr] md:items-center"
              >
                <div className="text-sm text-slate-700">{item.date}</div>
                <div className="text-sm font-semibold text-slate-900">{studentMap.get(item.student?.id)?.name || item.student?.name}</div>
                <div className="text-sm text-slate-700">{rombelMap.get(item.rombel?.id)?.name || item.rombel?.name}</div>
                <div className="text-sm text-slate-700">{item.status}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => handleEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => handleDelete(item)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
            {!attendances.length && !loading && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                Belum ada data.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Presensi;
