const base = process.argv[2] || "http://127.0.0.1:3001";
const url = new URL("/api/health", base);
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const health = await response.json().catch(() => null);
  if (!response.ok || health?.ok !== true)
    throw new Error(`HTTP ${response.status}; API is unavailable.`);
  console.log(`${url.origin}: HTTP ${response.status}, API reachable.`);
} catch (error) {
  console.error(`${url.origin}: ${error.message}`);
  process.exitCode = 1;
}
