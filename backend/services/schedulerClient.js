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

const extractNetworkErrorDetails = (err) => {
  const cause = err?.cause && typeof err.cause === 'object' ? err.cause : {};
  return {
    error: err?.message || 'Unknown error',
    errorName: err?.name || null,
    causeCode: cause?.code || err?.code || null,
    causeMessage: cause?.message || null,
    causeAddress: cause?.address || null,
    causePort: cause?.port || null
  };
};

const normalizeFallbackReason = (reason) => {
  const details = reason && typeof reason.details === 'object' && reason.details !== null
    ? reason.details
    : {};
  return {
    code: String(reason?.code || 'SCHEDULER_UNKNOWN_ERROR'),
    message: String(reason?.message || 'Unknown scheduler error'),
    details
  };
};

const buildSchedulerUrlCandidates = (rawSchedulerUrl) => {
  const fallback = 'http://localhost:8000';
  const base = String(rawSchedulerUrl || fallback).trim() || fallback;
  const candidates = [base];

  try {
    const parsed = new URL(base);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      candidates.push(parsed.toString().replace(/\/$/, ''));
    } else if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
      candidates.push(parsed.toString().replace(/\/$/, ''));
    }
  } catch (err) {
    // Abaikan URL invalid, biarkan request utama yang melaporkan error.
  }

  return [...new Set(candidates)];
};

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

const isAbortLikeError = (err) => {
  if (!err) return false;
  const message = String(err.message || '').toLowerCase();
  return (
    err.name === 'AbortError'
    || err.code === 'ABORT_ERR'
    || err.code === 20
    || message.includes('aborted')
  );
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
    if (isAbortLikeError(err)) {
      throw createFallbackReason(
        'SCHEDULER_TIMEOUT',
        'Scheduler service melebihi batas waktu',
        {
          timeoutMs,
          originalName: err?.name || null,
          originalCode: err?.code ?? null,
          originalMessage: err?.message || null
        }
      );
    }

    const causeCode = err?.cause?.code || null;
    if (causeCode === 'UND_ERR_HEADERS_TIMEOUT') {
      throw createFallbackReason(
        'SCHEDULER_TIMEOUT',
        'Scheduler service melebihi batas waktu respon',
        {
          timeoutMs,
          originalName: err?.name || null,
          originalCode: err?.code ?? null,
          originalMessage: err?.message || null,
          causeCode,
          causeMessage: err?.cause?.message || null
        }
      );
    }

    if (err?.code) {
      throw err;
    }

    throw createFallbackReason(
      'SCHEDULER_NETWORK_ERROR',
      'Backend tidak dapat terhubung ke scheduler service',
      extractNetworkErrorDetails(err)
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
  teacherPreferences,
  studentEnrollments
}) => {
  const schedulerUrl = process.env.SCHEDULER_URL || 'http://localhost:8000';
  const timeoutCandidate = Number(process.env.SCHEDULER_TIMEOUT_MS || 1800000);
  const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
    ? timeoutCandidate
    : 1800000;
  const schedulerUrlCandidates = buildSchedulerUrlCandidates(schedulerUrl);
  const requestPayload = buildSchedulerRequestPayload({
    periodId,
    assignments,
    timeSlots,
    constraints,
    teacherPreferences,
    studentEnrollments
  });

  let lastError = null;
  for (let index = 0; index < schedulerUrlCandidates.length; index += 1) {
    const candidateUrl = schedulerUrlCandidates[index];
    const isLastCandidate = index === (schedulerUrlCandidates.length - 1);
    try {
      const schedulerResult = await requestScheduler({
        schedulerUrl: candidateUrl,
        requestPayload,
        timeoutMs
      });

      logInfo('scheduler-client', 'Scheduler service menghasilkan draft jadwal', {
        source: schedulerResult.source,
        generatedItems: schedulerResult.scheduleItems.length,
        schedulerUrl: candidateUrl,
        schedulerUrlCandidates,
        ...schedulerResult.requestMeta
      });

      return schedulerResult;
    } catch (err) {
      lastError = normalizeFallbackReason(err);
      const shouldRetryCandidate = !isLastCandidate && ['SCHEDULER_NETWORK_ERROR', 'SCHEDULER_TIMEOUT'].includes(lastError.code);
      if (shouldRetryCandidate) {
        logWarn('scheduler-client', 'Percobaan scheduler gagal, mencoba URL kandidat berikutnya', {
          code: lastError.code,
          message: lastError.message,
          details: lastError.details,
          schedulerUrl: candidateUrl,
          nextSchedulerUrl: schedulerUrlCandidates[index + 1]
        });
        continue;
      }
      break;
    }
  }

  const normalizedError = normalizeFallbackReason(lastError);
  try {
    logWarn('scheduler-client', 'Scheduler service gagal, menggunakan fallback lokal', {
      code: normalizedError.code,
      message: normalizedError.message,
      details: normalizedError.details,
      schedulerUrlCandidates,
      ...buildFallbackSchedulerResult({
        requestPayload,
        scheduleItems: [],
        reason: normalizedError,
        engine: 'local-fallback-round-robin'
      }).requestMeta
    });

    const scheduleItems = fallbackGenerate(assignments, timeSlots);
    const fallbackResult = buildFallbackSchedulerResult({
      requestPayload,
      scheduleItems,
      reason: normalizedError,
      engine: 'local-fallback-round-robin'
    });

    logInfo('scheduler-client', 'Fallback generator lokal selesai dijalankan', {
      generatedItems: fallbackResult.scheduleItems.length,
      reasonCode: normalizedError.code
    });

    return fallbackResult;
  } catch (fallbackError) {
    logError('scheduler-client', 'Fallback generator lokal gagal dijalankan', {
      schedulerFailure: normalizedError,
      fallbackError: fallbackError?.message || 'Unknown error'
    });
    throw fallbackError;
  }
};

module.exports = {
  generateScheduleItems
};
