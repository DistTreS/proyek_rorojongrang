import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { canAccess, SCHEDULING_MANAGER_ROLES } from '../constants/rbac';
import { useAuth } from '../context/useAuth';

const emptyForm = {
  name: '',
  gradeLevel: '',
  type: 'utama',
  periodId: ''
};

const typeOptions = [
  { value: 'utama', label: 'Rombel Utama' },
  { value: 'peminatan', label: 'Rombel Peminatan' }
];

const typeLabel = (value) => typeOptions.find((option) => option.value === value)?.label || 'Rombel Utama';

const Rombel = () => {
  const { roles } = useAuth();
  const canManage = canAccess(roles, SCHEDULING_MANAGER_ROLES);

  const [rombels, setRombels] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [removeLoadingId, setRemoveLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [assignIds, setAssignIds] = useState([]);
  const [initialAssignIds, setInitialAssignIds] = useState([]);
  const [assignQuery, setAssignQuery] = useState('');
  const [detailQuery, setDetailQuery] = useState('');
  const [filterPeriodId, setFilterPeriodId] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const requests = [api.get('/rombel')];
      if (canManage) {
        requests.push(api.get('/period'));
      }
      const [rombelRes, periodRes] = await Promise.all(requests);
      setRombels(rombelRes.data || []);
      if (canManage) {
        setPeriods(periodRes?.data || []);
      } else {
        const derivedPeriods = [...new Map(
          (rombelRes.data || [])
            .filter((item) => item.periodId)
            .map((item) => [item.periodId, { id: item.periodId, name: item.periodName || `Periode ${item.periodId}` }])
        ).values()];
        setPeriods(derivedPeriods);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat rombel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);
  const filteredRombels = useMemo(() => {
    if (!filterPeriodId) return rombels;
    return rombels.filter((rombel) => rombel.periodId === Number(filterPeriodId));
  }, [filterPeriodId, rombels]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const loadStudents = async () => {
    try {
      const studentRes = await api.get('/siswa');
      setStudents(studentRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data siswa');
    }
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    if (modal.type !== 'detail') {
      resetForm();
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = async (rombel) => {
    setDetailLoading(true);
    setModal({ type: 'detail', item: null });
    try {
      const { data } = await api.get(`/rombel/${rombel.id}`);
      setDetailQuery('');
      setModal({ type: 'detail', item: data });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail rombel');
      setModal({ type: null, item: null });
    } finally {
      setDetailLoading(false);
    }
  };

  const openAssign = async (rombel) => {
    if (!canManage) return;

    setAssignLoading(true);
    setModal({ type: 'assign', item: null });
    try {
      if (!students.length) {
        await loadStudents();
      }
      const { data } = await api.get(`/rombel/${rombel.id}`);
      const existingIds = (data.students || []).map((student) => student.id);
      setAssignIds(existingIds);
      setInitialAssignIds(existingIds);
      setAssignQuery('');
      setModal({ type: 'assign', item: data });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data rombel');
      setModal({ type: null, item: null });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleEdit = (rombel) => {
    if (!canManage) return;

    setEditingId(rombel.id);
    setForm({
      name: rombel.name,
      gradeLevel: rombel.gradeLevel || '',
      type: rombel.type || 'utama',
      periodId: rombel.periodId || ''
    });
    setModal({ type: 'edit', item: rombel });
  };

  const handleDelete = (rombel) => {
    if (!canManage) return;
    setModal({ type: 'delete', item: rombel });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/rombel/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus rombel');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.periodId) {
      setError('Nama rombel dan periode wajib diisi');
      return;
    }
    if (form.type === 'utama' && !form.gradeLevel.trim()) {
      setError('Tingkat wajib diisi untuk rombel utama');
      return;
    }

    const payload = {
      name: form.name.trim(),
      gradeLevel: form.gradeLevel.trim() || null,
      type: form.type || 'utama',
      periodId: Number(form.periodId)
    };

    try {
      if (editingId) {
        await api.put(`/rombel/${editingId}`, payload);
      } else {
        await api.post('/rombel', payload);
      }
      setModal({ type: null, item: null });
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan rombel');
    }
  };

  const toggleAssign = (id) => {
    setAssignIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const handleAssign = async () => {
    if (!modal.item || !canManage) return;

    setAssignLoading(true);
    setError(null);
    try {
      const current = new Set(initialAssignIds);
      const toAdd = assignIds.filter((id) => !current.has(id));
      await api.put(`/rombel/${modal.item.id}/students`, { studentIds: toAdd });
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal assign siswa');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveStudent = async (student) => {
    if (!modal.item || !canManage) return;
    if (!window.confirm(`Hapus ${student.name} dari rombel ini?`)) return;

    setRemoveLoadingId(student.id);
    setError(null);
    try {
      await api.delete(`/rombel/${modal.item.id}/students/${student.id}`);
      const { data } = await api.get(`/rombel/${modal.item.id}`);
      setModal({ type: 'detail', item: data });
      setAssignIds((data.students || []).map((item) => item.id));
      setInitialAssignIds((data.students || []).map((item) => item.id));
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus siswa dari rombel');
    } finally {
      setRemoveLoadingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Rombongan Belajar</h1>
          <p className="text-sm text-slate-600">
            {canManage ? 'Kelola rombel per periode akademik.' : 'Lihat struktur rombel per periode akademik.'}
          </p>
        </div>
        {canManage && (
          <button
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
            type="button"
            onClick={openCreate}
          >
            + Tambah Rombel
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Daftar Rombel</h2>
            <p className="text-xs text-slate-500">{filteredRombels.length} rombel</p>
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

        <div className="mt-5 hidden grid-cols-[1.4fr_0.8fr_1fr_1.2fr_0.9fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Nama</div>
          <div>Tingkat</div>
          <div>Jenis</div>
          <div>Periode</div>
          <div>Aksi</div>
        </div>
        <div className="mt-4 grid gap-4">
          {filteredRombels.map((rombel) => (
            <div
              key={rombel.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.4fr_0.8fr_1fr_1.2fr_0.9fr] md:items-center"
            >
              <div className="text-sm font-semibold text-slate-900">{rombel.name}</div>
              <div className="text-sm text-slate-700">{rombel.gradeLevel || '-'}</div>
              <div className="text-sm text-slate-700">{typeLabel(rombel.type)}</div>
              <div className="text-sm text-slate-700">{periodMap.get(rombel.periodId)?.name || rombel.periodName || '-'}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                  type="button"
                  onClick={() => openDetail(rombel)}
                >
                  Detail
                </button>
                {canManage && (
                  <>
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                      type="button"
                      onClick={() => openAssign(rombel)}
                    >
                      Assign
                    </button>
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                      type="button"
                      onClick={() => handleEdit(rombel)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                      type="button"
                      onClick={() => handleDelete(rombel)}
                    >
                      Hapus
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!filteredRombels.length && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada data rombel.
            </div>
          )}
        </div>
      </div>

      {modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            {modal.type === 'detail' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Detail Rombel</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                {detailLoading && <div className="text-sm text-slate-500">Memuat data siswa...</div>}
                {!detailLoading && modal.item && (
                  <div className="space-y-4">
                    <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                      <div><span className="text-xs uppercase text-slate-500">Rombel</span><div className="font-semibold">{modal.item.name}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Jenis</span><div className="font-semibold">{typeLabel(modal.item.type)}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Tingkat</span><div className="font-semibold">{modal.item.gradeLevel || '-'}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Periode</span><div className="font-semibold">{periodMap.get(modal.item.periodId)?.name || modal.item.periodName || '-'}</div></div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Daftar Siswa ({modal.item.students?.length || 0})
                        </div>
                        <input
                          value={detailQuery}
                          onChange={(e) => setDetailQuery(e.target.value)}
                          placeholder="Cari nama atau NIS..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 sm:w-64"
                        />
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                        {modal.item.students?.length ? (
                          modal.item.students
                            .filter((student) => {
                              if (!detailQuery) return true;
                              const term = detailQuery.toLowerCase();
                              return (
                                student.name?.toLowerCase().includes(term) ||
                                student.nis?.toLowerCase().includes(term)
                              );
                            })
                            .map((student) => (
                              <div key={student.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-slate-900">{student.name}</div>
                                    <div className="text-xs text-slate-500">{student.nis || '-'} • {student.gender || '-'}</div>
                                  </div>
                                  {canManage && (
                                    <button
                                      type="button"
                                      className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                                      onClick={() => handleRemoveStudent(student)}
                                      disabled={removeLoadingId === student.id}
                                    >
                                      {removeLoadingId === student.id ? 'Menghapus...' : 'Remove'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                        ) : (
                          <div className="text-sm text-slate-500">Belum ada siswa di rombel ini.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && canManage && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit Rombel' : 'Tambah Rombel'}
                  </h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Nama
                    <input
                      value={form.name}
                      onChange={(e) => updateForm('name', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
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
                    Jenis
                    <select
                      value={form.type}
                      onChange={(e) => updateForm('type', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      {typeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Tingkat
                    <input
                      value={form.gradeLevel}
                      onChange={(e) => updateForm('gradeLevel', e.target.value)}
                      placeholder={form.type === 'utama' ? 'Wajib diisi, mis. X / 10' : 'Opsional'}
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

            {modal.type === 'assign' && canManage && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Assign Siswa</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                {assignLoading && !modal.item ? (
                  <div className="text-sm text-slate-500">Memuat data siswa...</div>
                ) : (
                  <>
                    <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                      <div><span className="text-xs uppercase text-slate-500">Rombel</span><div className="font-semibold">{modal.item?.name || '-'}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Periode</span><div className="font-semibold">{periodMap.get(modal.item?.periodId)?.name || modal.item?.periodName || '-'}</div></div>
                    </div>
                    <div>
                      <input
                        value={assignQuery}
                        onChange={(e) => setAssignQuery(e.target.value)}
                        placeholder="Cari nama atau NIS..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      {students
                        .filter((student) => {
                          if (!assignQuery) return true;
                          const term = assignQuery.toLowerCase();
                          return (
                            student.name?.toLowerCase().includes(term) ||
                            student.nis?.toLowerCase().includes(term)
                          );
                        })
                        .map((student) => (
                          <label
                            key={student.id}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                          >
                            <input
                              type="checkbox"
                              checked={assignIds.includes(student.id)}
                              onChange={() => toggleAssign(student.id)}
                              className="mt-1"
                            />
                            <div className="text-sm text-slate-700">
                              <div className="font-semibold text-slate-900">{student.name}</div>
                              <div className="text-xs text-slate-500">{student.nis || '-'} • {student.gender || '-'}</div>
                            </div>
                          </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
                        type="button"
                        onClick={handleAssign}
                        disabled={assignLoading}
                      >
                        {assignLoading ? 'Menyimpan...' : 'Simpan Assign'}
                      </button>
                      <button
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                        type="button"
                        onClick={closeModal}
                      >
                        Batal
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {modal.type === 'delete' && modal.item && canManage && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Hapus Rombel</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  Yakin ingin menghapus <span className="font-semibold">{modal.item.name}</span>?
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

export default Rombel;
