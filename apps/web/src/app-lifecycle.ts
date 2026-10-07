// Installed PWAs can resume without a new navigation, focus event, or network change.
export function whenAppResumes(callback: () => void) {
  const visible = () => {
    if (document.visibilityState === "visible") callback();
  };
  for (const event of ["online", "focus", "pageshow"])
    window.addEventListener(event, visible);
  document.addEventListener("visibilitychange", visible);
  return () => {
    for (const event of ["online", "focus", "pageshow"])
      window.removeEventListener(event, visible);
    document.removeEventListener("visibilitychange", visible);
  };
}
