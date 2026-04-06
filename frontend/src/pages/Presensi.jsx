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
  normalizePaginatedResponse
} from '../utils/pagination';
import { isValidDateOnly } from '../utils/temporalValidation';

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

const meetingModeOptions = [
  { value: 'scheduled', label: 'Berdasarkan Jadwal Resmi' },
  { value: 'manual', label: 'Pertemuan Manual (Di Luar Jadwal)' }
];

const emptyMeetingForm = {
  mode: 'scheduled',
  date: '',
  teachingAssignmentId: '',
  rombelId: '',
  subjectId: '',
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
  const [teachingSchedule, setTeachingSchedule] = useState([]);
  const [meetingForm, setMeetingForm] = useState(emptyMeetingForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ type: null, item: null });
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [manualRombelOptions, setManualRombelOptions] = useState([]);
  const [manualSubjectOptions, setManualSubjectOptions] = useState([]);
  const [manualOptionsLoading, setManualOptionsLoading] = useState(false);
  const [manualSlotOptions, setManualSlotOptions] = useState([]);
  const [manualSlotLoading, setManualSlotLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });

  const assetBase = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');

  const buildFileUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('/uploads')) return `${assetBase}${url}`;
    return url;
  };

  const load = async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const [meetingRes, scheduleRes] = await Promise.all([
        api.get('/attendance/meetings', {
          params: buildPageParams({
            page: nextPage,
            pageSize: DEFAULT_PAGE_SIZE
          })
        }),
        api.get('/schedule', {
          params: {
            scope: 'personal'
          }
        })
      ]);
      const normalized = normalizePaginatedResponse(meetingRes.data);
      setMeetings(normalized.items || []);
      setPagination(normalized);
      setPage(normalized.page);
      setTeachingSchedule(scheduleRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat presensi');
    } finally {
      setLoading(false);
    }
  };

  const loadManualOptions = async () => {
    setManualOptionsLoading(true);
    try {
      const { data } = await api.get('/attendance/manual-options');
      setManualRombelOptions(Array.isArray(data?.rombels) ? data.rombels : []);
      setManualSubjectOptions(Array.isArray(data?.subjects) ? data.subjects : []);
    } catch {
      setManualRombelOptions([]);
      setManualSubjectOptions([]);
    } finally {
      setManualOptionsLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    loadManualOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    loadManualOptions();
    setModal({ type: 'create' });
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
    setModal({ type: null });
    setDetail(null);
  };

  const toggleSlot = (slotId) => {
    setMeetingForm((prev) => {
      const exists = prev.timeSlotIds.includes(slotId);
      return {
        ...prev,
        timeSlotIds: exists
          ? prev.timeSlotIds.filter((id) => id !== slotId)
          : [...prev.timeSlotIds, slotId]
      };
    });
  };

  const handleCreateMeeting = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const isManualMeeting = meetingForm.mode === 'manual';
      const assignment = assignmentMap.get(Number(meetingForm.teachingAssignmentId));

      if (!meetingForm.date || !isValidDateOnly(meetingForm.date)) {
        setError('Tanggal pertemuan tidak valid');
        return;
      }

      if (!meetingForm.timeSlotIds.length) {
        setError('Pilih minimal satu jam pelajaran');
        return;
      }

      if (!isManualMeeting && !assignment) {
        setError('Pilih jadwal mengajar terlebih dahulu');
        return;
      }

      if (isManualMeeting && (!meetingForm.rombelId || !meetingForm.subjectId)) {
        setError('Rombel dan mapel wajib dipilih untuk pertemuan manual');
        return;
      }

      const payload = {
        mode: meetingForm.mode,
        date: meetingForm.date,
        rombelId: isManualMeeting ? Number(meetingForm.rombelId) : (assignment.rombel?.id || null),
        subjectId: isManualMeeting ? Number(meetingForm.subjectId) : (assignment.subject?.id || null),
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
      closeModal();
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
        note: student.note || null,
        attachmentUrl: student.attachmentUrl || null
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
      const students = prev.students.map((student) =>
        student.id === studentId ? { ...student, [field]: value } : student
      );
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

  const teachingAssignments = useMemo(() => {
    return [...new Map(
      teachingSchedule
        .filter((item) => item.teachingAssignment?.id)
        .map((item) => [
          item.teachingAssignment.id,
          {
            ...item.teachingAssignment,
            periodName: item.batch?.periodName || item.teachingAssignment?.period?.name || '-'
          }
        ])
    ).values()];
  }, [teachingSchedule]);

  const assignmentMap = useMemo(() => new Map(teachingAssignments.map((item) => [item.id, item])), [teachingAssignments]);

  const selectedAssignment = useMemo(() => assignmentMap.get(Number(meetingForm.teachingAssignmentId)) || null, [assignmentMap, meetingForm.teachingAssignmentId]);

  const selectedManualRombel = useMemo(
    () => manualRombelOptions.find((rombel) => String(rombel.id) === String(meetingForm.rombelId)) || null,
    [manualRombelOptions, meetingForm.rombelId]
  );

  const selectedDay = useMemo(() => {
    if (!meetingForm.date) return null;
    const date = new Date(`${meetingForm.date}T00:00:00`);
    const day = date.getDay();
    if (day === 0) return null;
    return day;
  }, [meetingForm.date]);

  const currentSlots = useMemo(() => {
    if (!selectedAssignment || !selectedDay) return [];
    return [...new Map(
      teachingSchedule
        .filter((item) =>
          item.teachingAssignment?.id === selectedAssignment.id &&
          item.timeSlot?.dayOfWeek === selectedDay
        )
        .map((item) => [item.timeSlot.id, item.timeSlot])
    ).values()];
  }, [teachingSchedule, selectedAssignment, selectedDay]);

  const manualSlots = useMemo(() => {
    return manualSlotOptions;
  }, [manualSlotOptions]);

  const activeSlots = meetingForm.mode === 'manual' ? manualSlots : currentSlots;

  useEffect(() => {
    let active = true;

    const loadManualSlots = async () => {
      if (meetingForm.mode !== 'manual') {
        setManualSlotOptions([]);
        return;
      }

      if (!meetingForm.date || !meetingForm.rombelId) {
        setManualSlotOptions([]);
        return;
      }

      setManualSlotLoading(true);
      try {
        const { data } = await api.get('/attendance/meeting-slots', {
          params: {
            date: meetingForm.date,
            rombelId: meetingForm.rombelId
          }
        });
        if (active) {
          setManualSlotOptions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          setManualSlotOptions([]);
          setError(err.response?.data?.message || 'Gagal memuat jam pelajaran manual');
        }
      } finally {
        if (active) {
          setManualSlotLoading(false);
        }
      }
    };

    loadManualSlots();
    return () => {
      active = false;
    };
  }, [meetingForm.mode, meetingForm.date, meetingForm.rombelId]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900">Presensi</h1>
          <p className="text-slate-600 mt-1">Buat pertemuan dari jadwal resmi atau manual, lalu kelola kehadiran siswa</p>
        </div>
        <Button onClick={openCreate} size="lg">
          + Buat Pertemuan
        </Button>
      </div>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      {!loading && !teachingAssignments.length && (
        <Card className="p-4 border-amber-200 bg-amber-50 text-amber-800">
          Jadwal mengajar approved belum ditemukan. Pertemuan manual hanya bisa dibuat jika data rombel/mapel/slot sudah tersedia.
        </Card>
      )}

      {/* Daftar Pertemuan */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Daftar Pertemuan</h2>
          <span className="text-sm text-slate-500">{pagination.totalItems} pertemuan</span>
        </div>

        <div className="space-y-4">
          {meetings.map((meeting) => (
            <Card key={meeting.meetingId} className="p-6 hover:shadow-md transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.2fr_1.4fr_1.2fr_0.9fr_0.8fr] gap-4 md:items-center">
                <div className="text-sm text-slate-700">{meeting.date}</div>
                <div className="text-sm font-semibold text-slate-900">{formatRombelLabel(meeting.rombel)}</div>
                <div className="text-sm text-slate-700">
                  {meeting.subject?.name || '-'}
                  <span className="text-xs ml-2 text-slate-500">
                    • {meeting.subject?.type === 'peminatan' ? 'Peminatan' : 'Wajib'}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  {meeting.timeSlots?.map((slot) => (
                    <div key={slot.id}>
                      {dayOptions.find((d) => d.value === slot.dayOfWeek)?.label} {slot.startTime}-{slot.endTime}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-slate-600">
                  H:{meeting.statusSummary?.hadir || 0} I:{meeting.statusSummary?.izin || 0} S:{meeting.statusSummary?.sakit || 0} A:{meeting.statusSummary?.alpa || 0}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(meeting)}>
                    Detail
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteMeeting(meeting)}>
                    Hapus
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {!meetings.length && !loading && (
            <div className="text-center py-12 text-slate-500">
              Belum ada pertemuan.
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

      {/* Modal Create & Detail */}
      <Modal
        isOpen={!!modal.type}
        onClose={closeModal}
        title={
          modal.type === 'create' ? 'Buat Pertemuan Baru' :
          modal.type === 'detail' ? 'Detail Presensi' : ''
        }
      >
        {modal.type === 'create' && (
          <form onSubmit={handleCreateMeeting} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Mode Pertemuan</label>
              <Select
                value={meetingForm.mode}
                onChange={(e) => setMeetingForm((prev) => ({
                  ...prev,
                  mode: e.target.value,
                  teachingAssignmentId: '',
                  rombelId: '',
                  subjectId: '',
                  timeSlotIds: []
                }))}
              >
                {meetingModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tanggal</label>
                <Input
                  type="date"
                  value={meetingForm.date}
                  onChange={(e) => setMeetingForm((prev) => ({ ...prev, date: e.target.value, timeSlotIds: [] }))}
                  required
                />
              </div>
              {meetingForm.mode === 'scheduled' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Jadwal Mengajar</label>
                  <Select
                    value={meetingForm.teachingAssignmentId}
                    onChange={(e) => setMeetingForm((prev) => ({
                      ...prev,
                      teachingAssignmentId: e.target.value,
                      timeSlotIds: []
                    }))}
                    required
                  >
                    <option value="">Pilih pengampu</option>
                    {teachingAssignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {formatRombelLabel(a.rombel)} • {a.subject?.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Rombel</label>
                  <Select
                    value={meetingForm.rombelId}
                    onChange={(e) => setMeetingForm((prev) => ({
                      ...prev,
                      rombelId: e.target.value,
                      timeSlotIds: []
                    }))}
                    required
                  >
                    <option value="">Pilih rombel</option>
                    {manualRombelOptions.map((rombel) => (
                      <option key={rombel.id} value={rombel.id}>
                        {formatRombelLabel(rombel)}
                      </option>
                    ))}
                  </Select>
                  {manualOptionsLoading && (
                    <p className="mt-1 text-xs text-slate-500">Memuat opsi rombel...</p>
                  )}
                  {!manualOptionsLoading && !manualRombelOptions.length && (
                    <p className="mt-1 text-xs text-amber-700">
                      Belum ada rombel dari pengampu Anda. Pastikan data pengampu guru sudah tersedia.
                    </p>
                  )}
                </div>
              )}
            </div>

            {meetingForm.mode === 'manual' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mata Pelajaran</label>
                <Select
                  value={meetingForm.subjectId}
                  onChange={(e) => updateMeetingForm('subjectId', e.target.value)}
                  required
                >
                  <option value="">Pilih mapel</option>
                  {manualSubjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
                {manualOptionsLoading && (
                  <p className="mt-1 text-xs text-slate-500">Memuat opsi mapel...</p>
                )}
                {!manualOptionsLoading && !manualSubjectOptions.length && (
                  <p className="mt-1 text-xs text-amber-700">
                    Belum ada mapel dari pengampu Anda. Pastikan data pengampu guru sudah tersedia.
                  </p>
                )}
              </div>
            )}

            {meetingForm.mode === 'scheduled' && selectedAssignment && (
              <Card className="p-4 bg-slate-50">
                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Ringkasan Pengampu</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>Rombel: <span className="font-medium">{formatRombelLabel(selectedAssignment.rombel)}</span></div>
                  <div>Mapel: <span className="font-medium">{selectedAssignment.subject?.name}</span></div>
                  <div>Periode: <span className="font-medium">{selectedAssignment.periodName}</span></div>
                </div>
              </Card>
            )}

            {meetingForm.mode === 'manual' && (
              <Card className="p-4 bg-slate-50">
                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Ringkasan Pertemuan Manual</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    Rombel:
                    <span className="font-medium ml-1">
                      {selectedManualRombel?.name || '-'}
                    </span>
                  </div>
                  <div>
                    Mapel:
                    <span className="font-medium ml-1">
                      {manualSubjectOptions.find((subject) => String(subject.id) === String(meetingForm.subjectId))?.name || '-'}
                    </span>
                  </div>
                  <div>Mode: <span className="font-medium">Manual</span></div>
                </div>
              </Card>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Catatan Guru (opsional)</label>
              <Input value={meetingForm.meetingNote} onChange={(e) => updateMeetingForm('meetingNote', e.target.value)} placeholder="Misal: guru piket hari ini" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Jam Pelajaran (boleh lebih dari satu)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-auto p-3 border border-slate-200 rounded-2xl">
                {meetingForm.mode === 'manual' && manualSlotLoading && (
                  <p className="text-sm text-slate-500 col-span-full">Memuat jam pelajaran...</p>
                )}
                {activeSlots.map((slot) => (
                  <label key={slot.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={meetingForm.timeSlotIds.includes(slot.id)} onChange={() => toggleSlot(slot.id)} />
                    <span className="text-sm">
                      {dayOptions.find(d => d.value === slot.dayOfWeek)?.label} • {slot.startTime}-{slot.endTime}
                    </span>
                  </label>
                ))}
                {!manualSlotLoading && meetingForm.mode === 'manual' && (!meetingForm.date || !meetingForm.rombelId) && (
                  <p className="text-sm text-slate-500 col-span-full">
                    Pilih tanggal dan rombel terlebih dahulu untuk menampilkan semua jam pelajaran di hari tersebut.
                  </p>
                )}
                {!manualSlotLoading && !activeSlots.length && !(meetingForm.mode === 'manual' && (!meetingForm.date || !meetingForm.rombelId)) && (
                  <p className="text-sm text-slate-500 col-span-full">
                    Tidak ada jam pelajaran untuk hari ini. Silakan pilih tanggal lain.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" variant="primary" size="lg" disabled={saving} className="flex-1">
                {saving ? 'Menyimpan...' : 'Buat Pertemuan'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={closeModal}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {modal.type === 'detail' && detail && (
          <div className="space-y-6">
            {/* Detail header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 text-sm">
              <div><span className="text-xs uppercase text-slate-500">Tanggal</span><p className="font-semibold">{detail.date}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Rombel</span><p className="font-semibold">{formatRombelLabel(detail.rombel)}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Mapel</span><p className="font-semibold">{detail.subject?.name}</p></div>
              <div><span className="text-xs uppercase text-slate-500">Jam</span><p className="font-semibold">{detail.timeSlots?.map(s => `${dayOptions.find(d => d.value === s.dayOfWeek)?.label} ${s.startTime}-${s.endTime}`).join(', ')}</p></div>
            </div>

            {/* Student list */}
            <Card className="p-0">
              <div className="max-h-[420px] overflow-auto">
                {detail.students.map((student) => (
                  <div key={student.id} className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.9fr_1.2fr_1fr] gap-3 border-b p-4 items-center">
                    <div>
                      <div className="font-semibold">{student.name}</div>
                      <div className="text-xs text-slate-500">{student.nis}</div>
                    </div>

                    <Select value={student.status} onChange={(e) => updateStudentField(student.id, 'status', e.target.value)}>
                      {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </Select>

                    <Input value={student.note || ''} onChange={(e) => updateStudentField(student.id, 'note', e.target.value)} placeholder="Catatan..." />

                    <div>
                      {(student.status === 'izin' || student.status === 'sakit') && (
                        <>
                          <input type="file" onChange={(e) => handleUpload(student.id, e.target.files[0])} className="text-xs" />
                          {uploadingId === student.id && <span className="text-xs text-emerald-600">Uploading...</span>}
                          {student.attachmentUrl && (
                            <a href={buildFileUrl(student.attachmentUrl)} target="_blank" rel="noreferrer" className="text-emerald-600 text-xs underline">Lihat lampiran</a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleUpdateEntries} disabled={saving} className="flex-1">
                {saving ? 'Menyimpan...' : 'Simpan Presensi'}
              </Button>
              <Button variant="secondary" onClick={() => {
                const updated = detail.students.map(s => ({ ...s, status: 'hadir' }));
                setDetail({ ...detail, students: updated });
              }}>
                Set Semua Hadir
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Presensi;
