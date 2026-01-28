import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const roleOptions = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'kepala_sekolah', label: 'Kepala Sekolah' },
  { value: 'wakasek', label: 'Wakasek' },
  { value: 'staff_tu', label: 'Staff TU' },
  { value: 'guru', label: 'Guru' }
];

const typeOptions = [
  { value: 'guru', label: 'Guru' },
  { value: 'tu', label: 'Staff TU' },
  { value: 'kepala_sekolah', label: 'Kepala Sekolah' },
  { value: 'wakasek', label: 'Wakasek' }
];

const typeRoleMap = {
  guru: ['guru'],
  tu: ['staff_tu'],
  kepala_sekolah: ['kepala_sekolah'],
  wakasek: ['wakasek']
};

const emptyForm = {
  username: '',
  email: '',
  password: '',
  name: '',
  nip: '',
  position: '',
  type: 'guru',
  roles: ['guru'],
  isActive: true
};

const Tendik = () => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);

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

  const handleTypeChange = (value) => {
    const mappedRoles = typeRoleMap[value] || [];
    setForm((prev) => ({
      ...prev,
      type: value,
      roles: prev.roles.length ? prev.roles : mappedRoles
    }));
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
    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      nip: form.nip.trim() || null,
      position: form.position.trim() || null,
      type: form.type,
      roles: form.roles.length ? form.roles : typeRoleMap[form.type],
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
      type: item.type,
      roles: item.user.roles || [],
      isActive: item.user.isActive
    });
  };

  const handleDelete = async (item) => {
    if (!confirm(`Hapus ${item.name}?`)) return;
    try {
      await api.delete(`/tendik/${item.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus data');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Data Tendik</h1>
          <p className="text-sm text-slate-600">Kelola guru dan staff tata usaha beserta akun login.</p>
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
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Tendik' : 'Tambah Tendik'}</h2>
            {editingId && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Mode Edit
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
              Tipe
              <select
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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

          <div className="mt-5 flex items-center gap-3 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => updateForm('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
            />
            <span>Aktif</span>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {roleOptions.map((role) => (
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
                  <div className="text-xs text-slate-500">{item.nip || '-'} • {item.type}</div>
                </div>
                <div className="text-sm text-slate-700">{item.user.username}</div>
                <div className="text-sm text-slate-700">{item.user.roles.join(', ')}</div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {item.user.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
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
      </div>
    </section>
  );
};

export default Tendik;
