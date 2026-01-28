import { useEffect, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  studentId: '',
  category: 'prestasi',
  note: '',
  date: ''
};

const categoryOptions = [
  { value: 'prestasi', label: 'Prestasi' },
  { value: 'masalah', label: 'Masalah' }
];

const CatatanSiswa = () => {
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [noteRes, studentRes] = await Promise.all([
        api.get('/student-notes'),
        api.get('/siswa')
      ]);
      setNotes(noteRes.data || []);
      setStudents(studentRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat catatan');
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
      studentId: form.studentId ? Number(form.studentId) : null,
      category: form.category,
      note: form.note.trim(),
      date: form.date
    };

    try {
      if (editingId) {
        await api.put(`/student-notes/${editingId}`, payload);
      } else {
        await api.post('/student-notes', payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan catatan');
    }
  };

  const handleEdit = (note) => {
    setEditingId(note.id);
    setForm({
      studentId: note.student?.id || '',
      category: note.category,
      note: note.note,
      date: note.date
    });
  };

  const handleDelete = async (note) => {
    if (!confirm('Hapus catatan ini?')) return;
    try {
      await api.delete(`/student-notes/${note.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus catatan');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Catatan Siswa</h1>
          <p className="text-sm text-slate-600">Catatan prestasi atau masalah siswa.</p>
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
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Catatan' : 'Tambah Catatan'}</h2>
            {editingId && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Mode Edit
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
              Kategori
              <select
                value={form.category}
                onChange={(e) => updateForm('category', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </label>
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
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Catatan
              <textarea
                value={form.note}
                onChange={(e) => updateForm('note', e.target.value)}
                rows="4"
                required
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
            <h2 className="text-lg font-semibold text-slate-900">Daftar Catatan</h2>
            <span className="text-xs text-slate-500">{notes.length} catatan</span>
          </div>
          <div className="mt-5 hidden grid-cols-[0.9fr_1.2fr_0.8fr_1.6fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Tanggal</div>
            <div>Siswa</div>
            <div>Kategori</div>
            <div>Catatan</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[0.9fr_1.2fr_0.8fr_1.6fr_0.8fr] md:items-center"
              >
                <div className="text-sm text-slate-700">{note.date}</div>
                <div className="text-sm font-semibold text-slate-900">{note.student?.name}</div>
                <div className="text-sm text-slate-700">{note.category}</div>
                <div className="text-sm text-slate-700">{note.note}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => handleEdit(note)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => handleDelete(note)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
            {!notes.length && !loading && (
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

export default CatatanSiswa;
