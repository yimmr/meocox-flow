use std::path::{Path, PathBuf};
use std::sync::Mutex;
use rusqlite::{params, Connection};
use crate::orchestrator::types::{AssetId, AssetMetadata, CheckpointRecord};

pub struct StorageManager {
    db_path: PathBuf,
    conn: Mutex<Connection>,
}

impl StorageManager {
    pub async fn new<P: AsRef<Path>>(project_dir: P) -> Result<Self, String> {
        let flow_dir = project_dir.as_ref().join(".flow");
        if !flow_dir.exists() {
            tokio::fs::create_dir_all(&flow_dir)
                .await
                .map_err(|e| format!("Failed to create .flow directory: {e}"))?;
        }
        let db_path = flow_dir.join("project.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database: {e}"))?;

        // 强制开启 WAL 模式与外键约束
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;",
        )
        .map_err(|e| format!("Failed to set WAL pragma: {e}"))?;

        // 初始化核心表结构
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS assets (
                asset_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                media_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                summary TEXT,
                duration_ms INTEGER,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS checkpoints (
                checkpoint_id TEXT PRIMARY KEY,
                step_name TEXT NOT NULL,
                state_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );",
        )
        .map_err(|e| format!("Failed to initialize schema: {e}"))?;

        Ok(Self {
            db_path,
            conn: Mutex::new(conn),
        })
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub fn insert_asset(&self, asset: &AssetMetadata) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Mutex lock error: {e}"))?;
        conn.execute(
            "INSERT INTO assets (asset_id, name, media_type, file_path, summary, duration_ms, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(asset_id) DO UPDATE SET
                name=excluded.name,
                media_type=excluded.media_type,
                file_path=excluded.file_path,
                summary=excluded.summary,
                duration_ms=excluded.duration_ms;",
            params![
                asset.id.0,
                asset.name,
                asset.media_type,
                asset.local_path,
                asset.summary,
                asset.duration_ms,
                asset.created_at,
            ],
        )
        .map_err(|e| format!("Failed to insert asset: {e}"))?;
        Ok(())
    }

    pub fn list_assets(&self) -> Result<Vec<AssetMetadata>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Mutex lock error: {e}"))?;
        let mut stmt = conn
            .prepare("SELECT asset_id, name, media_type, file_path, summary, duration_ms, created_at FROM assets ORDER BY created_at DESC")
            .map_err(|e| format!("Prepare query failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                let asset_id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let media_type: String = row.get(2)?;
                let local_path: String = row.get(3)?;
                let summary: String = row.get::<_, Option<String>>(4)?.unwrap_or_default();
                let duration_ms: Option<f64> = row.get(5)?;
                let created_at: f64 = row.get(6)?;

                // asset:// 虚拟安全协议映射
                let asset_url = format!("asset://localhost/{}", asset_id);

                Ok(AssetMetadata {
                    id: AssetId(asset_id),
                    name,
                    media_type,
                    local_path,
                    asset_url,
                    duration_ms,
                    summary,
                    created_at,
                })
            })
            .map_err(|e| format!("Query map failed: {e}"))?;

        let mut result = Vec::new();
        for r in rows {
            let item = r.map_err(|e| format!("Row parse error: {e}"))?;
            result.push(item);
        }
        Ok(result)
    }

    pub fn save_checkpoint(&self, step_name: &str, state_json: &str) -> Result<String, String> {
        let checkpoint_id = format!("ckpt_{}", uuid::Uuid::now_v7());
        let now = chrono::Utc::now().timestamp_millis() as f64;
        let conn = self.conn.lock().map_err(|e| format!("Mutex lock error: {e}"))?;
        conn.execute(
            "INSERT INTO checkpoints (checkpoint_id, step_name, state_json, created_at)
             VALUES (?1, ?2, ?3, ?4);",
            params![checkpoint_id, step_name, state_json, now],
        )
        .map_err(|e| format!("Failed to save checkpoint: {e}"))?;
        Ok(checkpoint_id)
    }

    pub fn list_checkpoints(&self) -> Result<Vec<CheckpointRecord>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Mutex lock error: {e}"))?;
        let mut stmt = conn
            .prepare("SELECT checkpoint_id, step_name, state_json, created_at FROM checkpoints ORDER BY created_at DESC")
            .map_err(|e| format!("Prepare query failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                let checkpoint_id: String = row.get(0)?;
                let step_name: String = row.get(1)?;
                let state_json: String = row.get(2)?;
                let created_at: f64 = row.get(3)?;
                Ok(CheckpointRecord {
                    checkpoint_id,
                    step_name,
                    state_json,
                    created_at,
                })
            })
            .map_err(|e| format!("Query map failed: {e}"))?;

        let mut result = Vec::new();
        for r in rows {
            let item = r.map_err(|e| format!("Row parse error: {e}"))?;
            result.push(item);
        }
        Ok(result)
    }
}
