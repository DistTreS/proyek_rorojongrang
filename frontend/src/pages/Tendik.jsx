import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
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
  pageTitle       = 'Data Tendik',
  pageDescription = 'Kelola guru dan staff tata usaha beserta akun login.'
}) => {
  const [items,        setItems]        = useState([]);
  const [form,         setForm]         = useState(emptyForm);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState(null);
  const [message,      setMessage]      = useState(null);
  const [editingId,    setEditingId]    = useState(null);
  const [modal,        setModal]        = useState({ type: null, item: null });
  const [importFile,   setImportFile]   = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [pagination,   setPagination]   = useState({
    page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 1
  });

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/tendik', {
        params: buildPageParams({ page: nextPage, pageSize: DEFAULT_PAGE_SIZE, search: nextSearch || undefined })
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

  useEffect(() => { load(1); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(1, search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const roleSet = useMemo(() => new Set(form.roles), [form.roles]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleRole = (value) => {
    setForm(prev => {
      const has = prev.roles.includes(value);
      return { ...prev, roles: has ? prev.roles.filter(r => r !== value) : [...prev.roles, value] };
    });
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

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
    if (validationError) { setError(validationError); return; }
    const payload = {
      username: form.username.trim(),
      email:    form.email.trim(),
      name:     form.name.trim(),
      nip:      form.nip.trim() || null,
      position: form.position.trim() || null,
      roles:    normalizeRoles(form.roles),
      isActive: form.isActive
    };
    if (!editingId) payload.password = form.password;
    if (editingId && form.password) payload.password = form.password;
    setSaving(true);
    try {
      if (editingId) await api.put(`/tendik/${editingId}`, payload);
      else           await api.post('/tendik', payload);
      setMessage('Data berhasil disimpan');
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
      email:    item.user.email,
      password: '',
      name:     item.name,
      nip:      item.nip || '',
      position: item.position || '',
      roles:    normalizeRoles(item.user.roles),
      isActive: item.user.isActive
    });
    setModal({ type: 'edit', item });
  };

  const handleDelete         = (item) => setModal({ type: 'delete', item });
  const handleConfirmDelete  = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/tendik/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus data');
    }
  };

  const openCreate  = () => { resetForm(); setModal({ type: 'create' }); };
  const openDetail  = (item) => setModal({ type: 'detail', item });
  const openImport  = () => { setImportFile(null); setImportResult(null); setModal({ type: 'import' }); };
  const closeModal  = () => { setModal({ type: null }); if (modal.type !== 'detail') resetForm(); };

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/tendik/template', { responseType: 'blob' });
      const url  = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url; link.download = 'template-tendik.xlsx'; link.click();
      window.URL.revokeObjectURL(url);
    } catch { setError('Gagal mengunduh template'); }
  };

  const handleImport = async () => {
    if (!importFile) { setError('Pilih file Excel terlebih dahulu'); return; }
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const { data } = await api.post('/tendik/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(data);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal import data');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={openImport}>↑ Import Excel</Button>
          <Button size="sm" onClick={openCreate}>+ Tambah Tendik</Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span className="flex-1">{message}</span>
          <button onClick={() => setMessage(null)} className="text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Daftar Tendik</h2>
            {!loading && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                {pagination.totalItems}
              </span>
            )}
            {loading && <span className="text-xs text-slate-400 animate-pulse">Memuat...</span>}
          </div>
          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Cari nama, NIP, username..."
              className="text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nama &amp; Jabatan</th>
                <th>NIP</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {!items.length && !loading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <span className="text-4xl">👤</span>
                      <span className="text-sm font-medium">Belum ada data tendik</span>
                      <button onClick={openCreate} className="text-xs text-emerald-600 hover:underline">+ Tambah sekarang</button>
                    </div>
                  </td>
                </tr>
              )}
              {items.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-400">{item.position || '-'}</div>
                  </td>
                  <td className="text-slate-600 tabular-nums">{item.nip || '-'}</td>
                  <td className="text-slate-600">{item.user?.username}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {item.user?.roles?.map(role => (
                        <Badge key={role} variant="success" size="xs">{ROLE_LABELS[role] || role}</Badge>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Badge variant={item.user?.isActive ? 'success' : 'default'} size="xs" dot>
                      {item.user?.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button variant="ghost" size="xs" onClick={() => openDetail(item)}>Detail</Button>
                      <Button variant="secondary" size="xs" onClick={() => handleEdit(item)}>Edit</Button>
                      <Button variant="danger" size="xs" onClick={() => handleDelete(item)}>Hapus</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-slate-50 flex justify-center">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={load}
          />
        </div>
      </Card>

      <Modal
        isOpen={!!modal.type}
        onClose={closeModal}
        title={
          modal.type === 'create' ? 'Tambah Tendik Baru' :
          modal.type === 'edit'   ? 'Edit Data Tendik'   :
          modal.type === 'detail' ? 'Detail Tendik'      :
          modal.type === 'delete' ? 'Konfirmasi Hapus'   : 'Import Data Tendik'
        }
      >
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Nama Lengkap', field: 'name',     type: 'text',     req: true  },
                { label: 'NIP',          field: 'nip',      type: 'text',     req: false },
                { label: 'Jabatan',      field: 'position', type: 'text',     req: false },
                { label: 'Username',     field: 'username', type: 'text',     req: true  },
                { label: 'Email',        field: 'email',    type: 'email',    req: true  },
                { label: `Password${editingId ? ' (opsional)' : ''}`, field: 'password', type: 'password', req: !editingId },
              ].map(({ label, field, type, req }) => (
                <div key={field}>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
                  <Input type={type} value={form[field]} onChange={e => updateForm(field, e.target.value)} required={req} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input id="tandik-active" type="checkbox" checked={form.isActive} onChange={e => updateForm('isActive', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <label htmlFor="tandik-active" className="text-sm font-medium text-slate-700">Akun Aktif</label>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLE_OPTIONS.map(role => (
                  <label key={role.value} className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-200 px-3 py-2 hover:border-emerald-300 transition">
                    <input type="checkbox" checked={roleSet.has(role.value)} onChange={() => toggleRole(role.value)} className="h-4 w-4 text-emerald-600 rounded" />
                    <span className="text-sm text-slate-700">{role.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Tendik'}
              </Button>
              <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && modal.item && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {modal.item.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-800 text-lg">{modal.item.name}</p>
                <p className="text-sm text-slate-500">{modal.item.position || 'Tendik'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { label: 'NIP',      value: modal.item.nip || '-' },
                { label: 'Username', value: modal.item.user?.username || '-' },
                { label: 'Email',    value: modal.item.user?.email || '-' },
                { label: 'Status',   value: modal.item.user?.isActive ? 'Aktif' : 'Nonaktif' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">{label}</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Role</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {modal.item.user?.roles?.length
                  ? modal.item.user.roles.map(role => <Badge key={role} variant="success">{ROLE_LABELS[role] || role}</Badge>)
                  : <Badge variant="default">-</Badge>}
              </div>
            </div>
          </div>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-5">
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
              Yakin ingin menghapus tendik <strong>{modal.item.name}</strong>? Tindakan ini tidak dapat dibatalkan.
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Ya, Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}

        {modal.type === 'import' && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">Unduh template Excel, isi data tendik sesuai format, lalu upload kembali.</p>
            <Button type="button" variant="secondary" onClick={downloadTemplate} className="w-full">↓ Download Template Excel</Button>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pilih File (.xlsx)</label>
              <Input type="file" accept=".xlsx" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="button" onClick={handleImport} className="flex-1" disabled={!importFile}>Upload &amp; Import</Button>
              <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
            {importResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                ✅ Berhasil import <strong>{importResult.success}</strong> data.
                {importResult.failed?.length > 0 && (
                  <p className="mt-1 text-amber-700">⚠️ Gagal: {importResult.failed.length} baris</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Tendik;
