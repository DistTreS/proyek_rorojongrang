module.exports = (sequelize, DataTypes) => {
  const Subject = sequelize.define('Subject', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    type: { type: DataTypes.ENUM('wajib', 'peminatan'), allowNull: false, defaultValue: 'wajib' },
    periodId: { type: DataTypes.INTEGER, allowNull: false }
  });

  return Subject;
};
