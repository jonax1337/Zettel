use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime, plugin::TauriPlugin};
use tauri_plugin_sql::{Migration, MigrationKind, PluginConfig};
use tauri_plugin_window_state::StateFlags;

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
        (28, "v0.23_lifecycle", "0027_v0.23_lifecycle"),
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

const MAIN_WINDOW: &str = "main";
const MAIN_WINDOW_REVEAL_TIMEOUT: Duration = Duration::from_secs(5);

/// The main window starts hidden (`tauri.conf.json`) so the saved size is
/// restored and the first frame painted before anyone sees it. Showing it is
/// the frontend's job (`main.ts`), so window-state must not show it.
fn window_state_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_window_state::Builder::default()
        .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
        .build()
}

/// Safety net: show the main window even if the frontend never does (e.g. it
/// failed to load), so the app cannot keep running invisibly.
fn reveal_main_window_after_timeout(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(MAIN_WINDOW_REVEAL_TIMEOUT);
        let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
            return;
        };
        if window.is_visible().unwrap_or(true) {
            return;
        }
        if let Err(e) = window.show() {
            eprintln!("Could not show main window: {e}");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Apply any pending restore BEFORE the SQL plugin opens the DB.
    backup::apply_pending_restore_blocking();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(window_state_plugin())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(sql_plugin())
        .setup(|app| {
            reveal_main_window_after_timeout(app.handle().clone());
            Ok(())
        })
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

    mod lifecycle_migration {
        use super::*;
        use crate::testutil::TempDir;
        use rusqlite::Connection;

        const LIFECYCLE_VERSION: i64 = 28;

        fn open(path: &std::path::Path) -> Connection {
            let conn = Connection::open(path).unwrap();
            conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
            conn
        }

        /// Mirrors sqlx: each migration in its own transaction, foreign keys enforced.
        fn migrate(conn: &mut Connection, versions: std::ops::RangeInclusive<i64>) {
            for migration in build_migrations() {
                if !versions.contains(&migration.version) {
                    continue;
                }
                let tx = conn.transaction().unwrap();
                tx.execute_batch(migration.sql)
                    .unwrap_or_else(|e| panic!("migration {}: {e}", migration.version));
                tx.commit().unwrap();
            }
        }

        fn seed_version_27(conn: &Connection) {
            conn.execute_batch(
                "INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme');
                 INSERT INTO invoices (id, number, customer_id, issue_date, due_date, status, total)
                   VALUES (1, 'RE-2026-0001', 1, 1, 1, 'sent', 10000),
                          (2, 'RE-2026-0002', 1, 1, 1, 'paid', 5000);
                 INSERT INTO invoices (id, number, customer_id, issue_date, due_date, status, total,
                                       is_credit_note, corrects_invoice_id)
                   VALUES (3, 'RE-2026-0003', 1, 1, 1, 'sent', -5000, 1, 2);
                 INSERT INTO invoice_items (invoice_id, position, unit_price, line_total)
                   VALUES (1, 1, 10000, 10000), (2, 1, 5000, 5000), (3, 1, -5000, -5000);
                 INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent)
                   VALUES (2, 1, 5000), (1, 1, 4000);
                 INSERT INTO reminders (number, invoice_id, issue_date, due_date) VALUES ('MA-1', 1, 1, 1);
                 INSERT INTO offers (id, number, customer_id, issue_date, valid_until,
                                     is_reverse_charge, converted_invoice_id)
                   VALUES (1, 'AN-1', 1, 1, 1, 1, 1);
                 INSERT INTO recurring_invoices (id, name, customer_id, interval, start_date,
                                                 next_due_date, is_reverse_charge)
                   VALUES (1, 'Wartung', 1, 'monthly', 1, 1, 0);",
            )
            .unwrap();
        }

        fn count(conn: &Connection, sql: &str) -> i64 {
            conn.query_row(sql, [], |row| row.get(0)).unwrap()
        }

        fn row_counts(conn: &Connection) -> Vec<i64> {
            [
                "SELECT COUNT(*) FROM invoices",
                "SELECT COUNT(*) FROM invoice_items",
                "SELECT COUNT(*) FROM invoice_payments",
                "SELECT COUNT(*) FROM reminders",
                "SELECT COUNT(*) FROM offers WHERE converted_invoice_id = 1",
                "SELECT COUNT(*) FROM invoices WHERE corrects_invoice_id = 2",
            ]
            .iter()
            .map(|sql| count(conn, sql))
            .collect()
        }

        struct Migrated {
            _dir: TempDir,
            conn: Connection,
            other_pool_connection: Connection,
            counts_before: Vec<i64>,
        }

        fn migrated_from_version_27() -> Migrated {
            let dir = TempDir::new("lifecycle-migration");
            let path = dir.path().join("zettel.db");
            let mut conn = open(&path);
            migrate(&mut conn, 1..=LIFECYCLE_VERSION - 1);
            seed_version_27(&conn);
            let counts_before = row_counts(&conn);
            // A second pooled connection that cached the old schema before the migration.
            let other_pool_connection = open(&path);
            count(&other_pool_connection, "SELECT COUNT(*) FROM invoices");

            migrate(&mut conn, LIFECYCLE_VERSION..=LIFECYCLE_VERSION);
            Migrated { _dir: dir, conn, other_pool_connection, counts_before }
        }

        #[test]
        fn keeps_every_invoice_and_dependent_row() {
            let m = migrated_from_version_27();
            assert_eq!(row_counts(&m.conn), m.counts_before);
            assert_eq!(count(&m.conn, "PRAGMA user_version"), LIFECYCLE_VERSION);
        }

        #[test]
        fn passes_integrity_and_foreign_key_checks() {
            let m = migrated_from_version_27();
            let integrity: String = m
                .conn
                .query_row("PRAGMA integrity_check", [], |row| row.get(0))
                .unwrap();
            assert_eq!(integrity, "ok");
            let violations = m
                .conn
                .prepare("PRAGMA foreign_key_check")
                .unwrap()
                .query_map([], |_| Ok(()))
                .unwrap()
                .count();
            assert_eq!(violations, 0);
        }

        #[test]
        fn accepts_partial_status_on_every_connection_but_still_rejects_unknown_ones() {
            let m = migrated_from_version_27();
            for conn in [&m.conn, &m.other_pool_connection] {
                conn.execute("UPDATE invoices SET status = 'partial' WHERE id = 1", [])
                    .expect("'partial' must be accepted");
                assert!(conn
                    .execute("UPDATE invoices SET status = 'bogus' WHERE id = 1", [])
                    .is_err());
            }
        }

        #[test]
        fn repairs_sent_invoices_whose_partial_payment_was_recorded() {
            let m = migrated_from_version_27();
            let state = |id: i64| -> (String, i64) {
                m.conn
                    .query_row(
                        "SELECT status, amount_paid_cent FROM invoices WHERE id = ?1",
                        [id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .unwrap()
            };
            assert_eq!(state(1), ("partial".to_string(), 4000));
            assert_eq!(state(2), ("paid".to_string(), 0));
            assert_eq!(state(3), ("sent".to_string(), 0));
        }

        #[test]
        fn backfills_the_reverse_charge_type_of_offers_and_recurring_templates() {
            let m = migrated_from_version_27();
            let offer: String = m
                .conn
                .query_row("SELECT reverse_charge_type FROM offers WHERE id = 1", [], |r| r.get(0))
                .unwrap();
            let recurring: String = m
                .conn
                .query_row("SELECT reverse_charge_type FROM recurring_invoices WHERE id = 1", [], |r| {
                    r.get(0)
                })
                .unwrap();
            assert_eq!((offer.as_str(), recurring.as_str()), ("intra_eu", "none"));
        }

        #[test]
        fn rejects_a_second_payment_for_the_same_bank_transaction() {
            let m = migrated_from_version_27();
            let book = |tx: Option<&str>| {
                m.conn.execute(
                    "INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent, bank_transaction_id)
                     VALUES (1, 1, 100, ?1)",
                    [tx],
                )
            };
            book(Some("TX-1")).unwrap();
            assert!(book(Some("TX-1")).is_err());
            book(None).unwrap();
            book(None).unwrap();
        }
    }
}
