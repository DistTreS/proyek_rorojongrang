import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  teacherId: '',
  subjectId: '',
  rombelId: '',
  periodId: '',
  weeklyHours: 1
};

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
  const [filterPeriodId, setFilterPeriodId] = useState('');

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

      setAssignments(assignmentRes.data || []);
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

  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);
  const teacherMap = useMemo(() => new Map(teachers.map((item) => [item.id, item])), [teachers]);
  const subjectMap = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const rombelMap = useMemo(() => new Map(rombels.map((item) => [item.id, item])), [rombels]);
  const selectedSubject = useMemo(() => subjectMap.get(Number(form.subjectId)), [form.subjectId, subjectMap]);

  useEffect(() => {
    setForm((prev) => {
      if (!prev.subjectId) return prev;
      const currentSubject = subjectMap.get(Number(prev.subjectId));
      if (!currentSubject || (prev.periodId && currentSubject.periodId !== Number(prev.periodId))) {
        return { ...prev, subjectId: '', rombelId: '' };
      }
      return prev;
    });
  }, [form.periodId, subjectMap]);

  const filteredAssignments = useMemo(() => {
    if (!filterPeriodId) return assignments;
    return assignments.filter((item) => item.periodId === Number(filterPeriodId));
  }, [assignments, filterPeriodId]);

  const currentSubjects = useMemo(() => {
    if (!form.periodId) return [];
    return subjects.filter((subject) => subject.periodId === Number(form.periodId));
  }, [form.periodId, subjects]);

  const currentRombels = useMemo(() => {
    if (!form.periodId) return [];

    return rombels.filter((rombel) => {
      if (rombel.periodId !== Number(form.periodId)) return false;
      if (!selectedSubject) return true;
      return selectedSubject.type === 'peminatan' ? rombel.type === 'peminatan' : rombel.type === 'utama';
    });
  }, [form.periodId, rombels, selectedSubject]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (assignment) => {
    setModal({ type: 'detail', item: assignment });
  };

  const handleEdit = (assignment) => {
    setEditingId(assignment.id);
    setForm({
      teacherId: assignment.teacherId || assignment.teacher?.id || '',
      subjectId: assignment.subjectId || assignment.subject?.id || '',
      rombelId: assignment.rombelId || assignment.rombel?.id || '',
      periodId: assignment.periodId || assignment.period?.id || '',
      weeklyHours: assignment.weeklyHours || 1
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const weeklyHours = Number(form.weeklyHours);
    if (!form.periodId || !form.teacherId || !form.subjectId || !form.rombelId) {
      setError('Periode, guru, mapel, dan rombel wajib diisi');
      return;
    }
    if (!Number.isInteger(weeklyHours) || weeklyHours <= 0) {
      setError('Jam mingguan harus berupa angka bulat lebih dari 0');
      return;
    }

    const payload = {
      teacherId: Number(form.teacherId),
      subjectId: Number(form.subjectId),
      rombelId: Number(form.rombelId),
      periodId: Number(form.periodId),
      weeklyHours
    };

    try {
      if (editingId) {
        await api.put(`/pengampu/${editingId}`, payload);
      } else {
        await api.post('/pengampu', payload);
      }
      closeModal();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan pengampu');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Pengampu Mata Pelajaran</h1>
          <p className="text-sm text-slate-600">Atur guru, mapel, rombel, periode, dan jam mingguan.</p>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Daftar Pengampu</h2>
            <p className="text-xs text-slate-500">{filteredAssignments.length} data</p>
          </div>
          <div className="w-full sm:w-72">
            <select
              value={filterPeriodId}
              onChange={(e) => setFilterPeriodId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">Semua periode</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>{period.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 hidden grid-cols-[1.1fr_1.3fr_1.1fr_1.1fr_0.7fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Guru</div>
          <div>Mapel</div>
          <div>Rombel</div>
          <div>Periode</div>
          <div>Jam</div>
          <div>Aksi</div>
        </div>
        <div className="mt-4 grid gap-4">
          {filteredAssignments.map((assignment) => (
            <div
              key={assignment.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.1fr_1.3fr_1.1fr_1.1fr_0.7fr_0.8fr] md:items-center"
            >
              <div className="text-sm text-slate-700">{teacherMap.get(assignment.teacherId)?.name || assignment.teacher?.name || '-'}</div>
              <div className="text-sm text-slate-700">
                {(subjectMap.get(assignment.subjectId)?.name || assignment.subject?.name || '-')}{' '}
                <span className="text-xs text-slate-500">
                  • {subjectTypeLabel(subjectMap.get(assignment.subjectId)?.type || assignment.subject?.type)}
                </span>
              </div>
              <div className="text-sm text-slate-700">{formatRombelLabel(rombelMap.get(assignment.rombelId) || assignment.rombel)}</div>
              <div className="text-sm text-slate-700">{periodMap.get(assignment.periodId)?.name || assignment.period?.name || '-'}</div>
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
          {!filteredAssignments.length && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada data pengampu.
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
                  <div><span className="text-xs uppercase text-slate-500">Guru</span><div className="font-semibold">{teacherMap.get(modal.item.teacherId)?.name || modal.item.teacher?.name || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Mapel</span><div className="font-semibold">{subjectMap.get(modal.item.subjectId)?.name || modal.item.subject?.name || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Jenis</span><div className="font-semibold">{subjectTypeLabel(subjectMap.get(modal.item.subjectId)?.type || modal.item.subject?.type)}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Rombel</span><div className="font-semibold">{formatRombelLabel(rombelMap.get(modal.item.rombelId) || modal.item.rombel)}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Periode</span><div className="font-semibold">{periodMap.get(modal.item.periodId)?.name || modal.item.period?.name || '-'}</div></div>
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
                      disabled={!form.periodId}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100"
                    >
                      <option value="">Pilih mapel</option>
                      {currentSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>{subject.name} • {subjectTypeLabel(subject.type)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Rombel
                    <select
                      value={form.rombelId}
                      onChange={(e) => updateForm('rombelId', e.target.value)}
                      required
                      disabled={!form.periodId || !form.subjectId}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100"
                    >
                      <option value="">Pilih rombel</option>
                      {currentRombels.map((rombel) => (
                        <option key={rombel.id} value={rombel.id}>{formatRombelLabel(rombel)}</option>
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
                    Jam Mingguan
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.weeklyHours}
                      onChange={(e) => updateForm('weeklyHours', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                </div>
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
                  Yakin ingin menghapus data pengampu ini?
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
