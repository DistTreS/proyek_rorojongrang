module.exports = (sequelize, DataTypes) => {
  const StudentNote = sequelize.define('StudentNote', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    authorId: { type: DataTypes.INTEGER, allowNull: false },
    category: { type: DataTypes.ENUM('prestasi', 'masalah'), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false }
  });

  return StudentNote;
};
