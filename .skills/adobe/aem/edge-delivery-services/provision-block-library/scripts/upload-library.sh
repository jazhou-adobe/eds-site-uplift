#!/bin/bash
# Upload the generated DA Library (block docs, template docs, sheets) to the DA
# Source API. Does NOT touch /.da/config — run register-library-config.mjs for that.
#
# Env:
#   ORG, SITE   DA org + site (required)
#   DA_TOKEN    Adobe IMS access token (required — see the da-auth skill)
#   OUT         artifact dir from build-library.mjs (default: build/library)
#
# Usage: ORG=myorg SITE=mysite DA_TOKEN=… ./upload-library.sh
set -euo pipefail

: "${ORG:?set ORG}"; : "${SITE:?set SITE}"; : "${DA_TOKEN:?set DA_TOKEN (see da-auth skill)}"
OUT="${OUT:-build/library}"
API="https://admin.da.live/source/$ORG/$SITE/library"

put() {
  local file="$1" rel="$2" ctype="$3"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
    -H "Authorization: Bearer $DA_TOKEN" \
    -F "data=@$file;type=$ctype" \
    "$API/$rel")
  printf '  %s  library/%s\n' "$code" "$rel"
}

echo "Uploading block documents…"
for f in "$OUT"/blocks/*.html; do put "$f" "blocks/$(basename "$f")" text/html; done

if compgen -G "$OUT/templates/*.html" > /dev/null; then
  echo "Uploading template documents…"
  for f in "$OUT"/templates/*.html; do put "$f" "templates/$(basename "$f")" text/html; done
fi

echo "Uploading sheets…"
put "$OUT/blocks.json" "blocks.json" application/json
[ -f "$OUT/templates.json" ] && put "$OUT/templates.json" "templates.json" application/json

echo "Next: register the library in /.da/config →  ORG=$ORG SITE=$SITE DA_TOKEN=… node $(dirname "$0")/register-library-config.mjs"
