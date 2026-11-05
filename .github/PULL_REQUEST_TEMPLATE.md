## Was ändert sich?

<!-- 1–3 Sätze: was tut dieser PR? -->

## Warum?

<!-- Motivation, verlinkte Issues -->

## Checks

- [ ] `pnpm check` und `pnpm test` sind grün
- [ ] Falls Rust betroffen: `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test --lib` (in `src-tauri/`)
- [ ] Falls Sidecar/CLI betroffen: `pytest` in `sidecar/`
- [ ] Manuell getestet (mind. Happy-Path)
- [ ] Falls Sidecar/ZUGFeRD betroffen: Beispiel-Rechnung gegen einen Validator geprüft
- [ ] Falls UI-Änderung: keine Regression bei Light/Dark-Theme
- [ ] CLAUDE.md angepasst, falls Konventionen geändert wurden
- [ ] CHANGELOG.md (Unreleased-Block) ergänzt
