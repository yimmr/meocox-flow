# Rust + Tauri v2 + React 核心代码范式参考

## 1. 强类型句柄与 TurnSteer 契约模板 (`src-tauri/src/orchestrator/types.rs`)

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// 全链路唯一资产句柄（底层强制采用 UUIDv7 单调时序标识）
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
pub struct AssetId(pub String);

impl AssetId {
    pub fn new_v7() -> Self {
        Self(format!("ast_{}", Uuid::now_v7()))
    }
}

/// 标准防错时间码区间（HH:MM:SS.mmm，避免模型心算帧偏移）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimecodeRange {
    pub start: String,
    pub end: String,
}

/// 生成中途非阻塞动态切轨指令（TurnSteer）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TurnSteerPayload {
    pub session_id: String,
    pub steer_instruction: String,
    pub preserve_completed_scenes: bool,
}
```

## 2. 拦截窗口关闭实现后台常驻守护 (`src-tauri/src/main.rs`)

```rust
use tauri::{Manager, RunEvent};

pub fn run_app() {
    let app = tauri::Builder::default()
        .setup(|app| {
            // 初始化后台任务队列、SQLite WAL 连接池与系统托盘
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            // 若后台仍有正在排队或渲染的 AIGC 任务，阻止进程退出，转入后台静默运行
            if crate::daemon::is_rendering_active(app_handle) {
                api.prevent_exit();
            }
        }
    });
}
```

## 3. 批处理 FFmpeg Sidecar 管线调用范式 (`src-tauri/src/pipeline/ffmpeg.rs`)

- 使用 `tauri_plugin_shell::ShellExt` 调用打包的 `ffmpeg` sidecar。
- 所有传入的参数必须作为独立的数组元素传入 `.args([...])`，严禁拼接原始 Shell 字符串以防命令注入。
- 所有的输出文件统一写入媒体池的衍生目录（`media_pool/derived/<asset_id>.mp4`），绝不覆写 `media_pool/raw/` 下的用户原始素材。
