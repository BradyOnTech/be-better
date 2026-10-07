import { useCallback, useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { whenAppResumes } from "./app-lifecycle.js";

// Keep update discovery alive on the connection screen too, before API bootstrap.
export function PwaUpdates() {
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const checking = useRef(false);
  const check = useCallback(async () => {
    if (!registration.current || checking.current) return;
    checking.current = true;
    try {
      await registration.current.update();
    } catch {
      // A failed update check must preserve the installed shell and upload outbox.
    } finally {
      checking.current = false;
    }
  }, []);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, value) {
      registration.current = value;
      void check();
    },
  });
  useEffect(() => {
    const stop = whenAppResumes(() => void check());
    const timer = setInterval(() => {
      if (!document.hidden) void check();
    }, 60000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [check]);
  return needRefresh ? (
    <div className="update-banner" role="status">
      An app update is ready.
      <button onClick={() => void updateServiceWorker(true)}>Update now</button>
    </div>
  ) : null;
}
