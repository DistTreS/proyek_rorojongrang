module.exports = (sequelize, DataTypes) => {
  const AcademicPeriod = sequelize.define('AcademicPeriod', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    semester: { type: DataTypes.ENUM('ganjil', 'genap'), allowNull: false, defaultValue: 'ganjil' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  });

  return AcademicPeriod;
};
