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
const traceExporter = new OTLPTraceExporter();

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

import express, { Request, Response } from 'express';
import healthcheck from 'express-healthcheck';
import { fetchFromService } from "./internal-service-lib";

const app = express();
const PORT = 10115;
app.use(express.json());
app.use('/health', healthcheck());


app.post('/createPicture', async (req: Request, res: Response) => {
    
    const span = opentelemetry.trace.getActiveSpan();
    const bunyan = require('bunyan');
    const logger = bunyan.createLogger({name: 'myapp', level: 'info'});

    try {
        logger.info({'app.message':'/createPicture Running'});
        const [phraseResponse, imageResponse] = await Promise.all([
            fetchFromService('phrase-picker'),
            fetchFromService('image-picker')
        ]);
        const phraseText = phraseResponse.ok ? await phraseResponse.text() : "{}";
        const imageText = imageResponse.ok ? await imageResponse.text() : "{}";
        span?.setAttributes({ "app.phraseResponse": phraseText, "app.imageResponse": imageText });
        const phraseResult = JSON.parse(phraseText);
        const imageResult = JSON.parse(imageText);

        const response = await fetchFromService('meminator', {
            method: "POST",
            body: {
                ...phraseResult, ...imageResult
            }
        });

        if (!response.ok) {
            logger.info({'app.message':'Failed to fetch picture'});
            throw new Error(`Failed to fetch picture from meminator: ${response.status} ${response.statusText}`);
        }
        if (response.body === null) {
            logger.info({'app.message':'Failed to fetch picture'});
            throw new Error(`Failed to fetch picture from meminator: ${response.status} ${response.statusText}`);
        }

        res.contentType('image/png');
        // Read the response body as binary data
        const reader = response.body.getReader();
        // Stream the chunks of the picture data to the response as they are received
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            res.write(value);

        }
        logger.info({'app.message':'/createPicture Finished'});
        span?.end()
        res.end()

    } catch (error) {
        console.error('Error creating picture:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Asynchronous fuction for creating a custom span with a new trace.
// app.get("/sleep", async (req: Request, res: Response) => {
//     for(let i = 0; i < 5; i++){
//         const childSpan = tracer.startSpan('sleepy child span') 
//         childSpan?.setAttributes({ "app.timePassed": i})
//         console.log("time passes %d", i)
//         await new Promise(resolve => setTimeout(resolve, 400)); // let some time pass.
//         childSpan.end()
//     }
//     res.status(200).send("Awake time!\r\n")
// });