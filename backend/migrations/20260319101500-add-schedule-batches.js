'use strict';

const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ScheduleBatch', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      period_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'AcademicPeriod', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      version_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'draft'
      },
      submitted_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'User', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'User', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      submitted_at: { type: Sequelize.DATE, allowNull: true },
      approved_at: { type: Sequelize.DATE, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addIndex('ScheduleBatch', ['period_id', 'version_number'], {
      name: 'idx_schedule_batch_period_version',
      unique: true
    });
    await queryInterface.addIndex('ScheduleBatch', ['period_id', 'status'], {
      name: 'idx_schedule_batch_period_status'
    });

    await queryInterface.addColumn('Schedule', 'batch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'ScheduleBatch', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    const periodRows = await queryInterface.sequelize.query(
      `
        SELECT DISTINCT period_id AS periodId
        FROM Schedule
        WHERE period_id IS NOT NULL
        ORDER BY period_id ASC
      `,
      { type: QueryTypes.SELECT }
    );

    for (const row of periodRows) {
      const now = new Date();
      await queryInterface.bulkInsert('ScheduleBatch', [{
        period_id: row.periodId,
        version_number: 1,
        status: 'approved',
        submitted_by: null,
        approved_by: null,
        submitted_at: now,
        approved_at: now,
        notes: 'Migrasi dari jadwal final lama',
        created_at: now,
        updated_at: now
      }]);

      const batchRows = await queryInterface.sequelize.query(
        `
          SELECT id
          FROM ScheduleBatch
          WHERE period_id = :periodId AND version_number = 1
          LIMIT 1
        `,
        {
          replacements: { periodId: row.periodId },
          type: QueryTypes.SELECT
        }
      );

      const batchId = batchRows[0]?.id;
      if (batchId) {
        await queryInterface.sequelize.query(
          'UPDATE Schedule SET batch_id = :batchId WHERE period_id = :periodId',
          { replacements: { batchId, periodId: row.periodId } }
        );
      }
    }

    await queryInterface.changeColumn('Schedule', 'batch_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'ScheduleBatch', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('Schedule', ['batch_id'], {
      name: 'idx_schedule_batch'
    });
    await queryInterface.addIndex('Schedule', ['batch_id', 'rombel_id', 'time_slot_id'], {
      name: 'idx_schedule_batch_rombel_slot'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Schedule', 'idx_schedule_batch_rombel_slot');
    await queryInterface.removeIndex('Schedule', 'idx_schedule_batch');
    await queryInterface.removeColumn('Schedule', 'batch_id');
    await queryInterface.removeIndex('ScheduleBatch', 'idx_schedule_batch_period_status');
    await queryInterface.removeIndex('ScheduleBatch', 'idx_schedule_batch_period_version');
    await queryInterface.dropTable('ScheduleBatch');
  }
};
