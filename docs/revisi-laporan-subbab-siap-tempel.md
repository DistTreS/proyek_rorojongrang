# Redaksi Siap-Tempel Laporan (BAB II, III, IV)

Dokumen ini berisi naskah siap-tempel untuk menyinkronkan laporan dengan implementasi terkini.
Placeholder subbab diagram pada BAB IV tetap dibiarkan sesuai arahan.

## BAB II (Tinjauan Pustaka / Konsep Metode)

### 2.5.2 Pemodelan Penjadwalan Sekolah pada Penelitian Ini (Revisi)
Pada penelitian ini, masalah penjadwalan dimodelkan sebagai penempatan event pembelajaran ke slot waktu mingguan. Didefinisikan himpunan: kelas/rombongan belajar (`K`), mata pelajaran (`S`), guru (`T`), hari (`D`), slot valid per hari (`P_d`), serta event pembelajaran (`E`). Setiap event `e ∈ E` memiliki atribut kelas, guru, mata pelajaran, tingkat kelas (`grade_level`), dan kebutuhan jam mingguan (`weekly_hours`).

Variabel keputusan biner:
- `x[e,d,p] = 1` jika event `e` ditempatkan pada hari `d` slot `p`
- `x[e,d,p] = 0` jika tidak ditempatkan

Hard constraints yang digunakan:
1. Setiap event harus terpenuhi tepat sesuai `weekly_hours`.
2. Tidak boleh bentrok kelas/rombel pada slot yang sama.
3. Tidak boleh bentrok guru pada slot yang sama.
4. Slot harus valid sesuai konfigurasi periode akademik.
5. Pemisahan sesi wajib dan peminatan per tingkat kelas:
   - pada tingkat kelas yang sama, sesi `wajib` dan `peminatan` tidak boleh berjalan pada slot yang sama.
   - bentrok antar-sesi `peminatan` diperbolehkan pada mode awal semester.
6. Batas maksimum jam mengajar guru per hari (`max_teacher_daily_hours`) sebagai hard constraint berbasis konfigurasi.
7. Assignment dengan beban 2–3 JP harus berurutan (consecutive) pada hari yang sama.

Dalam penelitian ini, konflik ruang belum dimodelkan sebagai hard constraint pada engine penjadwalan, sehingga fokus constraint berada pada konsistensi guru, rombel, struktur slot, dan aturan kurikulum.

### 2.6.3 Fitness Function Berbasis Penalti (Soft Constraints) (Revisi)
Setelah solusi feasible diperoleh dari CP-SAT, tahap GA melakukan optimasi kualitas jadwal menggunakan fitness berbasis penalti. Semakin kecil total penalti, semakin baik kualitas jadwal.

Soft constraints yang dioptimasi:
1. Preferensi waktu guru (`prefer`/`avoid`).
2. Pemerataan distribusi hari mengajar (day spread).
3. Penalti penumpukan sesi harian untuk mapel dengan kebutuhan mingguan lebih dari 3 JP, yaitu penalti diberikan jika dalam satu hari melebihi 3 JP.

Secara umum:
- solusi dengan pelanggaran preferensi lebih sedikit menghasilkan skor lebih baik,
- distribusi mengajar yang lebih merata antarhari memberi kontribusi positif,
- penumpukan berlebih pada satu hari menambah penalti.

Dengan skema ini, hard constraints tetap dijaga feasible, sedangkan GA berfungsi sebagai quality improver.

### 2.7.1 Alur Kerja Sequential CP-SAT → GA (Revisi)
Alur hibrida yang digunakan adalah sequential:
1. Sistem memuat data master akademik, slot waktu, assignment pengampu, dan preferensi guru.
2. Tahap CP-SAT membangkitkan jadwal feasible dengan memastikan hard constraints terpenuhi.
3. Solusi feasible CP-SAT dijadikan seed pada tahap GA.
4. GA melakukan perbaikan kualitas melalui seleksi, crossover, dan mutasi dengan validasi feasibility.
5. Solusi terbaik berdasarkan skor akhir dipilih sebagai hasil generate draft jadwal.

Skema ini dipilih untuk memisahkan dua tujuan utama secara jelas:
- feasibility dijamin lebih dulu oleh solver berbasis constraint,
- kualitas dioptimasi kemudian oleh metaheuristik.

### 2.7.3 Strategi Menjaga Feasibility Saat GA Berjalan (Revisi)
Pada penelitian ini, GA tidak membangun jadwal dari nol. Seluruh kandidat GA tetap melalui evaluasi kelayakan yang memeriksa:
- konflik guru,
- konflik rombel,
- batas jam harian guru,
- aturan blok berurutan assignment 2–3 JP,
- pemisahan sesi wajib–peminatan per tingkat.

Kandidat yang melanggar hard constraints dianggap tidak feasible dan tidak dipilih sebagai solusi terbaik. Dengan pendekatan ini, proses eksplorasi GA tetap berada dalam ruang solusi valid.

## BAB III (Metodologi Penelitian)

### 3.5.4 Analisis Data Master Akademik dan Validasi Data (Revisi)
Data master akademik dianalisis untuk memastikan seluruh entitas siap diproses oleh modul penjadwalan, meliputi data guru/tendik, rombongan belajar, mata pelajaran, assignment pengampu, time slot, dan periode akademik. Tahap ini menekankan validasi keterkaitan antarentitas, misalnya:
- guru pengampu harus terhubung dengan assignment,
- assignment harus berada pada periode yang sama,
- struktur slot harus valid (`start_time < end_time`),
- kebutuhan jam mingguan harus bernilai positif.

Validasi awal juga digunakan untuk mendeteksi kondisi infeasible sebelum solver dijalankan, termasuk beban jam yang melebihi kapasitas slot dan ketidakmungkinan memenuhi batas jam mengajar harian guru.

### 3.5.5 Analisis Aturan Penjadwalan Menjadi Hard dan Soft Constraints (Revisi)
Aturan penjadwalan dikelompokkan sebagai berikut.

Hard constraints:
1. Pemenuhan `weekly_hours` tiap assignment.
2. Larangan bentrok guru.
3. Larangan bentrok rombel.
4. Validitas slot berdasarkan konfigurasi periode/hari.
5. Pemisahan sesi wajib–peminatan pada tingkat kelas yang sama.
6. Batas maksimum jam mengajar guru per hari.
7. Kewajiban blok berurutan untuk assignment 2–3 JP.

Soft constraints:
1. Preferensi waktu guru.
2. Pemerataan distribusi hari mengajar.
3. Penalti penumpukan sesi harian untuk mapel dengan kebutuhan mingguan >3 JP.

Pemisahan ini menjadi dasar implementasi hibrida:
- CP-SAT menangani pemenuhan hard constraints,
- GA mengoptimasi soft constraints dalam ruang solusi feasible.

### 3.5.6 Analisis Kelayakan Hasil dan Penarikan Kesimpulan (Revisi)
Evaluasi hasil penjadwalan dilakukan melalui tiga indikator utama:
1. Feasibility: keterpenuhan seluruh hard constraints.
2. Kualitas jadwal: nilai fitness/penalti soft constraints.
3. Runtime: waktu komputasi proses generate.

Pada level sistem, pengujian fungsional tetap dilakukan untuk memastikan alur operasional berjalan sesuai use case, mulai dari validasi data, generate draft, hingga proses approval dan publikasi jadwal.

## BAB IV (Analisis dan Perancangan Sistem)

### 4.2.3 Kebutuhan Fungsional Wakasek Kurikulum (Tambahan Redaksi)
Wakasek Kurikulum memiliki fungsi utama pada modul penjadwalan, yaitu:
1. Mengelola parameter penjadwalan.
2. Menjalankan validasi kesiapan data.
3. Menjalankan generate draft jadwal dengan engine hibrida CP-SAT + GA.
4. Meninjau ringkasan hasil generate (feasible, jumlah sesi, warning/conflict).
5. Melakukan pengajuan jadwal untuk persetujuan pimpinan.
6. Mempublikasikan jadwal yang telah disetujui.

Parameter penting yang dapat dikonfigurasi untuk eksperimen:
- `max_teacher_daily_hours`
- bobot preferensi (`prefer`, `avoid`)
- bobot pemerataan hari (`day_spread`)
- penalti penumpukan sesi harian mapel (`subject_daily_overload_penalty`)

### 4.2.4 Narasi Use Case Penjadwalan (Tambahan Sinkronisasi)
Use case penjadwalan dibangun dengan prinsip role-based workflow:
1. Wakasek mengelola data dan parameter.
2. Sistem melakukan pre-validation.
3. Jika valid, sistem mengeksekusi CP-SAT untuk menghasilkan solusi feasible.
4. Sistem melanjutkan optimasi GA untuk peningkatan kualitas.
5. Sistem menyimpan hasil sebagai draft batch.
6. Wakasek mengajukan draft.
7. Kepala sekolah melakukan approve/reject.
8. Hanya batch approved yang dipublikasikan sebagai jadwal resmi.

### 4.x Catatan Batasan Implementasi (Paragraf Siap Tempel)
Pada tahap implementasi saat ini, engine penjadwalan berfokus pada constraint guru–rombel–slot dan aturan akademik inti. Data ruang tetap dapat dikelola pada sistem informasi, tetapi konflik ruang belum diaktifkan sebagai hard constraint solver. Keputusan ini diambil agar fokus optimasi berada pada kebutuhan paling kritis sekolah pada fase awal, yaitu konsistensi jadwal guru/kelas, pemisahan sesi wajib–peminatan, serta keteraturan distribusi beban mengajar.

## Catatan Pakai Cepat
1. Tempel bagian BAB II/III/IV ke subbab terkait.
2. Pastikan penamaan soft constraint konsisten (S1, S2, S3) di seluruh dokumen.
3. Untuk tabel ringkasan, gunakan kolom:
   - `Kode`, `Deskripsi`, `Jenis`, `Implementasi`, `Status`.
