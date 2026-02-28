/**
 * Server-compatible YAML parser/validator.
 * Uses require()-style CJS imports compatible with node16 module resolution.
 * This module mirrors parseAndValidate from yaml-loader.ts but avoids
 * ESM default import issues with Ajv and ajv-formats under node16.
 */
import { createRequire } from 'node:module';
import type { CandidateEventsFile, LoadedFile } from '../schema/types.js';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yaml = require('js-yaml') as { load: (s: string) => unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvConstructor = require('ajv') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormatsConstructor = require('ajv-formats') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawSchema = require('../schema/candidate-events.schema.json') as any;

// Strip $schema since Ajv default doesn't support draft/2020-12
const { $schema: _, ...schema } = rawSchema as { $schema: unknown; [k: string]: unknown };

// Handle both CommonJS `module.exports = Ajv` and `module.exports.default = Ajv` shapes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass = AjvConstructor?.default ?? AjvConstructor;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = addFormatsConstructor?.default ?? addFormatsConstructor;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajv = new AjvClass({ allErrors: true }) as any;
addFormats(ajv);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validate = ajv.compile(schema) as any;

export interface LoadResult {
  ok: true;
  file: LoadedFile;
}

export interface LoadError {
  ok: false;
  filename: string;
  errors: string[];
}

export type LoadOutcome = LoadResult | LoadError;

export function parseAndValidate(filename: string, content: string): LoadOutcome {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (e) {
    return {
      ok: false,
      filename,
      errors: [`YAML parse error: ${(e as Error).message}`],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      filename,
      errors: ['File does not contain a YAML object'],
    };
  }

  const valid = validate(parsed) as boolean;
  if (!valid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = ((validate.errors ?? []) as any[]).map(
      (e: { instancePath?: string; message?: string }) =>
        `${e.instancePath || '/'}: ${e.message}`
    );
    return { ok: false, filename, errors };
  }

  const data = parsed as CandidateEventsFile;
  return {
    ok: true,
    file: {
      filename,
      role: data.metadata.role,
      data,
    },
  };
}
