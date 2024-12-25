// tracing.ts
import { NodeSDK, logs } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import * as opentelemetry from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BunyanInstrumentation } from '@opentelemetry/instrumentation-bunyan';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_NAMESPACE, ATTR_SERVICE_VERSION, ATTR_SERVICE_INSTANCE_ID } from '@opentelemetry/semantic-conventions/incubating';

opentelemetry.diag.setLogger(
    new opentelemetry.DiagConsoleLogger(),
    opentelemetry.DiagLogLevel.INFO
);

// The Trace Exporter exports the data to Honeycomb and uses
// environment variables for endpoint, service name, and API Key.
const traceExporter = new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',  // Replace with your Collector's endpoint
  })

const sdk = new NodeSDK({
    traceExporter,
    resource: new Resource({
        [ ATTR_SERVICE_NAMESPACE ]: "meme-namespace",
        [ ATTR_SERVICE_VERSION ]: "1.0",
        [ ATTR_SERVICE_INSTANCE_ID ]: "my-instance-id-1",
    }),
    logRecordProcessor: new logs.SimpleLogRecordProcessor(new OTLPLogExporter()),
    // spanProcessors: [new ConfigurationSpanProcessor(), new BatchSpanProcessor(traceExporter)], // INSTRUMENTATION: report global configuration on every span
    instrumentations: [
        getNodeAutoInstrumentations(),
        new BunyanInstrumentation(),
    ] 
});

sdk.start();

console.log("Started OpenTelemetry SDK");

process.on('SIGTERM', () => {
    sdk
    .shutdown()
    .finally(() => process.exit(0));
});