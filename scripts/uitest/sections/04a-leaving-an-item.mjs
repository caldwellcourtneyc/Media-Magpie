import { ok } from "../harness.mjs";

// 4a. leaving an item: the phone drags the sheet down, the desk uses the X. Either way
// the item was one history step, so Back then leaves Now instead of landing on it again.
export default async function leavingAnItem(t) {
  const { phone, page, main, goView } = t;
  const nowUrl = page.url();
  await main.locator(".poster").first().click();
  await page.locator(".isheet").waitFor();
  if (phone) {
    ok("the phone sheet shows a grab bar", await page.locator(".isheet .sheet-grab").isVisible());
    await page.evaluate(async () => {
      const el = document.querySelector(".isheet .ihero");
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const at = (y) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })];
      const fire = (type, y) =>
        el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : at(y), changedTouches: at(y) }));
      fire("touchstart", r.top + 20);
      for (let d = 20; d <= 220; d += 40) {
        fire("touchmove", r.top + 20 + d);
        await new Promise((res) => setTimeout(res, 16));
      }
      fire("touchend", r.top + 240);
    });
  } else await page.locator('.isheet [aria-label="Close"]').click();
  const closed = await page.waitForFunction((u) => !document.querySelector(".sheet") && location.href === u, nowUrl, { timeout: 4000 }).then(() => true, () => false);
  ok(phone ? "dragging the item sheet down closes it" : "the X closes the item sheet", closed);
  await page.goBack();
  const left = await page.waitForFunction((u) => location.href !== u, nowUrl, { timeout: 4000 }).then(() => true, () => false);
  ok("Back after closing an item leaves Now", left && !(await page.locator(".sheet").count()));
  await goView("Now");
}
