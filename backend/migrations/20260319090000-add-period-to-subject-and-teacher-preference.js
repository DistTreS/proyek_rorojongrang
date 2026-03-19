'use strict';

const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Subject', 'period_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'AcademicPeriod', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    const subjectIndexes = await queryInterface.showIndex('Subject');
    const legacyCodeIndex = subjectIndexes.find((index) => (
      index.unique &&
      index.fields?.length === 1 &&
      index.fields[0]?.attribute === 'code'
    ));
    if (legacyCodeIndex?.name) {
      await queryInterface.removeIndex('Subject', legacyCodeIndex.name);
    }

    await queryInterface.sequelize.query(`
      UPDATE Subject s
      INNER JOIN (
        SELECT subject_id, MAX(period_id) AS period_id
        FROM TeachingAssignment
        GROUP BY subject_id
      ) ta ON ta.subject_id = s.id
      SET s.period_id = ta.period_id
      WHERE s.period_id IS NULL
    `);

    const periodRows = await queryInterface.sequelize.query(
      `
        SELECT id
        FROM AcademicPeriod
        ORDER BY is_active DESC, start_date DESC, id DESC
        LIMIT 1
      `,
      { type: QueryTypes.SELECT }
    );

    const fallbackPeriodId = periodRows[0]?.id || null;
    if (fallbackPeriodId) {
      await queryInterface.sequelize.query(
        'UPDATE Subject SET period_id = :periodId WHERE period_id IS NULL',
        { replacements: { periodId: fallbackPeriodId } }
      );
    }

    await queryInterface.addIndex('Subject', ['period_id'], { name: 'idx_subject_period' });
    await queryInterface.addIndex('Subject', ['period_id', 'name'], { name: 'idx_subject_period_name' });
    await queryInterface.addIndex('Subject', ['period_id', 'code'], { name: 'idx_subject_period_code' });

    await queryInterface.createTable('TeacherPreference', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      teacher_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Tendik', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      period_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'AcademicPeriod', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      day_of_week: { type: Sequelize.INTEGER, allowNull: false },
      start_time: { type: Sequelize.TIME, allowNull: false },
      end_time: { type: Sequelize.TIME, allowNull: false },
      preference_type: {
        type: Sequelize.ENUM('prefer', 'avoid'),
        allowNull: false,
        defaultValue: 'avoid'
      },
      notes: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addIndex('TeacherPreference', ['teacher_id', 'period_id'], {
      name: 'idx_teacher_preference_teacher_period'
    });
    await queryInterface.addIndex('TeacherPreference', ['period_id', 'day_of_week'], {
      name: 'idx_teacher_preference_period_day'
    });
    await queryInterface.addConstraint('TeacherPreference', {
      type: 'unique',
      fields: ['teacher_id', 'period_id', 'day_of_week', 'start_time', 'end_time', 'preference_type'],
      name: 'uniq_teacher_preference_window'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('TeacherPreference', 'uniq_teacher_preference_window');
    await queryInterface.removeIndex('TeacherPreference', 'idx_teacher_preference_period_day');
    await queryInterface.removeIndex('TeacherPreference', 'idx_teacher_preference_teacher_period');
    await queryInterface.dropTable('TeacherPreference');
    await queryInterface.removeIndex('Subject', 'idx_subject_period_code');
    await queryInterface.removeIndex('Subject', 'idx_subject_period_name');
    await queryInterface.removeIndex('Subject', 'idx_subject_period');
    await queryInterface.addIndex('Subject', ['code'], {
      name: 'code',
      unique: true
    });
    await queryInterface.removeColumn('Subject', 'period_id');
  }
};
