import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  nis: '',
  name: '',
  gender: '',
  birthDate: '',
  rombelIds: []
};

const genderOptions = [
  { value: '', label: 'Pilih' },
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' }
];

const Siswa = () => {
  const [students, setStudents] = useState([]);
  const [rombels, setRombels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentRes, rombelRes] = await Promise.all([
        api.get('/siswa'),
        api.get('/rombel')
      ]);
      setStudents(studentRes.data);
      setRombels(rombelRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data siswa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rombelMap = useMemo(() => {
    return new Map(rombels.map((rombel) => [rombel.id, rombel]));
  }, [rombels]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRombel = (id) => {
    setForm((prev) => {
      const exists = prev.rombelIds.includes(id);
      const next = exists
        ? prev.rombelIds.filter((item) => item !== id)
        : [...prev.rombelIds, id];
      return { ...prev, rombelIds: next };
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    const payload = {
      nis: form.nis.trim(),
      name: form.name.trim(),
      gender: form.gender || null,
      birthDate: form.birthDate || null,
      rombelIds: form.rombelIds
    };

    try {
      if (editingId) {
        await api.put(`/siswa/${editingId}`, payload);
      } else {
        await api.post('/siswa', payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan siswa');
    }
  };

  const handleEdit = (student) => {
    setEditingId(student.id);
    setForm({
      nis: student.nis,
      name: student.name,
      gender: student.gender || '',
      birthDate: student.birthDate || '',
      rombelIds: student.rombels?.map((rombel) => rombel.id) || []
    });
  };

  const handleDelete = async (student) => {
    if (!confirm(`Hapus ${student.name}?`)) return;
    try {
      await api.delete(`/siswa/${student.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus siswa');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Data Siswa</h1>
          <p className="text-sm text-slate-600">Kelola data siswa dan keanggotaan rombel.</p>
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
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Siswa' : 'Tambah Siswa'}</h2>
            {editingId && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Mode Edit
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              NIS
              <input
                value={form.nis}
                onChange={(e) => updateForm('nis', e.target.value)}
                required
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
              Jenis Kelamin
              <select
                value={form.gender}
                onChange={(e) => updateForm('gender', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                {genderOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tanggal Lahir
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => updateForm('birthDate', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rombel</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {rombels.map((rombel) => (
                <label key={rombel.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.rombelIds.includes(rombel.id)}
                    onChange={() => toggleRombel(rombel.id)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                  />
                  {rombel.name} {rombel.gradeLevel ? `(${rombel.gradeLevel})` : ''}
                </label>
              ))}
              {!rombels.length && (
                <div className="text-sm text-slate-500">Belum ada data rombel.</div>
              )}
            </div>
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
            <h2 className="text-lg font-semibold text-slate-900">Daftar Siswa</h2>
            <span className="text-xs text-slate-500">{students.length} siswa</span>
          </div>
          <div className="mt-5 hidden grid-cols-[1.4fr_1fr_1.4fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Nama</div>
            <div>NIS</div>
            <div>Rombel</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {students.map((student) => (
              <div
                key={student.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.4fr_1fr_1.4fr_0.8fr] md:items-center"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{student.name}</div>
                  <div className="text-xs text-slate-500">{student.gender || '-'} • {student.birthDate || '-'}</div>
                </div>
                <div className="text-sm text-slate-700">{student.nis}</div>
                <div className="text-sm text-slate-700">
                  {student.rombels?.length
                    ? student.rombels.map((rombel) => rombelMap.get(rombel.id)?.name || rombel.name).join(', ')
                    : '-'
                  }
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => handleEdit(student)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => handleDelete(student)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
            {!students.length && !loading && (
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

export default Siswa;
