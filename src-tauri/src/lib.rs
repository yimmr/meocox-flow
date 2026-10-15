#![allow(dead_code, unused_imports)]

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// 本地后端固定端口，与 client/src/lib/apiClient.js 的默认值保持一致
const BACKEND_PORT: u16 = 3001;

/// Tauri externalBin 要求文件名带 target triple（x86_64-pc-windows-msvc）
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(all(target_os = "windows", target_arch = "aarch64"))]
const TARGET_TRIPLE: &str = "aarch64-pc-windows-msvc";
#[cfg(target_os = "linux")]
const TARGET_TRIPLE: &str = "x86_64-unknown-linux-gnu";
#[cfg(target_os = "macos")]
const TARGET_TRIPLE: &str = "aarch64-apple-darwin";

const SIDECAR_NAME: &str = "meocox-backend";

/// 持有后端子进程 + Windows job handle。
/// drop job handle 时系统会自动终止 job 内所有进程（JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE），
/// 这是"应用被强杀也不留孤儿"的兜底保障。
struct BackendHandle {
    child: Mutex<Option<Child>>,
    #[cfg(target_os = "windows")]
    job: Option<isize>,
}

/// Windows Job Object：把 sidecar 挂进 job，父进程被强杀时 OS 自动终止它。
///
/// 这是解决孤儿进程的关键 —— on_window_event(Destroyed) 只在正常关闭时触发，
/// 任务管理器「结束任务」（TerminateProcess）时根本不会执行。
/// 实测过：没有 job 时强杀 app 会留下占用 3001 的孤儿。
#[cfg(target_os = "windows")]
fn attach_to_kill_on_close_job(child: &Child) -> Option<isize> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    unsafe {
        let job = CreateJobObjectW(None, PCWSTR::null()).ok()?;

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let _ = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            std::ptr::from_ref(&info) as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );

        let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, child.id()).ok()?;
        let assigned = AssignProcessToJobObject(job, proc);
        let _ = CloseHandle(proc);

        if assigned.is_ok() {
            Some(job.0 as isize)
        } else {
            // 进程已在别的 job 中（如被 IDE 调试器附加）时赋值会失败。
            // 此时放弃 job，退回 kill-on-exit + kill_stale_backend 兜底。
            let _ = CloseHandle(job);
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn attach_to_kill_on_close_job(_child: &Child) -> Option<isize> {
    None
}

#[tauri::command]
fn get_system_info() -> serde_json::Value {
    serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "is_desktop": true,
        "app_version": env!("CARGO_PKG_VERSION"),
        "tauri_version": "2.x",
        "backend_port": BACKEND_PORT
    })
}

/// 清理可能残留的、占用 3001 端口的旧后端进程。
/// 典型场景：上次应用被强杀，SEA 子进程成了孤儿。
fn kill_stale_backend() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        // 找出占用端口的 PID
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "Get-NetTCPConnection -LocalPort {} -State Listen -EA SilentlyContinue \
                     | Select-Object -ExpandProperty OwningProcess -Unique",
                    BACKEND_PORT
                ),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines().filter(|l| !l.trim().is_empty()) {
                if let Ok(pid) = line.trim().parse::<u32>() {
                    // 只杀我们的 SEA 产物，避免误伤用户其他程序
                    let name_ok = Command::new("powershell")
                        .args([
                            "-NoProfile",
                            "-NonInteractive",
                            "-Command",
                            &format!("(Get-Process -Id {} -EA SilentlyContinue).ProcessName", pid),
                        ])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output()
                        .map(|o| {
                            let n = String::from_utf8_lossy(&o.stdout).to_lowercase();
                            n.contains("meocox-backend") || n.contains("node")
                        })
                        .unwrap_or(false);

                    if name_ok {
                        let _ = Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/F"])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                        log::warn!("[backend] 清理残留进程 PID={}", pid);
                    }
                }
            }
        }
    }
}

/// 统一的应用日志目录 %LOCALAPPDATA%\MeocoxFlow\logs
fn logs_dir_for_app() -> std::path::PathBuf {
    let dir = std::env::var("LOCALAPPDATA")
        .map(|p| std::path::PathBuf::from(p).join("MeocoxFlow").join("logs"))
        .unwrap_or_else(|_| std::path::PathBuf::from("logs"));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 定位打包后的 sidecar 可执行文件与资源目录
///
/// sidecar 位置随运行形态而变：
///   - 已安装：与 app.exe 同级（externalBin 约定）
///   - 未安装直跑 target/release：同样与 app.exe 同级
///   - macOS：MacOS/ 与 Resources/ 分离
/// 因此逐个探测候选目录，而不是假定固定层级。
fn resolve_backend_paths(app: &tauri::AppHandle) -> (std::path::PathBuf, std::path::PathBuf) {
    // Tauri 打包时会把 externalBin 的文件名去掉 -<target-triple> 后缀，
    // 所以产物实际叫 meocox-backend.exe。两种命名都试。
    let mut plain = SIDECAR_NAME.to_string();
    plain.push_str(std::env::consts::EXE_SUFFIX);

    let mut with_triple = SIDECAR_NAME.to_string();
    with_triple.push('-');
    with_triple.push_str(TARGET_TRIPLE);
    with_triple.push_str(std::env::consts::EXE_SUFFIX);

    // 可执行文件所在目录是最可靠的基准
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();

    // 资源目录：安装态由 Tauri 解析；解析不到退回 exe 同级
    let resources = app.path().resource_dir().unwrap_or_else(|_| exe_dir.clone());

    let mut search_dirs: Vec<std::path::PathBuf> = vec![exe_dir.clone(), resources.clone()];
    if let Some(parent) = exe_dir.parent() {
        search_dirs.push(parent.to_path_buf());
        search_dirs.push(parent.join("binaries").to_path_buf());
    }

    let mut binary = exe_dir.join(&with_triple);
    'outer: for dir in &search_dirs {
        for name in [&plain, &with_triple] {
            let candidate = dir.join(name);
            if candidate.exists() {
                binary = candidate;
                break 'outer;
            }
        }
    }

    // 资源目录：必须真正含 agents/ 才是对的。
    // 未安装直接跑 target/release/app.exe 时，资源仍在 src-tauri/resources，
    // 需要从 exe 目录逐级上溯（target/release → target → src-tauri）。
    let resources = if resources.join("agents").is_dir() {
        resources
    } else {
        let mut found = None;
        let mut cur: Option<&std::path::Path> = Some(exe_dir.as_path());
        let mut hops = 0;
        while let Some(dir) = cur {
            let direct = dir.to_path_buf();
            if direct.join("agents").is_dir() {
                found = Some(direct);
                break;
            }
            let nested = dir.join("resources");
            if nested.join("agents").is_dir() {
                found = Some(nested);
                break;
            }
            if hops >= 4 {
                break;
            }
            hops += 1;
            cur = dir.parent();
        }
        found.unwrap_or(resources)
    };

    (binary, resources)
}

/// 启动本地后端（SEA sidecar）
fn spawn_backend(app: &tauri::AppHandle) -> Result<(), String> {
    let (binary, resources) = resolve_backend_paths(app);

    // 日志目录优先建立：即使后续任何一步失败，也必须留下可读的现场，
    // 否则 release 下错误会完全静默
    let logs_dir = logs_dir_for_app();
    let log_path = logs_dir.join("backend.log");

    // 把诊断信息写进日志文件（release 下没有 log 插件，这是唯一的出口）
    let mut diag = String::new();
    diag.push_str(&format!(
        "---- 启动尝试 {} ----\n可执行文件: {}\n资源目录: {}\n",
        chrono_like_now(),
        binary.display(),
        resources.display()
    ));
    let _ = std::fs::write(&log_path, &diag);

    if !binary.exists() {
        let msg = format!(
            "找不到后端可执行文件: {}\n请先执行 npm run build:backend",
            binary.display()
        );
        let _ = std::fs::write(
            &log_path,
            format!("{}\n❌ {}\n", diag, msg),
        );
        return Err(msg);
    }

    kill_stale_backend();

    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("无法打开日志文件: {}", e))?;
    let log_err = log_file.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&binary);
    cmd.env("MEOCOX_APP_ROOT", &resources) // 让后端定位 agents/skills/config
        .env("PORT", BACKEND_PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_err));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| {
        let msg = format!("启动后端失败: {}", e);
        let _ = std::fs::write(&log_path, format!("{}\n❌ {}\n", diag, msg));
        msg
    })?;

    // 挂进 kill-on-close job：父进程被强杀时 OS 会一并终止后端
    let job = attach_to_kill_on_close_job(&child);

    let pid = child.id();
    let note = format!(
        "{}\n✅ 已启动 PID={:?}{}\n",
        diag,
        pid,
        if job.is_some() { "（已挂入 kill-on-close job）" } else { "" }
    );
    let _ = std::fs::write(&log_path, &note);

    log::info!("[backend] 已启动 PID={:?}", pid);
    app.manage(BackendHandle {
        child: Mutex::new(Some(child)),
        #[cfg(target_os = "windows")]
        job,
    });
    Ok(())
}

/// 简易时间戳（避免为格式化额外引入 chrono 依赖）
fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 输出为可读的 UTC HH:MM:SS 近似值
    let s = secs % 86_400;
    format!("{:02}:{:02}:{:02} UTC", s / 3600, (s % 3600) / 60, s % 60)
}

/// 应用正常退出时终止后端。
/// 注意：这只覆盖「优雅关闭」。进程被强杀时靠 Job Object 兜底。
fn shutdown_backend(app: &tauri::AppHandle) {
    if let Some(handle) = app.try_state::<BackendHandle>() {
        if let Ok(mut guard) = handle.child.lock() {
            if let Some(mut child) = guard.take() {
                match child.kill() {
                    Ok(_) => log::info!("[backend] 已终止"),
                    Err(e) => log::warn!("[backend] 终止失败: {}", e),
                }
            }
        }
        // 关闭 job handle 会触发 JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE，
        // 确保后端及其可能派生的子进程一并回收
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::Foundation::{CloseHandle, HANDLE};
            if let Some(job) = handle.job {
                unsafe {
                    let _ = CloseHandle(HANDLE(job as *mut std::ffi::c_void));
                }
                log::info!("[backend] job handle 已关闭");
            }
        }
    }
}

/// 前端轮询此命令等待后端就绪，避免在服务起来前发请求
#[tauri::command]
async fn wait_for_backend() -> Result<bool, String> {
    let url = format!("http://localhost:{}/api/health", BACKEND_PORT);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()
        .map_err(|e| e.to_string())?;

    // 最多重试 50 次，每次间隔 300ms → 上限约 15 秒
    for _ in 0..50 {
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                return Ok(true);
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }
    Err(format!("后端在 15 秒内未就绪 ({}). 请查看日志: %LOCALAPPDATA%\\MeocoxFlow\\logs\\backend.log", url))
}

#[tauri::command]
fn get_backend_port() -> u16 {
    BACKEND_PORT
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let clean_path = path.replace('/', "\\");
        Command::new("explorer")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn open_external_browser(url: String) -> Result<(), String> {
    let parsed_url: tauri::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err("Only http and https URLs are allowed".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let safe_url = parsed_url.as_str().replace('\'', "''");
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("Start-Process '{}'", safe_url),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn close_web_browser_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("media_browser_view") {
        window.close().map_err(|e| format!("Failed to close window: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn open_web_browser_window(
    app: tauri::AppHandle,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    let window_title = title.unwrap_or_else(|| "媒体浏览工作舱".to_string());
    let parsed_url: tauri::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err("Only http and https URLs are allowed".to_string());
    }

    if let Some(existing_window) = app.get_webview_window("media_browser_view") {
        let _ = existing_window.navigate(parsed_url);
        let _ = existing_window.set_title(&window_title);
        let _ = existing_window.show();
        let _ = existing_window.set_focus();
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        "media_browser_view",
        tauri::WebviewUrl::External(parsed_url),
    )
    .title(window_title)
    .inner_size(1280.0, 800.0)
    .min_inner_size(900.0, 600.0)
    .decorations(true)
    .resizable(true)
    .closable(true)
    .maximizable(true)
    .minimizable(true)
    .center()
    .build()
    .map_err(|e| format!("Failed to create webview window: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // 目录/文件选择器：桌面端进程内直接弹原生框，
        // 免去 HTTP + fork folderPicker.exe 的 ~500ms 冷启动开销
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // release 下同样需要日志：否则启动失败会完全静默。
            // GUI 程序没有控制台，stdout 看不到，
            // 因此把日志写进 %LOCALAPPDATA%\MeocoxFlow\logs。
            let log_builder = tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info);
            #[cfg(not(debug_assertions))]
            let log_builder = log_builder.targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                    file_name: None,
                }),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            ]);
            app.handle().plugin(log_builder.build())?;

            // dev 模式由 beforeDevCommand (npm run dev:web) 拉起后端，
            // 只有打包态才需要我们自己 spawn sidecar
            #[cfg(not(debug_assertions))]
            {
                if let Err(e) = spawn_backend(app.handle()) {
                    log::error!("[backend] 启动失败: {}", e);
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("backend-startup-error", &e);
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 主窗口关闭 = 用户退出应用，必须终止后端，
            // 否则会留下占用 3001 的孤儿进程
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    shutdown_backend(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_backend_port,
            wait_for_backend,
            open_in_explorer,
            open_external_browser,
            open_web_browser_window,
            close_web_browser_window
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
