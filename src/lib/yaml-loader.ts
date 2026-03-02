import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import rawSchema from '../schema/candidate-events.schema.json';
import type { CandidateEventsFile, LoadedFile } from '../schema/types.js';
import { friendlyValidationErrors } from './friendly-errors.js';

// Strip $schema since Ajv default doesn't support draft/2020-12
const { $schema: _, ...schema } = rawSchema;

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

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
      errors: [`This file could not be read as valid YAML. Check for formatting issues like mismatched indentation or stray characters. (${(e as Error).message})`],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      filename,
      errors: ['This file does not contain the expected structure. It should be a YAML document starting with metadata, domain_events, and boundary_assumptions sections.'],
    };
  }

  const valid = validate(parsed);
  if (!valid) {
    const errors = friendlyValidationErrors(validate.errors ?? []);
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

export async function loadFile(file: File): Promise<LoadOutcome> {
  const content = await file.text();
  return parseAndValidate(file.name, content);
}
