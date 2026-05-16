use tauri_plugin_sql::{Migration, MigrationKind};

mod backup;
mod fs_export;
mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Apply any pending restore BEFORE the SQL plugin opens the DB.
    backup::apply_pending_restore_blocking();

    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../../src/lib/db/migrations/0000_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "invoices",
            sql: include_str!("../../src/lib/db/migrations/0001_invoices.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "zugferd_profile",
            sql: include_str!("../../src/lib/db/migrations/0002_zugferd_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "reverse_charge",
            sql: include_str!("../../src/lib/db/migrations/0003_reverse_charge.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:zettel.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            sidecar::generate_invoice,
            sidecar::ping_sidecar,
            fs_export::save_text_file,
            backup::snapshot_db_path,
            backup::bundle_backup,
            backup::stage_restore,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
