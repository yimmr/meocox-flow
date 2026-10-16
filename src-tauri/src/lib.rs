pub mod blackboard;
pub mod daemon;
pub mod orchestrator;
pub mod pipeline;
pub mod sandbox;
pub mod storage;

use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tauri_specta::{collect_commands, Builder};

use daemon::{
    distill_and_save_aesthetic_memory, estimate_quota, export_capcut_project,
    generate_procedural_sound, get_blackboard_state, inject_turn_steer_frame, list_assets,
    list_aesthetic_memories, list_skill_indexes, list_studio_checkpoints, load_skill_content,
    orchestrate_storyboard, ping_daemon_status, register_local_asset, resolve_battle_winner,
    save_studio_checkpoint, start_battle_mode, start_pipeline_execution, verify_scene_continuity,
    DaemonState,
};
use storage::StorageManager;

fn create_specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            ping_daemon_status,
            register_local_asset,
            list_assets,
            generate_procedural_sound,
            export_capcut_project,
            estimate_quota,
            save_studio_checkpoint,
            list_studio_checkpoints,
            get_blackboard_state,
            orchestrate_storyboard,
            start_pipeline_execution,
            inject_turn_steer_frame,
            start_battle_mode,
            resolve_battle_winner,
            verify_scene_continuity,
            list_skill_indexes,
            load_skill_content,
            list_aesthetic_memories,
            distill_and_save_aesthetic_memory,
        ])
}

pub fn export_ts_bindings() {
    create_specta_builder()
        .export(
            specta_typescript::Typescript::default()
                .header("// @ts-nocheck\n")
                .bigint(specta_typescript::BigIntExportBehavior::Number),
            "../src/bindings/index.ts",
        )
        .expect("Failed to export typescript bindings");
}

pub fn run() {
    #[cfg(debug_assertions)]
    export_ts_bindings();

    let specta_builder = create_specta_builder();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(specta_builder.invoke_handler())
        .setup(|app| {
            let app_handle = app.handle();
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app_data_dir: {e}"))?;

            // 使用 tokio 异步运行时初始化 SQLite WAL 单项目存储
            let storage = tauri::async_runtime::block_on(async {
                StorageManager::new(&app_dir).await
            })
            .map_err(|e| format!("Failed to init StorageManager: {e}"))?;

            let daemon_state = Arc::new(DaemonState::new(Arc::new(storage), app_dir.clone()));
            app.manage(daemon_state);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            if let Some(state) = app_handle.try_state::<Arc<DaemonState>>() {
                if state.has_active_tasks() {
                    // 若后台仍有活跃任务或正在渲染，阻止进程退出，常驻系统托盘
                    api.prevent_exit();
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_bindings() {
        create_specta_builder()
            .export(
                specta_typescript::Typescript::default()
                    .header("// @ts-nocheck\n")
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                "../src/bindings/index.ts",
            )
            .expect("Failed to export typescript bindings");
    }
}
