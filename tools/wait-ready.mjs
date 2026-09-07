const deadline = Date.now() + 60_000;
const urls = ['http://127.0.0.1:4178', 'http://127.0.0.1:3001/api/health'];
while (Date.now() < deadline) {
  const ready = await Promise.all(
    urls.map(async (url) => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
      } catch {
        return false;
      }
    }),
  );
  if (ready.every(Boolean)) process.exit(0);
  await new Promise((resolve) => setTimeout(resolve, 500));
}
console.error('Warband did not become ready within 60 seconds.');
process.exit(1);
