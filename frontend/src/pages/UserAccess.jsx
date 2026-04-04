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

const UserAccess = () => {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });

  const load = async (nextPage = page, keyword = search) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/users', {
        params: buildPageParams({
          page: nextPage,
          pageSize: DEFAULT_PAGE_SIZE,
          search: keyword || undefined
        })
      });
      const normalized = normalizePaginatedResponse(data);
      setItems(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data user');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const roleSet = useMemo(() => new Set(form.roles), [form.roles]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleRole = (role) => {
    setForm(prev => {
      const has = prev.roles.includes(role);
      const nextRoles = has
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role];
      return { ...prev, roles: nextRoles };
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const validateForm = () => {
    if (!form.username.trim() || !form.email.trim() || !form.name.trim()) return 'Username, email, dan nama wajib diisi';
    if (!isValidEmail(form.email)) return 'Format email tidak valid';
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

    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, payload);
      } else {
        await api.post('/users', payload);
      }
      setMessage('Data user berhasil disimpan ✅');
      resetForm();
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan user');
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      username: item.username || '',
      email: item.email || '',
      password: '',
      name: item.tendik?.name || '',
      nip: item.tendik?.nip || '',
      position: item.tendik?.position || '',
      roles: normalizeRoles(item.roles),
      isActive: item.isActive
    });
    setModal({ type: 'edit', item });
  };

  const handleDelete = (item) => setModal({ type: 'delete', item });

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/users/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus user');
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

  const handleSearch = (e) => {
    e.preventDefault();
    load(1, search.trim());
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">User & Hak Akses</h1>
          <p className="text-slate-600 mt-1">Kelola akun login, status aktif, dan kombinasi role pengguna</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Tambah User
        </Button>
      </div>

      {error && <Card className="p-4 border-red-200 bg-red-50 text-red-700">{error}</Card>}
      {message && <Card className="p-4 border-emerald-200 bg-emerald-50 text-emerald-700">{message}</Card>}

      {/* Search */}
      <Card className="p-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, username, email, atau NIP..."
            className="flex-1"
          />
          <Button type="submit">Cari</Button>
        </form>
      </Card>

      {/* Daftar User */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar User</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} akun</span>
        </div>

        <div className="space-y-4">
          {items.map(item => (
            <Card key={item.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1.1fr_0.8fr_0.9fr] gap-4 md:items-center">
                <div>
                  <div className="font-semibold text-slate-900">{item.tendik?.name || item.username}</div>
                  <div className="text-xs text-slate-500">{item.email}</div>
                </div>
                <div className="text-sm text-slate-700">{item.username}</div>
                <div className="flex flex-wrap gap-1">
                  {item.roles.map(role => (
                    <Badge key={role} variant="success">{ROLE_LABELS[role] || role}</Badge>
                  ))}
                </div>
                <div>
                  <Badge variant={item.isActive ? 'success' : 'default'}>
                    {item.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <div className="flex gap-2">
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
            <div className="text-center py-12 text-slate-500">Belum ada data user.</div>
          )}
        </div>

        <div className="mt-8 flex justify-center">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={(nextPage) => load(nextPage)}
          />
        </div>
      </Card>

      {/* Modal */}
      <Modal
        isOpen={!!modal.type}
        onClose={closeModal}
        title={
          modal.type === 'create' ? 'Tambah User' :
          modal.type === 'edit' ? 'Edit User' :
          modal.type === 'detail' ? 'Detail User' : 'Hapus User'
        }
      >
        {/* Create & Edit Form */}
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
                <Input value={form.username} onChange={e => updateForm('username', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <Input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nama Lengkap</label>
                <Input value={form.name} onChange={e => updateForm('name', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">NIP</label>
                <Input value={form.nip} onChange={e => updateForm('nip', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Posisi / Jabatan</label>
              <Input value={form.position} onChange={e => updateForm('position', e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password {editingId ? '(kosongkan jika tidak diubah)' : ''}</label>
              <Input type="password" value={form.password} onChange={e => updateForm('password', e.target.value)} />
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" checked={form.isActive} onChange={e => updateForm('isActive', e.target.checked)} />
              <span className="text-sm text-slate-700">Akun aktif</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Role</label>
              <div className="grid grid-cols-2 gap-3">
                {ROLE_OPTIONS.map(role => (
                  <label key={role.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={roleSet.has(role.value)} onChange={() => toggleRole(role.value)} />
                    <span>{role.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah User'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {/* Detail */}
        {modal.type === 'detail' && modal.item && (
          <div className="space-y-6 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-xs uppercase text-slate-500">Nama</span><p className="font-semibold">{modal.item.tendik?.name || modal.item.username}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Username</span><p className="font-semibold">{modal.item.username}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Email</span><p className="font-semibold">{modal.item.email}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Status</span><p className="font-semibold">{modal.item.isActive ? 'Aktif' : 'Nonaktif'}</p></div>
            </div>
            <div>
              <span className="text-xs uppercase text-slate-500">Role</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {modal.item.roles.map(role => (
                  <Badge key={role} variant="success">{ROLE_LABELS[role] || role}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Delete */}
        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">Yakin ingin menghapus user <span className="font-semibold">{modal.item.username}</span>?</p>
            <div className="flex gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserAccess;
