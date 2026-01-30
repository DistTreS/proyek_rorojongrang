import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  teacherId: '',
  subjectId: '',
  rombelId: '',
  periodId: '',
  weeklyHours: 0,
  gradeLevel: ''
};

const gradeOptions = [
  { value: '10', label: 'Tingkat 10 (X)' },
  { value: '11', label: 'Tingkat 11 (XI)' },
  { value: '12', label: 'Tingkat 12 (XII)' }
];

const subjectTypeLabel = (value) => (value === 'peminatan' ? 'Peminatan' : 'Wajib');

const formatRombelLabel = (rombel) => {
  if (!rombel) return '-';
  const typeLabel = rombel.type === 'peminatan' ? 'Peminatan' : 'Utama';
  return `${rombel.name} • ${typeLabel}`;
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
  const [modal, setModal] = useState({ type: null, item: null });

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
      setTeachers((tendikRes.data || []).filter((item) => item.user?.roles?.includes('guru')));
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
  const selectedSubject = useMemo(() => subjectMap.get(Number(form.subjectId)), [form.subjectId, subjectMap]);

  useEffect(() => {
    if (!selectedSubject) return;
    if (selectedSubject.type === 'wajib') {
      setForm((prev) => ({ ...prev, rombelId: '' }));
    } else {
      setForm((prev) => ({ ...prev, gradeLevel: '' }));
    }
  }, [selectedSubject]);

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
      rombelId: selectedSubject?.type === 'peminatan' && form.rombelId ? Number(form.rombelId) : null,
      periodId: form.periodId ? Number(form.periodId) : null,
      weeklyHours: Number(form.weeklyHours) || 0,
      gradeLevel: selectedSubject?.type === 'wajib' ? form.gradeLevel || null : null
    };

    try {
      if (editingId) {
        await api.put(`/pengampu/${editingId}`, payload);
      } else {
        await api.post('/pengampu', payload);
      }
      resetForm();
      setModal({ type: null, item: null });
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
      weeklyHours: assignment.weeklyHours || 0,
      gradeLevel: assignment.rombel?.gradeLevel || ''
    });
    setModal({ type: 'edit', item: assignment });
  };

  const handleDelete = (assignment) => {
    setModal({ type: 'delete', item: assignment });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/pengampu/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus pengampu');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (assignment) => {
    setModal({ type: 'detail', item: assignment });
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    resetForm();
  };

  const currentRombels = form.periodId
    ? rombels.filter((rombel) => rombel.periodId === Number(form.periodId) && rombel.type === 'peminatan')
    : rombels.filter((rombel) => rombel.type === 'peminatan');

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Pengampu Mata Pelajaran</h1>
          <p className="text-sm text-slate-600">Atur guru, rombel, mapel, dan jam pelajaran mingguan.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          type="button"
          onClick={openCreate}
        >
          + Tambah Pengampu
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Pengampu</h2>
            <span className="text-xs text-slate-500">{assignments.length} data</span>
          </div>
          <div className="mt-5 hidden grid-cols-[1.3fr_1.5fr_1.2fr_1.2fr_0.7fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
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
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.3fr_1.5fr_1.2fr_1.2fr_0.7fr_0.8fr] md:items-center"
              >
                <div className="text-sm text-slate-700">
                  {teacherMap.get(assignment.teacher?.id)?.name || assignment.teacher?.name}
                </div>
                <div className="text-sm text-slate-700">
                  {subjectMap.get(assignment.subject?.id)?.name || assignment.subject?.name}{' '}
                  <span className="text-xs text-slate-500">
                    • {subjectTypeLabel(subjectMap.get(assignment.subject?.id)?.type || assignment.subject?.type)}
                  </span>
                </div>
                <div className="text-sm text-slate-700">
                  {formatRombelLabel(rombelMap.get(assignment.rombel?.id) || assignment.rombel)}
                </div>
                <div className="text-sm text-slate-700">
                  {periodMap.get(assignment.period?.id)?.name || assignment.period?.name}
                </div>
                <div className="text-sm font-semibold text-slate-900">{assignment.weeklyHours}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => openDetail(assignment)}
                  >
                    Detail
                  </button>
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

      {modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            {modal.type === 'detail' && modal.item && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Detail Pengampu</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="text-xs uppercase text-slate-500">Guru</span><div className="font-semibold">{teacherMap.get(modal.item.teacher?.id)?.name || modal.item.teacher?.name || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Mapel</span><div className="font-semibold">{subjectMap.get(modal.item.subject?.id)?.name || modal.item.subject?.name || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Jenis</span><div className="font-semibold">{subjectTypeLabel(subjectMap.get(modal.item.subject?.id)?.type || modal.item.subject?.type)}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Rombel</span><div className="font-semibold">{formatRombelLabel(rombelMap.get(modal.item.rombel?.id) || modal.item.rombel)}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Periode</span><div className="font-semibold">{periodMap.get(modal.item.period?.id)?.name || modal.item.period?.name || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Jam/Minggu</span><div className="font-semibold">{modal.item.weeklyHours}</div></div>
                </div>
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit Pengampu' : 'Tambah Pengampu'}
                  </h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
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
                    Mapel
                    <select
                      value={form.subjectId}
                      onChange={(e) => updateForm('subjectId', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Pilih mapel</option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>{subject.name} • {subjectTypeLabel(subject.type)}</option>
                      ))}
                    </select>
                  </label>
                  {selectedSubject?.type === 'wajib' ? (
                    <label className="text-sm font-medium text-slate-700">
                      Tingkat
                      <select
                        value={form.gradeLevel}
                        onChange={(e) => updateForm('gradeLevel', e.target.value)}
                        required
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                      >
                        <option value="">Pilih tingkat</option>
                        {gradeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="text-sm font-medium text-slate-700">
                      Rombel Peminatan
                      <select
                        value={form.rombelId}
                        onChange={(e) => updateForm('rombelId', e.target.value)}
                        required
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                      >
                        <option value="">Pilih rombel peminatan</option>
                        {currentRombels.map((rombel) => (
                          <option key={rombel.id} value={rombel.id}>{formatRombelLabel(rombel)}</option>
                        ))}
                      </select>
                    </label>
                  )}
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
                {selectedSubject?.type === 'wajib' && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                    Pengampu mapel wajib akan dibuat untuk semua rombel utama di tingkat yang dipilih.
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
                    type="submit"
                  >
                    {editingId ? 'Simpan Perubahan' : 'Tambah'}
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={closeModal}
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {modal.type === 'delete' && modal.item && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Hapus Pengampu</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  Yakin ingin menghapus pengampu mapel <span className="font-semibold">{modal.item.subject?.name}</span>?
                </p>
                <div className="flex gap-3">
                  <button
                    className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700"
                    type="button"
                    onClick={handleConfirmDelete}
                  >
                    Hapus
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={closeModal}
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default Pengampu;
