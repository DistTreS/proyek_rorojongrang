'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('User', 'avatar_url', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('User', 'avatar_url');
  }
};
