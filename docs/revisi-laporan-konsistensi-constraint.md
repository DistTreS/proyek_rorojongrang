# Revisi Laporan: Sinkronisasi Dengan Implementasi Terkini

Dokumen ini menyiapkan redaksi siap-tempel agar laporan konsisten dengan implementasi saat ini.
Subbab placeholder diagram (`4.3.1 Asd`, dst.) sengaja tidak dibahas sesuai arahan Anda.

## 1) Ringkasan Aturan Final

### Hard Constraints (wajib terpenuhi)
1. Setiap teaching assignment dijadwalkan tepat sesuai `weekly_hours`.
2. Tidak boleh bentrok guru pada slot waktu yang sama.
3. Tidak boleh bentrok rombel pada slot waktu yang sama.
4. Slot harus valid sesuai periode dan konfigurasi hari.
5. Pemisahan `wajib` vs `peminatan` per tingkat kelas (`grade_level`) pada mode awal semester:
   - sesi wajib dan sesi peminatan tidak boleh berjalan bersamaan pada slot yang sama di tingkat yang sama.
   - bentrok antar-sesi peminatan diperbolehkan.
6. Batas maksimal jam mengajar guru per hari (`max_teacher_daily_hours`) sebagai hard constraint (opsional-konfigurable).
7. Sesi berurutan untuk assignment kecil:
   - assignment dengan `weekly_hours` 2 atau 3 wajib ditempatkan pada slot bersebelahan dalam hari yang sama.

### Soft Constraints (dioptimasi)
1. Preferensi waktu guru (`prefer`/`avoid`).
2. Pemerataan hari mengajar (day spread).
3. Penalti penumpukan mapel:
   - untuk assignment `weekly_hours > 3`, penalti dikenakan jika dalam satu hari melebihi 3 JP.

## 2) Redaksi Pengganti Abstrak (Bagian Penjadwalan)

Ganti kalimat inti penjadwalan menjadi:

> Mekanisme penjadwalan otomatis menggunakan algoritma hibrida CP-SAT dan Genetic Algorithm (GA). CP-SAT digunakan sebagai feasibility engine untuk memastikan pemenuhan hard constraints utama (tanpa konflik guru/kelas, pemenuhan kebutuhan jam, validitas slot, pemisahan sesi wajib–peminatan per tingkat kelas, batas maksimum jam mengajar guru per hari, serta sesi berurutan untuk assignment 2–3 JP). Setelah jadwal feasible diperoleh, GA digunakan untuk mengoptimalkan soft constraints seperti preferensi waktu guru, pemerataan distribusi hari mengajar, dan minimisasi penalti penumpukan sesi dalam satu hari.

Catatan:
- Jika masih ada frasa "konflik ruang" sebagai hard constraint, ubah menjadi "tidak dimodelkan pada engine penjadwalan pada tahap ini".

## 3) Redaksi Pengganti Bagian Hard/Soft Constraint (Bab Metodologi/Analisis Aturan)

Gunakan struktur berikut:

### Hard Constraints (H1–H7)
- H1: setiap assignment terjadwal sesuai `weekly_hours`.
- H2: tidak bentrok rombel.
- H3: tidak bentrok guru.
- H4: validitas slot sesuai konfigurasi hari dan periode.
- H5: pemisahan sesi wajib vs peminatan per tingkat kelas pada slot yang sama.
- H6: batas maksimum jam mengajar guru per hari (`max_teacher_daily_hours`).
- H7: assignment 2–3 JP harus berurutan (consecutive) pada hari yang sama.

### Soft Constraints (S1–S3)
- S1: preferensi waktu guru.
- S2: pemerataan distribusi hari mengajar.
- S3: penalti jika assignment dengan kebutuhan mingguan >3 ditempatkan >3 JP dalam satu hari.

## 4) Redaksi Pengganti Bagian Alur Hybrid

Tambahkan kalimat:

> Pada penelitian ini, GA tidak membangun jadwal dari nol, tetapi memperbaiki solusi feasible hasil CP-SAT. Selama proses crossover dan mutasi, validasi feasibility tetap dijaga agar hard constraints H1–H7 tidak dilanggar.

## 5) Konsistensi Istilah Yang Perlu Dirapikan

1. Samakan penamaan soft constraint agar tidak melompat (misalnya kadang `S3` lalu `S6`).
2. Gunakan satu istilah peran yang konsisten:
   - `staf_tu`, `wakasek`, `guru`, `kepala_sekolah`.
3. Jika membahas ruang kelas, nyatakan jelas statusnya:
   - "fitur manajemen data ruang ada di sistem informasi",
   - "constraint konflik ruang belum diaktifkan di engine penjadwalan tahap ini".

## 6) Catatan Implementasi (Untuk Lampiran Teknis)

Implementasi aturan berada pada:
- `scheduler/services/solver.py`
- `backend/services/schedulerContract.js`
- `scheduler/app/main.py`
- `backend/services/scheduleValidationService.js`

Anda bisa menambahkan tabel lampiran sederhana:
- kolom: `Kode Constraint`, `Jenis (Hard/Soft)`, `Lokasi Implementasi`, `Status`.
