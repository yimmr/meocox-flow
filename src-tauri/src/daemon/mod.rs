use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::State;
use crate::orchestrator::types::{AssetId, AssetMetadata, CheckpointRecord, DaemonStatus};
use crate::pipeline::{CapCutClipInput, CapCutExportResult, SoundEffectType};
use crate::sandbox::{QuotaEstimate, QuotaGuardian};
use crate::storage::StorageManager;

pub struct DaemonState {
    pub active_tasks: AtomicUsize,
    pub is_rendering: AtomicBool,
    pub start_time: Instant,
    pub storage: Arc<StorageManager>,
    pub quota: Arc<QuotaGuardian>,
    pub app_data_dir: PathBuf,
}

impl DaemonState {
    pub fn new(storage: Arc<StorageManager>, app_data_dir: PathBuf) -> Self {
        Self {
            active_tasks: AtomicUsize::new(0),
            is_rendering: AtomicBool::new(false),
            start_time: Instant::now(),
            storage,
            quota: Arc::new(QuotaGuardian::new(500)), // 默认每日限额 500 美分 ($5.00)
            app_data_dir,
        }
    }

    pub fn has_active_tasks(&self) -> bool {
        self.active_tasks.load(Ordering::SeqCst) > 0 || self.is_rendering.load(Ordering::SeqCst)
    }

    pub fn get_status(&self) -> DaemonStatus {
        DaemonStatus {
            active_tasks_count: self.active_tasks.load(Ordering::SeqCst) as u32,
            is_rendering: self.is_rendering.load(Ordering::SeqCst),
            uptime_seconds: self.start_time.elapsed().as_secs() as u32,
        }
    }
}

/// 检查后台守护进程运行状态
#[tauri::command]
#[specta::specta]
pub async fn ping_daemon_status(state: State<'_, Arc<DaemonState>>) -> Result<DaemonStatus, String> {
    Ok(state.get_status())
}

/// 注册本地媒体资产（分配 UUIDv7 句柄，持久化至 SQLite，禁止裸传 Base64）
#[tauri::command]
#[specta::specta]
pub async fn register_local_asset(
    file_path: String,
    media_type: String,
    name: String,
    summary: Option<String>,
    state: State<'_, Arc<DaemonState>>,
) -> Result<AssetMetadata, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Asset file does not exist: {file_path}"));
    }

    let asset_id = AssetId::new_v7();
    let asset_url = format!("asset://localhost/{}", asset_id.0);
    let now = chrono::Utc::now().timestamp_millis() as f64;

    let meta = AssetMetadata {
        id: asset_id,
        name,
        media_type,
        local_path: file_path,
        asset_url,
        duration_ms: None,
        summary: summary.unwrap_or_default(),
        created_at: now,
    };

    state.storage.insert_asset(&meta)?;
    Ok(meta)
}

/// 查询当前项目已登记的媒体资产句柄列表
#[tauri::command]
#[specta::specta]
pub async fn list_assets(state: State<'_, Arc<DaemonState>>) -> Result<Vec<AssetMetadata>, String> {
    state.storage.list_assets()
}

/// 程序化生成 16-bit PCM 原生免版税音效 (GEM-02 移植)
#[tauri::command]
#[specta::specta]
pub async fn generate_procedural_sound(
    sound_type: SoundEffectType,
    duration_sec: Option<f32>,
    state: State<'_, Arc<DaemonState>>,
) -> Result<AssetMetadata, String> {
    let asset_id = AssetId::new_v7();
    let derived_dir = state.app_data_dir.join(".flow").join("derived");
    if !derived_dir.exists() {
        tokio::fs::create_dir_all(&derived_dir)
            .await
            .map_err(|e| format!("Failed to create derived dir: {e}"))?;
    }

    let file_name = format!("{}.wav", asset_id.0);
    let out_path = derived_dir.join(&file_name);

    let (type_name, duration_ms) = match sound_type {
        SoundEffectType::Whoosh => {
            let dur = duration_sec.unwrap_or(0.45);
            crate::pipeline::generate_whoosh_wav(&out_path, Some(dur)).await?;
            ("Whoosh 转场音效", (dur * 1000.0) as f64)
        }
        SoundEffectType::Chime => {
            let dur = duration_sec.unwrap_or(0.8);
            crate::pipeline::generate_chime_wav(&out_path, Some(dur)).await?;
            ("Chime 提示音", (dur * 1000.0) as f64)
        }
        SoundEffectType::TechAmbient => {
            let dur = duration_sec.unwrap_or(16.0);
            crate::pipeline::generate_tech_ambient_bgm(&out_path, Some(dur)).await?;
            ("Lo-Fi 科技背景音乐", (dur * 1000.0) as f64)
        }
    };

    let now = chrono::Utc::now().timestamp_millis() as f64;
    let meta = AssetMetadata {
        id: asset_id.clone(),
        name: type_name.to_string(),
        media_type: "audio".to_string(),
        local_path: out_path.to_string_lossy().to_string(),
        asset_url: format!("asset://localhost/{}", asset_id.0),
        duration_ms: Some(duration_ms),
        summary: format!("16-bit PCM 原生免版税程序化合成: {}", type_name),
        created_at: now,
    };

    state.storage.insert_asset(&meta)?;
    Ok(meta)
}

/// 组装导出剪映 / CapCut Pro 工业级草稿 (GEM-01 移植)
#[tauri::command]
#[specta::specta]
pub async fn export_capcut_project(
    draft_name: String,
    clips: Vec<CapCutClipInput>,
    state: State<'_, Arc<DaemonState>>,
) -> Result<CapCutExportResult, String> {
    let drafts_dir = state.app_data_dir.join(".flow").join("derived").join("drafts");
    crate::pipeline::export_capcut_draft(&drafts_dir, &draft_name, &clips).await
}

/// 算力预算守卫拦截检查 (Quota Guardian)
#[tauri::command]
#[specta::specta]
pub async fn estimate_quota(
    estimated_cents: u32,
    task_desc: String,
    state: State<'_, Arc<DaemonState>>,
) -> Result<QuotaEstimate, String> {
    Ok(state.quota.estimate(estimated_cents, &task_desc))
}

/// 保存状态机持久化检查点 (非线性时间轴时光机)
#[tauri::command]
#[specta::specta]
pub async fn save_studio_checkpoint(
    step_name: String,
    state_json: String,
    state: State<'_, Arc<DaemonState>>,
) -> Result<String, String> {
    state.storage.save_checkpoint(&step_name, &state_json)
}

/// 查询历史检查点记录
#[tauri::command]
#[specta::specta]
pub async fn list_studio_checkpoints(
    state: State<'_, Arc<DaemonState>>,
) -> Result<Vec<CheckpointRecord>, String> {
    state.storage.list_checkpoints()
}
