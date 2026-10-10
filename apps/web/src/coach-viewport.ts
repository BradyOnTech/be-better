// iOS keyboards can both resize and pan the visual viewport. Follow both so
// the fixed coach shell and composer stay inside the visible part of the page.
// Standalone iOS apps may shrink the layout viewport with the keyboard too, so
// keyboard detection compares against the tallest height seen at this width
// rather than window.innerHeight.
export function bindCoachViewport() {
  const root = document.documentElement;
  const touch = window.matchMedia("(pointer: coarse)");
  let frame = 0;
  let fullHeight = 0;
  let fullWidth = 0;
  const update = () => {
    const viewport = window.visualViewport;
    const unzoomed = !viewport || viewport.scale === 1;
    const height = unzoomed
      ? (viewport?.height ?? window.innerHeight)
      : window.innerHeight;
    const top = unzoomed ? (viewport?.offsetTop ?? 0) : 0;
    if (window.innerWidth !== fullWidth) {
      fullWidth = window.innerWidth;
      fullHeight = 0;
    }
    fullHeight = Math.max(fullHeight, height, window.innerHeight);
    const typing = !!document.activeElement?.matches(".composer textarea");
    root.style.setProperty("--app-height", `${height}px`);
    root.style.setProperty("--app-top", `${top}px`);
    root.classList.toggle(
      "coach-keyboard-open",
      unzoomed && typing && (touch.matches || height < fullHeight - 120),
    );
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  root.classList.add("coach-active");
  window.scrollTo(0, 0);
  update();
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", schedule);
  return () => {
    cancelAnimationFrame(frame);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", update);
    document.removeEventListener("focusout", schedule);
    root.classList.remove("coach-active", "coach-keyboard-open");
    root.style.removeProperty("--app-height");
    root.style.removeProperty("--app-top");
  };
}
