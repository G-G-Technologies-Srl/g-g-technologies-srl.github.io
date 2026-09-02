// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Node has no import map. The page maps `gg/` to the shared library in `app/_lib/`; this hook
// does the same for the tests, so that a module which imports `./i18n.js` can be loaded here.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/editor.mjs

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.startsWith("gg/")) {
      const base = new URL("../../_lib/", context.parentURL);
      return next(new URL(specifier.slice(3), base).href, context);
    }
    return next(specifier, context);
  }
`), pathToFileURL("./"));
