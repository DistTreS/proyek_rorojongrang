module.exports = (sequelize, DataTypes) => {
  const TimeSlot = sequelize.define('TimeSlot', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    periodId: { type: DataTypes.INTEGER, allowNull: false },
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: false },
    startTime: { type: DataTypes.TIME, allowNull: false },
    endTime: { type: DataTypes.TIME, allowNull: false },
    label: { type: DataTypes.STRING(50), allowNull: true }
  });

  return TimeSlot;
};
