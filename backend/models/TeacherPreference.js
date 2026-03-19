module.exports = (sequelize, DataTypes) => {
  const TeacherPreference = sequelize.define('TeacherPreference', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    periodId: { type: DataTypes.INTEGER, allowNull: false },
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: false },
    startTime: { type: DataTypes.TIME, allowNull: false },
    endTime: { type: DataTypes.TIME, allowNull: false },
    preferenceType: { type: DataTypes.ENUM('prefer', 'avoid'), allowNull: false, defaultValue: 'avoid' },
    notes: { type: DataTypes.STRING(255), allowNull: true }
  });

  return TeacherPreference;
};
