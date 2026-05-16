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
        Migration {
            version: 5,
            description: "recurring_invoices",
            sql: include_str!("../../src/lib/db/migrations/0004_recurring_invoices.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "offers",
            sql: include_str!("../../src/lib/db/migrations/0005_offers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "credit_notes",
            sql: include_str!("../../src/lib/db/migrations/0006_credit_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "pdf_theme",
            sql: include_str!("../../src/lib/db/migrations/0007_pdf_theme.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "reverse_charge_type",
            sql: include_str!("../../src/lib/db/migrations/0008_reverse_charge_type.sql"),
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
            sidecar::generate_offer,
            sidecar::ping_sidecar,
            fs_export::save_text_file,
            backup::snapshot_db_path,
            backup::bundle_backup,
            backup::stage_restore,
            backup::apply_pending_partial_restore,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
