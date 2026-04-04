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
  teacherId: '',
  subjectId: '',
  rombelId: '',
  periodId: '',
  weeklyHours: 1
};

const subjectTypeLabel = (value) => (value === 'peminatan' ? 'Peminatan' : 'Wajib');

const formatRombelLabel = (rombel) => {
  if (!rombel) return '-';
  const typeLabel = rombel.type === 'peminatan' ? 'Peminatan' : 'Utama';
  return `${rombel.name} • ${typeLabel}`;
};

const Pengampu = () => {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [rombels, setRombels] = useState([]);
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
      const [assignmentRes, tendikRes, subjectRes, rombelRes, periodRes] = await Promise.all([
        api.get('/pengampu', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE,
            periodId: nextPeriodId || undefined
          })
        }),
        fetchAllPages(api, '/tendik'),
        fetchAllPages(api, '/mapel'),
        fetchAllPages(api, '/rombel'),
        fetchAllPages(api, '/period')
      ]);

      const normalized = normalizePaginatedResponse(assignmentRes.data);
      setAssignments(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);

      setTeachers((tendikRes || []).filter(item => item.user?.roles?.includes('guru')));
      setSubjects(subjectRes || []);
      setRombels(rombelRes || []);
      setPeriods(periodRes || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat pengampu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, filterPeriodId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodMap = useMemo(() => new Map(periods.map(item => [item.id, item])), [periods]);
  const teacherMap = useMemo(() => new Map(teachers.map(item => [item.id, item])), [teachers]);
  const subjectMap = useMemo(() => new Map(subjects.map(item => [item.id, item])), [subjects]);
  const rombelMap = useMemo(() => new Map(rombels.map(item => [item.id, item])), [rombels]);
  const selectedSubject = useMemo(() => subjectMap.get(Number(form.subjectId)), [form.subjectId, subjectMap]);

  const currentSubjects = useMemo(() => {
    if (!form.periodId) return [];
    return subjects.filter(subject => subject.periodId === Number(form.periodId));
  }, [form.periodId, subjects]);

  const currentRombels = useMemo(() => {
    if (!form.periodId) return [];
    return rombels.filter(rombel => {
      if (rombel.periodId !== Number(form.periodId)) return false;
      if (!selectedSubject) return true;
      return selectedSubject.type === 'peminatan' ? rombel.type === 'peminatan' : rombel.type === 'utama';
    });
  }, [form.periodId, rombels, selectedSubject]);

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

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
    setModal({ type: 'create' });
  };

  const openDetail = (assignment) => {
    setModal({ type: 'detail', item: assignment });
  };

  const handleEdit = (assignment) => {
    setEditingId(assignment.id);
    setForm({
      teacherId: assignment.teacherId || assignment.teacher?.id || '',
      subjectId: assignment.subjectId || assignment.subject?.id || '',
      rombelId: assignment.rombelId || assignment.rombel?.id || '',
      periodId: assignment.periodId || assignment.period?.id || '',
      weeklyHours: assignment.weeklyHours || 1
    });
    setModal({ type: 'edit' });
  };

  const handleDelete = (assignment) => {
    setModal({ type: 'delete', item: assignment });
  };

  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try {
      await api.delete(`/pengampu/${modal.item.id}`);
      setModal({ type: null });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus pengampu');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const weeklyHours = Number(form.weeklyHours);
    if (!form.periodId || !form.teacherId || !form.subjectId || !form.rombelId) {
      setError('Periode, guru, mapel, dan rombel wajib diisi');
      return;
    }
    if (!Number.isInteger(weeklyHours) || weeklyHours <= 0) {
      setError('Jam mingguan harus berupa angka bulat lebih dari 0');
      return;
    }

    const payload = {
      teacherId: Number(form.teacherId),
      subjectId: Number(form.subjectId),
      rombelId: Number(form.rombelId),
      periodId: Number(form.periodId),
      weeklyHours
    };

    try {
      if (editingId) {
        await api.put(`/pengampu/${editingId}`, payload);
      } else {
        await api.post('/pengampu', payload);
      }
      closeModal();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan pengampu');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Pengampu Mata Pelajaran</h1>
          <p className="text-slate-600 mt-1">Atur guru, mapel, rombel, periode, dan jam mingguan</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Tambah Pengampu
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
            {periods.map(period => (
              <option key={period.id} value={period.id}>{period.name}</option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Daftar Pengampu */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Pengampu</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} data</span>
        </div>

        <div className="space-y-4">
          {assignments.map(assignment => (
            <Card key={assignment.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.3fr_1.1fr_1.1fr_0.7fr_0.8fr] gap-4 md:items-center">
                <div className="text-sm text-slate-700 font-medium">
                  {teacherMap.get(assignment.teacherId)?.name || assignment.teacher?.name || '-'}
                </div>
                <div className="text-sm text-slate-700">
                  {subjectMap.get(assignment.subjectId)?.name || assignment.subject?.name || '-'}
                  <span className="text-xs ml-2 text-slate-500">
                    • {subjectTypeLabel(subjectMap.get(assignment.subjectId)?.type || assignment.subject?.type)}
                  </span>
                </div>
                <div className="text-sm text-slate-700">
                  {formatRombelLabel(rombelMap.get(assignment.rombelId) || assignment.rombel)}
                </div>
                <div className="text-sm text-slate-700">
                  {periodMap.get(assignment.periodId)?.name || assignment.period?.name || '-'}
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {assignment.weeklyHours}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(assignment)}>
                    Detail
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(assignment)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(assignment)}>
                    Hapus
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {!assignments.length && !loading && (
            <div className="text-center py-12 text-slate-500">
              Belum ada data pengampu.
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
          modal.type === 'create' ? 'Tambah Pengampu' :
          modal.type === 'edit' ? 'Edit Pengampu' :
          modal.type === 'detail' ? 'Detail Pengampu' : 'Hapus Pengampu'
        }
      >
        {modal.type === 'detail' && modal.item && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs uppercase text-slate-500">Guru</span>
                <p className="font-semibold">{teacherMap.get(modal.item.teacherId)?.name || modal.item.teacher?.name || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Mapel</span>
                <p className="font-semibold">{subjectMap.get(modal.item.subjectId)?.name || modal.item.subject?.name || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Jenis Mapel</span>
                <p className="font-semibold">
                  {subjectTypeLabel(subjectMap.get(modal.item.subjectId)?.type || modal.item.subject?.type)}
                </p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Rombel</span>
                <p className="font-semibold">{formatRombelLabel(rombelMap.get(modal.item.rombelId) || modal.item.rombel)}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Periode</span>
                <p className="font-semibold">{periodMap.get(modal.item.periodId)?.name || modal.item.period?.name || '-'}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-500">Jam/Minggu</span>
                <p className="font-semibold">{modal.item.weeklyHours}</p>
              </div>
            </div>
          </div>
        )}

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
                <label className="block text-sm font-medium text-slate-700 mb-2">Guru</label>
                <Select
                  value={form.teacherId}
                  onChange={(e) => updateForm('teacherId', e.target.value)}
                  required
                >
                  <option value="">Pilih guru</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mapel</label>
                <Select
                  value={form.subjectId}
                  onChange={(e) => updateForm('subjectId', e.target.value)}
                  required
                  disabled={!form.periodId}
                >
                  <option value="">Pilih mapel</option>
                  {currentSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name} ({subjectTypeLabel(subject.type)})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rombel</label>
                <Select
                  value={form.rombelId}
                  onChange={(e) => updateForm('rombelId', e.target.value)}
                  required
                  disabled={!form.periodId}
                >
                  <option value="">Pilih rombel</option>
                  {currentRombels.map((rombel) => (
                    <option key={rombel.id} value={rombel.id}>
                      {formatRombelLabel(rombel)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Jam Mingguan</label>
              <Input
                type="number"
                min="1"
                value={form.weeklyHours}
                onChange={(e) => updateForm('weeklyHours', e.target.value)}
                required
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                {editingId ? 'Simpan Perubahan' : 'Tambah'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Yakin ingin menghapus data pengampu ini?
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

export default Pengampu;
