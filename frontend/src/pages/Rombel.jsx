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
import { buildPageParams, DEFAULT_PAGE_SIZE, fetchAllPages, normalizePaginatedResponse } from '../utils/pagination';

const GRADE_LEVEL_OPTIONS = [10, 11, 12];
const emptyForm = { name: '', gradeLevel: '', type: 'utama', periodId: '' };
const typeOptions = [{ value: 'utama', label: 'Rombel Utama' }, { value: 'peminatan', label: 'Rombel Peminatan' }];
const typeLabel   = (v) => typeOptions.find(o => o.value === v)?.label || 'Rombel Utama';

const Rombel = () => {
  const { roles } = useAuth();
  const canManage = canAccess(roles, SCHEDULING_MANAGER_ROLES);

  const [rombels,         setRombels]         = useState([]);
  const [periods,         setPeriods]         = useState([]);
  const [students,        setStudents]        = useState([]);
  const [form,            setForm]            = useState(emptyForm);
  const [editingId,       setEditingId]       = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [detailLoading,   setDetailLoading]   = useState(false);
  const [assignLoading,   setAssignLoading]   = useState(false);
  const [removeLoadingId, setRemoveLoadingId] = useState(null);
  const [error,           setError]           = useState(null);
  const [modal,           setModal]           = useState({ type: null, item: null });
  const [assignIds,       setAssignIds]       = useState([]);
  const [initialAssignIds,setInitialAssignIds]= useState([]);
  const [assignQuery,     setAssignQuery]     = useState('');
  const [detailQuery,     setDetailQuery]     = useState('');
  const [filterPeriodId,  setFilterPeriodId]  = useState('');
  const [search,          setSearch]          = useState('');
  const [page,            setPage]            = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 1 });

  const load = async (nextPage = page, nextPeriodId = filterPeriodId, nextSearch = search) => {
    setLoading(true); setError(null);
    try {
      const [rombelRes, periodRes] = await Promise.all([
        api.get('/rombel', { params: buildPageParams({ page: nextPage, pageSize: DEFAULT_PAGE_SIZE, periodId: nextPeriodId || undefined, search: nextSearch || undefined }) }),
        fetchAllPages(api, '/period')
      ]);
      const normalized = normalizePaginatedResponse(rombelRes.data);
      setRombels(normalized.items || []); setPagination(normalized); setPage(normalized.page);
      setPeriods(periodRes || []);
    } catch (err) { setError(err.response?.data?.message || 'Gagal memuat rombel'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1, ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(1, filterPeriodId, search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const periodMap  = useMemo(() => new Map(periods.map(p => [p.id, p])), [periods]);
  const updateForm = (f, v) => setForm(prev => ({ ...prev, [f]: v }));
  const resetForm  = () => { setForm(emptyForm); setEditingId(null); };
  const closeModal = () => { setModal({ type: null }); if (modal.type !== 'detail') resetForm(); };

  const loadStudents = async () => {
    if (students.length) return;
    try { setStudents(await fetchAllPages(api, '/siswa') || []); } catch { setError('Gagal memuat siswa'); }
  };

  const openDetail = async (rombel) => {
    setDetailLoading(true); setModal({ type: 'detail', item: null }); setDetailQuery('');
    try { const { data } = await api.get(`/rombel/${rombel.id}`); setModal({ type: 'detail', item: data }); }
    catch { setError('Gagal memuat detail rombel'); }
    finally { setDetailLoading(false); }
  };

  const openAssign = async (rombel) => {
    if (!canManage) return;
    setAssignLoading(true); setModal({ type: 'assign', item: null }); setAssignQuery('');
    try {
      await loadStudents();
      const { data } = await api.get(`/rombel/${rombel.id}`);
      const existingIds = (data.students || []).map(s => s.id);
      setAssignIds(existingIds); setInitialAssignIds(existingIds);
      setModal({ type: 'assign', item: data });
    } catch { setError('Gagal memuat data rombel'); }
    finally { setAssignLoading(false); }
  };

  const handleEdit = (r) => {
    if (!canManage) return;
    setEditingId(r.id); setForm({ name: r.name, gradeLevel: r.gradeLevel != null ? String(r.gradeLevel) : '', type: r.type || 'utama', periodId: r.periodId || '' });
    setModal({ type: 'edit', item: r });
  };

  const handleDelete = (r) => { if (canManage) setModal({ type: 'delete', item: r }); };
  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try { await api.delete(`/rombel/${modal.item.id}`); setModal({ type: null }); load(); }
    catch { setError('Gagal menghapus rombel'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.name.trim() || !form.periodId) { setError('Nama dan periode wajib diisi'); return; }
    if (form.type === 'utama' && !form.gradeLevel) { setError('Tingkat kelas wajib dipilih untuk rombel utama'); return; }
    const payload = { name: form.name.trim(), gradeLevel: form.gradeLevel ? Number(form.gradeLevel) : null, type: form.type, periodId: Number(form.periodId) };
    try {
      if (editingId) await api.put(`/rombel/${editingId}`, payload);
      else           await api.post('/rombel', payload);
      setModal({ type: null }); resetForm(); load();
    } catch (err) { setError(err.response?.data?.message || 'Gagal menyimpan rombel'); }
  };

  const toggleAssign = (id) => setAssignIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const handleAssign = async () => {
    if (!modal.item || !canManage) return;
    setAssignLoading(true);
    try {
      const toAdd = assignIds.filter(id => !initialAssignIds.includes(id));
      await api.put(`/rombel/${modal.item.id}/students`, { studentIds: toAdd });
      setModal({ type: null }); load();
    } catch { setError('Gagal assign siswa'); }
    finally { setAssignLoading(false); }
  };

  const handleRemoveStudent = async (student) => {
    if (!modal.item || !canManage) return;
    if (!window.confirm(`Hapus ${student.name} dari rombel ini?`)) return;
    setRemoveLoadingId(student.id);
    try {
      await api.delete(`/rombel/${modal.item.id}/students/${student.id}`);
      const { data } = await api.get(`/rombel/${modal.item.id}`);
      const newIds = (data.students || []).map(s => s.id);
      setModal({ type: 'detail', item: data }); setAssignIds(newIds); setInitialAssignIds(newIds); load();
    } catch { setError('Gagal menghapus siswa dari rombel'); }
    finally { setRemoveLoadingId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rombongan Belajar</h1>
          <p className="text-slate-500 text-sm mt-0.5">{canManage ? 'Kelola rombel per periode akademik' : 'Lihat struktur rombel per periode akademik'}</p>
        </div>
        {canManage && <Button size="sm" onClick={() => { resetForm(); setModal({ type: 'create' }); }}>+ Tambah Rombel</Button>}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterPeriodId} onChange={e => { const v = e.target.value; setFilterPeriodId(v); load(1, v, search); }} className="w-full sm:w-56 flex-shrink-0">
          <option value="">Semua Periode</option>
          {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Daftar Rombel</h2>
            {!loading && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{pagination.totalItems}</span>}
            {loading && <span className="text-xs text-slate-400 animate-pulse">Memuat...</span>}
          </div>
          <div className="w-full sm:w-64">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari nama rombel..." className="text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Nama</th><th>Tingkat</th><th>Jenis</th><th>Periode</th><th>Siswa</th><th className="text-center">Aksi</th></tr>
            </thead>
            <tbody>
              {!rombels.length && !loading && (
                <tr><td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <span className="text-4xl">🏫</span>
                    <span className="text-sm">Belum ada data rombel</span>
                  </div>
                </td></tr>
              )}
              {rombels.map(r => (
                <tr key={r.id}>
                  <td><div className="font-semibold text-slate-900">{r.name}</div></td>
                  <td className="text-slate-600">{r.gradeLevel ? `Kelas ${r.gradeLevel}` : <span className="text-slate-300">—</span>}</td>
                  <td>
                    <Badge variant={r.type === 'peminatan' ? 'peminatan' : 'utama'} size="xs">
                      {typeLabel(r.type)}
                    </Badge>
                  </td>
                  <td className="text-slate-600 text-sm">{periodMap.get(r.periodId)?.name || '-'}</td>
                  <td>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {r.studentCount ?? r.students?.length ?? '-'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <Button variant="ghost" size="xs" onClick={() => openDetail(r)}>Detail</Button>
                      {canManage && (
                        <>
                          <Button variant="secondary" size="xs" onClick={() => openAssign(r)}>Siswa</Button>
                          <Button variant="secondary" size="xs" onClick={() => handleEdit(r)}>Edit</Button>
                          <Button variant="danger" size="xs" onClick={() => handleDelete(r)}>Hapus</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-slate-50 flex justify-center">
          <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={n => load(n, filterPeriodId)} />
        </div>
      </Card>

      <Modal
        isOpen={!!modal.type} onClose={closeModal}
        title={modal.type === 'create' ? 'Tambah Rombel' : modal.type === 'edit' ? 'Edit Rombel' : modal.type === 'detail' ? 'Detail Rombel' : modal.type === 'assign' ? 'Assign Siswa' : 'Konfirmasi Hapus'}
      >
        {(modal.type === 'create' || modal.type === 'edit') && canManage && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Rombel</label>
              <Input value={form.name} onChange={e => updateForm('name', e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Periode</label>
                <Select value={form.periodId} onChange={e => updateForm('periodId', e.target.value)} required>
                  <option value="">Pilih Periode</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jenis</label>
                <Select value={form.type} onChange={e => updateForm('type', e.target.value)}>
                  {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Tingkat Kelas {form.type === 'utama' && <span className="text-rose-500">*</span>}
              </label>
              <Select
                value={form.gradeLevel}
                onChange={e => updateForm('gradeLevel', e.target.value)}
                required={form.type === 'utama'}
              >
                <option value="">Pilih tingkat</option>
                {GRADE_LEVEL_OPTIONS.map(n => (
                  <option key={n} value={String(n)}>Kelas {n}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Button type="submit" className="flex-1">{editingId ? 'Simpan Perubahan' : 'Tambah Rombel'}</Button>
              <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && (
          <div className="space-y-5">
            {detailLoading && <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" /></div>}
            {!detailLoading && modal.item && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: 'Nama',    value: modal.item.name },
                    { label: 'Jenis',   value: typeLabel(modal.item.type) },
                    { label: 'Tingkat', value: modal.item.gradeLevel != null ? `Kelas ${modal.item.gradeLevel}` : '-' },
                    { label: 'Periode', value: periodMap.get(modal.item.periodId)?.name || '-' },
                  ].map(({ label, value }) => (
                    <div key={label}><span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">{label}</span><p className="font-semibold text-slate-800 mt-0.5">{value}</p></div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-700">Daftar Siswa ({modal.item.students?.length || 0})</span>
                    <Input value={detailQuery} onChange={e => setDetailQuery(e.target.value)} placeholder="Cari..." className="w-40 text-xs" />
                  </div>
                  <div className="max-h-72 overflow-auto space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {(modal.item.students || [])
                      .filter(s => !detailQuery || s.name?.toLowerCase().includes(detailQuery.toLowerCase()) || s.nis?.includes(detailQuery))
                      .map(s => (
                        <div key={s.id} className="flex items-center justify-between bg-white rounded-lg border border-slate-100 px-3 py-2">
                          <div><div className="text-sm font-medium text-slate-800">{s.name}</div><div className="text-xs text-slate-400">{s.nis}</div></div>
                          {canManage && (
                            <Button variant="danger" size="xs" onClick={() => handleRemoveStudent(s)} disabled={removeLoadingId === s.id}>
                              {removeLoadingId === s.id ? '...' : 'Hapus'}
                            </Button>
                          )}
                        </div>
                      ))}
                    {!(modal.item.students?.length) && <p className="text-center text-sm text-slate-400 py-4">Belum ada siswa</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {modal.type === 'assign' && canManage && (
          <div className="space-y-5">
            {assignLoading ? (
              <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" /></div>
            ) : (
              <>
                <p className="text-sm text-slate-600">Pilih siswa untuk ditambahkan ke <strong>{modal.item?.name}</strong></p>
                <Input value={assignQuery} onChange={e => setAssignQuery(e.target.value)} placeholder="Cari nama atau NIS siswa..." />
                <div className="max-h-72 overflow-auto space-y-1.5">
                  {students
                    .filter(s => !assignQuery || s.name?.toLowerCase().includes(assignQuery.toLowerCase()) || s.nis?.includes(assignQuery))
                    .map(s => (
                      <label key={s.id} className="flex items-center gap-3 bg-white border border-slate-100 px-3 py-2.5 rounded-lg cursor-pointer hover:border-emerald-200 transition">
                        <input type="checkbox" checked={assignIds.includes(s.id)} onChange={() => toggleAssign(s.id)} className="h-4 w-4 text-emerald-600 rounded" />
                        <div><div className="text-sm font-medium">{s.name}</div><div className="text-xs text-slate-400">{s.nis}</div></div>
                      </label>
                    ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={handleAssign} disabled={assignLoading} className="flex-1">Simpan Assign</Button>
                  <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
                </div>
              </>
            )}
          </div>
        )}

        {modal.type === 'delete' && modal.item && canManage && (
          <div className="space-y-5">
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
              Yakin ingin menghapus rombel <strong>{modal.item.name}</strong>?
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Ya, Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Rombel;
