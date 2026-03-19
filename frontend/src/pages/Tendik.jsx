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

const Tendik = ({
  pageTitle = 'Data Tendik',
  pageDescription = 'Kelola guru dan staff tata usaha beserta akun login.'
}) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/tendik');
      setItems(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data tendik');
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

  const toggleRole = (value) => {
    setForm((prev) => {
      const has = prev.roles.includes(value);
      const nextRoles = has
        ? prev.roles.filter((role) => role !== value)
        : [...prev.roles, value];
      return { ...prev, roles: nextRoles };
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.username.trim() || !form.email.trim() || !form.name.trim()) {
      setError('Username, email, dan nama wajib diisi');
      return;
    }

    if (!isValidEmail(form.email.trim())) {
      setError('Format email tidak valid');
      return;
    }

    if (!editingId && form.password.trim().length < 6) {
      setError('Password minimal 6 karakter untuk akun baru');
      return;
    }

    if (!normalizeRoles(form.roles).length) {
      setError('Minimal satu role harus dipilih');
      return;
    }

    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      nip: form.nip.trim() || null,
      position: form.position.trim() || null,
      roles: normalizeRoles(form.roles).length
        ? normalizeRoles(form.roles)
        : [ROLES.GURU],
      isActive: form.isActive
    };

    if (!editingId && !payload.password) {
      setError('Password wajib untuk akun baru');
      return;
    }

    if (editingId && !payload.password) {
      delete payload.password;
    }

    try {
      if (editingId) {
        await api.put(`/tendik/${editingId}`, payload);
      } else {
        await api.post('/tendik', payload);
      }
      resetForm();
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan data');
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

  const handleDelete = async (item) => {
    setModal({ type: 'delete', item });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/tendik/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus data');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (item) => {
    setModal({ type: 'detail', item });
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
  };

  const openImport = () => {
    setImportFile(null);
    setImportResult(null);
    setModal({ type: 'import', item: null });
  };

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/tendik/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'template-tendik.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunduh template');
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setError('Pilih file Excel terlebih dahulu');
      return;
    }
    setError(null);
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
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="text-sm text-slate-600">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700"
            type="button"
            onClick={openImport}
          >
            Import Excel
          </button>
          <button
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
            type="button"
            onClick={openCreate}
          >
            + Tambah Tendik
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Tendik</h2>
            <span className="text-xs text-slate-500">{items.length} orang</span>
          </div>
          <div className="mt-5 hidden grid-cols-[1.6fr_1fr_1.1fr_0.7fr_0.9fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Nama</div>
            <div>Username</div>
            <div>Role</div>
            <div>Status</div>
            <div>Aksi</div>
          </div>
          <div className="mt-4 grid gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.6fr_1fr_1.1fr_0.7fr_0.9fr] md:items-center"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                <div className="text-xs text-slate-500">{item.nip || '-'} • {item.user.primaryRoleLabel || '-'}</div>
                </div>
                <div className="text-sm text-slate-700">{item.user.username}</div>
                <div className="text-sm text-slate-700">{item.user.roles.map((role) => ROLE_LABELS[role] || role).join(', ')}</div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {item.user.isActive ? 'Aktif' : 'Nonaktif'}
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
                    onClick={() => handleEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => handleDelete(item)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
            {!items.length && !loading && (
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
                  <h3 className="text-lg font-semibold text-slate-900">Detail Tendik</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="text-xs uppercase text-slate-500">Nama</span><div className="font-semibold">{modal.item.name}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">NIP</span><div className="font-semibold">{modal.item.nip || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Jabatan</span><div className="font-semibold">{modal.item.position || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Role Utama</span><div className="font-semibold">{modal.item.user.primaryRoleLabel || '-'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Username</span><div className="font-semibold">{modal.item.user.username}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Email</span><div className="font-semibold">{modal.item.user.email}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Status</span><div className="font-semibold">{modal.item.user.isActive ? 'Aktif' : 'Nonaktif'}</div></div>
                  <div><span className="text-xs uppercase text-slate-500">Role</span><div className="font-semibold">{modal.item.user.roles.join(', ')}</div></div>
                </div>
              </div>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.type === 'edit' ? 'Edit Tendik' : 'Tambah Tendik'}
                  </h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
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
                    NIP
                    <input
                      value={form.nip}
                      onChange={(e) => updateForm('nip', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Jabatan
                    <input
                      value={form.position}
                      onChange={(e) => updateForm('position', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Username
                    <input
                      value={form.username}
                      onChange={(e) => updateForm('username', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Password {editingId ? '(opsional)' : ''}
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => updateForm('password', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateForm('isActive', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                  />
                  <span>Aktif</span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {ROLE_OPTIONS.map((role) => (
                      <label key={role.value} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={roleSet.has(role.value)}
                          onChange={() => toggleRole(role.value)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                        />
                        {role.label}
                      </label>
                    ))}
                  </div>
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

            {modal.type === 'import' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Import Tendik</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Unduh template terlebih dahulu, isi data, lalu unggah kembali.
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={downloadTemplate}
                  >
                    Download Template
                  </button>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
                    type="button"
                    onClick={handleImport}
                  >
                    Import
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={closeModal}
                  >
                    Batal
                  </button>
                </div>
                {importResult && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
                    Berhasil: {importResult.success} data.
                    {importResult.failed?.length ? (
                      <div className="mt-2 text-xs text-emerald-700">
                        Gagal: {importResult.failed.length} baris.
                      </div>
                    ) : null}
                  </div>
                )}
                {importResult?.failed?.length ? (
                  <div className="max-h-40 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                    {importResult.failed.map((item, idx) => (
                      <div key={`${item.row}-${idx}`}>Baris {item.row}: {item.message}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {modal.type === 'delete' && modal.item && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Hapus Tendik</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  Yakin ingin menghapus <span className="font-semibold">{modal.item.name}</span>? Data akun akan ikut terhapus.
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

export default Tendik;
