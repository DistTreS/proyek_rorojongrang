const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { sequelize, Student, Rombel } = require('../models');
const { serviceError } = require('../utils/serviceError');
const { getAccessibleStudentIds } = require('./teacherOperationalService');

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

const formatStudent = (student) => ({
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

const ensureUniqueNis = async (nis, excludeId) => {
  const where = { nis };
  if (excludeId) {
    where.id = { [Op.ne]: excludeId };
  }
  const existing = await Student.findOne({ where });
  if (existing) {
    throw serviceError(409, 'NIS sudah terdaftar');
  }
};

const ensureValidRombels = async (rombelIds) => {
  if (!Array.isArray(rombelIds) || !rombelIds.length) {
    return [];
  }

  const rombels = await Rombel.findAll({ where: { id: rombelIds } });
  if (rombels.length !== rombelIds.length) {
    throw serviceError(400, 'Rombel tidak valid');
  }

  return rombels;
};

const listStudents = async ({ search, user } = {}) => {
  const where = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { nis: { [Op.like]: `%${search}%` } }
    ];
  }

  const accessibleStudentIds = await getAccessibleStudentIds(user);
  if (accessibleStudentIds !== null) {
    if (!accessibleStudentIds.length) {
      return [];
    }
    where.id = { [Op.in]: accessibleStudentIds };
  }

  const students = await Student.findAll({
    where,
    include: [{ model: Rombel, through: { attributes: [] } }],
    order: [['name', 'ASC']]
  });

  return students.map(formatStudent);
};

const getStudentDetail = async (id, { user } = {}) => {
  const accessibleStudentIds = await getAccessibleStudentIds(user);
  if (accessibleStudentIds !== null && !accessibleStudentIds.includes(Number(id))) {
    throw serviceError(404, 'Siswa tidak ditemukan');
  }

  const student = await Student.findByPk(id, {
    include: [{ model: Rombel, through: { attributes: [] } }]
  });

  if (!student) {
    throw serviceError(404, 'Siswa tidak ditemukan');
  }

  return formatStudent(student);
};

const createStudent = async (payload) => {
  const nis = String(payload.nis || '').trim();
  const name = String(payload.name || '').trim();
  const gender = payload.gender || null;
  const birthDate = payload.birthDate || null;
  const rombelIds = Array.isArray(payload.rombelIds) ? payload.rombelIds : [];

  if (!nis || !name) {
    throw serviceError(400, 'NIS dan nama wajib diisi');
  }

  await ensureUniqueNis(nis);
  const rombels = await ensureValidRombels(rombelIds);

  const transaction = await sequelize.transaction();
  try {
    const student = await Student.create({
      nis,
      name,
      gender,
      birthDate
    }, { transaction });

    if (rombels.length) {
      await student.setRombels(rombels, { transaction });
    }

    await transaction.commit();
    return getStudentDetail(student.id);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal membuat siswa');
  }
};

const updateStudent = async (id, payload) => {
  const student = await Student.findByPk(id, {
    include: [{ model: Rombel, through: { attributes: [] } }]
  });

  if (!student) {
    throw serviceError(404, 'Siswa tidak ditemukan');
  }

  const nextNis = payload.nis !== undefined ? String(payload.nis || '').trim() : student.nis;
  if (!nextNis || !(payload.name !== undefined ? String(payload.name || '').trim() : student.name)) {
    throw serviceError(400, 'NIS dan nama wajib diisi');
  }

  await ensureUniqueNis(nextNis, id);
  const rombels = Array.isArray(payload.rombelIds) ? await ensureValidRombels(payload.rombelIds) : null;

  const transaction = await sequelize.transaction();
  try {
    if (payload.nis !== undefined) student.nis = nextNis;
    if (payload.name !== undefined) student.name = String(payload.name || '').trim();
    if (payload.gender !== undefined) student.gender = payload.gender || null;
    if (payload.birthDate !== undefined) student.birthDate = payload.birthDate || null;
    await student.save({ transaction });

    if (Array.isArray(payload.rombelIds)) {
      await student.setRombels(rombels, { transaction });
    }

    await transaction.commit();
    return getStudentDetail(id);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal memperbarui siswa');
  }
};

const deleteStudent = async (id) => {
  const student = await Student.findByPk(id);
  if (!student) {
    throw serviceError(404, 'Siswa tidak ditemukan');
  }

  await student.destroy();
  return { message: 'Siswa dihapus' };
};

const importStudents = async (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) {
    throw serviceError(400, 'File kosong');
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

    try {
      await ensureUniqueNis(nis);
      const rombels = await ensureValidRombels(rombelIds);
      const transaction = await sequelize.transaction();
      try {
        const student = await Student.create({
          nis,
          name,
          gender: gender || null,
          birthDate: birthDate || null
        }, { transaction });

        if (rombels.length) {
          await student.setRombels(rombels, { transaction });
        }

        await transaction.commit();
        success += 1;
      } catch (err) {
        await transaction.rollback();
        failed.push({ row: i + 2, message: 'Gagal menyimpan data' });
      }
    } catch (err) {
      failed.push({ row: i + 2, message: err.message });
    }
  }

  return { success, failed };
};

module.exports = {
  createStudent,
  deleteStudent,
  getStudentDetail,
  getStudentTemplateBuffer: createTemplate,
  importStudents,
  listStudents,
  updateStudent
};
