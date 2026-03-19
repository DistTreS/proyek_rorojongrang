import { useEffect, useMemo, useState } from 'react';
import { ROLES, SCHEDULING_MANAGER_ROLES, canAccess } from '../constants/rbac';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

const dayLabels = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu'
};

const batchStatusMeta = {
  draft: { label: 'Draft', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  submitted: { label: 'Diajukan', tone: 'bg-sky-100 text-sky-800 border-sky-200' },
  approved: { label: 'Disetujui', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Ditolak', tone: 'bg-rose-100 text-rose-800 border-rose-200' }
};

const statusActionLabels = {
  draft: 'Draft dibuat',
  submitted: 'Diajukan',
  approved: 'Disetujui',
  rejected: 'Ditolak'
};

const ValidationPanel = ({ validation, validating }) => {
  if (validating) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Memeriksa kesiapan data penjadwalan...
      </div>
    );
  }

  if (!validation) {
    return null;
  }

  const tone = validation.valid
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className={`rounded-2xl border px-4 py-4 ${tone}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold">
            {validation.valid ? 'Data siap digenerate' : 'Data belum siap digenerate'}
          </div>
          <div className="text-sm">{validation.message}</div>
        </div>
        {validation.summary && (
          <div className="text-xs">
            Rombel {validation.summary.counts?.rombels || 0} • Mapel {validation.summary.counts?.subjects || 0} •
            Pengampu {validation.summary.counts?.teachingAssignments || 0} • Slot {validation.summary.counts?.timeSlots || 0}
          </div>
        )}
      </div>

      {validation.errors?.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide">Masalah Yang Harus Diperbaiki</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {validation.errors.map((item, index) => (
              <li key={`${item.code}-${index}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings?.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide">Peringatan</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {validation.warnings.map((item, index) => (
              <li key={`${item.code}-${index}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const BatchBadge = ({ status }) => {
  const meta = batchStatusMeta[status] || batchStatusMeta.draft;
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>
      {meta.label}
    </span>
  );
};

const chooseDefaultBatch = (items, canGenerate) => {
  if (!items.length) return null;

  if (canGenerate) {
    return items.find((item) => item.status === 'draft') || items[0];
  }

  return items.find((item) => item.status === 'approved') || items[0];
};

const buildAssignmentLabel = (item) => {
  const rombel = item.rombel?.name || '-';
  const subject = item.subject?.name || '-';
  const teacher = item.teacher?.name || '-';
  return `${rombel} • ${subject} • ${teacher}`;
};

const buildTimeSlotLabel = (slot) => {
  const day = dayLabels[slot.dayOfWeek] || '-';
  return `${day} • ${slot.startTime} - ${slot.endTime}${slot.label ? ` • ${slot.label}` : ''}`;
};

const Jadwal = ({
  pageTitle = 'Jadwal Pelajaran',
  pageDescription = 'Generate otomatis dengan CP-SAT + GA dan lihat jadwal mingguan.',
  canGenerate = true,
  canSubmit = false,
  canApprove = false,
  batchStatusFilter = ''
}) => {
  const { roles } = useAuth();
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [validation, setValidation] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [editForm, setEditForm] = useState({ id: null, timeSlotId: '', teachingAssignmentId: '', room: '' });
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [decisionForm, setDecisionForm] = useState({ action: '', notes: '' });

  const allowGenerate = canGenerate && canAccess(roles, SCHEDULING_MANAGER_ROLES);
  const allowSubmit = canSubmit && canAccess(roles, [ROLES.WAKASEK]);
  const allowApprove = canApprove && canAccess(roles, [ROLES.KEPALA_SEKOLAH]);
  const isTeacherView = canAccess(roles, [ROLES.GURU]) && !allowGenerate && !allowSubmit && !allowApprove;
  const useDerivedPeriods = isTeacherView || allowApprove;

  const currentBatch = useMemo(
    () => batches.find((item) => item.id === Number(selectedBatchId)) || null,
    [batches, selectedBatchId]
  );
  const isDraftBatch = currentBatch?.status === 'draft';

  const loadPeriods = async () => {
    if (useDerivedPeriods) {
      return;
    }

    try {
      const { data } = await api.get('/period');
      setPeriods(data);
      const active = data.find((period) => period.isActive);
      if (active && !selectedPeriod) {
        setSelectedPeriod(String(active.id));
      }
    } catch {
      setError('Gagal memuat periode');
    }
  };

  const loadBatches = async (periodId, { preferredBatchId } = {}) => {
    if (!periodId && !useDerivedPeriods) {
      setBatches([]);
      setSelectedBatchId('');
      return [];
    }

    try {
      const { data } = await api.get('/schedule/batches', {
        params: {
          ...(periodId ? { periodId: Number(periodId) } : {}),
          ...(batchStatusFilter ? { status: batchStatusFilter } : {})
        }
      });

      let visibleBatches = data;
      if (useDerivedPeriods) {
        const derivedPeriods = [...new Map(
          data
            .filter((item) => item.periodId)
            .map((item) => [item.periodId, { id: item.periodId, name: item.periodName || `Periode ${item.periodId}` }])
        ).values()];
        setPeriods(derivedPeriods);

        const targetPeriodId = periodId || derivedPeriods[0]?.id || '';
        if (!periodId && targetPeriodId) {
          setSelectedPeriod(String(targetPeriodId));
        }
        visibleBatches = targetPeriodId
          ? data.filter((item) => item.periodId === Number(targetPeriodId))
          : [];
      }

      setBatches(visibleBatches);

      let nextBatch = null;
      if (preferredBatchId) {
        nextBatch = visibleBatches.find((item) => item.id === Number(preferredBatchId)) || null;
      }
      if (!nextBatch && selectedBatchId) {
        nextBatch = visibleBatches.find((item) => item.id === Number(selectedBatchId)) || null;
      }
      if (!nextBatch) {
        nextBatch = chooseDefaultBatch(visibleBatches, allowGenerate);
      }

      setSelectedBatchId(nextBatch ? String(nextBatch.id) : '');
      return visibleBatches;
    } catch (err) {
      setBatches([]);
      setSelectedBatchId('');
      setError(err.response?.data?.message || 'Gagal memuat batch jadwal');
      return [];
    }
  };

  const loadSchedule = async ({ periodId, batchId }) => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/schedule', {
        params: {
          periodId,
          ...(batchStatusFilter ? { status: batchStatusFilter } : {}),
          ...(batchId ? { batchId: Number(batchId) } : {})
        }
      });
      setSchedule(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  };

  const loadDraftEditingOptions = async (periodId) => {
    if (!periodId || !allowGenerate) {
      setAssignments([]);
      setTimeSlots([]);
      return;
    }

    try {
      const [assignmentRes, slotRes] = await Promise.all([
        api.get('/pengampu', { params: { periodId: Number(periodId) } }),
        api.get('/jam', { params: { periodId: Number(periodId) } })
      ]);
      setAssignments(assignmentRes.data || []);
      setTimeSlots(slotRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat opsi edit draft jadwal');
    }
  };

  const loadValidation = async (periodId) => {
    if (!periodId || !allowGenerate) {
      setValidation(null);
      return null;
    }

    setValidating(true);
    try {
      const { data } = await api.get('/schedule/validate', {
        params: { periodId: Number(periodId) }
      });
      setValidation(data);
      return data;
    } catch (err) {
      setValidation(null);
      setError(err.response?.data?.message || 'Gagal memvalidasi kesiapan generate jadwal');
      return null;
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, [useDerivedPeriods]);

  useEffect(() => {
    if (!selectedPeriod) {
      if (useDerivedPeriods) {
        loadBatches('');
        return;
      }
      setSchedule([]);
      setValidation(null);
      setBatches([]);
      setSelectedBatchId('');
      return;
    }

    loadBatches(selectedPeriod);
    loadDraftEditingOptions(selectedPeriod);
    if (allowGenerate) {
      loadValidation(selectedPeriod);
    }
  }, [selectedPeriod, allowGenerate, batchStatusFilter, useDerivedPeriods]);

  useEffect(() => {
    if (!selectedPeriod) return;
    loadSchedule({ periodId: selectedPeriod, batchId: selectedBatchId });
  }, [selectedPeriod, selectedBatchId]);

  const handleGenerate = async () => {
    if (!selectedPeriod) {
      setError('Pilih periode terlebih dahulu');
      return;
    }

    setGenerating(true);
    setError(null);
    setMessage(null);

    try {
      const latestValidation = await loadValidation(selectedPeriod);
      if (!latestValidation) return;
      if (!latestValidation.valid) {
        setError(latestValidation.message || 'Data penjadwalan belum siap untuk generate');
        return;
      }

      const { data } = await api.post('/schedule/generate', { periodId: Number(selectedPeriod) });
      setMessage(data.message || 'Draft jadwal berhasil digenerate');
      await loadBatches(selectedPeriod, { preferredBatchId: data.batch?.id });
      await Promise.all([
        loadDraftEditingOptions(selectedPeriod),
        loadValidation(selectedPeriod)
      ]);
    } catch (err) {
      const payload = err.response?.data;
      if (payload?.errors) {
        setValidation(payload);
      }
      setError(payload?.message || 'Gagal generate draft jadwal');
    } finally {
      setGenerating(false);
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

  const closeModal = () => {
    setModal({ type: null, item: null });
    setEditForm({ id: null, timeSlotId: '', teachingAssignmentId: '', room: '' });
    setDecisionForm({ action: '', notes: '' });
  };

  const openDecisionModal = (action) => {
    setDecisionForm({ action, notes: currentBatch?.notes || '' });
    setModal({ type: action, item: currentBatch });
  };

  const handleBatchDecision = async (event) => {
    event.preventDefault();
    if (!currentBatch?.id || !decisionForm.action) {
      return;
    }

    const endpoints = {
      submit: `/schedule/batches/${currentBatch.id}/submit`,
      approve: `/schedule/batches/${currentBatch.id}/approve`,
      reject: `/schedule/batches/${currentBatch.id}/reject`
    };

    setDecisionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await api.post(endpoints[decisionForm.action], {
        notes: decisionForm.notes.trim() || null
      });
      closeModal();
      setMessage(data.message || 'Status batch jadwal berhasil diperbarui');
      await loadBatches(selectedPeriod, { preferredBatchId: data.batch?.id || currentBatch.id });
      await loadSchedule({
        periodId: selectedPeriod,
        batchId: batchStatusFilter ? null : (data.batch?.id || currentBatch.id)
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui status batch jadwal');
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editForm.id || !editForm.timeSlotId || !editForm.teachingAssignmentId) {
      setError('Pengampu dan time slot wajib dipilih');
      return;
    }

    setSavingEdit(true);
    setError(null);
    try {
      await api.put(`/schedule/${editForm.id}`, {
        timeSlotId: Number(editForm.timeSlotId),
        teachingAssignmentId: Number(editForm.teachingAssignmentId),
        room: editForm.room.trim() || null
      });
      closeModal();
      await loadSchedule({ periodId: selectedPeriod, batchId: selectedBatchId });
      setMessage('Draft jadwal berhasil diperbarui');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui draft jadwal');
    } finally {
      setSavingEdit(false);
    }
  };

  const rows = useMemo(() => (
    schedule.map((item) => ({
      ...item,
      day: dayLabels[item.timeSlot?.dayOfWeek] || '-',
      time: item.timeSlot ? `${item.timeSlot.startTime} - ${item.timeSlot.endTime}` : '-'
    }))
  ), [schedule]);

  const generateDisabled = generating || validating || !selectedPeriod || (allowGenerate && validation?.valid === false);
  const canSubmitCurrentBatch = allowSubmit && currentBatch && ['draft', 'rejected'].includes(currentBatch.status);
  const canApproveCurrentBatch = allowApprove && currentBatch?.status === 'submitted';
  const historyItems = currentBatch?.logs || [];
  const batchSummary = currentBatch?.summary || null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="text-sm text-slate-600">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">Pilih periode</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name}</option>
            ))}
          </select>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            disabled={!batches.length}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100"
          >
            <option value="">Pilih batch</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                V{batch.versionNumber} • {batchStatusMeta[batch.status]?.label || batch.status}
              </option>
            ))}
          </select>
          {allowGenerate && (
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
              type="button"
              onClick={handleGenerate}
              disabled={generateDisabled}
            >
              {generating ? 'Generating...' : validating ? 'Memvalidasi...' : 'Generate Draft'}
            </button>
          )}
        </div>
      </div>

      {currentBatch && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Batch Jadwal V{currentBatch.versionNumber}
                </h2>
                <BatchBadge status={currentBatch.status} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {currentBatch.periodName || 'Periode tidak diketahui'}
              </p>
              {(currentBatch.submittedByUsername || currentBatch.submittedAt) && (
                <p className="mt-1 text-xs text-slate-500">
                  Diajukan oleh {currentBatch.submittedByUsername || '-'}
                  {currentBatch.submittedAt ? ` • ${new Date(currentBatch.submittedAt).toLocaleString('id-ID')}` : ''}
                </p>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {currentBatch.scheduleCount || 0} sesi
            </div>
          </div>
          {currentBatch.notes && (
            <div className="mt-3 text-sm text-slate-700">{currentBatch.notes}</div>
          )}
          {batchSummary && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Total Slot</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{batchSummary.totalSlots || 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Rombel</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{batchSummary.totalRombels || 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Guru</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{batchSummary.totalTeachers || 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Mapel</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{batchSummary.totalSubjects || 0}</div>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${batchSummary.totalConflicts ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className={`text-xs uppercase tracking-wide ${batchSummary.totalConflicts ? 'text-rose-600' : 'text-emerald-700'}`}>Total Konflik</div>
                <div className={`mt-1 text-lg font-semibold ${batchSummary.totalConflicts ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {batchSummary.totalConflicts || 0}
                </div>
              </div>
            </div>
          )}
          {batchSummary && batchSummary.totalConflicts > 0 && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">
              Konflik terdeteksi: guru bentrok {batchSummary.conflicts?.teacherSlot || 0}, rombel bentrok {batchSummary.conflicts?.rombelSlot || 0}, inkonsistensi periode {batchSummary.conflicts?.invalidPeriod || 0}.
            </div>
          )}
          {(canSubmitCurrentBatch || canApproveCurrentBatch) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {canSubmitCurrentBatch && (
                <button
                  type="button"
                  onClick={() => openDecisionModal('submit')}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-700"
                >
                  Ajukan untuk Pengesahan
                </button>
              )}
              {canApproveCurrentBatch && (
                <>
                  <button
                    type="button"
                    onClick={() => openDecisionModal('approve')}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
                  >
                    Setujui Jadwal
                  </button>
                  <button
                    type="button"
                    onClick={() => openDecisionModal('reject')}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700"
                  >
                    Tolak Jadwal
                  </button>
                </>
              )}
            </div>
          )}
          {currentBatch.status !== 'approved' && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Batch ini belum menjadi jadwal resmi. Jadwal final hanya batch yang berstatus disetujui.
            </div>
          )}
          {historyItems.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Riwayat Status</div>
              <div className="mt-3 grid gap-3">
                {historyItems.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-semibold text-slate-900">
                        {statusActionLabels[log.toStatus] || log.toStatus}
                      </div>
                      <div className="text-xs text-slate-500">
                        {log.actorUsername || 'Sistem'} • {new Date(log.createdAt).toLocaleString('id-ID')}
                      </div>
                    </div>
                    {(log.fromStatus || log.toStatus) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {log.fromStatus ? `${batchStatusMeta[log.fromStatus]?.label || log.fromStatus} → ` : ''}
                        {batchStatusMeta[log.toStatus]?.label || log.toStatus}
                      </div>
                    )}
                    {log.notes && (
                      <div className="mt-2 text-sm text-slate-700">{log.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {allowGenerate && (
        <ValidationPanel validation={validation} validating={validating} />
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Jadwal Batch</h2>
          <span className="text-xs text-slate-500">{rows.length} sesi</span>
        </div>
        <div className="mt-5 hidden grid-cols-[1.2fr_0.8fr_1.2fr_1.2fr_1.1fr_0.8fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Rombel</div>
          <div>Hari</div>
          <div>Jam</div>
          <div>Mapel</div>
          <div>Guru</div>
          <div>Label</div>
          <div>Aksi</div>
        </div>
        <div className="mt-4 grid gap-4">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_0.8fr_1.2fr_1.2fr_1.1fr_0.8fr_0.8fr] md:items-center"
            >
              <div className="text-sm font-semibold text-slate-900">{row.teachingAssignment?.rombel?.name || '-'}</div>
              <div className="text-sm text-slate-700">{row.day}</div>
              <div className="text-sm text-slate-700">{row.time}</div>
              <div className="text-sm text-slate-700">{row.teachingAssignment?.subject?.name || '-'}</div>
              <div className="text-sm text-slate-700">{row.teachingAssignment?.teacher?.name || '-'}</div>
              <div className="text-sm text-slate-700">{row.timeSlot?.label || '-'}</div>
              <div className="flex flex-wrap gap-2">
                {allowGenerate && isDraftBatch ? (
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    onClick={() => openEditModal(row)}
                  >
                    Edit
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Read only</span>
                )}
              </div>
            </div>
          ))}
          {!rows.length && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada jadwal untuk batch ini.
            </div>
          )}
        </div>
      </div>

      {modal.type === 'edit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <form
            className="relative w-full max-w-2xl space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
            onSubmit={handleSaveEdit}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Edit Draft Jadwal</h3>
              <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                Tutup
              </button>
            </div>
            {modal.item && (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <span className="text-xs uppercase text-slate-500">Posisi Saat Ini</span>
                  <div className="font-semibold">
                    {modal.item.teachingAssignment?.rombel?.name || '-'} • {modal.item.day} • {modal.item.time}
                  </div>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500">Pengampu Saat Ini</span>
                  <div className="font-semibold">
                    {buildAssignmentLabel({
                      rombel: modal.item.teachingAssignment?.rombel,
                      subject: modal.item.teachingAssignment?.subject,
                      teacher: modal.item.teachingAssignment?.teacher
                    })}
                  </div>
                </div>
              </div>
            )}
            <p className="text-sm text-slate-600">
              Anda bisa memindahkan time slot, mengganti pengampu, atau keduanya sekaligus. Perubahan hanya diizinkan pada batch draft dan akan ditolak jika menimbulkan bentrok guru atau rombel.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Pengampu
                <select
                  value={editForm.teachingAssignmentId}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, teachingAssignmentId: e.target.value }))}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Pilih pengampu</option>
                  {assignments.map((item) => (
                    <option key={item.id} value={item.id}>{buildAssignmentLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Time Slot
                <select
                  value={editForm.timeSlotId}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, timeSlotId: e.target.value }))}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Pilih slot</option>
                  {timeSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>{buildTimeSlotLabel(slot)}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                Ruang (Opsional)
                <input
                  value={editForm.room}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, room: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                />
              </label>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
                type="submit"
                disabled={savingEdit}
              >
                {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                type="button"
                onClick={closeModal}
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {['submit', 'approve', 'reject'].includes(modal.type) && currentBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <form
            className="relative w-full max-w-xl space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
            onSubmit={handleBatchDecision}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {modal.type === 'submit' && 'Ajukan Jadwal'}
                {modal.type === 'approve' && 'Setujui Jadwal'}
                {modal.type === 'reject' && 'Tolak Jadwal'}
              </h3>
              <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                Tutup
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Batch V{currentBatch.versionNumber} untuk periode {currentBatch.periodName || '-'} sedang berstatus{' '}
              <span className="font-semibold">{batchStatusMeta[currentBatch.status]?.label || currentBatch.status}</span>.
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Catatan {modal.type === 'submit' ? '(opsional)' : '(opsional, disarankan)'}
              <textarea
                value={decisionForm.notes}
                onChange={(e) => setDecisionForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={4}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                placeholder={
                  modal.type === 'reject'
                    ? 'Tuliskan alasan penolakan atau revisi yang dibutuhkan'
                    : 'Catatan tambahan untuk status batch ini'
                }
              />
            </label>
            <div className="flex gap-3">
              <button
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
                  modal.type === 'reject'
                    ? 'bg-rose-600 shadow-lg shadow-rose-200 hover:bg-rose-700'
                    : modal.type === 'approve'
                      ? 'bg-emerald-600 shadow-lg shadow-emerald-200 hover:bg-emerald-700'
                      : 'bg-sky-600 shadow-lg shadow-sky-200 hover:bg-sky-700'
                }`}
                type="submit"
                disabled={decisionLoading}
              >
                {decisionLoading ? 'Memproses...' : modal.type === 'submit' ? 'Ajukan Batch' : modal.type === 'approve' ? 'Setujui Batch' : 'Tolak Batch'}
              </button>
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                type="button"
                onClick={closeModal}
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export default Jadwal;
