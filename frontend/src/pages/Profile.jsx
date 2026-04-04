import { useEffect, useState } from 'react';
import api from '../services/api';
import { ROLE_LABELS } from '../constants/rbac';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import { Camera, User, X } from 'lucide-react';
import { motion } from 'framer-motion';

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
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const assetBase = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');

  const load = async () => {
    setLoading(true);
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
      setPreviewPhoto(null);
      setSelectedFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat profil');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewPhoto(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setSelectedFile(null);
    setPreviewPhoto(null);
  };

  const validateForm = () => {
    if (!form.username.trim() || !form.email.trim()) return 'Username dan email wajib diisi';
    if (!isValidEmail(form.email)) return 'Format email tidak valid';
    if (form.password && form.password.length < 6) return 'Password baru minimal 6 karakter';
    if (form.password && form.password !== form.passwordConfirmation) return 'Konfirmasi password tidak cocok';
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

    const payload = new FormData();
    payload.append('username', form.username.trim());
    payload.append('email', form.email.trim());
    if (form.name) payload.append('name', form.name.trim());
    if (form.nip) payload.append('nip', form.nip.trim());
    if (form.position) payload.append('position', form.position.trim());
    if (form.password) payload.append('password', form.password);
    if (selectedFile) payload.append('avatar', selectedFile);

    setSaving(true);
    try {
      const { data } = await api.put('/users/me', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setProfile(data);
      setMessage('Profil berhasil diperbarui ✅');
      setForm(prev => ({ ...prev, password: '', passwordConfirmation: '' }));
      setPreviewPhoto(null);
      setSelectedFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui profil');
    } finally {
      setSaving(false);
    }
  };

  const avatarUrl = previewPhoto || (profile?.avatarUrl ? `${assetBase}${profile.avatarUrl}` : null);

  return (
    <div className="space-y-10">
      {/* Header Profil */}
      <div className="flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative"
        >
          <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-white shadow-2xl bg-slate-100">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Foto Profil" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-emerald-100 text-emerald-600">
                <User size={64} />
              </div>
            )}
          </div>

          <label className="absolute -bottom-1 -right-1 bg-white rounded-2xl shadow-lg p-3 cursor-pointer hover:bg-emerald-50 transition-all">
            <Camera size={22} className="text-emerald-600" />
            <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </label>

          {previewPhoto && (
            <button
              onClick={removePhoto}
              className="absolute -top-1 -right-1 bg-white text-rose-600 rounded-2xl p-1.5 shadow-md hover:bg-rose-50"
            >
              <X size={18} />
            </button>
          )}
        </motion.div>

        <h1 className="mt-6 text-4xl font-semibold text-slate-900">
          {profile?.tendik?.name || profile?.username || 'Pengguna'}
        </h1>
        <p className="text-slate-500 mt-1">{profile?.email}</p>

        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {profile?.roles?.map((role) => (
            <Badge key={role} variant="success" className="text-xs">
              {ROLE_LABELS[role] || role}
            </Badge>
          ))}
        </div>
      </div>

      {/* Form */}
      <Card className="max-w-2xl mx-auto p-8">
        <h2 className="text-2xl font-semibold mb-8">Perbarui Informasi</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
              <Input value={form.username} onChange={(e) => updateForm('username', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <Input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Nama Lengkap</label>
              <Input value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">NIP</label>
              <Input value={form.nip} onChange={(e) => updateForm('nip', e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Posisi / Jabatan</label>
              <Input value={form.position} onChange={(e) => updateForm('position', e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password Baru (opsional)</label>
              <Input type="password" value={form.password} onChange={(e) => updateForm('password', e.target.value)} placeholder="Minimal 6 karakter" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Konfirmasi Password</label>
              <Input type="password" value={form.passwordConfirmation} onChange={(e) => updateForm('passwordConfirmation', e.target.value)} placeholder="Ulangi password baru" />
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-6 border-t">
            <Button type="button" variant="secondary" onClick={load} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Profile;