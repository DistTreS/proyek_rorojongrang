import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
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

const JamPelajaran = () => {
  const [slots, setSlots] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState({ periodId: '', dayOfWeek: 1, startTime: '', endTime: '', label: '' });
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
    try {
      const [slotRes, periodRes] = await Promise.all([
        api.get('/jam', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE,
            periodId: nextPeriodId || undefined
          })
        }),
        fetchAllPages(api, '/period')
      ]);
      const normalized = normalizePaginatedResponse(slotRes.data);
      setSlots(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
      setPeriods(periodRes || []);
    } catch (err) {
      setError('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, filterPeriodId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodMap = useMemo(() => new Map(periods.map(p => [p.id, p])), [periods]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setForm({ periodId: '', dayOfWeek: 1, startTime: '', endTime: '', label: '' });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create' });
  };

  const handleEdit = (slot) => {
    setEditingId(slot.id);
    setForm({
      periodId: slot.periodId || '',
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime?.slice(0, 5) || '',
      endTime: slot.endTime?.slice(0, 5) || '',
      label: slot.label || ''
    });
    setModal({ type: 'edit' });
  };

  const handleDelete = (slot) => {
    setModal({ type: 'delete', item: slot });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/jam/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError('Gagal menghapus jam pelajaran');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.periodId || !form.startTime || !form.endTime) {
      setError('Periode, jam mulai, dan jam selesai wajib diisi');
      return;
    }
    if (form.startTime >= form.endTime) {
      setError('Jam selesai harus setelah jam mulai');
      return;
    }

    const payload = {
      periodId: Number(form.periodId),
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      label: form.label.trim() || null
    };

    try {
      if (editingId) {
        await api.put(`/jam/${editingId}`, payload);
      } else {
        await api.post('/jam', payload);
      }
      setModal({ type: null });
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Jam Pelajaran</h1>
          <p className="text-slate-600 mt-1">Kelola slot waktu pembelajaran per periode</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Tambah Jam
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <Select 
            value={filterPeriodId} 
            onChange={(e) => {
              const nextValue = e.target.value;
              setFilterPeriodId(nextValue);
              load(1, nextValue);
            }}
            className="flex-1"
          >
            <option value="">Semua Periode</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Daftar Jam */}
      <div className="space-y-4">
        {slots.map(slot => (
          <Card key={slot.id} className="p-6 hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Hari</p>
                  <p className="font-medium">{dayOptions.find(d => d.value === slot.dayOfWeek)?.label}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Waktu</p>
                  <p className="font-medium">{slot.startTime} - {slot.endTime}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Periode</p>
                  <p className="font-medium">{periodMap.get(slot.periodId)?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Label</p>
                  <p className="font-medium">{slot.label || '-'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleEdit(slot)}>
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(slot)}>
                  Hapus
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {!slots.length && (
          <Card className="p-12 text-center text-slate-500">
            Belum ada data jam pelajaran.
          </Card>
        )}
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={(nextPage) => load(nextPage, filterPeriodId)}
        />
      </div>

      {/* Modal */}
      <Modal
        isOpen={!!modal.type}
        onClose={() => { setModal({ type: null }); resetForm(); }}
        title={
          modal.type === 'create' ? 'Tambah Jam Pelajaran' :
          modal.type === 'edit' ? 'Edit Jam Pelajaran' : 'Hapus Jam Pelajaran'
        }
      >
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Periode</label>
              <Select value={form.periodId} onChange={(e) => updateForm('periodId', e.target.value)} required>
                <option value="">Pilih Periode</option>
                {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Hari</label>
                <Select value={form.dayOfWeek} onChange={(e) => updateForm('dayOfWeek', e.target.value)}>
                  {dayOptions.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Label (Opsional)</label>
                <Input value={form.label} onChange={(e) => updateForm('label', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jam Mulai</label>
                <Input type="time" value={form.startTime} onChange={(e) => updateForm('startTime', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jam Selesai</label>
                <Input type="time" value={form.endTime} onChange={(e) => updateForm('endTime', e.target.value)} required />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah Jam'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={() => setModal({ type: null })}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Yakin ingin menghapus jam pelajaran ini?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">
                Hapus
              </Button>
              <Button variant="secondary" onClick={() => setModal({ type: null })} className="flex-1">
                Batal
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default JamPelajaran;
