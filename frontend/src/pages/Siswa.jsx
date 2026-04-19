import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { useAuth } from '../context/useAuth';
import { ADMIN_ROLES, canAccess } from '../constants/rbac';
import { buildPageParams, DEFAULT_PAGE_SIZE, fetchAllPages, normalizePaginatedResponse } from '../utils/pagination';
import { isValidDateOnly } from '../utils/temporalValidation';

const emptyForm = { nis: '', name: '', gender: '', birthDate: '', rombelIds: [] };

const genderOptions = [
  { value: '', label: 'Pilih Jenis Kelamin' },
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' }
];

const formatRombelLabel = (rombel) => {
  if (!rombel) return '-';
  const typeLabel = rombel.type === 'peminatan' ? 'Peminatan' : 'Utama';
  return `${rombel.name} • ${typeLabel}`;
};

const Siswa = () => {
  const { roles } = useAuth();
  const canManage = canAccess(roles, ADMIN_ROLES);

  const [students,     setStudents]     = useState([]);
  const [rombels,      setRombels]      = useState([]);
  const [form,         setForm]         = useState(emptyForm);
  const [editingId,    setEditingId]    = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [modal,        setModal]        = useState({ type: null, item: null });
  const [importFile,   setImportFile]   = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [pagination,   setPagination]   = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 1 });

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true); setError(null);
    try {
      const [studentRes, rombelRes] = await Promise.all([
        api.get('/siswa', { params: buildPageParams({ page: nextPage, pageSize: DEFAULT_PAGE_SIZE, search: nextSearch || undefined }) }),
        fetchAllPages(api, '/rombel')
      ]);
      const normalized = normalizePaginatedResponse(studentRes.data);
      setStudents(normalized.items || []); setPagination(normalized); setPage(normalized.page);
      setRombels(rombelRes || []);
    } catch (err) { setError(err.response?.data?.message || 'Gagal memuat data siswa'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(1, search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const rombelMap   = useMemo(() => new Map(rombels.map(r => [r.id, r])), [rombels]);
  const updateForm  = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const toggleRombel = (id) => setForm(prev => ({ ...prev, rombelIds: prev.rombelIds.includes(id) ? prev.rombelIds.filter(i => i !== id) : [...prev.rombelIds, id] }));
  const resetForm   = () => { setForm(emptyForm); setEditingId(null); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.nis.trim() || !form.name.trim()) { setError('NIS dan nama wajib diisi'); return; }
    if (form.birthDate && !isValidDateOnly(form.birthDate)) { setError('Tanggal lahir tidak valid'); return; }
    const payload = { nis: form.nis.trim(), name: form.name.trim(), gender: form.gender || null, birthDate: form.birthDate || null, rombelIds: form.rombelIds };
    try {
      if (editingId) await api.put(`/siswa/${editingId}`, payload);
      else           await api.post('/siswa', payload);
      setModal({ type: null }); resetForm(); load();
    } catch (err) { setError(err.response?.data?.message || 'Gagal menyimpan siswa'); }
  };

  const handleEdit  = (s) => { setEditingId(s.id); setForm({ nis: s.nis, name: s.name, gender: s.gender || '', birthDate: s.birthDate || '', rombelIds: s.rombels?.map(r => r.id) || [] }); setModal({ type: 'edit', item: s }); };
  const handleDelete = (s) => setModal({ type: 'delete', item: s });
  const handleConfirmDelete = async () => {
    if (!modal.item) return;
    try { await api.delete(`/siswa/${modal.item.id}`); setModal({ type: null }); load(); }
    catch (err) { setError(err.response?.data?.message || 'Gagal menghapus siswa'); }
  };

  const openCreate  = () => { resetForm(); setModal({ type: 'create' }); };
  const openDetail  = (s) => setModal({ type: 'detail', item: s });
  const openImport  = () => { setImportFile(null); setImportResult(null); setModal({ type: 'import' }); };
  const closeModal  = () => { setModal({ type: null }); if (modal.type !== 'detail') resetForm(); };

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/siswa/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'template-siswa.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch { setError('Gagal mengunduh template'); }
  };

  const handleImport = async () => {
    if (!importFile) { setError('Pilih file Excel terlebih dahulu'); return; }
    try {
      const fd = new FormData(); fd.append('file', importFile);
      const { data } = await api.post('/siswa/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(data); load();
    } catch (err) { setError(err.response?.data?.message || 'Gagal import data'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{canManage ? 'Data Siswa' : 'Daftar Siswa'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{canManage ? 'Kelola data siswa dan keanggotaan rombel' : 'Lihat data siswa dan keanggotaan rombel'}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={openImport}>↑ Import Excel</Button>
            <Button size="sm" onClick={openCreate}>+ Tambah Siswa</Button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Daftar Siswa</h2>
            {!loading && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{pagination.totalItems}</span>}
            {loading && <span className="text-xs text-slate-400 animate-pulse">Memuat...</span>}
          </div>
          <div className="w-full sm:w-64">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari nama atau NIS..." className="text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nama</th><th>NIS</th><th>Gender</th><th>Rombel</th><th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {!students.length && !loading && (
                <tr><td colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <span className="text-4xl">🎓</span>
                    <span className="text-sm font-medium">Belum ada data siswa</span>
                  </div>
                </td></tr>
              )}
              {students.map(s => (
                <tr key={s.id}>
                  <td><div className="font-semibold text-slate-900">{s.name}</div><div className="text-xs text-slate-400">{s.birthDate || '-'}</div></td>
                  <td className="tabular-nums text-slate-600">{s.nis}</td>
                  <td>{s.gender ? <Badge variant={s.gender === 'L' ? 'info' : 'peminatan'} size="xs">{s.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</Badge> : '-'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {s.rombels?.length
                        ? s.rombels.map(r => <Badge key={r.id} variant={r.type === 'peminatan' ? 'peminatan' : 'utama'} size="xs">{r.name}</Badge>)
                        : <span className="text-slate-400 text-xs">-</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button variant="ghost" size="xs" onClick={() => openDetail(s)}>Detail</Button>
                      {canManage && <>
                        <Button variant="secondary" size="xs" onClick={() => handleEdit(s)}>Edit</Button>
                        <Button variant="danger" size="xs" onClick={() => handleDelete(s)}>Hapus</Button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-slate-50 flex justify-center">
          <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={load} />
        </div>
      </Card>

      <Modal
        isOpen={!!modal.type} onClose={closeModal}
        title={modal.type === 'create' ? 'Tambah Siswa Baru' : modal.type === 'edit' ? 'Edit Data Siswa' : modal.type === 'detail' ? 'Detail Siswa' : modal.type === 'delete' ? 'Konfirmasi Hapus' : 'Import Siswa'}
      >
        {(modal.type === 'create' || modal.type === 'edit') && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">NIS</label><Input value={form.nis} onChange={e => updateForm('nis', e.target.value)} required /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Lengkap</label><Input value={form.name} onChange={e => updateForm('name', e.target.value)} required /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Jenis Kelamin</label><Select value={form.gender} onChange={e => updateForm('gender', e.target.value)}>{genderOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Tanggal Lahir</label><Input type="date" value={form.birthDate} onChange={e => updateForm('birthDate', e.target.value)} /></div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Rombel</label>
              <div className="max-h-52 overflow-auto grid grid-cols-1 sm:grid-cols-2 gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
                {rombels.map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-white transition">
                    <input type="checkbox" checked={form.rombelIds.includes(r.id)} onChange={() => toggleRombel(r.id)} className="h-4 w-4 text-emerald-600 rounded" />
                    <span className="text-sm text-slate-700">{formatRombelLabel(r)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Button type="submit" className="flex-1">{editingId ? 'Simpan Perubahan' : 'Tambah Siswa'}</Button>
              <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && modal.item && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-sky-400 to-emerald-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">{modal.item.name.charAt(0)}</div>
              <div><p className="font-bold text-slate-800">{modal.item.name}</p><p className="text-xs text-slate-400 mt-0.5">NIS: {modal.item.nis}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[{ label: 'Gender', value: modal.item.gender === 'L' ? 'Laki-laki' : modal.item.gender === 'P' ? 'Perempuan' : '-' }, { label: 'Tanggal Lahir', value: modal.item.birthDate || '-' }].map(({ label, value }) => (
                <div key={label}><span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">{label}</span><p className="font-semibold text-slate-800 mt-0.5">{value}</p></div>
              ))}
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Rombel</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {modal.item.rombels?.length
                  ? modal.item.rombels.map(r => <Badge key={r.id} variant={r.type === 'peminatan' ? 'peminatan' : 'utama'}>{formatRombelLabel(rombelMap.get(r.id) || r)}</Badge>)
                  : <span className="text-sm text-slate-400">-</span>}
              </div>
            </div>
          </div>
        )}

        {modal.type === 'delete' && modal.item && (
          <div className="space-y-5">
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">Yakin ingin menghapus siswa <strong>{modal.item.name}</strong>?</div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="danger" onClick={handleConfirmDelete} className="flex-1">Ya, Hapus</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
          </div>
        )}

        {modal.type === 'import' && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">Unduh template Excel, isi data siswa, lalu upload kembali.</p>
            <Button variant="secondary" onClick={downloadTemplate} className="w-full">↓ Download Template Excel</Button>
            <Input type="file" accept=".xlsx" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleImport} className="flex-1" disabled={!importFile}>Upload &amp; Import</Button>
              <Button variant="secondary" onClick={closeModal} className="flex-1">Batal</Button>
            </div>
            {importResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                ✅ Berhasil import <strong>{importResult.success}</strong> siswa.
                {importResult.failed?.length > 0 && <p className="mt-1 text-amber-700">⚠️ Gagal: {importResult.failed.length} baris</p>}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Siswa;
