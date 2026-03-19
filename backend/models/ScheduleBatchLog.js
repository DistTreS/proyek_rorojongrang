module.exports = (sequelize, DataTypes) => {
  const ScheduleBatchLog = sequelize.define('ScheduleBatchLog', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    batchId: { type: DataTypes.INTEGER, allowNull: false },
    actorId: { type: DataTypes.INTEGER, allowNull: true },
    fromStatus: {
      type: DataTypes.ENUM('draft', 'submitted', 'approved', 'rejected'),
      allowNull: true
    },
    toStatus: {
      type: DataTypes.ENUM('draft', 'submitted', 'approved', 'rejected'),
      allowNull: false
    },
    notes: { type: DataTypes.TEXT, allowNull: true }
  });

  return ScheduleBatchLog;
};
