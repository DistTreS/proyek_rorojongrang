import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import {
  buildPageParams,
  DEFAULT_PAGE_SIZE,
  fetchAllPages,
  normalizePaginatedResponse
} from '../utils/pagination';

const dayOptions = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' }
];

const preferenceOptions = [
  { value: 'prefer', label: 'Preferensi' },
  { value: 'avoid', label: 'Hindari' }
];

const emptyForm = {
  teacherId: '',
  periodId: '',
  dayOfWeek: 1,
  startTime: '',
  endTime: '',
  preferenceType: 'avoid',
  notes: ''
};

const TeacherPreferences = () => {
  const [preferences, setPreferences] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [filterPeriodId, setFilterPeriodId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });

  const load = async (nextPage = page, nextPeriodId = filterPeriodId) => {
    setLoading(true);
    setError(null);
    try {
      const [preferenceRes, tendikRes, periodRes] = await Promise.all([
        api.get('/teacher-preferences', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE,
            periodId: nextPeriodId || undefined
          })
        }),
        fetchAllPages(api, '/tendik'),
        fetchAllPages(api, '/period')
      ]);

      const normalized = normalizePaginatedResponse(preferenceRes.data);
      setPreferences(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
      setTeachers((tendikRes || []).filter(item => item.user?.roles?.includes('guru')));
      setPeriods(periodRes || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat preferensi guru');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, filterPeriodId);
  }, []);

  const teacherMap = useMemo(() => new Map(teachers.map(item => [item.id, item])), [teachers]);
  const periodMap = useMemo(() => new Map(periods.map(item => [item.id, item])), [periods]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const closeModal = () => {
    setModal({ type: null });
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create' });
  };

  const openDetail = (preference) => {
    setModal({ type: 'detail', item: preference });
  };

  const handleEdit = (preference) => {
    setEditingId(preference.id);
    setForm({
      teacherId: preference.teacherId || '',
      periodId: preference.periodId || '',
      dayOfWeek: preference.dayOfWeek || 1,
      startTime: preference.startTime?.slice(0, 5) || '',
      endTime: preference.endTime?.slice(0, 5) || '',
      preferenceType: preference.preferenceType || 'avoid',
      notes: preference.notes || ''
    });
    setModal({ type: 'edit' });
  };

  const handleDelete = (preference) => {
    setModal({ type: 'delete', item: preference });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/teacher-preferences/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus preferensi');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.teacherId || !form.periodId || !form.startTime || !form.endTime) {
      setError('Guru, periode, jam mulai, dan jam selesai wajib diisi');
      return;
    }
    if (form.startTime >= form.endTime) {
      setError('Jam selesai harus setelah jam mulai');
      return;
    }

    const payload = {
      teacherId: Number(form.teacherId),
      periodId: Number(form.periodId),
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      preferenceType: form.preferenceType,
      notes: form.notes.trim() || null
    };

    try {
      if (editingId) {
        await api.put(`/teacher-preferences/${editingId}`, payload);
      } else {
        await api.post('/teacher-preferences', payload);
      }
      closeModal();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan preferensi');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Preferensi Penjadwalan Guru</h1>
          <p className="text-slate-600 mt-1">Kelola preferensi dan larangan jadwal guru per periode</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Tambah Preferensi
        </Button>
      </div>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      {/* Filter */}
      <Card className="p-6">
        <Select
          value={filterPeriodId}
          onChange={(e) => {
            const val = e.target.value;
            setFilterPeriodId(val);
            load(1, val);
          }}
          className="w-full md:w-80"
        >
          <option value="">Semua Periode</option>
          {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Card>

      {/* Daftar Preferensi */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Preferensi Guru</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} preferensi</span>
        </div>

        <div className="space-y-4">
          {preferences.map(item => (
            <Card key={item.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.2fr_0.8fr_1fr_1fr_0.8fr] gap-4 md:items-center">
                <div className="text-sm font-semibold text-slate-900">
                  {teacherMap.get(item.teacherId)?.name || item.teacher?.name || '-'}
                </div>
                <div className="text-sm text-slate-700">
                  {periodMap.get(item.periodId)?.name || item.period?.name || '-'}
                </div>
                <div className="text-sm text-slate-700">
                  {dayOptions.find(d => d.value === item.dayOfWeek)?.label || '-'}
                </div>
                <div className="text-sm text-slate-700">
                  {item.startTime} - {item.endTime}
                </div>
                <div>
                  <Badge variant={item.preferenceType === 'prefer' ? 'success' : 'danger'}>
                    {item.preferenceType === 'prefer' ? 'Preferensi' : 'Hindari'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(item)}>
                    Detail
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(item)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(item)}>
                    Hapus
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {!preferences.length && !loading && (
            <div className="text-center py-12 text-slate-500">Belum ada data preferensi guru.</div>
          )}
        </div>

        <div className="mt-8 flex justify-center">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={(nextPage) => load(nextPage, filterPeriodId)}
          />
        </div>
      </Card>

      {/* Modal */}
      <Modal
        isOpen={!!modal.type}
        onClose={closeModal}
        title={
          modal.type === 'create' ? 'Tambah Preferensi' :
          modal.type === 'edit' ? 'Edit Preferensi' :
          modal.type === 'detail' ? 'Detail Preferensi' : 'Hapus Preferensi'
        }
      >
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Guru</label>
                <Select value={form.teacherId} onChange={e => updateForm('teacherId', e.target.value)} required>
                  <option value="">Pilih Guru</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Periode</label>
                <Select value={form.periodId} onChange={e => updateForm('periodId', e.target.value)} required>
                  <option value="">Pilih Periode</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Hari</label>
                <Select value={form.dayOfWeek} onChange={e => updateForm('dayOfWeek', e.target.value)}>
                  {dayOptions.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jenis Preferensi</label>
                <Select value={form.preferenceType} onChange={e => updateForm('preferenceType', e.target.value)}>
                  {preferenceOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jam Mulai</label>
                <Input type="time" value={form.startTime} onChange={e => updateForm('startTime', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jam Selesai</label>
                <Input type="time" value={form.endTime} onChange={e => updateForm('endTime', e.target.value)} required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Catatan (Opsional)</label>
              <textarea
                value={form.notes}
                onChange={e => updateForm('notes', e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah Preferensi'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && modal.item && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-xs uppercase text-slate-500">Guru</span><p className="font-semibold">{teacherMap.get(modal.item.teacherId)?.name || '-'}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Periode</span><p className="font-semibold">{periodMap.get(modal.item.periodId)?.name || '-'}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Hari</span><p className="font-semibold">{dayOptions.find(d => d.value === modal.item.dayOfWeek)?.label}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Waktu</span><p className="font-semibold">{modal.item.startTime} - {modal.item.endTime}</p></div>
            </div>
            <div>
              <span className="text-xs uppercase text-slate-500">Jenis</span>
              <Badge variant={modal.item.preferenceType === 'prefer' ? 'success' : 'danger'}>
                {modal.item.preferenceType === 'prefer' ? 'Preferensi' : 'Hindari'}
              </Badge>
            </div>
            {modal.item.notes && (
              <div>
                <span className="text-xs uppercase text-slate-500">Catatan</span>
                <p className="text-slate-700">{modal.item.notes}</p>
              </div>
            )}
          </div>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Yakin ingin menghapus preferensi untuk <span className="font-semibold">{teacherMap.get(modal.item.teacherId)?.name || 'guru ini'}</span>?
            </p>
            <div className="flex gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TeacherPreferences;