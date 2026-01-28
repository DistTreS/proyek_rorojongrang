module.exports = (sequelize, DataTypes) => {
  const TeachingAssignment = sequelize.define('TeachingAssignment', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: false },
    rombelId: { type: DataTypes.INTEGER, allowNull: false },
    periodId: { type: DataTypes.INTEGER, allowNull: false },
    weeklyHours: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  });

  return TeachingAssignment;
};
