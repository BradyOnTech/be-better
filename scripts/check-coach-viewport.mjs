// Playwright regression helper. Pass a page showing Coach on an isolated server.
export default async function checkCoachViewport(page) {
  await page.locator("#coach-message").waitFor();
  return page.evaluate(async () => {
    const viewport = window.visualViewport;
    if (!viewport)
      throw new Error("Visual viewport API is required for this check.");
    const frame = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    const field = document.querySelector("#coach-message");
    field.focus();
    const check = () => {
      const shell = document
        .querySelector(".coach-view")
        .getBoundingClientRect();
      const composer = document
        .querySelector(".composer")
        .getBoundingClientRect();
      const top = viewport.offsetTop,
        bottom = top + viewport.height;
      if (
        Math.abs(shell.top - top) > 1 ||
        composer.top < top ||
        composer.bottom > bottom + 1
      )
        throw new Error(
          `Coach input is outside the visible screen: shell=${shell.top}, composer=${composer.top}..${composer.bottom}, screen=${top}..${bottom}`,
        );
      if (
        getComputedStyle(document.querySelector(".mobile-navigation"))
          .display !== "none"
      )
        throw new Error("Bottom tabs must yield space to the keyboard.");
    };
    try {
      Object.defineProperty(viewport, "height", {
        configurable: true,
        value: 350,
      });
      Object.defineProperty(viewport, "offsetTop", {
        configurable: true,
        value: 180,
      });
      viewport.dispatchEvent(new Event("resize"));
      await frame();
      check();
      Object.defineProperty(viewport, "offsetTop", {
        configurable: true,
        value: 260,
      });
      viewport.dispatchEvent(new Event("scroll"));
      await frame();
      check();
      Object.defineProperty(viewport, "height", {
        configurable: true,
        value: 280,
      });
      Object.defineProperty(viewport, "offsetTop", {
        configurable: true,
        value: 0,
      });
      viewport.dispatchEvent(new Event("resize"));
      await frame();
      check();
      return {
        resize: "passed",
        viewportPan: "passed",
        smallKeyboardViewport: "passed",
      };
    } finally {
      delete viewport.height;
      delete viewport.offsetTop;
      field.blur();
      viewport.dispatchEvent(new Event("resize"));
      await frame();
      if (
        getComputedStyle(document.querySelector(".mobile-navigation"))
          .display === "none"
      )
        throw new Error(
          "Bottom tabs did not return after closing the keyboard.",
        );
    }
  });
}
