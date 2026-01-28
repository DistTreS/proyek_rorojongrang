module.exports = (sequelize, DataTypes) => {
  const Schedule = sequelize.define('Schedule', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    periodId: { type: DataTypes.INTEGER, allowNull: false },
    rombelId: { type: DataTypes.INTEGER, allowNull: false },
    timeSlotId: { type: DataTypes.INTEGER, allowNull: false },
    teachingAssignmentId: { type: DataTypes.INTEGER, allowNull: false },
    room: { type: DataTypes.STRING(50), allowNull: true }
  });

  return Schedule;
};
