import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { motion } from 'framer-motion';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
      setError(err.response?.data?.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex items-center justify-center p-4">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-2 lg:gap-16 items-center">
        
        {/* Form Section - Kiri */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:order-1"
        >
          <Card className="max-w-md mx-auto p-8 lg:p-10">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-semibold text-slate-900">
                Welcome Back 👋
              </h1>
              <p className="text-slate-600 mt-3 text-lg">
                Hari ini adalah hari baru.<br />
                Ini hari kamu. Kamu yang membentuknya.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email / Username</label>
                <Input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="nama@sekolah.sch.id"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full text-base py-3.5"
                disabled={loading}
              >
                {loading ? 'Sedang masuk...' : 'Masuk'}
              </Button>
            </form>

            <div className="text-center text-xs text-slate-500 mt-8">
              © 2025 SMA 1 Hiliran Gumanti - All Rights Reserved
            </div>
          </Card>
        </motion.div>

        {/* Gambar Besar - Kanan */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden lg:block relative"
        >
          <img
            src="/images/login-hero.jpeg"
            alt="SMA 1 Hiliran Gumanti"
            className="w-full h-full object-cover rounded-3xl shadow-2xl aspect-[4/3]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent rounded-3xl" />
          <div className="absolute bottom-8 left-8 text-white">
            <p className="text-sm font-medium opacity-90">Sistem Informasi Akademik</p>
            <p className="text-3xl font-semibold">SMA 1 Hiliran Gumanti</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;