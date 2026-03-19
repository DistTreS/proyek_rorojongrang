import { useEffect, useState } from 'react';
import api from '../services/api';
import { ROLE_LABELS } from '../constants/rbac';

const emptyForm = {
  username: '',
  email: '',
  name: '',
  nip: '',
  position: '',
  password: '',
  passwordConfirmation: ''
};

const isValidEmail = (value) => /\S+@\S+\.\S+/.test(value);

const Profile = () => {
  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/users/me');
      setProfile(data);
      setForm({
        username: data.username || '',
        email: data.email || '',
        name: data.tendik?.name || '',
        nip: data.tendik?.nip || '',
        position: data.tendik?.position || '',
        password: '',
        passwordConfirmation: ''
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat profil');
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

  const validateForm = () => {
    if (!form.username.trim() || !form.email.trim()) {
      return 'Username dan email wajib diisi';
    }
    if (!isValidEmail(form.email.trim())) {
      return 'Format email tidak valid';
    }
    if (form.password && form.password.length < 6) {
      return 'Password baru minimal 6 karakter';
    }
    if (form.password !== form.passwordConfirmation) {
      return 'Konfirmasi password tidak cocok';
    }
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
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
      position: form.position.trim() || null
    };

    if (form.password) {
      payload.password = form.password;
    }

    setSaving(true);
    try {
      const { data } = await api.put('/users/me', payload);
      setProfile(data);
      setForm((prev) => ({
        ...prev,
        password: '',
        passwordConfirmation: ''
      }));
      setMessage('Profil berhasil diperbarui');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui profil');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-slate-900">Profil</h1>
        <p className="text-sm text-slate-600">Kelola informasi akun, data diri, dan password Anda.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Ringkasan Akun</h2>
          {loading && (
            <div className="mt-4 text-sm text-slate-500">Memuat profil...</div>
          )}
          {profile && (
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Nama</div>
                <div className="font-semibold text-slate-900">{profile.tendik?.name || profile.username}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Email</div>
                <div className="font-semibold text-slate-900">{profile.email}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Role</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.roles.map((role) => (
                    <span key={role} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {ROLE_LABELS[role] || role}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
          <h2 className="text-lg font-semibold text-slate-900">Perbarui Profil</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
              Nama
              <input
                value={form.name}
                onChange={(event) => updateForm('name', event.target.value)}
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
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Posisi
              <input
                value={form.position}
                onChange={(event) => updateForm('position', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Password Baru
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateForm('password', event.target.value)}
                placeholder="Opsional"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Konfirmasi Password
              <input
                type="password"
                value={form.passwordConfirmation}
                onChange={(event) => updateForm('passwordConfirmation', event.target.value)}
                placeholder="Ulangi password baru"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Menyimpan...' : 'Simpan Profil'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default Profile;
