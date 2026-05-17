#!/usr/bin/env bash
# Builds a jlink-minimized JRE into tools/jre/. This is the runtime that ships
# alongside the KoSIT validator so users don't need a system Java.
#
# Module set was determined via `jdeps --print-module-deps` on validator-1.6.2,
# plus a few extras Saxon-HE needs at runtime (xml, scripting, naming).
# Resulting JRE is ~50 MB uncompressed, ~35 MB after bundle compression.
#
# Requires: jlink on PATH (any JDK 17+).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$ROOT/jre"

if ! command -v jlink >/dev/null 2>&1; then
  echo "✗ jlink not found on PATH. Install a JDK 17+ first." >&2
  exit 1
fi

if [[ -d "$DEST" ]]; then
  echo "→ removing existing $DEST"
  rm -rf "$DEST"
fi

# Module set:
#   java.base         — mandatory
#   java.compiler     — Saxon JAXP factory introspection
#   java.desktop      — Saxon font/image fallbacks (rarely hit, but loaded)
#   java.logging      — KoSIT framework
#   java.naming       — JNDI lookups in Saxon's URI resolver
#   java.scripting    — XSLT script engine bridge
#   java.xml          — XSD/XSLT/Schematron core
#   jdk.httpserver    — KoSIT daemon mode (we don't use it, but jdeps flags it)
#   jdk.unsupported   — sun.misc.* fallbacks in older Saxon paths
MODULES="java.base,java.compiler,java.desktop,java.logging,java.naming,java.scripting,java.xml,jdk.httpserver,jdk.unsupported"

echo "→ jlink into $DEST"
jlink \
  --add-modules "$MODULES" \
  --strip-debug \
  --no-header-files \
  --no-man-pages \
  --compress=2 \
  --output "$DEST"

JAVA="$DEST/bin/java"
[[ -x "$JAVA" ]] || JAVA="$DEST/bin/java.exe"
"$JAVA" -version 2>&1 | head -1

size=$(du -sh "$DEST" 2>/dev/null | awk '{print $1}')
echo "✓ JRE ready in $DEST ($size)"
