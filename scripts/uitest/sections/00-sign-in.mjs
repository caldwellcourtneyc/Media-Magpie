import { BASE, PASSWORD, ok } from "../harness.mjs";

// sign in through the form
export default async function signIn(t) {
  const { page, main } = t;
  await page.goto(BASE + "/");
  ok("unsigned visit lands on sign-in", page.url().includes("/login"));
  await page.fill('input[name="password"]', "wrong");
  await page.click('button:has-text("Sign in")');
  await page.locator(".err").waitFor();
  ok("wrong password shows an error", (await page.locator(".err").innerText()).includes("did not match"));
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");
  await main.waitFor();
  ok("signs in to Now", await page.locator(".now").isVisible());
}
