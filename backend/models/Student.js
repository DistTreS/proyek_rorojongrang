module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define('Student', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nis: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    gender: { type: DataTypes.ENUM('L', 'P'), allowNull: true },
    birthDate: { type: DataTypes.DATEONLY, allowNull: true }
  });

  return Student;
};
