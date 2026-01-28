module.exports = (sequelize, DataTypes) => {
  const StudentRombel = sequelize.define('StudentRombel', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    rombelId: { type: DataTypes.INTEGER, allowNull: false }
  });

  return StudentRombel;
};
