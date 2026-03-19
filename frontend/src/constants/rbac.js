export const ROLES = Object.freeze({
  STAFF_TU: 'staff_tu',
  WAKASEK: 'wakasek',
  GURU: 'guru',
  KEPALA_SEKOLAH: 'kepala_sekolah'
});

export const ROLE_LIST = Object.freeze([
  ROLES.STAFF_TU,
  ROLES.WAKASEK,
  ROLES.GURU,
  ROLES.KEPALA_SEKOLAH
]);

export const ADMIN_ROLES = Object.freeze([
  ROLES.STAFF_TU
]);

export const SCHEDULING_MANAGER_ROLES = Object.freeze([
  ROLES.WAKASEK
]);

export const ROLE_PRIORITY = Object.freeze([
  ROLES.KEPALA_SEKOLAH,
  ROLES.WAKASEK,
  ROLES.STAFF_TU,
  ROLES.GURU
]);

export const ROLE_LABELS = Object.freeze({
  [ROLES.STAFF_TU]: 'Staff TU',
  [ROLES.WAKASEK]: 'Wakasek',
  [ROLES.GURU]: 'Guru',
  [ROLES.KEPALA_SEKOLAH]: 'Kepala Sekolah'
});

export const ROLE_OPTIONS = Object.freeze([
  { value: ROLES.KEPALA_SEKOLAH, label: ROLE_LABELS[ROLES.KEPALA_SEKOLAH] },
  { value: ROLES.WAKASEK, label: ROLE_LABELS[ROLES.WAKASEK] },
  { value: ROLES.STAFF_TU, label: ROLE_LABELS[ROLES.STAFF_TU] },
  { value: ROLES.GURU, label: ROLE_LABELS[ROLES.GURU] }
]);

const coerceRolesInput = (input) => {
  if (!input) return [];

  const raw = Array.isArray(input) ? input : String(input).split(/[,;|]/);
  return raw
    .map((role) => String(role).trim().toLowerCase())
    .filter(Boolean);
};

const uniqueRoles = (roles) => [...new Set(roles)];

export const normalizeRoles = (input) => {
  return uniqueRoles(coerceRolesInput(input).filter((role) => ROLE_LIST.includes(role)));
};

export const getPrimaryRole = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  for (const role of ROLE_PRIORITY) {
    if (normalizedRoles.includes(role)) {
      return role;
    }
  }
  return normalizedRoles[0] || null;
};

export const canAccess = (userRoles, allowedRoles = []) => {
  const normalizedUserRoles = normalizeRoles(userRoles);
  const normalizedAllowedRoles = normalizeRoles(allowedRoles);

  if (!normalizedAllowedRoles.length) {
    return true;
  }

  return normalizedUserRoles.some((role) => normalizedAllowedRoles.includes(role));
};
