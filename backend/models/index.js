const Sequelize = require('sequelize');
const sequelize = require('../config/db');

const User = require('./User')(sequelize, Sequelize.DataTypes);
const Role = require('./Role')(sequelize, Sequelize.DataTypes);
const UserRole = require('./UserRole')(sequelize, Sequelize.DataTypes);
const RefreshToken = require('./RefreshToken')(sequelize, Sequelize.DataTypes);
const Tendik = require('./Tendik')(sequelize, Sequelize.DataTypes);
const Student = require('./Student')(sequelize, Sequelize.DataTypes);
const Rombel = require('./Rombel')(sequelize, Sequelize.DataTypes);
const StudentRombel = require('./StudentRombel')(sequelize, Sequelize.DataTypes);
const Subject = require('./Subject')(sequelize, Sequelize.DataTypes);
const AcademicPeriod = require('./AcademicPeriod')(sequelize, Sequelize.DataTypes);
const TeachingAssignment = require('./TeachingAssignment')(sequelize, Sequelize.DataTypes);
const TimeSlot = require('./TimeSlot')(sequelize, Sequelize.DataTypes);
const ScheduleBatch = require('./ScheduleBatch')(sequelize, Sequelize.DataTypes);
const ScheduleBatchLog = require('./ScheduleBatchLog')(sequelize, Sequelize.DataTypes);
const Schedule = require('./Schedule')(sequelize, Sequelize.DataTypes);
const Attendance = require('./Attendance')(sequelize, Sequelize.DataTypes);
const StudentNote = require('./StudentNote')(sequelize, Sequelize.DataTypes);
const TeacherPreference = require('./TeacherPreference')(sequelize, Sequelize.DataTypes);

User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', otherKey: 'roleId' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', otherKey: 'userId' });

User.hasOne(Tendik, { foreignKey: 'userId' });
Tendik.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(RefreshToken, { foreignKey: 'userId' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

Student.belongsToMany(Rombel, { through: StudentRombel, foreignKey: 'studentId', otherKey: 'rombelId' });
Rombel.belongsToMany(Student, { through: StudentRombel, foreignKey: 'rombelId', otherKey: 'studentId' });

Rombel.belongsTo(AcademicPeriod, { foreignKey: 'periodId' });
AcademicPeriod.hasMany(Rombel, { foreignKey: 'periodId' });

Subject.belongsTo(AcademicPeriod, { foreignKey: 'periodId' });
AcademicPeriod.hasMany(Subject, { foreignKey: 'periodId' });

TeachingAssignment.belongsTo(Tendik, { foreignKey: 'teacherId' });
Tendik.hasMany(TeachingAssignment, { foreignKey: 'teacherId' });
TeachingAssignment.belongsTo(Subject, { foreignKey: 'subjectId' });
Subject.hasMany(TeachingAssignment, { foreignKey: 'subjectId' });
TeachingAssignment.belongsTo(Rombel, { foreignKey: 'rombelId' });
Rombel.hasMany(TeachingAssignment, { foreignKey: 'rombelId' });
TeachingAssignment.belongsTo(AcademicPeriod, { foreignKey: 'periodId' });
AcademicPeriod.hasMany(TeachingAssignment, { foreignKey: 'periodId' });

TimeSlot.belongsTo(AcademicPeriod, { foreignKey: 'periodId' });
AcademicPeriod.hasMany(TimeSlot, { foreignKey: 'periodId' });

TeacherPreference.belongsTo(Tendik, { foreignKey: 'teacherId', as: 'Teacher' });
Tendik.hasMany(TeacherPreference, { foreignKey: 'teacherId', as: 'TeacherPreferences' });
TeacherPreference.belongsTo(AcademicPeriod, { foreignKey: 'periodId' });
AcademicPeriod.hasMany(TeacherPreference, { foreignKey: 'periodId' });

ScheduleBatch.belongsTo(AcademicPeriod, { foreignKey: 'periodId' });
AcademicPeriod.hasMany(ScheduleBatch, { foreignKey: 'periodId' });
ScheduleBatch.belongsTo(User, { foreignKey: 'submittedBy', as: 'Submitter' });
User.hasMany(ScheduleBatch, { foreignKey: 'submittedBy', as: 'SubmittedScheduleBatches' });
ScheduleBatch.belongsTo(User, { foreignKey: 'approvedBy', as: 'Approver' });
User.hasMany(ScheduleBatch, { foreignKey: 'approvedBy', as: 'ApprovedScheduleBatches' });
ScheduleBatchLog.belongsTo(ScheduleBatch, { foreignKey: 'batchId' });
ScheduleBatch.hasMany(ScheduleBatchLog, { foreignKey: 'batchId' });
ScheduleBatchLog.belongsTo(User, { foreignKey: 'actorId', as: 'Actor' });
User.hasMany(ScheduleBatchLog, { foreignKey: 'actorId', as: 'ScheduleBatchLogs' });

Schedule.belongsTo(ScheduleBatch, { foreignKey: 'batchId' });
ScheduleBatch.hasMany(Schedule, { foreignKey: 'batchId' });
Schedule.belongsTo(AcademicPeriod, { foreignKey: 'periodId' });
Schedule.belongsTo(Rombel, { foreignKey: 'rombelId' });
Schedule.belongsTo(TimeSlot, { foreignKey: 'timeSlotId' });
Schedule.belongsTo(TeachingAssignment, { foreignKey: 'teachingAssignmentId' });

Attendance.belongsTo(Student, { foreignKey: 'studentId' });
Attendance.belongsTo(Rombel, { foreignKey: 'rombelId' });
Attendance.belongsTo(TimeSlot, { foreignKey: 'timeSlotId' });
Attendance.belongsTo(Subject, { foreignKey: 'subjectId' });
Attendance.belongsTo(Tendik, { foreignKey: 'teacherId', as: 'Teacher' });
Attendance.belongsTo(Tendik, { foreignKey: 'substituteTeacherId', as: 'SubstituteTeacher' });

StudentNote.belongsTo(Student, { foreignKey: 'studentId' });
StudentNote.belongsTo(User, { foreignKey: 'authorId' });

module.exports = {
  sequelize,
  Sequelize,
  User,
  Role,
  UserRole,
  RefreshToken,
  Tendik,
  Student,
  Rombel,
  StudentRombel,
  Subject,
  AcademicPeriod,
  TeachingAssignment,
  TimeSlot,
  ScheduleBatch,
  ScheduleBatchLog,
  Schedule,
  Attendance,
  StudentNote,
  TeacherPreference
};
