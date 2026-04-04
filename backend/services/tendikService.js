const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { sequelize, User, Role, Tendik } = require('../models');
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

const resolveRoles = (roles) => {
  const normalizedRoles = normalizeRoles(roles);
  if (normalizedRoles.length) {
    return normalizedRoles;
  }
  return [ROLES.GURU];
};

const parseRoles = (value) => resolveRoles(value);

const normalizeRow = (row) => {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    normalized[key.trim().toLowerCase()] = row[key];
  });
  return normalized;
};

const createTemplate = () => {
  const rows = [
    {
      username: 'guru01',
      email: 'guru01@sman1.sch.id',
      password: 'password123',
      name: 'Budi Santoso',
      roles: 'guru',
      nip: '198701012020011001',
      position: 'Guru Bahasa Indonesia'
    }
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ['username', 'email', 'password', 'name', 'roles', 'nip', 'position']
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'tendik');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const formatTendik = (item) => {
  const roles = getUserRoles(item.User);
  const primaryRole = getPrimaryRole(roles);
  return {
    id: item.id,
    name: item.name,
    nip: item.nip,
    position: item.position,
    user: {
      id: item.User?.id,
      username: item.User?.username,
      email: item.User?.email,
      isActive: item.User?.isActive,
      roles,
      primaryRole,
      primaryRoleLabel: primaryRole ? ROLE_LABELS[primaryRole] : null
    }
  };
};

const ensureRolesExist = async (roles) => {
  const roleNames = resolveRoles(roles);
  const invalidRoles = findInvalidRoles(roles);
  if (invalidRoles.length) {
    throw serviceError(400, `Role tidak valid: ${invalidRoles.join(', ')}`);
  }

  const roleRows = await Role.findAll({ where: { name: roleNames } });
  if (roleRows.length !== roleNames.length) {
    throw serviceError(400, 'Role tidak ditemukan');
  }

  return { roleNames, roleRows };
};

const ensureUniqueUserIdentity = async ({ username, email, excludeUserId }) => {
  const orConditions = [];
  if (username) orConditions.push({ username });
  if (email) orConditions.push({ email });
  if (!orConditions.length) return;

  const where = { [Op.or]: orConditions };
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

const listTendik = async (query = {}) => {
  const pagination = parsePagination(query);
  const { search } = query;
  const tendik = await Tendik.findAll({
    include: [
      {
        model: User,
        attributes: { exclude: ['passwordHash'] },
        include: [{ model: Role }]
      }
    ],
    order: [['name', 'ASC']]
  });

  const keyword = search ? String(search).toLowerCase() : '';
  const filtered = keyword
    ? tendik.filter((item) => (
      item.name.toLowerCase().includes(keyword) ||
      (item.nip && item.nip.toLowerCase().includes(keyword)) ||
      item.User?.username?.toLowerCase().includes(keyword) ||
      item.User?.email?.toLowerCase().includes(keyword)
    ))
    : tendik;

  return paginateItems(filtered.map(formatTendik), pagination);
};

const getTendikDetail = async (id) => {
  const tendik = await Tendik.findByPk(id, {
    include: [
      {
        model: User,
        attributes: { exclude: ['passwordHash'] },
        include: [{ model: Role }]
      }
    ]
  });

  if (!tendik) {
    throw serviceError(404, 'Tendik tidak ditemukan');
  }

  return formatTendik(tendik);
};

const createTendik = async (payload) => {
  const username = String(payload.username || '').trim();
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '');
  const name = String(payload.name || '').trim();
  const nip = String(payload.nip || '').trim();
  const position = String(payload.position || '').trim();

  if (!username || !email || !password || !name) {
    throw serviceError(400, 'Field wajib belum lengkap');
  }

  await ensureUniqueUserIdentity({ username, email });
  await ensureUniqueNip({ nip: nip || null });
  const { roleNames, roleRows } = await ensureRolesExist(payload.roles);

  const transaction = await sequelize.transaction();
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      passwordHash: hash,
      isActive: true
    }, { transaction });

    const tendik = await Tendik.create({
      userId: user.id,
      name,
      nip: nip || null,
      position: position || null
    }, { transaction });

    await user.setRoles(roleRows, { transaction });
    await transaction.commit();

    return {
      id: tendik.id,
      name: tendik.name,
      nip: tendik.nip,
      position: tendik.position,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isActive: user.isActive,
        roles: roleRows.map((role) => role.name),
        primaryRole: getPrimaryRole(roleNames),
        primaryRoleLabel: ROLE_LABELS[getPrimaryRole(roleNames)] || null
      }
    };
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal membuat tendik');
  }
};

const updateTendik = async (id, payload) => {
  const tendik = await Tendik.findByPk(id, {
    include: [{ model: User, include: [{ model: Role }] }]
  });

  if (!tendik) {
    throw serviceError(404, 'Tendik tidak ditemukan');
  }

  const username = payload.username !== undefined ? String(payload.username || '').trim() : tendik.User.username;
  const email = payload.email !== undefined ? String(payload.email || '').trim() : tendik.User.email;
  const nip = payload.nip !== undefined ? String(payload.nip || '').trim() : (tendik.nip || '');

  await ensureUniqueUserIdentity({
    username,
    email,
    excludeUserId: tendik.User.id
  });
  await ensureUniqueNip({
    nip: nip || null,
    excludeTendikId: tendik.id
  });

  const transaction = await sequelize.transaction();
  try {
    if (payload.name !== undefined) tendik.name = String(payload.name || '').trim();
    if (payload.nip !== undefined) tendik.nip = nip || null;
    if (payload.position !== undefined) tendik.position = String(payload.position || '').trim() || null;
    await tendik.save({ transaction });

    const user = tendik.User;
    if (payload.username !== undefined) user.username = username;
    if (payload.email !== undefined) user.email = email;
    if (typeof payload.isActive === 'boolean') user.isActive = payload.isActive;
    if (payload.password) {
      user.passwordHash = await bcrypt.hash(String(payload.password), 10);
    }
    await user.save({ transaction });

    if (payload.roles !== undefined) {
      const { roleRows } = await ensureRolesExist(payload.roles);
      await user.setRoles(roleRows, { transaction });
    }

    await transaction.commit();

    return getTendikDetail(id);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal memperbarui tendik');
  }
};

const deleteTendik = async (id) => {
  const tendik = await Tendik.findByPk(id, { include: [{ model: User }] });
  if (!tendik) {
    throw serviceError(404, 'Tendik tidak ditemukan');
  }

  const transaction = await sequelize.transaction();
  try {
    await tendik.destroy({ transaction });
    if (tendik.User) {
      await tendik.User.destroy({ transaction });
    }
    await transaction.commit();
    return { message: 'Tendik dihapus' };
  } catch (err) {
    await transaction.rollback();
    throw serviceError(500, 'Gagal menghapus tendik');
  }
};

const importTendik = async (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) {
    throw serviceError(400, 'File kosong');
  }

  const roleRows = await Role.findAll();
  const roleMap = new Map(roleRows.map((role) => [role.name, role]));
  let success = 0;
  const failed = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = normalizeRow(rows[i]);
    const username = String(row.username || '').trim();
    const email = String(row.email || '').trim();
    const password = String(row.password || '').trim();
    const name = String(row.name || '').trim();
    const nip = String(row.nip || '').trim();
    const position = String(row.position || '').trim();
    const roles = parseRoles(row.roles);
    const invalidRoles = findInvalidRoles(row.roles);

    if (!username || !email || !password || !name) {
      failed.push({ row: i + 2, message: 'Field wajib belum lengkap' });
      continue;
    }

    if (invalidRoles.length) {
      failed.push({ row: i + 2, message: `Role tidak valid: ${invalidRoles.join(', ')}` });
      continue;
    }

    if (roles.some((role) => !roleMap.has(role))) {
      failed.push({ row: i + 2, message: 'Role tidak ditemukan' });
      continue;
    }

    try {
      await ensureUniqueUserIdentity({ username, email });
      await ensureUniqueNip({ nip: nip || null });
    } catch (err) {
      failed.push({ row: i + 2, message: err.message });
      continue;
    }

    const transaction = await sequelize.transaction();
    try {
      const hash = await bcrypt.hash(password, 10);
      const user = await User.create({
        username,
        email,
        passwordHash: hash,
        isActive: true
      }, { transaction });

      await Tendik.create({
        userId: user.id,
        name,
        nip: nip || null,
        position: position || null
      }, { transaction });

      await user.setRoles(roles.map((role) => roleMap.get(role)), { transaction });
      await transaction.commit();
      success += 1;
    } catch (err) {
      await transaction.rollback();
      const message = err?.parent?.sqlMessage || err?.message || 'Gagal menyimpan data';
      failed.push({ row: i + 2, message });
    }
  }

  return { success, failed };
};

module.exports = {
  createTendik,
  deleteTendik,
  formatTendik,
  getTendikDetail,
  getTendikTemplateBuffer: createTemplate,
  importTendik,
  listTendik,
  updateTendik
};
