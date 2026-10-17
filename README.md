# Mei's Radio

<p align="center">
  <img src="resources/icon.png" alt="Mei's Radio Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>A modern, audiophile-grade desktop music player blending Spotify-like visual elegance with bit-perfect audio precision and lightweight resource management.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%2F11%20(x64)-blue?style=flat-square&logo=windows" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-39-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Audio-BASS%20Native%20C--FFI-orange?style=flat-square" alt="Audio Engine" />
  <img src="https://img.shields.io/badge/Storage-Embedded%20SQLite3-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
</p>

---

## Overview

**Mei's Radio** (`meisradio`) is a next-generation desktop media player engineered for music enthusiasts and audiophiles alike. 

Most modern desktop music players force a compromise:
- **Commercial streaming apps** (Spotify, Apple Music, YouTube Music) deliver sleek visuals and synchronized lyrics, but suffer from high memory consumption, poor local file support, and an inability to bypass Windows Audio Mixer resampling.
- **Traditional audiophile players** (Foobar2000, AIMP, MusicBee) offer bit-perfect playback and low latency, but often have complex, dated user interfaces, minimal streaming integration, and lack modern convenience features.

**Mei's Radio** eliminates this divide: it pairs a **refined, responsive dark-mode interface** with a **dual-engine audio pipeline** featuring Bit-Perfect hardware access (WASAPI Exclusive & ASIO Native DSD), native C-FFI performance, in-memory image streaming, and unified search across local files, YouTube Music, SoundCloud, and the Soulseek P2P network.

---

## Key Highlights & Features

### 1. Dual-Engine Audio Pipeline

Mei's Radio provides two independent, high-fidelity playback pipelines:

- **Audiophile Bit-Perfect BASS Engine (via Koffi C-FFI):**
  - **WASAPI Exclusive Mode:** Bypasses the Windows Audio Engine mixer entirely to deliver bit-accurate PCM audio directly to your DAC.
  - **ASIO & Native 1-bit DSD:** Direct hardware streaming via ASIO with full support for Native 1-bit DSD (`.dsf`, `.dff` from DSD64 up to DSD512) using `BASS_DSD_RAW`, with automatic DoP (DSD over PCM) fallback.
  - **C-Level Stream Linking:** Audio channels are linked directly at machine code level (`BASS_ASIO_ChannelEnableBASS`), freeing the V8 JavaScript runtime from sample handling and eliminating buffer underruns.
  - **Gapless Playback:** Seamless track transitions with intelligent background preloading.
  - **CUE Sheet & CD-DA RAW PCM (`.bin`) Support:** Decodes virtual tracks from CUE sheets with zero disk extractions using dynamic RIFF header synthesis in RAM (`BASS_StreamCreateFileUser`).
- **Standard Web Audio Engine:**
  - **Parametric Equalizer:** Real-time multi-band biquad filter chain with customizable frequency, gain, and Q-factor.
  - **AutoEQ & Peace EQ Presets:** Built-in headphone correction curves from the AutoEQ project, with support for custom configuration import/export.
  - **Anti-Clipping Protection:** Integrated `DynamicsCompressorNode` to prevent digital distortion when boosting frequencies.
  - **Perceptual Volume Curve:** Quadratic taper curve ($G = x^2$, Stevens' Power Law) simulating logarithmic audio potentiometers for smooth, natural volume adjustments.

---

### 2. Hybrid Music Ecosystem (Local + Online + Cloud + P2P)

- **Comprehensive Local Format Support:**
  - Lossless & Hi-Res: FLAC (up to 24-bit/192kHz), WAV, ALAC, AIFF, APE.
  - DSD Native: DSF, DFF (DSD64, DSD128, DSD256, DSD512).
  - Lossy: MP3, M4A/AAC, OGG Vorbis, OPUS, WMA.
  - Disc Images & Sheets: CUE sheets, BIN raw PCM audio.
- **Online Music Streaming:**
  - **YouTube Music:** Direct streaming and search via YouTube Music API / InnerTube.
  - **SoundCloud:** Trending charts and genre exploration powered by SoundCloud API v2.
- **Music Download Engines:**
  - **Soulseek Lossless P2P:** Integrated Soulseek network client (`slsk-client`) for searching and downloading high-bitrate and lossless tracks directly from peers, complete with queue management and slot prioritization.
  - **YouTube & SoundCloud Downloader:** High-quality offline extraction powered by `yt-dlp`.
  - **Google Drive Cloud Sync:** Download music directly from your Google Drive using an API key.

---

### 3. Visual Immersion & Refined User Experience

- **Dynamic 60-30-10 Adaptive Theming:**
  - Automatically samples dominant color palettes from album cover art to generate balanced primary (`60%`), secondary (`30%`), and accent (`10%`) colors for the UI.
- **Personalization Studio:**
  - **3 Accent Color Modes:** Dynamic track-based, background wallpaper-based, or custom user color (with 8 curated presets, HEX input, and HTML5 color picker).
  - **Custom Backgrounds:** Choose any custom wallpaper with adjustable blur and brightness controls.
  - **Display Modes:** Toggle between **Classic Mode** (icons + descriptive labels) and **Sleek Mode** (clean icon-only interface with full hover tooltips).
- **Multi-Source Synced Lyrics:**
  - Priority fallback across embedded tags (USLT/SYLT), companion `.lrc` files, **LRCLIB** (with auto-retry and 503 cooldown handling), **NetEase Cloud Music**, and **Kugou Music**.
  - Permanent SQLite caching for instantaneous (0ms) lyrics loading on subsequent plays.
  - Real-time lyric offset adjustment ($\pm 0.5\text{s}$) with per-track database persistence.
  - Full-screen vinyl view with synchronized spinning disc and word-by-word karaoke highlighting.
- **Mei's Spotlight (`Ctrl + K` / `Cmd + K`):**
  - Fast-action command palette for quick search across tracks, artists, albums, playlists, playback commands, DSP settings, and online sources.
- **Real-Time Visualizations:**
  - 60 FPS HTML5 Canvas audio spectrum visualizer.
  - Waterfall WebGL Spectrogram for frequency-time audio analysis.
- **Mini-Player & Window Utilities:**
  - Compact Picture-in-Picture (PiP) mini-player for background listening.
  - System Tray integration with quick controls and localized menus.
  - Responsive multi-window layout with automatic icon collapsing and hidden scrollbars (`.no-scrollbar`).

---

### 4. High-Performance Architecture & Resource Efficiency

- **Embedded SQLite3 Engine (via Koffi C-FFI):**
  - Powered by embedded `sqlite3.dll` with WAL mode enabled (`PRAGMA journal_mode = WAL`).
  - Replaces fragile monolithic JSON cache files with ACID-compliant storage for track metadata, theme palettes, library indexes, and listening history.
  - Delivers point lookups in $0\text{ms}$ and batch inserts of 5,000 tracks in $\sim 13\text{ms}$.
- **Zero Disk Waste DynamicCoverArt:**
  - Album art is resized and compressed entirely in RAM via an internal HTTP stream server (`127.0.0.1:<port>/cover`) and Electron's `nativeImage` API.
  - Eliminates thousands of cached thumbnail files on disk ($0\text{ bytes}$ wasted disk space).
- **Multi-Level Resource Optimization:**
  - **3 Performance Modes:**
    - *Default Mode:* Full dynamic ambient backdrops, spinning vinyl animations, and WebGL visualizations.
    - *Lite Mode:* Disables heavy graphical effects to minimize CPU and GPU load.
    - *Core Mode:* Ultra-lightweight profile with stripped Web Audio nodes for minimum RAM consumption on resource-constrained systems.
  - **Deep Memory Trimming:** Win32 `SetProcessWorkingSetSize` invocation trims idle memory across all processes (Main, Renderer, GPU, Audio) down to minimal footprints without audio interruption.
  - **Full-Viewport Virtualization:** `react-virtuoso` renders 50,000+ tracks smoothly at 60 FPS by keeping fewer than 50 DOM nodes mounted.

---

### 5. Management, Analytics & Quality of Life (QoL)

- **Comprehensive Tag Editor:** Edit ID3v2 tags (MP3), Vorbis Comments (FLAC), and DSD metadata directly within the app.
- **Listening Analytics (Music Insights):** Track real listening time (filtered against rapid skipping), 24-hour listening rhythm, weekday breakdown, top artists, and audio format distribution.
- **Smart Playlists & Duplicate Finder:** Quickly detect duplicate songs and generate automatic smart playlists by criteria (format, artist, recently added, top played).
- **Playlist Management & Portability:** Import and export standard `.m3u8` playlists and backup/restore full app settings in `.json`.
- **Discord Rich Presence:** Displays current track, artist, album, live playback time, and Hi-Res quality badges (e.g., `FLAC 24-BIT`, `DSD64`).
- **Global Media Controls:** Supports Windows Media Keys, Action Center OSD (`navigator.mediaSession`), and customizable global keyboard shortcuts.
- **Bilingual Localization:** 100% pure English and 100% pure Vietnamese translations across the entire application.

---

## Technical Architecture

```
                    +------------------------------------------------+
                    |            Renderer Process (React 19)         |
                    |  - Zustand Stores & Custom Hooks               |
                    |  - DynamicCoverArt & WebGL Visualizer          |
                    |  - Table / Grid / Compact Virtualized Views    |
                    +-----------------------+------------------------+
                                            |
                                  Context Bridge (window.api)
                                            |
                    +-----------------------v------------------------+
                    |          Main Process (Node.js & Electron)     |
                    |  - Root Orchestrator (src/main/index.ts)       |
                    |  - Internal HTTP Stream Server (Audio/Covers)  |
                    |  - Library Scanner (Non-blocking async)        |
                    |  - Soulseek & Online Streaming Dispatcher      |
                    +-----------+------------------------+-----------+
                                |                        |
               Koffi C-FFI direct binding       Koffi C-FFI direct binding
                                |                        |
                    +-----------v------------+  +--------v-----------+
                    |  BASS Audio C-API DLLs |  |  SQLite3 C-API DLL |
                    |  - bass.dll            |  |  (sqlite3.dll /    |
                    |  - basswasapi.dll      |  |   winsqlite3.dll)  |
                    |  - bassasio.dll        |  |                    |
                    |  - bassdsd.dll         |  |  WAL ACID Storage  |
                    |  - bassflac/opus/alac  |  +--------------------+
                    +-----------+------------+
                                |
                   Direct Bitstream to Hardware
                                |
                    +-----------v------------+
                    | DAC / Audiophile Audio |
                    | Endpoints (WASAPI/ASIO)|
                    +------------------------+
```

---

## Tech Stack

| Domain | Technology / Library |
| :--- | :--- |
| **Runtime & Framework** | Electron `^39.2.6`, Node.js (integrated) |
| **Frontend & UI** | React `^19.2.1`, TypeScript `^5.9.3`, Tailwind CSS `^4.3.3`, Lucide React |
| **Build & Tooling** | Vite `^7.2.6`, `electron-vite` `^5.0.0`, `electron-builder` `^26.0.12` |
| **Audio Core** | BASS Audio Library (WASAPI, ASIO, DSD, FLAC, OPUS, ALAC), Web Audio API |
| **Native Interop** | `koffi` `^3.3.3` (High-performance C-FFI bridge) |
| **Embedded Database** | SQLite3 C-API (`sqlite3.dll` / `winsqlite3.dll` via Koffi) |
| **Virtualization & DnD** | `react-virtuoso` `^4.18.11`, `@dnd-kit/core`, `@dnd-kit/sortable` |
| **State Management** | `zustand` `^5.0.15` (Modular atomic stores) |
| **Metadata & Media** | `music-metadata`, `node-id3`, custom TypeScript FLAC Vorbis writer |
| **Online & Downloads** | `slsk-client` (Soulseek P2P), `yt-dlp-exec`, `node-youtube-music`, `axios` |
| **Integrations** | `@xhayper/discord-rpc`, Windows Media Session API |

---

## Getting Started

### Prerequisites

- **Operating System:** Windows 10 or Windows 11 (64-bit recommended for WASAPI Exclusive and ASIO drivers).
- **Node.js:** Node.js LTS version 20.x or higher.
- **Package Manager:** `npm` (included with Node.js).

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/subzerofroze/meisradio.git
   cd meisradio
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Launch in development mode (with Hot Module Replacement):**
   ```bash
   npm run dev
   ```

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the application in development mode with HMR via `electron-vite`. |
| `npm run build` | Runs TypeScript type checking and compiles the project. |
| `npm run typecheck` | Validates TypeScript types across both Node (Main/Preload) and Web (Renderer). |
| `npm test` | Executes unit and integration tests using `vitest`. |
| `npm run lint` | Lints the codebase using ESLint 9. |
| `npm run format` | Formats all code files with Prettier. |
| `npm run build:win` | Builds and packages the production Windows installer (`.exe` NSIS installer) in `dist/`. |
| `npm run build:unpack` | Compiles and outputs an unpacked executable directory for quick testing. |

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `Ctrl + Right Arrow` / `MediaNext` | Next Track |
| `Ctrl + Left Arrow` / `MediaPrev` | Previous Track |
| `Ctrl + Up Arrow` | Increase Volume (+5%) |
| `Ctrl + Down Arrow` | Decrease Volume (-5%) |
| `Ctrl + K` / `Cmd + K` | Open Spotlight Command Palette |
| `Ctrl + S` | Toggle Shuffle |
| `Ctrl + R` | Cycle Repeat Mode (Off / All / One) |
| `Ctrl + M` | Toggle Mute |
| `Ctrl + L` | Toggle Fullscreen Lyrics & Vinyl View |
| `Escape` | Close active modal, popup, or full-screen view |

---

## Author & Acknowledgements

- **Developer:** [subzerofroze](https://github.com/subzerofroze)
- **Audio Decoding:** [Un4seen Developments](http://www.un4seen.com/) (BASS Audio Library)
- **Lyrics Providers:** [LRCLIB](https://lrclib.net/), NetEase Cloud Music, Kugou Music, Musixmatch
- **Headphone Profiles:** [AutoEQ](https://github.com/jaakkopasanen/AutoEq) by Jaakko Pasanen
