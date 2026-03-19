'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ScheduleBatchLog', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      batch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'ScheduleBatch', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      actor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'User', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      from_status: {
        type: Sequelize.ENUM('draft', 'submitted', 'approved', 'rejected'),
        allowNull: true
      },
      to_status: {
        type: Sequelize.ENUM('draft', 'submitted', 'approved', 'rejected'),
        allowNull: false
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addIndex('ScheduleBatchLog', ['batch_id', 'created_at'], {
      name: 'idx_schedule_batch_log_batch_created'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('ScheduleBatchLog', 'idx_schedule_batch_log_batch_created');
    await queryInterface.dropTable('ScheduleBatchLog');
  }
};
