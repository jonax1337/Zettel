#!/usr/bin/env bash
# Downloads KoSIT validator + xrechnung scenarios into tools/kosit-validator/.
# Run once for local dev. CI calls the same script. End-users get the validator
# downloaded on first use by the app itself (see validator.rs:download_validator).
set -euo pipefail

VALIDATOR_VERSION="1.6.2"
SCENARIO_VERSION="2026-01-31"
SCENARIO_XRECHNUNG_VERSION="3.0.2"

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$ROOT/kosit-validator"

mkdir -p "$DEST"
cd "$DEST"

if [[ ! -f "validator.jar" ]]; then
  echo "→ downloading validator ${VALIDATOR_VERSION}…"
  curl -fSL -o validator.jar \
    "https://github.com/itplr-kosit/validator/releases/download/v${VALIDATOR_VERSION}/validator-${VALIDATOR_VERSION}-standalone.jar"
fi

if [[ ! -f "scenarios.xml" ]]; then
  echo "→ downloading xrechnung scenarios ${SCENARIO_VERSION}…"
  curl -fSL -o scenarios.zip \
    "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v${SCENARIO_VERSION}/xrechnung-${SCENARIO_XRECHNUNG_VERSION}-validator-configuration-${SCENARIO_VERSION}.zip"
  unzip -q scenarios.zip
  # The zip extracts into a versioned subdirectory; flatten it.
  inner="$(find . -maxdepth 1 -type d -name 'xrechnung-*' | head -n1)"
  if [[ -n "$inner" ]]; then
    cp -R "$inner"/* .
    rm -rf "$inner"
  fi
  rm -f scenarios.zip
fi

echo "✓ validator ready in $DEST"
echo "  jar:        $(ls -la validator.jar | awk '{print $5}') bytes"
echo "  scenarios:  $(ls scenarios.xml 2>/dev/null && echo OK || echo MISSING)"
