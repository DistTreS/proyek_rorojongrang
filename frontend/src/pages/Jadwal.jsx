import { useEffect, useMemo, useState } from 'react';
import { ROLES, SCHEDULING_MANAGER_ROLES, canAccess } from '../constants/rbac';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { fetchAllPages } from '../utils/pagination';

const dayLabels = {
  1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu'
};

const batchStatusMeta = {
  draft: { label: 'Draft', color: 'amber' },
  submitted: { label: 'Diajukan', color: 'sky' },
  approved: { label: 'Disetujui', color: 'emerald' },
  rejected: { label: 'Ditolak', color: 'rose' }
};

const FIXED_GENERATE_CONSTRAINTS = Object.freeze({
  max_teacher_daily_hours: 8,
  enforce_consecutive_small_assignments: true
});

const normalizeTimeSortValue = (value) => {
  const text = String(value || '').trim();
  const parts = text.split(':');
  if (parts.length < 2) return Number.MAX_SAFE_INTEGER;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  const second = Number(parts[2] || 0);
  if ([hour, minute, second].some((num) => Number.isNaN(num))) return Number.MAX_SAFE_INTEGER;
  return (hour * 3600) + (minute * 60) + second;
};

const extractFilenameFromDisposition = (disposition, fallback) => {
  if (!disposition) return fallback;
  const match = disposition.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const Jadwal = ({
  pageTitle = 'Jadwal Pelajaran',
  pageDescription = 'Generate otomatis dan kelola jadwal mingguan',
  canGenerate = true,
  canSubmit = false,
  canApprove = false,
  batchStatusFilter = null
}) => {
  const { roles } = useAuth();
  const canManageSchedule = canAccess(roles, SCHEDULING_MANAGER_ROLES);
  const canGenerateAction = Boolean(canGenerate && canManageSchedule);
  const canSubmitAction = Boolean(canSubmit && canAccess(roles, [ROLES.WAKASEK]));
  const canApproveAction = Boolean(canApprove && canAccess(roles, [ROLES.KEPALA_SEKOLAH]));

  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [validation, setValidation] = useState(null);
  const [solverResult, setSolverResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [editForm, setEditForm] = useState({ id: null, timeSlotId: '', teachingAssignmentId: '', room: '' });
  const [decisionForm, setDecisionForm] = useState({ action: '', notes: '' });
  const [selectedDay, setSelectedDay] = useState(1);
  const activeConstraints = FIXED_GENERATE_CONSTRAINTS;
  const normalizedBatchStatusFilter = String(batchStatusFilter || '').toLowerCase();
  const isExplicitBatchMode = normalizedBatchStatusFilter === 'submittable'
    || ['draft', 'submitted', 'approved', 'rejected'].includes(normalizedBatchStatusFilter);
  const canUseDirectStatusFilter = ['draft', 'submitted', 'approved', 'rejected'].includes(normalizedBatchStatusFilter);

  const fetchBatches = async () => {
    const params = canUseDirectStatusFilter ? { status: normalizedBatchStatusFilter } : undefined;
    const { data } = await api.get('/schedule/batches', params ? { params } : undefined);
    return data || [];
  };

  const loadValidation = async (periodId, constraints = activeConstraints) => {
    if (!periodId) {
      setValidation(null);
      return;
    }
    try {
      const { data } = await api.post('/schedule/validate', {
        periodId: Number(periodId),
        constraints
      });
      setValidation(data);
    } catch (err) {
      setValidation(null);
      setError(err.response?.data?.message || 'Gagal memvalidasi data jadwal');
    }
  };

  const shouldLoadValidation = canGenerateAction;

  // Load initial data
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [periodRes, batchRes] = await Promise.all([
          fetchAllPages(api, '/period'),
          fetchBatches()
        ]);
        const periodItems = periodRes || [];
        setPeriods(periodItems);
        setBatches(batchRes || []);
        if (periodItems.length) {
          const activePeriod = periodItems.find((period) => period.isActive) || periodItems[0];
          setSelectedPeriod((prev) => prev || String(activePeriod.id));
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat data');
      }
    };
    loadInitial();
  }, []);

  // Load schedule when period or batch changes
  useEffect(() => {
    if (!selectedPeriod) {
      setSchedule([]);
      setValidation(null);
      setSolverResult(null);
      return;
    }
    if (isExplicitBatchMode && !selectedBatchId) {
      setSchedule([]);
      setValidation(null);
      setSolverResult(null);
      return;
    }
    const loadScheduleData = async () => {
      setLoading(true);
      try {
        const schedulePromise = api.get('/schedule', {
          params: { periodId: selectedPeriod, ...(selectedBatchId && { batchId: selectedBatchId }) }
        });
        const validationPromise = shouldLoadValidation
          ? api.post('/schedule/validate', {
            periodId: Number(selectedPeriod),
            constraints: activeConstraints
          })
          : Promise.resolve({ data: null });

        const [scheduleRes, validationRes] = await Promise.all([schedulePromise, validationPromise]);
        setSchedule(scheduleRes.data);
        setValidation(validationRes.data || null);
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat jadwal');
      } finally {
        setLoading(false);
      }
    };
    loadScheduleData();
  }, [selectedPeriod, selectedBatchId, activeConstraints, isExplicitBatchMode, shouldLoadValidation]);

  const filteredBatches = useMemo(() => {
    if (!selectedPeriod) return [];
    const byPeriod = batches.filter((batch) => String(batch.periodId) === String(selectedPeriod));

    if (normalizedBatchStatusFilter === 'submittable') {
      return byPeriod.filter((batch) => ['draft', 'rejected'].includes(batch.status));
    }

    if (['draft', 'submitted', 'approved', 'rejected'].includes(normalizedBatchStatusFilter)) {
      return byPeriod.filter((batch) => batch.status === normalizedBatchStatusFilter);
    }

    return byPeriod;
  }, [batches, selectedPeriod, normalizedBatchStatusFilter]);

  useEffect(() => {
    if (!selectedPeriod) {
      setSelectedBatchId('');
      return;
    }
    if (!filteredBatches.length) {
      setSelectedBatchId('');
      return;
    }
    const currentStillValid = filteredBatches.some((batch) => String(batch.id) === String(selectedBatchId));
    if (!currentStillValid) {
      setSelectedBatchId(String(filteredBatches[0].id));
    }
  }, [selectedPeriod, selectedBatchId, filteredBatches]);

  const currentBatch = useMemo(() => 
    batches.find(b => String(b.id) === selectedBatchId) || null, 
    [batches, selectedBatchId]
  );
  const canEditDraft = Boolean(canGenerateAction && currentBatch?.status === 'draft');

  const scheduleMatrix = useMemo(() => {
    const daySet = new Set();
    const rombelMap = new Map();
    const rowMap = new Map();
    const cellMap = new Map();

    schedule.forEach((item) => {
      const day = Number(item.timeSlot?.dayOfWeek);
      const slotId = Number(item.timeSlot?.id);
      const rombelId = Number(item.teachingAssignment?.rombel?.id || item.rombelId);
      const rombelName = item.teachingAssignment?.rombel?.name || `Rombel #${rombelId}`;

      if (!day || !slotId || !rombelId) return;

      daySet.add(day);
      if (!rombelMap.has(rombelId)) {
        rombelMap.set(rombelId, { id: rombelId, name: rombelName });
      }

      const dayKey = String(day);
      if (!rowMap.has(dayKey)) rowMap.set(dayKey, new Map());
      const dayRows = rowMap.get(dayKey);
      if (!dayRows.has(slotId)) {
        dayRows.set(slotId, {
          id: slotId,
          dayOfWeek: day,
          startTime: item.timeSlot?.startTime || null,
          endTime: item.timeSlot?.endTime || null,
          label: item.timeSlot?.label || null
        });
      }

      const cellKey = `${day}:${slotId}:${rombelId}`;
      if (!cellMap.has(cellKey)) cellMap.set(cellKey, []);
      cellMap.get(cellKey).push(item);
    });

    const dayOptions = [...daySet].sort((a, b) => a - b);
    const rombels = [...rombelMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
    const rowsByDay = {};
    rowMap.forEach((rows, dayKey) => {
      rowsByDay[dayKey] = [...rows.values()].sort((a, b) => {
        const startDiff = normalizeTimeSortValue(a.startTime) - normalizeTimeSortValue(b.startTime);
        if (startDiff !== 0) return startDiff;
        const endDiff = normalizeTimeSortValue(a.endTime) - normalizeTimeSortValue(b.endTime);
        if (endDiff !== 0) return endDiff;
        return a.id - b.id;
      });
    });

    return {
      dayOptions,
      rombels,
      rowsByDay,
      cellMap
    };
  }, [schedule]);

  useEffect(() => {
    if (!scheduleMatrix.dayOptions.length) {
      setSelectedDay(1);
      return;
    }
    if (!scheduleMatrix.dayOptions.includes(selectedDay)) {
      setSelectedDay(scheduleMatrix.dayOptions[0]);
    }
  }, [scheduleMatrix.dayOptions, selectedDay]);

  const rowsForSelectedDay = useMemo(() => {
    return scheduleMatrix.rowsByDay[String(selectedDay)] || [];
  }, [scheduleMatrix.rowsByDay, selectedDay]);

  const assignmentOptions = useMemo(() => {
    const map = new Map();
    schedule.forEach((item) => {
      const assignmentId = Number(item.teachingAssignment?.id);
      if (!assignmentId || map.has(assignmentId)) return;
      const subject = item.teachingAssignment?.subject?.name || '-';
      const teacher = item.teachingAssignment?.teacher?.name || '-';
      const rombel = item.teachingAssignment?.rombel?.name || '-';
      map.set(assignmentId, {
        id: assignmentId,
        label: `${subject} • ${teacher} • ${rombel}`
      });
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'id-ID'));
  }, [schedule]);

  const timeSlotOptions = useMemo(() => {
    const map = new Map();
    schedule.forEach((item) => {
      const slotId = Number(item.timeSlot?.id);
      if (!slotId || map.has(slotId)) return;
      const day = dayLabels[item.timeSlot?.dayOfWeek] || `Hari ${item.timeSlot?.dayOfWeek || '-'}`;
      const start = item.timeSlot?.startTime || '--:--';
      const end = item.timeSlot?.endTime || '--:--';
      const label = item.timeSlot?.label ? ` • ${item.timeSlot.label}` : '';
      map.set(slotId, {
        id: slotId,
        label: `${day} • ${start} - ${end}${label}`
      });
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'id-ID'));
  }, [schedule]);

  const handleGenerate = async () => {
    if (!canGenerateAction || !selectedPeriod) return;
    if (validation && !validation.valid) {
      setError(validation.message || 'Data penjadwalan belum siap untuk digenerate');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const { data } = await api.post('/schedule/generate', {
        periodId: Number(selectedPeriod),
        constraints: activeConstraints
      });
      setMessage(data.message || 'Draft jadwal berhasil digenerate');
      setSolverResult(data.scheduler || null);
      const nextBatches = await fetchBatches();
      setBatches(nextBatches);
      if (data.batch?.id) setSelectedBatchId(String(data.batch.id));
      await loadValidation(selectedPeriod, activeConstraints);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal generate draft');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (format = 'xlsx') => {
    if (!selectedPeriod && !selectedBatchId) {
      setError('Pilih periode atau batch terlebih dahulu sebelum export');
      return;
    }

    setError(null);
    setExporting(true);
    try {
      const response = await api.get('/schedule/export', {
        params: {
          periodId: selectedPeriod || undefined,
          batchId: selectedBatchId || undefined,
          status: canUseDirectStatusFilter ? normalizedBatchStatusFilter : undefined,
          format
        },
        responseType: 'blob'
      });

      const contentDisposition = response.headers['content-disposition'];
      const fallbackName = `jadwal-${selectedPeriod || 'all'}.${format}`;
      const filename = extractFilenameFromDisposition(contentDisposition, fallbackName);

      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal export jadwal');
    } finally {
      setExporting(false);
    }
  };

  const openEditModal = (row) => {
    setEditForm({
      id: row.id,
      timeSlotId: row.timeSlot?.id || '',
      teachingAssignmentId: row.teachingAssignment?.id || '',
      room: row.room || ''
    });
    setModal({ type: 'edit', item: row });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.id) return;
    try {
      await api.put(`/schedule/${editForm.id}`, {
        timeSlotId: Number(editForm.timeSlotId),
        teachingAssignmentId: Number(editForm.teachingAssignmentId),
        room: editForm.room.trim() || null
      });
      setModal({ type: null });
      setMessage('Draft berhasil diperbarui');
      // Refresh schedule
      const { data } = await api.get('/schedule', {
        params: { periodId: selectedPeriod, ...(selectedBatchId && { batchId: selectedBatchId }) }
      });
      setSchedule(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan edit');
    }
  };

  const openDecisionModal = (action) => {
    setDecisionForm({ action, notes: currentBatch?.notes || '' });
    setModal({ type: action, item: currentBatch });
  };

  const handleBatchDecision = async (e) => {
    e.preventDefault();
    if (!currentBatch?.id || !decisionForm.action) return;

    const endpoints = {
      submit: `/schedule/batches/${currentBatch.id}/submit`,
      approve: `/schedule/batches/${currentBatch.id}/approve`,
      reject: `/schedule/batches/${currentBatch.id}/reject`
    };

    try {
      const { data } = await api.post(endpoints[decisionForm.action], {
        notes: decisionForm.notes.trim() || null
      });
      setModal({ type: null });
      setMessage(data.message || 'Status batch berhasil diperbarui');
      const nextBatches = await fetchBatches();
      setBatches(nextBatches);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui status');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="text-slate-600 mt-1">{pageDescription}</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          <Select
            value={selectedPeriod}
            onChange={(e) => {
              setSelectedPeriod(e.target.value);
              setSelectedBatchId('');
              setSolverResult(null);
            }}
          >
            <option value="">Pilih Periode</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>

          <Select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            disabled={!selectedPeriod || !filteredBatches.length}
          >
            {!selectedPeriod && <option value="">Pilih Periode dulu</option>}
            {selectedPeriod && !filteredBatches.length && <option value="">Belum ada batch</option>}
            {filteredBatches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                V{batch.versionNumber} • {batchStatusMeta[batch.status]?.label || batch.status}
              </option>
            ))}
          </Select>

          {canGenerateAction && (
            <Button onClick={handleGenerate} disabled={generating} size="lg">
              {generating ? 'Generating...' : 'Generate Draft Jadwal'}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => handleExport('xlsx')}
            disabled={exporting || (!selectedPeriod && !selectedBatchId)}
            size="lg"
          >
            {exporting ? 'Export...' : 'Export Jadwal XLSX'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleExport('csv')}
            disabled={exporting || (!selectedPeriod && !selectedBatchId)}
            size="lg"
          >
            {exporting ? 'Export...' : 'Export Jadwal CSV'}
          </Button>
        </div>
      </div>

      {message && (
        <Card className="p-4 border-emerald-200 bg-emerald-50 text-emerald-700">
          {message}
        </Card>
      )}

      {error && (
        <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
          {error}
        </Card>
      )}

      {/* Batch Info */}
      {currentBatch && (
        <Card className="p-6">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Batch V{currentBatch.versionNumber}</h2>
                <Badge variant={batchStatusMeta[currentBatch.status]?.color || 'default'}>
                  {batchStatusMeta[currentBatch.status]?.label}
                </Badge>
              </div>
              <p className="text-slate-600 mt-1">{currentBatch.periodName}</p>
            </div>
            <div className="text-left sm:text-right text-sm text-slate-500">
              {currentBatch.scheduleCount || 0} sesi
            </div>
          </div>

          {(canSubmitAction || canApproveAction) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {canSubmitAction && ['draft', 'rejected'].includes(currentBatch.status) && (
                <Button onClick={() => openDecisionModal('submit')}>
                  Ajukan untuk Pengesahan
                </Button>
              )}
              {canApproveAction && currentBatch.status === 'submitted' && (
                <>
                  <Button onClick={() => openDecisionModal('approve')}>
                    Setujui Batch
                  </Button>
                  <Button variant="danger" onClick={() => openDecisionModal('reject')}>
                    Tolak Batch
                  </Button>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Validation */}
      {shouldLoadValidation && validation && (
        <Card className={`p-6 ${validation.valid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="font-semibold">{validation.valid ? '✅ Data siap digenerate' : '⚠️ Data belum siap'}</p>
          <p className="text-sm mt-1">{validation.message}</p>
          <p className="text-xs text-slate-600 mt-2">
            Constraint aktif: max 8 jam/hari
            {' '}• blok 2-3 JP {activeConstraints.enforce_consecutive_small_assignments ? 'aktif' : 'nonaktif'}
            {' '}• soft limit 5 mapel/rombel/hari
          </p>
          {!!validation.errors?.length && (
            <div className="mt-3 space-y-1 text-xs text-amber-800">
              {validation.errors.slice(0, 5).map((item, index) => (
                <p key={`${item.code}-${index}`}>• {item.message}</p>
              ))}
              {validation.errors.length > 5 && (
                <p>... dan {validation.errors.length - 5} error lainnya</p>
              )}
            </div>
          )}
          {!!validation.warnings?.length && (
            <div className="mt-3 space-y-1 text-xs text-slate-700">
              {validation.warnings.slice(0, 5).map((item, index) => (
                <p key={`${item.code}-${index}`}>• {item.message}</p>
              ))}
              {validation.warnings.length > 5 && (
                <p>... dan {validation.warnings.length - 5} warning lainnya</p>
              )}
            </div>
          )}
        </Card>
      )}

      {solverResult && (
        <Card className="p-6 border-sky-200 bg-sky-50">
          <p className="font-semibold text-sky-900">Ringkasan Solver</p>
          <p className="text-sm text-sky-800 mt-1">
            Engine: {solverResult.summary?.engine || '-'} • Source: {solverResult.source || '-'}
          </p>
          <p className="text-sm text-sky-800">
            Generated: {solverResult.summary?.generatedItems || 0} sesi • Feasible: {solverResult.summary?.feasible ? 'Ya' : 'Tidak'}
          </p>
          {!!solverResult.warnings?.length && (
            <div className="mt-3 space-y-1 text-xs text-slate-700">
              {solverResult.warnings.slice(0, 5).map((item, index) => (
                <p key={`${item.code}-${index}`}>• {item.message}</p>
              ))}
            </div>
          )}
          {!!solverResult.conflicts?.length && (
            <div className="mt-3 space-y-1 text-xs text-rose-700">
              {solverResult.conflicts.slice(0, 5).map((item, index) => (
                <p key={`${item.code}-${index}`}>• {item.message}</p>
              ))}
            </div>
          )}
          {solverResult.fallbackReason && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Fallback Reason</p>
              <p>Code: {solverResult.fallbackReason.code || '-'}</p>
              <p>Message: {solverResult.fallbackReason.message || '-'}</p>
              {solverResult.fallbackReason.details?.timeoutMs && (
                <p>Timeout: {solverResult.fallbackReason.details.timeoutMs} ms</p>
              )}
              {solverResult.fallbackReason.details?.status && (
                <p>HTTP Status Scheduler: {solverResult.fallbackReason.details.status}</p>
              )}
              {solverResult.fallbackReason.details?.error && (
                <p>Error: {solverResult.fallbackReason.details.error}</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Schedule Table */}
      <Card className="p-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {(scheduleMatrix.dayOptions.length ? scheduleMatrix.dayOptions : [1, 2, 3, 4, 5, 6]).map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
                selectedDay === day
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {dayLabels[day] || `Hari ${day}`}
            </button>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">
          Matriks Jadwal {dayLabels[selectedDay] || ''}
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-separate border-spacing-0">
            <thead>
              <tr className="text-xs font-semibold text-slate-600">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 min-w-[180px] border border-slate-200 bg-slate-100 px-4 py-3 text-left"
                >
                  Jam / Slot
                </th>
                {scheduleMatrix.rombels.map((rombel) => (
                  <th
                    key={rombel.id}
                    className="min-w-[220px] border border-slate-200 bg-slate-100 px-3 py-3 text-left"
                  >
                    {rombel.name}
                  </th>
                ))}
              </tr>
              <tr className="text-xs font-medium text-slate-500">
                {scheduleMatrix.rombels.map((rombel) => (
                  <th
                    key={`sub-${rombel.id}`}
                    className="border border-t-0 border-slate-200 bg-slate-50 px-3 py-2 text-left"
                  >
                    Mapel / Guru
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rowsForSelectedDay.length && (
                <tr>
                  <td
                    colSpan={Math.max(2, scheduleMatrix.rombels.length + 1)}
                    className="border border-slate-200 px-4 py-8 text-center text-sm text-slate-500"
                  >
                    Belum ada jadwal untuk hari ini.
                  </td>
                </tr>
              )}

              {rowsForSelectedDay.map((slot) => (
                <tr key={slot.id}>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-white px-4 py-3 align-top">
                    <p className="text-sm font-semibold text-slate-900">{slot.label || `Slot ${slot.id}`}</p>
                    <p className="text-xs text-slate-500">{slot.startTime} - {slot.endTime}</p>
                  </td>

                  {scheduleMatrix.rombels.map((rombel) => {
                    const cellEntries = scheduleMatrix.cellMap.get(`${selectedDay}:${slot.id}:${rombel.id}`) || [];
                    return (
                      <td key={`${slot.id}-${rombel.id}`} className="border border-slate-200 px-3 py-2 align-top">
                        {!cellEntries.length && (
                          <p className="text-xs text-slate-400">-</p>
                        )}

                        <div className="space-y-2">
                          {cellEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className={`rounded-lg border px-2 py-2 ${
                                cellEntries.length > 1
                                  ? 'border-rose-200 bg-rose-50'
                                  : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <p className="text-xs font-semibold text-slate-800">
                                {entry.teachingAssignment?.subject?.name || '-'}
                              </p>
                              <p className="text-xs text-slate-600">
                                {entry.teachingAssignment?.teacher?.name || '-'}
                              </p>
                              {canEditDraft && (
                                <div className="mt-2">
                                  <Button variant="secondary" size="sm" onClick={() => openEditModal(entry)}>
                                    Edit
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Edit Draft */}
      <Modal
        isOpen={modal.type === 'edit'}
        onClose={() => setModal({ type: null })}
        title="Edit Draft Jadwal"
      >
        <form onSubmit={handleSaveEdit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Pengampu</label>
              <Select value={editForm.teachingAssignmentId} onChange={(e) => setEditForm(prev => ({...prev, teachingAssignmentId: e.target.value}))}>
                <option value="">Pilih Pengampu</option>
                {assignmentOptions.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Time Slot</label>
              <Select value={editForm.timeSlotId} onChange={(e) => setEditForm(prev => ({...prev, timeSlotId: e.target.value}))}>
                <option value="">Pilih Time Slot</option>
                {timeSlotOptions.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ruang (Opsional)</label>
            <Input value={editForm.room} onChange={(e) => setEditForm(prev => ({...prev, room: e.target.value}))} />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" variant="primary" size="lg" className="flex-1">Simpan Perubahan</Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => setModal({ type: null })}>Batal</Button>
          </div>
        </form>
      </Modal>

      {/* Decision Modal (Submit / Approve / Reject) */}
      {['submit', 'approve', 'reject'].includes(modal.type) && (
        <Modal
          isOpen={true}
          onClose={() => setModal({ type: null })}
          title={
            modal.type === 'submit' ? 'Ajukan Batch' :
            modal.type === 'approve' ? 'Setujui Batch' : 'Tolak Batch'
          }
        >
          <form onSubmit={handleBatchDecision} className="space-y-6">
            <textarea
              value={decisionForm.notes}
              onChange={(e) => setDecisionForm(prev => ({...prev, notes: e.target.value}))}
              rows={4}
              className="w-full rounded-2xl border border-neutral-200 p-4 text-sm"
              placeholder="Catatan tambahan..."
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant={modal.type === 'reject' ? 'danger' : 'primary'} className="flex-1">
                {modal.type === 'submit' && 'Ajukan'}
                {modal.type === 'approve' && 'Setujui'}
                {modal.type === 'reject' && 'Tolak'}
              </Button>
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setModal({ type: null })}>
                Batal
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Jadwal;
