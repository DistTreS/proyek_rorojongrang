import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const dayOptions = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' }
];

const emptyForm = {
  periodId: '',
  dayOfWeek: 1,
  startTime: '',
  endTime: '',
  label: ''
};

const JamPelajaran = () => {
  const [slots, setSlots] = useState([]);
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
      const [slotRes, periodRes] = await Promise.all([
        api.get('/jam'),
        api.get('/period')
      ]);
      setSlots(slotRes.data);
      setPeriods(periodRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat jam pelajaran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const periodMap = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);

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
      periodId: form.periodId ? Number(form.periodId) : null,
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      label: form.label.trim() || null
    };

    try {
      if (editingId) {
        await api.put(`/jam/${editingId}`, payload);
      } else {
        await api.post('/jam', payload);
      }
      resetForm();
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan jam pelajaran');
    }
  };

  const handleEdit = (slot) => {
    setEditingId(slot.id);
    setForm({
      periodId: slot.periodId || '',
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label || ''
    });
    setModal({ type: 'edit', item: slot });
  };

  const handleDelete = (slot) => {
    setModal({ type: 'delete', item: slot });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/jam/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus jam pelajaran');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (slot) => {
    setModal({ type: 'detail', item: slot });
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    resetForm();
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Jam Pelajaran</h1>
          <p className="text-sm text-slate-600">Kelola slot jam pelajaran per hari.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          type="button"
          onClick={openCreate}
        >
          + Tambah Jam
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Jam</h2>
            <span className="text-xs text-slate-500">{slots.length} slot</span>
          </div>
          <div className="mt-5 hidden grid-cols-[0.9fr_1.2fr_1.2fr_1fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Hari</div>
            <div>Jam</div>
            <div>Periode</div>
            <div>Label</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[0.9fr_1.2fr_1.2fr_1fr_0.8fr] md:items-center"
              >
                <div className="text-sm text-slate-700">
                  {dayOptions.find((day) => day.value === slot.dayOfWeek)?.label}
                </div>
                <div className="text-sm text-slate-700">{slot.startTime} - {slot.endTime}</div>
                <div className="text-sm text-slate-700">{periodMap.get(slot.periodId)?.name || slot.periodName || '-'}</div>
                <div className="text-sm text-slate-700">{slot.label || '-'}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => openDetail(slot)}
                  >
                    Detail
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => handleEdit(slot)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => handleDelete(slot)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
            {!slots.length && !loading && (
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
                  <h3 className="text-lg font-semibold text-slate-900">Detail Jam</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="text-xs uppercase text-slate-500">Hari</span><div className="font-semibold">{dayOptions.find((day) => day.value === modal.item.dayOfWeek)?.label || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Waktu</span><div className="font-semibold">{modal.item.startTime} - {modal.item.endTime}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Periode</span><div className="font-semibold">{periodMap.get(modal.item.periodId)?.name || modal.item.periodName || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Label</span><div className="font-semibold">{modal.item.label || '-'}</div></div>
                </div>
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit Jam' : 'Tambah Jam'}
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
                    Hari
                    <select
                      value={form.dayOfWeek}
                      onChange={(e) => updateForm('dayOfWeek', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      {dayOptions.map((day) => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Jam Mulai
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => updateForm('startTime', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Jam Selesai
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => updateForm('endTime', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Label (Opsional)
                    <input
                      value={form.label}
                      onChange={(e) => updateForm('label', e.target.value)}
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
                  <h3 className="text-lg font-semibold text-slate-900">Hapus Jam</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  Yakin ingin menghapus jam {modal.item.startTime} - {modal.item.endTime}?
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

export default JamPelajaran;
