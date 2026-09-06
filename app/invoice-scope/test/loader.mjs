// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Node has no import map. The page maps `gg/` to the shared library in `app/_lib/`; this hook does
// the same for the tests — and sends `gg/store.js` to the fake store instead, so the rules in
// `model.js` can be exercised without a browser.
//
// **Only `store.js` is swapped.** Everything else in `_lib/` is the real file: a test harness that
// replaces more than it must ends up testing itself.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/model.mjs

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === "gg/store.js") {
      const fake = new URL("./fake-store.mjs", context.parentURL.includes("/test/")
        ? context.parentURL
        : new URL("../test/", context.parentURL));
      return next(fake.href, context);
    }
    if (specifier.startsWith("gg/")) {
      const base = new URL("../../_lib/", context.parentURL);
      return next(new URL(specifier.slice(3), base).href, context);
    }
    return next(specifier, context);
  }
`), pathToFileURL("./"));
