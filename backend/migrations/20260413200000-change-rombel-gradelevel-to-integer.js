'use strict';

/**
 * Convert Rombel.grade_level from VARCHAR(10) → INT.
 *
 * Table name  : Rombel   (singular, as created by initial-schema)
 * Column name : grade_level  (snake_case, as created by initial-schema)
 *
 * Existing roman-numeral values (X / XI / XII) and numeric strings
 * are coerced to integers 10 / 11 / 12 before the type change.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Normalise any roman-numeral strings to numeric strings
    await queryInterface.sequelize.query(
      `UPDATE \`Rombel\`
       SET \`grade_level\` = CASE
         WHEN \`grade_level\` = 'X'   THEN '10'
         WHEN \`grade_level\` = 'XI'  THEN '11'
         WHEN \`grade_level\` = 'XII' THEN '12'
         ELSE \`grade_level\`
       END
       WHERE \`grade_level\` IS NOT NULL`
    );

    // 2. Change column type VARCHAR → INT
    await queryInterface.changeColumn('Rombel', 'grade_level', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Rombel', 'grade_level', {
      type: Sequelize.STRING(10),
      allowNull: true
    });
  }
};
