const { Op } = require('sequelize');
const { TimeSlot, AcademicPeriod } = require('../models');

const list = async (req, res) => {
  const { periodId } = req.query;
  const where = {};
  if (periodId) {
    where.periodId = periodId;
  }

  const slots = await TimeSlot.findAll({
    where,
    include: [{ model: AcademicPeriod, attributes: ['id', 'name'] }],
    order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
  });

  return res.json(slots.map((slot) => ({
    id: slot.id,
    periodId: slot.periodId,
    periodName: slot.AcademicPeriod?.name || null,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slot.label
  })));
};

const detail = async (req, res) => {
  const { id } = req.params;
  const slot = await TimeSlot.findByPk(id, {
    include: [{ model: AcademicPeriod, attributes: ['id', 'name'] }]
  });

  if (!slot) {
    return res.status(404).json({ message: 'Jam pelajaran tidak ditemukan' });
  }

  return res.json({
    id: slot.id,
    periodId: slot.periodId,
    periodName: slot.AcademicPeriod?.name || null,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slot.label
  });
};

const create = async (req, res) => {
  const { periodId, dayOfWeek, startTime, endTime, label } = req.body;
  if (!periodId || dayOfWeek === undefined || !startTime || !endTime) {
    return res.status(400).json({ message: 'Periode, hari, jam mulai, dan jam selesai wajib diisi' });
  }

  const period = await AcademicPeriod.findByPk(periodId);
  if (!period) {
    return res.status(400).json({ message: 'Periode akademik tidak valid' });
  }

  const overlap = await TimeSlot.findOne({
    where: {
      periodId,
      dayOfWeek,
      [Op.or]: [
        { startTime: { [Op.between]: [startTime, endTime] } },
        { endTime: { [Op.between]: [startTime, endTime] } }
      ]
    }
  });

  if (overlap) {
    return res.status(409).json({ message: 'Jam pelajaran bentrok dengan slot lain' });
  }

  const slot = await TimeSlot.create({
    periodId,
    dayOfWeek,
    startTime,
    endTime,
    label: label || null
  });

  return res.status(201).json({
    id: slot.id,
    periodId: slot.periodId,
    periodName: period.name,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slot.label
  });
};

const update = async (req, res) => {
  const { id } = req.params;
  const { periodId, dayOfWeek, startTime, endTime, label } = req.body;
  const slot = await TimeSlot.findByPk(id);

  if (!slot) {
    return res.status(404).json({ message: 'Jam pelajaran tidak ditemukan' });
  }

  const nextPeriodId = periodId ?? slot.periodId;
  const nextDay = dayOfWeek ?? slot.dayOfWeek;
  const nextStart = startTime ?? slot.startTime;
  const nextEnd = endTime ?? slot.endTime;

  const period = await AcademicPeriod.findByPk(nextPeriodId);
  if (!period) {
    return res.status(400).json({ message: 'Periode akademik tidak valid' });
  }

  const overlap = await TimeSlot.findOne({
    where: {
      id: { [Op.ne]: id },
      periodId: nextPeriodId,
      dayOfWeek: nextDay,
      [Op.or]: [
        { startTime: { [Op.between]: [nextStart, nextEnd] } },
        { endTime: { [Op.between]: [nextStart, nextEnd] } }
      ]
    }
  });

  if (overlap) {
    return res.status(409).json({ message: 'Jam pelajaran bentrok dengan slot lain' });
  }

  slot.periodId = nextPeriodId;
  slot.dayOfWeek = nextDay;
  slot.startTime = nextStart;
  slot.endTime = nextEnd;
  if (label !== undefined) slot.label = label || null;

  await slot.save();

  return res.json({
    id: slot.id,
    periodId: slot.periodId,
    periodName: period.name,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slot.label
  });
};

const remove = async (req, res) => {
  const { id } = req.params;
  const slot = await TimeSlot.findByPk(id);
  if (!slot) {
    return res.status(404).json({ message: 'Jam pelajaran tidak ditemukan' });
  }

  await slot.destroy();
  return res.json({ message: 'Jam pelajaran dihapus' });
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
