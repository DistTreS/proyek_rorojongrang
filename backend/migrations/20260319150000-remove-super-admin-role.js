'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const targetRoles = ['staff_tu', 'wakasek', 'guru', 'kepala_sekolah'];

    for (const role of targetRoles) {
      await queryInterface.sequelize.query(
        'INSERT IGNORE INTO Role (name, created_at, updated_at) VALUES (?, ?, ?)',
        { replacements: [role, now, now] }
      );
    }

    const [superRoleRows] = await queryInterface.sequelize.query(
      'SELECT id FROM Role WHERE name = ? LIMIT 1',
      { replacements: ['super_admin'] }
    );

    if (!superRoleRows.length) {
      return;
    }

    const superRoleId = superRoleRows[0].id;

    const [targetRoleRows] = await queryInterface.sequelize.query(
      `SELECT id, name FROM Role WHERE name IN (${targetRoles.map(() => '?').join(', ')})`,
      { replacements: targetRoles }
    );

    const [superUsers] = await queryInterface.sequelize.query(
      'SELECT DISTINCT user_id AS userId FROM UserRole WHERE role_id = ?',
      { replacements: [superRoleId] }
    );

    for (const user of superUsers) {
      for (const role of targetRoleRows) {
        await queryInterface.sequelize.query(
          'INSERT IGNORE INTO UserRole (user_id, role_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
          { replacements: [user.userId, role.id, now, now] }
        );
      }
    }

    await queryInterface.sequelize.query(
      'DELETE FROM UserRole WHERE role_id = ?',
      { replacements: [superRoleId] }
    );

    await queryInterface.sequelize.query(
      'DELETE FROM Role WHERE id = ?',
      { replacements: [superRoleId] }
    );
  },

  async down(queryInterface) {
    const now = new Date();
    const targetRoles = ['staff_tu', 'wakasek', 'guru', 'kepala_sekolah'];

    await queryInterface.sequelize.query(
      'INSERT IGNORE INTO Role (name, created_at, updated_at) VALUES (?, ?, ?)',
      { replacements: ['super_admin', now, now] }
    );

    const [superRoleRows] = await queryInterface.sequelize.query(
      'SELECT id FROM Role WHERE name = ? LIMIT 1',
      { replacements: ['super_admin'] }
    );
    const [targetRoleRows] = await queryInterface.sequelize.query(
      `SELECT id FROM Role WHERE name IN (${targetRoles.map(() => '?').join(', ')})`,
      { replacements: targetRoles }
    );

    if (!superRoleRows.length || !targetRoleRows.length) {
      return;
    }

    const superRoleId = superRoleRows[0].id;
    const targetRoleIds = targetRoleRows.map((row) => row.id);

    const [candidates] = await queryInterface.sequelize.query(
      `SELECT user_id AS userId
       FROM UserRole
       WHERE role_id IN (${targetRoleIds.map(() => '?').join(', ')})
       GROUP BY user_id
       HAVING COUNT(DISTINCT role_id) = ?`,
      { replacements: [...targetRoleIds, targetRoleIds.length] }
    );

    for (const candidate of candidates) {
      await queryInterface.sequelize.query(
        'INSERT IGNORE INTO UserRole (user_id, role_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
        { replacements: [candidate.userId, superRoleId, now, now] }
      );
    }
  }
};
