import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  teacherId: '',
  subjectId: '',
  rombelId: '',
  periodId: '',
  weeklyHours: 0
};

const Pengampu = () => {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [rombels, setRombels] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignmentRes, tendikRes, subjectRes, rombelRes, periodRes] = await Promise.all([
        api.get('/pengampu'),
        api.get('/tendik'),
        api.get('/mapel'),
        api.get('/rombel'),
        api.get('/period')
      ]);

      setAssignments(assignmentRes.data);
      setTeachers((tendikRes.data || []).filter((item) => item.type === 'guru'));
      setSubjects(subjectRes.data || []);
      setRombels(rombelRes.data || []);
      setPeriods(periodRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat pengampu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const periodMap = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);
  const rombelMap = useMemo(() => new Map(rombels.map((r) => [r.id, r])), [rombels]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

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
      teacherId: form.teacherId ? Number(form.teacherId) : null,
      subjectId: form.subjectId ? Number(form.subjectId) : null,
      rombelId: form.rombelId ? Number(form.rombelId) : null,
      periodId: form.periodId ? Number(form.periodId) : null,
      weeklyHours: Number(form.weeklyHours) || 0
    };

    try {
      if (editingId) {
        await api.put(`/pengampu/${editingId}`, payload);
      } else {
        await api.post('/pengampu', payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan pengampu');
    }
  };

  const handleEdit = (assignment) => {
    setEditingId(assignment.id);
    setForm({
      teacherId: assignment.teacher?.id || '',
      subjectId: assignment.subject?.id || '',
      rombelId: assignment.rombel?.id || '',
      periodId: assignment.period?.id || '',
      weeklyHours: assignment.weeklyHours || 0
    });
  };

  const handleDelete = async (assignment) => {
    if (!confirm('Hapus pengampu ini?')) return;
    try {
      await api.delete(`/pengampu/${assignment.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus pengampu');
    }
  };

  const currentRombels = form.periodId
    ? rombels.filter((rombel) => rombel.periodId === Number(form.periodId))
    : rombels;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Pengampu Mata Pelajaran</h1>
          <p className="text-sm text-slate-600">Atur guru, rombel, mapel, dan jam pelajaran mingguan.</p>
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
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Pengampu' : 'Tambah Pengampu'}</h2>
            {editingId && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Mode Edit
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Periode
              <select
                value={form.periodId}
                onChange={(e) => updateForm('periodId', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">Pilih periode</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>{period.name}</option>
                ))}
              </select>
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
                {currentRombels.map((rombel) => (
                  <option key={rombel.id} value={rombel.id}>{rombel.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Mapel
              <select
                value={form.subjectId}
                onChange={(e) => updateForm('subjectId', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">Pilih mapel</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Guru
              <select
                value={form.teacherId}
                onChange={(e) => updateForm('teacherId', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">Pilih guru</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Jam per Minggu
              <input
                type="number"
                min="0"
                value={form.weeklyHours}
                onChange={(e) => updateForm('weeklyHours', e.target.value)}
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
            <h2 className="text-lg font-semibold text-slate-900">Daftar Pengampu</h2>
            <span className="text-xs text-slate-500">{assignments.length} data</span>
          </div>
          <div className="mt-5 hidden grid-cols-[1.3fr_1.2fr_1.2fr_1.2fr_0.7fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Guru</div>
            <div>Mapel</div>
            <div>Rombel</div>
            <div>Periode</div>
            <div>Jam</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.3fr_1.2fr_1.2fr_1.2fr_0.7fr_0.8fr] md:items-center"
              >
                <div className="text-sm text-slate-700">
                  {teacherMap.get(assignment.teacher?.id)?.name || assignment.teacher?.name}
                </div>
                <div className="text-sm text-slate-700">
                  {subjectMap.get(assignment.subject?.id)?.name || assignment.subject?.name}
                </div>
                <div className="text-sm text-slate-700">
                  {rombelMap.get(assignment.rombel?.id)?.name || assignment.rombel?.name}
                </div>
                <div className="text-sm text-slate-700">
                  {periodMap.get(assignment.period?.id)?.name || assignment.period?.name}
                </div>
                <div className="text-sm font-semibold text-slate-900">{assignment.weeklyHours}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => handleEdit(assignment)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => handleDelete(assignment)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
            {!assignments.length && !loading && (
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

export default Pengampu;
