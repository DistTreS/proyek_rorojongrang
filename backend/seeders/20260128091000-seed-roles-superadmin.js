'use strict';

const bcrypt = require('bcryptjs');
require('dotenv').config();

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const roles = [
      'super_admin',
      'kepala_sekolah',
      'wakasek',
      'staff_tu',
      'guru'
    ];

    for (const role of roles) {
      await queryInterface.sequelize.query(
        'INSERT IGNORE INTO Role (name, created_at, updated_at) VALUES (?, ?, ?)',
        { replacements: [role, now, now] }
      );
    }

    const username = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const email = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM User WHERE username = ? OR email = ? LIMIT 1',
      { replacements: [username, email] }
    );

    let userId;
    if (existing.length) {
      userId = existing[0].id;
    } else {
      const hash = await bcrypt.hash(password, 10);
      const [result] = await queryInterface.sequelize.query(
        'INSERT INTO User (username, email, password_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        { replacements: [username, email, hash, true, now, now] }
      );
      userId = result.insertId;
    }

    const [roleRows] = await queryInterface.sequelize.query(
      'SELECT id FROM Role WHERE name = ? LIMIT 1',
      { replacements: ['super_admin'] }
    );

    if (roleRows.length) {
      await queryInterface.sequelize.query(
        'INSERT IGNORE INTO UserRole (user_id, role_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
        { replacements: [userId, roleRows[0].id, now, now] }
      );
    }
  },

  async down(queryInterface) {
    const username = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const email = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';

    const [users] = await queryInterface.sequelize.query(
      'SELECT id FROM User WHERE username = ? OR email = ? LIMIT 1',
      { replacements: [username, email] }
    );

    if (users.length) {
      const userId = users[0].id;
      await queryInterface.sequelize.query('DELETE FROM UserRole WHERE user_id = ?', {
        replacements: [userId]
      });
      await queryInterface.sequelize.query('DELETE FROM RefreshToken WHERE user_id = ?', {
        replacements: [userId]
      });
      await queryInterface.sequelize.query('DELETE FROM User WHERE id = ?', {
        replacements: [userId]
      });
    }

    await queryInterface.sequelize.query(
      'DELETE FROM Role WHERE name IN (?, ?, ?, ?, ?)',
      { replacements: ['super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'] }
    );
  }
};
