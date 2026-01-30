'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Attendance', 'meeting_id', {
      type: Sequelize.STRING(36),
      allowNull: true,
      after: 'id'
    });
    await queryInterface.addColumn('Attendance', 'subject_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'time_slot_id',
      references: { model: 'Subject', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('Attendance', 'teacher_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'subject_id',
      references: { model: 'Tendik', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('Attendance', 'substitute_teacher_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'teacher_id',
      references: { model: 'Tendik', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('Attendance', 'meeting_note', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'note'
    });
    await queryInterface.addColumn('Attendance', 'attachment_url', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'meeting_note'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Attendance', 'attachment_url');
    await queryInterface.removeColumn('Attendance', 'meeting_note');
    await queryInterface.removeColumn('Attendance', 'substitute_teacher_id');
    await queryInterface.removeColumn('Attendance', 'teacher_id');
    await queryInterface.removeColumn('Attendance', 'subject_id');
    await queryInterface.removeColumn('Attendance', 'meeting_id');
  }
};
