-- v0.15: Automatisches Backup — rotierender Snapshot beim App-Start.
--
-- interval_days = 0 (Default) bedeutet aus. > 0 = Auto-Backup wenn der letzte
-- länger als das Intervall her ist. last_auto_backup_at hält den Unix-Timestamp
-- der letzten erfolgreichen Auto-Backup-Erstellung — manuelle Backups
-- aktualisieren das Feld bewusst NICHT (User-Intent ist sauber getrennt).

ALTER TABLE settings ADD COLUMN auto_backup_interval_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN last_auto_backup_at INTEGER;

PRAGMA user_version = 24;
