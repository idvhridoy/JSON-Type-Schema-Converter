export type TargetFormat =
  | 'typescript-interface'
  | 'typescript-type'
  | 'zod'
  | 'typebox'
  | 'json-schema'
  | 'valibot';

export type OptionalMode = 'none' | 'detectNull' | 'allOptional';

export type ExecutionEngine = 'local' | 'worker' | 'server' | 'ai';

export interface ConverterOptions {
  rootTypeName: string;
  targetFormat: TargetFormat;
  inferStringFormats: boolean;
  optionalMode: OptionalMode;
  generateTypeAliases: boolean;
  readonlyFields: boolean;
  collapseNestedTypes: boolean;
  addComments: boolean;
  exportStyle: 'export' | 'declare' | 'none';
  executionEngine: ExecutionEngine;
}

export interface SchemaMetadata {
  typesGeneratedCount: number;
  totalPropertiesCount: number;
  maxDepth: number;
  durationMs: number;
  inputByteSize: number;
  linesCount: number;
}

export interface JsonSyntaxErrorDetail {
  line: number;
  column: number;
  position: number;
  message: string;
}

export interface ConversionResult {
  code: string;
  metadata: SchemaMetadata;
  error?: string;
  syntaxError?: JsonSyntaxErrorDetail;
  engineUsed: ExecutionEngine;
  warnings?: string[];
}

export interface PresetPayload {
  id: string;
  name: string;
  category: string;
  description: string;
  data: Record<string, unknown> | unknown[];
}
