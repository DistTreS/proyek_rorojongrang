import { useEffect, useState } from 'react';
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
  normalizePaginatedResponse
} from '../utils/pagination';
import { isValidDateRange } from '../utils/temporalValidation';

const emptyForm = {
  name: '',
  startDate: '',
  endDate: '',
  semester: 'ganjil',
  isActive: false
};

const Period = () => {
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });

  const load = async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/period', {
        params: buildPageParams({
          page: nextPage,
          pageSize: DEFAULT_PAGE_SIZE
        })
      });
      const normalized = normalizePaginatedResponse(data);
      setPeriods(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat periode');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get('/period', {
          params: buildPageParams({
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE
          })
        });
        const normalized = normalizePaginatedResponse(data);
        setPeriods(normalized.items || []);
        setPagination(normalized);
        setPage(normalized.page);
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat periode');
      } finally {
        setLoading(false);
      }
    };

    loadInitial();
  }, []);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.startDate || !form.endDate) {
      setError('Nama periode dan rentang tanggal wajib diisi');
      return;
    }

    if (!isValidDateRange(form.startDate, form.endDate)) {
      setError('Tanggal akhir harus setelah atau sama dengan tanggal mulai');
      return;
    }

    const payload = {
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      semester: form.semester,
      isActive: form.isActive
    };

    try {
      if (editingId) {
        await api.put(`/period/${editingId}`, payload);
      } else {
        await api.post('/period', payload);
      }
      resetForm();
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan periode');
    }
  };

  const handleEdit = (period) => {
    setEditingId(period.id);
    setForm({
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      semester: period.semester || 'ganjil',
      isActive: period.isActive
    });
    setModal({ type: 'edit', item: period });
  };

  const handleDelete = (period) => {
    setModal({ type: 'delete', item: period });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/period/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus periode');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (period) => {
    setModal({ type: 'detail', item: period });
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Periode Akademik</h1>
          <p className="text-slate-600 mt-1">Kelola periode, hanya satu periode aktif sekaligus</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Tambah Periode
        </Button>
      </div>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Periode</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} periode</span>
        </div>

        <div className="space-y-4">
          {periods.map((period) => (
            <Card key={period.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_0.8fr_0.8fr] gap-4 md:items-center">
                <div className="text-sm font-semibold text-slate-900">{period.name}</div>
                <div className="text-sm text-slate-700">{period.semester === 'genap' ? 'Genap' : 'Ganjil'}</div>
                <div className="text-sm text-slate-700">{period.startDate}</div>
                <div className="text-sm text-slate-700">{period.endDate}</div>
                <div>
                  <Badge variant={period.isActive ? 'success' : 'default'}>
                    {period.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(period)}>
                    Detail
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(period)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(period)}>
                    Hapus
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {!periods.length && !loading && (
            <div className="text-center py-12 text-slate-500">
              Belum ada data periode.
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-center">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={load}
          />
        </div>
      </Card>

      <Modal
        isOpen={!!modal.type}
        onClose={closeModal}
        title={
          modal.type === 'create' ? 'Tambah Periode' :
          modal.type === 'edit' ? 'Edit Periode' :
          modal.type === 'detail' ? 'Detail Periode' : 'Hapus Periode'
        }
      >
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Nama Periode</label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tanggal Mulai</label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateForm('startDate', e.target.value)}
                  max={form.endDate || undefined}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tanggal Akhir</label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateForm('endDate', e.target.value)}
                  min={form.startDate || undefined}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Semester</label>
              <Select value={form.semester} onChange={(e) => updateForm('semester', e.target.value)}>
                <option value="ganjil">Ganjil</option>
                <option value="genap">Genap</option>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateForm('isActive', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
              />
              <span className="text-sm text-slate-700">Jadikan periode aktif</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah Periode'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && modal.item && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><span className="text-xs uppercase text-slate-500">Nama</span><p className="font-semibold">{modal.item.name}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Status</span><p className="font-semibold">{modal.item.isActive ? 'Aktif' : 'Nonaktif'}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Semester</span><p className="font-semibold">{modal.item.semester === 'genap' ? 'Genap' : 'Ganjil'}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Mulai</span><p className="font-semibold">{modal.item.startDate}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Selesai</span><p className="font-semibold">{modal.item.endDate}</p></div>
            </div>
          </div>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Yakin ingin menghapus periode <span className="font-semibold">{modal.item.name}</span>?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Period;
