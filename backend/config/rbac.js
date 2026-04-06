const ROLES = Object.freeze({
  STAFF_TU: 'staff_tu',
  WAKASEK: 'wakasek',
  GURU: 'guru',
  KEPALA_SEKOLAH: 'kepala_sekolah'
});

const ROLE_LIST = Object.freeze([
  ROLES.STAFF_TU,
  ROLES.WAKASEK,
  ROLES.GURU,
  ROLES.KEPALA_SEKOLAH
]);

const ADMIN_ROLES = Object.freeze([
  ROLES.STAFF_TU
]);

const SCHEDULING_MANAGER_ROLES = Object.freeze([
  ROLES.WAKASEK
]);

const ROLE_LABELS = Object.freeze({
  [ROLES.STAFF_TU]: 'Staff TU',
  [ROLES.WAKASEK]: 'Wakasek',
  [ROLES.GURU]: 'Guru',
  [ROLES.KEPALA_SEKOLAH]: 'Kepala Sekolah'
});

const ROLE_PRIORITY = Object.freeze([
  ROLES.KEPALA_SEKOLAH,
  ROLES.WAKASEK,
  ROLES.STAFF_TU,
  ROLES.GURU
]);

const freezeRoles = (roles) => Object.freeze([...roles]);

const coerceRolesInput = (input) => {
  if (!input) return [];

  const raw = Array.isArray(input) ? input : String(input).split(/[,;|]/);
  return raw
    .map((role) => String(role).trim().toLowerCase())
    .filter(Boolean);
};

const isValidRole = (role) => ROLE_LIST.includes(role);

const uniqueRoles = (roles) => [...new Set(roles)];

const normalizeRoles = (input) => {
  return uniqueRoles(coerceRolesInput(input).filter(isValidRole));
};

const findInvalidRoles = (input) => {
  return uniqueRoles(coerceRolesInput(input).filter((role) => !isValidRole(role)));
};

const getUserRoles = (user) => {
  return normalizeRoles(user?.Roles?.map((role) => role.name));
};

const getPrimaryRole = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  for (const role of ROLE_PRIORITY) {
    if (normalizedRoles.includes(role)) {
      return role;
    }
  }
  return normalizedRoles[0] || null;
};

const hasAnyRole = (userRoles, allowedRoles) => {
  const normalizedUserRoles = normalizeRoles(userRoles);
  const normalizedAllowedRoles = normalizeRoles(allowedRoles);

  if (!normalizedAllowedRoles.length) {
    return true;
  }

  return normalizedUserRoles.some((role) => normalizedAllowedRoles.includes(role));
};

const ACCESS = Object.freeze({
  authenticated: freezeRoles(ROLE_LIST),
  academicPeriod: Object.freeze({
    view: freezeRoles([ROLES.STAFF_TU, ROLES.WAKASEK, ROLES.GURU, ROLES.KEPALA_SEKOLAH]),
    manage: freezeRoles(ADMIN_ROLES)
  }),
  attendance: Object.freeze({
    view: freezeRoles([ROLES.STAFF_TU, ROLES.WAKASEK, ROLES.GURU]),
    manage: freezeRoles([ROLES.GURU])
  }),
  dashboard: Object.freeze({
    view: freezeRoles(ROLE_LIST)
  }),
  reports: Object.freeze({
    view: freezeRoles(ROLE_LIST)
  }),
  rombel: Object.freeze({
    view: freezeRoles([ROLES.STAFF_TU, ROLES.WAKASEK, ROLES.GURU]),
    manage: freezeRoles(SCHEDULING_MANAGER_ROLES)
  }),
  schedule: Object.freeze({
    view: freezeRoles(ROLE_LIST),
    manage: freezeRoles([ROLES.WAKASEK]),
    submit: freezeRoles([ROLES.WAKASEK]),
    approve: freezeRoles([ROLES.KEPALA_SEKOLAH])
  }),
  siswa: Object.freeze({
    view: freezeRoles(ROLE_LIST),
    manage: freezeRoles(ADMIN_ROLES)
  }),
  studentNote: Object.freeze({
    view: freezeRoles(ROLE_LIST),
    manage: freezeRoles(ROLE_LIST)
  }),
  subject: Object.freeze({
    view: freezeRoles(SCHEDULING_MANAGER_ROLES),
    manage: freezeRoles(SCHEDULING_MANAGER_ROLES)
  }),
  teachingAssignment: Object.freeze({
    view: freezeRoles(SCHEDULING_MANAGER_ROLES),
    manage: freezeRoles(SCHEDULING_MANAGER_ROLES)
  }),
  tendik: Object.freeze({
    view: freezeRoles([ROLES.STAFF_TU, ROLES.WAKASEK]),
    manage: freezeRoles(ADMIN_ROLES)
  }),
  timeSlot: Object.freeze({
    view: freezeRoles(SCHEDULING_MANAGER_ROLES),
    manage: freezeRoles(SCHEDULING_MANAGER_ROLES)
  }),
  teacherPreference: Object.freeze({
    view: freezeRoles(SCHEDULING_MANAGER_ROLES),
    manage: freezeRoles(SCHEDULING_MANAGER_ROLES)
  }),
  users: Object.freeze({
    me: freezeRoles(ROLE_LIST),
    admin: freezeRoles(ADMIN_ROLES)
  })
});

module.exports = {
  ACCESS,
  ADMIN_ROLES,
  ROLES,
  ROLE_LABELS,
  ROLE_LIST,
  ROLE_PRIORITY,
  SCHEDULING_MANAGER_ROLES,
  coerceRolesInput,
  findInvalidRoles,
  getPrimaryRole,
  getUserRoles,
  hasAnyRole,
  isValidRole,
  normalizeRoles
};
