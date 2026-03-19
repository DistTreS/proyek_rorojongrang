import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  code: '',
  name: '',
  type: 'wajib',
  periodId: ''
};

const typeOptions = [
  { value: 'wajib', label: 'Wajib' },
  { value: 'peminatan', label: 'Peminatan' }
];

const typeLabel = (value) => (value === 'peminatan' ? 'Peminatan' : 'Wajib');

const Mapel = () => {
  const [subjects, setSubjects] = useState([]);
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
      const [subjectRes, periodRes] = await Promise.all([
        api.get('/mapel'),
        api.get('/period')
      ]);
      setSubjects(subjectRes.data || []);
      setPeriods(periodRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat mapel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const periodMap = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);
  const filteredSubjects = useMemo(() => {
    if (!filterPeriodId) return subjects;
    return subjects.filter((subject) => subject.periodId === Number(filterPeriodId));
  }, [filterPeriodId, subjects]);

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

  const openDetail = (subject) => {
    setModal({ type: 'detail', item: subject });
  };

  const handleEdit = (subject) => {
    setEditingId(subject.id);
    setForm({
      code: subject.code || '',
      name: subject.name,
      type: subject.type || 'wajib',
      periodId: subject.periodId || ''
    });
    setModal({ type: 'edit', item: subject });
  };

  const handleDelete = (subject) => {
    setModal({ type: 'delete', item: subject });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/mapel/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus mapel');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.periodId || !form.name.trim()) {
      setError('Periode dan nama mata pelajaran wajib diisi');
      return;
    }

    const payload = {
      code: form.code.trim() || null,
      name: form.name.trim(),
      type: form.type || 'wajib',
      periodId: Number(form.periodId)
    };

    try {
      if (editingId) {
        await api.put(`/mapel/${editingId}`, payload);
      } else {
        await api.post('/mapel', payload);
      }
      closeModal();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan mapel');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Mata Pelajaran</h1>
          <p className="text-sm text-slate-600">Kelola data mapel per periode akademik.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          type="button"
          onClick={openCreate}
        >
          + Tambah Mapel
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
            <h2 className="text-lg font-semibold text-slate-900">Daftar Mapel</h2>
            <p className="text-xs text-slate-500">{filteredSubjects.length} mapel</p>
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

        <div className="mt-5 hidden grid-cols-[1.3fr_0.9fr_0.8fr_1.1fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Nama</div>
          <div>Kode</div>
          <div>Jenis</div>
          <div>Periode</div>
          <div>Aksi</div>
        </div>
        <div className="mt-4 grid gap-4">
          {filteredSubjects.map((subject) => (
            <div
              key={subject.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.3fr_0.9fr_0.8fr_1.1fr_0.8fr] md:items-center"
            >
              <div className="text-sm font-semibold text-slate-900">{subject.name}</div>
              <div className="text-sm text-slate-700">{subject.code || '-'}</div>
              <div className="text-sm text-slate-700">{typeLabel(subject.type)}</div>
              <div className="text-sm text-slate-700">{periodMap.get(subject.periodId)?.name || subject.periodName || '-'}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                  type="button"
                  onClick={() => openDetail(subject)}
                >
                  Detail
                </button>
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                  type="button"
                  onClick={() => handleEdit(subject)}
                >
                  Edit
                </button>
                <button
                  className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                  type="button"
                  onClick={() => handleDelete(subject)}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
          {!filteredSubjects.length && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada data mapel.
            </div>
          )}
        </div>
      </div>

      {modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <div className="relative w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            {modal.type === 'detail' && modal.item && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Detail Mapel</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="text-xs uppercase text-slate-500">Nama</span><div className="font-semibold">{modal.item.name}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Kode</span><div className="font-semibold">{modal.item.code || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Jenis</span><div className="font-semibold">{typeLabel(modal.item.type)}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Periode</span><div className="font-semibold">{periodMap.get(modal.item.periodId)?.name || modal.item.periodName || '-'}</div></div>
                </div>
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit Mapel' : 'Tambah Mapel'}
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
                    Kode
                    <input
                      value={form.code}
                      onChange={(e) => updateForm('code', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
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
                  <h3 className="text-lg font-semibold text-slate-900">Hapus Mapel</h3>
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

export default Mapel;
