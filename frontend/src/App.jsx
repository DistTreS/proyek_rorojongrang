import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Tendik from './pages/Tendik';
import Siswa from './pages/Siswa';
import Rombel from './pages/Rombel';
import Period from './pages/Period';
import Mapel from './pages/Mapel';
import Pengampu from './pages/Pengampu';
import JamPelajaran from './pages/JamPelajaran';
import CatatanSiswa from './pages/CatatanSiswa';
import Jadwal from './pages/Jadwal';
import Presensi from './pages/Presensi';
import Laporan from './pages/Laporan';
import NotFound from './pages/NotFound';
import './App.css';

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={(
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/rombel"
            element={(
              <ProtectedRoute roles={["super_admin", "wakasek", "guru", "kepala_sekolah"]}>
                <Layout>
                  <Rombel />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/periode"
            element={(
              <ProtectedRoute roles={["super_admin", "kepala_sekolah"]}>
                <Layout>
                  <Period />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/mapel"
            element={(
              <ProtectedRoute roles={["super_admin", "wakasek"]}>
                <Layout>
                  <Mapel />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/pengampu"
            element={(
              <ProtectedRoute roles={["super_admin", "wakasek"]}>
                <Layout>
                  <Pengampu />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/jam-pelajaran"
            element={(
              <ProtectedRoute roles={["super_admin", "wakasek"]}>
                <Layout>
                  <JamPelajaran />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/catatan"
            element={(
              <ProtectedRoute roles={["super_admin", "staff_tu", "guru", "kepala_sekolah"]}>
                <Layout>
                  <CatatanSiswa />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/siswa"
            element={(
              <ProtectedRoute roles={["super_admin", "kepala_sekolah", "wakasek", "staff_tu", "guru"]}>
                <Layout>
                  <Siswa />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/tendik"
            element={(
              <ProtectedRoute roles={["super_admin", "kepala_sekolah", "staff_tu"]}>
                <Layout>
                  <Tendik />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/jadwal"
            element={(
              <ProtectedRoute roles={["super_admin", "wakasek", "guru", "kepala_sekolah"]}>
                <Layout>
                  <Jadwal />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/presensi"
            element={(
              <ProtectedRoute roles={["super_admin", "guru"]}>
                <Layout>
                  <Presensi />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/laporan"
            element={(
              <ProtectedRoute>
                <Layout>
                  <Laporan />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
