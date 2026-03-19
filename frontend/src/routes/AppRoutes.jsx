import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import Layout from '../components/Layout';
import { APP_NAV_ITEMS } from '../config/navigation';
import Dashboard from '../pages/Dashboard';
import Login from '../pages/Login';
import Tendik from '../pages/Tendik';
import Siswa from '../pages/Siswa';
import Rombel from '../pages/Rombel';
import Period from '../pages/Period';
import UserAccess from '../pages/UserAccess';
import Profile from '../pages/Profile';
import Mapel from '../pages/Mapel';
import Pengampu from '../pages/Pengampu';
import JamPelajaran from '../pages/JamPelajaran';
import TeacherPreferences from '../pages/TeacherPreferences';
import CatatanSiswa from '../pages/CatatanSiswa';
import Jadwal from '../pages/Jadwal';
import Presensi from '../pages/Presensi';
import Laporan from '../pages/Laporan';
import NotFound from '../pages/NotFound';

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  userAccess: UserAccess,
  tendik: Tendik,
  siswa: Siswa,
  rombel: Rombel,
  period: Period,
  profile: Profile,
  mapel: Mapel,
  pengampu: Pengampu,
  jamPelajaran: JamPelajaran,
  teacherPreferences: TeacherPreferences,
  catatan: CatatanSiswa,
  jadwal: Jadwal,
  presensi: Presensi,
  laporan: Laporan
};

const buildRouteElement = (route) => {
  const Component = PAGE_COMPONENTS[route.pageKey];
  if (!Component) {
    return <NotFound />;
  }

  return (
    <ProtectedRoute roles={route.roles}>
      <Layout>
        <Component {...route.pageProps} />
      </Layout>
    </ProtectedRoute>
  );
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {APP_NAV_ITEMS.map((route) => (
        <Route key={route.key} path={route.path} element={buildRouteElement(route)} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
