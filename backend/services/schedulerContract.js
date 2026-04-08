const toPlainObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const toFiniteNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBooleanOrNull = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return null;
  return Boolean(value);
};

const normalizeFallbackReason = (reason) => ({
  code: String(reason?.code || 'SCHEDULER_UNKNOWN_ERROR'),
  message: String(reason?.message || 'Unknown scheduler error'),
  details: toPlainObject(reason?.details)
});

const normalizeHardConstraintSummary = (hardConstraints) => {
  const safe = toPlainObject(hardConstraints);
  const status = toPlainObject(safe.status);
  const violations = toPlainObject(safe.violations);

  return {
    status: {
      eachEventScheduledExactlyOnce: toBooleanOrNull(status.each_event_scheduled_exactly_once),
      teacherWeeklyHoursFulfilled: toBooleanOrNull(status.teacher_weekly_hours_fulfilled),
      noTeacherConflict: toBooleanOrNull(status.no_teacher_conflict),
      noRombelConflict: toBooleanOrNull(status.no_rombel_conflict),
      slotTimeValid: toBooleanOrNull(status.slot_time_valid),
      distributionPatternValid: toBooleanOrNull(status.distribution_pattern_valid),
      mandatoryVsElectiveNoOverlap: toBooleanOrNull(status.mandatory_vs_elective_no_overlap),
      electiveParallelSubjectLimitValid: toBooleanOrNull(status.elective_parallel_subject_limit_valid)
    },
    violations: {
      assignmentExact: toFiniteNumberOrNull(violations.assignment_exact),
      teacherWeeklyGap: toFiniteNumberOrNull(violations.teacher_weekly_gap),
      teacherConflicts: toFiniteNumberOrNull(violations.teacher_conflicts),
      rombelConflicts: toFiniteNumberOrNull(violations.rombel_conflicts),
      invalidSlotReference: toFiniteNumberOrNull(violations.invalid_slot_reference),
      invalidSlotDay: toFiniteNumberOrNull(violations.invalid_slot_day),
      distributionPattern: toFiniteNumberOrNull(violations.distribution_pattern),
      mandatoryVsElectiveOverlap: toFiniteNumberOrNull(violations.mandatory_vs_elective_overlap),
      electiveParallelSubjectLimit: toFiniteNumberOrNull(violations.elective_parallel_subject_limit)
    }
  };
};

const normalizeSoftPenaltySummary = (softPenalties) => {
  const safe = toPlainObject(softPenalties);
  const cpSat = toPlainObject(safe.cp_sat);
  const final = toPlainObject(safe.final);

  const normalizeBucket = (bucket) => ({
    teacherSubjectDailyOverloadUnits: toFiniteNumberOrNull(bucket.teacher_subject_daily_overload_units),
    teacherSubjectDailyPenalty: toFiniteNumberOrNull(bucket.teacher_subject_daily_penalty),
    rombelDailySubjectOverloadUnits: toFiniteNumberOrNull(bucket.rombel_daily_subject_overload_units),
    rombelDailySubjectPenalty: toFiniteNumberOrNull(bucket.rombel_daily_subject_penalty),
    distributionPatternUnits: toFiniteNumberOrNull(bucket.distribution_pattern_units),
    distributionPatternPenalty: toFiniteNumberOrNull(bucket.distribution_pattern_penalty),
    distributionNonConsecutiveUnits: toFiniteNumberOrNull(bucket.distribution_non_consecutive_units),
    distributionNonConsecutivePenalty: toFiniteNumberOrNull(bucket.distribution_non_consecutive_penalty),
    totalPenalty: toFiniteNumberOrNull(bucket.total_penalty)
  });

  return {
    cpSat: normalizeBucket(cpSat),
    final: normalizeBucket(final)
  };
};

const normalizeDistributionCompliance = (distributionCompliance) => {
  const safe = toPlainObject(distributionCompliance);
  const topViolations = Array.isArray(safe.top_violations) ? safe.top_violations : [];

  return {
    totalAssignments: toFiniteNumberOrNull(safe.total_assignments),
    compliantAssignments: toFiniteNumberOrNull(safe.compliant_assignments),
    violationAssignments: toFiniteNumberOrNull(safe.violation_assignments),
    complianceRatePercent: toFiniteNumberOrNull(safe.compliance_rate_percent),
    distributionPatternUnitsTotal: toFiniteNumberOrNull(safe.distribution_pattern_units_total),
    distributionNonConsecutiveUnitsTotal: toFiniteNumberOrNull(safe.distribution_non_consecutive_units_total),
    topViolations: topViolations.map((item) => {
      const safeItem = toPlainObject(item);
      return {
        teachingAssignmentId: toFiniteNumberOrNull(safeItem.teaching_assignment_id),
        teacherId: toFiniteNumberOrNull(safeItem.teacher_id),
        subjectId: toFiniteNumberOrNull(safeItem.subject_id),
        rombelId: toFiniteNumberOrNull(safeItem.rombel_id),
        weeklyHours: toFiniteNumberOrNull(safeItem.weekly_hours),
        patternUnits: toFiniteNumberOrNull(safeItem.pattern_units),
        nonConsecutiveUnits: toFiniteNumberOrNull(safeItem.non_consecutive_units),
        weightedUnits: toFiniteNumberOrNull(safeItem.weighted_units)
      };
    })
  };
};

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
  const runtimeMs = toPlainObject(safeSummary.runtime_ms);
  const objectiveScores = toPlainObject(safeSummary.objective_scores);
  const constraintProfile = toPlainObject(safeSummary.constraint_profile);
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
    engine: String(safeSummary.engine || engine),
    runtimeMs: {
      total: toFiniteNumberOrNull(runtimeMs.total),
      cpSat: toFiniteNumberOrNull(runtimeMs.cp_sat),
      ga: toFiniteNumberOrNull(runtimeMs.ga),
      cpSatPolish: toFiniteNumberOrNull(runtimeMs.cp_sat_polish)
    },
    objectiveScores: {
      cpSatSolver: toFiniteNumberOrNull(objectiveScores.cp_sat_solver),
      cpSatEvaluated: toFiniteNumberOrNull(objectiveScores.cp_sat_evaluated),
      final: toFiniteNumberOrNull(objectiveScores.final),
      delta: toFiniteNumberOrNull(objectiveScores.delta)
    },
    hardConstraints: normalizeHardConstraintSummary(safeSummary.hard_constraints),
    softPenalties: normalizeSoftPenaltySummary(safeSummary.soft_penalties),
    distributionCompliance: normalizeDistributionCompliance(safeSummary.distribution_compliance),
    constraintProfile: {
      teacherSubjectDailySoftLimit: toFiniteNumberOrNull(
        constraintProfile.teacher_subject_daily_soft_limit ?? safeSummary.teacher_subject_daily_soft_limit
      ),
      rombelDailySubjectSoftLimit: toFiniteNumberOrNull(
        constraintProfile.rombel_daily_subject_soft_limit ?? safeSummary.rombel_daily_subject_soft_limit
      ),
      distributionRules: Array.isArray(constraintProfile.distribution_rules)
        ? constraintProfile.distribution_rules.map((item) => String(item))
        : [],
      wajibPeminatanConflictCheckEnabled: toBooleanOrNull(
        constraintProfile.wajib_peminatan_conflict_check_enabled
      )
    },
    hybridRounds: Array.isArray(safeSummary.hybrid_rounds)
      ? safeSummary.hybrid_rounds.map((item) => toPlainObject(item))
      : []
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

const buildFallbackSchedulerResult = ({ requestPayload, scheduleItems, reason, engine }) => {
  const safeReason = normalizeFallbackReason(reason);
  return {
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
          reasonCode: safeReason.code,
          reasonMessage: safeReason.message
        }
      }
    ],
    conflicts: [],
    requestMeta: buildRequestMeta(requestPayload),
    fallbackReason: safeReason
  };
};

module.exports = {
  buildFallbackSchedulerResult,
  buildSchedulerRequestPayload,
  normalizeSchedulerResponse
};
