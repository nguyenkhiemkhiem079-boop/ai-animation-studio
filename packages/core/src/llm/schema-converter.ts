import { z } from 'zod';

/**
 * Converts a Zod schema or raw schema object into a clean OpenAPI 3.0 / Gemini compliant JSON schema.
 */
export function convertZodToJsonSchema(schema: z.ZodTypeAny | Record<string, unknown>): Record<string, unknown> {
  if (!(schema instanceof z.ZodType)) {
    return schema;
  }

  return zodToSchemaInternal(schema);
}

function zodToSchemaInternal(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def;

  // Handle wrappers (Optional, Nullable, Default, Effects/Refinements)
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
    return zodToSchemaInternal(def.innerType);
  }
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodNullable) {
    return { ...zodToSchemaInternal(def.innerType), nullable: true };
  }
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
    return zodToSchemaInternal(def.innerType);
  }
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodEffects) {
    return zodToSchemaInternal(def.schema);
  }

  // Primitive types
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodString) {
    return { type: 'string' };
  }
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodNumber) {
    return { type: 'number' };
  }
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodEnum) {
    return {
      type: 'string',
      enum: def.values,
    };
  }
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodNativeEnum) {
    return {
      type: 'string',
      enum: Object.values(def.values),
    };
  }

  // Array
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodArray) {
    return {
      type: 'array',
      items: zodToSchemaInternal(def.type),
    };
  }

  // Object
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodObject) {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, propSchema] of Object.entries<z.ZodTypeAny>(shape)) {
      properties[key] = zodToSchemaInternal(propSchema);
      const isOptional =
        propSchema._def.typeName === z.ZodFirstPartyTypeKind.ZodOptional ||
        propSchema._def.typeName === z.ZodFirstPartyTypeKind.ZodDefault;
      if (!isOptional) {
        required.push(key);
      }
    }

    const objSchema: Record<string, unknown> = {
      type: 'object',
      properties,
    };

    if (required.length > 0) {
      objSchema.required = required;
    }

    return objSchema;
  }

  // Record / Map
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodRecord) {
    return {
      type: 'object',
    };
  }

  // Union
  if (def.typeName === z.ZodFirstPartyTypeKind.ZodUnion) {
    return {
      anyOf: def.options.map((opt: z.ZodTypeAny) => zodToSchemaInternal(opt)),
    };
  }

  // Fallback
  return { type: 'string' };
}
