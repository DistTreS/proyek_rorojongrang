import { useEffect, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  name: '',
  startDate: '',
  endDate: '',
  semester: 'ganjil',
  isActive: false
};

const Period = () => {
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
      const { data } = await api.get('/period');
      setPeriods(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat periode');
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
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      semester: form.semester,
      isActive: form.isActive
    };

    try {
      if (editingId) {
        await api.put(`/period/${editingId}`, payload);
      } else {
        await api.post('/period', payload);
      }
      resetForm();
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan periode');
    }
  };

  const handleEdit = (period) => {
    setEditingId(period.id);
    setForm({
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      semester: period.semester || 'ganjil',
      isActive: period.isActive
    });
    setModal({ type: 'edit', item: period });
  };

  const handleDelete = async (period) => {
    setModal({ type: 'delete', item: period });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/period/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus periode');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (period) => {
    setModal({ type: 'detail', item: period });
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Periode Akademik</h1>
          <p className="text-sm text-slate-600">Kelola periode, hanya satu periode aktif sekaligus.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          type="button"
          onClick={openCreate}
        >
          + Tambah Periode
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Periode</h2>
            <span className="text-xs text-slate-500">{periods.length} periode</span>
          </div>
          <div className="mt-5 hidden grid-cols-[1.2fr_0.8fr_0.8fr_1fr_0.8fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Nama</div>
            <div>Semester</div>
            <div>Mulai</div>
            <div>Selesai</div>
            <div>Status</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {periods.map((period) => (
              <div
                key={period.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_0.8fr_0.8fr] md:items-center"
              >
                <div className="text-sm font-semibold text-slate-900">{period.name}</div>
                <div className="text-sm text-slate-700">{period.semester === 'genap' ? 'Genap' : 'Ganjil'}</div>
                <div className="text-sm text-slate-700">{period.startDate}</div>
                <div className="text-sm text-slate-700">{period.endDate}</div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${period.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {period.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => openDetail(period)}
                  >
                    Detail
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => handleEdit(period)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => handleDelete(period)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
            {!periods.length && !loading && (
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
                  <h3 className="text-lg font-semibold text-slate-900">Detail Periode</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="text-xs uppercase text-slate-500">Nama</span><div className="font-semibold">{modal.item.name}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Status</span><div className="font-semibold">{modal.item.isActive ? 'Aktif' : 'Nonaktif'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Semester</span><div className="font-semibold">{modal.item.semester === 'genap' ? 'Genap' : 'Ganjil'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Mulai</span><div className="font-semibold">{modal.item.startDate}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Selesai</span><div className="font-semibold">{modal.item.endDate}</div></div>
                </div>
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit Periode' : 'Tambah Periode'}
                  </h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Nama Periode
                    <input
                      value={form.name}
                      onChange={(e) => updateForm('name', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Tanggal Mulai
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => updateForm('startDate', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Tanggal Akhir
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => updateForm('endDate', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Semester
                    <select
                      value={form.semester}
                      onChange={(e) => updateForm('semester', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="ganjil">Ganjil</option>
                      <option value="genap">Genap</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateForm('isActive', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                  />
                  <span>Jadikan Aktif</span>
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
                  <h3 className="text-lg font-semibold text-slate-900">Hapus Periode</h3>
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

export default Period;
