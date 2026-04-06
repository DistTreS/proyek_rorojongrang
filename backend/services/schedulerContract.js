const toPlainObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const toIssueItem = (item, defaultCode, defaultMessage) => {
  if (typeof item === 'string') {
    return {
      code: defaultCode,
      message: item
    };
  }

  if (item && typeof item === 'object') {
    return {
      code: String(item.code || defaultCode),
      message: String(item.message || defaultMessage),
      details: toPlainObject(item.details || item.meta)
    };
  }

  return {
    code: defaultCode,
    message: defaultMessage
  };
};

const normalizeIssueList = (items, defaultCode, defaultMessage) => (
  Array.isArray(items)
    ? items.map((item) => toIssueItem(item, defaultCode, defaultMessage))
    : []
);

const buildSchedulerRequestPayload = ({
  periodId,
  assignments,
  timeSlots,
  constraints,
  teacherPreferences,
  studentEnrollments
}) => ({
  period_id: Number(periodId),
  teaching_assignments: (assignments || []).map((item) => ({
    id: item.id,
    teacher_id: item.teacherId,
    subject_id: item.subjectId,
    rombel_id: item.rombelId,
    period_id: item.periodId,
    weekly_hours: item.weeklyHours,
    grade_level: item.Rombel?.gradeLevel ?? null,
    subject_type: item.Subject?.type || null,
    rombel_type: item.Rombel?.type || null
  })),
  time_slots: (timeSlots || []).map((slot) => ({
    id: slot.id,
    period_id: slot.periodId,
    day_of_week: slot.dayOfWeek,
    start_time: slot.startTime,
    end_time: slot.endTime,
    label: slot.label || null
  })),
  constraints: toPlainObject(constraints),
  teacher_preferences: (teacherPreferences || []).map((item) => ({
    id: item.id,
    teacher_id: item.teacherId,
    period_id: item.periodId,
    day_of_week: item.dayOfWeek,
    start_time: item.startTime,
    end_time: item.endTime,
    preference_type: item.preferenceType,
    notes: item.notes || null
  })),
  student_enrollments: (studentEnrollments || []).map((item) => ({
    student_id: item.studentId,
    rombel_ids: item.rombelIds
  }))
});

const normalizeScheduleItems = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      rombelId: Number(item.rombelId ?? item.rombel_id),
      timeSlotId: Number(item.timeSlotId ?? item.time_slot_id),
      teachingAssignmentId: Number(item.teachingAssignmentId ?? item.teaching_assignment_id),
      room: item.room ? String(item.room) : null
    }))
    .filter((item) => (
      Number.isInteger(item.rombelId) && item.rombelId > 0
      && Number.isInteger(item.timeSlotId) && item.timeSlotId > 0
      && Number.isInteger(item.teachingAssignmentId) && item.teachingAssignmentId > 0
    ));
};

const buildRequestMeta = (requestPayload) => ({
  periodId: requestPayload.period_id,
  teachingAssignments: requestPayload.teaching_assignments.length,
  timeSlots: requestPayload.time_slots.length,
  teacherPreferences: requestPayload.teacher_preferences.length,
  studentEnrollments: requestPayload.student_enrollments.length,
  hasConstraints: Object.keys(requestPayload.constraints || {}).length > 0
});

const normalizeSchedulerSummary = (summary, requestPayload, generatedItems, engine, usedFallback = false) => {
  const safeSummary = toPlainObject(summary);
  const requestedWeeklyHours = requestPayload.teaching_assignments.reduce(
    (total, item) => total + (Number(item.weekly_hours) || 0),
    0
  );

  return {
    totalTeachingAssignments: Number(safeSummary.total_teaching_assignments ?? requestPayload.teaching_assignments.length),
    totalTimeSlots: Number(safeSummary.total_time_slots ?? requestPayload.time_slots.length),
    totalTeacherPreferences: Number(safeSummary.total_teacher_preferences ?? requestPayload.teacher_preferences.length),
    totalStudentEnrollments: Number(safeSummary.total_student_enrollments ?? requestPayload.student_enrollments.length),
    generatedItems,
    requestedWeeklyHours,
    feasible: Boolean(safeSummary.feasible ?? (generatedItems > 0)),
    usedFallback,
    engine: String(safeSummary.engine || engine)
  };
};

const normalizeSchedulerResponse = ({ data, requestPayload, engine = 'scheduler-service' }) => {
  const generatedAt = data?.generated_at
    ? String(data.generated_at)
    : new Date().toISOString();
  const scheduleItems = normalizeScheduleItems(data?.schedule);
  const warnings = normalizeIssueList(
    data?.warnings,
    'SCHEDULER_WARNING',
    'Scheduler mengembalikan peringatan'
  );
  const conflicts = normalizeIssueList(
    data?.conflicts,
    'SCHEDULER_CONFLICT',
    'Scheduler mendeteksi konflik'
  );

  return {
    generatedAt,
    scheduleItems,
    summary: normalizeSchedulerSummary(data?.summary, requestPayload, scheduleItems.length, engine),
    warnings,
    conflicts,
    requestMeta: buildRequestMeta(requestPayload)
  };
};

const buildFallbackSchedulerResult = ({ requestPayload, scheduleItems, reason, engine }) => ({
  source: 'fallback',
  engine,
  generatedAt: new Date().toISOString(),
  scheduleItems,
  summary: normalizeSchedulerSummary({}, requestPayload, scheduleItems.length, engine, true),
  warnings: [
    {
      code: 'SCHEDULER_FALLBACK_USED',
      message: 'Backend menggunakan generator fallback lokal karena scheduler service tidak dapat dipakai',
      details: {
        reasonCode: reason.code,
        reasonMessage: reason.message
      }
    }
  ],
  conflicts: [],
  requestMeta: buildRequestMeta(requestPayload),
  fallbackReason: reason
});

module.exports = {
  buildFallbackSchedulerResult,
  buildSchedulerRequestPayload,
  normalizeSchedulerResponse
};
