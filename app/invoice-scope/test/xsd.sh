#!/bin/sh
# Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0
#
# The one check Node cannot make: the sample invoices against the official XSD.
#
# There is no XSD validator in a browser, which is why the app emits a declared subset and checks
# that subset by hand (run/validate.js). This script is the other half of that bargain: on a
# developer's machine, where a real validator exists, the output is put in front of the real
# schema.
#
# The schema is NOT in the repository. It is not ours to redistribute, it changes about once a
# year, and a copy committed here would quietly become the version we validate against long after
# the Agenzia has moved on. Download it once, into test/schema/, as test/schema/README.md explains.
#
#     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/samples.mjs
#     sh   app/invoice-scope/test/xsd.sh        # validates it

set -eu

here=$(dirname "$0")
schema="$here/schema/Schema_del_file_xml_FatturaPA_v1.2.3.xsd"
out="$here/out"

if ! command -v xmllint >/dev/null 2>&1; then
  echo "xmllint non è installato."
  echo "  macOS:  è in libxml2, di solito già presente"
  echo "  Debian: apt install libxml2-utils"
  exit 2
fi

if [ ! -f "$schema" ]; then
  echo "Manca lo schema ufficiale: $schema"
  echo "Leggi $here/schema/README.md — si scarica una volta e non si committa."
  exit 2
fi

if [ ! -d "$out" ]; then
  echo "Mancano i documenti di prova. Prima: node $here/samples.mjs"
  exit 2
fi

failed=0
for file in "$out"/*.xml; do
  if xmllint --noout --schema "$schema" "$file" 2>/dev/null; then
    echo "ok       $(basename "$file")"
  else
    echo "FALLITO  $(basename "$file")"
    xmllint --noout --schema "$schema" "$file" 2>&1 | sed 's/^/         /'
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo "$failed documenti non passano lo schema ufficiale."
  exit 1
fi

echo "Tutti i documenti passano lo schema ufficiale."
