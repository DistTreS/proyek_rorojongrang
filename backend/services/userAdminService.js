const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Role, Tendik, sequelize } = require('../models');
const { paginateItems, parsePagination } = require('../utils/pagination');
const {
  ROLE_LABELS,
  ROLES,
  findInvalidRoles,
  getPrimaryRole,
  getUserRoles,
  normalizeRoles
} = require('../config/rbac');
const { serviceError } = require('../utils/serviceError');

const DEFAULT_AVATAR_URL = '/uploads/avatars/default-avatar.svg';

const resolveRoles = (roles) => {
  const normalizedRoles = normalizeRoles(roles);
  if (normalizedRoles.length) {
    return normalizedRoles;
  }
  return [ROLES.GURU];
};

const formatUserRecord = (user) => {
  const roles = getUserRoles(user);
  const primaryRole = getPrimaryRole(roles);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl || DEFAULT_AVATAR_URL,
    isActive: user.isActive,
    roles,
    primaryRole,
    primaryRoleLabel: primaryRole ? ROLE_LABELS[primaryRole] : null,
    tendik: user.Tendik ? {
      id: user.Tendik.id,
      name: user.Tendik.name,
      nip: user.Tendik.nip,
      position: user.Tendik.position
    } : null
  };
};

const ensureRolesExist = async (roles) => {
  const invalidRoles = findInvalidRoles(roles);
  if (invalidRoles.length) {
    throw serviceError(400, `Role tidak valid: ${invalidRoles.join(', ')}`);
  }

  const roleNames = resolveRoles(roles);
  const roleRows = await Role.findAll({ where: { name: roleNames } });
  if (roleRows.length !== roleNames.length) {
    throw serviceError(400, 'Role tidak ditemukan');
  }

  return { roleNames, roleRows };
};

const ensureUniqueIdentity = async ({ username, email, excludeUserId }) => {
  const conditions = [];
  if (username) conditions.push({ username });
  if (email) conditions.push({ email });
  if (!conditions.length) return;

  const where = { [Op.or]: conditions };
  if (excludeUserId) {
    where.id = { [Op.ne]: excludeUserId };
  }

  const existing = await User.findOne({ where });
  if (existing) {
    throw serviceError(409, 'Username atau email sudah digunakan');
  }
};

const ensureUniqueNip = async ({ nip, excludeTendikId }) => {
  if (!nip) return;
  const where = { nip };
  if (excludeTendikId) {
    where.id = { [Op.ne]: excludeTendikId };
  }
  const existing = await Tendik.findOne({ where });
  if (existing) {
    throw serviceError(409, 'NIP sudah terdaftar');
  }
};

const loadUserWithRelations = async (id) => {
  return User.findByPk(id, {
    include: [{ model: Role }, { model: Tendik }]
  });
};

const listAdminUsers = async (query = {}) => {
  const pagination = parsePagination(query);
  const { search } = query;
  const users = await User.findAll({
    include: [{ model: Role }, { model: Tendik }],
    order: [['username', 'ASC']]
  });

  const keyword = search ? String(search).toLowerCase() : '';
  const filtered = keyword
    ? users.filter((user) => (
      user.username?.toLowerCase().includes(keyword) ||
      user.email?.toLowerCase().includes(keyword) ||
      user.Tendik?.name?.toLowerCase().includes(keyword) ||
      user.Tendik?.nip?.toLowerCase().includes(keyword)
    ))
    : users;

  return paginateItems(filtered.map(formatUserRecord), pagination);
};

const getAdminUserDetail = async (id) => {
  const user = await loadUserWithRelations(id);
  if (!user) {
    throw serviceError(404, 'User tidak ditemukan');
  }
  return formatUserRecord(user);
};

const createAdminUser = async (payload) => {
  const username = String(payload.username || '').trim();
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '');
  const name = String(payload.name || '').trim();
  const nip = String(payload.nip || '').trim();
  const position = String(payload.position || '').trim();

  if (!username || !email || !password || !name) {
    throw serviceError(400, 'Field wajib belum lengkap');
  }

  await ensureUniqueIdentity({ username, email });
  await ensureUniqueNip({ nip: nip || null });
  const { roleRows } = await ensureRolesExist(payload.roles);

  const transaction = await sequelize.transaction();
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      passwordHash: hash,
      avatarUrl: payload.avatarUrl ? String(payload.avatarUrl) : null,
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true
    }, { transaction });

    await Tendik.create({
      userId: user.id,
      name,
      nip: nip || null,
      position: position || null
    }, { transaction });

    await user.setRoles(roleRows, { transaction });
    await transaction.commit();
    return getAdminUserDetail(user.id);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal membuat user');
  }
};

const updateAdminUser = async (id, payload) => {
  const user = await loadUserWithRelations(id);
  if (!user) {
    throw serviceError(404, 'User tidak ditemukan');
  }

  const username = payload.username !== undefined ? String(payload.username || '').trim() : user.username;
  const email = payload.email !== undefined ? String(payload.email || '').trim() : user.email;
  const nip = payload.nip !== undefined ? String(payload.nip || '').trim() : (user.Tendik?.nip || '');

  await ensureUniqueIdentity({ username, email, excludeUserId: user.id });
  await ensureUniqueNip({ nip: nip || null, excludeTendikId: user.Tendik?.id });

  const transaction = await sequelize.transaction();
  try {
    if (payload.username !== undefined) user.username = username;
    if (payload.email !== undefined) user.email = email;
    if (typeof payload.isActive === 'boolean') user.isActive = payload.isActive;
    if (payload.avatarUrl !== undefined) user.avatarUrl = payload.avatarUrl ? String(payload.avatarUrl) : null;
    if (payload.password) {
      user.passwordHash = await bcrypt.hash(String(payload.password), 10);
    }
    await user.save({ transaction });

    if (user.Tendik) {
      if (payload.name !== undefined) user.Tendik.name = String(payload.name || '').trim();
      if (payload.nip !== undefined) user.Tendik.nip = nip || null;
      if (payload.position !== undefined) user.Tendik.position = String(payload.position || '').trim() || null;
      await user.Tendik.save({ transaction });
    }

    if (payload.roles !== undefined) {
      const { roleRows } = await ensureRolesExist(payload.roles);
      await user.setRoles(roleRows, { transaction });
    }

    await transaction.commit();
    return getAdminUserDetail(id);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal memperbarui user');
  }
};

const deleteAdminUser = async (id) => {
  const user = await loadUserWithRelations(id);
  if (!user) {
    throw serviceError(404, 'User tidak ditemukan');
  }

  const transaction = await sequelize.transaction();
  try {
    if (user.Tendik) {
      await user.Tendik.destroy({ transaction });
    }
    await user.destroy({ transaction });
    await transaction.commit();
    return { message: 'User dihapus' };
  } catch (err) {
    await transaction.rollback();
    throw serviceError(500, 'Gagal menghapus user');
  }
};

const getMyProfile = async (id) => {
  const user = await loadUserWithRelations(id);
  if (!user) {
    throw serviceError(404, 'User tidak ditemukan');
  }
  return formatUserRecord(user);
};

const updateMyProfile = async (id, payload) => {
  const user = await loadUserWithRelations(id);
  if (!user) {
    throw serviceError(404, 'User tidak ditemukan');
  }

  const username = payload.username !== undefined ? String(payload.username || '').trim() : user.username;
  const email = payload.email !== undefined ? String(payload.email || '').trim() : user.email;
  const nip = payload.nip !== undefined ? String(payload.nip || '').trim() : (user.Tendik?.nip || '');

  if (!username || !email) {
    throw serviceError(400, 'Username dan email wajib diisi');
  }

  await ensureUniqueIdentity({ username, email, excludeUserId: user.id });
  await ensureUniqueNip({ nip: nip || null, excludeTendikId: user.Tendik?.id });

  const transaction = await sequelize.transaction();
  try {
    user.username = username;
    user.email = email;
    if (payload.avatarUrl !== undefined) {
      user.avatarUrl = payload.avatarUrl ? String(payload.avatarUrl) : null;
    }
    if (payload.password) {
      user.passwordHash = await bcrypt.hash(String(payload.password), 10);
    }
    await user.save({ transaction });

    if (user.Tendik) {
      if (payload.name !== undefined) user.Tendik.name = String(payload.name || '').trim();
      if (payload.nip !== undefined) user.Tendik.nip = nip || null;
      if (payload.position !== undefined) user.Tendik.position = String(payload.position || '').trim() || null;
      await user.Tendik.save({ transaction });
    }

    await transaction.commit();
    return getMyProfile(id);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal memperbarui profil');
  }
};

module.exports = {
  createAdminUser,
  deleteAdminUser,
  getAdminUserDetail,
  getMyProfile,
  listAdminUsers,
  updateAdminUser,
  updateMyProfile
};
