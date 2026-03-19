import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  ROLES,
  normalizeRoles
} from '../constants/rbac';

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
  const [modal, setModal] = useState({ type: null, item: null });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async (keyword = '') => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/users', {
        params: keyword ? { search: keyword } : {}
      });
      setItems(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data user');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const roleSet = useMemo(() => new Set(form.roles), [form.roles]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRole = (role) => {
    setForm((prev) => {
      const nextRoles = prev.roles.includes(role)
        ? prev.roles.filter((item) => item !== role)
        : [...prev.roles, role];
      return { ...prev, roles: nextRoles };
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const validateForm = () => {
    if (!form.username.trim() || !form.email.trim() || !form.name.trim()) {
      return 'Username, email, dan nama wajib diisi';
    }
    if (!isValidEmail(form.email.trim())) {
      return 'Format email tidak valid';
    }
    if (!editingId && form.password.trim().length < 6) {
      return 'Password minimal 6 karakter untuk akun baru';
    }
    if (!normalizeRoles(form.roles).length) {
      return 'Minimal satu role harus dipilih';
    }
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      nip: form.nip.trim() || null,
      position: form.position.trim() || null,
      roles: normalizeRoles(form.roles),
      isActive: form.isActive
    };

    if (editingId && !payload.password) {
      delete payload.password;
    }

    setError(null);
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, payload);
      } else {
        await api.post('/users', payload);
      }
      resetForm();
      setModal({ type: null, item: null });
      load(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan user');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (item) => {
    setModal({ type: 'detail', item });
  };

  const openEdit = (item) => {
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

  const openDelete = (item) => {
    setModal({ type: 'delete', item });
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    resetForm();
  };

  const handleDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/users/${modal.item.id}`);
      setModal({ type: null, item: null });
      load(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus user');
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    load(search.trim());
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">User & Hak Akses</h1>
          <p className="text-sm text-slate-600">Kelola akun login, status aktif, dan kombinasi role pengguna.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          type="button"
          onClick={openCreate}
        >
          + Tambah User
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSearch}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, username, email, atau NIP"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
          />
          <button
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
            type="submit"
          >
            Cari
          </button>
        </div>
      </form>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Daftar User</h2>
          <span className="text-xs text-slate-500">{items.length} akun</span>
        </div>
        <div className="mt-5 hidden grid-cols-[1.3fr_1fr_1.1fr_0.8fr_0.9fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Pengguna</div>
          <div>Username</div>
          <div>Role</div>
          <div>Status</div>
          <div>Aksi</div>
        </div>
        <div className="mt-4 grid gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.3fr_1fr_1.1fr_0.8fr_0.9fr] md:items-center"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{item.tendik?.name || item.username}</div>
                <div className="text-xs text-slate-500">{item.email} • {item.tendik?.nip || '-'}</div>
              </div>
              <div className="text-sm text-slate-700">{item.username}</div>
              <div className="text-sm text-slate-700">
                {item.roles.map((role) => ROLE_LABELS[role] || role).join(', ')}
              </div>
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                  {item.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                  type="button"
                  onClick={() => openDetail(item)}
                >
                  Detail
                </button>
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                  type="button"
                  onClick={() => openEdit(item)}
                >
                  Edit
                </button>
                <button
                  className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                  type="button"
                  onClick={() => openDelete(item)}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
          {!items.length && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada data user.
            </div>
          )}
        </div>
      </div>

      {modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <div className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            {modal.type === 'detail' && modal.item && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Detail User</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="text-xs uppercase text-slate-500">Nama</span><div className="font-semibold">{modal.item.tendik?.name || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Username</span><div className="font-semibold">{modal.item.username}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Email</span><div className="font-semibold">{modal.item.email}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">NIP</span><div className="font-semibold">{modal.item.tendik?.nip || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Posisi</span><div className="font-semibold">{modal.item.tendik?.position || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Status</span><div className="font-semibold">{modal.item.isActive ? 'Aktif' : 'Nonaktif'}</div></div>
                  <div className="sm:col-span-2"><span className="text-xs uppercase text-slate-500">Role</span><div className="font-semibold">{modal.item.roles.map((role) => ROLE_LABELS[role] || role).join(', ')}</div></div>
                </div>
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit User' : 'Tambah User'}
                  </h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Username
                    <input
                      value={form.username}
                      onChange={(event) => updateForm('username', event.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => updateForm('email', event.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Password
                    <input
                      type="password"
                      value={form.password}
                      onChange={(event) => updateForm('password', event.target.value)}
                      placeholder={editingId ? 'Kosongkan jika tidak diubah' : 'Minimal 6 karakter'}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Nama
                    <input
                      value={form.name}
                      onChange={(event) => updateForm('name', event.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    NIP
                    <input
                      value={form.nip}
                      onChange={(event) => updateForm('nip', event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Posisi
                    <input
                      value={form.position}
                      onChange={(event) => updateForm('position', event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => updateForm('isActive', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Akun aktif
                  </label>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700">Role</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {ROLE_OPTIONS.map((role) => (
                      <label
                        key={role.value}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                          roleSet.has(role.value)
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={roleSet.has(role.value)}
                          onChange={() => toggleRole(role.value)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        {role.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                    type="button"
                    onClick={closeModal}
                  >
                    Batal
                  </button>
                  <button
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
                    type="submit"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            )}

            {modal.type === 'delete' && modal.item && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Hapus User</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  Hapus akun <span className="font-semibold text-slate-900">{modal.item.username}</span> dari sistem?
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                    type="button"
                    onClick={closeModal}
                  >
                    Batal
                  </button>
                  <button
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                    type="button"
                    onClick={handleDelete}
                  >
                    Hapus
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

export default UserAccess;
