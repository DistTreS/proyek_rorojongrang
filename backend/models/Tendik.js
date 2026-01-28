module.exports = (sequelize, DataTypes) => {
  const Tendik = sequelize.define('Tendik', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    nip: { type: DataTypes.STRING(30), allowNull: true, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    position: { type: DataTypes.STRING(100), allowNull: true },
    type: { type: DataTypes.ENUM('guru', 'tu', 'kepala_sekolah', 'wakasek'), allowNull: false, defaultValue: 'guru' }
  });

  return Tendik;
};
