import {
  ADMIN_ROLES,
  ROLE_LABELS,
  ROLE_LIST,
  ROLES,
  SCHEDULING_MANAGER_ROLES,
  canAccess,
  getPrimaryRole
} from '../constants/rbac';

export const NAV_SECTIONS = Object.freeze({
  overview: 'Ringkasan',
  operational: 'Operasional',
  academic: 'Akademik',
  scheduling: 'Penjadwalan',
  account: 'Akun'
});

export const ROLE_DASHBOARD_COPY = Object.freeze({
  [ROLES.STAFF_TU]: {
    title: 'Operasional Administrasi',
    description: 'Fokus utama Anda adalah mengelola tendik dan akun, data siswa, periode akademik, serta pelaporan akademik.'
  },
  [ROLES.WAKASEK]: {
    title: 'Koordinasi Akademik',
    description: 'Fokus utama Anda adalah menyiapkan struktur akademik, preferensi penjadwalan, dan proses pengajuan jadwal.'
  },
  [ROLES.GURU]: {
    title: 'Operasional Pembelajaran',
    description: 'Fokus utama Anda adalah presensi, catatan siswa, jadwal mengajar resmi, serta pemantauan siswa dan rombel yang Anda ampu.'
  },
  [ROLES.KEPALA_SEKOLAH]: {
    title: 'Pengesahan Akademik',
    description: 'Fokus utama Anda adalah meninjau laporan, memeriksa jadwal yang diajukan, dan memberi keputusan final.'
  }
});

export const APP_NAV_ITEMS = Object.freeze([
  {
    key: 'dashboard',
    path: '/',
    label: 'Dashboard',
    section: 'overview',
    roles: ROLE_LIST,
    pageKey: 'dashboard',
    showInNav: true,
    summary: 'Ringkasan akses dan status sistem.'
  },
  {
    key: 'user-access',
    path: '/user-akses',
    label: 'Manajemen Akun',
    section: 'operational',
    roles: ADMIN_ROLES,
    pageKey: 'userAccess',
    showInNav: false,
    summary: 'Kelola akun login dan role pengguna.',
  },
  {
    key: 'students',
    path: '/siswa',
    label: 'Data Siswa',
    labelByRole: {
      [ROLES.GURU]: 'Daftar Siswa'
    },
    section: 'operational',
    roles: [...ADMIN_ROLES, ROLES.GURU],
    pageKey: 'siswa',
    showInNav: true,
    summary: 'Kelola atau lihat daftar siswa.',
    summaryByRole: {
      [ROLES.GURU]: 'Lihat daftar siswa pada rombel yang Anda ampu.'
    }
  },
  {
    key: 'tendik',
    path: '/tendik',
    label: 'Tendik & Akun',
    section: 'operational',
    roles: ADMIN_ROLES,
    pageKey: 'tendik',
    showInNav: true,
    summary: 'Kelola data tendik, akun login, role, dan import data.',
    pageProps: {
      pageTitle: 'Tendik & Akun',
      pageDescription: 'Kelola guru dan staff tata usaha beserta akun login, role, dan import data.'
    }
  },
  {
    key: 'period',
    path: '/periode',
    label: 'Periode Akademik',
    section: 'operational',
    roles: ADMIN_ROLES,
    pageKey: 'period',
    showInNav: true,
    summary: 'Kelola periode akademik aktif.'
  },
  {
    key: 'rombel',
    path: '/rombel',
    label: 'Rombel',
    labelByRole: {
      [ROLES.GURU]: 'Daftar Rombel'
    },
    section: 'academic',
    roles: [...SCHEDULING_MANAGER_ROLES, ROLES.GURU],
    pageKey: 'rombel',
    showInNav: true,
    summary: 'Kelola atau lihat struktur rombel.',
    summaryByRole: {
      [ROLES.GURU]: 'Lihat rombel yang terkait dengan pengampu Anda.'
    }
  },
  {
    key: 'subject',
    path: '/mapel',
    label: 'Mata Pelajaran',
    section: 'academic',
    roles: SCHEDULING_MANAGER_ROLES,
    pageKey: 'mapel',
    showInNav: true,
    summary: 'Kelola data mata pelajaran.'
  },
  {
    key: 'teaching-assignment',
    path: '/pengampu',
    label: 'Pengampu & Jam Mingguan',
    section: 'academic',
    roles: SCHEDULING_MANAGER_ROLES,
    pageKey: 'pengampu',
    showInNav: true,
    summary: 'Atur pengampu mapel dan kebutuhan jam mingguan.'
  },
  {
    key: 'timeslot',
    path: '/jam-pelajaran',
    label: 'Jam Pelajaran',
    section: 'academic',
    roles: SCHEDULING_MANAGER_ROLES,
    pageKey: 'jamPelajaran',
    showInNav: true,
    summary: 'Kelola slot waktu pembelajaran.'
  },
  {
    key: 'schedule-preferences',
    path: '/preferensi-penjadwalan',
    label: 'Preferensi Penjadwalan',
    section: 'scheduling',
    roles: SCHEDULING_MANAGER_ROLES,
    pageKey: 'teacherPreferences',
    showInNav: true,
    summary: 'Siapkan aturan dan preferensi sebelum generate jadwal.',
  },
  {
    key: 'schedule',
    path: '/jadwal',
    label: 'Generate Jadwal',
    labelByRole: {
      [ROLES.GURU]: 'Lihat Jadwal'
    },
    section: 'scheduling',
    roles: [ROLES.WAKASEK, ROLES.GURU],
    pageKey: 'jadwal',
    showInNav: true,
    summary: 'Generate atau lihat jadwal pelajaran mingguan.',
    pageProps: {
      pageTitle: 'Jadwal Pelajaran',
      pageDescription: 'Generate otomatis dengan CP-SAT + GA dan lihat jadwal mingguan.'
    },
    summaryByRole: {
      [ROLES.GURU]: 'Lihat jadwal mengajar resmi yang sudah disetujui.'
    }
  },
  {
    key: 'schedule-submission',
    path: '/ajukan-jadwal',
    label: 'Ajukan Jadwal',
    section: 'scheduling',
    roles: [ROLES.WAKASEK],
    pageKey: 'jadwal',
    showInNav: true,
    summary: 'Ajukan hasil jadwal untuk pengesahan kepala sekolah.',
    pageProps: {
      pageTitle: 'Ajukan Jadwal untuk Pengesahan',
      pageDescription: 'Pilih batch draft atau rejected, lalu ajukan kembali ke kepala sekolah.',
      canGenerate: false,
      canSubmit: true,
      batchStatusFilter: 'submittable'
    }
  },
  {
    key: 'attendance',
    path: '/presensi',
    label: 'Input Presensi',
    section: 'operational',
    roles: [ROLES.GURU],
    pageKey: 'presensi',
    showInNav: true,
    summary: 'Input presensi berdasarkan jadwal mengajar resmi.'
  },
  {
    key: 'student-notes',
    path: '/catatan',
    label: 'Catatan Siswa',
    section: 'operational',
    roles: [ROLES.GURU],
    pageKey: 'catatan',
    showInNav: true,
    summary: 'Kelola catatan prestasi dan masalah siswa.'
  },
  {
    key: 'reports',
    path: '/laporan',
    label: 'Laporan',
    section: 'overview',
    roles: ROLE_LIST,
    pageKey: 'laporan',
    showInNav: true,
    summary: 'Akses laporan akademik dan presensi.'
  },
  {
    key: 'submitted-schedule',
    path: '/jadwal-diajukan',
    label: 'Jadwal Diajukan',
    section: 'scheduling',
    roles: [ROLES.KEPALA_SEKOLAH],
    pageKey: 'jadwal',
    showInNav: true,
    summary: 'Tinjau jadwal yang sudah diajukan.',
    pageProps: {
      pageTitle: 'Jadwal yang Diajukan',
      pageDescription: 'Tinjau jadwal yang sudah diajukan oleh wakasek sebelum memberi keputusan.',
      canGenerate: false,
      canApprove: true,
      batchStatusFilter: 'submitted'
    }
  },
  {
    key: 'schedule-approval',
    path: '/pengesahan-jadwal',
    label: 'Setujui / Tolak Jadwal',
    section: 'scheduling',
    roles: [ROLES.KEPALA_SEKOLAH],
    pageKey: 'jadwal',
    showInNav: false,
    summary: 'Berikan keputusan final terhadap jadwal yang diajukan.',
    pageProps: {
      pageTitle: 'Pengesahan Jadwal',
      pageDescription: 'Setujui atau tolak batch jadwal yang diajukan wakasek.',
      canGenerate: false,
      canApprove: true,
      batchStatusFilter: 'submitted'
    }
  },
  {
    key: 'profile',
    path: '/profil',
    label: 'Profil',
    section: 'account',
    roles: ROLE_LIST,
    pageKey: 'profile',
    showInNav: true,
    summary: 'Kelola profil pengguna.'
  }
]);

const resolveItemLabel = (item, userRoles) => {
  const primaryRole = getPrimaryRole(userRoles);
  if (primaryRole && item.labelByRole?.[primaryRole]) {
    return item.labelByRole[primaryRole];
  }
  return item.label;
};

const resolveItemSummary = (item, userRoles) => {
  const primaryRole = getPrimaryRole(userRoles);
  if (primaryRole && item.summaryByRole?.[primaryRole]) {
    return item.summaryByRole[primaryRole];
  }
  return item.summary;
};

export const getVisibleNavItems = (userRoles) => {
  return APP_NAV_ITEMS
    .filter((item) => item.showInNav && canAccess(userRoles, item.roles))
    .map((item) => ({
      ...item,
      resolvedLabel: resolveItemLabel(item, userRoles),
      summary: resolveItemSummary(item, userRoles)
    }));
};

export const getVisibleNavSections = (userRoles) => {
  const grouped = new Map();

  getVisibleNavItems(userRoles).forEach((item) => {
    const sectionLabel = NAV_SECTIONS[item.section] || item.section;
    if (!grouped.has(item.section)) {
      grouped.set(item.section, {
        key: item.section,
        label: sectionLabel,
        items: []
      });
    }
    grouped.get(item.section).items.push(item);
  });

  return Array.from(grouped.values());
};

export const getRoleSummary = (userRoles) => {
  const primaryRole = getPrimaryRole(userRoles);
  return {
    primaryRole,
    primaryRoleLabel: primaryRole ? ROLE_LABELS[primaryRole] : 'Pengguna',
    focus: primaryRole ? ROLE_DASHBOARD_COPY[primaryRole] : null
  };
};
