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
import { ADMIN_ROLES, canAccess } from '../constants/rbac';
import {
  buildPageParams,
  DEFAULT_PAGE_SIZE,
  fetchAllPages,
  normalizePaginatedResponse
} from '../utils/pagination';

const emptyForm = {
  nis: '',
  name: '',
  gender: '',
  birthDate: '',
  rombelIds: []
};

const genderOptions = [
  { value: '', label: 'Pilih Jenis Kelamin' },
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' }
];

const formatRombelLabel = (rombel) => {
  if (!rombel) return '-';
  const typeLabel = rombel.type === 'peminatan' ? 'Peminatan' : 'Utama';
  return `${rombel.name} • ${typeLabel}`;
};

const Siswa = () => {
  const { roles } = useAuth();
  const canManage = canAccess(roles, ADMIN_ROLES);

  const [students, setStudents] = useState([]);
  const [rombels, setRombels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });

  const load = async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const [studentRes, rombelRes] = await Promise.all([
        api.get('/siswa', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE
          })
        }),
        fetchAllPages(api, '/rombel')
      ]);
      const normalized = normalizePaginatedResponse(studentRes.data);
      setStudents(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
      setRombels(rombelRes || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data siswa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const rombelMap = useMemo(() => new Map(rombels.map(r => [r.id, r])), [rombels]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleRombel = (id) => {
    setForm(prev => {
      const exists = prev.rombelIds.includes(id);
      return {
        ...prev,
        rombelIds: exists ? prev.rombelIds.filter(i => i !== id) : [...prev.rombelIds, id]
      };
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.nis.trim() || !form.name.trim()) {
      setError('NIS dan nama wajib diisi');
      return;
    }

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
      setModal({ type: null });
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
      rombelIds: student.rombels?.map(r => r.id) || []
    });
    setModal({ type: 'edit', item: student });
  };

  const handleDelete = (student) => setModal({ type: 'delete', item: student });

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/siswa/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus siswa');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create' });
  };

  const openDetail = (student) => setModal({ type: 'detail', item: student });

  const closeModal = () => {
    setModal({ type: null });
    if (modal.type !== 'detail') resetForm();
  };

  const openImport = () => {
    setImportFile(null);
    setImportResult(null);
    setModal({ type: 'import' });
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/siswa/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'template-siswa.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Gagal mengunduh template');
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setError('Pilih file Excel terlebih dahulu');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const { data } = await api.post('/siswa/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(data);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal import data');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">
            {canManage ? 'Data Siswa' : 'Daftar Siswa'}
          </h1>
          <p className="text-slate-600 mt-1">
            {canManage ? 'Kelola data siswa dan keanggotaan rombel' : 'Lihat data siswa dan keanggotaan rombel'}
          </p>
        </div>

        {canManage && (
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" onClick={openImport}>
              Import Excel
            </Button>
            <Button onClick={openCreate} size="lg">
              + Tambah Siswa
            </Button>
          </div>
        )}
      </div>

      {error && <Card className="p-4 border-red-200 bg-red-50 text-red-700">{error}</Card>}

      {/* Daftar Siswa */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Siswa</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} siswa</span>
        </div>

        <div className="space-y-4">
          {students.map(student => (
            <Card key={student.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1.8fr_0.8fr] gap-4 md:items-center">
                <div>
                  <div className="font-semibold text-slate-900">{student.name}</div>
                  <div className="text-xs text-slate-500">
                    {student.gender ? (student.gender === 'L' ? 'Laki-laki' : 'Perempuan') : '-'} • {student.birthDate || '-'}
                  </div>
                </div>
                <div className="text-sm font-medium text-slate-700">{student.nis}</div>
                <div className="text-sm text-slate-700">
                  {student.rombels?.length
                    ? student.rombels.map(r => formatRombelLabel(rombelMap.get(r.id) || r)).join(', ')
                    : '-'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(student)}>
                    Detail
                  </Button>
                  {canManage && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(student)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(student)}>
                        Hapus
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {!students.length && !loading && (
            <div className="text-center py-12 text-slate-500">Belum ada data siswa.</div>
          )}
        </div>

        <div className="mt-8 flex justify-center">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={load}
          />
        </div>
      </Card>

      {/* Modal */}
      <Modal
        isOpen={!!modal.type}
        onClose={closeModal}
        title={
          modal.type === 'create' ? 'Tambah Siswa' :
          modal.type === 'edit' ? 'Edit Siswa' :
          modal.type === 'detail' ? 'Detail Siswa' :
          modal.type === 'delete' ? 'Hapus Siswa' : 'Import Siswa'
        }
      >
        {/* Create / Edit */}
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">NIS</label>
                <Input value={form.nis} onChange={e => updateForm('nis', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nama Lengkap</label>
                <Input value={form.name} onChange={e => updateForm('name', e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jenis Kelamin</label>
                <Select value={form.gender} onChange={e => updateForm('gender', e.target.value)}>
                  {genderOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tanggal Lahir</label>
                <Input type="date" value={form.birthDate} onChange={e => updateForm('birthDate', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Rombel (boleh lebih dari satu)</label>
              <div className="max-h-64 overflow-auto grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-200 rounded-2xl p-4 bg-slate-50">
                {rombels.map(rombel => (
                  <label key={rombel.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.rombelIds.includes(rombel.id)}
                      onChange={() => toggleRombel(rombel.id)}
                    />
                    <span className="text-sm">{formatRombelLabel(rombel)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah Siswa'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {/* Detail */}
        {modal.type === 'detail' && modal.item && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><span className="text-xs uppercase text-slate-500">NIS</span><p className="font-semibold">{modal.item.nis}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Nama</span><p className="font-semibold">{modal.item.name}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Gender</span><p className="font-semibold">{modal.item.gender === 'L' ? 'Laki-laki' : modal.item.gender === 'P' ? 'Perempuan' : '-'}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Tanggal Lahir</span><p className="font-semibold">{modal.item.birthDate || '-'}</p></div>
            </div>
            <div>
              <span className="text-xs uppercase text-slate-500">Rombel</span>
              <p className="mt-1 font-medium">
                {modal.item.rombels?.length
                  ? modal.item.rombels.map(r => formatRombelLabel(rombelMap.get(r.id) || r)).join(', ')
                  : '-'}
              </p>
            </div>
          </div>
        )}

        {/* Delete */}
        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">Yakin ingin menghapus siswa <span className="font-semibold">{modal.item.name}</span>?</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}

        {/* Import */}
        {modal.type === 'import' && (
          <div className="space-y-6">
            <div className="text-sm text-slate-600">
              Unduh template, isi data, lalu upload kembali.
            </div>
            <Button variant="secondary" onClick={downloadTemplate} className="w-full">
              📥 Download Template Excel
            </Button>
            <Input type="file" accept=".xlsx" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleImport} className="flex-1" disabled={!importFile}>Import Data</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>

            {importResult && (
              <Card className="p-4 bg-emerald-50 border-emerald-200">
                <p className="text-emerald-700">Berhasil import {importResult.success} siswa.</p>
                {importResult.failed?.length > 0 && <p className="text-xs text-emerald-600 mt-2">Gagal: {importResult.failed.length} baris</p>}
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Siswa;
