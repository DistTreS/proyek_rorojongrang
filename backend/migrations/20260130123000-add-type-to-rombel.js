'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Rombel', 'type', {
      type: Sequelize.ENUM('utama', 'peminatan'),
      allowNull: false,
      defaultValue: 'utama',
      after: 'grade_level'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Rombel', 'type');
  }
};
