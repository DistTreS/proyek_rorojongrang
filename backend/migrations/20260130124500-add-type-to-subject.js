'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Subject', 'type', {
      type: Sequelize.ENUM('wajib', 'peminatan'),
      allowNull: false,
      defaultValue: 'wajib',
      after: 'name'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Subject', 'type');
  }
};
