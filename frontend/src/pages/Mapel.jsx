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

const emptyForm = {
  code: '',
  name: '',
  type: 'wajib',
  periodId: ''
};

const typeOptions = [
  { value: 'wajib', label: 'Wajib' },
  { value: 'peminatan', label: 'Peminatan' }
];

const typeLabel = (value) => (value === 'peminatan' ? 'Peminatan' : 'Wajib');

const Mapel = () => {
  const [subjects, setSubjects] = useState([]);
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
      const [subjectRes, periodRes] = await Promise.all([
        api.get('/mapel', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE,
            periodId: nextPeriodId || undefined
          })
        }),
        fetchAllPages(api, '/period')
      ]);

      const normalized = normalizePaginatedResponse(subjectRes.data);
      setSubjects(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
      setPeriods(periodRes || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat mapel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, filterPeriodId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodMap = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = (subject) => {
    setModal({ type: 'detail', item: subject });
  };

  const handleEdit = (subject) => {
    setEditingId(subject.id);
    setForm({
      code: subject.code || '',
      name: subject.name,
      type: subject.type || 'wajib',
      periodId: subject.periodId || ''
    });
    setModal({ type: 'edit', item: subject });
  };

  const handleDelete = (subject) => {
    setModal({ type: 'delete', item: subject });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/mapel/${modal.item.id}`);
      setModal({ type: null, item: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus mapel');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.periodId || !form.name.trim()) {
      setError('Periode dan nama mata pelajaran wajib diisi');
      return;
    }

    const payload = {
      code: form.code.trim() || null,
      name: form.name.trim(),
      type: form.type || 'wajib',
      periodId: Number(form.periodId)
    };

    try {
      if (editingId) {
        await api.put(`/mapel/${editingId}`, payload);
      } else {
        await api.post('/mapel', payload);
      }
      closeModal();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan mapel');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Mata Pelajaran</h1>
          <p className="text-slate-600 mt-1">Kelola data mapel per periode akademik</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Tambah Mapel
        </Button>
      </div>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
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
            {periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name}</option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Daftar Mapel */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Mapel</h2>
          <span className="text-sm text-slate-500">
            {pagination.totalItems} mapel
          </span>
        </div>

        <div className="space-y-4">
          {subjects.map((subject) => (
            <Card key={subject.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">{subject.name}</span>
                    <Badge variant={subject.type === 'peminatan' ? 'success' : 'default'}>
                      {typeLabel(subject.type)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    Kode: {subject.code || '-'} • {periodMap.get(subject.periodId)?.name || '-'}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(subject)}>
                    Detail
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(subject)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(subject)}>
                    Hapus
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {!subjects.length && !loading && (
            <div className="text-center py-12 text-slate-500">
              Belum ada data mapel.
            </div>
          )}
        </div>

        {/* Pagination */}
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
          modal.type === 'create' ? 'Tambah Mapel' :
          modal.type === 'edit' ? 'Edit Mapel' :
          modal.type === 'detail' ? 'Detail Mapel' : 'Hapus Mapel'
        }
      >
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Periode</label>
                <Select
                  value={form.periodId}
                  onChange={(e) => updateForm('periodId', e.target.value)}
                  required
                >
                  <option value="">Pilih periode</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Kode</label>
                <Input
                  value={form.code}
                  onChange={(e) => updateForm('code', e.target.value)}
                  placeholder="Opsional"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nama Mapel</label>
                <Input
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jenis</label>
                <Select
                  value={form.type}
                  onChange={(e) => updateForm('type', e.target.value)}
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah Mapel'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && modal.item && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs uppercase text-slate-500">Nama</span>
                <p className="font-semibold">{modal.item.name}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Kode</span>
                <p className="font-semibold">{modal.item.code || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Jenis</span>
                <p className="font-semibold">{typeLabel(modal.item.type)}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Periode</span>
                <p className="font-semibold">{periodMap.get(modal.item.periodId)?.name || modal.item.periodName || '-'}</p>
              </div>
            </div>
          </div>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Yakin ingin menghapus mapel <span className="font-semibold">{modal.item.name}</span>?
            </p>
            <div className="flex gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">
                Hapus
              </Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">
                Batal
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Mapel;
