use tauri::{Runtime, plugin::TauriPlugin};
use tauri_plugin_sql::{Migration, MigrationKind, PluginConfig};

mod backup;
mod crypto;
mod exchange;
mod fs_export;
mod paths;
mod process;
mod sandbox;
mod sidecar;
mod tenants;
#[cfg(test)]
mod testutil;
mod validator;

/// `(version, description, file name without `.sql` in src/lib/db/migrations)`.
/// Versions are `user_version` of the migration; the highest must equal
/// `backup::CURRENT_SCHEMA`.
macro_rules! up_migrations {
    ($(($version:expr, $description:expr, $file:expr)),+ $(,)?) => {
        vec![$(Migration {
            version: $version,
            description: $description,
            sql: include_str!(concat!("../../src/lib/db/migrations/", $file, ".sql")),
            kind: MigrationKind::Up,
        }),+]
    };
}

fn build_migrations() -> Vec<Migration> {
    up_migrations![
        (1, "initial_schema", "0000_initial"),
        (2, "invoices", "0001_invoices"),
        (3, "zugferd_profile", "0002_zugferd_profile"),
        (4, "reverse_charge", "0003_reverse_charge"),
        (5, "recurring_invoices", "0004_recurring_invoices"),
        (6, "offers", "0005_offers"),
        (7, "credit_notes", "0006_credit_notes"),
        (8, "pdf_theme", "0007_pdf_theme"),
        (9, "reverse_charge_type", "0008_reverse_charge_type"),
        (10, "expenses", "0009_expenses"),
        (11, "reminders", "0010_reminders"),
        (12, "validation_status", "0011_validation_status"),
        (13, "v0.10_flexibility", "0012_v0.10_flexibility"),
        (14, "v0.10_cleanup", "0013_v0.10_cleanup"),
        (15, "v0.11_tax_profile", "0014_v0.11_tax_profile"),
        (16, "v0.11_pauschal_mode", "0015_v0.11_pauschal_mode"),
        (17, "v0.11_tax_prepayments", "0016_v0.11_tax_prepayments"),
        (18, "v0.11_other_income", "0017_v0.11_other_income"),
        (19, "v0.11_fix_storno_eur_total", "0018_v0.11_fix_storno_eur_total"),
        (20, "v0.12_service_periods", "0019_v0.12_service_periods"),
        (21, "v0.14_catalog", "0020_v0.14_catalog"),
        (22, "v0.14_skonto", "0021_v0.14_skonto"),
        (23, "v0.15_partial_payments", "0022_v0.15_partial_payments"),
        (24, "v0.15_auto_backup", "0023_v0.15_auto_backup"),
        (25, "v0.16_pdf_language", "0024_v0.16_pdf_language"),
        (26, "v0.16_expense_categories", "0025_v0.16_expense_categories"),
        (27, "v0.22_tax_options", "0026_v0.22_tax_options"),
    ]
}

fn sql_plugin<R: Runtime>() -> TauriPlugin<R, Option<PluginConfig>> {
    let mut sql = tauri_plugin_sql::Builder::default()
        .add_migrations(tenants::DEFAULT_DB_URL, build_migrations())
        .add_migrations(tenants::SANDBOX_DB_URL, build_migrations());
    // The active custom-tenant DB needs its migrations registered under its
    // exact URL string (read from config before startup).
    if let Some(url) = tenants::active_custom_db_url_static() {
        sql = sql.add_migrations(&url, build_migrations());
    }
    sql.build()
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
        .plugin(sql_plugin())
        .invoke_handler(tauri::generate_handler![
            sidecar::generate_invoice,
            sidecar::generate_offer,
            sidecar::ping_sidecar,
            sidecar::extract_zugferd,
            sidecar::extract_text_pdf,
            sidecar::generate_reminder,
            sidecar::parse_bank_statement,
            fs_export::save_text_file,
            fs_export::import_expense_pdf,
            fs_export::archive_pdf_version,
            fs_export::list_pdf_versions,
            backup::snapshot_db_path,
            backup::auto_backup_target,
            backup::bundle_backup,
            backup::stage_restore,
            backup::apply_pending_partial_restore,
            validator::validator_status,
            validator::validate_einvoice_xml,
            validator::validate_einvoice_pdf,
            sandbox::is_sandbox,
            sandbox::set_sandbox,
            tenants::get_active_db_url,
            tenants::list_tenants,
            tenants::add_tenant,
            tenants::set_active_tenant,
            tenants::relocate_active_tenant,
            tenants::remove_tenant,
            exchange::fetch_ecb_exchange_rate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_versions_are_contiguous_and_match_the_backup_schema() {
        let migrations = build_migrations();
        let versions: Vec<i64> = migrations.iter().map(|m| m.version).collect();
        let expected: Vec<i64> = (1..=migrations.len() as i64).collect();
        assert_eq!(versions, expected);
        assert_eq!(
            migrations.last().map(|m| m.version),
            Some(i64::from(backup::CURRENT_SCHEMA))
        );
    }

    #[test]
    fn migrations_set_the_user_version_matching_their_registry_version() {
        for migration in build_migrations() {
            let pragma = format!("PRAGMA user_version = {};", migration.version);
            let sets_other_version = migration.sql.contains("PRAGMA user_version")
                && !migration.sql.contains(&pragma);
            assert!(
                !sets_other_version,
                "migration {} ({}) sets a different user_version",
                migration.version, migration.description
            );
        }
    }
}
