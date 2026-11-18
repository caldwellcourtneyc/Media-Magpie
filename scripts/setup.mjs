// First-run helper: if there is no .env.local and no APP_PASSWORD in the
// environment, create .env.local with a random password so the app can start.
// Never overwrites an existing .env.local.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const file = path.join(process.cwd(), ".env.local");
if (!process.env.APP_PASSWORD && !fs.existsSync(file)) {
  const password = crypto.randomBytes(9).toString("base64url");
  fs.writeFileSync(
    file,
    [
      "# Local settings. This file is gitignored. See .env.example for every option.",
      "# The password for the sign-in screen:",
      `APP_PASSWORD=${password}`,
      "",
    ].join("\n")
  );
  console.log("\n  Created .env.local with a new password. Open .env.local to see it.\n");
}
