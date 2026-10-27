import { CHECK_INFO, CHECKS } from '../align/types.js';
import type { Rule } from './types.js';

export const CONFIG_SCHEMA_URL =
  'https://raw.githubusercontent.com/OOlashyn/pageslens/main/pageslens.config.schema.json';

/**
 * JSON Schema for `pageslens.config.yaml`, for editor completion and validation. Built from the
 * rules so it lists every rule id with its description and default; `loadConfig` stays the
 * source of truth for what's accepted.
 */
export function configJsonSchema(rules: readonly Rule[]): object {
  const severity = { enum: ['off', 'info', 'warning', 'error'] };
  const ruleIds = rules.map((rule) => rule.id);
  const nonEmptyList = (description: string, items: object = { type: 'string', minLength: 1 }) => ({
    description,
    type: 'array',
    items,
    minItems: 1,
  });

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: CONFIG_SCHEMA_URL,
    title: 'pageslens config',
    description:
      'Configuration for `pageslens lint` and `pageslens align`: severities and ignored findings.',
    type: 'object',
    additionalProperties: false,
    properties: {
      rules: {
        description: 'Severity per rule id; `off` turns the rule off.',
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          rules.map((rule) => [
            rule.id,
            {
              ...severity,
              description: `${rule.description} Default: ${rule.defaultSeverity}.`,
            },
          ]),
        ),
      },
      ignore: {
        description:
          'Findings to leave out. An entry matches a finding on any of its files or records, ' +
          'from the listed rules only when `rules` is given.',
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          anyOf: [{ required: ['files'] }, { required: ['records'] }],
          properties: {
            rules: nonEmptyList('Rule ids this entry applies to; every rule when left out.', {
              enum: ruleIds,
            }),
            files: nonEmptyList(
              'Globs over the file paths lint prints, relative to the site folder: ' +
                '`*` within a folder, `**` across folders, `?` one character.',
            ),
            records: nonEmptyList('Record GUIDs, as lint prints them in JSON output (`recordId`).'),
            reason: {
              description: 'Why these findings are ignored, for reviewers.',
              type: 'string',
            },
          },
        },
      },
      align: {
        description: 'Configuration for `pageslens align`: check severities and ignored findings.',
        type: 'object',
        additionalProperties: false,
        properties: {
          checks: {
            description: 'Severity per check; `off` turns the check off.',
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(
              CHECKS.map((check) => [
                check,
                {
                  ...severity,
                  description: `${CHECK_INFO[check].description} Default: ${CHECK_INFO[check].defaultSeverity}.`,
                },
              ]),
            ),
          },
          ignore: {
            description:
              'Findings to leave out: those on any of the records, from the listed checks only when `checks` is given.',
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['records'],
              properties: {
                checks: nonEmptyList('Checks this entry applies to; every check when left out.', {
                  enum: [...CHECKS],
                }),
                records: nonEmptyList(
                  'Record GUIDs, as align prints them in JSON output (`recordId`).',
                ),
                reason: {
                  description: 'Why these findings are ignored, for reviewers.',
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
  };
}
