module.exports = (sequelize, DataTypes) => {
  const Rombel = sequelize.define('Rombel', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(50), allowNull: false },
    gradeLevel: { type: DataTypes.STRING(10), allowNull: true },
    periodId: { type: DataTypes.INTEGER, allowNull: false }
  });

  return Rombel;
};
