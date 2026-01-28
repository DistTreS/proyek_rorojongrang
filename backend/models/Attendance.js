module.exports = (sequelize, DataTypes) => {
  const Attendance = sequelize.define('Attendance', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    rombelId: { type: DataTypes.INTEGER, allowNull: false },
    timeSlotId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('hadir', 'izin', 'sakit', 'alpa'), allowNull: false },
    note: { type: DataTypes.STRING(255), allowNull: true }
  });

  return Attendance;
};
