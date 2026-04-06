import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  ROLES,
  normalizeRoles
} from '../constants/rbac';
import {
  buildPageParams,
  DEFAULT_PAGE_SIZE,
  normalizePaginatedResponse
} from '../utils/pagination';

const emptyForm = {
  username: '',
  email: '',
  password: '',
  name: '',
  nip: '',
  position: '',
  roles: [ROLES.GURU],
  isActive: true
};

const isValidEmail = (value) => /\S+@\S+\.\S+/.test(value);

const Tendik = ({
  pageTitle = 'Data Tendik',
  pageDescription = 'Kelola guru dan staff tata usaha beserta akun login.'
}) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [editingId, setEditingId] = useState(null);
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
      const { data } = await api.get('/tendik', {
        params: buildPageParams({
          page: nextPage,
          pageSize: DEFAULT_PAGE_SIZE
        })
      });
      const normalized = normalizePaginatedResponse(data);
      setItems(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data tendik');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const roleSet = useMemo(() => new Set(form.roles), [form.roles]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleRole = (value) => {
    setForm(prev => {
      const has = prev.roles.includes(value);
      const nextRoles = has
        ? prev.roles.filter(role => role !== value)
        : [...prev.roles, value];
      return { ...prev, roles: nextRoles };
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const validateForm = () => {
    if (!form.username.trim() || !form.email.trim() || !form.name.trim()) return 'Username, email, dan nama wajib diisi';
    if (!isValidEmail(form.email.trim())) return 'Format email tidak valid';
    if (!editingId && (!form.password || form.password.length < 6)) return 'Password minimal 6 karakter untuk akun baru';
    if (!normalizeRoles(form.roles).length) return 'Minimal satu role harus dipilih';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      name: form.name.trim(),
      nip: form.nip.trim() || null,
      position: form.position.trim() || null,
      roles: normalizeRoles(form.roles),
      isActive: form.isActive
    };

    if (!editingId) payload.password = form.password;
    if (editingId && form.password) payload.password = form.password;

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/tendik/${editingId}`, payload);
      } else {
        await api.post('/tendik', payload);
      }
      setMessage('Data berhasil disimpan ✅');
      resetForm();
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan data');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      username: item.user.username,
      email: item.user.email,
      password: '',
      name: item.name,
      nip: item.nip || '',
      position: item.position || '',
      roles: normalizeRoles(item.user.roles),
      isActive: item.user.isActive
    });
    setModal({ type: 'edit', item });
  };

  const handleDelete = (item) => setModal({ type: 'delete', item });

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/tendik/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus data');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create' });
  };

  const openDetail = (item) => setModal({ type: 'detail', item });

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
      const res = await api.get('/tendik/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'template-tendik.xlsx';
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
      const { data } = await api.post('/tendik/import', formData, {
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
          <h1 className="text-4xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="text-slate-600 mt-1">{pageDescription}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={openImport}>
            Import Excel
          </Button>
          <Button onClick={openCreate} size="lg">
            + Tambah Tendik
          </Button>
        </div>
      </div>

      {error && <Card className="p-4 border-red-200 bg-red-50 text-red-700">{error}</Card>}
      {message && <Card className="p-4 border-emerald-200 bg-emerald-50 text-emerald-700">{message}</Card>}

      {/* Daftar Tendik */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Tendik</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} orang</span>
        </div>

        <div className="space-y-4">
          {items.map(item => (
            <Card key={item.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1.1fr_0.7fr_0.9fr] gap-4 md:items-center">
                <div>
                  <div className="font-semibold text-slate-900">{item.name}</div>
                  <div className="text-xs text-slate-500">{item.nip || '-'} • {item.user?.primaryRoleLabel || '-'}</div>
                </div>
                <div className="text-sm text-slate-700">{item.user?.username}</div>
                <div className="flex flex-wrap gap-2">
                  {item.user?.roles?.map(role => (
                    <Badge key={role} variant="success">{ROLE_LABELS[role] || role}</Badge>
                  ))}
                </div>
                <div>
                  <Badge variant={item.user?.isActive ? 'success' : 'default'}>
                    {item.user?.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(item)}>
                    Detail
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(item)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(item)}>
                    Hapus
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {!items.length && !loading && (
            <div className="text-center py-12 text-slate-500">Belum ada data tendik.</div>
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
          modal.type === 'create' ? 'Tambah Tendik' :
          modal.type === 'edit' ? 'Edit Tendik' :
          modal.type === 'detail' ? 'Detail Tendik' :
          modal.type === 'delete' ? 'Hapus Tendik' : 'Import Tendik'
        }
      >
        {/* Create / Edit */}
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nama Lengkap</label>
                <Input value={form.name} onChange={e => updateForm('name', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">NIP</label>
                <Input value={form.nip} onChange={e => updateForm('nip', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jabatan</label>
                <Input value={form.position} onChange={e => updateForm('position', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
                <Input value={form.username} onChange={e => updateForm('username', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <Input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Password {editingId ? '(opsional)' : ''}</label>
                <Input type="password" value={form.password} onChange={e => updateForm('password', e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => updateForm('isActive', e.target.checked)}
              />
              <span className="text-sm text-slate-700">Aktif</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Role</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLE_OPTIONS.map(role => (
                  <label key={role.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleSet.has(role.value)}
                      onChange={() => toggleRole(role.value)}
                    />
                    <span>{role.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={saving}>
                {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Tendik'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && modal.item && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs uppercase text-slate-500">Nama</span>
                <p className="font-semibold">{modal.item.name}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">NIP</span>
                <p className="font-semibold">{modal.item.nip || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Jabatan</span>
                <p className="font-semibold">{modal.item.position || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Username</span>
                <p className="font-semibold">{modal.item.user?.username || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Email</span>
                <p className="font-semibold">{modal.item.user?.email || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Status</span>
                <p className="font-semibold">{modal.item.user?.isActive ? 'Aktif' : 'Nonaktif'}</p>
              </div>
            </div>

            <div>
              <span className="text-xs uppercase text-slate-500">Role</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {modal.item.user?.roles?.length
                  ? modal.item.user.roles.map((role) => (
                    <Badge key={role} variant="success">{ROLE_LABELS[role] || role}</Badge>
                  ))
                  : <Badge variant="default">-</Badge>}
              </div>
            </div>
          </div>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Yakin ingin menghapus tendik <span className="font-semibold">{modal.item.name}</span>?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}

        {modal.type === 'import' && (
          <div className="space-y-6">
            <div className="text-sm text-slate-600">
              Unduh template, isi data tendik, lalu upload kembali.
            </div>

            <Button type="button" variant="secondary" onClick={downloadTemplate} className="w-full">
              Download Template Excel
            </Button>

            <Input
              type="file"
              accept=".xlsx"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="button" onClick={handleImport} className="flex-1" disabled={!importFile}>
                Import Data
              </Button>
              <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
                Batal
              </Button>
            </div>

            {importResult && (
              <Card className="p-4 bg-emerald-50 border-emerald-200">
                <p className="text-emerald-700">Berhasil import {importResult.success} data.</p>
                {importResult.failed?.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700">Gagal: {importResult.failed.length} baris</p>
                )}
              </Card>
            )}
          </div>
        )}

      </Modal>
    </div>
  );
};

export default Tendik;
