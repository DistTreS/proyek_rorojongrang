module.exports = (sequelize, DataTypes) => {
  const Subject = sequelize.define('Subject', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false }
  });

  return Subject;
};
