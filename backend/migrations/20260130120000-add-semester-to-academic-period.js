'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('AcademicPeriod', 'semester', {
      type: Sequelize.ENUM('ganjil', 'genap'),
      allowNull: false,
      defaultValue: 'ganjil'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('AcademicPeriod', 'semester');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS `enum_AcademicPeriod_semester`;');
  }
};
