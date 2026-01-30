const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize, User, Role, Tendik } = require('../models');

const roleOrder = ['kepala_sekolah', 'wakasek', 'guru', 'staff_tu', 'super_admin'];
const roleLabel = {
  super_admin: 'Super Admin',
  kepala_sekolah: 'Kepala Sekolah',
  wakasek: 'Wakasek',
  guru: 'Guru',
  staff_tu: 'Staff TU'
};

const resolveRoles = (roles) => {
  if (Array.isArray(roles) && roles.length) {
    return roles;
  }
  return ['guru'];
};

const getPrimaryRole = (roles = []) => {
  for (const role of roleOrder) {
    if (roles.includes(role)) {
      return role;
    }
  }
  return roles[0] || null;
};

const list = async (req, res) => {
  const { search } = req.query;
  const where = {};

  const tendik = await Tendik.findAll({
    where,
    include: [
      {
        model: User,
        attributes: { exclude: ['passwordHash'] },
        include: [{ model: Role }]
      }
    ],
    order: [['name', 'ASC']]
  });

  let filtered = tendik;
  if (search) {
    const keyword = search.toLowerCase();
    filtered = tendik.filter((item) => {
      return (
        item.name.toLowerCase().includes(keyword) ||
        (item.nip && item.nip.toLowerCase().includes(keyword)) ||
        item.User?.username?.toLowerCase().includes(keyword) ||
        item.User?.email?.toLowerCase().includes(keyword)
      );
    });
  }

  const payload = filtered.map((item) => {
    const roles = item.User?.Roles?.map((role) => role.name) || [];
    const primaryRole = getPrimaryRole(roles);
    return ({
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
      primaryRoleLabel: primaryRole ? roleLabel[primaryRole] : null
    }
  });
  });

  return res.json(payload);
};

const detail = async (req, res) => {
  const { id } = req.params;
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
    return res.status(404).json({ message: 'Tendik tidak ditemukan' });
  }

  const roles = tendik.User?.Roles?.map((role) => role.name) || [];
  const primaryRole = getPrimaryRole(roles);

  return res.json({
    id: tendik.id,
    name: tendik.name,
    nip: tendik.nip,
    position: tendik.position,
    user: {
      id: tendik.User?.id,
      username: tendik.User?.username,
      email: tendik.User?.email,
      isActive: tendik.User?.isActive,
      roles,
      primaryRole,
      primaryRoleLabel: primaryRole ? roleLabel[primaryRole] : null
    }
  });
};

const create = async (req, res) => {
  const {
    username,
    email,
    password,
    name,
    nip,
    position,
    roles
  } = req.body;

  if (!username || !email || !password || !name) {
    return res.status(400).json({ message: 'Field wajib belum lengkap' });
  }

  const roleNames = resolveRoles(roles);
  if (!roleNames.length) {
    return res.status(400).json({ message: 'Role tidak valid' });
  }

  const existing = await User.findOne({
    where: {
      [Op.or]: [{ username }, { email }]
    }
  });

  if (existing) {
    return res.status(409).json({ message: 'Username atau email sudah digunakan' });
  }

  const roleRows = await Role.findAll({ where: { name: roleNames } });
  if (roleRows.length !== roleNames.length) {
    return res.status(400).json({ message: 'Role tidak ditemukan' });
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

    const tendik = await Tendik.create({
      userId: user.id,
      name,
      nip: nip || null,
      position: position || null
    }, { transaction });

    await user.setRoles(roleRows, { transaction });

    const primaryRole = getPrimaryRole(roleNames);
    await transaction.commit();

    return res.status(201).json({
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
        primaryRole,
        primaryRoleLabel: primaryRole ? roleLabel[primaryRole] : null
      }
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal membuat tendik' });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const {
    username,
    email,
    password,
    name,
    nip,
    position,
    roles,
    isActive
  } = req.body;

  const tendik = await Tendik.findByPk(id, {
    include: [{ model: User, include: [{ model: Role }] }]
  });

  if (!tendik) {
    return res.status(404).json({ message: 'Tendik tidak ditemukan' });
  }

  const transaction = await sequelize.transaction();
  try {
    if (name !== undefined) tendik.name = name;
    if (nip !== undefined) tendik.nip = nip;
    if (position !== undefined) tendik.position = position;
    await tendik.save({ transaction });

    const user = tendik.User;
    if (username !== undefined) user.username = username;
    if (email !== undefined) user.email = email;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }
    await user.save({ transaction });

    if (roles) {
      const roleNames = resolveRoles(roles);
      const roleRows = await Role.findAll({ where: { name: roleNames } });
      if (roleRows.length !== roleNames.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Role tidak ditemukan' });
      }
      await user.setRoles(roleRows, { transaction });
    }

    await transaction.commit();

    const updatedRoles = await user.getRoles();

    const primaryRole = getPrimaryRole(updatedRoles.map((role) => role.name));
    return res.json({
      id: tendik.id,
      name: tendik.name,
      nip: tendik.nip,
      position: tendik.position,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isActive: user.isActive,
        roles: updatedRoles.map((role) => role.name),
        primaryRole,
        primaryRoleLabel: primaryRole ? roleLabel[primaryRole] : null
      }
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal memperbarui tendik' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  const tendik = await Tendik.findByPk(id, { include: [{ model: User }] });
  if (!tendik) {
    return res.status(404).json({ message: 'Tendik tidak ditemukan' });
  }

  const transaction = await sequelize.transaction();
  try {
    await tendik.destroy({ transaction });
    if (tendik.User) {
      await tendik.User.destroy({ transaction });
    }
    await transaction.commit();
    return res.json({ message: 'Tendik dihapus' });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal menghapus tendik' });
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
