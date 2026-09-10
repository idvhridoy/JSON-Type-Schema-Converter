import {
  ConverterOptions,
  ConversionResult,
  JsonSyntaxErrorDetail,
  SchemaMetadata,
} from '../../types/schema';

export interface InferredTypeNode {
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object' | 'union' | 'any';
  format?: 'date-time' | 'date' | 'email' | 'url' | 'uuid' | 'ipv4';
  properties?: Map<string, InferredProperty>;
  items?: InferredTypeNode;
  unionTypes?: InferredTypeNode[];
  exampleValue?: unknown;
  extractedTypeName?: string;
}

export interface InferredProperty {
  type: InferredTypeNode;
  optional: boolean;
  nullable: boolean;
  exampleValue?: unknown;
  description?: string;
}

export class JsonAstEngine {
  private options: ConverterOptions;
  private extractedTypes: Map<string, InferredTypeNode> = new Map();
  private typeNameCounters: Map<string, number> = new Map();
  private totalPropsCount = 0;
  private maxDepthReached = 0;

  constructor(options: ConverterOptions) {
    this.options = options;
  }

  public parseAndConvert(rawJson: string): ConversionResult {
    const startTime = performance.now();
    this.extractedTypes.clear();
    this.typeNameCounters.clear();
    this.totalPropsCount = 0;
    this.maxDepthReached = 0;

    const trimmed = rawJson.trim();
    if (!trimmed) {
      return {
        code: '// Enter or paste a valid JSON payload to generate schemas',
        metadata: {
          typesGeneratedCount: 0,
          totalPropertiesCount: 0,
          maxDepth: 0,
          durationMs: 0,
          inputByteSize: 0,
          linesCount: 0,
        },
        engineUsed: this.options.executionEngine,
      };
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(trimmed);
    } catch (err: unknown) {
      const syntaxError = this.extractSyntaxErrorDetail(rawJson, err);
      return {
        code: `// JSON Syntax Error: ${syntaxError.message}\n// Line: ${syntaxError.line}, Column: ${syntaxError.column}`,
        metadata: {
          typesGeneratedCount: 0,
          totalPropertiesCount: 0,
          maxDepth: 0,
          durationMs: Math.round(performance.now() - startTime),
          inputByteSize: new TextEncoder().encode(rawJson).length,
          linesCount: rawJson.split('\n').length,
        },
        syntaxError,
        error: `Invalid JSON syntax at line ${syntaxError.line}, col ${syntaxError.column}: ${syntaxError.message}`,
        engineUsed: this.options.executionEngine,
      };
    }

    const rootNode = this.inferNode(parsedData, this.options.rootTypeName, 1);
    const code = this.emitCode(rootNode);
    const durationMs = Math.round(performance.now() - startTime);

    const metadata: SchemaMetadata = {
      typesGeneratedCount: this.extractedTypes.size + 1,
      totalPropertiesCount: this.totalPropsCount,
      maxDepth: this.maxDepthReached,
      durationMs,
      inputByteSize: new TextEncoder().encode(rawJson).length,
      linesCount: rawJson.split('\n').length,
    };

    return {
      code,
      metadata,
      engineUsed: this.options.executionEngine,
    };
  }

  private extractSyntaxErrorDetail(rawJson: string, err: unknown): JsonSyntaxErrorDetail {
    const message = err instanceof Error ? err.message : String(err);
    let position = -1;
    let line = 1;
    let column = 1;

    // Match "position X" in V8 error messages
    const posMatch = message.match(/position\s+(\d+)/i);
    if (posMatch) {
      position = parseInt(posMatch[1], 10);
    } else {
      // Match line and column if present (e.g. "at line X column Y")
      const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
      if (lineColMatch) {
        line = parseInt(lineColMatch[1], 10);
        column = parseInt(lineColMatch[2], 10);
      }
    }

    if (position >= 0) {
      const upToPos = rawJson.slice(0, position);
      const lines = upToPos.split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    }

    return {
      line,
      column,
      position: position >= 0 ? position : 0,
      message,
    };
  }

  private inferNode(value: unknown, contextName: string, depth: number): InferredTypeNode {
    if (depth > this.maxDepthReached) {
      this.maxDepthReached = depth;
    }

    if (value === null) {
      return { kind: 'null', exampleValue: null };
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return { kind: 'array', items: { kind: 'any' }, exampleValue: [] };
      }

      // If array of objects, merge object shapes
      const objectItems = value.filter((v) => v !== null && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[];
      if (objectItems.length > 0 && objectItems.length === value.length) {
        const mergedNode = this.inferMergedObject(objectItems, this.singularize(contextName), depth + 1);
        return { kind: 'array', items: mergedNode, exampleValue: value.slice(0, 2) };
      }

      // In general, infer types of elements
      const elementNodes = value.map((item, idx) =>
        this.inferNode(item, `${this.singularize(contextName)}Item${idx > 0 ? idx : ''}`, depth + 1)
      );

      const uniqueKinds = new Map<string, InferredTypeNode>();
      for (const node of elementNodes) {
        const key = node.kind === 'object' ? `object_${node.extractedTypeName || 'obj'}` : node.kind;
        if (!uniqueKinds.has(key)) {
          uniqueKinds.set(key, node);
        }
      }

      if (uniqueKinds.size === 1) {
        return { kind: 'array', items: Array.from(uniqueKinds.values())[0], exampleValue: value.slice(0, 2) };
      } else {
        return {
          kind: 'array',
          items: {
            kind: 'union',
            unionTypes: Array.from(uniqueKinds.values()),
          },
          exampleValue: value.slice(0, 2),
        };
      }
    }

    const valueType = typeof value;
    if (valueType === 'string') {
      const strVal = value as string;
      let format: InferredTypeNode['format'];
      if (this.options.inferStringFormats) {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(strVal)) {
          format = 'date-time';
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
          format = 'date';
        } else if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(strVal)) {
          format = 'email';
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(strVal)) {
          format = 'uuid';
        } else if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(strVal)) {
          format = 'url';
        } else if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(strVal)) {
          format = 'ipv4';
        }
      }
      return { kind: 'string', format, exampleValue: strVal };
    }

    if (valueType === 'number') {
      const numVal = value as number;
      const isInt = Number.isInteger(numVal);
      return { kind: isInt ? 'integer' : 'number', exampleValue: numVal };
    }

    if (valueType === 'boolean') {
      return { kind: 'boolean', exampleValue: value };
    }

    if (valueType === 'object') {
      const obj = value as Record<string, unknown>;
      const props = new Map<string, InferredProperty>();

      for (const [k, v] of Object.entries(obj)) {
        this.totalPropsCount++;
        const childNode = this.inferNode(v, this.toPascalCase(k), depth + 1);
        const isNull = v === null;
        let isOptional = false;

        if (this.options.optionalMode === 'allOptional') {
          isOptional = true;
        } else if (this.options.optionalMode === 'detectNull' && isNull) {
          isOptional = true;
        }

        props.set(k, {
          type: childNode,
          optional: isOptional,
          nullable: isNull,
          exampleValue: v,
        });
      }

      const node: InferredTypeNode = {
        kind: 'object',
        properties: props,
        exampleValue: obj,
      };

      if (this.options.collapseNestedTypes && depth > 1) {
        const uniqueName = this.getUniqueTypeName(contextName);
        node.extractedTypeName = uniqueName;
        this.extractedTypes.set(uniqueName, node);
      }

      return node;
    }

    return { kind: 'any', exampleValue: value };
  }

  private inferMergedObject(objects: Record<string, unknown>[], contextName: string, depth: number): InferredTypeNode {
    const allKeys = new Set<string>();
    for (const obj of objects) {
      Object.keys(obj).forEach((k) => allKeys.add(k));
    }

    const props = new Map<string, InferredProperty>();
    for (const key of allKeys) {
      this.totalPropsCount++;
      const valuesForKey = objects.map((obj) => obj[key]);
      const presentCount = objects.filter((obj) => key in obj).length;
      const hasNull = valuesForKey.some((v) => v === null);
      const isMissingInSome = presentCount < objects.length;

      const definedValues = valuesForKey.filter((v) => v !== undefined && v !== null);
      let childNode: InferredTypeNode;
      if (definedValues.length > 0) {
        childNode = this.inferNode(definedValues[0], this.toPascalCase(key), depth + 1);
      } else {
        childNode = { kind: 'null', exampleValue: null };
      }

      let isOptional = isMissingInSome || this.options.optionalMode === 'allOptional';
      if (this.options.optionalMode === 'detectNull' && (hasNull || isMissingInSome)) {
        isOptional = true;
      }

      props.set(key, {
        type: childNode,
        optional: isOptional,
        nullable: hasNull,
        exampleValue: definedValues[0] ?? null,
      });
    }

    const node: InferredTypeNode = {
      kind: 'object',
      properties: props,
      exampleValue: objects[0] ?? {},
    };

    if (this.options.collapseNestedTypes && depth > 1) {
      const uniqueName = this.getUniqueTypeName(contextName);
      node.extractedTypeName = uniqueName;
      this.extractedTypes.set(uniqueName, node);
    }

    return node;
  }

  private getUniqueTypeName(baseName: string): string {
    const sanitized = this.toPascalCase(baseName) || 'SubModel';
    const count = this.typeNameCounters.get(sanitized) || 0;
    this.typeNameCounters.set(sanitized, count + 1);
    return count === 0 ? sanitized : `${sanitized}_${count + 1}`;
  }

  private emitCode(rootNode: InferredTypeNode): string {
    switch (this.options.targetFormat) {
      case 'typescript-interface':
        return this.emitTypeScript(rootNode, false);
      case 'typescript-type':
        return this.emitTypeScript(rootNode, true);
      case 'zod':
        return this.emitZod(rootNode);
      case 'typebox':
        return this.emitTypeBox(rootNode);
      case 'json-schema':
        return this.emitJsonSchema(rootNode);
      case 'valibot':
        return this.emitValibot(rootNode);
      default:
        return this.emitTypeScript(rootNode, false);
    }
  }

  // ==========================================
  // TypeScript Generator
  // ==========================================
  private emitTypeScript(rootNode: InferredTypeNode, useTypeAlias: boolean): string {
    const lines: string[] = [];
    lines.push(`/**`);
    lines.push(` * Auto-generated TypeScript definitions`);
    lines.push(` * Generated at: ${new Date().toISOString()}`);
    lines.push(` * Total Properties: ${this.totalPropsCount} | Max Depth: ${this.maxDepthReached}`);
    lines.push(` */\n`);

    const exportPrefix = this.options.exportStyle === 'export' ? 'export ' : this.options.exportStyle === 'declare' ? 'declare ' : '';

    // Emit nested extracted types first
    if (this.options.collapseNestedTypes && this.extractedTypes.size > 0) {
      for (const [name, node] of this.extractedTypes.entries()) {
        lines.push(this.renderTsModel(name, node, useTypeAlias, exportPrefix));
        lines.push('');
      }
    }

    // Emit root type
    lines.push(this.renderTsModel(this.options.rootTypeName, rootNode, useTypeAlias, exportPrefix));
    return lines.join('\n');
  }

  private renderTsModel(name: string, node: InferredTypeNode, useTypeAlias: boolean, exportPrefix: string): string {
    if (node.kind !== 'object' || !node.properties) {
      return `${exportPrefix}type ${name} = ${this.formatTsType(node, 0)};`;
    }

    const ro = this.options.readonlyFields ? 'readonly ' : '';
    const out: string[] = [];

    if (useTypeAlias) {
      out.push(`${exportPrefix}type ${name} = {`);
    } else {
      out.push(`${exportPrefix}interface ${name} {`);
    }

    for (const [propName, prop] of node.properties.entries()) {
      const safeKey = this.formatPropertyKey(propName);
      const opt = prop.optional ? '?' : '';
      const nullSuffix = prop.nullable ? ' | null' : '';
      const typeStr = this.formatTsType(prop.type, 1) + nullSuffix;

      if (this.options.addComments && prop.exampleValue !== undefined) {
        const commentVal = JSON.stringify(prop.exampleValue);
        out.push(`  /** @example ${commentVal && commentVal.length > 50 ? commentVal.slice(0, 47) + '...' : commentVal} */`);
      }
      out.push(`  ${ro}${safeKey}${opt}: ${typeStr};`);
    }

    out.push(useTypeAlias ? '};' : '}');
    return out.join('\n');
  }

  private formatTsType(node: InferredTypeNode, indentLevel: number): string {
    if (this.options.collapseNestedTypes && node.extractedTypeName) {
      return node.extractedTypeName;
    }

    switch (node.kind) {
      case 'string':
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'null':
        return 'null';
      case 'any':
        return 'unknown';
      case 'union':
        if (!node.unionTypes || node.unionTypes.length === 0) return 'unknown';
        return node.unionTypes.map((u) => this.formatTsType(u, indentLevel)).join(' | ');
      case 'array':
        if (!node.items) return 'unknown[]';
        const innerType = this.formatTsType(node.items, indentLevel);
        return innerType.includes(' ') ? `(${innerType})[]` : `${innerType}[]`;
      case 'object':
        if (!node.properties || node.properties.size === 0) return 'Record<string, unknown>';
        const ind = '  '.repeat(indentLevel);
        const childInd = '  '.repeat(indentLevel + 1);
        const ro = this.options.readonlyFields ? 'readonly ' : '';
        const fields: string[] = [];
        for (const [key, prop] of node.properties.entries()) {
          const safeKey = this.formatPropertyKey(key);
          const opt = prop.optional ? '?' : '';
          const nullSuffix = prop.nullable ? ' | null' : '';
          fields.push(`${childInd}${ro}${safeKey}${opt}: ${this.formatTsType(prop.type, indentLevel + 1)}${nullSuffix};`);
        }
        return `{\n${fields.join('\n')}\n${ind}}`;
      default:
        return 'unknown';
    }
  }

  // ==========================================
  // Zod Generator
  // ==========================================
  private emitZod(rootNode: InferredTypeNode): string {
    const lines: string[] = [];
    lines.push(`import { z } from "zod";\n`);

    const exportPrefix = this.options.exportStyle === 'none' ? '' : 'export ';
    const rootSchemaName = `${this.toPascalCase(this.options.rootTypeName)}Schema`;

    // Emit nested extracted schemas first
    if (this.options.collapseNestedTypes && this.extractedTypes.size > 0) {
      for (const [name, node] of this.extractedTypes.entries()) {
        const schemaName = `${name}Schema`;
        lines.push(`${exportPrefix}const ${schemaName} = ${this.formatZodType(node, 0)};`);
        if (this.options.generateTypeAliases) {
          lines.push(`${exportPrefix}type ${name} = z.infer<typeof ${schemaName}>;\n`);
        } else {
          lines.push('');
        }
      }
    }

    lines.push(`${exportPrefix}const ${rootSchemaName} = ${this.formatZodType(rootNode, 0)};`);
    if (this.options.generateTypeAliases) {
      lines.push(`\n${exportPrefix}type ${this.toPascalCase(this.options.rootTypeName)} = z.infer<typeof ${rootSchemaName}>;`);
    }

    return lines.join('\n');
  }

  private formatZodType(node: InferredTypeNode, indentLevel: number): string {
    if (this.options.collapseNestedTypes && node.extractedTypeName) {
      return `${node.extractedTypeName}Schema`;
    }

    switch (node.kind) {
      case 'string':
        if (node.format === 'email') return 'z.string().email()';
        if (node.format === 'date-time') return 'z.string().datetime()';
        if (node.format === 'url') return 'z.string().url()';
        if (node.format === 'uuid') return 'z.string().uuid()';
        if (node.format === 'ipv4') return 'z.string().ip({ version: "v4" })';
        return 'z.string()';
      case 'integer':
        return 'z.number().int()';
      case 'number':
        return 'z.number()';
      case 'boolean':
        return 'z.boolean()';
      case 'null':
        return 'z.null()';
      case 'any':
        return 'z.unknown()';
      case 'union':
        if (!node.unionTypes || node.unionTypes.length === 0) return 'z.unknown()';
        return `z.union([${node.unionTypes.map((u) => this.formatZodType(u, indentLevel)).join(', ')}])`;
      case 'array':
        if (!node.items) return 'z.array(z.unknown())';
        return `z.array(${this.formatZodType(node.items, indentLevel)})`;
      case 'object':
        if (!node.properties || node.properties.size === 0) return 'z.record(z.string(), z.unknown())';
        const ind = '  '.repeat(indentLevel);
        const childInd = '  '.repeat(indentLevel + 1);
        const entries: string[] = [];

        for (const [key, prop] of node.properties.entries()) {
          let expr = this.formatZodType(prop.type, indentLevel + 1);
          if (prop.nullable) expr += '.nullable()';
          if (prop.optional) expr += '.optional()';
          if (this.options.readonlyFields) expr += '.readonly()';
          const safeKey = this.formatPropertyKey(key);
          entries.push(`${childInd}${safeKey}: ${expr}`);
        }
        return `z.object({\n${entries.join(',\n')}\n${ind}})`;
      default:
        return 'z.unknown()';
    }
  }

  // ==========================================
  // TypeBox Generator
  // ==========================================
  private emitTypeBox(rootNode: InferredTypeNode): string {
    const lines: string[] = [];
    if (this.options.generateTypeAliases) {
      lines.push(`import { Type, Static } from "@sinclair/typebox";\n`);
    } else {
      lines.push(`import { Type } from "@sinclair/typebox";\n`);
    }

    const exportPrefix = this.options.exportStyle === 'none' ? '' : 'export ';
    const rootSchemaName = `${this.toPascalCase(this.options.rootTypeName)}Schema`;

    if (this.options.collapseNestedTypes && this.extractedTypes.size > 0) {
      for (const [name, node] of this.extractedTypes.entries()) {
        const schemaName = `${name}Schema`;
        lines.push(`${exportPrefix}const ${schemaName} = ${this.formatTypeBoxType(node, 0)};`);
        if (this.options.generateTypeAliases) {
          lines.push(`${exportPrefix}type ${name} = Static<typeof ${schemaName}>;\n`);
        } else {
          lines.push('');
        }
      }
    }

    lines.push(`${exportPrefix}const ${rootSchemaName} = ${this.formatTypeBoxType(rootNode, 0)};`);
    if (this.options.generateTypeAliases) {
      lines.push(`\n${exportPrefix}type ${this.toPascalCase(this.options.rootTypeName)} = Static<typeof ${rootSchemaName}>;`);
    }

    return lines.join('\n');
  }

  private formatTypeBoxType(node: InferredTypeNode, indentLevel: number): string {
    if (this.options.collapseNestedTypes && node.extractedTypeName) {
      return `${node.extractedTypeName}Schema`;
    }

    switch (node.kind) {
      case 'string':
        if (node.format === 'email') return 'Type.String({ format: "email" })';
        if (node.format === 'date-time') return 'Type.String({ format: "date-time" })';
        if (node.format === 'date') return 'Type.String({ format: "date" })';
        if (node.format === 'url') return 'Type.String({ format: "uri" })';
        if (node.format === 'uuid') return 'Type.String({ format: "uuid" })';
        if (node.format === 'ipv4') return 'Type.String({ format: "ipv4" })';
        return 'Type.String()';
      case 'integer':
        return 'Type.Integer()';
      case 'number':
        return 'Type.Number()';
      case 'boolean':
        return 'Type.Boolean()';
      case 'null':
        return 'Type.Null()';
      case 'any':
        return 'Type.Unknown()';
      case 'union':
        if (!node.unionTypes || node.unionTypes.length === 0) return 'Type.Unknown()';
        return `Type.Union([${node.unionTypes.map((u) => this.formatTypeBoxType(u, indentLevel)).join(', ')}])`;
      case 'array':
        if (!node.items) return 'Type.Array(Type.Unknown())';
        return `Type.Array(${this.formatTypeBoxType(node.items, indentLevel)})`;
      case 'object':
        if (!node.properties || node.properties.size === 0) return 'Type.Record(Type.String(), Type.Unknown())';
        const ind = '  '.repeat(indentLevel);
        const childInd = '  '.repeat(indentLevel + 1);
        const entries: string[] = [];

        for (const [key, prop] of node.properties.entries()) {
          let expr = this.formatTypeBoxType(prop.type, indentLevel + 1);
          if (prop.nullable) expr = `Type.Union([${expr}, Type.Null()])`;
          if (prop.optional) expr = `Type.Optional(${expr})`;
          const safeKey = this.formatPropertyKey(key);
          entries.push(`${childInd}${safeKey}: ${expr}`);
        }
        return `Type.Object({\n${entries.join(',\n')}\n${ind}})`;
      default:
        return 'Type.Unknown()';
    }
  }

  // ==========================================
  // Valibot Generator
  // ==========================================
  private emitValibot(rootNode: InferredTypeNode): string {
    const lines: string[] = [];
    lines.push(`import * as v from "valibot";\n`);

    const exportPrefix = this.options.exportStyle === 'none' ? '' : 'export ';
    const rootSchemaName = `${this.toPascalCase(this.options.rootTypeName)}Schema`;

    if (this.options.collapseNestedTypes && this.extractedTypes.size > 0) {
      for (const [name, node] of this.extractedTypes.entries()) {
        const schemaName = `${name}Schema`;
        lines.push(`${exportPrefix}const ${schemaName} = ${this.formatValibotType(node, 0)};`);
        if (this.options.generateTypeAliases) {
          lines.push(`${exportPrefix}type ${name} = v.InferOutput<typeof ${schemaName}>;\n`);
        } else {
          lines.push('');
        }
      }
    }

    lines.push(`${exportPrefix}const ${rootSchemaName} = ${this.formatValibotType(rootNode, 0)};`);
    if (this.options.generateTypeAliases) {
      lines.push(`\n${exportPrefix}type ${this.toPascalCase(this.options.rootTypeName)} = v.InferOutput<typeof ${rootSchemaName}>;`);
    }

    return lines.join('\n');
  }

  private formatValibotType(node: InferredTypeNode, indentLevel: number): string {
    if (this.options.collapseNestedTypes && node.extractedTypeName) {
      return `${node.extractedTypeName}Schema`;
    }

    switch (node.kind) {
      case 'string':
        if (node.format === 'email') return 'v.pipe(v.string(), v.email())';
        if (node.format === 'url') return 'v.pipe(v.string(), v.url())';
        if (node.format === 'uuid') return 'v.pipe(v.string(), v.uuid())';
        if (node.format === 'ipv4') return 'v.pipe(v.string(), v.ipv4())';
        if (node.format === 'date-time') return 'v.pipe(v.string(), v.isoTimestamp())';
        return 'v.string()';
      case 'integer':
        return 'v.pipe(v.number(), v.integer())';
      case 'number':
        return 'v.number()';
      case 'boolean':
        return 'v.boolean()';
      case 'null':
        return 'v.null()';
      case 'any':
        return 'v.unknown()';
      case 'union':
        if (!node.unionTypes || node.unionTypes.length === 0) return 'v.unknown()';
        return `v.union([${node.unionTypes.map((u) => this.formatValibotType(u, indentLevel)).join(', ')}])`;
      case 'array':
        if (!node.items) return 'v.array(v.unknown())';
        return `v.array(${this.formatValibotType(node.items, indentLevel)})`;
      case 'object':
        if (!node.properties || node.properties.size === 0) return 'v.record(v.string(), v.unknown())';
        const ind = '  '.repeat(indentLevel);
        const childInd = '  '.repeat(indentLevel + 1);
        const entries: string[] = [];

        for (const [key, prop] of node.properties.entries()) {
          let expr = this.formatValibotType(prop.type, indentLevel + 1);
          if (prop.nullable) expr = `v.nullable(${expr})`;
          if (prop.optional) expr = `v.optional(${expr})`;
          const safeKey = this.formatPropertyKey(key);
          entries.push(`${childInd}${safeKey}: ${expr}`);
        }
        return `v.object({\n${entries.join(',\n')}\n${ind}})`;
      default:
        return 'v.unknown()';
    }
  }

  // ==========================================
  // JSON Schema (Draft 7) Generator
  // ==========================================
  private emitJsonSchema(rootNode: InferredTypeNode): string {
    const definitions: Record<string, unknown> = {};

    if (this.options.collapseNestedTypes && this.extractedTypes.size > 0) {
      for (const [name, node] of this.extractedTypes.entries()) {
        definitions[name] = this.buildJsonSchemaNode(node, definitions, false);
      }
    }

    const schemaObj = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: this.options.rootTypeName,
      ...this.buildJsonSchemaNode(rootNode, definitions, true),
      ...(Object.keys(definitions).length > 0 ? { definitions } : {}),
    };

    return JSON.stringify(schemaObj, null, 2);
  }

  private buildJsonSchemaNode(
    node: InferredTypeNode,
    definitions: Record<string, unknown>,
    isRoot: boolean
  ): Record<string, unknown> {
    if (!isRoot && this.options.collapseNestedTypes && node.extractedTypeName) {
      return { $ref: `#/definitions/${node.extractedTypeName}` };
    }

    switch (node.kind) {
      case 'string':
        return {
          type: 'string',
          ...(node.format ? { format: node.format } : {}),
        };
      case 'integer':
        return { type: 'integer' };
      case 'number':
        return { type: 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'null':
        return { type: 'null' };
      case 'any':
        return {};
      case 'union':
        return {
          anyOf: (node.unionTypes || []).map((u) => this.buildJsonSchemaNode(u, definitions, false)),
        };
      case 'array':
        return {
          type: 'array',
          items: node.items ? this.buildJsonSchemaNode(node.items, definitions, false) : {},
        };
      case 'object':
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        if (node.properties) {
          for (const [k, p] of node.properties.entries()) {
            properties[k] = this.buildJsonSchemaNode(p.type, definitions, false);
            if (!p.optional) {
              required.push(k);
            }
          }
        }

        return {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
          additionalProperties: true,
        };
      default:
        return {};
    }
  }

  // ==========================================
  // Mock Data Synthesizer
  // ==========================================
  public generateMockData(node: InferredTypeNode): unknown {
    switch (node.kind) {
      case 'string':
        if (node.format === 'email') return 'sample.user@example.org';
        if (node.format === 'date-time') return new Date().toISOString();
        if (node.format === 'date') return '2026-09-09';
        if (node.format === 'url') return 'https://example.com/resource';
        if (node.format === 'uuid') return 'c392f4e8-8db9-45e2-9d33-bc8efd927361';
        if (node.format === 'ipv4') return '192.168.1.100';
        return node.exampleValue || 'sample string';
      case 'integer':
        return typeof node.exampleValue === 'number' ? node.exampleValue : 42;
      case 'number':
        return typeof node.exampleValue === 'number' ? node.exampleValue : 19.99;
      case 'boolean':
        return typeof node.exampleValue === 'boolean' ? node.exampleValue : true;
      case 'null':
        return null;
      case 'any':
        return 'any-value';
      case 'union':
        return node.unionTypes && node.unionTypes.length > 0
          ? this.generateMockData(node.unionTypes[0])
          : 'union-sample';
      case 'array':
        if (!node.items) return [];
        return [this.generateMockData(node.items), this.generateMockData(node.items)];
      case 'object':
        const res: Record<string, unknown> = {};
        if (node.properties) {
          for (const [k, p] of node.properties.entries()) {
            res[k] = this.generateMockData(p.type);
          }
        }
        return res;
      default:
        return null;
    }
  }

  // ==========================================
  // Helper Utilities
  // ==========================================
  private toPascalCase(str: string): string {
    return str
      .replace(/[-_.\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9_]/g, '');
  }

  private singularize(name: string): string {
    const clean = this.toPascalCase(name);
    if (clean.endsWith('ies')) return clean.slice(0, -3) + 'y';
    if (clean.endsWith('ses')) return clean.slice(0, -2);
    if (clean.endsWith('s') && !clean.endsWith('ss')) return clean.slice(0, -1);
    return clean;
  }

  private formatPropertyKey(key: string): string {
    // Valid JS identifier test
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
      return key;
    }
    return JSON.stringify(key);
  }
}
