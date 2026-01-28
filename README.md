# Sistem Informasi Akademik SMA 1 Hiliran Gumanti

Judul:
Penerapan algoritma hybrid CP-SAT dan Genetic Algorithm untuk penjadwalan akademik berbasis web.

## Struktur
- `backend/` Express.js + Sequelize (MySQL) + JWT
- `frontend/` Vite React
- `scheduler/` Python FastAPI + OR-Tools + GA (service terpisah)

## Fitur (target)
1. Mengelola data tendik (guru dan staff TU)
2. Mengelola data siswa
3. Mengelola rombongan belajar
4. Mengelola mata pelajaran
5. Mengelola pengampu mapel (jam pelajaran mingguan)
6. Mengelola periode akademik
7. Mengelola jam pelajaran
8. Generate jadwal pelajaran mingguan (CP-SAT + GA)
9. Mengelola presensi
10. Mengelola catatan siswa (prestasi/masalah)
11. Laporan absensi (global, per siswa, per rombel, per jam, harian, bulanan, semester)

## Menjalankan (lokal)
Root (sekali jalan untuk backend + frontend):
```bash
npm install
npm run install:all
npm run dev
```

Backend:
```bash
cd backend
cp .env.example .env
npm install
npm run db:create
npm run db:migrate
npm run db:seed
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Frontend dev memakai proxy `/api` ke `http://localhost:4000` (lihat `frontend/vite.config.js`).
Untuk production, set `VITE_API_URL` (mis. `https://domain.com/api`).

Scheduler:
```bash
cd scheduler
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Docker (opsional)
```bash
docker compose up --build
```
