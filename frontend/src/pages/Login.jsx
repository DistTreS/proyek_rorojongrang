import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await api.post('/auth/login', { identifier, password });
      login(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login gagal');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-amber-50">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-10">
        <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="hidden flex-col justify-center gap-6 rounded-3xl border border-white/60 bg-white/70 p-10 shadow-[0_24px_80px_rgba(15,23,42,0.15)] backdrop-blur lg:flex">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100/80 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Sistem Informasi Akademik
            </div>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900">
              SMA 1 Hiliran Gumanti
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-slate-600">
              Kelola data akademik, jadwal, presensi, dan catatan siswa dalam satu platform
              yang modern dan mudah digunakan.
            </p>
            <div className="grid gap-4 text-sm text-slate-700">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Penjadwalan otomatis berbasis CP-SAT + GA
              </div>
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Presensi & laporan terintegrasi
              </div>
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Multi-role: admin, guru, staff TU
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
            <div className="mb-6 space-y-2">
              <h2 className="text-2xl font-semibold text-slate-900">Masuk ke Sistem</h2>
              <p className="text-sm text-slate-600">Gunakan akun yang sudah terdaftar.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Username / Email
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  placeholder="nama@sekolah.sch.id"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                />
              </label>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
                type="submit"
              >
                Masuk
              </button>
            </form>
            <div className="mt-6 text-center text-xs text-slate-500">
              Sistem akan mencatat aktivitas masuk untuk keamanan.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
