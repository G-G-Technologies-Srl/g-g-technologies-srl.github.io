// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Node has no import map. The page maps `gg/` to the shared library in `app/_lib/`, and `biz/` to
// the business one in `app/_business/`; this hook does the same for the tests, so that a module
// which imports `./i18n.js` can be loaded here.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/editor.mjs

import { register } from "node:module";
import { pathToFileURL } from "node:url";

// The two roots are fixed, not worked out from the importing file: since `_business/plan-editor.js`
// imports `gg/dom.js`, a base relative to the caller would send it one directory too high.
const LIB = new URL("../../_lib/", import.meta.url).href;
const BIZ = new URL("../../_business/", import.meta.url).href;

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.startsWith("gg/")) {
      return next(new URL(specifier.slice(3), ${JSON.stringify(LIB)}).href, context);
    }
    if (specifier.startsWith("biz/")) {
      return next(new URL(specifier.slice(4), ${JSON.stringify(BIZ)}).href, context);
    }
    return next(specifier, context);
  }
`), pathToFileURL("./"));
