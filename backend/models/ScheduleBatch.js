module.exports = (sequelize, DataTypes) => {
  const ScheduleBatch = sequelize.define('ScheduleBatch', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    periodId: { type: DataTypes.INTEGER, allowNull: false },
    versionNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: {
      type: DataTypes.ENUM('draft', 'submitted', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'draft'
    },
    submittedBy: { type: DataTypes.INTEGER, allowNull: true },
    approvedBy: { type: DataTypes.INTEGER, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true }
  });

  return ScheduleBatch;
};
