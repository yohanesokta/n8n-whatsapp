# WhatsApp Gateway dengan Baileys & Express

![Lisensi](https://img.shields.io/badge/license-MIT-blue.svg) ![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg) ![Express.js](https://img.shields.io/badge/Express.js-4.x-orange.svg)

Gateway WhatsApp sederhana yang dibangun menggunakan **[Baileys](https://github.com/WhiskeySockets/Baileys)** dan **Express.js**. Aplikasi ini menyediakan antarmuka web untuk memindai QR code, mempertahankan sesi koneksi bahkan setelah restart, dan menyediakan webhook untuk integrasi dengan layanan lain seperti n8n.

---

## ✨ Fitur Utama

* **Antarmuka Web**: Halaman web sederhana untuk menampilkan QR code dan status koneksi.
* **Sesi Persisten**: Sesi WhatsApp tetap aktif meskipun aplikasi atau server di-restart, berkat penyimpanan file status (`connection-status.json`) dan cache Baileys.
* **Status Real-time**: Status koneksi diperbarui secara langsung di antarmuka web menggunakan Socket.IO.
* **Webhook Masuk**: Meneruskan pesan WhatsApp yang masuk ke endpoint n8n (atau layanan lain yang Anda konfigurasikan).
* **API untuk Mengirim Pesan**: Endpoint API untuk mengirim pesan WhatsApp dari aplikasi lain.
* **Siap untuk Docker**: Dilengkapi dengan `Dockerfile` untuk kemudahan deployment dan skalabilitas.

---

## 🚀 Instalasi & Konfigurasi

### Prasyarat

* [Node.js](https://nodejs.org/) (v18.x atau lebih baru)
* [NPM](https://www.npmjs.com/) atau [Yarn](https://yarnpkg.com/)
* (Opsional) [Docker](https://www.docker.com/)

### Langkah-langkah Instalasi

1.  **Clone repositori ini:**
    ```bash
    git clone [https://github.com/NAMA-ANDA/NAMA-REPO-ANDA.git](https://github.com/NAMA-ANDA/NAMA-REPO-ANDA.git)
    cd NAMA-REPO-ANDA
    ```

2.  **Install dependensi:**
    ```bash
    npm install
    # atau
    yarn install
    ```

3.  **Konfigurasi Environment Variables:**
    Buat file bernama `.env` di direktori utama dan isi dengan konfigurasi berikut.

    ```dotenv
    # Port yang akan digunakan oleh server Express
    PORT=3000

    # URL webhook n8n Anda untuk menerima pesan masuk
    N8N_URL=[https://n8n.domainanda.com](https://n8n.domainanda.com)
    ```

---

## ▶️ Menjalankan Aplikasi

### 1. Mode Development
Untuk menjalankan aplikasi dalam mode pengembangan dengan auto-reload (membutuhkan `nodemon`):

```bash
npm install -g nodemon
npm run dev
```
*(Anda mungkin perlu menambahkan skrip `"dev": "nodemon index.js"` di `package.json` Anda)*

Jika tanpa `nodemon`:
```bash
node index.js
```

### 2. Menjalankan dengan Docker (Rekomendasi)
Menggunakan Docker adalah cara terbaik untuk memastikan aplikasi berjalan secara konsisten dan otomatis restart setelah server reboot.

1.  **Buat Dockerfile:**
    Buat file bernama `Dockerfile` di direktori utama:

    ```Dockerfile
    # Gunakan base image Node.js versi 18
    FROM node:18-slim

    # Set direktori kerja di dalam container
    WORKDIR /usr/src/app

    # Salin package.json dan package-lock.json
    COPY package*.json ./

    # Install dependensi
    RUN npm install --production

    # Salin sisa kode aplikasi
    COPY . .

    # Expose port yang digunakan aplikasi
    EXPOSE 3000

    # Perintah untuk menjalankan aplikasi
    CMD [ "node", "index.js" ]
    ```

2.  **Build Docker Image:**
    ```bash
    docker build -t whatsapp-gateway .
    ```

3.  **Run Docker Container:**
    Perintah ini akan menjalankan container di background, memetakan port, menghubungkan file `.env`, dan yang terpenting, **menggunakan `restart policy`** agar selalu berjalan.

    ```bash
    docker run -d \
      -p 3000:3000 \
      --name whatsapp-gw \
      --env-file .env \
      --restart unless-stopped \
      whatsapp-gateway
    ```

Setelah server berjalan, buka `http://localhost:3000` di browser Anda untuk memindai QR code.

---

## 🔌 API Endpoints

### `GET /`
Menampilkan halaman utama dengan status koneksi dan QR code untuk login.

### `POST /webhook/send`
Mengirim pesan WhatsApp.

* **URL**: `/webhook/send`
* **Method**: `POST`
* **Body** (JSON):
    ```json
    {
      "number": "6281234567890@s.whatsapp.net",
      "message": "Halo, ini pesan dari API!"
    }
    ```
* **Respon Sukses** (`200 OK`):
    ```json
    {
      "status": "Pesan berhasil dikirim."
    }
    ```

### `GET /status`
Mengirim status "sedang mengetik" ke nomor tujuan.

* **URL**: `/status`
* **Method**: `GET`
* **Query Parameter**: `number`
* **Contoh**: `/status?number=6281234567890@s.whatsapp.net`
* **Respon Sukses** (`200 OK`):
    ```json
    {
      "status": "success"
    }
    ```

---

## 📂 Struktur Proyek

```
.
├── cache/                  # Direktori cache sesi Baileys (otomatis dibuat)
├── connection-status.json  # Menyimpan status koneksi (terhubung/tidak)
├── qr-code.txt             # Menyimpan data URL QR code sementara
├── .env                    # File konfigurasi environment
├── Dockerfile              # Konfigurasi untuk build Docker image
├── index.js                # Kode utama aplikasi
├── package.json            # Daftar dependensi dan skrip
└── README.md               # Dokumentasi ini
```

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah Lisensi MIT. Lihat file `LICENSE` untuk detailnya.