try {
  process.loadEnvFile();
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e;
}
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  process.env.OTEL_SERVICE_NAME ||= 'warband-' + (process.env.ROLE || 'all');
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } }),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
  process.on('SIGINT', () => void sdk.shutdown());
}
await import('./index');
export {};
