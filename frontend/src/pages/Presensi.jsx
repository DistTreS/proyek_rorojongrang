import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const statusOptions = [
  { value: 'hadir', label: 'Hadir' },
  { value: 'izin', label: 'Izin' },
  { value: 'sakit', label: 'Sakit' },
  { value: 'alpa', label: 'Alpa' }
];

const dayOptions = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' }
];

const emptyMeetingForm = {
  date: '',
  rombelId: '',
  subjectId: '',
  teacherId: '',
  substituteTeacherId: '',
  meetingNote: '',
  timeSlotIds: []
};

const formatRombelLabel = (rombel) => {
  if (!rombel) return '-';
  const typeLabel = rombel.type === 'peminatan' ? 'Peminatan' : 'Utama';
  return `${rombel.name} • ${typeLabel}`;
};

const Presensi = () => {
  const [meetings, setMeetings] = useState([]);
  const [rombels, setRombels] = useState([]);
  const [slots, setSlots] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [meetingForm, setMeetingForm] = useState(emptyMeetingForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const assetBase = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');
  const buildFileUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('/uploads')) return `${assetBase}${url}`;
    return url;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meetingRes, rombelRes, slotRes, periodRes, subjectRes, tendikRes] = await Promise.all([
        api.get('/attendance/meetings'),
        api.get('/rombel'),
        api.get('/jam'),
        api.get('/period'),
        api.get('/mapel'),
        api.get('/tendik')
      ]);
      setMeetings(meetingRes.data || []);
      setRombels(rombelRes.data || []);
      setSlots(slotRes.data || []);
      setPeriods(periodRes.data || []);
      setSubjects(subjectRes.data || []);
      setTeachers((tendikRes.data || []).filter((item) => item.user?.roles?.includes('guru')));
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat presensi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateMeetingForm = (field, value) => {
    setMeetingForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetMeetingForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    setMeetingForm({ ...emptyMeetingForm, date: today });
  };

  const openCreate = () => {
    resetMeetingForm();
    setModal({ type: 'create', item: null });
  };

  const openDetail = async (meeting) => {
    setModal({ type: 'detail', item: meeting });
    setDetail(null);
    try {
      const { data } = await api.get(`/attendance/meetings/${meeting.meetingId}`);
      setDetail(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail presensi');
    }
  };

  const closeModal = () => {
    setModal({ type: null, item: null });
    setDetail(null);
  };

  const toggleSlot = (slotId) => {
    setMeetingForm((prev) => {
      const exists = prev.timeSlotIds.includes(slotId);
      return {
        ...prev,
        timeSlotIds: exists ? prev.timeSlotIds.filter((id) => id !== slotId) : [...prev.timeSlotIds, slotId]
      };
    });
  };

  const handleCreateMeeting = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        date: meetingForm.date,
        rombelId: meetingForm.rombelId ? Number(meetingForm.rombelId) : null,
        subjectId: meetingForm.subjectId ? Number(meetingForm.subjectId) : null,
        teacherId: meetingForm.teacherId ? Number(meetingForm.teacherId) : null,
        substituteTeacherId: meetingForm.substituteTeacherId ? Number(meetingForm.substituteTeacherId) : null,
        meetingNote: meetingForm.meetingNote.trim() || null,
        timeSlotIds: meetingForm.timeSlotIds
      };
      const { data } = await api.post('/attendance/meetings', payload);
      await load();
      setModal({ type: 'detail', item: { meetingId: data.meetingId } });
      const detailRes = await api.get(`/attendance/meetings/${data.meetingId}`);
      setDetail(detailRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membuat pertemuan');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMeeting = async (meeting) => {
    if (!confirm('Hapus pertemuan ini?')) return;
    try {
      await api.delete(`/attendance/meetings/${meeting.meetingId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus pertemuan');
    }
  };

  const handleUpdateEntries = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const entries = detail.students.map((student) => ({
        studentId: student.id,
        status: student.status,
        note: student.note,
        attachmentUrl: student.attachmentUrl
      }));
      await api.put(`/attendance/meetings/${detail.meetingId}/entries`, { entries });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan presensi');
    } finally {
      setSaving(false);
    }
  };

  const updateStudentField = (studentId, field, value) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const students = prev.students.map((student) => (
        student.id === studentId ? { ...student, [field]: value } : student
      ));
      return { ...prev, students };
    });
  };

  const handleUpload = async (studentId, file) => {
    if (!detail || !file) return;
    setUploadingId(studentId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(
        `/attendance/meetings/${detail.meetingId}/students/${studentId}/attachment`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      updateStudentField(studentId, 'attachmentUrl', data.attachmentUrl);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal upload berkas');
    } finally {
      setUploadingId(null);
    }
  };

  const periodMap = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);
  const rombelMap = useMemo(() => new Map(rombels.map((r) => [r.id, r])), [rombels]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const selectedRombel = useMemo(() => rombelMap.get(Number(meetingForm.rombelId)), [meetingForm.rombelId, rombelMap]);
  const selectedDay = useMemo(() => {
    if (!meetingForm.date) return null;
    const date = new Date(`${meetingForm.date}T00:00:00`);
    const day = date.getDay(); // 0=Sunday ... 6=Saturday
    if (day === 0) return null;
    return day; // 1..6
  }, [meetingForm.date]);
  const activeDayFilter = selectedDay;
  const currentSlots = useMemo(() => {
    if (!selectedRombel) return [];
    if (!activeDayFilter) return [];
    return slots.filter(
      (slot) => slot.periodId === selectedRombel.periodId && slot.dayOfWeek === activeDayFilter
    );
  }, [slots, selectedRombel, activeDayFilter]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Presensi</h1>
          <p className="text-sm text-slate-600">Buat pertemuan dan kelola kehadiran siswa.</p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          type="button"
          onClick={openCreate}
        >
          + Buat Pertemuan
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Daftar Pertemuan</h2>
          <span className="text-xs text-slate-500">{meetings.length} pertemuan</span>
        </div>
        <div className="mt-5 hidden grid-cols-[0.9fr_1.2fr_1.4fr_1.2fr_0.9fr_0.8fr] gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Tanggal</div>
          <div>Rombel</div>
          <div>Mapel</div>
          <div>Jam</div>
          <div>Ringkas</div>
          <div>Aksi</div>
        </div>
        <div className="mt-4 grid gap-4">
          {meetings.map((meeting) => (
            <div
              key={meeting.meetingId}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[0.9fr_1.2fr_1.4fr_1.2fr_0.9fr_0.8fr] md:items-center"
            >
              <div className="text-sm text-slate-700">{meeting.date}</div>
              <div className="text-sm font-semibold text-slate-900">{formatRombelLabel(meeting.rombel)}</div>
              <div className="text-sm text-slate-700">
                {meeting.subject?.name || '-'}{' '}
                <span className="text-xs text-slate-500">• {meeting.subject?.type === 'peminatan' ? 'Peminatan' : 'Wajib'}</span>
              </div>
              <div className="text-xs text-slate-600">
                {meeting.timeSlots?.map((slot) => (
                  <div key={slot.id}>
                    {dayOptions.find((day) => day.value === slot.dayOfWeek)?.label} {slot.startTime}-{slot.endTime}
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-600">
                H:{meeting.statusSummary.hadir} I:{meeting.statusSummary.izin} S:{meeting.statusSummary.sakit} A:{meeting.statusSummary.alpa}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                  type="button"
                  onClick={() => openDetail(meeting)}
                >
                  Detail
                </button>
                <button
                  className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                  type="button"
                  onClick={() => handleDeleteMeeting(meeting)}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
          {!meetings.length && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada data.
            </div>
          )}
        </div>
      </div>

      {modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <div className="relative w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            {modal.type === 'create' && (
              <form className="space-y-4" onSubmit={handleCreateMeeting}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Buat Pertemuan</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" type="button" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Tanggal
                    <input
                      type="date"
                      value={meetingForm.date}
                      onChange={(e) => updateMeetingForm('date', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Rombel
                    <select
                      value={meetingForm.rombelId}
                      onChange={(e) => updateMeetingForm('rombelId', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Pilih rombel</option>
                      {rombels.map((rombel) => (
                        <option key={rombel.id} value={rombel.id}>{formatRombelLabel(rombel)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Mata Pelajaran
                    <select
                      value={meetingForm.subjectId}
                      onChange={(e) => updateMeetingForm('subjectId', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Pilih mapel</option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name} • {subject.type === 'peminatan' ? 'Peminatan' : 'Wajib'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Guru Pengajar
                    <select
                      value={meetingForm.teacherId}
                      onChange={(e) => updateMeetingForm('teacherId', e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Pilih guru</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Guru Pengganti (opsional)
                    <select
                      value={meetingForm.substituteTeacherId}
                      onChange={(e) => updateMeetingForm('substituteTeacherId', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Tidak ada</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Catatan Guru (opsional)
                    <input
                      value={meetingForm.meetingNote}
                      onChange={(e) => updateMeetingForm('meetingNote', e.target.value)}
                      placeholder="Misal: guru berhalangan hadir, diabsen oleh guru piket."
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Jam Pelajaran (boleh lebih dari satu)
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {currentSlots.map((slot) => (
                      <label key={slot.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={meetingForm.timeSlotIds.includes(slot.id)}
                          onChange={() => toggleSlot(slot.id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                        />
                        <span>
                          {dayOptions.find((day) => day.value === slot.dayOfWeek)?.label} • {slot.startTime}-{slot.endTime}
                        </span>
                      </label>
                    ))}
                    {!currentSlots.length && (
                      <div className="text-sm text-slate-500">
                        {meetingForm.date
                          ? 'Belum ada jam pelajaran untuk hari tersebut.'
                          : 'Pilih tanggal untuk menampilkan jam pelajaran.'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-70"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? 'Menyimpan...' : 'Buat Pertemuan'}
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    type="button"
                    onClick={closeModal}
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {modal.type === 'detail' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Detail Presensi</h3>
                  <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeModal}>
                    Tutup
                  </button>
                </div>
                {!detail && <div className="text-sm text-slate-500">Memuat data...</div>}
                {detail && (
                  <>
                    <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                      <div><span className="text-xs uppercase text-slate-500">Tanggal</span><div className="font-semibold">{detail.date}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Rombel</span><div className="font-semibold">{formatRombelLabel(detail.rombel)}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Mapel</span><div className="font-semibold">{detail.subject?.name}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Guru</span><div className="font-semibold">{detail.teacher?.name || '-'}</div></div>
                      <div><span className="text-xs uppercase text-slate-500">Guru Pengganti</span><div className="font-semibold">{detail.substituteTeacher?.name || '-'}</div></div>
                      <div className="sm:col-span-2"><span className="text-xs uppercase text-slate-500">Catatan</span><div className="font-semibold">{detail.meetingNote || '-'}</div></div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jam Pelajaran</div>
                      <div className="mt-2 text-sm text-slate-700">
                        {detail.timeSlots.map((slot) => (
                          <div key={slot.id}>
                            {dayOptions.find((day) => day.value === slot.dayOfWeek)?.label} • {slot.startTime}-{slot.endTime}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Daftar Siswa (default hadir)
                      </div>
                      <div className="max-h-[420px] overflow-auto">
                        {detail.students.map((student) => (
                          <div key={student.id} className="grid gap-3 border-b border-slate-100 px-4 py-3 sm:grid-cols-[1.4fr_0.9fr_1.2fr_1fr] sm:items-center">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{student.name}</div>
                              <div className="text-xs text-slate-500">{student.nis || '-'}</div>
                            </div>
                            <select
                              value={student.status}
                              onChange={(e) => updateStudentField(student.id, 'status', e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                            >
                              {statusOptions.map((status) => (
                                <option key={status.value} value={status.value}>{status.label}</option>
                              ))}
                            </select>
                            <input
                              value={student.note || ''}
                              onChange={(e) => updateStudentField(student.id, 'note', e.target.value)}
                              placeholder="Catatan (opsional)"
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                            />
                            <div className="flex flex-col gap-2 text-xs text-slate-500">
                              {(student.status === 'izin' || student.status === 'sakit') && (
                                <>
                                  <input
                                    type="file"
                                    onChange={(e) => handleUpload(student.id, e.target.files?.[0])}
                                  />
                                  {uploadingId === student.id && <span>Mengupload...</span>}
                                  {student.attachmentUrl && (
                                    <a
                                      className="text-emerald-600 hover:underline"
                                      href={buildFileUrl(student.attachmentUrl)}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Lihat lampiran
                                    </a>
                                  )}
                                </>
                              )}
                              {(student.status !== 'izin' && student.status !== 'sakit') && <span>-</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-70"
                        type="button"
                        onClick={handleUpdateEntries}
                        disabled={saving}
                      >
                        {saving ? 'Menyimpan...' : 'Simpan Presensi'}
                      </button>
                      <button
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                        type="button"
                        onClick={() => {
                          const students = detail.students.map((student) => ({ ...student, status: 'hadir' }));
                          setDetail({ ...detail, students });
                        }}
                      >
                        Set Semua Hadir
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default Presensi;
