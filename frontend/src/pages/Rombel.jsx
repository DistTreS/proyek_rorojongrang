import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  name: '',
  gradeLevel: '',
  periodId: ''
};

const Rombel = () => {
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
      const [rombelRes, periodRes] = await Promise.all([
        api.get('/rombel'),
        api.get('/period')
      ]);
      setRombels(rombelRes.data);
      setPeriods(periodRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat rombel');
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
      name: form.name.trim(),
      gradeLevel: form.gradeLevel.trim() || null,
      periodId: form.periodId ? Number(form.periodId) : null
    };

    try {
      if (editingId) {
        await api.put(`/rombel/${editingId}`, payload);
      } else {
        await api.post('/rombel', payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan rombel');
    }
  };

  const handleEdit = (rombel) => {
    setEditingId(rombel.id);
    setForm({
      name: rombel.name,
      gradeLevel: rombel.gradeLevel || '',
      periodId: rombel.periodId || ''
    });
  };

  const handleDelete = async (rombel) => {
    if (!confirm(`Hapus rombel ${rombel.name}?`)) return;
    try {
      await api.delete(`/rombel/${rombel.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus rombel');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Rombongan Belajar</h1>
          <p className="text-sm text-slate-600">Kelola rombel per periode akademik.</p>
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
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Rombel' : 'Tambah Rombel'}</h2>
            {editingId && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Mode Edit
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Nama Rombel
              <input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tingkat
              <input
                value={form.gradeLevel}
                onChange={(e) => updateForm('gradeLevel', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Periode Akademik
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
            <h2 className="text-lg font-semibold text-slate-900">Daftar Rombel</h2>
            <span className="text-xs text-slate-500">{rombels.length} rombel</span>
          </div>
          <div className="mt-5 hidden grid-cols-[1.4fr_0.8fr_1.2fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Nama</div>
            <div>Tingkat</div>
            <div>Periode</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {rombels.map((rombel) => (
              <div
                key={rombel.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.4fr_0.8fr_1.2fr_0.8fr] md:items-center"
              >
                <div className="text-sm font-semibold text-slate-900">{rombel.name}</div>
                <div className="text-sm text-slate-700">{rombel.gradeLevel || '-'}</div>
                <div className="text-sm text-slate-700">{periodMap.get(rombel.periodId)?.name || rombel.periodName || '-'}</div>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </div>
            ))}
            {!rombels.length && !loading && (
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

export default Rombel;
