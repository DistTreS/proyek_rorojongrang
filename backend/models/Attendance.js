module.exports = (sequelize, DataTypes) => {
  const Attendance = sequelize.define('Attendance', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    meetingId: { type: DataTypes.STRING(36), allowNull: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    rombelId: { type: DataTypes.INTEGER, allowNull: false },
    timeSlotId: { type: DataTypes.INTEGER, allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: true },
    teacherId: { type: DataTypes.INTEGER, allowNull: true },
    substituteTeacherId: { type: DataTypes.INTEGER, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('hadir', 'izin', 'sakit', 'alpa'), allowNull: false },
    note: { type: DataTypes.STRING(255), allowNull: true },
    meetingNote: { type: DataTypes.STRING(255), allowNull: true },
    attachmentUrl: { type: DataTypes.STRING(255), allowNull: true }
  });

  return Attendance;
};
