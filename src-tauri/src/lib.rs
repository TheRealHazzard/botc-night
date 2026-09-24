use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SERVER_PORT: u16 = 3000;
const SERVER_URL: &str = "http://localhost:3000/host";
// The server is fast to start (plain Node, no framework) — this timeout
// exists to fail loudly if the sidecar genuinely never comes up (a
// corrupt install, a port already held by something else), not because
// startup is normally slow.
const READY_TIMEOUT: Duration = Duration::from_secs(15);
const READY_POLL_INTERVAL: Duration = Duration::from_millis(150);

// Some(repo_root/data) when this executable is sitting where `npm run
// stage:app` (tools/stage-app.js) actually puts it — dist-app/ as a
// direct child of the repo root — confirmed by checking for server.js
// one level up from that, not just assumed from the folder name alone.
// None for any other layout (a detached copy, a future proper install
// location), so the caller can fall back cleanly instead of writing
// into — or silently failing to find — a data/ folder that was never
// really this table's own.
fn repo_data_dir() -> Option<std::path::PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let repo_root = exe_dir.parent()?.to_path_buf();
    if repo_root.join("server.js").is_file() {
        Some(repo_root.join("data"))
    } else {
        None
    }
}

// Holds the sidecar's child handle for the app's whole lifetime so the
// window-close handler below can actually reach it. Without this, the
// handle returned by spawn() is dropped the moment .setup() returns, and
// the server keeps running headless in the background the first time
// anyone closes the window expecting the app to have quit — exactly the
// papercut this wrapper exists to avoid.
struct ServerHandle(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // game/history.js/game/nanoleaf.js (unmodified by this whole
            // packaging pass) already read process.env.DATA_DIR with a
            // fallback, so this is the only "wiring" the desktop app
            // needs to do: point that somewhere real.
            //
            // Deliberately the repo's OWN data/ folder, not a fresh
            // per-user AppData location — this table's history already
            // lives there from every `npm start` run before this app
            // existed, and the whole point of packaging is a friendlier
            // way to keep playing on the same table, not a reason to
            // start over. Your own call, not a default I picked silently:
            // the trade-off is this build has to stay next to the repo
            // (dist-app/ as a direct child of it, exactly what `npm run
            // stage:app` already produces) to find it. If it's ever run
            // from somewhere that isn't recognizably this repo — no
            // server.js one level up from dist-app/ — it falls back to a
            // real per-user AppData location instead of failing outright;
            // that copy just starts its own, separate history.
            let data_dir = repo_data_dir()
                .unwrap_or_else(|| {
                    app.path()
                        .app_data_dir()
                        .expect("no app data dir available")
                        .join("data")
                });
            std::fs::create_dir_all(&data_dir).expect("failed to create the data dir");

            let shell = app.shell();
            let (mut rx, child) = shell
                .sidecar("botc-night-server")
                .expect("botc-night-server sidecar not found — run `npm run package:server` first")
                .env("DATA_DIR", data_dir.to_string_lossy().to_string())
                .spawn()
                .expect("failed to spawn the botc-night server");

            app.manage(ServerHandle(Mutex::new(Some(child))));

            // Logged, not surfaced to the UI — same "advisory, never
            // blocking" spirit as this app's own fire-and-forget
            // server-side integrations (Nanoleaf, the live notable-beat
            // check). A line in the sidecar's own stdout/stderr is
            // exactly what `node server.js` already prints today, useful
            // for debugging a failed launch without a separate terminal.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            log::info!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            log::error!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            // Never create the window pointed at a server that isn't
            // listening yet — a genuine, if usually brief, gap.
            let deadline = Instant::now() + READY_TIMEOUT;
            while TcpStream::connect(("127.0.0.1", SERVER_PORT)).is_err() {
                if Instant::now() >= deadline {
                    panic!(
                        "the botc-night server never came up on port {SERVER_PORT} within {READY_TIMEOUT:?}"
                    );
                }
                std::thread::sleep(READY_POLL_INTERVAL);
            }

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SERVER_URL.parse().unwrap()))
                .title("BotC Night")
                .inner_size(1280.0, 800.0)
                .min_inner_size(760.0, 560.0)
                .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<ServerHandle>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
