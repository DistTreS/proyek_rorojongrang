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
  enforce_consecutive_small_assignments: true,
  rombel_daily_subject_soft_limit: 5,
  use_ga: true,
  max_solver_seconds: 90,
  total_runtime_seconds: 600,
  ga: {
    enabled: true,
    population_size: 28,
    generations: 20,
    crossover_rate: 0.75,
    mutation_rate: 0.45,
    tournament_size: 3,
    elite_count: 3,
    hybrid_rounds: 3,
    hybrid_no_improvement_stop_rounds: 2
  },
  enforce_grade_track_constraints: true,
  prefer_weight: 8,
  avoid_penalty: 10,
  day_spread_weight: 2,
  enable_distribution_cp_objective: false,
  distribution_pattern_penalty: 1,
  distribution_non_consecutive_penalty: 2
});

const normalizeTimeSortValue = (value) => {
  const text = String(value || '').trim();
  const parts = text.split(':');
  if (parts.length < 2) return Number.MAX_SAFE_INTEGER;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  const second = Number(parts[2] || 0);
  if ([hour, minute, second].some((n) => Number.isNaN(n))) return Number.MAX_SAFE_INTEGER;
  return (hour * 3600) + (minute * 60) + second;
};

const normalizeRombelType = (value) => String(value || '').trim().toLowerCase();

const compareRombelOrder = (a, b) => {
  // Sort by grade level first (10 → 11 → 12, then null last)
  const aGrade = Number(a?.gradeLevel) || 999;
  const bGrade = Number(b?.gradeLevel) || 999;
  if (aGrade !== bGrade) return aGrade - bGrade;

  // Within same grade: utama before peminatan
  const typePriority = { utama: 0, wajib: 0, peminatan: 1 };
  const aType = normalizeRombelType(a?.type);
  const bType = normalizeRombelType(b?.type);
  const aPriority = typePriority[aType] ?? 2;
  const bPriority = typePriority[bType] ?? 2;
  if (aPriority !== bPriority) return aPriority - bPriority;

  return String(a?.name || '').localeCompare(String(b?.name || ''), 'id-ID');
};

const extractFilenameFromDisposition = (disposition, fallback) => {
  if (!disposition) return fallback;
  const match = disposition.match(/filename\*?=(?:UTF-8'')?\"?([^";]+)\"?/i);
  if (!match?.[1]) return fallback;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
};

const cellStyleMap = {
  peminatan: {
    wrap: 'bg-amber-50 border-amber-200',
    text: 'text-amber-900 font-semibold',
    sub: 'text-amber-700',
  },
  wajib: {
    wrap: 'bg-emerald-50/70 border-emerald-200',
    text: 'text-slate-800 font-semibold',
    sub: 'text-slate-600',
  },
  conflict: {
    wrap: 'bg-rose-50 border-rose-300',
    text: 'text-rose-900 font-semibold',
    sub: 'text-rose-700',
  },
};

const getCellStyleKey = (entry, hasConflict) => {
  if (hasConflict) return 'conflict';
  const subjectType = entry.teachingAssignment?.subject?.type;
  const rombelType = entry.teachingAssignment?.rombel?.type;
  return (subjectType === 'peminatan' || rombelType === 'peminatan') ? 'peminatan' : 'wajib';
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
  const hasGuruRole = roles.includes(ROLES.GURU);
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
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [editForm, setEditForm] = useState({ id: null, timeSlotId: '', teachingAssignmentId: '', room: '' });
  const [decisionForm, setDecisionForm] = useState({ action: '', notes: '' });
  const [selectedDay, setSelectedDay] = useState(1);
  const [scope, setScope] = useState('global');
  const activeConstraints = FIXED_GENERATE_CONSTRAINTS;

  const normalizedBatchStatusFilter = String(batchStatusFilter || '').toLowerCase();
  const effectiveBatchStatusFilter = useMemo(() => {
    if (normalizedBatchStatusFilter) return normalizedBatchStatusFilter;
    if (!canManageSchedule && !canSubmitAction && !canApproveAction) return 'approved';
    return '';
  }, [normalizedBatchStatusFilter, canManageSchedule, canSubmitAction, canApproveAction]);

  const isExplicitBatchMode = effectiveBatchStatusFilter === 'submittable'
    || ['draft', 'submitted', 'approved', 'rejected'].includes(effectiveBatchStatusFilter);
  const canUseDirectStatusFilter = ['draft', 'submitted', 'approved', 'rejected'].includes(effectiveBatchStatusFilter);

  const fetchBatches = async () => {
    const params = {
      ...(canUseDirectStatusFilter ? { status: effectiveBatchStatusFilter } : {}),
      ...(hasGuruRole ? { scope } : {})
    };
    const { data } = await api.get('/schedule/batches', params ? { params } : undefined);
    return data || [];
  };

  const loadValidation = async (periodId, constraints = activeConstraints) => {
    if (!periodId) { setValidation(null); return; }
    try {
      const { data } = await api.post('/schedule/validate', { periodId: Number(periodId), constraints });
      setValidation(data);
    } catch (err) {
      setValidation(null);
      setError(err.response?.data?.message || 'Gagal memvalidasi data jadwal');
    }
  };

  const shouldLoadValidation = canGenerateAction;

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const batchParams = {
          ...(canUseDirectStatusFilter ? { status: effectiveBatchStatusFilter } : {}),
          ...(hasGuruRole ? { scope } : {})
        };
        const [periodRes, batchRes] = await Promise.all([
          fetchAllPages(api, '/period'),
          api.get('/schedule/batches', batchParams ? { params: batchParams } : undefined)
            .then(({ data }) => data || [])
        ]);
        const periodItems = periodRes || [];
        setPeriods(periodItems);
        setBatches(batchRes || []);
        if (periodItems.length) {
          const activePeriod = periodItems.find(p => p.isActive) || periodItems[0];
          setSelectedPeriod(prev => prev || String(activePeriod.id));
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat data');
      }
    };
    loadInitial();
  }, [canUseDirectStatusFilter, effectiveBatchStatusFilter, hasGuruRole, scope]);

  useEffect(() => {
    let active = true;
    const refreshBatches = async () => {
      try {
        const params = {
          ...(canUseDirectStatusFilter ? { status: effectiveBatchStatusFilter } : {}),
          ...(hasGuruRole ? { scope } : {})
        };
        const { data } = await api.get('/schedule/batches', params ? { params } : undefined);
        const nextBatches = data || [];
        if (active) setBatches(nextBatches);
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Gagal memuat batch jadwal');
      }
    };
    refreshBatches();
    return () => { active = false; };
  }, [scope, hasGuruRole, canUseDirectStatusFilter, effectiveBatchStatusFilter]);

  useEffect(() => {
    if (!selectedPeriod) { setSchedule([]); setValidation(null); setSolverResult(null); return; }
    if (isExplicitBatchMode && !selectedBatchId) { setSchedule([]); setValidation(null); setSolverResult(null); return; }
    const loadScheduleData = async () => {
      setLoading(true);
      try {
        const schedulePromise = api.get('/schedule', {
          params: { periodId: selectedPeriod, ...(selectedBatchId && { batchId: selectedBatchId }), ...(hasGuruRole ? { scope } : {}) }
        });
        const validationPromise = shouldLoadValidation
          ? api.post('/schedule/validate', { periodId: Number(selectedPeriod), constraints: activeConstraints })
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
  }, [selectedPeriod, selectedBatchId, activeConstraints, isExplicitBatchMode, shouldLoadValidation, hasGuruRole, scope]);

  const filteredBatches = useMemo(() => {
    if (!selectedPeriod) return [];
    const byPeriod = batches.filter(b => String(b.periodId) === String(selectedPeriod));
    if (effectiveBatchStatusFilter === 'submittable') return byPeriod.filter(b => ['draft', 'rejected'].includes(b.status));
    if (['draft', 'submitted', 'approved', 'rejected'].includes(effectiveBatchStatusFilter))
      return byPeriod.filter(b => b.status === effectiveBatchStatusFilter);
    return byPeriod;
  }, [batches, selectedPeriod, effectiveBatchStatusFilter]);

  useEffect(() => {
    if (!selectedPeriod || !filteredBatches.length) { setSelectedBatchId(''); return; }
    const currentStillValid = filteredBatches.some(b => String(b.id) === String(selectedBatchId));
    if (!currentStillValid) setSelectedBatchId(String(filteredBatches[0].id));
  }, [selectedPeriod, selectedBatchId, filteredBatches]);

  const currentBatch = useMemo(() => batches.find(b => String(b.id) === selectedBatchId) || null, [batches, selectedBatchId]);
  const canEditDraft = Boolean(canGenerateAction && currentBatch?.status === 'draft');

  const scheduleMatrix = useMemo(() => {
    const daySet = new Set();
    const rombelMap = new Map();
    const rowMap = new Map();
    const cellMap = new Map();
    schedule.forEach(item => {
      const day = Number(item.timeSlot?.dayOfWeek);
      const slotId = Number(item.timeSlot?.id);
      const rombelId = Number(item.teachingAssignment?.rombel?.id || item.rombelId);
      if (!day || !slotId || !rombelId) return;
      daySet.add(day);
      if (!rombelMap.has(rombelId)) {
        rombelMap.set(rombelId, {
          id: rombelId,
          name: item.teachingAssignment?.rombel?.name || `Rombel #${rombelId}`,
          type: item.teachingAssignment?.rombel?.type || null,
          gradeLevel: item.teachingAssignment?.rombel?.gradeLevel || null
        });
      }
      const dayKey = String(day);
      if (!rowMap.has(dayKey)) rowMap.set(dayKey, new Map());
      const dayRows = rowMap.get(dayKey);
      if (!dayRows.has(slotId)) {
        dayRows.set(slotId, {
          id: slotId, dayOfWeek: day,
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
    const rombels = [...rombelMap.values()].sort(compareRombelOrder);
    const rowsByDay = {};
    rowMap.forEach((rows, dayKey) => {
      rowsByDay[dayKey] = [...rows.values()].sort((a, b) => {
        const sd = normalizeTimeSortValue(a.startTime) - normalizeTimeSortValue(b.startTime);
        if (sd !== 0) return sd;
        const ed = normalizeTimeSortValue(a.endTime) - normalizeTimeSortValue(b.endTime);
        if (ed !== 0) return ed;
        return a.id - b.id;
      });
    });
    return { dayOptions, rombels, rowsByDay, cellMap };
  }, [schedule]);

  useEffect(() => {
    if (!scheduleMatrix.dayOptions.length) { setSelectedDay(1); return; }
    if (!scheduleMatrix.dayOptions.includes(selectedDay)) setSelectedDay(scheduleMatrix.dayOptions[0]);
  }, [scheduleMatrix.dayOptions, selectedDay]);

  const rowsForSelectedDay = useMemo(
    () => scheduleMatrix.rowsByDay[String(selectedDay)] || [],
    [scheduleMatrix.rowsByDay, selectedDay]
  );

  const assignmentOptions = useMemo(() => {
    const map = new Map();
    schedule.forEach(item => {
      const id = Number(item.teachingAssignment?.id);
      if (!id || map.has(id)) return;
      map.set(id, {
        id,
        label: `${item.teachingAssignment?.subject?.name || '-'} • ${item.teachingAssignment?.teacher?.name || '-'} • ${item.teachingAssignment?.rombel?.name || '-'}`
      });
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'id-ID'));
  }, [schedule]);

  const timeSlotOptions = useMemo(() => {
    const map = new Map();
    schedule.forEach(item => {
      const id = Number(item.timeSlot?.id);
      if (!id || map.has(id)) return;
      const day = dayLabels[item.timeSlot?.dayOfWeek] || `Hari ${item.timeSlot?.dayOfWeek || '-'}`;
      const start = item.timeSlot?.startTime || '--:--';
      const end = item.timeSlot?.endTime || '--:--';
      const lbl = item.timeSlot?.label ? ` • ${item.timeSlot.label}` : '';
      map.set(id, { id, label: `${day} • ${start} - ${end}${lbl}` });
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
      const { data } = await api.post('/schedule/generate', { periodId: Number(selectedPeriod), constraints: activeConstraints });
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
    if (!selectedPeriod && !selectedBatchId) { setError('Pilih periode atau batch terlebih dahulu sebelum export'); return; }
    setError(null);
    setExporting(true);
    try {
      const response = await api.get('/schedule/export', {
        params: { periodId: selectedPeriod || undefined, batchId: selectedBatchId || undefined, status: canUseDirectStatusFilter ? effectiveBatchStatusFilter : undefined, scope: hasGuruRole ? scope : undefined, format },
        responseType: 'blob'
      });
      const filename = extractFilenameFromDisposition(response.headers['content-disposition'], `jadwal-${selectedPeriod || 'all'}.${format}`);
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal export jadwal');
    } finally {
      setExporting(false);
    }
  };

  const openEditModal = (row) => {
    setEditForm({ id: row.id, timeSlotId: row.timeSlot?.id || '', teachingAssignmentId: row.teachingAssignment?.id || '', room: row.room || '' });
    setModal({ type: 'edit', item: row });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.id) return;
    try {
      await api.put(`/schedule/${editForm.id}`, { timeSlotId: Number(editForm.timeSlotId), teachingAssignmentId: Number(editForm.teachingAssignmentId), room: editForm.room.trim() || null });
      setModal({ type: null });
      setMessage('Draft berhasil diperbarui');
      const { data } = await api.get('/schedule', { params: { periodId: selectedPeriod, ...(selectedBatchId && { batchId: selectedBatchId }), ...(hasGuruRole ? { scope } : {}) } });
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
      const { data } = await api.post(endpoints[decisionForm.action], { notes: decisionForm.notes.trim() || null });
      setModal({ type: null });
      setMessage(data.message || 'Status batch berhasil diperbarui');
      const nextBatches = await fetchBatches();
      setBatches(nextBatches);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui status');
    }
  };

  const handleDeleteBatch = async () => {
    if (!currentBatch?.id) return;
    setDeleting(true);
    setError(null);
    try {
      const { data } = await api.delete(`/schedule/batches/${currentBatch.id}`);
      setModal({ type: null });
      setMessage(data.message || 'Batch jadwal berhasil dihapus');
      const nextBatches = await fetchBatches();
      setBatches(nextBatches);
      setSelectedBatchId('');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus batch jadwal');
      setModal({ type: null });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="text-slate-500 mt-1 text-sm">{pageDescription}</p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap items-end">
          <Select
            value={selectedPeriod}
            onChange={(e) => { setSelectedPeriod(e.target.value); setSelectedBatchId(''); setSolverResult(null); }}
          >
            <option value="">Pilih Periode</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>

          {hasGuruRole && (
            <Select value={scope} onChange={(e) => { setScope(e.target.value); setSelectedBatchId(''); }}>
              <option value="global">Jadwal Global</option>
              <option value="personal">Jadwal Saya</option>
            </Select>
          )}

          <Select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} disabled={!selectedPeriod || !filteredBatches.length}>
            {!selectedPeriod && <option value="">Pilih Periode dulu</option>}
            {selectedPeriod && !filteredBatches.length && <option value="">Belum ada batch</option>}
            {filteredBatches.map(batch => (
              <option key={batch.id} value={batch.id}>
                V{batch.versionNumber} · {batchStatusMeta[batch.status]?.label || batch.status}
              </option>
            ))}
          </Select>

          <div className="flex gap-2 flex-wrap">
            {canGenerateAction && (
              <Button onClick={handleGenerate} disabled={generating}>
                {generating
                  ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent mr-1" />Generating...</>
                  : '⚡ Generate Draft'
                }
              </Button>
            )}
            <Button variant="secondary" onClick={() => handleExport('xlsx')} disabled={exporting || (!selectedPeriod && !selectedBatchId)}>
              {exporting ? '...' : '↓ XLSX'}
            </Button>
            <Button variant="secondary" onClick={() => handleExport('pdf')} disabled={exporting || (!selectedPeriod && !selectedBatchId)}>
              {exporting ? '...' : '↓ PDF'}
            </Button>
          </div>
        </div>
      </div>

      {message && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="mt-0.5">✅</span>
          <span className="flex-1">{message}</span>
          <button onClick={() => setMessage(null)} className="text-emerald-400 hover:text-emerald-700 text-base leading-none">✕</button>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="mt-0.5">⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 text-base leading-none">✕</button>
        </div>
      )}

      {currentBatch && (
        <Card className="p-5">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-800">Batch V{currentBatch.versionNumber}</h2>
                  <Badge variant={batchStatusMeta[currentBatch.status]?.color || 'default'}>
                    {batchStatusMeta[currentBatch.status]?.label}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{currentBatch.periodName}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {currentBatch.scheduleCount || 0} sesi
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(canSubmitAction || canApproveAction) && (
                <>
                  {canSubmitAction && ['draft', 'rejected'].includes(currentBatch.status) && (
                    <Button size="sm" onClick={() => openDecisionModal('submit')}>Ajukan Pengesahan</Button>
                  )}
                  {canApproveAction && currentBatch.status === 'submitted' && (
                    <>
                      <Button size="sm" onClick={() => openDecisionModal('approve')}>✓ Setujui</Button>
                      <Button size="sm" variant="danger" onClick={() => openDecisionModal('reject')}>✕ Tolak</Button>
                    </>
                  )}
                </>
              )}
              {canGenerateAction && currentBatch.status !== 'approved' && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setModal({ type: 'delete', item: currentBatch })}
                >
                  🗑 Hapus Draft
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {shouldLoadValidation && validation && (
        <Card className={`p-5 ${validation.valid ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">{validation.valid ? '✅' : '⚠️'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-800">{validation.valid ? 'Data siap digenerate' : 'Data belum siap'}</p>
              <p className="text-xs text-slate-600 mt-0.5">{validation.message}</p>
              {!!validation.errors?.length && (
                <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
                  {validation.errors.slice(0, 5).map((item, i) => <li key={`${item.code}-${i}`}>• {item.message}</li>)}
                  {validation.errors.length > 5 && <li>... dan {validation.errors.length - 5} lainnya</li>}
                </ul>
              )}
              {!!validation.warnings?.length && (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {validation.warnings.slice(0, 3).map((item, i) => <li key={`${item.code}-${i}`}>• {item.message}</li>)}
                  {validation.warnings.length > 3 && <li>... dan {validation.warnings.length - 3} lainnya</li>}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {solverResult && (
        <Card className="border-sky-200 bg-sky-50/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-sky-100 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">🤖</span>
              <p className="font-bold text-sky-900 text-sm">Hasil Solver</p>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                {solverResult.summary?.engine || 'hybrid'}
              </span>
              {solverResult.summary?.feasible && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Feasible ✓</span>
              )}
            </div>
            <button onClick={() => setSolverResult(null)} className="text-sky-400 hover:text-sky-700 text-xs ml-4">tutup</button>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              {[
                { label: 'Sesi', value: solverResult.summary?.generatedItems ?? '-' },
                { label: 'Runtime Total', value: `${solverResult.summary?.runtimeMs?.total ?? '-'} ms` },
                { label: 'CP-SAT', value: `${solverResult.summary?.runtimeMs?.cpSat ?? '-'} ms` },
                { label: 'GA', value: `${solverResult.summary?.runtimeMs?.ga ?? '-'} ms` },
                { label: 'Penalty', value: solverResult.summary?.softPenalties?.final?.totalPenalty ?? '-' },
                { label: 'Kepatuhan', value: solverResult.summary?.distributionCompliance?.complianceRatePercent != null ? `${solverResult.summary.distributionCompliance.complianceRatePercent}%` : '-' },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-white/80 border border-sky-100 px-3 py-2.5">
                  <p className="text-lg font-extrabold text-sky-800">{s.value}</p>
                  <p className="text-[11px] text-sky-600 mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: 'Event OK', ok: solverResult.summary?.hardConstraints?.status?.eachEventScheduledExactlyOnce },
                { label: 'No Konflik Guru', ok: solverResult.summary?.hardConstraints?.status?.noTeacherConflict },
                { label: 'No Konflik Rombel', ok: solverResult.summary?.hardConstraints?.status?.noRombelConflict },
              ].map(c => (
                <span key={c.label} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {c.ok ? '✓' : '✕'} {c.label}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}



      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex-shrink-0">
              Matriks Jadwal
              {loading && <span className="ml-2 text-xs text-slate-400 font-normal normal-case animate-pulse">memuat...</span>}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(scheduleMatrix.dayOptions.length ? scheduleMatrix.dayOptions : [1, 2, 3, 4, 5, 6]).map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-100 ${selectedDay === day
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                >
                  {dayLabels[day] || `Hari ${day}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            {[
              { label: 'Wajib', bg: 'bg-emerald-100 border-emerald-200' },
              { label: 'Peminatan', bg: 'bg-amber-100 border-amber-200' },
              { label: 'Konflik', bg: 'bg-rose-100 border-rose-300' },
              { label: 'Kosong', bg: 'bg-white border-slate-200' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-5 rounded border ${l.bg}`} />
                <span className="text-slate-500">{l.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto relative">
          <div className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-white/70 to-transparent z-10 hidden sm:block" />

          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 min-w-[120px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Jam
                </th>
                {scheduleMatrix.rombels.map(rombel => (
                  <th key={rombel.id} className="min-w-[150px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left">
                    <div className="font-bold text-slate-800 truncate text-xs">{rombel.name}</div>
                    <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${rombel.type === 'peminatan' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                      {rombel.type === 'peminatan' ? 'Peminatan' : 'Utama'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {!rowsForSelectedDay.length && (
                <tr>
                  <td
                    colSpan={Math.max(2, scheduleMatrix.rombels.length + 1)}
                    className="border-b border-slate-100 px-4 py-14 text-center"
                  >
                    {loading ? (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
                        <span className="text-sm">Memuat jadwal...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <span className="text-4xl">📅</span>
                        <span className="text-sm">Belum ada jadwal untuk hari {dayLabels[selectedDay]}</span>
                        {!selectedPeriod && <span className="text-xs text-slate-400">Pilih periode terlebih dahulu.</span>}
                      </div>
                    )}
                  </td>
                </tr>
              )}

              {rowsForSelectedDay.map(slot => (
                <tr key={slot.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50/80 px-3 py-2.5 align-top transition-colors">
                    <p className="font-bold text-slate-700 whitespace-nowrap">{slot.label || `Slot ${slot.id}`}</p>
                    <p className="text-slate-400 mt-0.5 whitespace-nowrap">{slot.startTime} – {slot.endTime}</p>
                  </td>

                  {scheduleMatrix.rombels.map(rombel => {
                    const cellEntries = scheduleMatrix.cellMap.get(`${selectedDay}:${slot.id}:${rombel.id}`) || [];
                    const hasConflict = cellEntries.length > 1;

                    return (
                      <td key={`${slot.id}-${rombel.id}`} className="border-b border-r border-slate-200 px-1.5 py-1.5 align-top">
                        {!cellEntries.length ? (
                          <div className="min-h-[38px] rounded-md bg-slate-50/40 flex items-center justify-center">
                            <span className="text-slate-200 text-sm select-none">—</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {cellEntries.map(entry => {
                              const styleKey = getCellStyleKey(entry, hasConflict);
                              const s = cellStyleMap[styleKey];
                              const subjName = entry.teachingAssignment?.subject?.name || '-';
                              const teachName = entry.teachingAssignment?.teacher?.name || '-';

                              return (
                                <div key={entry.id} className={`rounded-md border px-2 py-1.5 ${s.wrap}`}>
                                  {hasConflict && (
                                    <span className="mb-1 inline-block rounded bg-rose-200 px-1 text-[9px] font-bold uppercase text-rose-800 tracking-wide">
                                      Konflik
                                    </span>
                                  )}
                                  <p className={`leading-tight truncate ${s.text}`} title={subjName}>{subjName}</p>
                                  <p className={`mt-0.5 truncate text-[11px] ${s.sub}`} title={teachName}>{teachName}</p>
                                  {entry.room && (
                                    <p className="mt-0.5 text-[10px] text-slate-400 truncate">📍 {entry.room}</p>
                                  )}
                                  {canEditDraft && (
                                    <button
                                      onClick={() => openEditModal(entry)}
                                      className="mt-1 w-full rounded bg-white/70 border border-slate-200 py-0.5 text-[10px] font-medium text-slate-500 hover:text-emerald-700 hover:bg-white transition"
                                    >
                                      Edit
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={modal.type === 'edit'} onClose={() => setModal({ type: null })} title="Edit Entri Jadwal">
        <form onSubmit={handleSaveEdit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pengampu</label>
              <Select value={editForm.teachingAssignmentId} onChange={e => setEditForm(p => ({ ...p, teachingAssignmentId: e.target.value }))}>
                <option value="">Pilih Pengampu</option>
                {assignmentOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Slot Waktu</label>
              <Select value={editForm.timeSlotId} onChange={e => setEditForm(p => ({ ...p, timeSlotId: e.target.value }))}>
                <option value="">Pilih Slot</option>
                {timeSlotOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ruang (Opsional)</label>
            <Input value={editForm.room} onChange={e => setEditForm(p => ({ ...p, room: e.target.value }))} placeholder="mis. Lab Kimia, Ruang 12" />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Button type="submit" className="flex-1">Simpan Perubahan</Button>
            <Button type="button" variant="secondary" onClick={() => setModal({ type: null })}>Batal</Button>
          </div>
        </form>
      </Modal>

      {['submit', 'approve', 'reject'].includes(modal.type) && (
        <Modal
          isOpen={true}
          onClose={() => setModal({ type: null })}
          title={
            modal.type === 'submit' ? 'Ajukan Batch untuk Pengesahan' :
              modal.type === 'approve' ? 'Setujui Batch Jadwal' : 'Tolak Batch Jadwal'
          }
        >
          <form onSubmit={handleBatchDecision} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Catatan</label>
              <textarea
                value={decisionForm.notes}
                onChange={e => setDecisionForm(p => ({ ...p, notes: e.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition resize-none"
                placeholder="Catatan tambahan (opsional)..."
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant={modal.type === 'reject' ? 'danger' : 'primary'} className="flex-1">
                {modal.type === 'submit' && '📤 Ajukan'}
                {modal.type === 'approve' && '✓ Setujui'}
                {modal.type === 'reject' && '✕ Tolak'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setModal({ type: null })}>Batal</Button>
            </div>
          </form>
        </Modal>
      )}

      <Modal
        isOpen={modal.type === 'delete'}
        onClose={() => !deleting && setModal({ type: null })}
        title="Hapus Draft Jadwal"
      >
        {modal.item && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">Batch V{modal.item.versionNumber}</span>
                <Badge variant={batchStatusMeta[modal.item.status]?.color || 'default'}>
                  {batchStatusMeta[modal.item.status]?.label}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">{modal.item.periodName}</p>
              <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                <div>
                  <span className="text-slate-400 block">Status</span>
                  <span className="font-semibold text-slate-700">
                    {modal.item.status === 'draft' && 'Belum diajukan'}
                    {modal.item.status === 'submitted' && 'Sedang diajukan'}
                    {modal.item.status === 'rejected' && 'Ditolak'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Sesi Jadwal</span>
                  <span className="font-semibold text-slate-700">{modal.item.scheduleCount || 0} sesi</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <span className="text-rose-500 text-lg mt-0.5">⚠️</span>
              <div className="text-sm text-rose-700">
                <p className="font-semibold">Tindakan ini tidak dapat dibatalkan</p>
                <p className="mt-1 text-xs text-rose-600">
                  Seluruh {modal.item.scheduleCount || 0} sesi jadwal dalam batch ini akan dihapus permanen.
                  {modal.item.status === 'submitted' && (
                    <span className="block mt-1 font-semibold">Batch ini sedang dalam proses pengajuan pengesahan.</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleDeleteBatch}
                disabled={deleting}
              >
                {deleting
                  ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent mr-1.5" />Menghapus...</>
                  : '🗑 Ya, Hapus Permanen'
                }
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModal({ type: null })}
                disabled={deleting}
              >
                Batal
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Jadwal;
