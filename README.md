# ClipForge 🎬

**Automated AI-Powered Short Clips Generator & Subtitle Burner**
*Pembuat Klip Pendek Viral Otomatis Berbasis AI & Burn-in Subtitle*

---

### Language / Bahasa
[🌐 English Version](#-english-version) | [🇮🇩 Versi Bahasa Indonesia](#-versi-bahasa-indonesia)

---

## 🌐 English Version

ClipForge is a modern web platform designed to automatically extract engaging highlights from long YouTube videos, crop them into a vertical 9:16 format, and burn in styled subtitles instantly.

> [!IMPORTANT]
> **Project Status**: Under Active Development
> **Created by**: Roziqin

### 🚀 Key Features

- **3 Processing Modes**:
  - AI Mode: Scans the video transcript using Gemini 2.5 Flash or GPT-4o to automatically find the most engaging segments.
  - Auto Mode: Splits the video into equal-length segments based on your target duration.
  - Manual Mode: Features an interactive video player, timeline markers, playhead tracking, and **Mark Start/End** buttons to crop clips precisely.
- **Active Speaker Tracking (Face Detection)**:
  - Uses OpenCV Haar Cascades to dynamically detect and track the active speaker's face, ensuring the subject remains centered in the vertical 9:16 frame.
- **Burn-in Subtitles**:
  - Automatically transcribes audio and burns subtitles directly onto the video with popular social media styles:
    - 💛 **CapCut Style**: Bold yellow text with a clean black outline.
    - 🤍 **TikTok Style**: Classic white text with a bold black outline centered at the bottom.
    - 💙 **Karaoke Style**: Cyan text with a black outline for high readability.
    - 🖋️ **Minimal Style**: Elegant, small white text for a cinematic aesthetic.
  - Provides a download button for standalone `.srt` subtitle files.
- **High-Quality & Low-CPU Download Engine**:
  - Powered by `yt-dlp` to fetch native **1080p, 1440p, or 4K** streams without any mobile resolution caps (360p).
  - Merges audio and video streams instantly into an `.mkv` container using *stream copy* (0% CPU transcoding load) to keep your machine cool and save battery. Transcoding is only performed once during the final crop/cut phase.
- **Flexible Storage (Zero Setup Required)**:
  - Defaults to local storage (saving clips directly to the `static` directory) for offline testing.
  - Optionally supports syncing to a cloud **Supabase Storage** bucket when credentials are provided.

### 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router) + TypeScript + Vanilla CSS / Tailwind |
| **Backend** | FastAPI (Python 3.11+) + Uvicorn |
| **Video Downloader** | yt-dlp |
| **Transcription** | Gemini 2.5 Flash / OpenAI Whisper (Cloud APIs) |
| **Video Processing** | FFmpeg |
| **Face Tracking** | OpenCV (Haar Cascades) |
| **Storage** | Local static folder / Supabase Storage (Optional) |

### 📦 Prerequisites

Ensure you have the following installed on your machine:
1. **Python 3.11+**
2. **Node.js 20+**
3. **FFmpeg** (Ensure `ffmpeg` and `ffprobe` are added to your system's Environment Variables Path).
4. **API Keys**: Gemini API key (Free tier available) and/or OpenAI API key.
5. **Supabase Bucket** (Optional - only required if you want to store clips in the cloud).

### 🔧 Installation & Setup

#### 1. Backend Configuration
```bash
cd backend
# Create and activate virtual env
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy env config
cp .env.example .env
```
Open `.env` and fill in your API keys:
```env
GEMINI_API_KEY=AIzaSy...
```

#### 2. Frontend Configuration
```bash
cd ../frontend
npm install
cp .env.local.example .env.local
```

### 🚦 Running the Application

#### The Easy Way (Windows Only)
Use the included automated scripts to start/stop the application without terminal hassle:
- ▶️ **`start.bat`**: Runs the backend (port 8000) and frontend (port 3001) silently in the background and opens `http://localhost:3001` in your browser.
- 🔄 **`restart.bat`**: Stops any active instances on port 8000 and 3001, and restarts them with the latest code changes.
- ⏹️ **`stop.bat`**: Safely terminates all running background processes and frees up ports.

#### Manual Startup
- **Run Backend**:
  ```bash
  cd backend
  venv\Scripts\activate
  uvicorn main:app --port 8000 --reload
  ```
- **Run Frontend (Local Dev)**:
  ```bash
  cd frontend
  npm run dev
  ```
Access the web dashboard at `http://localhost:3001`.

---

### 🐳 Docker Setup (Optional)

You can run the entire stack using Docker Compose:
```bash
# Copy and fill env files first
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

docker-compose up --build
```
- Frontend: `http://localhost:3000` (Production Standalone Mode)
- API Docs: `http://localhost:8000/docs`

---

## 🇮🇩 Versi Bahasa Indonesia

ClipForge adalah platform web modern untuk mengekstrak momen-momen menarik secara otomatis dari video YouTube berdurasi panjang, memotongnya menjadi format vertikal 9:16, serta membakar (*burn-in*) subtitle otomatis secara instan.

> [!IMPORTANT]
> **Status Project**: Dalam Tahap Pengembangan (*Under Development*)
> **Created by**: Roziqin

### 🚀 Fitur Utama

- **3 Mode Pemrosesan Klip**:
  - Mode AI: Membaca transkrip video menggunakan Gemini 2.5 Flash atau GPT-4o untuk memotong bagian terpenting secara otomatis.
  - **Mode Otomatis**: Memotong video secara rata menjadi beberapa klip dengan interval durasi yang sama.
  - **Mode Manual**: Dilengkapi dengan pemutar video interaktif, penanda garis waktu (*Timeline Playhead & Marker*), serta tombol **Tandai Start/End** untuk memotong bagian video secara presisi.
- **Deteksi Wajah Dinamis (Active Speaker Tracking)**:
  - Menggunakan modul OpenCV (Haar Cascades) untuk melacak pergerakan wajah pembicara secara otomatis dan memusatkan crop vertikal 9:16 agar subjek tidak keluar dari frame.
- **Pembakaran Subtitle Otomatis (Burn-in Subtitles)**:
  - Mengonversi suara menjadi teks secara otomatis dan membakarnya langsung ke dalam video dengan berbagai pilihan gaya populer:
    - 💛 **Style CapCut**: Teks kuning tebal dengan outline hitam kontras.
    - 🤍 **Style TikTok**: Teks putih bersih dengan outline hitam tebal di tengah bawah.
    - 💙 **Style Karaoke**: Teks cyan cerah dengan outline hitam untuk efek dinamis.
    - 🖋️ **Style Minimal**: Teks putih kecil dan bersih untuk estetika sinematik.
  - Menyediakan tombol unduh file `.srt` subtitle terpisah.
- **Mesin Unduhan Kualitas Tinggi & Hemat CPU**:
  - Dioptimalkan menggunakan `yt-dlp` versi terbaru yang mendukung unduhan resolusi **1080p, 1440p, hingga 4K asli** dari YouTube tanpa batasan kualitas mobile (360p).
  - Menggabungkan video dan audio ke dalam format `mkv` secara instan menggunakan fitur *stream copy* (0% penggunaan CPU), menghindari proses transcoding ganda sehingga laptop/komputer Anda tetap dingin dan hemat baterai.
- **Penyimpanan Fleksibel (Tanpa Perlu Setup Awal)**:
  - Menyimpan klip video secara lokal ke folder `static` secara default untuk pengujian luring yang cepat.
  - Mendukung sinkronisasi otomatis ke cloud **Supabase Storage** secara opsional jika kredensial diisi.

### 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| **Frontend** | Next.js 14 (App Router) + TypeScript + Vanilla CSS / Tailwind |
| **Backend** | FastAPI (Python 3.11+) + Uvicorn |
| **Unduhan Video** | yt-dlp |
| **Transkripsi Suara** | Gemini 2.5 Flash / OpenAI Whisper (Cloud APIs) |
| **Pemotongan Video** | FFmpeg |
| **Lacak Wajah** | OpenCV (Haar Cascades) |
| **Penyimpanan** | Folder static lokal / Supabase Storage (Opsional) |

### 📦 Prasyarat Sistem

1. **Python 3.11+**
2. **Node.js 20+**
3. **FFmpeg** (Pastikan command `ffmpeg` dan `ffprobe` sudah terdaftar di Environment Path sistem operasi Anda).
4. **API Keys**: Gemini API key dan/atau OpenAI API key.
5. **Akun Supabase** (Opsional - hanya jika ingin menyimpan klip di cloud).

### 🔧 Instalasi & Konfigurasi

#### 1. Konfigurasi Backend (Python FastAPI)
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
copy .env.example .env
```
Buka `.env` dan isi API Key Anda:
```env
GEMINI_API_KEY=AIzaSy...
```

#### 2. Konfigurasi Frontend (Next.js)
```bash
cd ../frontend
npm install
copy .env.local.example .env.local
```

### 🚦 Cara Menjalankan Aplikasi

#### Cara Cepat (Hanya di Windows)
Gunakan batch script otomatis untuk kemudahan menjalankan aplikasi:
- ▶️ **`start.bat`**: Menjalankan backend (port 8000) dan frontend (port 3001) di latar belakang secara tersembunyi, lalu otomatis membuka browser ke alamat `http://localhost:3001`.
- 🔄 **`restart.bat`**: Menghentikan proses aktif di port 8000 & 3001, lalu memuat ulang dengan kode terbaru.
- ⏹️ **`stop.bat`**: Menghentikan semua proses latar belakang secara aman.

#### Cara Manual
- **Jalankan Backend**:
  ```bash
  cd backend
  venv\Scripts\activate
  uvicorn main:app --port 8000 --reload
  ```
- **Jalankan Frontend (Local Dev)**:
  ```bash
  cd frontend
  npm run dev
  ```
Akses halaman web ClipForge di `http://localhost:3001`.

---

### 🐳 Docker Setup (Opsional)

Jalankan seluruh stack menggunakan Docker Compose:
```bash
# Salin dan isi file env terlebih dahulu
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

docker-compose up --build
```
- Frontend: `http://localhost:3000` (Production Standalone Mode)
- API Docs: `http://localhost:8000/docs`

---

## 🔒 Security & Safe Uploads to GitHub

To prevent leakage of sensitive credentials, API keys, or large cache directories, this project is pre-configured with a root-level `.gitignore` file. 

The following items are **automatically ignored** and will not be pushed to GitHub:
- All `.env` and `.env.local` files containing your private API keys.
- `cookies.txt` containing your YouTube session cookies.
- Large folders like `venv/`, `node_modules/`, `.next/`, and temporary download folder `backend/tmp/`.
- Generated clips and subtitles inside the `backend/static/` folder.

> [!WARNING]
> **DO NOT** remove the `.gitignore` file. Never hardcode API keys directly in python files. Always use environment variables.
