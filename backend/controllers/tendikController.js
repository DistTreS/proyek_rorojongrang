const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize, User, Role, Tendik } = require('../models');

const typeToRole = {
  guru: 'guru',
  tu: 'staff_tu',
  kepala_sekolah: 'kepala_sekolah',
  wakasek: 'wakasek'
};

const resolveRoles = (roles, type) => {
  if (Array.isArray(roles) && roles.length) {
    return roles;
  }
  const mapped = typeToRole[type];
  return mapped ? [mapped] : [];
};

const list = async (req, res) => {
  const { search, type } = req.query;
  const where = {};
  if (type) {
    where.type = type;
  }

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

  const payload = filtered.map((item) => ({
    id: item.id,
    name: item.name,
    nip: item.nip,
    position: item.position,
    type: item.type,
    user: {
      id: item.User?.id,
      username: item.User?.username,
      email: item.User?.email,
      isActive: item.User?.isActive,
      roles: item.User?.Roles?.map((role) => role.name) || []
    }
  }));

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

  return res.json({
    id: tendik.id,
    name: tendik.name,
    nip: tendik.nip,
    position: tendik.position,
    type: tendik.type,
    user: {
      id: tendik.User?.id,
      username: tendik.User?.username,
      email: tendik.User?.email,
      isActive: tendik.User?.isActive,
      roles: tendik.User?.Roles?.map((role) => role.name) || []
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
    type,
    roles
  } = req.body;

  if (!username || !email || !password || !name || !type) {
    return res.status(400).json({ message: 'Field wajib belum lengkap' });
  }

  const roleNames = resolveRoles(roles, type);
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
      position: position || null,
      type
    }, { transaction });

    await user.setRoles(roleRows, { transaction });

    await transaction.commit();

    return res.status(201).json({
      id: tendik.id,
      name: tendik.name,
      nip: tendik.nip,
      position: tendik.position,
      type: tendik.type,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isActive: user.isActive,
        roles: roleRows.map((role) => role.name)
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
    type,
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
    if (type !== undefined) tendik.type = type;
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
      const roleNames = resolveRoles(roles, type || tendik.type);
      const roleRows = await Role.findAll({ where: { name: roleNames } });
      if (roleRows.length !== roleNames.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Role tidak ditemukan' });
      }
      await user.setRoles(roleRows, { transaction });
    }

    await transaction.commit();

    const updatedRoles = await user.getRoles();

    return res.json({
      id: tendik.id,
      name: tendik.name,
      nip: tendik.nip,
      position: tendik.position,
      type: tendik.type,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isActive: user.isActive,
        roles: updatedRoles.map((role) => role.name)
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
