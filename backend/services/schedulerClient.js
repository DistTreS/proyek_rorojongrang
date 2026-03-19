const { logError, logInfo, logWarn } = require('../utils/logger');
const {
  buildFallbackSchedulerResult,
  buildSchedulerRequestPayload,
  normalizeSchedulerResponse
} = require('./schedulerContract');

const fallbackGenerate = (assignments, timeSlots) => {
  const slotsByRombel = new Map();
  const orderedSlots = [...timeSlots].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  assignments.forEach((assignment) => {
    if (!slotsByRombel.has(assignment.rombelId)) {
      slotsByRombel.set(assignment.rombelId, []);
    }

    const list = slotsByRombel.get(assignment.rombelId);
    const hours = assignment.weeklyHours || 1;
    for (let i = 0; i < hours; i += 1) {
      const slot = orderedSlots[list.length % orderedSlots.length];
      if (!slot) break;
      list.push({
        rombelId: assignment.rombelId,
        timeSlotId: slot.id,
        teachingAssignmentId: assignment.id,
        room: null
      });
    }
  });

  return Array.from(slotsByRombel.values()).flat();
};

const createFallbackReason = (code, message, details = {}) => ({
  code,
  message,
  details
});

const withTimeoutSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId)
  };
};

const parseSchedulerFailureBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    const text = await response.text();
    return text ? { message: text } : null;
  } catch (err) {
    return null;
  }
};

const requestScheduler = async ({ schedulerUrl, requestPayload, timeoutMs }) => {
  const { signal, clear } = withTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(`${schedulerUrl}/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
      signal
    });

    if (!response.ok) {
      const failureBody = await parseSchedulerFailureBody(response);
      throw createFallbackReason(
        'SCHEDULER_HTTP_ERROR',
        'Scheduler service merespons error',
        {
          status: response.status,
          body: failureBody
        }
      );
    }

    const rawData = await response.json();
    const result = normalizeSchedulerResponse({
      data: rawData,
      requestPayload,
      engine: 'scheduler-service'
    });

    if (!result.scheduleItems.length) {
      throw createFallbackReason(
        'SCHEDULER_EMPTY_SCHEDULE',
        'Scheduler service tidak mengembalikan item jadwal',
        {
          warnings: result.warnings,
          conflicts: result.conflicts
        }
      );
    }

    return {
      source: 'scheduler',
      engine: 'scheduler-service',
      generatedAt: result.generatedAt,
      scheduleItems: result.scheduleItems,
      summary: result.summary,
      warnings: result.warnings,
      conflicts: result.conflicts,
      requestMeta: result.requestMeta,
      fallbackReason: null
    };
  } catch (err) {
    if (err?.code) {
      throw err;
    }

    if (err?.name === 'AbortError') {
      throw createFallbackReason(
        'SCHEDULER_TIMEOUT',
        'Scheduler service melebihi batas waktu',
        { timeoutMs }
      );
    }

    throw createFallbackReason(
      'SCHEDULER_NETWORK_ERROR',
      'Backend tidak dapat terhubung ke scheduler service',
      { error: err?.message || 'Unknown error' }
    );
  } finally {
    clear();
  }
};

const generateScheduleItems = async ({
  assignments,
  timeSlots,
  periodId,
  constraints,
  teacherPreferences
}) => {
  const schedulerUrl = process.env.SCHEDULER_URL || 'http://localhost:8000';
  const timeoutMs = Number(process.env.SCHEDULER_TIMEOUT_MS || 15000);
  const requestPayload = buildSchedulerRequestPayload({
    periodId,
    assignments,
    timeSlots,
    constraints,
    teacherPreferences
  });

  try {
    const schedulerResult = await requestScheduler({
      schedulerUrl,
      requestPayload,
      timeoutMs
    });

    logInfo('scheduler-client', 'Scheduler service menghasilkan draft jadwal', {
      source: schedulerResult.source,
      generatedItems: schedulerResult.scheduleItems.length,
      ...schedulerResult.requestMeta
    });

    return schedulerResult;
  } catch (err) {
    logWarn('scheduler-client', 'Scheduler service gagal, menggunakan fallback lokal', {
      code: err.code,
      message: err.message,
      details: err.details,
      ...buildFallbackSchedulerResult({
        requestPayload,
        scheduleItems: [],
        reason: err,
        engine: 'local-fallback-round-robin'
      }).requestMeta
    });

    try {
      const scheduleItems = fallbackGenerate(assignments, timeSlots);
      const fallbackResult = buildFallbackSchedulerResult({
        requestPayload,
        scheduleItems,
        reason: err,
        engine: 'local-fallback-round-robin'
      });

      logInfo('scheduler-client', 'Fallback generator lokal selesai dijalankan', {
        generatedItems: fallbackResult.scheduleItems.length,
        reasonCode: err.code
      });

      return fallbackResult;
    } catch (fallbackError) {
      logError('scheduler-client', 'Fallback generator lokal gagal dijalankan', {
        schedulerFailure: err,
        fallbackError: fallbackError?.message || 'Unknown error'
      });
      throw fallbackError;
    }
  }
};

module.exports = {
  generateScheduleItems
};
