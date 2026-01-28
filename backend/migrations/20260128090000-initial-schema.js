'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('User', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      username: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      email: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('Role', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('UserRole', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'User', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Role', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addConstraint('UserRole', {
      type: 'unique',
      fields: ['user_id', 'role_id'],
      name: 'uniq_user_role'
    });

    await queryInterface.createTable('RefreshToken', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'User', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      token: { type: Sequelize.STRING(500), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('Tendik', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'User', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      nip: { type: Sequelize.STRING(30), allowNull: true, unique: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      position: { type: Sequelize.STRING(100), allowNull: true },
      type: {
        type: Sequelize.ENUM('guru', 'tu', 'kepala_sekolah', 'wakasek'),
        allowNull: false,
        defaultValue: 'guru'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('AcademicPeriod', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      start_date: { type: Sequelize.DATEONLY, allowNull: false },
      end_date: { type: Sequelize.DATEONLY, allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('Rombel', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(50), allowNull: false },
      grade_level: { type: Sequelize.STRING(10), allowNull: true },
      period_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'AcademicPeriod', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('Student', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      nis: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      gender: { type: Sequelize.ENUM('L', 'P'), allowNull: true },
      birth_date: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('StudentRombel', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Student', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      rombel_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Rombel', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addConstraint('StudentRombel', {
      type: 'unique',
      fields: ['student_id', 'rombel_id'],
      name: 'uniq_student_rombel'
    });

    await queryInterface.createTable('Subject', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: Sequelize.STRING(20), allowNull: true, unique: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('TeachingAssignment', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      teacher_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Tendik', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      subject_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Subject', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      rombel_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Rombel', key: 'id' },
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
      weekly_hours: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('TimeSlot', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
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
      label: { type: Sequelize.STRING(50), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('Schedule', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      period_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'AcademicPeriod', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      rombel_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Rombel', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      time_slot_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TimeSlot', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      teaching_assignment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TeachingAssignment', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      room: { type: Sequelize.STRING(50), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('Attendance', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Student', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      rombel_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Rombel', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      time_slot_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TimeSlot', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      status: { type: Sequelize.ENUM('hadir', 'izin', 'sakit', 'alpa'), allowNull: false },
      note: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addConstraint('Attendance', {
      type: 'unique',
      fields: ['student_id', 'time_slot_id', 'date'],
      name: 'uniq_attendance_student_slot_date'
    });

    await queryInterface.createTable('StudentNote', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Student', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      author_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'User', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      category: { type: Sequelize.ENUM('prestasi', 'masalah'), allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: false },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('StudentNote');
    await queryInterface.dropTable('Attendance');
    await queryInterface.dropTable('Schedule');
    await queryInterface.dropTable('TimeSlot');
    await queryInterface.dropTable('TeachingAssignment');
    await queryInterface.dropTable('Subject');
    await queryInterface.dropTable('StudentRombel');
    await queryInterface.dropTable('Student');
    await queryInterface.dropTable('Rombel');
    await queryInterface.dropTable('AcademicPeriod');
    await queryInterface.dropTable('Tendik');
    await queryInterface.dropTable('RefreshToken');
    await queryInterface.dropTable('UserRole');
    await queryInterface.dropTable('Role');
    await queryInterface.dropTable('User');
  }
};
