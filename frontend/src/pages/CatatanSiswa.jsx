import { useEffect, useMemo, useState } from 'react';
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
  const [modal, setModal] = useState({ type: null, item: null });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [studentQuery, setStudentQuery] = useState('');
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

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
    const today = new Date().toISOString().slice(0, 10);
    setForm({ ...emptyForm, date: today });
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.studentId) {
      setError('Siswa wajib dipilih');
      return;
    }

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
      setModal({ type: null, item: null });
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
    setStudentQuery(note.student?.name || '');
    setModal({ type: 'edit', item: note });
  };

  const handleDelete = (note) => {
    setModal({ type: 'delete', item: note });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/student-notes/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus catatan');
    }
  };

  const openCreate = () => {
    resetForm();
    setStudentQuery('');
    setModal({ type: 'create', item: null });
  };

  const openDetail = (note) => {
    setModal({ type: 'detail', item: note });
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    resetForm();
    setStudentQuery('');
  };

  const filteredNotes = notes.filter((note) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term
      || note.note?.toLowerCase().includes(term)
      || note.student?.name?.toLowerCase().includes(term);
    const matchesCategory = categoryFilter === 'all' || note.category === categoryFilter;
    const matchesStudent = studentFilter === 'all' || String(note.student?.id) === String(studentFilter);
    return matchesSearch && matchesCategory && matchesStudent;
  });

  const filteredStudents = students.filter((student) => {
    if (!studentQuery.trim()) return true;
    return student.name?.toLowerCase().includes(studentQuery.toLowerCase());
  });

  useEffect(() => {
    if (!studentQuery.trim()) return;
    if (filteredStudents.length === 1) {
      updateForm('studentId', filteredStudents[0].id);
    }
  }, [studentQuery, filteredStudents]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Catatan Siswa</h1>
          <p className="text-sm text-slate-600">Catatan prestasi atau masalah siswa.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          type="button"
          onClick={openCreate}
        >
          + Tambah Catatan
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Catatan</h2>
            <span className="text-xs text-slate-500">{filteredNotes.length} catatan</span>
          </div>
          <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[1.4fr_1fr_1fr]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama siswa atau isi catatan..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            />
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            >
              <option value="all">Semua Siswa</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.name}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            >
              <option value="all">Semua Kategori</option>
              {categoryOptions.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-5 hidden grid-cols-[0.9fr_1.2fr_0.8fr_1.6fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Tanggal</div>
            <div>Siswa</div>
            <div>Kategori</div>
            <div>Catatan</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[0.9fr_1.2fr_0.8fr_1.6fr_0.8fr] md:items-center"
              >
                <div className="text-sm text-slate-700">{note.date}</div>
                <div className="text-sm font-semibold text-slate-900">{note.student?.name}</div>
                <div className="text-sm text-slate-700">{note.category === 'prestasi' ? 'Prestasi' : 'Masalah'}</div>
                <div className="text-sm text-slate-700">{note.note}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={() => openDetail(note)}
                  >
                    Detail
                  </button>
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
            {!filteredNotes.length && !loading && (
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
                  <h3 className="text-lg font-semibold text-slate-900">Detail Catatan</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="text-xs uppercase text-slate-500">Siswa</span><div className="font-semibold">{modal.item.student?.name}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Kategori</span><div className="font-semibold">{modal.item.category === 'prestasi' ? 'Prestasi' : 'Masalah'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Tanggal</span><div className="font-semibold">{modal.item.date}</div></div>
                  <div className="sm:col-span-2"><span className="text-xs uppercase text-slate-500">Catatan</span><div className="font-semibold">{modal.item.note}</div></div>
                </div>
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit Catatan' : 'Tambah Catatan'}
                  </h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="text-sm font-medium text-slate-700">
                    Siswa
                    <input
                      value={studentQuery}
                      onChange={(e) => {
                        setStudentQuery(e.target.value);
                        if (!e.target.value) updateForm('studentId', '');
                      }}
                      placeholder="Cari nama siswa..."
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Klik nama siswa di daftar untuk memilih.
                    </p>
                    <select
                      value={form.studentId ? String(form.studentId) : ''}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : '';
                        updateForm('studentId', id);
                        const selected = studentMap.get(id);
                        if (selected) setStudentQuery(selected.name);
                      }}
                      required
                      size="6"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Pilih siswa</option>
                      {filteredStudents.map((student) => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                  </div>
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
                  <h3 className="text-lg font-semibold text-slate-900">Hapus Catatan</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  Yakin ingin menghapus catatan untuk <span className="font-semibold">{modal.item.student?.name}</span>?
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

export default CatatanSiswa;
