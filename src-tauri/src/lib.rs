use tauri_plugin_sql::{Migration, MigrationKind};

mod accent;
mod backup;
mod bmf;
mod crypto;
mod exchange;
mod sandbox;
mod fs_export;
mod sidecar;
mod validator;

fn build_migrations() -> Vec<Migration> {
    vec![
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
        Migration {
            version: 10,
            description: "expenses",
            sql: include_str!("../../src/lib/db/migrations/0009_expenses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "reminders",
            sql: include_str!("../../src/lib/db/migrations/0010_reminders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "validation_status",
            sql: include_str!("../../src/lib/db/migrations/0011_validation_status.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "v0.10_flexibility",
            sql: include_str!("../../src/lib/db/migrations/0012_v0.10_flexibility.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "v0.10_cleanup",
            sql: include_str!("../../src/lib/db/migrations/0013_v0.10_cleanup.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "v0.11_tax_profile",
            sql: include_str!("../../src/lib/db/migrations/0014_v0.11_tax_profile.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Apply any pending restore BEFORE the SQL plugin opens the DB.
    backup::apply_pending_restore_blocking();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:zettel.db", build_migrations())
                .add_migrations("sqlite:zettel-sandbox.db", build_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            sidecar::generate_invoice,
            sidecar::generate_offer,
            sidecar::ping_sidecar,
            sidecar::extract_zugferd,
            sidecar::extract_text_pdf,
            sidecar::generate_reminder,
            fs_export::save_text_file,
            fs_export::import_expense_pdf,
            backup::snapshot_db_path,
            backup::bundle_backup,
            backup::stage_restore,
            backup::apply_pending_partial_restore,
            accent::get_system_accent_color,
            validator::validator_status,
            validator::validate_einvoice_xml,
            validator::validate_einvoice_pdf,
            sandbox::is_sandbox,
            sandbox::set_sandbox,
            exchange::fetch_ecb_exchange_rate,
            bmf::fetch_bmf_income_tax,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
