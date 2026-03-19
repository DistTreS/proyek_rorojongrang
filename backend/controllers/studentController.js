const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { sequelize, Student, Rombel } = require('../models');

const normalizeRow = (row) => {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    normalized[key.trim().toLowerCase()] = row[key];
  });
  return normalized;
};

const normalizeGender = (value) => {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'l' || raw === 'laki-laki' || raw === 'laki') return 'L';
  if (raw === 'p' || raw === 'perempuan' || raw === 'wanita') return 'P';
  return null;
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const mm = String(date.m).padStart(2, '0');
    const dd = String(date.d).padStart(2, '0');
    return `${date.y}-${mm}-${dd}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
};

const createTemplate = () => {
  const rows = [
    {
      nis: '100001',
      name: 'Siti Nurhaliza',
      gender: 'P',
      birthDate: '2009-01-15',
      rombelIds: '1,2'
    }
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ['nis', 'name', 'gender', 'birthDate', 'rombelIds']
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'siswa');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const list = async (req, res) => {
  const { search } = req.query;
  const where = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { nis: { [Op.like]: `%${search}%` } }
    ];
  }

  const students = await Student.findAll({
    where,
    include: [{ model: Rombel, through: { attributes: [] } }],
    order: [['name', 'ASC']]
  });

  const payload = students.map((student) => ({
    id: student.id,
    nis: student.nis,
    name: student.name,
    gender: student.gender,
    birthDate: student.birthDate,
    rombels: student.Rombels?.map((rombel) => ({
      id: rombel.id,
      name: rombel.name,
      gradeLevel: rombel.gradeLevel,
      type: rombel.type,
      periodId: rombel.periodId
    })) || []
  }));

  return res.json(payload);
};

const detail = async (req, res) => {
  const { id } = req.params;
  const student = await Student.findByPk(id, {
    include: [{ model: Rombel, through: { attributes: [] } }]
  });

  if (!student) {
    return res.status(404).json({ message: 'Siswa tidak ditemukan' });
  }

  return res.json({
    id: student.id,
    nis: student.nis,
    name: student.name,
    gender: student.gender,
    birthDate: student.birthDate,
    rombels: student.Rombels?.map((rombel) => ({
      id: rombel.id,
      name: rombel.name,
      gradeLevel: rombel.gradeLevel,
      type: rombel.type,
      periodId: rombel.periodId
    })) || []
  });
};

const create = async (req, res) => {
  const { nis, name, gender, birthDate, rombelIds } = req.body;

  if (!nis || !name) {
    return res.status(400).json({ message: 'NIS dan nama wajib diisi' });
  }

  const existing = await Student.findOne({ where: { nis } });
  if (existing) {
    return res.status(409).json({ message: 'NIS sudah terdaftar' });
  }

  const transaction = await sequelize.transaction();
  try {
    const student = await Student.create({
      nis,
      name,
      gender: gender || null,
      birthDate: birthDate || null
    }, { transaction });

    if (Array.isArray(rombelIds) && rombelIds.length) {
      const rombels = await Rombel.findAll({ where: { id: rombelIds } });
      if (rombels.length !== rombelIds.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Rombel tidak valid' });
      }
      await student.setRombels(rombels, { transaction });
    }

    await transaction.commit();

    return res.status(201).json({
      id: student.id,
      nis: student.nis,
      name: student.name,
      gender: student.gender,
      birthDate: student.birthDate,
      rombels: Array.isArray(rombelIds) ? rombelIds : []
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal membuat siswa' });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const { nis, name, gender, birthDate, rombelIds } = req.body;

  const student = await Student.findByPk(id, {
    include: [{ model: Rombel, through: { attributes: [] } }]
  });

  if (!student) {
    return res.status(404).json({ message: 'Siswa tidak ditemukan' });
  }

  if (nis) {
    const existing = await Student.findOne({
      where: { nis, id: { [Op.ne]: id } }
    });
    if (existing) {
      return res.status(409).json({ message: 'NIS sudah terdaftar' });
    }
  }

  const transaction = await sequelize.transaction();
  try {
    if (nis !== undefined) student.nis = nis;
    if (name !== undefined) student.name = name;
    if (gender !== undefined) student.gender = gender || null;
    if (birthDate !== undefined) student.birthDate = birthDate || null;
    await student.save({ transaction });

    if (Array.isArray(rombelIds)) {
      if (rombelIds.length) {
        const rombels = await Rombel.findAll({ where: { id: rombelIds } });
        if (rombels.length !== rombelIds.length) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Rombel tidak valid' });
        }
        await student.setRombels(rombels, { transaction });
      } else {
        await student.setRombels([], { transaction });
      }
    }

    await transaction.commit();

    const updated = await Student.findByPk(student.id, {
      include: [{ model: Rombel, through: { attributes: [] } }]
    });

    return res.json({
      id: updated.id,
      nis: updated.nis,
      name: updated.name,
      gender: updated.gender,
      birthDate: updated.birthDate,
      rombels: updated.Rombels?.map((rombel) => ({
        id: rombel.id,
        name: rombel.name,
        gradeLevel: rombel.gradeLevel,
        type: rombel.type,
        periodId: rombel.periodId
      })) || []
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal memperbarui siswa' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  const student = await Student.findByPk(id);
  if (!student) {
    return res.status(404).json({ message: 'Siswa tidak ditemukan' });
  }

  await student.destroy();
  return res.json({ message: 'Siswa dihapus' });
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  importExcel: async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'File wajib diunggah' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      return res.status(400).json({ message: 'File kosong' });
    }

    let success = 0;
    const failed = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = normalizeRow(rows[i]);
      const nis = String(row.nis || '').trim();
      const name = String(row.name || '').trim();
      const gender = normalizeGender(row.gender);
      const birthDate = parseDate(row.birthdate || row.birthDate);
      const rombelIdsRaw = String(row.rombelids || row.rombelIds || '').trim();
      const rombelIds = rombelIdsRaw
        ? rombelIdsRaw.split(/[,;|]/).map((id) => Number(id.trim())).filter((id) => Number.isFinite(id))
        : [];

      if (!nis || !name) {
        failed.push({ row: i + 2, message: 'NIS dan nama wajib diisi' });
        continue;
      }

      const existing = await Student.findOne({ where: { nis } });
      if (existing) {
        failed.push({ row: i + 2, message: 'NIS sudah terdaftar' });
        continue;
      }

      const transaction = await sequelize.transaction();
      try {
        const student = await Student.create({
          nis,
          name,
          gender: gender || null,
          birthDate: birthDate || null
        }, { transaction });

        if (rombelIds.length) {
          const rombels = await Rombel.findAll({ where: { id: rombelIds } });
          if (rombels.length !== rombelIds.length) {
            await transaction.rollback();
            failed.push({ row: i + 2, message: 'Rombel tidak valid' });
            continue;
          }
          await student.setRombels(rombels, { transaction });
        }

        await transaction.commit();
        success += 1;
      } catch (err) {
        await transaction.rollback();
        failed.push({ row: i + 2, message: 'Gagal menyimpan data' });
      }
    }

    return res.json({ success, failed });
  },
  downloadTemplate: async (req, res) => {
    const buffer = createTemplate();
    res.setHeader('Content-Disposition', 'attachment; filename="template-siswa.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  }
};
