// UI click-through against throwaway production servers (temp DBs): first an empty library for the
// welcome, then one with the demo seed for everything else. Never your data.
// usage: npm run build, then npm run uitest. Screenshots go to test-results/uishots.
// Needs Playwright and a browser, neither of which the app depends on: scripts/uitest/browser.mjs
// says where they are looked for.
// The parts live in scripts/uitest/: harness.mjs (server, fixtures, tally), browser.mjs, session.mjs (one
// browser session per size and color scheme), first-run.mjs, and sections/ (the numbered flows).
import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "./uitest/browser.mjs";
import { COMBOS, FIXTURE, FIXTURE0, ROOT, boot, crashed, halt, ok, removeTemp, report } from "./uitest/harness.mjs";
import { openSession } from "./uitest/session.mjs";
import firstRun from "./uitest/first-run.mjs";

// The numbered sections, in file-name order: each builds on what the ones before it left in the library.
const sectionsDir = new URL("./uitest/sections/", import.meta.url);
const SECTIONS = [];
for (const file of fs.readdirSync(sectionsDir).sort()) SECTIONS.push((await import(new URL(file, sectionsDir))).default);

let server = null;
const browser = await launchBrowser();
try {
  // 0. First run: no seed file means an empty library, a welcome with three first steps, and a faint shelf of examples.
  //    SEED_FILE is left unset (an empty value reads as unset); a personal seed in this checkout would load
  //    instead, as documented, so then the same checks run on SEED_FILE=none.
  const personalSeed = fs.existsSync(path.join(ROOT, "data/seed.personal.json"));
  server = await boot("db0", { SEED_FILE: personalSeed ? "none" : "", LOOKUP_FIXTURE: FIXTURE0 });
  for (const c of COMBOS) await firstRun(browser, c);
  await halt(server);
  server = await boot("db", { SEED_FILE: path.join(ROOT, "seed/demo.json"), LOOKUP_FIXTURE: FIXTURE });

  for (const c of COMBOS) {
    console.log(`\n== ${c.name} (${c.w}x${c.h}, ${c.scheme})`);
    const t = await openSession(browser, c);
    for (const section of SECTIONS) await section(t);
    ok("no page errors", t.errs.length === 0, t.errs.join(" | "));
    await t.ctx.close();
  }
} catch (e) {
  crashed(e);
} finally {
  await browser.close();
  server?.kill();
  await new Promise((r) => setTimeout(r, 800));
  removeTemp();
}
if (!report()) process.exit(1);
