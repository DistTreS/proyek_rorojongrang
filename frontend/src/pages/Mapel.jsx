import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { buildPageParams, DEFAULT_PAGE_SIZE, fetchAllPages, normalizePaginatedResponse } from '../utils/pagination';

const emptyForm = { code: '', name: '', type: 'wajib', periodId: '' };
const typeOptions = [{ value: 'wajib', label: 'Wajib' }, { value: 'peminatan', label: 'Peminatan' }];
const typeLabel   = (v) => v === 'peminatan' ? 'Peminatan' : 'Wajib';

const Mapel = () => {
  const [subjects,       setSubjects]       = useState([]);
  const [periods,        setPeriods]        = useState([]);
  const [form,           setForm]           = useState(emptyForm);
  const [editingId,      setEditingId]      = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [modal,          setModal]          = useState({ type: null, item: null });
  const [filterPeriodId, setFilterPeriodId] = useState('');
  const [search,         setSearch]         = useState('');
  const [page,           setPage]           = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 1 });

  const load = async (nextPage = page, nextPeriodId = filterPeriodId, nextSearch = search) => {
    setLoading(true); setError(null);
    try {
      const [subjectRes, periodRes] = await Promise.all([
        api.get('/mapel', { params: buildPageParams({ page: nextPage, pageSize: DEFAULT_PAGE_SIZE, periodId: nextPeriodId || undefined, search: nextSearch || undefined }) }),
        fetchAllPages(api, '/period')
      ]);
      const normalized = normalizePaginatedResponse(subjectRes.data);
      setSubjects(normalized.items || []); setPagination(normalized); setPage(normalized.page);
      setPeriods(periodRes || []);
    } catch (err) { setError(err.response?.data?.message || 'Gagal memuat mapel'); }
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
  const closeModal = () => { setModal({ type: null, item: null }); resetForm(); };

  const handleEdit = (s) => {
    setEditingId(s.id);
    setForm({ code: s.code || '', name: s.name, type: s.type || 'wajib', periodId: s.periodId || '' });
    setModal({ type: 'edit', item: s });
  };

  const handleDelete = (s) => setModal({ type: 'delete', item: s });
  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try { await api.delete(`/mapel/${modal.item.id}`); setModal({ type: null }); load(); }
    catch (err) { setError(err.response?.data?.message || 'Gagal menghapus mapel'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.periodId || !form.name.trim()) { setError('Periode dan nama wajib diisi'); return; }
    const payload = { code: form.code.trim() || null, name: form.name.trim(), type: form.type || 'wajib', periodId: Number(form.periodId) };
    try {
      if (editingId) await api.put(`/mapel/${editingId}`, payload);
      else           await api.post('/mapel', payload);
      closeModal(); load();
    } catch (err) { setError(err.response?.data?.message || 'Gagal menyimpan mapel'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mata Pelajaran</h1>
          <p className="text-slate-500 text-sm mt-0.5">Kelola data mapel per periode akademik</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setModal({ type: 'create' }); }}>+ Tambah Mapel</Button>
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
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Daftar Mata Pelajaran</h2>
            {!loading && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{pagination.totalItems}</span>}
            {loading && <span className="text-xs text-slate-400 animate-pulse">Memuat...</span>}
          </div>
          <div className="w-full sm:w-64">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari nama atau kode mapel..." className="text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Nama</th><th>Kode</th><th>Jenis</th><th>Periode</th><th className="text-center">Aksi</th></tr>
            </thead>
            <tbody>
              {!subjects.length && !loading && (
                <tr><td colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <span className="text-4xl">📚</span>
                    <span className="text-sm">Belum ada data mata pelajaran</span>
                  </div>
                </td></tr>
              )}
              {subjects.map(s => (
                <tr key={s.id}>
                  <td><div className="font-semibold text-slate-900">{s.name}</div></td>
                  <td className="text-slate-500 font-mono text-xs">{s.code || '-'}</td>
                  <td>
                    <Badge variant={s.type === 'peminatan' ? 'peminatan' : 'utama'} size="xs">
                      {typeLabel(s.type)}
                    </Badge>
                  </td>
                  <td className="text-slate-600 text-sm">{periodMap.get(s.periodId)?.name || '-'}</td>
                  <td>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button variant="ghost" size="xs" onClick={() => setModal({ type: 'detail', item: s })}>Detail</Button>
                      <Button variant="secondary" size="xs" onClick={() => handleEdit(s)}>Edit</Button>
                      <Button variant="danger" size="xs" onClick={() => handleDelete(s)}>Hapus</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-slate-50 flex justify-center">
          <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={(n) => load(n, filterPeriodId)} />
        </div>
      </Card>

      <Modal
        isOpen={!!modal.type} onClose={closeModal}
        title={modal.type === 'create' ? 'Tambah Mapel Baru' : modal.type === 'edit' ? 'Edit Mapel' : modal.type === 'detail' ? 'Detail Mapel' : 'Konfirmasi Hapus'}
      >
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Periode</label>
                <Select value={form.periodId} onChange={e => updateForm('periodId', e.target.value)} required>
                  <option value="">Pilih Periode</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kode (opsional)</label>
                <Input value={form.code} onChange={e => updateForm('code', e.target.value)} placeholder="mis. MTK" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Mapel</label>
                <Input value={form.name} onChange={e => updateForm('name', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jenis</label>
                <Select value={form.type} onChange={e => updateForm('type', e.target.value)}>
                  {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Button type="submit" className="flex-1">{editingId ? 'Simpan Perubahan' : 'Tambah Mapel'}</Button>
              <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && modal.item && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { label: 'Nama', value: modal.item.name },
                { label: 'Kode', value: modal.item.code || '-' },
                { label: 'Jenis', value: typeLabel(modal.item.type) },
                { label: 'Periode', value: periodMap.get(modal.item.periodId)?.name || '-' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">{label}</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-5">
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
              Yakin ingin menghapus mapel <strong>{modal.item.name}</strong>?
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

export default Mapel;
