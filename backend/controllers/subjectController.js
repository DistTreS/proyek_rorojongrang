const { Op } = require('sequelize');
const { Subject } = require('../models');

const list = async (req, res) => {
  const { search } = req.query;
  const where = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { code: { [Op.like]: `%${search}%` } }
    ];
  }

  const subjects = await Subject.findAll({
    where,
    order: [['name', 'ASC']]
  });

  return res.json(subjects.map((subject) => ({
    id: subject.id,
    code: subject.code,
    name: subject.name,
    type: subject.type
  })));
};

const detail = async (req, res) => {
  const { id } = req.params;
  const subject = await Subject.findByPk(id);
  if (!subject) {
    return res.status(404).json({ message: 'Mata pelajaran tidak ditemukan' });
  }
  return res.json({
    id: subject.id,
    code: subject.code,
    name: subject.name,
    type: subject.type
  });
};

const create = async (req, res) => {
  const { code, name, type } = req.body;
  const normalizedType = type ? String(type).toLowerCase() : 'wajib';
  if (!['wajib', 'peminatan'].includes(normalizedType)) {
    return res.status(400).json({ message: 'Jenis mapel tidak valid' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Nama mata pelajaran wajib diisi' });
  }

  if (code) {
    const exists = await Subject.findOne({ where: { code } });
    if (exists) {
      return res.status(409).json({ message: 'Kode mapel sudah digunakan' });
    }
  }

  const subject = await Subject.create({
    code: code || null,
    name,
    type: normalizedType
  });

  return res.status(201).json({
    id: subject.id,
    code: subject.code,
    name: subject.name,
    type: subject.type
  });
};

const update = async (req, res) => {
  const { id } = req.params;
  const { code, name, type } = req.body;
  const subject = await Subject.findByPk(id);

  if (!subject) {
    return res.status(404).json({ message: 'Mata pelajaran tidak ditemukan' });
  }

  if (code) {
    const exists = await Subject.findOne({
      where: {
        code,
        id: { [Op.ne]: id }
      }
    });
    if (exists) {
      return res.status(409).json({ message: 'Kode mapel sudah digunakan' });
    }
  }

  if (name !== undefined) subject.name = name;
  if (code !== undefined) subject.code = code || null;
  if (type !== undefined) {
    const normalizedType = String(type).toLowerCase();
    if (!['wajib', 'peminatan'].includes(normalizedType)) {
      return res.status(400).json({ message: 'Jenis mapel tidak valid' });
    }
    subject.type = normalizedType;
  }
  await subject.save();

  return res.json({
    id: subject.id,
    code: subject.code,
    name: subject.name,
    type: subject.type
  });
};

const remove = async (req, res) => {
  const { id } = req.params;
  const subject = await Subject.findByPk(id);
  if (!subject) {
    return res.status(404).json({ message: 'Mata pelajaran tidak ditemukan' });
  }

  await subject.destroy();
  return res.json({ message: 'Mata pelajaran dihapus' });
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
