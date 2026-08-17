# Sistem Piket SMP IP YAKIN

Aplikasi operasional sekolah berbasis Next.js, TypeScript, PostgreSQL, dan Drizzle ORM untuk mengelola guru piket, kelas, jadwal, absensi, rekap, serta jejak audit.

## Data awal

- 22 nama guru sekolah dari laporan Google Form lama.
- Lima guru piket ditetapkan sesuai jadwal Senin-Jumat: Siti Humairoh, Intan Maharani, Megawati, Wiwi Rohayati, dan Umi Sultra.
- 16 kelas: `7A-7D`, `8A-8G`, dan `9A-9E`.
- Delapan nama siswa demo per kelas. Ganti sekaligus melalui menu **Data siswa** sebelum penggunaan nyata.
- Jadwal awal Senin-Jumat, satu guru piket per hari.
- Akun Admin IT: `admin` / `SMPYakin#2026`.
- Akun Wakasek Kurikulum: `kurikulum` / `SMPYakin#2026`.
- Akun guru piket awal: `sitihumairoh`, `intanmaharani`, `megawati`, `wiwirohayati`, dan `umisultra`, dengan kata sandi sementara yang sama.
- 23 catatan absensi guru hasil migrasi 18 respons Google Form; respons ganda pada tanggal yang sama diringkas memakai respons terakhir.

Seluruh akun awal wajib membuat kata sandi pribadi setelah login pertama. Kata sandi sementara hanya dipakai untuk aktivasi awal.

## Menjalankan aplikasi

1. Pastikan Docker Desktop aktif.
2. Jalankan PostgreSQL:

   ```powershell
   docker compose up -d
   ```

3. Pastikan `.env.local` berisi:

   ```env
   DB_CONNECTION=postgresql://postgres:postgres@127.0.0.1:5433/smp_ip_yakin
   SESSION_COOKIE_NAME=smp_ip_yakin_session
   ```

4. Siapkan tabel dan data awal:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

5. Jalankan aplikasi:

   ```powershell
   npm run dev
   ```

Buka `http://localhost:3000`.

## Deploy dengan Docker di Northflank

Repository ini sudah menyediakan Dockerfile multi-stage untuk Next.js production. Northflank dapat melakukan build langsung dari repository dan menjalankan image hasil build tersebut.

1. Buat service baru di Northflank dengan tipe **Combined** atau **Deployment** dari repository Git.
2. Pilih build type **Dockerfile** dan gunakan path `Dockerfile` pada root repository. Biarkan target build kosong agar Northflank memakai stage `runner` sebagai image aplikasi.
3. Tambahkan port `3000` dengan protokol **HTTP** dan jadikan **public**. Northflank juga dapat mendeteksi port ini dari instruksi `EXPOSE` pada Dockerfile. Server Next.js akan memakai nilai `PORT` yang diberikan platform.
4. Tambahkan environment variables sebagai secret/runtime variables, minimal:

   ```env
   DB_CONNECTION=postgresql://...
   SESSION_COOKIE_NAME=smp_ip_yakin_session
   WEBAUTHN_RP_NAME=SMP IP YAKIN
   WEBAUTHN_RP_ID=piket.smpipyakin.sch.id
   WEBAUTHN_ORIGIN=https://piket.smpipyakin.sch.id
   ```

5. Tambahkan **readiness probe** HTTP pada port `3000` dengan path `/api/health`. Probe ini cukup memakai metode `GET`; endpoint akan mengembalikan status `200` tanpa cache.
6. Deploy service aplikasi. Untuk migrasi database, buat **job satu kali** dari repository yang sama dengan build type **Dockerfile**, pilih target build `migration`, dan tambahkan `DB_CONNECTION` production sebagai secret. Jalankan command berikut sebelum deployment pertama dan setiap kali ada migration baru:

   ```powershell
   npm run db:migrate
   ```

Target `migration` sengaja membawa `drizzle-kit` dan folder `drizzle/`, sedangkan image aplikasi tetap minimal. Jangan menyalin `.env.local` ke image dan jangan menjalankan `db:reset` atau `db:seed` pada database production yang sudah berisi data nyata. Docker image hanya menjalankan aplikasi; PostgreSQL tetap menjadi service database terpisah.

## Fitur

- Login dan sesi tersimpan di database dengan cookie HTTP-only.
- Hash kata sandi baru memakai Argon2id; hash bcrypt lama tetap dapat dipakai dan otomatis ditingkatkan setelah login berhasil.
- Tombol lihat/sembunyikan kata sandi yang dapat diakses dengan keyboard dan screen reader.
- Penguncian sementara selama 15 menit setelah lima percobaan login gagal.
- Menu **Manajemen akun** untuk Admin IT, termasuk reset aman ke kata sandi sementara dan pencabutan seluruh sesi akun.
- Passkey WebAuthn untuk login menggunakan sidik jari, wajah, atau PIN perangkat; password tetap tersedia sebagai pemulihan.
- Hak akses Admin IT, Wakasek Kurikulum, dan guru piket.
- Pemantauan keterlaksanaan tugas piket, grafik tren, dan ekspor laporan Excel untuk rapat.
- Master 22 guru dan penetapan guru piket.
- Master 16 kelas dan pengaturan wali kelas.
- Jadwal piket mingguan per shift.
- Absensi siswa dan guru dengan status Sakit, Izin, Alpa, atau Dinas.
- Mode absensi terpisah untuk siswa dan guru, seluruh pemilihan nama/status dilakukan dengan klik.
- Konfirmasi tindak lanjut, dashboard harian, rekap CSV, dan audit aktivitas.
- Template dan impor Excel untuk data siswa serta guru.
- Tahun ajaran, riwayat kelas siswa, dan proses kenaikan kelas tahunan.

## Progressive Web App (PWA)

Aplikasi dapat dipasang pada layar utama Android dan iPhone tanpa APK atau App Store. Backend Next.js, autentikasi, dan PostgreSQL tetap berjalan di Zeabur; PWA hanya menambahkan pengalaman instalasi dan fallback koneksi.

### Android

1. Buka domain produksi melalui Chrome.
2. Gunakan saran **Pasang Piket YAKIN** yang muncul, atau buka menu Chrome lalu pilih **Instal aplikasi**.
3. Jalankan aplikasi melalui ikon **Piket YAKIN** pada layar utama.

### iPhone

1. Buka domain produksi melalui Safari.
2. Ketuk tombol **Bagikan**.
3. Pilih **Tambah ke Layar Utama**, lalu konfirmasi.

Service worker hanya menyimpan aset publik dan file aplikasi yang telah diberi versi. Halaman privat, API, login, Server Actions, laporan, dan data absensi selalu mengambil data dari server. Saat koneksi terputus, aplikasi menampilkan status offline dan tidak menganggap perubahan telah tersimpan.

Regenerasi ikon PWA setelah logo sekolah berubah:

```powershell
npm run pwa:icons
```

PWA harus disajikan melalui HTTPS di produksi. Setelah deployment, hapus instalasi lama lalu pasang kembali hanya jika ikon atau identitas aplikasi tidak diperbarui otomatis oleh sistem operasi.

## Impor data Excel

Gunakan template dari aplikasi agar nama kolom, format, dan pilihan data tetap konsisten.

1. Buka menu **Data siswa** atau **Data guru**.
2. Pilih **Unduh template Excel**.
3. Baca lembar **Petunjuk**, lalu isi lembar data tanpa mengubah nama kolom.
4. NIS menjadi pengenal tetap siswa. NIP/NUPTK menjadi pengenal tetap guru.
5. Simpan sebagai `.xlsx`, lalu unggah pada panel **Impor Excel** di halaman yang sama.
6. Periksa ringkasan hasil impor. Baris yang tidak valid akan ditolak dengan pesan yang dapat diperbaiki.

Template siswa menyediakan pilihan kelas, jenis kelamin, dan contoh data. Template guru menyediakan pilihan penetapan guru piket. Berkas maksimal 5 MB. Data Excel hanya menjadi sarana input; PostgreSQL tetap menjadi sumber data utama aplikasi.

Endpoint template:

- Siswa: `http://localhost:3000/api/templates/students`
- Guru: `http://localhost:3000/api/templates/teachers`

## Kenaikan kelas tahunan

Proses dilakukan dari menu **Tahun ajaran** oleh Admin IT setelah kegiatan tahun berjalan selesai.

1. Unduh **Cadangan data siswa** terlebih dahulu.
2. Pilih salah satu metode penempatan siswa.
3. Isi nama tahun ajaran baru dan tinjau kembali seluruh penempatan.
4. Aktifkan kotak konfirmasi, lalu jalankan kenaikan kelas.

### Metode rombel tetap

Gunakan metode ini apabila siswa dalam satu kelas tetap naik bersama. Admin IT cukup menentukan kelas tujuan untuk setiap rombel kelas 7 dan 8. Periksa khusus kelas yang jumlah rombelnya berbeda, misalnya `8F` dan `8G`.

### Metode susun ulang rombel

Gunakan metode ini apabila sekolah membagi atau mengacak ulang siswa.

1. Unduh template **Penempatan rombel terbaru** dari halaman kenaikan kelas.
2. Template sudah berisi seluruh siswa aktif kelas 7 dan 8 beserta NIS, nama, kelas lama, dan saran kelas baru.
3. Ubah hanya kolom **Kelas Baru**. Jangan menambah, menghapus, atau menggandakan baris siswa.
4. Unggah template tersebut pada halaman yang sama.

Sistem mencocokkan siswa memakai ID internal dan NIS, lalu memastikan seluruh siswa muncul tepat satu kali, kelas lama masih sesuai database, kelas tujuan berada satu tingkat di atas, dan satu rombel tidak melebihi 60 siswa. Selalu unduh template terbaru agar perubahan data siswa setelah template lama dibuat dapat terdeteksi.

Sistem memindahkan siswa kelas 7 ke kelas 8, siswa kelas 8 ke kelas 9, dan menandai siswa kelas 9 sebagai **Lulus**. Seluruh perubahan diproses dalam satu transaksi: apabila satu bagian gagal, tidak ada pemindahan sebagian. Riwayat kelas lama tetap tersimpan di `student_enrollments`, sedangkan tahun ajaran baru menjadi tahun yang aktif.

Cadangan siswa tersedia di `http://localhost:3000/api/exports/students` setelah login.
Template penempatan rombel tersedia di `http://localhost:3000/api/templates/promotions` setelah login sebagai Admin IT.

## Pemantauan Wakasek Kurikulum

Wakasek Kurikulum memiliki akses baca-saja ke menu **Pemantauan piket**. Halaman ini menampilkan jadwal yang selesai, jadwal yang belum ditutup, persentase keterlaksanaan, aktivitas pencatatan, grafik 14 hari, dan ringkasan per guru. Guru piket menekan **Tugas piket selesai** satu kali setelah tugas hariannya selesai, termasuk ketika tidak ada siswa atau guru yang perlu dicatat.

Laporan rapat dapat diekspor ke Excel untuk periode 7, 30, atau 90 hari. Workbook berisi ringkasan, keterlaksanaan piket, ringkasan per guru, dan rincian absensi.

## Pengelolaan kata sandi

Admin IT membuka menu **Manajemen akun** untuk mereset akun guru atau Wakasek. Sistem membuat kata sandi sementara acak, menampilkannya hanya pada hasil reset saat itu, dan mengakhiri seluruh sesi milik akun tersebut. Sampaikan kata sandi sementara melalui jalur pribadi; jangan mengirimkannya ke grup umum.

Admin IT tidak menetapkan atau mengetahui kata sandi permanen pengguna lain. Pengguna wajib mengganti kata sandi sementara saat login berikutnya. Untuk mengubah kata sandi akun sendiri, buka **Keamanan login**; kata sandi saat ini wajib diverifikasi dan semua sesi lain otomatis dicabut setelah perubahan berhasil.

Kata sandi baru minimal 8 karakter dan maksimal 128 karakter. Gunakan frasa sandi unik atau password manager. Sistem menolak kata sandi yang memuat username, bagian nama pengguna, atau kata sandi awal yang umum.

### Pemulihan darurat Admin IT

Jika Admin IT lupa password dan tidak lagi memiliki passkey yang dapat digunakan, jalankan perintah berikut dari terminal lokal/server yang memiliki `DB_CONNECTION` ke database tujuan:

```powershell
npm run account:recover -- admin
```

Perintah hanya menerima akun dengan role **Admin IT**. CLI menampilkan akun serta host database, kemudian meminta operator mengetik frasa konfirmasi persis. Setelah dikonfirmasi, sistem membuat password sementara acak 24 karakter, mencabut seluruh sesi akun, membuka penguncian login, mewajibkan penggantian password, dan menulis audit `EMERGENCY_RECOVERY`. Password sementara hanya muncul pada output terminal dan tidak disimpan sebagai teks di database atau audit log.

Periksa target tanpa mengubah data menggunakan:

```powershell
npm run account:recover -- admin --dry-run
```

Jalankan hanya melalui terminal privat yang diawasi. Jangan memasukkan password sementara ke argumen perintah, tiket dukungan, log deployment, atau grup percakapan. Setelah akses kembali, daftarkan minimal dua passkey untuk akun Admin IT dan pertimbangkan menyediakan Admin IT kedua sebagai pemulihan berlapis.

## Database Zeabur dan testing lokal

Untuk produksi, isi `DB_CONNECTION` dengan PostgreSQL Connection String dari dashboard Zeabur. Umumnya koneksi produksi memakai SSL:

```env
DB_CONNECTION=postgresql://username:password@host.zeabur.app:5432/database?sslmode=require
```

Untuk passkey di produksi, sesuaikan `WEBAUTHN_RP_ID` dengan domain aplikasi dan `WEBAUTHN_ORIGIN` dengan URL HTTPS lengkap. Setelah environment variable produksi terpasang, jalankan `npm run db:migrate` lalu `npm run db:seed` satu kali.

PostgreSQL Docker pada port `5433` tetap tersedia sebagai opsi testing lokal. Jangan menjalankan seed berulang kali pada database produksi setelah data nyata mulai digunakan.
