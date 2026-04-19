import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { motion } from 'framer-motion';
import Icon from '../components/ui/Icon';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { identifier, password });
      login(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Email / password salah.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 flex w-full flex-col justify-center px-6 py-12 sm:px-10 lg:w-[46%] xl:w-[42%] bg-white"
      >
        <div className="mb-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-emerald-200">
              S
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 leading-none">SMA N 1 Hiliran Gumanti</div>
              <div className="text-xs text-slate-400 mt-0.5">Sistem Informasi Akademik</div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Selamat Datang 👋
          </h1>
          <p className="mt-2 text-slate-500 text-sm leading-relaxed">
            Masuk untuk mengelola data akademik, jadwal,<br className="hidden sm:block" /> dan kehadiran siswa.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Email / Username
            </label>
            <Input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="nama@sekolah.sch.id"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Password
            </label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                autoComplete="current-password"
                required
                className="pr-11"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                aria-label={showPass ? 'Sembunyikan' : 'Tampilkan'}
              >
                <Icon name={showPass ? 'EyeOff' : 'Eye'} size={17} />
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0  }}
              className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700"
            >
              <Icon name="AlertCircle" size={15} className="flex-shrink-0" />
              {error}
            </motion.div>
          )}

          <Button
            id="login-submit"
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-1"
            disabled={loading}
          >
            {loading
              ? <><Icon name="Loader2" size={16} className="animate-spin" /> Sedang masuk…</>
              : 'Masuk ke Sistem'
            }
          </Button>
        </form>

        <p className="mt-10 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} SMA Negeri 1 Hiliran Gumanti · All Rights Reserved
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="hidden lg:flex flex-1 relative overflow-hidden"
        style={{ background: '#0f1629' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/60 via-slate-900/40 to-slate-900/80 z-10" />

        <img
          src="/images/login-hero.jpeg"
          alt="SMA 1 Hiliran Gumanti"
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />

        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl z-10" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-emerald-700/20 blur-2xl z-10" />

        <div className="relative z-20 flex flex-col justify-end p-12 xl:p-16 w-full">
          <div className="mb-8 flex gap-6">
            {[
              { label: 'Siswa', value: '900+' },
              { label: 'Guru & Tendik', value: '80+' },
              { label: 'Rombel', value: '37' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-2xl font-extrabold text-white">{s.value}</p>
                <p className="text-xs text-white/50 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight tracking-tight">
            SMA Negeri 1<br />Hiliran Gumanti
          </h2>
          <p className="mt-3 text-white/60 text-sm max-w-xs leading-relaxed">
            Sistem Informasi Akademik terpadu untuk pengelolaan jadwal, kehadiran, dan laporan.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {['Penjadwalan Otomatis', 'Presensi Digital', 'Laporan Real-time'].map(f => (
              <span key={f} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {f}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
