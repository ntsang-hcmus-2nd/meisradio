/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs'
import path from 'path'
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
    this._bind_int64 = this.lib.func('int64 sqlite3_bind_int64(void *stmt, int iCol, int64 val)')
    this._bind_null = this.lib.func('int sqlite3_bind_null(void *stmt, int iCol)')
    this._changes = this.lib.func('int sqlite3_changes(void *db)')

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
          row[name] = this.driver._colInt(this.stmt, i)
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
          row[name] = this.driver._colInt(this.stmt, i)
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

  private stmtUpsertTrack: KoffiPreparedStatement | null = null

  constructor(dataFolder: string) {
    this.dataFolder = dataFolder
    const dbPath = path.join(dataFolder, 'library.db')
    const dllPath = this.resolveSqliteDll()

    this.db = new KoffiSqlite3(dllPath, dbPath)
    this.initDatabase()
    this.prepareStatements()
    this.migrateExistingJsonFiles()
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

    // Tối ưu hóa hiệu năng và độ an toàn
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -8000;

      -- 1. Metadata cache: metadata của từng file âm thanh (thay thế metadata-cache.json)
      CREATE TABLE IF NOT EXISTS metadata_cache (
        file_path TEXT PRIMARY KEY,
        mtime REAL NOT NULL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_metadata_mtime ON metadata_cache(mtime);

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
        cover_art TEXT,
        theme_primary TEXT,
        theme_secondary TEXT,
        theme_accent TEXT,
        track_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lib_tracks_artist ON library_tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_lib_tracks_album ON library_tracks(album);
      CREATE INDEX IF NOT EXISTS idx_lib_tracks_genre ON library_tracks(genre);
      CREATE INDEX IF NOT EXISTS idx_lib_tracks_file ON library_tracks(file_path);
    `)
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

    this.stmtUpsertTrack = this.db.prepare(
      `INSERT OR REPLACE INTO library_tracks (
        id, file_path, title, artist, album, genre, duration, year, format, bitrate, sample_rate, bit_depth, is_dsd, cover_art, theme_primary, theme_secondary, theme_accent, track_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
    )
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
    } catch (e) {
      console.warn('[SqliteStorage.setLibraryCache] Error saving cache:', e)
    }
  }

  /**
   * Cập nhật 1 bài hát trong library_cache và library_tracks mà không cần ghi lại toàn bộ file JSON!
   */
  public updateSingleTrack(
    trackIdOrPath: string,
    updateFn: (track: any) => any,
    rebuildPreAggregatedFn?: (tracks: any[]) => any
  ): boolean {
    if (!this.db) return false
    try {
      const cached = this.getLibraryCache()
      if (!cached || !Array.isArray(cached.tracks)) return false

      let found = false
      for (let i = 0; i < cached.tracks.length; i++) {
        const t = cached.tracks[i]
        if (t.id === trackIdOrPath || t.filePath === trackIdOrPath) {
          cached.tracks[i] = updateFn(t)
          found = true
          break
        }
      }

      if (found) {
        if (rebuildPreAggregatedFn) {
          cached.preAggregated = rebuildPreAggregatedFn(cached.tracks)
        }
        this.setLibraryCache(cached)
        return true
      }
    } catch (e) {
      console.warn('[SqliteStorage.updateSingleTrack] Error:', e)
    }
    return false
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
        this.stmtUpsertTrack?.finalize()

        this.db.close()
      } catch { /* ignore */ }
      this.db = null
    }
  }
}
