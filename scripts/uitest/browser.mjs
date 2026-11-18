// Finding Playwright and a browser to drive, wherever the UI test runs.
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const HOW = "The UI test needs Playwright, which is not one of the app's dependencies. Install it beside the app without saving it: npm install --no-save playwright-core. It then drives the Chrome you already have.";

/**
 * Playwright is taken from wherever it is: this repo, if you installed it there (playwright-core or
 * playwright); ~/.claude/tools, where the owner's machine keeps it; or the global npm folder, where a
 * cloud container has it.
 */
function loadPlaywright() {
  const here = createRequire(import.meta.url);
  const places = [
    () => here("playwright-core"),
    () => here("playwright"),
    () => createRequire(path.join(os.homedir(), ".claude/tools/package.json"))("playwright-core"),
    () => createRequire(path.join(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "package.json"))("playwright"),
  ];
  for (const place of places) {
    try {
      return place();
    } catch {
      /* not there: try the next place */
    }
  }
  throw new Error(HOW);
}

/** Chrome when it is installed, else the browser that came with Playwright. */
export async function launchBrowser() {
  const { chromium } = loadPlaywright();
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
