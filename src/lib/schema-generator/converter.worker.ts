import { ConverterOptions, ConversionResult } from '../../types/schema';
import { JsonAstEngine } from './engine';

export interface WorkerMessageRequest {
  id: string;
  rawJson: string;
  options: ConverterOptions;
}

export interface WorkerMessageResponse {
  id: string;
  result: ConversionResult;
}

self.onmessage = (e: MessageEvent<WorkerMessageRequest>) => {
  const { id, rawJson, options } = e.data;
  try {
    const engine = new JsonAstEngine(options);
    const result = engine.parseAndConvert(rawJson);
    result.engineUsed = 'worker';
    const response: WorkerMessageResponse = { id, result };
    self.postMessage(response);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const result: ConversionResult = {
      code: `// Worker processing error: ${errorMsg}`,
      metadata: {
        typesGeneratedCount: 0,
        totalPropertiesCount: 0,
        maxDepth: 0,
        durationMs: 0,
        inputByteSize: 0,
        linesCount: 0,
      },
      error: errorMsg,
      engineUsed: 'worker',
    };
    self.postMessage({ id, result });
  }
};
