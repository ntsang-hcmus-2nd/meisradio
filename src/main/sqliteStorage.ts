/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import koffi from 'koffi'

export interface TrackMetadata {
  mtime: number
  data: any
}

export interface ThemeColors {
  primary60: string
  secondary30: string
  accent10: string
}

export interface LibraryCacheData {
  libraryPath: string
  libraryPaths: string[]
  multiArtistVersion: number
  dsdVersion: number
  tracks: any[]
  playlists: any[]
  preAggregated: any
}

export interface AdvancedListeningStats {
  overview: {
    totalPlays: number
    totalListenSeconds: number
    uniqueTracks: number
    uniqueArtists: number
    uniqueAlbums: number
    losslessRatio: number
    hiResRatio: number
    dsdPlays: number
    bitPerfectRatio: number
  }
  hourlyDistribution: number[]
  weekdayDistribution: number[]
  dailyActivity: { date: string; plays: number; minutes: number }[]
  topArtists: { name: string; plays: number; totalSeconds: number }[]
  topAlbums: { name: string; artist: string; plays: number; totalSeconds: number }[]
  topGenres: { name: string; plays: number; percentage: number }[]
  formatBreakdown: { format: string; count: number; percentage: number }[]
  topTracks: {
    filePath: string
    title: string
    artist: string
    album: string
    format: string
    plays: number
    totalSeconds: number
    lastPlayed: number
  }[]
}

export interface PlayEventInput {
  filePath: string
  title?: string
  artist?: string
  album?: string
  genre?: string
  format?: string
  sampleRate?: number
  bitDepth?: number
  isLossless?: boolean
  isDsd?: boolean
  audioMode?: string
  durationSec?: number
  playedAt?: number
}

/**
 * Normalizes any file path or file:// URL into a standardized lower-case, forward-slash key
 * for reliable cross-platform comparisons.
 */
export function normalizePathKey(p: string): string {
  if (!p) return ''
  let normalized = p.trim()
  if (normalized.startsWith('file://')) {
    try {
      const url = new URL(normalized)
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.length >= 3 && pathname[0] === '/' && pathname[2] === ':') {
        pathname = pathname.slice(1)
      }
      normalized = pathname
    } catch {
      normalized = decodeURIComponent(normalized.replace(/^file:\/\/\/?/, ''))
    }
  }
  return normalized.replace(/\\/g, '/').toLowerCase()
}

/**
 * Helper to generate candidate lookup keys for a given path (raw, forward-slash, backslash, file URL)
 */
function getCandidatePathKeys(filePath: string): Set<string> {
  const keys = new Set<string>()
  if (!filePath) return keys
  keys.add(filePath)
  keys.add(filePath.replace(/\\/g, '/'))
  keys.add(filePath.replace(/\//g, '\\'))

  if (filePath.startsWith('file://')) {
    try {
      const raw = fileURLToPath(filePath)
      keys.add(raw)
      keys.add(raw.replace(/\\/g, '/'))
      keys.add(raw.replace(/\//g, '\\'))
    } catch { /* ignore */ }
  } else {
    try {
      const url = pathToFileURL(filePath).href
      keys.add(url)
    } catch { /* ignore */ }
  }
  return keys
}

/**
 * Low-level Koffi SQLite3 C-FFI Binding Wrapper
 */
class KoffiSqlite3 {
  private db: any = null
  private lib: any = null

  // C-FFI function handles
  private _open_v2: any
  private _close_v2: any
  private _errmsg: any
  private _exec: any
  private _prepare_v2: any
  private _step: any
  private _finalize: any
  private _reset: any
  private _clear_bindings: any
  private _column_count: any
  private _column_name: any
  private _column_type: any
  private _column_text: any
  private _column_double: any
  private _column_int: any
  private _column_int64: any
  private _bind_text: any
  private _bind_double: any
  private _bind_int: any
  private _bind_int64: any
  private _bind_null: any
  private _changes: any
  private _last_insert_rowid: any

  constructor(dllPath: string, dbPath: string) {
    this.lib = koffi.load(dllPath)

    this._open_v2 = this.lib.func('int sqlite3_open_v2(const char *filename, _Out_ void **ppDb, int flags, const char *zVfs)')
    this._close_v2 = this.lib.func('int sqlite3_close_v2(void *db)')
    this._errmsg = this.lib.func('const char *sqlite3_errmsg(void *db)')
    this._exec = this.lib.func('int sqlite3_exec(void *db, const char *sql, void *callback, void *arg, _Out_ char **errmsg)')
    this._prepare_v2 = this.lib.func('int sqlite3_prepare_v2(void *db, const char *zSql, int nByte, _Out_ void **ppStmt, void *pzTail)')
    this._step = this.lib.func('int sqlite3_step(void *stmt)')
    this._finalize = this.lib.func('int sqlite3_finalize(void *stmt)')
    this._reset = this.lib.func('int sqlite3_reset(void *stmt)')
    this._clear_bindings = this.lib.func('int sqlite3_clear_bindings(void *stmt)')
    this._column_count = this.lib.func('int sqlite3_column_count(void *stmt)')
    this._column_name = this.lib.func('const char *sqlite3_column_name(void *stmt, int N)')
    this._column_type = this.lib.func('int sqlite3_column_type(void *stmt, int iCol)')
    this._column_text = this.lib.func('const char *sqlite3_column_text(void *stmt, int iCol)')
    this._column_double = this.lib.func('double sqlite3_column_double(void *stmt, int iCol)')
    this._column_int = this.lib.func('int sqlite3_column_int(void *stmt, int iCol)')
    this._column_int64 = this.lib.func('int64 sqlite3_column_int64(void *stmt, int iCol)')
    this._bind_text = this.lib.func('int sqlite3_bind_text(void *stmt, int iCol, const char *val, int nByte, intptr_t destructor)')
    this._bind_double = this.lib.func('int sqlite3_bind_double(void *stmt, int iCol, double val)')
    this._bind_int = this.lib.func('int sqlite3_bind_int(void *stmt, int iCol, int val)')
    this._bind_int64 = this.lib.func('int sqlite3_bind_int64(void *stmt, int iCol, int64 val)')
    this._bind_null = this.lib.func('int sqlite3_bind_null(void *stmt, int iCol)')
    this._changes = this.lib.func('int sqlite3_changes(void *db)')
    this._last_insert_rowid = this.lib.func('int64 sqlite3_last_insert_rowid(void *db)')

    const dbPtr = [null]
    // SQLITE_OPEN_READWRITE (0x02) | SQLITE_OPEN_CREATE (0x04) | SQLITE_OPEN_FULLMUTEX (0x10000)
    const rc = this._open_v2(dbPath, dbPtr, 0x10006, null)
    if (rc !== 0 || !dbPtr[0]) {
      throw new Error(`[KoffiSqlite3] Failed to open database ${dbPath}, rc=${rc}`)
    }
    this.db = dbPtr[0]
  }

  public getErrmsg(): string {
    if (!this.db) return 'Database not open'
    return this._errmsg(this.db) || 'Unknown SQLite error'
  }

  public exec(sql: string): void {
    if (!this.db) throw new Error('Database is closed')
    const errmsg = [null]
    const rc = this._exec(this.db, sql, null, null, errmsg)
    if (rc !== 0) {
      const msg = errmsg[0] || this.getErrmsg()
      throw new Error(`[KoffiSqlite3.exec] Error: ${msg} (rc=${rc}) SQL: ${sql}`)
    }
  }

  public prepare(sql: string): KoffiPreparedStatement {
    if (!this.db) throw new Error('Database is closed')
    const stmtPtr = [null]
    const rc = this._prepare_v2(this.db, sql, -1, stmtPtr, null)
    if (rc !== 0 || !stmtPtr[0]) {
      throw new Error(`[KoffiSqlite3.prepare] Error: ${this.getErrmsg()} (rc=${rc}) SQL: ${sql}`)
    }
    return new KoffiPreparedStatement(this, stmtPtr[0], sql)
  }

  public getChanges(): number {
    if (!this.db) return 0
    return this._changes(this.db)
  }

  public lastInsertRowid(): number {
    if (!this.db) return 0
    return Number(this._last_insert_rowid(this.db))
  }

  public transaction<T>(fn: () => T): T {
    this.exec('BEGIN TRANSACTION;')
    try {
      const result = fn()
      this.exec('COMMIT;')
      return result
    } catch (err) {
      try {
        this.exec('ROLLBACK;')
      } catch { /* ignore */ }
      throw err
    }
  }

  public checkpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'TRUNCATE'): boolean {
    if (!this.db) return false
    try {
      this.exec(`PRAGMA wal_checkpoint(${mode});`)
      return true
    } catch {
      return false
    }
  }

  public close(): void {
    if (this.db) {
      try {
        this._close_v2(this.db)
      } catch { /* ignore */ }
      this.db = null
    }
  }

  // Internal accessors for statement execution
  public _stepStmt(stmt: any): number { return this._step(stmt) }
  public _resetStmt(stmt: any): number { return this._reset(stmt) }
  public _clearStmt(stmt: any): number { return this._clear_bindings(stmt) }
  public _finalizeStmt(stmt: any): number { return this._finalize(stmt) }
  public _colCount(stmt: any): number { return this._column_count(stmt) }
  public _colName(stmt: any, i: number): string { return this._column_name(stmt, i) }
  public _colType(stmt: any, i: number): number { return this._column_type(stmt, i) }
  public _colText(stmt: any, i: number): string { return this._column_text(stmt, i) }
  public _colDouble(stmt: any, i: number): number { return this._column_double(stmt, i) }
  public _colInt(stmt: any, i: number): number { return this._column_int(stmt, i) }
  public _colInt64(stmt: any, i: number): number { return this._column_int64(stmt, i) }

  public _bind(stmt: any, index: number, val: any): void {
    if (val === null || val === undefined) {
      this._bind_null(stmt, index)
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        if (val >= -2147483648 && val <= 2147483647) {
          this._bind_int(stmt, index, val)
        } else {
          this._bind_int64(stmt, index, val)
        }
      } else {
        this._bind_double(stmt, index, val)
      }
    } else if (typeof val === 'boolean') {
      this._bind_int(stmt, index, val ? 1 : 0)
    } else {
      // String
      const strVal = String(val)
      this._bind_text(stmt, index, strVal, -1, -1) // SQLITE_TRANSIENT = -1
    }
  }
}

class KoffiPreparedStatement {
  private driver: KoffiSqlite3
  private stmt: any
  public readonly sql: string
  private isFinalized = false

  constructor(driver: KoffiSqlite3, stmt: any, sql: string) {
    this.driver = driver
    this.stmt = stmt
    this.sql = sql
  }

  private bindParams(params: any[]): void {
    this.driver._resetStmt(this.stmt)
    this.driver._clearStmt(this.stmt)
    for (let i = 0; i < params.length; i++) {
      this.driver._bind(this.stmt, i + 1, params[i])
    }
  }

  public run(...params: any[]): { changes: number } {
    if (this.isFinalized) throw new Error('Statement is finalized')
    this.bindParams(params)
    const rc = this.driver._stepStmt(this.stmt)
    // SQLITE_DONE (101) or SQLITE_ROW (100)
    if (rc !== 101 && rc !== 100 && rc !== 0) {
      throw new Error(`[PreparedStatement.run] Error rc=${rc}: ${this.driver.getErrmsg()} (SQL: ${this.sql})`)
    }
    return { changes: this.driver.getChanges() }
  }

  public get<T = any>(...params: any[]): T | null {
    if (this.isFinalized) throw new Error('Statement is finalized')
    this.bindParams(params)
    const rc = this.driver._stepStmt(this.stmt)
    if (rc === 100) {
      // SQLITE_ROW
      const colCount = this.driver._colCount(this.stmt)
      const row: any = {}
      for (let i = 0; i < colCount; i++) {
        const name = this.driver._colName(this.stmt, i)
        const type = this.driver._colType(this.stmt, i)
        if (type === 5) { // SQLITE_NULL
          row[name] = null
        } else if (type === 1) { // SQLITE_INTEGER
          row[name] = Number(this.driver._colInt64(this.stmt, i))
        } else if (type === 2) { // SQLITE_FLOAT
          row[name] = this.driver._colDouble(this.stmt, i)
        } else { // SQLITE_TEXT or other
          row[name] = this.driver._colText(this.stmt, i)
        }
      }
      return row as T
    }
    return null
  }

  public all<T = any>(...params: any[]): T[] {
    if (this.isFinalized) throw new Error('Statement is finalized')
    this.bindParams(params)
    const rows: T[] = []
    const colCount = this.driver._colCount(this.stmt)
    while (this.driver._stepStmt(this.stmt) === 100) {
      const row: any = {}
      for (let i = 0; i < colCount; i++) {
        const name = this.driver._colName(this.stmt, i)
        const type = this.driver._colType(this.stmt, i)
        if (type === 5) {
          row[name] = null
        } else if (type === 1) {
          row[name] = Number(this.driver._colInt64(this.stmt, i))
        } else if (type === 2) {
          row[name] = this.driver._colDouble(this.stmt, i)
        } else {
          row[name] = this.driver._colText(this.stmt, i)
        }
      }
      rows.push(row as T)
    }
    return rows
  }

  public finalize(): void {
    if (!this.isFinalized && this.stmt) {
      try {
        this.driver._finalizeStmt(this.stmt)
      } catch { /* ignore */ }
      this.isFinalized = true
      this.stmt = null
    }
  }
}

/** Global singleton reference for convenience functions */
let activeSqliteStorage: SqliteStorage | null = null

export function getActiveSqliteStorage(): SqliteStorage | null {
  return activeSqliteStorage
}

/**
 * High-level SQLite Storage Manager for Mei's Radio
 * Replaces metadata-cache.json, theme-colors-cache.json, and library-cache.json
 */
export class SqliteStorage {
  private db: KoffiSqlite3 | null = null
  private dataFolder: string

  // Prepared statements for maximum performance
  private stmtGetMetadata: KoffiPreparedStatement | null = null
  private stmtSetMetadata: KoffiPreparedStatement | null = null
  private stmtDeleteMetadata: KoffiPreparedStatement | null = null

  private stmtGetThemeColor: KoffiPreparedStatement | null = null
  private stmtSetThemeColor: KoffiPreparedStatement | null = null
  private stmtDeleteThemeColor: KoffiPreparedStatement | null = null

  private stmtGetLibraryCache: KoffiPreparedStatement | null = null
  private stmtSetLibraryCache: KoffiPreparedStatement | null = null
  private stmtUpdateLibraryCacheTracks: KoffiPreparedStatement | null = null

  private stmtUpsertTrack: KoffiPreparedStatement | null = null
  private stmtFindTrackByIdOrPath: KoffiPreparedStatement | null = null
  private stmtUpdateSingleTrack: KoffiPreparedStatement | null = null

  // New QoL Prepared Statements
  private stmtGetWaveform: KoffiPreparedStatement | null = null
  private stmtSetWaveform: KoffiPreparedStatement | null = null

  private stmtGetFavorites: KoffiPreparedStatement | null = null
  private stmtIsFavorite: KoffiPreparedStatement | null = null
  private stmtAddFavorite: KoffiPreparedStatement | null = null
  private stmtRemoveFavorite: KoffiPreparedStatement | null = null
  private stmtClearFavorites: KoffiPreparedStatement | null = null

  private stmtGetLyricOffset: KoffiPreparedStatement | null = null
  private stmtSetLyricOffset: KoffiPreparedStatement | null = null
  private stmtGetAllLyricOffsets: KoffiPreparedStatement | null = null

  private stmtGetSmartPlaylists: KoffiPreparedStatement | null = null
  private stmtSaveSmartPlaylist: KoffiPreparedStatement | null = null
  private stmtDeleteSmartPlaylist: KoffiPreparedStatement | null = null

  private stmtGetUserPlaylists: KoffiPreparedStatement | null = null
  private stmtSaveUserPlaylist: KoffiPreparedStatement | null = null
  private stmtDeleteUserPlaylist: KoffiPreparedStatement | null = null

  private stmtGetOnlineLyric: KoffiPreparedStatement | null = null
  private stmtSetOnlineLyric: KoffiPreparedStatement | null = null
  private stmtClearOnlineLyrics: KoffiPreparedStatement | null = null

  private stmtRecordPlayEvent: KoffiPreparedStatement | null = null
  private stmtUpdatePlayEventDuration: KoffiPreparedStatement | null = null
  private stmtGetPlayEventById: KoffiPreparedStatement | null = null
  private stmtIncrementPlayStat: KoffiPreparedStatement | null = null
  private stmtUpdatePlayStatDuration: KoffiPreparedStatement | null = null

  constructor(dataFolder: string) {
    this.dataFolder = dataFolder
    const dbPath = path.join(dataFolder, 'library.db')
    const dllPath = this.resolveSqliteDll()

    this.db = new KoffiSqlite3(dllPath, dbPath)
    activeSqliteStorage = this

    this.initDatabase()
    this.prepareStatements()
    this.migrateExistingJsonFiles()

    // Thu nhỏ và dọn dẹp WAL ngay khi khởi động
    this.checkpoint('TRUNCATE')
  }

  public checkpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'TRUNCATE'): boolean {
    if (!this.db) return false
    return this.db.checkpoint(mode)
  }

  private resolveSqliteDll(): string {
    const candidates = [
      path.join(process.resourcesPath || '', 'bin', 'sqlite3.dll'),
      path.join(__dirname, '../../resources/bin/sqlite3.dll'),
      path.join(process.cwd(), 'resources', 'bin', 'sqlite3.dll'),
      'C:\\Windows\\System32\\winsqlite3.dll',
      'winsqlite3.dll',
      'sqlite3.dll'
    ]

    for (const p of candidates) {
      try {
        if (p.includes('\\') || p.includes('/')) {
          if (fs.existsSync(p)) return p
        } else {
          return p
        }
      } catch { /* ignore */ }
    }
    return 'winsqlite3.dll'
  }

  private initDatabase(): void {
    if (!this.db) return

    // 1. Tối ưu hóa hiệu năng và tạo tất cả các bảng (nếu chưa tồn tại)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -8000;
      PRAGMA wal_autocheckpoint = 1000;

      -- 1. Metadata cache: metadata của từng file âm thanh (thay thế metadata-cache.json)
      CREATE TABLE IF NOT EXISTS metadata_cache (
        file_path TEXT PRIMARY KEY,
        mtime REAL NOT NULL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- 2. Theme colors: bảng màu 60-30-10 của bài hát/thư mục (thay thế theme-colors-cache.json)
      CREATE TABLE IF NOT EXISTS theme_colors (
        key TEXT PRIMARY KEY,
        primary60 TEXT,
        secondary30 TEXT,
        accent10 TEXT,
        updated_at INTEGER NOT NULL
      );

      -- 3. Library cache: snapshot thư viện hoàn chỉnh (thay thế library-cache.json)
      CREATE TABLE IF NOT EXISTS library_cache (
        id TEXT PRIMARY KEY,
        library_path TEXT,
        library_paths_json TEXT,
        multi_artist_version INTEGER,
        dsd_version INTEGER,
        tracks_json TEXT,
        playlists_json TEXT,
        pre_aggregated_json TEXT,
        updated_at INTEGER NOT NULL
      );

      -- 4. Library tracks: bảng bài hát riêng lẻ có index để truy vấn nhanh
      CREATE TABLE IF NOT EXISTS library_tracks (
        id TEXT PRIMARY KEY,
        file_path TEXT UNIQUE,
        title TEXT,
        artist TEXT,
        album TEXT,
        genre TEXT,
        duration REAL,
        year INTEGER,
        format TEXT,
        bitrate INTEGER,
        sample_rate INTEGER,
        bit_depth INTEGER,
        is_dsd INTEGER DEFAULT 0,
        has_lyrics INTEGER DEFAULT 0,
        is_hi_res INTEGER DEFAULT 0,
        cover_art TEXT,
        theme_primary TEXT,
        theme_secondary TEXT,
        theme_accent TEXT,
        track_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- 5. Waveform Peaks Cache
      CREATE TABLE IF NOT EXISTS waveform_cache (
        file_path TEXT PRIMARY KEY,
        mtime REAL,
        peaks_json TEXT,
        updated_at INTEGER
      );

      -- 6. Favorites
      CREATE TABLE IF NOT EXISTS favorite_tracks (
        file_path TEXT PRIMARY KEY,
        added_at INTEGER
      );

      -- 7. Per-Track Lyric Offsets
      CREATE TABLE IF NOT EXISTS track_lyric_offsets (
        file_path TEXT PRIMARY KEY,
        offset_sec REAL NOT NULL,
        updated_at INTEGER
      );

      -- 8. Smart Playlists
      CREATE TABLE IF NOT EXISTS smart_playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rules_json TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER
      );

      -- 9. User Virtual Playlists
      CREATE TABLE IF NOT EXISTS user_playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        tracks_json TEXT NOT NULL DEFAULT '[]',
        cover_art TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      -- 10. Online Lyrics Cache
      CREATE TABLE IF NOT EXISTS online_lyrics_cache (
        cache_key TEXT PRIMARY KEY,
        title TEXT,
        artist TEXT,
        lyrics TEXT NOT NULL,
        is_synced INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'lrclib',
        updated_at INTEGER
      );

      -- 11. Play Events (Advanced Audiophile Listening Analytics)
      CREATE TABLE IF NOT EXISTS play_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        genre TEXT,
        format TEXT,
        sample_rate INTEGER,
        bit_depth INTEGER,
        is_lossless INTEGER DEFAULT 0,
        is_dsd INTEGER DEFAULT 0,
        audio_mode TEXT DEFAULT 'webaudio',
        duration_sec REAL DEFAULT 0,
        played_at INTEGER NOT NULL
      );

      -- 12. Play Stats (Cumulative aggregation sync)
      CREATE TABLE IF NOT EXISTS play_stats (
        file_path TEXT PRIMARY KEY,
        play_count INTEGER DEFAULT 0,
        total_duration REAL DEFAULT 0,
        last_played INTEGER
      );
    `)

    // 2. Migration an toàn cho các cột mới nếu DB đã tồn tại từ các phiên bản cũ
    const alterColumns = [
      'ALTER TABLE library_tracks ADD COLUMN genre TEXT;',
      'ALTER TABLE library_tracks ADD COLUMN year INTEGER;',
      'ALTER TABLE library_tracks ADD COLUMN format TEXT;',
      'ALTER TABLE library_tracks ADD COLUMN bitrate INTEGER;',
      'ALTER TABLE library_tracks ADD COLUMN sample_rate INTEGER;',
      'ALTER TABLE library_tracks ADD COLUMN bit_depth INTEGER;',
      'ALTER TABLE library_tracks ADD COLUMN is_dsd INTEGER DEFAULT 0;',
      'ALTER TABLE library_tracks ADD COLUMN has_lyrics INTEGER DEFAULT 0;',
      'ALTER TABLE library_tracks ADD COLUMN is_hi_res INTEGER DEFAULT 0;',
      'ALTER TABLE library_tracks ADD COLUMN cover_art TEXT;',
      'ALTER TABLE library_tracks ADD COLUMN theme_primary TEXT;',
      'ALTER TABLE library_tracks ADD COLUMN theme_secondary TEXT;',
      'ALTER TABLE library_tracks ADD COLUMN theme_accent TEXT;',
      'ALTER TABLE library_cache ADD COLUMN library_paths_json TEXT;',
      'ALTER TABLE library_cache ADD COLUMN multi_artist_version INTEGER DEFAULT 2;',
      'ALTER TABLE library_cache ADD COLUMN dsd_version INTEGER DEFAULT 1;',
      'ALTER TABLE library_cache ADD COLUMN pre_aggregated_json TEXT;',
      'ALTER TABLE user_playlists ADD COLUMN tracks_json TEXT DEFAULT \'[]\';',
      'ALTER TABLE user_playlists ADD COLUMN description TEXT;',
      'ALTER TABLE user_playlists ADD COLUMN cover_art TEXT;',
      'ALTER TABLE user_playlists ADD COLUMN thumbnail TEXT;',
      'ALTER TABLE user_playlists ADD COLUMN created_at INTEGER;',
      'ALTER TABLE user_playlists ADD COLUMN updated_at INTEGER;',
      'ALTER TABLE smart_playlists ADD COLUMN created_at INTEGER;',
      'ALTER TABLE smart_playlists ADD COLUMN updated_at INTEGER;',
      'ALTER TABLE waveform_cache ADD COLUMN updated_at INTEGER;',
      'ALTER TABLE favorite_tracks ADD COLUMN added_at INTEGER;',
      'ALTER TABLE track_lyric_offsets ADD COLUMN updated_at INTEGER;'
    ]

    for (const sql of alterColumns) {
      try {
        this.db.exec(sql)
      } catch {
        /* Bỏ qua nếu cột đã tồn tại hoặc bảng mới tạo */
      }
    }

    // Tự động di chuyển dữ liệu từ bảng cũ user_playlist_tracks (nếu có) sang tracks_json
    try {
      const hasOldPlaylistTracks = this.db.prepare(
        "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='user_playlist_tracks';"
      ).get<{ cnt: number }>()

      if (hasOldPlaylistTracks && hasOldPlaylistTracks.cnt > 0) {
        const emptyPlaylists = this.db.prepare(
          "SELECT id FROM user_playlists WHERE tracks_json IS NULL OR tracks_json = '' OR tracks_json = '[]';"
        ).all<{ id: string }>()

        for (const pl of emptyPlaylists) {
          const trackRows = this.db.prepare(
            "SELECT track_id FROM user_playlist_tracks WHERE playlist_id = ? ORDER BY position ASC;"
          ).all<{ track_id: string }>(pl.id)

          if (trackRows && trackRows.length > 0) {
            const trackIds = trackRows.map((r) => r.track_id)
            this.db.prepare('UPDATE user_playlists SET tracks_json = ? WHERE id = ?;').run(
              JSON.stringify(trackIds),
              pl.id
            )
          }
        }
      }
    } catch (e) {
      console.warn('[SqliteStorage] Error migrating user_playlist_tracks:', e)
    }

    try {
      this.db.exec("UPDATE user_playlists SET tracks_json = '[]' WHERE tracks_json IS NULL;")
      this.db.exec(
        "UPDATE user_playlists SET cover_art = thumbnail WHERE (cover_art IS NULL OR cover_art = '') AND (thumbnail IS NOT NULL AND thumbnail != '');"
      )
    } catch { /* ignore */ }

    // 3. Tạo các index an toàn sau khi chắc chắn các cột đã tồn tại
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_metadata_mtime ON metadata_cache(mtime);',
      'CREATE INDEX IF NOT EXISTS idx_lib_tracks_artist ON library_tracks(artist);',
      'CREATE INDEX IF NOT EXISTS idx_lib_tracks_album ON library_tracks(album);',
      'CREATE INDEX IF NOT EXISTS idx_lib_tracks_genre ON library_tracks(genre);',
      'CREATE INDEX IF NOT EXISTS idx_lib_tracks_file ON library_tracks(file_path);',
      'CREATE INDEX IF NOT EXISTS idx_lib_tracks_lyrics ON library_tracks(has_lyrics);',
      'CREATE INDEX IF NOT EXISTS idx_lib_tracks_hires ON library_tracks(is_hi_res);',
      'CREATE INDEX IF NOT EXISTS idx_waveform_mtime ON waveform_cache(mtime);',
      'CREATE INDEX IF NOT EXISTS idx_fav_tracks_added ON favorite_tracks(added_at);',
      'CREATE INDEX IF NOT EXISTS idx_play_events_played_at ON play_events(played_at);',
      'CREATE INDEX IF NOT EXISTS idx_play_events_artist ON play_events(artist);',
      'CREATE INDEX IF NOT EXISTS idx_play_stats_count ON play_stats(play_count);'
    ]

    for (const sql of createIndexes) {
      try {
        this.db.exec(sql)
      } catch {
        /* Bỏ qua nếu index đã tồn tại */
      }
    }

    // 4. Chuẩn hóa dữ liệu play_events cũ không thực tế (loại bỏ skip < 5s và kẹp thời gian thực)
    try {
      this.sanitizeLegacyPlayEvents()
    } catch (e) {
      console.warn('[SqliteStorage] Lỗi sanitizeLegacyPlayEvents:', e)
    }
  }

  /**
   * Chuẩn hóa dữ liệu thống kê cũ: loại bỏ các lượt skip chớp nhoáng (< 5s)
   * và kẹp thời gian nghe giữa các bài liên tiếp để không vượt quá thời gian thực tế.
   */
  private sanitizeLegacyPlayEvents(): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare('SELECT id, file_path, duration_sec, played_at FROM play_events ORDER BY played_at ASC;')
      let rows: any[] = []
      try {
        rows = stmt.all()
      } finally {
        stmt.finalize()
      }
      if (!rows || rows.length === 0) return

      let modified = false
      const toDelete: number[] = []
      const toUpdate: { id: number; dur: number }[] = []

      for (let i = 0; i < rows.length; i++) {
        const current = rows[i]
        const next = i + 1 < rows.length ? rows[i + 1] : null

        if (next) {
          const timeDiffSec = (next.played_at - current.played_at) / 1000
          if (timeDiffSec > 0 && timeDiffSec < (current.duration_sec || 0) - 1) {
            if (timeDiffSec < 5) {
              toDelete.push(current.id)
              modified = true
              continue
            } else {
              toUpdate.push({ id: current.id, dur: Math.round(timeDiffSec) })
              modified = true
              continue
            }
          }
        }
      }

      if (modified) {
        this.db.transaction(() => {
          if (toDelete.length > 0) {
            const delStmt = this.db!.prepare('DELETE FROM play_events WHERE id = ?;')
            try {
              for (const id of toDelete) {
                delStmt.run(id)
              }
            } finally {
              delStmt.finalize()
            }
          }
          if (toUpdate.length > 0) {
            const updStmt = this.db!.prepare('UPDATE play_events SET duration_sec = ? WHERE id = ?;')
            try {
              for (const item of toUpdate) {
                updStmt.run(item.dur, item.id)
              }
            } finally {
              updStmt.finalize()
            }
          }

          // Tái đồng bộ play_stats theo play_events chuẩn
          this.db!.exec('DELETE FROM play_stats;')
          this.db!.exec(`
            INSERT INTO play_stats (file_path, play_count, total_duration, last_played)
            SELECT file_path, COUNT(*), SUM(duration_sec), MAX(played_at)
            FROM play_events
            GROUP BY file_path;
          `)
        })
        console.log(`[SqliteStorage] Đã chuẩn hóa dữ liệu thống kê cũ: xóa ${toDelete.length} lượt skip ảo, cập nhật ${toUpdate.length} bản ghi.`)
      }
    } catch (err) {
      console.warn('[SqliteStorage] Error in sanitizeLegacyPlayEvents:', err)
    }
  }

  private prepareStatements(): void {
    if (!this.db) return

    this.stmtGetMetadata = this.db.prepare('SELECT mtime, data_json FROM metadata_cache WHERE file_path = ?;')
    this.stmtSetMetadata = this.db.prepare(
      'INSERT OR REPLACE INTO metadata_cache (file_path, mtime, data_json, updated_at) VALUES (?, ?, ?, ?);'
    )
    this.stmtDeleteMetadata = this.db.prepare('DELETE FROM metadata_cache WHERE file_path = ?;')

    this.stmtGetThemeColor = this.db.prepare('SELECT primary60, secondary30, accent10 FROM theme_colors WHERE key = ?;')
    this.stmtSetThemeColor = this.db.prepare(
      'INSERT OR REPLACE INTO theme_colors (key, primary60, secondary30, accent10, updated_at) VALUES (?, ?, ?, ?, ?);'
    )
    this.stmtDeleteThemeColor = this.db.prepare('DELETE FROM theme_colors WHERE key = ?;')

    this.stmtGetLibraryCache = this.db.prepare(
      'SELECT library_path, library_paths_json, multi_artist_version, dsd_version, tracks_json, playlists_json, pre_aggregated_json FROM library_cache WHERE id = ?;'
    )
    this.stmtSetLibraryCache = this.db.prepare(
      'INSERT OR REPLACE INTO library_cache (id, library_path, library_paths_json, multi_artist_version, dsd_version, tracks_json, playlists_json, pre_aggregated_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);'
    )
    this.stmtUpdateLibraryCacheTracks = this.db.prepare(
      'UPDATE library_cache SET tracks_json = ?, pre_aggregated_json = ?, updated_at = ? WHERE id = "current_library";'
    )

    this.stmtUpsertTrack = this.db.prepare(
      `INSERT OR REPLACE INTO library_tracks (
        id, file_path, title, artist, album, genre, duration, year, format, bitrate, sample_rate, bit_depth, is_dsd, has_lyrics, is_hi_res, cover_art, theme_primary, theme_secondary, theme_accent, track_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
    )

    this.stmtFindTrackByIdOrPath = this.db.prepare(
      'SELECT id, file_path, track_json FROM library_tracks WHERE file_path = ? OR id = ? LIMIT 1;'
    )

    this.stmtUpdateSingleTrack = this.db.prepare(
      `UPDATE library_tracks SET title = ?, artist = ?, album = ?, duration = ?, format = ?, year = ?, genre = ?, has_lyrics = ?, is_hi_res = ?, sample_rate = ?, bit_depth = ?, track_json = ?, updated_at = ? WHERE id = ?;`
    )

    // Waveform Cache
    this.stmtGetWaveform = this.db.prepare('SELECT mtime, peaks_json FROM waveform_cache WHERE file_path = ?;')
    this.stmtSetWaveform = this.db.prepare(
      'INSERT OR REPLACE INTO waveform_cache (file_path, mtime, peaks_json, updated_at) VALUES (?, ?, ?, ?);'
    )

    // Favorites
    this.stmtGetFavorites = this.db.prepare('SELECT file_path FROM favorite_tracks ORDER BY added_at ASC;')
    this.stmtIsFavorite = this.db.prepare('SELECT file_path FROM favorite_tracks WHERE file_path = ? LIMIT 1;')
    this.stmtAddFavorite = this.db.prepare('INSERT OR REPLACE INTO favorite_tracks (file_path, added_at) VALUES (?, ?);')
    this.stmtRemoveFavorite = this.db.prepare('DELETE FROM favorite_tracks WHERE file_path = ?;')
    this.stmtClearFavorites = this.db.prepare('DELETE FROM favorite_tracks;')

    // Track Lyric Offsets
    this.stmtGetLyricOffset = this.db.prepare('SELECT offset_sec FROM track_lyric_offsets WHERE file_path = ?;')
    this.stmtSetLyricOffset = this.db.prepare(
      'INSERT OR REPLACE INTO track_lyric_offsets (file_path, offset_sec, updated_at) VALUES (?, ?, ?);'
    )
    this.stmtGetAllLyricOffsets = this.db.prepare('SELECT file_path, offset_sec FROM track_lyric_offsets;')

    // Smart Playlists
    try {
      this.stmtGetSmartPlaylists = this.db.prepare(
        'SELECT id, name, rules_json, created_at, updated_at FROM smart_playlists ORDER BY updated_at DESC;'
      )
      this.stmtSaveSmartPlaylist = this.db.prepare(
        'INSERT OR REPLACE INTO smart_playlists (id, name, rules_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?);'
      )
      this.stmtDeleteSmartPlaylist = this.db.prepare('DELETE FROM smart_playlists WHERE id = ?;')
    } catch (e) {
      console.warn('[SqliteStorage] Lỗi prepare statements cho smart_playlists:', e)
    }

    // User Virtual Playlists
    try {
      this.stmtGetUserPlaylists = this.db.prepare(
        'SELECT id, name, description, tracks_json, cover_art, created_at, updated_at FROM user_playlists ORDER BY updated_at DESC;'
      )
      this.stmtSaveUserPlaylist = this.db.prepare(
        'INSERT OR REPLACE INTO user_playlists (id, name, description, tracks_json, cover_art, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);'
      )
      this.stmtDeleteUserPlaylist = this.db.prepare('DELETE FROM user_playlists WHERE id = ?;')
    } catch (e) {
      console.warn('[SqliteStorage] Lỗi prepare statements cho user_playlists:', e)
    }

    // Online Lyrics Cache
    try {
      this.stmtGetOnlineLyric = this.db.prepare(
        'SELECT lyrics, is_synced, source FROM online_lyrics_cache WHERE cache_key = ?;'
      )
      this.stmtSetOnlineLyric = this.db.prepare(
        'INSERT OR REPLACE INTO online_lyrics_cache (cache_key, title, artist, lyrics, is_synced, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);'
      )
      this.stmtClearOnlineLyrics = this.db.prepare('DELETE FROM online_lyrics_cache;')
    } catch (e) {
      console.warn('[SqliteStorage] Lỗi prepare statements cho online_lyrics_cache:', e)
    }

    // Audiophile Play Events & Stats
    try {
      this.stmtRecordPlayEvent = this.db.prepare(`
        INSERT INTO play_events (
          file_path, title, artist, album, genre, format,
          sample_rate, bit_depth, is_lossless, is_dsd, audio_mode, duration_sec, played_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `)
      this.stmtUpdatePlayEventDuration = this.db.prepare(`
        UPDATE play_events SET duration_sec = ? WHERE id = ?;
      `)
      this.stmtGetPlayEventById = this.db.prepare(`
        SELECT id, file_path, duration_sec FROM play_events WHERE id = ?;
      `)
      this.stmtIncrementPlayStat = this.db.prepare(`
        INSERT INTO play_stats (file_path, play_count, total_duration, last_played)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          play_count = play_count + 1,
          total_duration = total_duration + excluded.total_duration,
          last_played = excluded.last_played;
      `)
      this.stmtUpdatePlayStatDuration = this.db.prepare(`
        UPDATE play_stats SET total_duration = MAX(0, total_duration + ?), last_played = ? WHERE file_path = ?;
      `)
    } catch (e) {
      console.warn('[SqliteStorage] Lỗi prepare statements cho play_events/play_stats:', e)
    }
  }

  /**
   * Tự động di chuyển dữ liệu từ các file JSON cũ sang SQLite (chỉ chạy 1 lần)
   */
  private migrateExistingJsonFiles(): void {
    if (!this.db) return

    try {
      // 1. Migrate metadata-cache.json
      const metaJsonPath = path.join(this.dataFolder, 'metadata-cache.json')
      if (fs.existsSync(metaJsonPath)) {
        try {
          const raw = fs.readFileSync(metaJsonPath, 'utf-8')
          const parsed = JSON.parse(raw)
          const keys = Object.keys(parsed)
          if (keys.length > 0) {
            console.log(`[SqliteStorage] Đang di chuyển ${keys.length} mục từ metadata-cache.json sang SQLite...`)
            this.db.transaction(() => {
              const now = Date.now()
              for (const k of keys) {
                const item = parsed[k]
                if (item && item.mtime !== undefined) {
                  this.stmtSetMetadata?.run(k, item.mtime, JSON.stringify(item.data || {}), now)
                }
              }
            })
            console.log(`[SqliteStorage] Đã di chuyển metadata thành công!`)
          }
          fs.renameSync(metaJsonPath, metaJsonPath + '.migrated')
        } catch (e) {
          console.warn('[SqliteStorage] Lỗi migrate metadata-cache.json:', e)
        }
      }

      // 2. Migrate theme-colors-cache.json
      const colorsJsonPath = path.join(this.dataFolder, 'theme-colors-cache.json')
      if (fs.existsSync(colorsJsonPath)) {
        try {
          const raw = fs.readFileSync(colorsJsonPath, 'utf-8')
          const parsed = JSON.parse(raw)
          const keys = Object.keys(parsed)
          if (keys.length > 0) {
            console.log(`[SqliteStorage] Đang di chuyển ${keys.length} mục từ theme-colors-cache.json sang SQLite...`)
            this.db.transaction(() => {
              const now = Date.now()
              for (const k of keys) {
                const colors = parsed[k]
                if (colors) {
                  this.stmtSetThemeColor?.run(k, colors.primary60 || '', colors.secondary30 || '', colors.accent10 || '', now)
                }
              }
            })
            console.log(`[SqliteStorage] Đã di chuyển theme colors thành công!`)
          }
          fs.renameSync(colorsJsonPath, colorsJsonPath + '.migrated')
        } catch (e) {
          console.warn('[SqliteStorage] Lỗi migrate theme-colors-cache.json:', e)
        }
      }

      // 3. Migrate library-cache.json
      const libJsonPath = path.join(this.dataFolder, 'library-cache.json')
      if (fs.existsSync(libJsonPath)) {
        try {
          const raw = fs.readFileSync(libJsonPath, 'utf-8')
          const parsed = JSON.parse(raw)
          if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
            console.log(`[SqliteStorage] Đang di chuyển thư viện (${parsed.tracks.length} bài hát) sang SQLite...`)
            this.setLibraryCache({
              libraryPath: parsed.libraryPath || '',
              libraryPaths: Array.isArray(parsed.libraryPaths) ? parsed.libraryPaths : (parsed.libraryPath ? [parsed.libraryPath] : []),
              multiArtistVersion: parsed.multiArtistVersion ?? 2,
              dsdVersion: parsed.dsdVersion ?? 1,
              tracks: parsed.tracks,
              playlists: parsed.playlists || [],
              preAggregated: parsed.preAggregated || null
            })
            console.log(`[SqliteStorage] Đã di chuyển library cache thành công!`)
          }
          fs.renameSync(libJsonPath, libJsonPath + '.migrated')
        } catch (e) {
          console.warn('[SqliteStorage] Lỗi migrate library-cache.json:', e)
        }
      }

      // 4. Migrate user-playlists.json (nếu có bài chưa được lưu vào user_playlists)
      const userPlaylistsJsonPath = path.join(this.dataFolder, 'user-playlists.json')
      if (fs.existsSync(userPlaylistsJsonPath)) {
        try {
          const raw = fs.readFileSync(userPlaylistsJsonPath, 'utf-8')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) {
            const existingRows = this.getUserPlaylists()
            const existingIds = new Set(existingRows.map((r) => r.id))

            let migratedCount = 0
            for (const pl of parsed) {
              if (pl && pl.id && !existingIds.has(pl.id)) {
                this.saveUserPlaylist(pl)
                migratedCount++
              }
            }
            if (migratedCount > 0) {
              console.log(`[SqliteStorage] Đã di chuyển ${migratedCount} user playlists mới sang SQLite!`)
            }
          }
        } catch (e) {
          console.warn('[SqliteStorage] Lỗi migrate user-playlists.json:', e)
        }
      }
    } catch (err) {
      console.warn('[SqliteStorage] Lỗi chung khi migrate JSON sang SQLite:', err)
    }
  }

  // ==========================================
  // METADATA CACHE APIS
  // ==========================================

  public getMetadata(filePath: string): TrackMetadata | null {
    if (!this.stmtGetMetadata) return null
    try {
      const row = this.stmtGetMetadata.get<{ mtime: number; data_json: string }>(filePath)
      if (row && row.data_json) {
        return {
          mtime: row.mtime,
          data: JSON.parse(row.data_json)
        }
      }
    } catch { /* ignore */ }
    return null
  }

  public setMetadata(filePath: string, mtime: number, data: any): void {
    if (!this.stmtSetMetadata) return
    try {
      this.stmtSetMetadata.run(filePath, mtime, JSON.stringify(data || {}), Date.now())
    } catch (e) {
      console.warn('[SqliteStorage.setMetadata] Error:', e)
    }
  }

  public batchSetMetadata(items: Array<{ filePath: string; mtime: number; data: any }>): void {
    if (!this.db || !this.stmtSetMetadata || items.length === 0) return
    this.db.transaction(() => {
      const now = Date.now()
      for (const item of items) {
        this.stmtSetMetadata?.run(item.filePath, item.mtime, JSON.stringify(item.data || {}), now)
      }
    })
  }

  public getAllMetadata(): Record<string, TrackMetadata> {
    const result: Record<string, TrackMetadata> = {}
    if (!this.db) return result
    try {
      const stmt = this.db.prepare('SELECT file_path, mtime, data_json FROM metadata_cache;')
      const rows = stmt.all<{ file_path: string; mtime: number; data_json: string }>()
      stmt.finalize()
      for (const r of rows) {
        try {
          result[r.file_path] = {
            mtime: r.mtime,
            data: JSON.parse(r.data_json)
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return result
  }

  public getAllMetadataMtimes(): Map<string, number> {
    const map = new Map<string, number>()
    if (!this.db) return map
    try {
      const stmt = this.db.prepare('SELECT file_path, mtime FROM metadata_cache;')
      const rows = stmt.all<{ file_path: string; mtime: number }>()
      stmt.finalize()
      for (const r of rows) {
        map.set(r.file_path, r.mtime)
      }
    } catch { /* ignore */ }
    return map
  }

  public deleteMetadata(filePath: string): void {
    if (!this.stmtDeleteMetadata) return
    try {
      this.stmtDeleteMetadata.run(filePath)
    } catch { /* ignore */ }
  }

  public deleteMetadataByPattern(pattern: string): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare('DELETE FROM metadata_cache WHERE file_path LIKE ?;')
      stmt.run(`%${pattern}%`)
      stmt.finalize()
    } catch { /* ignore */ }
  }

  public cleanupMetadataNotIn(existingPaths: Set<string>): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare('SELECT file_path FROM metadata_cache;')
      const rows = stmt.all<{ file_path: string }>()
      stmt.finalize()

      const toDelete: string[] = []
      for (const r of rows) {
        if (!existingPaths.has(r.file_path)) {
          toDelete.push(r.file_path)
        }
      }

      if (toDelete.length > 0) {
        this.db.transaction(() => {
          const delStmt = this.db!.prepare('DELETE FROM metadata_cache WHERE file_path = ?;')
          for (const p of toDelete) {
            delStmt.run(p)
          }
          delStmt.finalize()
        })
      }
    } catch { /* ignore */ }
  }

  // ==========================================
  // THEME COLORS CACHE APIS
  // ==========================================

  public getThemeColor(key: string): ThemeColors | null {
    if (!this.stmtGetThemeColor) return null
    try {
      const row = this.stmtGetThemeColor.get<{ primary60: string; secondary30: string; accent10: string }>(key)
      if (row && row.primary60) {
        return {
          primary60: row.primary60,
          secondary30: row.secondary30,
          accent10: row.accent10
        }
      }
    } catch { /* ignore */ }
    return null
  }

  public setThemeColor(key: string, colors: ThemeColors): void {
    if (!this.stmtSetThemeColor) return
    try {
      this.stmtSetThemeColor.run(key, colors.primary60, colors.secondary30, colors.accent10, Date.now())
    } catch { /* ignore */ }
  }

  public batchSetThemeColors(items: Array<{ key: string; colors: ThemeColors }>): void {
    if (!this.db || !this.stmtSetThemeColor || items.length === 0) return
    this.db.transaction(() => {
      const now = Date.now()
      for (const item of items) {
        this.stmtSetThemeColor?.run(
          item.key,
          item.colors.primary60,
          item.colors.secondary30,
          item.colors.accent10,
          now
        )
      }
    })
  }

  public getAllThemeColors(): Record<string, ThemeColors> {
    const result: Record<string, ThemeColors> = {}
    if (!this.db) return result
    try {
      const stmt = this.db.prepare('SELECT key, primary60, secondary30, accent10 FROM theme_colors;')
      const rows = stmt.all<{ key: string; primary60: string; secondary30: string; accent10: string }>()
      stmt.finalize()
      for (const r of rows) {
        result[r.key] = {
          primary60: r.primary60,
          secondary30: r.secondary30,
          accent10: r.accent10
        }
      }
    } catch { /* ignore */ }
    return result
  }

  public deleteThemeColor(key: string): void {
    if (!this.stmtDeleteThemeColor) return
    try {
      this.stmtDeleteThemeColor.run(key)
    } catch { /* ignore */ }
  }

  public deleteThemeColorsByPattern(pattern: string): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare('DELETE FROM theme_colors WHERE key LIKE ?;')
      stmt.run(`%${pattern}%`)
      stmt.finalize()
    } catch { /* ignore */ }
  }

  // ==========================================
  // LIBRARY CACHE APIS
  // ==========================================

  public getLibraryCache(): LibraryCacheData | null {
    if (!this.stmtGetLibraryCache) return null
    try {
      const row = this.stmtGetLibraryCache.get<any>('current_library')
      if (row && row.tracks_json) {
        return {
          libraryPath: row.library_path || '',
          libraryPaths: JSON.parse(row.library_paths_json || '[]'),
          multiArtistVersion: row.multi_artist_version || 2,
          dsdVersion: row.dsd_version || 1,
          tracks: JSON.parse(row.tracks_json || '[]'),
          playlists: JSON.parse(row.playlists_json || '[]'),
          preAggregated: row.pre_aggregated_json ? JSON.parse(row.pre_aggregated_json) : null
        }
      }
    } catch (e) {
      console.warn('[SqliteStorage.getLibraryCache] Error reading cache:', e)
    }
    return null
  }

  public setLibraryCache(data: {
    libraryPath: string
    libraryPaths: string[]
    multiArtistVersion?: number
    dsdVersion?: number
    tracks: any[]
    playlists: any[]
    preAggregated: any
  }): void {
    if (!this.db || !this.stmtSetLibraryCache) return

    try {
      const now = Date.now()
      this.db.transaction(() => {
        // 1. Lưu snapshot chính vào library_cache
        this.stmtSetLibraryCache?.run(
          'current_library',
          data.libraryPath,
          JSON.stringify(data.libraryPaths || []),
          data.multiArtistVersion ?? 2,
          data.dsdVersion ?? 1,
          JSON.stringify(data.tracks || []),
          JSON.stringify(data.playlists || []),
          JSON.stringify(data.preAggregated || null),
          now
        )

        // 2. Lưu từng bài hát vào bảng library_tracks để hỗ trợ query/index
        if (this.stmtUpsertTrack && Array.isArray(data.tracks)) {
          for (const t of data.tracks) {
            const trackId = t.id || t.filePath
            if (!trackId) continue
            const hasLyrics = (t.lyrics && String(t.lyrics).trim().length > 0) || t.hasLyrics ? 1 : 0
            const isHiRes = (t.isDsd || (t.sampleRate && t.sampleRate >= 88200) || (t.bitDepth && t.bitDepth >= 24) || t.isHiRes) ? 1 : 0

            this.stmtUpsertTrack.run(
              trackId,
              t.filePath || trackId,
              t.title || '',
              t.artist || '',
              t.album || '',
              t.genre || '',
              t.duration || 0,
              t.year || null,
              t.format || '',
              t.bitrate || 0,
              t.sampleRate || 0,
              t.bitDepth || 0,
              t.isDsd ? 1 : 0,
              hasLyrics,
              isHiRes,
              t.coverArt || null,
              t.themeColors?.primary60 || null,
              t.themeColors?.secondary30 || null,
              t.themeColors?.accent10 || null,
              JSON.stringify(t),
              now
            )
          }
        }
      })
      this.checkpoint('PASSIVE')
    } catch (e) {
      console.warn('[SqliteStorage.setLibraryCache] Error saving cache:', e)
    }
  }

  /**
   * Helper tìm một hàng trong library_tracks theo filePath hoặc id với các dạng URL/Windows path
   */
  private findTrackRow(filePath: string): { id: string; file_path: string; track_json: string } | null {
    if (!this.stmtFindTrackByIdOrPath) return null
    const candidateKeys = getCandidatePathKeys(filePath)
    for (const key of candidateKeys) {
      const row = this.stmtFindTrackByIdOrPath.get<{ id: string; file_path: string; track_json: string }>(key, key)
      if (row) return row
    }

    // Fallback: so khớp targeted theo tên tệp (tránh Full Table Scan SELECT * FROM library_tracks)
    if (this.db) {
      try {
        const basename = path.basename(filePath)
        if (basename) {
          const stmt = this.db.prepare(
            'SELECT id, file_path, track_json FROM library_tracks WHERE file_path LIKE ? OR id LIKE ? LIMIT 10;'
          )
          const rows = stmt.all<{ id: string; file_path: string; track_json: string }>(`%${basename}%`, `%${basename}%`)
          stmt.finalize()
          const normTarget = normalizePathKey(filePath)
          for (const r of rows) {
            if (normalizePathKey(r.file_path) === normTarget || normalizePathKey(r.id) === normTarget) {
              return r
            }
          }
        }
      } catch { /* ignore */ }
    }
    return null
  }

  /**
   * Cập nhật 1 bài hát trong library_tracks, metadata_cache và library_cache với hiệu năng cao O(1)
   */
  public updateSingleTrack(
    filePath: string,
    updates: Record<string, any> | ((track: any) => any),
    rebuildPreAggregatedFn?: (tracks: any[]) => any
  ): boolean {
    if (!this.db || !filePath) return false
    try {
      const now = Date.now()
      const candidateKeys = getCandidatePathKeys(filePath)
      const normTarget = normalizePathKey(filePath)

      return this.db.transaction(() => {
        // 1. Tìm bản ghi bài hát hiện tại trong library_tracks
        const matchedRow = this.findTrackRow(filePath)
        let oldTrack: any = null
        if (matchedRow && matchedRow.track_json) {
          try {
            oldTrack = JSON.parse(matchedRow.track_json)
          } catch { /* ignore */ }
        }

        // Nếu không có trong library_tracks, thử tìm trong metadata_cache
        if (!oldTrack) {
          for (const k of candidateKeys) {
            const meta = this.getMetadata(k)
            if (meta && meta.data) {
              oldTrack = meta.data
              break
            }
          }
        }

        if (!oldTrack) {
          oldTrack = { id: filePath, filePath: filePath }
        }

        // Merge updates
        const mergedTrack = typeof updates === 'function' ? updates(oldTrack) : { ...oldTrack, ...updates }
        const trackId = matchedRow ? matchedRow.id : (mergedTrack.id || filePath)

        // 2. Cập nhật metadata_cache cho file_path
        let matchedMetaKey: string | null = null
        let existingMeta: TrackMetadata | null = null
        for (const k of candidateKeys) {
          const meta = this.getMetadata(k)
          if (meta) {
            matchedMetaKey = k
            existingMeta = meta
            break
          }
        }

        const metaData = typeof updates === 'function' ? mergedTrack : { ...(existingMeta?.data || {}), ...updates }
        const metaMtime = existingMeta ? existingMeta.mtime : (mergedTrack.mtime || now)
        this.stmtSetMetadata?.run(matchedMetaKey || filePath, metaMtime, JSON.stringify(metaData || {}), now)

        // 3. Cập nhật library_tracks
        const hasLyrics = (mergedTrack.lyrics && String(mergedTrack.lyrics).trim().length > 0) || mergedTrack.hasLyrics ? 1 : 0
        const isHiRes = (mergedTrack.isDsd || (mergedTrack.sampleRate && mergedTrack.sampleRate >= 88200) || (mergedTrack.bitDepth && mergedTrack.bitDepth >= 24) || mergedTrack.isHiRes) ? 1 : 0
        const trackJson = JSON.stringify(mergedTrack)

        if (matchedRow && this.stmtUpdateSingleTrack) {
          this.stmtUpdateSingleTrack.run(
            mergedTrack.title || '',
            mergedTrack.artist || '',
            mergedTrack.album || '',
            mergedTrack.duration || 0,
            mergedTrack.format || '',
            mergedTrack.year || null,
            mergedTrack.genre || '',
            hasLyrics,
            isHiRes,
            mergedTrack.sampleRate || 0,
            mergedTrack.bitDepth || 0,
            trackJson,
            now,
            matchedRow.id
          )
        } else if (this.stmtUpsertTrack) {
          this.stmtUpsertTrack.run(
            trackId,
            mergedTrack.filePath || trackId,
            mergedTrack.title || '',
            mergedTrack.artist || '',
            mergedTrack.album || '',
            mergedTrack.genre || '',
            mergedTrack.duration || 0,
            mergedTrack.year || null,
            mergedTrack.format || '',
            mergedTrack.bitrate || 0,
            mergedTrack.sampleRate || 0,
            mergedTrack.bitDepth || 0,
            mergedTrack.isDsd ? 1 : 0,
            hasLyrics,
            isHiRes,
            mergedTrack.coverArt || null,
            mergedTrack.themeColors?.primary60 || null,
            mergedTrack.themeColors?.secondary30 || null,
            mergedTrack.themeColors?.accent10 || null,
            trackJson,
            now
          )
        }

        // 4. Cập nhật library_cache nhẹ nhàng mà không xóa & nạp lại toàn bộ library_tracks
        const cacheRow = this.stmtGetLibraryCache?.get<any>('current_library')
        if (cacheRow && cacheRow.tracks_json) {
          let tracks: any[] = []
          try {
            tracks = JSON.parse(cacheRow.tracks_json || '[]')
          } catch { /* ignore */ }

          if (Array.isArray(tracks)) {
            const idx = tracks.findIndex((t: any) =>
              candidateKeys.has(t.id) ||
              candidateKeys.has(t.filePath) ||
              normalizePathKey(t.id) === normTarget ||
              normalizePathKey(t.filePath) === normTarget
            )
            if (idx !== -1) {
              tracks[idx] = mergedTrack
            } else {
              tracks.push(mergedTrack)
            }

            let preAggregatedJson = cacheRow.pre_aggregated_json || null
            if (rebuildPreAggregatedFn) {
              try {
                const pre = rebuildPreAggregatedFn(tracks)
                preAggregatedJson = JSON.stringify(pre)
              } catch (e) {
                console.warn('[SqliteStorage.updateSingleTrack] rebuildPreAggregatedFn error:', e)
              }
            }

            this.stmtUpdateLibraryCacheTracks?.run(JSON.stringify(tracks), preAggregatedJson, now)
          }
        }

        return true
      })
    } catch (e) {
      console.warn('[SqliteStorage.updateSingleTrack] Error:', e)
      return false
    }
  }

  /**
   * Xóa một danh sách các bài hát khỏi library_tracks, metadata_cache, theme_colors và library_cache trong 1 transaction duy nhất.
   */
  public removeLibraryTracks(filePaths: string[]): void {
    if (!this.db || !Array.isArray(filePaths) || filePaths.length === 0) return

    try {
      this.db.transaction(() => {
        const now = Date.now()
        const keysToRemove = new Set<string>()
        const normalizedKeysToRemove = new Set<string>()

        for (const fp of filePaths) {
          if (!fp) continue
          keysToRemove.add(fp)
          keysToRemove.add(fp.replace(/\\/g, '/'))
          keysToRemove.add(fp.replace(/\//g, '\\'))
          normalizedKeysToRemove.add(normalizePathKey(fp))
          if (fp.startsWith('file://')) {
            try {
              const raw = fileURLToPath(fp)
              keysToRemove.add(raw)
              keysToRemove.add(raw.replace(/\\/g, '/'))
              keysToRemove.add(raw.replace(/\//g, '\\'))
              normalizedKeysToRemove.add(normalizePathKey(raw))
            } catch { /* ignore */ }
          } else {
            try {
              const url = pathToFileURL(fp).href
              keysToRemove.add(url)
              normalizedKeysToRemove.add(normalizePathKey(url))
            } catch { /* ignore */ }
          }
        }

        // Xóa khỏi các bảng
        const delTrackStmt = this.db!.prepare('DELETE FROM library_tracks WHERE id = ? OR file_path = ?;')
        const delMetaStmt = this.db!.prepare('DELETE FROM metadata_cache WHERE file_path = ?;')
        const delColorStmt = this.db!.prepare('DELETE FROM theme_colors WHERE key = ?;')
        const delWaveStmt = this.db!.prepare('DELETE FROM waveform_cache WHERE file_path = ?;')
        const delFavStmt = this.db!.prepare('DELETE FROM favorite_tracks WHERE file_path = ?;')
        const delLyricStmt = this.db!.prepare('DELETE FROM track_lyric_offsets WHERE file_path = ?;')

        for (const k of keysToRemove) {
          delTrackStmt.run(k, k)
          delMetaStmt.run(k)
          delColorStmt.run(k)
          delWaveStmt.run(k)
          delFavStmt.run(k)
          delLyricStmt.run(k)
        }

        delTrackStmt.finalize()
        delMetaStmt.finalize()
        delColorStmt.finalize()
        delWaveStmt.finalize()
        delFavStmt.finalize()
        delLyricStmt.finalize()

        // Cập nhật library_cache
        const row = this.stmtGetLibraryCache?.get<any>('current_library')
        if (row && row.tracks_json) {
          let tracks: any[] = []
          try {
            tracks = JSON.parse(row.tracks_json || '[]')
          } catch { /* ignore */ }

          const remainingTracks = tracks.filter((t: any) => {
            if (!t) return false
            if (keysToRemove.has(t.id) || keysToRemove.has(t.filePath)) return false
            if (normalizedKeysToRemove.has(normalizePathKey(t.id)) || normalizedKeysToRemove.has(normalizePathKey(t.filePath))) return false
            return true
          })

          this.stmtUpdateLibraryCacheTracks?.run(JSON.stringify(remainingTracks), row.pre_aggregated_json, now)
        }
      })
    } catch (e) {
      console.warn('[SqliteStorage.removeLibraryTracks] Error:', e)
    }
  }

  public removeTracksFromLibraryCache(filePaths: string[]): void {
    this.removeLibraryTracks(filePaths)
  }

  /**
   * Xóa tất cả các bài hát thuộc một thư mục tiền tố (tránh lỗi substring ngẫu nhiên của LIKE %pattern%)
   */
  public removeTracksByDirectoryPrefix(dirPath: string): void {
    if (!this.db || !dirPath) return

    try {
      const cleanDir = dirPath.trim().replace(/[/\\]+$/, '')
      const prefixSlash = cleanDir.replace(/\\/g, '/') + '/'
      const prefixBackslash = cleanDir.replace(/\//g, '\\') + '\\'
      let prefixUrl = ''
      try {
        prefixUrl = pathToFileURL(cleanDir).href
        if (!prefixUrl.endsWith('/')) prefixUrl += '/'
      } catch { /* ignore */ }

      this.db.transaction(() => {
        const now = Date.now()

        const delTrack = this.db!.prepare(`
          DELETE FROM library_tracks WHERE
            file_path = ? OR id = ? OR
            file_path LIKE ? OR id LIKE ? OR
            file_path LIKE ? OR id LIKE ? OR
            (length(?) > 0 AND (file_path LIKE ? OR id LIKE ?));
        `)
        delTrack.run(
          cleanDir, cleanDir,
          prefixSlash + '%', prefixSlash + '%',
          prefixBackslash + '%', prefixBackslash + '%',
          prefixUrl, prefixUrl + '%', prefixUrl + '%'
        )
        delTrack.finalize()

        const delMeta = this.db!.prepare(`
          DELETE FROM metadata_cache WHERE
            file_path = ? OR
            file_path LIKE ? OR
            file_path LIKE ? OR
            (length(?) > 0 AND file_path LIKE ?);
        `)
        delMeta.run(cleanDir, prefixSlash + '%', prefixBackslash + '%', prefixUrl, prefixUrl + '%')
        delMeta.finalize()

        const delTheme = this.db!.prepare(`
          DELETE FROM theme_colors WHERE
            key = ? OR
            key LIKE ? OR
            key LIKE ? OR
            (length(?) > 0 AND key LIKE ?);
        `)
        delTheme.run(cleanDir, prefixSlash + '%', prefixBackslash + '%', prefixUrl, prefixUrl + '%')
        delTheme.finalize()

        const delWave = this.db!.prepare(`
          DELETE FROM waveform_cache WHERE
            file_path = ? OR
            file_path LIKE ? OR
            file_path LIKE ? OR
            (length(?) > 0 AND file_path LIKE ?);
        `)
        delWave.run(cleanDir, prefixSlash + '%', prefixBackslash + '%', prefixUrl, prefixUrl + '%')
        delWave.finalize()

        const delFav = this.db!.prepare(`
          DELETE FROM favorite_tracks WHERE
            file_path = ? OR
            file_path LIKE ? OR
            file_path LIKE ? OR
            (length(?) > 0 AND file_path LIKE ?);
        `)
        delFav.run(cleanDir, prefixSlash + '%', prefixBackslash + '%', prefixUrl, prefixUrl + '%')
        delFav.finalize()

        const delLyric = this.db!.prepare(`
          DELETE FROM track_lyric_offsets WHERE
            file_path = ? OR
            file_path LIKE ? OR
            file_path LIKE ? OR
            (length(?) > 0 AND file_path LIKE ?);
        `)
        delLyric.run(cleanDir, prefixSlash + '%', prefixBackslash + '%', prefixUrl, prefixUrl + '%')
        delLyric.finalize()

        // Cập nhật library_cache
        const row = this.stmtGetLibraryCache?.get<any>('current_library')
        if (row && row.tracks_json) {
          let tracks: any[] = []
          try {
            tracks = JSON.parse(row.tracks_json || '[]')
          } catch { /* ignore */ }

          const isUnderDir = (p: string) => {
            if (!p) return false
            if (p === cleanDir) return true
            const normP = p.replace(/\\/g, '/')
            if (normP.startsWith(prefixSlash)) return true
            if (prefixUrl && p.startsWith(prefixUrl)) return true
            return false
          }

          const remainingTracks = tracks.filter((t: any) => {
            if (!t) return false
            if (isUnderDir(t.id) || isUnderDir(t.filePath)) return false
            return true
          })

          this.stmtUpdateLibraryCacheTracks?.run(JSON.stringify(remainingTracks), row.pre_aggregated_json, now)
        }
      })
    } catch (e) {
      console.warn('[SqliteStorage.removeTracksByDirectoryPrefix] Error:', e)
    }
  }

  // ==========================================
  // WAVEFORM CACHE APIS
  // ==========================================

  public getWaveformCache(filePath: string, mtime?: number): number[] | null {
    if (!this.stmtGetWaveform || !filePath) return null
    try {
      const candidateKeys = getCandidatePathKeys(filePath)
      for (const k of candidateKeys) {
        const row = this.stmtGetWaveform.get<{ mtime: number; peaks_json: string }>(k)
        if (row && row.peaks_json) {
          if (mtime !== undefined && row.mtime !== undefined && row.mtime !== null) {
            if (Math.abs(row.mtime - mtime) > 0.001) {
              return null
            }
          }
          return JSON.parse(row.peaks_json)
        }
      }
    } catch (e) {
      console.warn('[SqliteStorage.getWaveformCache] Error:', e)
    }
    return null
  }

  public setWaveformCache(filePath: string, mtime: number, peaks: number[]): void {
    if (!this.stmtSetWaveform || !filePath) return
    try {
      this.stmtSetWaveform.run(filePath, mtime, JSON.stringify(peaks || []), Date.now())
    } catch (e) {
      console.warn('[SqliteStorage.setWaveformCache] Error:', e)
    }
  }

  // ==========================================
  // FAVORITES APIS
  // ==========================================

  public getFavoriteTracks(): string[] {
    if (!this.stmtGetFavorites) return []
    try {
      const rows = this.stmtGetFavorites.all<{ file_path: string }>()
      return rows.map((r) => r.file_path)
    } catch (e) {
      console.warn('[SqliteStorage.getFavoriteTracks] Error:', e)
      return []
    }
  }

  public toggleFavoriteTrack(filePath: string, isFavorite?: boolean): boolean {
    if (!this.db || !filePath) return false
    try {
      const candidateKeys = getCandidatePathKeys(filePath)
      let foundKey: string | null = null
      for (const k of candidateKeys) {
        const row = this.stmtIsFavorite?.get<{ file_path: string }>(k)
        if (row) {
          foundKey = k
          break
        }
      }

      const currentStatus = foundKey !== null
      const targetStatus = isFavorite !== undefined ? isFavorite : !currentStatus

      if (targetStatus) {
        this.stmtAddFavorite?.run(filePath, Date.now())
      } else {
        if (foundKey) {
          this.stmtRemoveFavorite?.run(foundKey)
        }
        this.stmtRemoveFavorite?.run(filePath)
      }
      return targetStatus
    } catch (e) {
      console.warn('[SqliteStorage.toggleFavoriteTrack] Error:', e)
      return false
    }
  }

  public setFavoriteTracks(filePaths: string[]): void {
    if (!this.db || !Array.isArray(filePaths)) return
    try {
      this.db.transaction(() => {
        this.stmtClearFavorites?.run()
        const now = Date.now()
        for (const fp of filePaths) {
          if (fp) {
            this.stmtAddFavorite?.run(fp, now)
          }
        }
      })
    } catch (e) {
      console.warn('[SqliteStorage.setFavoriteTracks] Error:', e)
    }
  }

  // ==========================================
  // TRACK LYRIC OFFSETS APIS
  // ==========================================

  public getTrackLyricOffset(filePath: string): number {
    if (!this.stmtGetLyricOffset || !filePath) return 0
    try {
      const candidateKeys = getCandidatePathKeys(filePath)
      for (const k of candidateKeys) {
        const row = this.stmtGetLyricOffset.get<{ offset_sec: number }>(k)
        if (row && typeof row.offset_sec === 'number') {
          return row.offset_sec
        }
      }
    } catch (e) {
      console.warn('[SqliteStorage.getTrackLyricOffset] Error:', e)
    }
    return 0
  }

  public setTrackLyricOffset(filePath: string, offsetSec: number): void {
    if (!this.stmtSetLyricOffset || !filePath) return
    try {
      this.stmtSetLyricOffset.run(filePath, offsetSec, Date.now())
    } catch (e) {
      console.warn('[SqliteStorage.setTrackLyricOffset] Error:', e)
    }
  }

  public getAllTrackLyricOffsets(): Record<string, number> {
    const result: Record<string, number> = {}
    if (!this.stmtGetAllLyricOffsets) return result
    try {
      const rows = this.stmtGetAllLyricOffsets.all<{ file_path: string; offset_sec: number }>()
      for (const r of rows) {
        result[r.file_path] = r.offset_sec
      }
    } catch (e) {
      console.warn('[SqliteStorage.getAllTrackLyricOffsets] Error:', e)
    }
    return result
  }

  // ==========================================
  // SMART PLAYLISTS APIS
  // ==========================================

  public getSmartPlaylists(): any[] {
    if (!this.stmtGetSmartPlaylists) return []
    try {
      const rows = this.stmtGetSmartPlaylists.all<{
        id: string
        name: string
        rules_json: string
        created_at: number
        updated_at: number
      }>()
      return rows.map((r) => {
        let rules: any[] = []
        try {
          rules = JSON.parse(r.rules_json || '[]')
        } catch { /* ignore */ }
        return {
          id: r.id,
          name: r.name,
          rules,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }
      })
    } catch (e) {
      console.warn('[SqliteStorage.getSmartPlaylists] Error:', e)
      return []
    }
  }

  public saveSmartPlaylist(playlist: any): void {
    if (!this.stmtSaveSmartPlaylist || !playlist) return
    try {
      const id = playlist.id || playlist.name || String(Date.now())
      const name = playlist.name || 'Untitled Playlist'
      const rules = playlist.rules || playlist.rules_json || []
      const rulesJson = typeof rules === 'string' ? rules : JSON.stringify(rules)
      const createdAt = playlist.createdAt || playlist.created_at || Date.now()
      const updatedAt = Date.now()
      this.stmtSaveSmartPlaylist.run(id, name, rulesJson, createdAt, updatedAt)
    } catch (e) {
      console.warn('[SqliteStorage.saveSmartPlaylist] Error:', e)
    }
  }

  public deleteSmartPlaylist(id: string): void {
    if (!this.stmtDeleteSmartPlaylist || !id) return
    try {
      this.stmtDeleteSmartPlaylist.run(id)
    } catch (e) {
      console.warn('[SqliteStorage.deleteSmartPlaylist] Error:', e)
    }
  }

  // ==========================================
  // USER VIRTUAL PLAYLISTS APIS
  // ==========================================

  public getUserPlaylists(): any[] {
    if (!this.stmtGetUserPlaylists) return []
    try {
      const rows = this.stmtGetUserPlaylists.all<{
        id: string
        name: string
        description: string | null
        tracks_json: string
        cover_art: string | null
        created_at: number | null
        updated_at: number | null
      }>()
      return rows.map((r) => {
        let tracks: any[] = []
        try {
          tracks = JSON.parse(r.tracks_json || '[]')
        } catch { /* ignore */ }
        return {
          id: r.id,
          name: r.name,
          description: r.description || '',
          tracks,
          trackIds: tracks,
          coverArt: r.cover_art,
          thumbnail: r.cover_art,
          createdAt: r.created_at || r.updated_at || Date.now(),
          updatedAt: r.updated_at || Date.now()
        }
      })
    } catch (e) {
      console.warn('[SqliteStorage.getUserPlaylists] Error:', e)
      return []
    }
  }

  public saveUserPlaylist(playlist: any): void {
    if (!this.stmtSaveUserPlaylist || !playlist) return
    try {
      const id = playlist.id || playlist.name || String(Date.now())
      const name = playlist.name || 'Untitled Playlist'
      const description = playlist.description || ''
      const rawTracks =
        playlist.tracks !== undefined
          ? playlist.tracks
          : playlist.trackIds !== undefined
            ? playlist.trackIds
            : playlist.tracks_json || []
      const tracksJson = typeof rawTracks === 'string' ? rawTracks : JSON.stringify(rawTracks)
      const coverArt = playlist.coverArt || playlist.cover_art || playlist.thumbnail || null
      const createdAt = playlist.createdAt || playlist.created_at || Date.now()
      const updatedAt = playlist.updatedAt || playlist.updated_at || Date.now()
      this.stmtSaveUserPlaylist.run(id, name, description, tracksJson, coverArt, createdAt, updatedAt)
    } catch (e) {
      console.warn('[SqliteStorage.saveUserPlaylist] Error:', e)
    }
  }

  public deleteUserPlaylist(id: string): void {
    if (!this.stmtDeleteUserPlaylist || !id) return
    try {
      this.stmtDeleteUserPlaylist.run(id)
    } catch (e) {
      console.warn('[SqliteStorage.deleteUserPlaylist] Error:', e)
    }
  }

  // ==========================================
  // ONLINE LYRICS CACHE APIS
  // ==========================================

  public getOnlineLyric(key: string): { lyrics: string; isSynced: boolean; source: string } | null {
    if (!this.stmtGetOnlineLyric || !key) return null
    try {
      const row = this.stmtGetOnlineLyric.get<{
        lyrics: string
        is_synced: number
        source: string
      }>(key)
      if (row && row.lyrics) {
        return {
          lyrics: row.lyrics,
          isSynced: Boolean(row.is_synced),
          source: row.source || 'lrclib'
        }
      }
    } catch (e) {
      console.warn('[SqliteStorage.getOnlineLyric] Error:', e)
    }
    return null
  }

  public setOnlineLyric(
    key: string,
    title: string,
    artist: string,
    lyrics: string,
    isSynced: boolean,
    source: string
  ): void {
    if (!this.stmtSetOnlineLyric || !key || !lyrics) return
    try {
      this.stmtSetOnlineLyric.run(
        key,
        title || '',
        artist || '',
        lyrics,
        isSynced ? 1 : 0,
        source || 'lrclib',
        Date.now()
      )
    } catch (e) {
      console.warn('[SqliteStorage.setOnlineLyric] Error:', e)
    }
  }

  public clearOnlineLyrics(): void {
    if (!this.stmtClearOnlineLyrics) return
    try {
      this.stmtClearOnlineLyrics.run()
    } catch (e) {
      console.warn('[SqliteStorage.clearOnlineLyrics] Error:', e)
    }
  }

  public recordPlayEvent(event: PlayEventInput): number {
    if (!this.db || !event || !event.filePath) return 0
    const playedAt = event.playedAt && event.playedAt > 0 ? event.playedAt : Date.now()
    const durationSec = typeof event.durationSec === 'number' && !isNaN(event.durationSec) ? Math.max(0, event.durationSec) : 0
    const isLossless = event.isLossless ? 1 : 0
    const isDsd = event.isDsd ? 1 : 0
    const audioMode = event.audioMode || 'webaudio'

    let insertedId = 0
    try {
      this.stmtRecordPlayEvent?.run(
        event.filePath,
        event.title || '',
        event.artist || '',
        event.album || '',
        event.genre || '',
        event.format || '',
        event.sampleRate || 0,
        event.bitDepth || 0,
        isLossless,
        isDsd,
        audioMode,
        durationSec,
        playedAt
      )
      insertedId = this.db.lastInsertRowid()
    } catch (err) {
      console.error('[SqliteStorage] Error recording play event:', err)
    }

    // Luôn đồng bộ với play_stats
    this.incrementPlayStat(event.filePath, durationSec)
    return insertedId
  }

  public updatePlayEventDuration(eventId: number, durationSec: number, filePath?: string): void {
    if (!this.db || !eventId || eventId <= 0) return
    const dur = typeof durationSec === 'number' && !isNaN(durationSec) ? Math.max(0, durationSec) : 0
    try {
      let prevDur = 0
      let fPath = filePath
      const row = this.stmtGetPlayEventById?.get<{ id: number; file_path: string; duration_sec: number }>(eventId)
      if (row) {
        prevDur = typeof row.duration_sec === 'number' && !isNaN(row.duration_sec) ? row.duration_sec : 0
        if (!fPath) fPath = row.file_path
      }

      this.stmtUpdatePlayEventDuration?.run(dur, eventId)

      if (fPath) {
        const delta = dur - prevDur
        if (delta !== 0) {
          this.stmtUpdatePlayStatDuration?.run(delta, Date.now(), fPath)
        }
      }
    } catch (err) {
      console.error('[SqliteStorage] Error updating play event duration:', err)
    }
  }

  public incrementPlayStat(filePath: string, durationSec: number = 0): void {
    if (!this.db || !filePath) return
    const now = Date.now()
    const dur = typeof durationSec === 'number' && !isNaN(durationSec) ? durationSec : 0
    try {
      this.stmtIncrementPlayStat?.run(filePath, dur, now)
    } catch (err) {
      console.error('[SqliteStorage] Error incrementing play stat:', err)
    }
  }

  public getAdvancedListeningStats(rangeDays?: number): AdvancedListeningStats {
    const emptyStats: AdvancedListeningStats = {
      overview: {
        totalPlays: 0,
        totalListenSeconds: 0,
        uniqueTracks: 0,
        uniqueArtists: 0,
        uniqueAlbums: 0,
        losslessRatio: 0,
        hiResRatio: 0,
        dsdPlays: 0,
        bitPerfectRatio: 0
      },
      hourlyDistribution: new Array(24).fill(0),
      weekdayDistribution: new Array(7).fill(0),
      dailyActivity: [],
      topArtists: [],
      topAlbums: [],
      topGenres: [],
      formatBreakdown: [],
      topTracks: []
    }

    if (!this.db) return emptyStats

    try {
      const isFiltered = typeof rangeDays === 'number' && rangeDays > 0
      const sinceTime = isFiltered ? Date.now() - rangeDays * 86400 * 1000 : 0

      let rows: any[] = []
      if (isFiltered) {
        const stmt = this.db.prepare(`
          SELECT file_path, title, artist, album, genre, format,
                 sample_rate, bit_depth, is_lossless, is_dsd, audio_mode, duration_sec, played_at
          FROM play_events
          WHERE played_at >= ?
          ORDER BY played_at ASC;
        `)
        try {
          rows = stmt.all(sinceTime)
        } finally {
          stmt.finalize()
        }
      } else {
        const stmt = this.db.prepare(`
          SELECT file_path, title, artist, album, genre, format,
                 sample_rate, bit_depth, is_lossless, is_dsd, audio_mode, duration_sec, played_at
          FROM play_events
          ORDER BY played_at ASC;
        `)
        try {
          rows = stmt.all()
        } finally {
          stmt.finalize()
        }
      }

      // Fallback: Nếu play_events rỗng (do mới tạo bảng hoặc chưa nghe), kết hợp play_stats + library_tracks
      if (rows.length === 0) {
        const fallbackQuery = `
          SELECT ps.file_path, ps.play_count, ps.total_duration as duration_sec, ps.last_played as played_at,
                 lt.title, lt.artist, lt.album, lt.genre, lt.format, lt.sample_rate, lt.bit_depth, lt.is_dsd, lt.is_hi_res
          FROM play_stats ps
          LEFT JOIN library_tracks lt ON ps.file_path = lt.file_path
          ${isFiltered ? 'WHERE ps.last_played >= ?' : ''}
          ORDER BY ps.play_count DESC;
        `
        const fallbackStmt = this.db.prepare(fallbackQuery)
        let fallbackRows: any[] = []
        try {
          fallbackRows = isFiltered
            ? fallbackStmt.all(sinceTime)
            : fallbackStmt.all()
        } finally {
          fallbackStmt.finalize()
        }

        if (fallbackRows && fallbackRows.length > 0) {
          return this.aggregateFallbackStats(fallbackRows, rangeDays)
        } else {
          return {
            ...emptyStats,
            dailyActivity: this.generateEmptyDailyActivity(rangeDays)
          }
        }
      }

      return this.aggregatePlayEventsStats(rows, rangeDays)
    } catch (err) {
      console.error('[SqliteStorage] Error getting advanced listening stats:', err)
      return emptyStats
    }
  }

  private aggregatePlayEventsStats(rows: any[], rangeDays?: number): AdvancedListeningStats {
    const totalPlays = rows.length
    let totalListenSeconds = 0
    let losslessCount = 0
    let hiResCount = 0
    let dsdPlays = 0
    let bitPerfectCount = 0

    const uniqueTracksSet = new Set<string>()
    const uniqueArtistsSet = new Set<string>()
    const uniqueAlbumsSet = new Set<string>()

    const hourlyDistribution = new Array(24).fill(0)
    const weekdayDistribution = new Array(7).fill(0)
    const dailyMap = this.createDailyMap(rangeDays)

    const artistMap = new Map<string, { plays: number; totalSeconds: number }>()
    const albumMap = new Map<string, { name: string; artist: string; plays: number; totalSeconds: number }>()
    const genreMap = new Map<string, number>()
    let totalGenrePlays = 0
    const formatMap = new Map<string, number>()
    const trackMap = new Map<string, {
      filePath: string
      title: string
      artist: string
      album: string
      format: string
      plays: number
      totalSeconds: number
      lastPlayed: number
    }>()

    for (const r of rows) {
      const dur = typeof r.duration_sec === 'number' && !isNaN(r.duration_sec) ? r.duration_sec : 0
      totalListenSeconds += dur

      const playedAt = r.played_at || Date.now()
      const d = new Date(playedAt)

      const hr = d.getHours()
      if (hr >= 0 && hr < 24) hourlyDistribution[hr]++

      const wDay = d.getDay()
      if (wDay >= 0 && wDay < 7) weekdayDistribution[wDay]++

      const dateKey = this.formatDateKey(d)
      if (dailyMap.has(dateKey)) {
        const item = dailyMap.get(dateKey)!
        item.plays++
        item.seconds += dur
      }

      if (r.file_path) uniqueTracksSet.add(r.file_path)
      const cleanArtist = (r.artist || '').trim()
      if (cleanArtist && cleanArtist.toLowerCase() !== 'unknown artist' && cleanArtist.toLowerCase() !== 'unknown') {
        uniqueArtistsSet.add(cleanArtist)
      }
      const cleanAlbum = (r.album || '').trim()
      if (cleanAlbum && cleanAlbum.toLowerCase() !== 'unknown album' && cleanAlbum.toLowerCase() !== 'unknown') {
        uniqueAlbumsSet.add(`${cleanArtist}:::${cleanAlbum}`)
      }

      const fmt = this.normalizeFormat(r.format, r.is_dsd, r.file_path)
      formatMap.set(fmt, (formatMap.get(fmt) || 0) + 1)

      const isDsd = Boolean(r.is_dsd || ['DSF', 'DFF', 'DSD'].includes((r.format || '').toUpperCase()))
      if (isDsd) dsdPlays++

      const isLossless = Boolean(
        r.is_lossless ||
        isDsd ||
        ['FLAC', 'WAV', 'AIFF', 'APE', 'WV', 'ALAC'].includes((r.format || '').toUpperCase())
      )
      if (isLossless) losslessCount++

      const isHiRes = Boolean(
        isDsd ||
        (r.sample_rate && r.sample_rate > 48000) ||
        (r.bit_depth && r.bit_depth > 16)
      )
      if (isHiRes) hiResCount++

      const isBitPerfect = Boolean(
        r.audio_mode && (r.audio_mode === 'bitperfect' || r.audio_mode === 'wasapi' || r.audio_mode === 'asio' || r.audio_mode === 'bass')
      )
      if (isBitPerfect) bitPerfectCount++

      if (cleanArtist && cleanArtist.toLowerCase() !== 'unknown artist' && cleanArtist.toLowerCase() !== 'unknown') {
        const item = artistMap.get(cleanArtist) || { plays: 0, totalSeconds: 0 }
        item.plays++
        item.totalSeconds += dur
        artistMap.set(cleanArtist, item)
      }

      if (cleanAlbum && cleanAlbum.toLowerCase() !== 'unknown album' && cleanAlbum.toLowerCase() !== 'unknown') {
        const albumKey = `${cleanArtist}:::${cleanAlbum}`
        const item = albumMap.get(albumKey) || { name: cleanAlbum, artist: cleanArtist || 'Unknown Artist', plays: 0, totalSeconds: 0 }
        item.plays++
        item.totalSeconds += dur
        albumMap.set(albumKey, item)
      }

      const cleanGenre = (r.genre || '').trim()
      if (cleanGenre && cleanGenre.toLowerCase() !== 'unknown' && cleanGenre.toLowerCase() !== 'không rõ') {
        genreMap.set(cleanGenre, (genreMap.get(cleanGenre) || 0) + 1)
        totalGenrePlays++
      }

      const trackKey = r.file_path || `${r.title || ''}-${cleanArtist}`
      if (trackMap.has(trackKey)) {
        const trk = trackMap.get(trackKey)!
        trk.plays++
        trk.totalSeconds += dur
        if (playedAt > trk.lastPlayed) trk.lastPlayed = playedAt
      } else {
        trackMap.set(trackKey, {
          filePath: r.file_path,
          title: r.title || path.basename(r.file_path || 'Unknown'),
          artist: cleanArtist || 'Unknown Artist',
          album: cleanAlbum || 'Unknown Album',
          format: fmt,
          plays: 1,
          totalSeconds: dur,
          lastPlayed: playedAt
        })
      }
    }

    const topArtists = Array.from(artistMap.entries())
      .sort((a, b) => b[1].plays - a[1].plays || b[1].totalSeconds - a[1].totalSeconds)
      .slice(0, 10)
      .map(([name, data]) => ({
        name,
        plays: data.plays,
        totalSeconds: Math.round(data.totalSeconds)
      }))

    const topAlbums = Array.from(albumMap.values())
      .sort((a, b) => b.plays - a.plays || b.totalSeconds - a.totalSeconds)
      .slice(0, 10)
      .map((data) => ({
        name: data.name,
        artist: data.artist,
        plays: data.plays,
        totalSeconds: Math.round(data.totalSeconds)
      }))

    const topGenres = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, plays]) => ({
        name,
        plays,
        percentage: totalGenrePlays > 0 ? Math.round((plays / totalGenrePlays) * 1000) / 10 : 0
      }))

    const formatBreakdown = Array.from(formatMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([format, count]) => ({
        format,
        count,
        percentage: totalPlays > 0 ? Math.round((count / totalPlays) * 1000) / 10 : 0
      }))

    const topTracks = Array.from(trackMap.values())
      .sort((a, b) => b.plays - a.plays || b.totalSeconds - a.totalSeconds)
      .slice(0, 15)
      .map((t) => ({ ...t, totalSeconds: Math.round(t.totalSeconds) }))

    const dailyActivity = Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      plays: val.plays,
      minutes: Math.round((val.seconds / 60) * 10) / 10
    }))

    return {
      overview: {
        totalPlays,
        totalListenSeconds: Math.round(totalListenSeconds),
        uniqueTracks: uniqueTracksSet.size,
        uniqueArtists: uniqueArtistsSet.size,
        uniqueAlbums: uniqueAlbumsSet.size,
        losslessRatio: totalPlays > 0 ? Number((losslessCount / totalPlays).toFixed(3)) : 0,
        hiResRatio: totalPlays > 0 ? Number((hiResCount / totalPlays).toFixed(3)) : 0,
        dsdPlays,
        bitPerfectRatio: totalPlays > 0 ? Number((bitPerfectCount / totalPlays).toFixed(3)) : 0
      },
      hourlyDistribution,
      weekdayDistribution,
      dailyActivity,
      topArtists,
      topAlbums,
      topGenres,
      formatBreakdown,
      topTracks
    }
  }

  private aggregateFallbackStats(rows: any[], rangeDays?: number): AdvancedListeningStats {
    let totalPlays = 0
    let totalListenSeconds = 0
    let losslessCount = 0
    let hiResCount = 0
    let dsdPlays = 0
    let bitPerfectCount = 0

    const uniqueTracksSet = new Set<string>()
    const uniqueArtistsSet = new Set<string>()
    const uniqueAlbumsSet = new Set<string>()

    const hourlyDistribution = new Array(24).fill(0)
    const weekdayDistribution = new Array(7).fill(0)
    const dailyMap = this.createDailyMap(rangeDays)

    const artistMap = new Map<string, { plays: number; totalSeconds: number }>()
    const albumMap = new Map<string, { name: string; artist: string; plays: number; totalSeconds: number }>()
    const genreMap = new Map<string, number>()
    let totalGenrePlays = 0
    const formatMap = new Map<string, number>()
    const trackMap = new Map<string, {
      filePath: string
      title: string
      artist: string
      album: string
      format: string
      plays: number
      totalSeconds: number
      lastPlayed: number
    }>()

    for (const r of rows) {
      const p = r.play_count || 1
      const dur = typeof r.duration_sec === 'number' && !isNaN(r.duration_sec) ? r.duration_sec : 0
      totalPlays += p
      totalListenSeconds += dur

      const playedAt = r.played_at || 0
      if (playedAt > 0) {
        const d = new Date(playedAt)
        const hr = d.getHours()
        if (hr >= 0 && hr < 24) hourlyDistribution[hr] += p
        const wDay = d.getDay()
        if (wDay >= 0 && wDay < 7) weekdayDistribution[wDay] += p
        const dateKey = this.formatDateKey(d)
        if (dailyMap.has(dateKey)) {
          const item = dailyMap.get(dateKey)!
          item.plays += p
          item.seconds += dur
        }
      }

      if (r.file_path) uniqueTracksSet.add(r.file_path)
      const cleanArtist = (r.artist || '').trim()
      if (cleanArtist && cleanArtist.toLowerCase() !== 'unknown artist' && cleanArtist.toLowerCase() !== 'unknown') {
        uniqueArtistsSet.add(cleanArtist)
      }
      const cleanAlbum = (r.album || '').trim()
      if (cleanAlbum && cleanAlbum.toLowerCase() !== 'unknown album' && cleanAlbum.toLowerCase() !== 'unknown') {
        uniqueAlbumsSet.add(`${cleanArtist}:::${cleanAlbum}`)
      }

      const fmt = this.normalizeFormat(r.format, r.is_dsd, r.file_path)
      formatMap.set(fmt, (formatMap.get(fmt) || 0) + p)

      const isDsd = Boolean(r.is_dsd || ['DSF', 'DFF', 'DSD'].includes((r.format || '').toUpperCase()))
      if (isDsd) dsdPlays += p

      const isLossless = Boolean(
        isDsd ||
        ['FLAC', 'WAV', 'AIFF', 'APE', 'WV', 'ALAC'].includes((r.format || '').toUpperCase())
      )
      if (isLossless) losslessCount += p

      const isHiRes = Boolean(
        r.is_hi_res ||
        isDsd ||
        (r.sample_rate && r.sample_rate > 48000) ||
        (r.bit_depth && r.bit_depth > 16)
      )
      if (isHiRes) hiResCount += p

      if (isDsd || isHiRes) bitPerfectCount += p

      if (cleanArtist && cleanArtist.toLowerCase() !== 'unknown artist' && cleanArtist.toLowerCase() !== 'unknown') {
        const item = artistMap.get(cleanArtist) || { plays: 0, totalSeconds: 0 }
        item.plays += p
        item.totalSeconds += dur
        artistMap.set(cleanArtist, item)
      }

      if (cleanAlbum && cleanAlbum.toLowerCase() !== 'unknown album' && cleanAlbum.toLowerCase() !== 'unknown') {
        const albumKey = `${cleanArtist}:::${cleanAlbum}`
        const item = albumMap.get(albumKey) || { name: cleanAlbum, artist: cleanArtist || 'Unknown Artist', plays: 0, totalSeconds: 0 }
        item.plays += p
        item.totalSeconds += dur
        albumMap.set(albumKey, item)
      }

      const cleanGenre = (r.genre || '').trim()
      if (cleanGenre && cleanGenre.toLowerCase() !== 'unknown' && cleanGenre.toLowerCase() !== 'không rõ') {
        genreMap.set(cleanGenre, (genreMap.get(cleanGenre) || 0) + p)
        totalGenrePlays += p
      }

      const trackKey = r.file_path || `${r.title || ''}-${cleanArtist}`
      trackMap.set(trackKey, {
        filePath: r.file_path,
        title: r.title || path.basename(r.file_path || 'Unknown'),
        artist: cleanArtist || 'Unknown Artist',
        album: cleanAlbum || 'Unknown Album',
        format: fmt,
        plays: p,
        totalSeconds: dur,
        lastPlayed: playedAt
      })
    }

    const topArtists = Array.from(artistMap.entries())
      .sort((a, b) => b[1].plays - a[1].plays || b[1].totalSeconds - a[1].totalSeconds)
      .slice(0, 10)
      .map(([name, data]) => ({
        name,
        plays: data.plays,
        totalSeconds: Math.round(data.totalSeconds)
      }))

    const topAlbums = Array.from(albumMap.values())
      .sort((a, b) => b.plays - a.plays || b.totalSeconds - a.totalSeconds)
      .slice(0, 10)
      .map((data) => ({
        name: data.name,
        artist: data.artist,
        plays: data.plays,
        totalSeconds: Math.round(data.totalSeconds)
      }))

    const topGenres = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, plays]) => ({
        name,
        plays,
        percentage: totalGenrePlays > 0 ? Math.round((plays / totalGenrePlays) * 1000) / 10 : 0
      }))

    const formatBreakdown = Array.from(formatMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([format, count]) => ({
        format,
        count,
        percentage: totalPlays > 0 ? Math.round((count / totalPlays) * 1000) / 10 : 0
      }))

    const topTracks = Array.from(trackMap.values())
      .sort((a, b) => b.plays - a.plays || b.totalSeconds - a.totalSeconds)
      .slice(0, 15)
      .map((t) => ({ ...t, totalSeconds: Math.round(t.totalSeconds) }))

    const dailyActivity = Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      plays: val.plays,
      minutes: Math.round((val.seconds / 60) * 10) / 10
    }))

    return {
      overview: {
        totalPlays,
        totalListenSeconds: Math.round(totalListenSeconds),
        uniqueTracks: uniqueTracksSet.size,
        uniqueArtists: uniqueArtistsSet.size,
        uniqueAlbums: uniqueAlbumsSet.size,
        losslessRatio: totalPlays > 0 ? Number((losslessCount / totalPlays).toFixed(3)) : 0,
        hiResRatio: totalPlays > 0 ? Number((hiResCount / totalPlays).toFixed(3)) : 0,
        dsdPlays,
        bitPerfectRatio: totalPlays > 0 ? Number((bitPerfectCount / totalPlays).toFixed(3)) : 0
      },
      hourlyDistribution,
      weekdayDistribution,
      dailyActivity,
      topArtists,
      topAlbums,
      topGenres,
      formatBreakdown,
      topTracks
    }
  }

  private formatDateKey(d: Date): string {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  private createDailyMap(rangeDays?: number): Map<string, { plays: number; seconds: number }> {
    const numDays = typeof rangeDays === 'number' && rangeDays > 0 ? Math.min(rangeDays, 30) : 30
    const map = new Map<string, { plays: number; seconds: number }>()
    const now = new Date()
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      map.set(this.formatDateKey(d), { plays: 0, seconds: 0 })
    }
    return map
  }

  private generateEmptyDailyActivity(rangeDays?: number): { date: string; plays: number; minutes: number }[] {
    const map = this.createDailyMap(rangeDays)
    return Array.from(map.entries()).map(([date]) => ({ date, plays: 0, minutes: 0 }))
  }

  private normalizeFormat(fmt?: string, isDsd?: boolean | number, filePath?: string): string {
    if (isDsd) return 'DSD/DSF'
    const f = (fmt || '').toUpperCase().trim()
    const ext = filePath ? path.extname(filePath).replace('.', '').toUpperCase().trim() : ''
    const target = f || ext
    if (['DSF', 'DFF', 'DSD'].includes(target)) return 'DSD/DSF'
    if (target === 'FLAC') return 'FLAC'
    if (target === 'MP3') return 'MP3'
    if (target === 'WAV') return 'WAV'
    if (['M4A', 'AAC', 'ALAC', 'MP4'].includes(target)) return 'M4A/AAC'
    if (['OGG', 'OPUS'].includes(target)) return 'OGG/Opus'
    if (['APE', 'WV', 'AIFF', 'AIF'].includes(target)) return 'Hi-Res Lossless'
    if (filePath && (filePath.startsWith('http://') || filePath.startsWith('https://'))) return 'Online Stream'
    return target || 'Other'
  }

  public close(): void {
    if (this.db) {
      try {
        this.stmtGetMetadata?.finalize()
        this.stmtSetMetadata?.finalize()
        this.stmtDeleteMetadata?.finalize()

        this.stmtGetThemeColor?.finalize()
        this.stmtSetThemeColor?.finalize()
        this.stmtDeleteThemeColor?.finalize()

        this.stmtGetLibraryCache?.finalize()
        this.stmtSetLibraryCache?.finalize()
        this.stmtUpdateLibraryCacheTracks?.finalize()

        this.stmtUpsertTrack?.finalize()
        this.stmtFindTrackByIdOrPath?.finalize()
        this.stmtUpdateSingleTrack?.finalize()

        this.stmtGetWaveform?.finalize()
        this.stmtSetWaveform?.finalize()

        this.stmtGetFavorites?.finalize()
        this.stmtIsFavorite?.finalize()
        this.stmtAddFavorite?.finalize()
        this.stmtRemoveFavorite?.finalize()
        this.stmtClearFavorites?.finalize()

        this.stmtGetLyricOffset?.finalize()
        this.stmtSetLyricOffset?.finalize()
        this.stmtGetAllLyricOffsets?.finalize()

        this.stmtGetSmartPlaylists?.finalize()
        this.stmtSaveSmartPlaylist?.finalize()
        this.stmtDeleteSmartPlaylist?.finalize()

        this.stmtGetUserPlaylists?.finalize()
        this.stmtSaveUserPlaylist?.finalize()
        this.stmtDeleteUserPlaylist?.finalize()

        this.stmtGetOnlineLyric?.finalize()
        this.stmtSetOnlineLyric?.finalize()
        this.stmtClearOnlineLyrics?.finalize()

        this.stmtRecordPlayEvent?.finalize()
        this.stmtUpdatePlayEventDuration?.finalize()
        this.stmtGetPlayEventById?.finalize()
        this.stmtIncrementPlayStat?.finalize()
        this.stmtUpdatePlayStatDuration?.finalize()

        this.db.close()
      } catch { /* ignore */ }
      this.db = null
    }

    if (activeSqliteStorage === this) {
      activeSqliteStorage = null
    }
  }
}

// ==========================================
// STANDALONE EXPORT FUNCTIONS (FORWARDING TO ACTIVE INSTANCE)
// ==========================================

export function getWaveformCache(filePath: string, mtime?: number): number[] | null {
  return activeSqliteStorage ? activeSqliteStorage.getWaveformCache(filePath, mtime) : null
}

export function setWaveformCache(filePath: string, mtime: number, peaks: number[]): void {
  activeSqliteStorage?.setWaveformCache(filePath, mtime, peaks)
}

export function getFavoriteTracks(): string[] {
  return activeSqliteStorage ? activeSqliteStorage.getFavoriteTracks() : []
}

export function toggleFavoriteTrack(filePath: string, isFavorite?: boolean): boolean {
  return activeSqliteStorage ? activeSqliteStorage.toggleFavoriteTrack(filePath, isFavorite) : false
}

export function setFavoriteTracks(filePaths: string[]): void {
  activeSqliteStorage?.setFavoriteTracks(filePaths)
}

export function getTrackLyricOffset(filePath: string): number {
  return activeSqliteStorage ? activeSqliteStorage.getTrackLyricOffset(filePath) : 0
}

export function setTrackLyricOffset(filePath: string, offsetSec: number): void {
  activeSqliteStorage?.setTrackLyricOffset(filePath, offsetSec)
}

export function getAllTrackLyricOffsets(): Record<string, number> {
  return activeSqliteStorage ? activeSqliteStorage.getAllTrackLyricOffsets() : {}
}

export function getSmartPlaylists(): any[] {
  return activeSqliteStorage ? activeSqliteStorage.getSmartPlaylists() : []
}

export function saveSmartPlaylist(playlist: any): void {
  activeSqliteStorage?.saveSmartPlaylist(playlist)
}

export function deleteSmartPlaylist(id: string): void {
  activeSqliteStorage?.deleteSmartPlaylist(id)
}

export function getUserPlaylists(): any[] {
  return activeSqliteStorage ? activeSqliteStorage.getUserPlaylists() : []
}

export function saveUserPlaylist(playlist: any): void {
  activeSqliteStorage?.saveUserPlaylist(playlist)
}

export function deleteUserPlaylist(id: string): void {
  activeSqliteStorage?.deleteUserPlaylist(id)
}

export function updateSingleTrack(
  filePath: string,
  updates: Record<string, any> | ((track: any) => any),
  rebuildPreAggregatedFn?: (tracks: any[]) => any
): boolean {
  return activeSqliteStorage ? activeSqliteStorage.updateSingleTrack(filePath, updates, rebuildPreAggregatedFn) : false
}

export function removeLibraryTracks(filePaths: string[]): void {
  activeSqliteStorage?.removeLibraryTracks(filePaths)
}

export function removeTracksFromLibraryCache(filePaths: string[]): void {
  activeSqliteStorage?.removeTracksFromLibraryCache(filePaths)
}

export function removeTracksByDirectoryPrefix(dirPath: string): void {
  activeSqliteStorage?.removeTracksByDirectoryPrefix(dirPath)
}

export function getOnlineLyric(key: string): { lyrics: string; isSynced: boolean; source: string } | null {
  return activeSqliteStorage ? activeSqliteStorage.getOnlineLyric(key) : null
}

export function setOnlineLyric(
  key: string,
  title: string,
  artist: string,
  lyrics: string,
  isSynced: boolean,
  source: string
): void {
  activeSqliteStorage?.setOnlineLyric(key, title, artist, lyrics, isSynced, source)
}

export function clearOnlineLyrics(): void {
  activeSqliteStorage?.clearOnlineLyrics()
}

export function recordPlayEvent(event: PlayEventInput): number {
  return activeSqliteStorage ? activeSqliteStorage.recordPlayEvent(event) : 0
}

export function updatePlayEventDuration(eventId: number, durationSec: number, filePath?: string): void {
  activeSqliteStorage?.updatePlayEventDuration(eventId, durationSec, filePath)
}

export function incrementPlayStat(filePath: string, durationSec?: number): void {
  activeSqliteStorage?.incrementPlayStat(filePath, durationSec)
}

export function getAdvancedListeningStats(rangeDays?: number): AdvancedListeningStats {
  return activeSqliteStorage
    ? activeSqliteStorage.getAdvancedListeningStats(rangeDays)
    : {
        overview: {
          totalPlays: 0,
          totalListenSeconds: 0,
          uniqueTracks: 0,
          uniqueArtists: 0,
          uniqueAlbums: 0,
          losslessRatio: 0,
          hiResRatio: 0,
          dsdPlays: 0,
          bitPerfectRatio: 0
        },
        hourlyDistribution: new Array(24).fill(0),
        weekdayDistribution: new Array(7).fill(0),
        dailyActivity: [],
        topArtists: [],
        topAlbums: [],
        topGenres: [],
        formatBreakdown: [],
        topTracks: []
      }
}
