import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { canAccess, SCHEDULING_MANAGER_ROLES } from '../constants/rbac';
import { useAuth } from '../context/useAuth';
import {
  buildPageParams,
  DEFAULT_PAGE_SIZE,
  fetchAllPages,
  normalizePaginatedResponse
} from '../utils/pagination';

const emptyForm = {
  name: '',
  gradeLevel: '',
  type: 'utama',
  periodId: ''
};

const typeOptions = [
  { value: 'utama', label: 'Rombel Utama' },
  { value: 'peminatan', label: 'Rombel Peminatan' }
];

const typeLabel = (value) => typeOptions.find(opt => opt.value === value)?.label || 'Rombel Utama';

const Rombel = () => {
  const { roles } = useAuth();
  const canManage = canAccess(roles, SCHEDULING_MANAGER_ROLES);

  const [rombels, setRombels] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [removeLoadingId, setRemoveLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [assignIds, setAssignIds] = useState([]);
  const [initialAssignIds, setInitialAssignIds] = useState([]);
  const [assignQuery, setAssignQuery] = useState('');
  const [detailQuery, setDetailQuery] = useState('');
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
      const [rombelRes, periodRes] = await Promise.all([
        api.get('/rombel', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE,
            periodId: nextPeriodId || undefined
          })
        }),
        fetchAllPages(api, '/period')
      ]);

      const normalized = normalizePaginatedResponse(rombelRes.data);
      setRombels(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
      setPeriods(periodRes || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat rombel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, filterPeriodId);
  }, []);

  const periodMap = useMemo(() => new Map(periods.map(p => [p.id, p])), [periods]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const loadStudents = async () => {
    try {
      const data = await fetchAllPages(api, '/siswa');
      setStudents(data || []);
    } catch (err) {
      setError('Gagal memuat data siswa');
    }
  };

  const openCreate = () => {
    resetForm();
    setModal({ type: 'create' });
  };

  const openDetail = async (rombel) => {
    setDetailLoading(true);
    setModal({ type: 'detail', item: null });
    try {
      const { data } = await api.get(`/rombel/${rombel.id}`);
      setDetailQuery('');
      setModal({ type: 'detail', item: data });
    } catch (err) {
      setError('Gagal memuat detail rombel');
    } finally {
      setDetailLoading(false);
    }
  };

  const openAssign = async (rombel) => {
    if (!canManage) return;
    setAssignLoading(true);
    setModal({ type: 'assign', item: null });
    try {
      if (!students.length) await loadStudents();
      const { data } = await api.get(`/rombel/${rombel.id}`);
      const existingIds = (data.students || []).map(s => s.id);
      setAssignIds(existingIds);
      setInitialAssignIds(existingIds);
      setAssignQuery('');
      setModal({ type: 'assign', item: data });
    } catch (err) {
      setError('Gagal memuat data rombel');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleEdit = (rombel) => {
    if (!canManage) return;
    setEditingId(rombel.id);
    setForm({
      name: rombel.name,
      gradeLevel: rombel.gradeLevel || '',
      type: rombel.type || 'utama',
      periodId: rombel.periodId || ''
    });
    setModal({ type: 'edit', item: rombel });
  };

  const handleDelete = (rombel) => {
    if (!canManage) return;
    setModal({ type: 'delete', item: rombel });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/rombel/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError('Gagal menghapus rombel');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.periodId) {
      setError('Nama rombel dan periode wajib diisi');
      return;
    }
    if (form.type === 'utama' && !form.gradeLevel.trim()) {
      setError('Tingkat wajib diisi untuk rombel utama');
      return;
    }

    const payload = {
      name: form.name.trim(),
      gradeLevel: form.gradeLevel.trim() || null,
      type: form.type,
      periodId: Number(form.periodId)
    };

    try {
      if (editingId) {
        await api.put(`/rombel/${editingId}`, payload);
      } else {
        await api.post('/rombel', payload);
      }
      setModal({ type: null });
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan rombel');
    }
  };

  const toggleAssign = (id) => {
    setAssignIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleAssign = async () => {
    if (!modal.item || !canManage) return;
    setAssignLoading(true);
    try {
      const toAdd = assignIds.filter(id => !initialAssignIds.includes(id));
      await api.put(`/rombel/${modal.item.id}/students`, { studentIds: toAdd });
      setModal({ type: null });
      load();
    } catch (err) {
      setError('Gagal assign siswa');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveStudent = async (student) => {
    if (!modal.item || !canManage) return;
    if (!confirm(`Hapus ${student.name} dari rombel ini?`)) return;

    setRemoveLoadingId(student.id);
    try {
      await api.delete(`/rombel/${modal.item.id}/students/${student.id}`);
      const { data } = await api.get(`/rombel/${modal.item.id}`);
      setModal({ type: 'detail', item: data });
      const newIds = (data.students || []).map(s => s.id);
      setAssignIds(newIds);
      setInitialAssignIds(newIds);
      load();
    } catch (err) {
      setError('Gagal menghapus siswa');
    } finally {
      setRemoveLoadingId(null);
    }
  };

  const closeModal = () => {
    setModal({ type: null });
    if (modal.type !== 'detail') resetForm();
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Rombongan Belajar</h1>
          <p className="text-slate-600 mt-1">
            {canManage ? 'Kelola rombel per periode akademik' : 'Lihat struktur rombel per periode akademik'}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} size="lg">
            + Tambah Rombel
          </Button>
        )}
      </div>

      {error && <Card className="p-4 border-red-200 bg-red-50 text-red-700">{error}</Card>}

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

      {/* Daftar Rombel */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Rombel</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} rombel</span>
        </div>

        <div className="space-y-4">
          {rombels.map(rombel => (
            <Card key={rombel.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_0.8fr_1fr_1.2fr_0.9fr] gap-4 md:items-center">
                <div className="text-sm font-semibold text-slate-900">{rombel.name}</div>
                <div className="text-sm text-slate-700">{rombel.gradeLevel || '-'}</div>
                <div className="text-sm text-slate-700">{typeLabel(rombel.type)}</div>
                <div className="text-sm text-slate-700">{periodMap.get(rombel.periodId)?.name || '-'}</div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(rombel)}>
                    Detail
                  </Button>
                  {canManage && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => openAssign(rombel)}>
                        Assign Siswa
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(rombel)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(rombel)}>
                        Hapus
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {!rombels.length && !loading && (
            <div className="text-center py-12 text-slate-500">Belum ada data rombel.</div>
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

      {/* All Modals */}
      <Modal
        isOpen={!!modal.type}
        onClose={closeModal}
        title={
          modal.type === 'create' ? 'Tambah Rombel' :
          modal.type === 'edit' ? 'Edit Rombel' :
          modal.type === 'detail' ? 'Detail Rombel' :
          modal.type === 'assign' ? 'Assign Siswa' : 'Hapus Rombel'
        }
      >
        {/* Create / Edit Form */}
        {(modal.type === 'create' || modal.type === 'edit') && canManage && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Nama Rombel</label>
              <Input value={form.name} onChange={e => updateForm('name', e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Periode</label>
                <Select value={form.periodId} onChange={e => updateForm('periodId', e.target.value)} required>
                  <option value="">Pilih Periode</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jenis</label>
                <Select value={form.type} onChange={e => updateForm('type', e.target.value)}>
                  {typeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tingkat Kelas</label>
              <Input value={form.gradeLevel} onChange={e => updateForm('gradeLevel', e.target.value)} placeholder="contoh: X atau 10" />
            </div>

            <div className="flex gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah Rombel'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {/* Detail Modal */}
        {modal.type === 'detail' && modal.item && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-xs uppercase text-slate-500">Nama</span><p className="font-semibold">{modal.item.name}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Jenis</span><p className="font-semibold">{typeLabel(modal.item.type)}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Tingkat</span><p className="font-semibold">{modal.item.gradeLevel || '-'}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Periode</span><p className="font-semibold">{periodMap.get(modal.item.periodId)?.name || '-'}</p></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Daftar Siswa ({modal.item.students?.length || 0})</span>
                <Input
                  value={detailQuery}
                  onChange={e => setDetailQuery(e.target.value)}
                  placeholder="Cari nama atau NIS..."
                  className="w-64"
                />
              </div>

              <div className="max-h-96 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                {(modal.item.students || [])
                  .filter(s => !detailQuery || s.name?.toLowerCase().includes(detailQuery.toLowerCase()) || s.nis?.includes(detailQuery))
                  .map(student => (
                    <div key={student.id} className="flex justify-between items-center bg-white p-3 rounded-xl border">
                      <div>
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-slate-500">{student.nis}</div>
                      </div>
                      {canManage && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleRemoveStudent(student)}
                          disabled={removeLoadingId === student.id}
                        >
                          {removeLoadingId === student.id ? 'Menghapus...' : 'Remove'}
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Assign Modal */}
        {modal.type === 'assign' && canManage && (
          <div className="space-y-6">
            <div className="flex justify-between">
              <h3 className="text-lg font-semibold">Assign Siswa ke {modal.item?.name}</h3>
              <Button variant="secondary" onClick={closeModal}>Tutup</Button>
            </div>

            <Input
              value={assignQuery}
              onChange={e => setAssignQuery(e.target.value)}
              placeholder="Cari nama atau NIS siswa..."
            />

            <div className="max-h-96 overflow-auto space-y-2">
              {students
                .filter(s => !assignQuery || s.name?.toLowerCase().includes(assignQuery.toLowerCase()) || s.nis?.includes(assignQuery))
                .map(student => (
                  <label key={student.id} className="flex items-center gap-3 bg-white p-4 rounded-2xl border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignIds.includes(student.id)}
                      onChange={() => toggleAssign(student.id)}
                    />
                    <div>
                      <div className="font-medium">{student.name}</div>
                      <div className="text-xs text-slate-500">{student.nis}</div>
                    </div>
                  </label>
                ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleAssign} disabled={assignLoading} className="flex-1">
                {assignLoading ? 'Menyimpan...' : 'Simpan Assign'}
              </Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {modal.type === 'delete' && modal.item && canManage && (
          <div className="space-y-6">
            <p className="text-slate-600">Yakin ingin menghapus rombel <span className="font-semibold">{modal.item.name}</span>?</p>
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

export default Rombel;