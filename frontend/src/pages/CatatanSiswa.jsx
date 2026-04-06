import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { useAuth } from '../context/useAuth';
import {
  buildPageParams,
  DEFAULT_PAGE_SIZE,
  fetchAllPages,
  normalizePaginatedResponse
} from '../utils/pagination';
import { isValidDateOnly } from '../utils/temporalValidation';

const categoryOptions = [
  { value: 'prestasi', label: 'Prestasi' },
  { value: 'masalah', label: 'Masalah' }
];

const decodeJwtPayload = (token) => {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length < 2) return null;

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const CatatanSiswa = () => {
  const { accessToken } = useAuth();
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ studentId: '', category: 'prestasi', note: '', date: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [studentQuery, setStudentQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });

  const load = async ({
    nextPage = page,
    nextSearch = search,
    nextCategory = categoryFilter,
    nextStudent = studentFilter
  } = {}) => {
    setLoading(true);
    try {
      const [noteRes, studentRes] = await Promise.all([
        api.get('/student-notes', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE,
            search: nextSearch || undefined,
            category: nextCategory !== 'all' ? nextCategory : undefined,
            studentId: nextStudent !== 'all' ? nextStudent : undefined
          })
        }),
        fetchAllPages(api, '/siswa')
      ]);
      const normalized = normalizePaginatedResponse(noteRes.data);
      setNotes(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
      setStudents(studentRes || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load({ nextPage: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const currentUserId = useMemo(() => {
    const payload = decodeJwtPayload(accessToken);
    const sub = Number(payload?.sub);
    return Number.isInteger(sub) ? sub : null;
  }, [accessToken]);
  const canModifyNote = (note) => Number(note?.author?.id) === currentUserId;

  const filteredStudents = students.filter(student => 
    !studentQuery || student.name?.toLowerCase().includes(studentQuery.toLowerCase())
  );

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const resetForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ studentId: '', category: 'prestasi', note: '', date: today });
    setEditingId(null);
    setStudentQuery('');
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.studentId || !form.note.trim()) {
      setError('Siswa dan catatan wajib diisi');
      return;
    }
    if (!form.date || !isValidDateOnly(form.date)) {
      setError('Tanggal catatan tidak valid');
      return;
    }

    const payload = {
      studentId: Number(form.studentId),
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
      setModal({ type: null });
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
    setStudentQuery(note.student?.name || '');
    setModal({ type: 'edit' });
  };

  const handleDelete = (note) => {
    setModal({ type: 'delete', item: note });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/student-notes/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus catatan');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Catatan Siswa</h1>
          <p className="text-slate-600 mt-1">Kelola catatan prestasi dan masalah siswa</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Tambah Catatan
        </Button>
      </div>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      {/* Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Cari nama siswa atau isi catatan..."
            value={search}
            onChange={(e) => {
              const nextValue = e.target.value;
              setSearch(nextValue);
              load({ nextPage: 1, nextSearch: nextValue });
            }}
          />
          <Select
            value={studentFilter}
            onChange={(e) => {
              const nextValue = e.target.value;
              setStudentFilter(nextValue);
              load({ nextPage: 1, nextStudent: nextValue });
            }}
          >
            <option value="all">Semua Siswa</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Select
            value={categoryFilter}
            onChange={(e) => {
              const nextValue = e.target.value;
              setCategoryFilter(nextValue);
              load({ nextPage: 1, nextCategory: nextValue });
            }}
          >
            <option value="all">Semua Kategori</option>
            {categoryOptions.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </Select>
        </div>
      </Card>

      {/* List Catatan */}
      <div className="space-y-4">
        {loading && (
          <Card className="p-4 text-sm text-slate-500">
            Memuat catatan siswa...
          </Card>
        )}
        {notes.map(note => (
          <Card key={note.id} className="p-6 hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Badge variant={note.category === 'prestasi' ? 'success' : 'danger'}>
                    {note.category === 'prestasi' ? 'Prestasi' : 'Masalah'}
                  </Badge>
                  <span className="font-semibold text-slate-900">{note.student?.name}</span>
                </div>
                <p className="text-slate-600 mt-3">{note.note}</p>
              </div>
              <div className="text-xs text-slate-500 whitespace-nowrap">
                {note.date}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="secondary" size="sm" onClick={() => setModal({ type: 'detail', item: note })}>
                Detail
              </Button>
              {canModifyNote(note) && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(note)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(note)}>
                    Hapus
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}

        {!notes.length && (
          <Card className="p-12 text-center text-slate-500">
            Belum ada catatan siswa.
          </Card>
        )}
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={(nextPage) => load({ nextPage })}
        />
      </div>

      {/* Modal */}
      <Modal
        isOpen={!!modal.type}
        onClose={() => { setModal({ type: null }); resetForm(); }}
        title={
          modal.type === 'create' ? 'Tambah Catatan' :
          modal.type === 'edit' ? 'Edit Catatan' :
          modal.type === 'detail' ? 'Detail Catatan' : 'Hapus Catatan'
        }
      >
        {/* Modal Create / Edit */}
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Siswa</label>
              <Input
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Cari nama siswa..."
              />
              <Select
                value={form.studentId}
                onChange={(e) => {
                  updateForm('studentId', e.target.value);
                  const selected = studentMap.get(Number(e.target.value));
                  if (selected) setStudentQuery(selected.name);
                }}
                className="mt-2"
              >
                <option value="">Pilih siswa</option>
                {filteredStudents.map(student => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Kategori</label>
                <Select value={form.category} onChange={(e) => updateForm('category', e.target.value)}>
                  {categoryOptions.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tanggal</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateForm('date', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Catatan</label>
              <textarea
                value={form.note}
                onChange={(e) => updateForm('note', e.target.value)}
                rows="4"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                required
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah Catatan'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={() => setModal({ type: null })}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {/* Modal Detail */}
        {modal.type === 'detail' && modal.item && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <Badge variant={modal.item.category === 'prestasi' ? 'success' : 'danger'}>
                {modal.item.category === 'prestasi' ? 'Prestasi' : 'Masalah'}
              </Badge>
              <span className="text-xs text-slate-500">{modal.item.date}</span>
            </div>
            <p className="font-semibold text-slate-900">{modal.item.student?.name}</p>
            <p className="text-slate-600">{modal.item.note}</p>
          </div>
        )}

        {/* Modal Delete */}
        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Yakin ingin menghapus catatan untuk <span className="font-semibold">{modal.item.student?.name}</span>?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">
                Ya, Hapus
              </Button>
              <Button variant="secondary" onClick={() => setModal({ type: null })} className="flex-1">
                Batal
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CatatanSiswa;
