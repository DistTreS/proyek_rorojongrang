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
import { motion } from 'framer-motion';
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

const Jadwal = () => {
  const { roles } = useAuth();
  const allowGenerate = canAccess(roles, SCHEDULING_MANAGER_ROLES);

  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [editForm, setEditForm] = useState({ id: null, timeSlotId: '', teachingAssignmentId: '', room: '' });
  const [decisionForm, setDecisionForm] = useState({ action: '', notes: '' });

  // Load initial data
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [periodRes, batchRes] = await Promise.all([
          fetchAllPages(api, '/period'),
          api.get('/schedule/batches')
        ]);
        setPeriods(periodRes || []);
        setBatches(batchRes.data || []);
      } catch (err) {
        setError('Gagal memuat data');
      }
    };
    loadInitial();
  }, []);

  // Load schedule when period or batch changes
  useEffect(() => {
    if (!selectedPeriod) return;
    const loadScheduleData = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/schedule', {
          params: { periodId: selectedPeriod, ...(selectedBatchId && { batchId: selectedBatchId }) }
        });
        setSchedule(data);
      } catch (err) {
        setError('Gagal memuat jadwal');
      } finally {
        setLoading(false);
      }
    };
    loadScheduleData();
  }, [selectedPeriod, selectedBatchId]);

  const currentBatch = useMemo(() => 
    batches.find(b => String(b.id) === selectedBatchId) || null, 
    [batches, selectedBatchId]
  );

  const handleGenerate = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);
    setError(null);
    try {
      const { data } = await api.post('/schedule/generate', { periodId: Number(selectedPeriod) });
      setMessage(data.message || 'Draft jadwal berhasil digenerate');
      const batchRes = await api.get('/schedule/batches');
      setBatches(batchRes.data || []);
      if (data.batch?.id) setSelectedBatchId(String(data.batch.id));
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal generate draft');
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
      const { data } = await api.get('/schedule', { params: { periodId: selectedPeriod } });
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
      const batchRes = await api.get('/schedule/batches');
      setBatches(batchRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui status');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Jadwal Pelajaran</h1>
          <p className="text-slate-600 mt-1">Generate otomatis dan kelola jadwal mingguan</p>
        </div>

        <div className="flex gap-3">
          <Select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
            <option value="">Pilih Periode</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>

          {allowGenerate && (
            <Button onClick={handleGenerate} disabled={generating} size="lg">
              {generating ? 'Generating...' : 'Generate Draft Jadwal'}
            </Button>
          )}
        </div>
      </div>

      {/* Batch Info */}
      {currentBatch && (
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Batch V{currentBatch.versionNumber}</h2>
                <Badge variant={batchStatusMeta[currentBatch.status]?.color || 'default'}>
                  {batchStatusMeta[currentBatch.status]?.label}
                </Badge>
              </div>
              <p className="text-slate-600 mt-1">{currentBatch.periodName}</p>
            </div>
            <div className="text-right text-sm text-slate-500">
              {currentBatch.scheduleCount || 0} sesi
            </div>
          </div>
        </Card>
      )}

      {/* Validation */}
      {validation && (
        <Card className={`p-6 ${validation.valid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="font-semibold">{validation.valid ? '✅ Data siap digenerate' : '⚠️ Data belum siap'}</p>
          <p className="text-sm mt-1">{validation.message}</p>
        </Card>
      )}

      {/* Schedule Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Daftar Jadwal</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-xs font-semibold text-slate-500">
                <th className="py-4 text-left">Rombel</th>
                <th className="py-4 text-left">Hari</th>
                <th className="py-4 text-left">Jam</th>
                <th className="py-4 text-left">Mapel</th>
                <th className="py-4 text-left">Guru</th>
                <th className="py-4 text-left">Label</th>
                <th className="py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map(row => (
                <tr key={row.id} className="border-b hover:bg-neutral-50">
                  <td className="py-4 font-medium">{row.teachingAssignment?.rombel?.name}</td>
                  <td className="py-4">{dayLabels[row.timeSlot?.dayOfWeek]}</td>
                  <td className="py-4">{row.timeSlot?.startTime} - {row.timeSlot?.endTime}</td>
                  <td className="py-4">{row.teachingAssignment?.subject?.name}</td>
                  <td className="py-4">{row.teachingAssignment?.teacher?.name}</td>
                  <td className="py-4 text-sm text-slate-500">{row.timeSlot?.label || '-'}</td>
                  <td className="py-4 text-right">
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(row)}>
                      Edit
                    </Button>
                  </td>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Pengampu</label>
              <Select value={editForm.teachingAssignmentId} onChange={(e) => setEditForm(prev => ({...prev, teachingAssignmentId: e.target.value}))}>
                {/* Isi select pengampu bisa ditambahkan sesuai logic asli */}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Time Slot</label>
              <Select value={editForm.timeSlotId} onChange={(e) => setEditForm(prev => ({...prev, timeSlotId: e.target.value}))}>
                {/* Isi select time slot bisa ditambahkan sesuai logic asli */}
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ruang (Opsional)</label>
            <Input value={editForm.room} onChange={(e) => setEditForm(prev => ({...prev, room: e.target.value}))} />
          </div>
          <div className="flex gap-3">
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
            <div className="flex gap-3">
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
