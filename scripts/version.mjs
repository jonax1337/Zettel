#!/usr/bin/env node
// Keeps the app version identical in every manifest that carries it.
//
//   node scripts/version.mjs set 0.23.0-rc.1   bump all manifests
//   node scripts/version.mjs check [v0.23.0]   fail unless all manifests agree (and match the tag)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const JSON_VERSION = /("version":\s*")[^"]+(")/;
const CARGO_PACKAGE_VERSION = /(\[package\]\r?\nname = "zettel"\r?\nversion = ")([^"]+)(")/;
const LOCK_PACKAGE_VERSION = /(\[\[package\]\]\r?\nname = "zettel"\r?\nversion = ")([^"]+)(")/;

const read = (path) => readFileSync(ROOT + path, "utf8");
const write = (path, text) => writeFileSync(ROOT + path, text);

function captureVersion(text, pattern, path) {
  const match = text.match(pattern);
  if (!match) throw new Error(`Keine zettel-Version in ${path} gefunden.`);
  return match[2];
}

const jsonManifest = (path) => ({
  path,
  get: (text) => JSON.parse(text).version,
  set: (text, version) => text.replace(JSON_VERSION, `$1${version}$2`),
});

const cargoManifest = (path, pattern) => ({
  path,
  get: (text) => captureVersion(text, pattern, path),
  set: (text, version) => text.replace(pattern, `$1${version}$3`),
});

const manifests = [
  jsonManifest("package.json"),
  jsonManifest("src-tauri/tauri.conf.json"),
  cargoManifest("src-tauri/Cargo.toml", CARGO_PACKAGE_VERSION),
  cargoManifest("src-tauri/Cargo.lock", LOCK_PACKAGE_VERSION),
];

function setVersion(version) {
  if (!SEMVER.test(version)) {
    throw new Error(`"${version}" ist keine SemVer-Version (z. B. 0.23.0 oder 0.23.0-rc.1).`);
  }
  for (const { path, get, set } of manifests) {
    const updated = set(read(path), version);
    if (get(updated) !== version) throw new Error(`Version in ${path} konnte nicht gesetzt werden.`);
    write(path, updated);
    console.log(`${path}: ${version}`);
  }
}

function checkVersion(tag) {
  const found = manifests.map(({ path, get }) => ({ path, version: get(read(path)) }));
  for (const { path, version } of found) console.log(`${path}: ${version}`);
  const expected = tag ? tag.replace(/^v/, "") : found[0].version;
  const mismatches = found.filter(({ version }) => version !== expected);
  if (mismatches.length > 0) {
    const list = mismatches.map(({ path, version }) => `${path} (${version})`).join(", ");
    throw new Error(`Erwartet ${expected}, abweichend: ${list}. Fix: node scripts/version.mjs set ${expected}`);
  }
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === "set" && argument) setVersion(argument);
  else if (command === "check") checkVersion(argument);
  else throw new Error("Usage: node scripts/version.mjs set <version> | check [tag]");
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
