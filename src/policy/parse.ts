import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import { PRIVILEGES, type Privilege } from '../graph/access.js';
import { SCOPES } from '../model/kinds.js';
import { findUp } from '../util/fs.js';
import {
  SECTIONS,
  type AccessScope,
  type ChainRef,
  type Check,
  type PageAction,
  type PageRef,
  type Policy,
  type Section,
  type Statement,
  type TableRef,
  type Who,
} from './types.js';

export const POLICY_FILE = 'pageslens.policy.yaml';

/** The policy can't be used: every problem found is listed, each with its file and line. */
export class PolicyError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'PolicyError';
  }
}

const ACCESS_SCOPES = Object.values(SCOPES) as AccessScope[];
const STATEMENT_KEYS = ['check', 'id', 'because'];

/**
 * Loads `explicitPath`, or else the nearest `pageslens.policy.yaml` in `startDir` or a folder
 * above it. No policy file, or one without statements, is an error: a test run that checks
 * nothing must not pass.
 */
export async function loadPolicy(startDir: string, explicitPath?: string): Promise<Policy> {
  const path = explicitPath ? resolve(explicitPath) : await findUp(resolve(startDir), POLICY_FILE);
  if (!path) {
    throw new PolicyError([
      `No ${POLICY_FILE} found in ${resolve(startDir)} or a folder above it (pass --policy <file>)`,
    ]);
  }
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new PolicyError([`Can't read policy file ${path}`]);
  }
  return parsePolicy(text, path);
}

/** Parses policy file text. `path` is used in messages and kept on the result. */
export function parsePolicy(text: string, path: string): Policy {
  const lines = new LineCounter();
  const doc = parseDocument(text, { schema: 'failsafe', lineCounter: lines, uniqueKeys: true });
  const lineOf = (node: Node | null | undefined) =>
    node?.range ? lines.linePos(node.range[0]).line : 1;
  const problems: string[] = [];
  const problem = (line: number, message: string) => problems.push(`${path}:${line}: ${message}`);

  if (doc.errors.length > 0) {
    const source = text.split(/\r?\n/);
    throw new PolicyError(
      doc.errors.map((e) => {
        const line = e.linePos?.[0].line ?? 1;
        // `- "Case Manager" can read incident` is a quoted YAML string followed by more text
        const hint = /^\s*-\s*"/.test(source[line - 1] ?? '')
          ? ' (a statement that starts with a quoted role name needs "role" in front: role "Name" can ...)'
          : '';
        return `${path}:${line}: invalid YAML: ${e.message.split('\n')[0]}${hint}`;
      }),
    );
  }

  const statements: Statement[] = [];
  const root = doc.contents;
  if (root && !isMap(root)) {
    problem(lineOf(root), `expected sections (${SECTIONS.join(', ')}) at the top level`);
  }
  for (const pair of isMap(root) ? root.items : []) {
    const key = isScalar(pair.key) ? String(pair.key.value) : '';
    const line = lineOf(pair.key as Node);
    if (!(SECTIONS as readonly string[]).includes(key)) {
      problem(line, `unknown section "${key}" (expected ${SECTIONS.join(', ')})`);
      continue;
    }
    const section = key as Section;
    if (!isSeq(pair.value)) {
      problem(line, `"${section}" must be a list of statements`);
      continue;
    }
    for (const item of pair.value.items) {
      const statement = readStatement(section, item as Node, lineOf(item as Node), problem);
      if (statement) statements.push(statement);
    }
  }

  const seen = new Map<string, number>();
  for (const statement of statements) {
    if (!statement.id) continue;
    const first = seen.get(statement.id);
    if (first) problem(statement.line, `id "${statement.id}" is already used on line ${first}`);
    else seen.set(statement.id, statement.line);
  }
  if (problems.length === 0 && statements.length === 0) {
    problems.push(`${path}: the policy has no statements`);
  }
  if (problems.length > 0) throw new PolicyError(problems);
  return { path, statements };
}

function readStatement(
  section: Section,
  node: Node,
  line: number,
  problem: (line: number, message: string) => void,
): Statement | undefined {
  let text: string | undefined;
  const extra: Pick<Statement, 'id' | 'because'> = {};
  if (isScalar(node)) {
    text = String(node.value);
  } else if (isMap(node)) {
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : '';
      if (!STATEMENT_KEYS.includes(key)) {
        problem(line, `unknown key "${key}" (expected ${STATEMENT_KEYS.join(', ')})`);
        return undefined;
      }
      if (!isScalar(pair.value)) {
        problem(line, `"${key}" must be text`);
        return undefined;
      }
      const value = String(pair.value.value).trim();
      if (key === 'check') text = value;
      else if (value) extra[key as 'id' | 'because'] = value;
    }
    if (text === undefined) {
      problem(line, 'a statement written as a mapping needs "check"');
      return undefined;
    }
  } else {
    problem(line, 'expected a statement (text, or a mapping with "check")');
    return undefined;
  }

  text = text.trim();
  try {
    return { section, text, line, ...extra, check: parseCheck(section, text) };
  } catch (error) {
    if (!(error instanceof StatementError)) throw error;
    problem(line, `${error.message}: ${text}`);
    return undefined;
  }
}

class StatementError extends Error {}

type Token = { type: 'word' | 'string' | 'comma'; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(,)|"([^"]*)("?)|([^\s,"]+))/y;
  let match: RegExpExecArray | null;
  while (pattern.lastIndex < text.length && (match = pattern.exec(text))) {
    if (match[1]) tokens.push({ type: 'comma', value: ',' });
    else if (match[2] !== undefined) {
      if (!match[3]) throw new StatementError('a quoted name is missing its closing "');
      tokens.push({ type: 'string', value: match[2] });
    } else if (match[4]) tokens.push({ type: 'word', value: match[4] });
    else break;
  }
  return tokens;
}

/** Reads tokens left to right; keywords compare case-insensitively. */
class Reader {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  isWord(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.type === 'word' && token.value.toLowerCase() === word;
  }

  next(): Token | undefined {
    return this.tokens[this.index++];
  }

  word(...words: string[]): string {
    const token = this.peek();
    const value = token?.type === 'word' ? token.value.toLowerCase() : undefined;
    if (value === undefined || !words.includes(value)) {
      throw new StatementError(`expected ${quoteList(words)}${found(token)}`);
    }
    this.index++;
    return value;
  }

  comma(): boolean {
    if (this.peek()?.type !== 'comma') return false;
    this.index++;
    return true;
  }

  string(what: string): string {
    const token = this.peek();
    if (token?.type !== 'string')
      throw new StatementError(`expected ${what} in double quotes${found(token)}`);
    this.index++;
    return token.value;
  }

  end(): void {
    const token = this.peek();
    if (token) throw new StatementError(`unexpected ${describe(token)} at the end`);
  }
}

function describe(token: Token): string {
  return token.type === 'string' ? `"${token.value}"` : `"${token.value}"`;
}

function found(token: Token | undefined): string {
  return token ? `, found ${describe(token)}` : ' at the end';
}

function quoteList(words: string[]): string {
  const quoted = words.map((w) => `"${w}"`);
  return quoted.length === 1 ? quoted[0]! : `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`;
}

function parseCheck(section: Section, text: string): Check {
  const reader = new Reader(tokenize(text));
  if (!reader.peek()) throw new StatementError('the statement is empty');
  const check =
    section === 'access'
      ? parseAccess(reader)
      : section === 'webapi'
        ? parseWebApi(reader)
        : section === 'pages'
          ? parsePages(reader)
          : parseSetting(reader);
  reader.end();
  return check;
}

function isWhoStart(reader: Reader): boolean {
  return (
    reader.peek()?.type === 'string' ||
    reader.isWord('role') ||
    reader.isWord('anonymous') ||
    reader.isWord('authenticated')
  );
}

function parseWho(reader: Reader): Who {
  const token = reader.peek();
  if (token?.type === 'string') {
    reader.next();
    return { kind: 'role', name: token.value };
  }
  if (reader.isWord('role')) {
    reader.next();
    return { kind: 'role', name: reader.string('a role name') };
  }
  if (reader.isWord('anonymous') || reader.isWord('authenticated')) {
    return { kind: reader.word('anonymous', 'authenticated') as 'anonymous' | 'authenticated' };
  }
  if (token?.type === 'word') {
    throw new StatementError(
      `expected "anonymous", "authenticated" or a role name in double quotes, found "${token.value}" (write role "${token.value}")`,
    );
  }
  throw new StatementError(`expected "anonymous", "authenticated" or a role name${found(token)}`);
}

function parseAccess(reader: Reader): Check {
  if (reader.isWord('only')) {
    reader.next();
    const who = [parseWho(reader)];
    while (reader.comma()) who.push(parseWho(reader));
    reader.word('can');
    return { kind: 'only', who, ...parseGrant(reader, true) };
  }
  if (reader.isWord('nobody')) {
    reader.next();
    reader.word('can');
    return { kind: 'nobody', ...parseGrant(reader, true) };
  }
  const who = parseWho(reader);
  const kind = reader.word('can', 'cannot') as 'can' | 'cannot';
  return { kind, who, ...parseGrant(reader, kind === 'cannot') };
}

interface GrantClause {
  privileges: Privilege[];
  table: TableRef;
  scope?: AccessScope;
  under?: ChainRef;
  except?: ChainRef;
}

function parseGrant(reader: Reader, exceptAllowed: boolean): GrantClause {
  const listed = [parsePrivilege(reader)];
  while (reader.comma()) listed.push(parsePrivilege(reader));
  const privileges = [...new Set(listed)];
  const grant: GrantClause = { privileges, table: parseTable(reader) };
  const scope = parseScope(reader);
  if (scope) grant.scope = scope;
  if (reader.isWord('under')) {
    if (scope) {
      throw new StatementError(
        `"under" already means parent scope: leave out "at ${scope} scope" before it`,
      );
    }
    reader.next();
    grant.under = parseChain(reader);
  }
  if (reader.isWord('except')) {
    if (!exceptAllowed) {
      throw new StatementError('"except under" only goes in "cannot", "only" and "nobody"');
    }
    reader.next();
    reader.word('under');
    grant.except = parseChain(reader);
  }
  return grant;
}

/** `<table> [at <scope> scope]` after `under`. */
function parseChain(reader: Reader): ChainRef {
  const chain: ChainRef = { table: parseTableName(reader) };
  const scope = parseScope(reader);
  if (scope) chain.scope = scope;
  return chain;
}

function parseScope(reader: Reader): AccessScope | undefined {
  if (!reader.isWord('at')) return undefined;
  reader.next();
  const scope = reader.word(...ACCESS_SCOPES) as AccessScope;
  reader.word('scope');
  return scope;
}

function parsePrivilege(reader: Reader): Privilege {
  return reader.word(...PRIVILEGES) as Privilege;
}

const TABLE_NAME = /^[a-z][a-z0-9_]*$/i;

function parseTable(reader: Reader): TableRef {
  if (reader.isWord('any') && reader.isWord('table', 1)) {
    reader.next();
    reader.next();
    return { kind: 'any' };
  }
  return { kind: 'table', name: parseTableName(reader) };
}

function parseTableName(reader: Reader): string {
  const token = reader.peek();
  if (token?.type !== 'word' || !TABLE_NAME.test(token.value)) {
    throw new StatementError(`expected a table's logical name or "any table"${found(token)}`);
  }
  reader.next();
  return token.value.toLowerCase();
}

function parseWebApi(reader: Reader): Check {
  if (reader.isWord('fields')) {
    reader.next();
    reader.word('are');
    reader.word('explicit');
    return { kind: 'fields-explicit' };
  }
  if (reader.isWord('only')) {
    reader.next();
    const tables = [parseTableName(reader)];
    while (reader.comma()) tables.push(parseTableName(reader));
    reader.word('are', 'is');
    reader.word('enabled');
    return { kind: 'only-enabled', tables };
  }
  if (isWhoStart(reader)) {
    const who = parseWho(reader);
    const verb = reader.word('can', 'cannot');
    reader.word('call');
    return { kind: 'call', negated: verb === 'cannot', who, table: parseTable(reader) };
  }
  const table = parseTable(reader);
  reader.word('is');
  reader.word('not');
  reader.word('enabled');
  return { kind: 'not-enabled', table };
}

function parseSetting(reader: Reader): Check {
  if (reader.isWord('registration')) {
    reader.next();
    reader.word('is');
    reader.word('invite');
    reader.word('only');
    return { kind: 'registration-invite-only' };
  }
  reader.word('setting', 'registration');
  const name = reader.string('the setting name');
  reader.word('is');
  const negated = reader.isWord('not');
  if (negated) reader.next();
  if (reader.isWord('set')) {
    reader.next();
    return { kind: 'setting', name, op: negated ? 'is-not-set' : 'is-set' };
  }
  const value = reader.string('a value (or "set")');
  return { kind: 'setting', name, op: negated ? 'is-not' : 'is', value };
}

function parsePages(reader: Reader): Check {
  if (reader.isWord('only')) {
    reader.next();
    const who = [parseWho(reader)];
    while (reader.comma()) who.push(parseWho(reader));
    reader.word('can');
    return { kind: 'page', form: 'only', who, ...parsePageAccess(reader) };
  }
  if (reader.isWord('nobody')) {
    reader.next();
    reader.word('can');
    return { kind: 'page', form: 'nobody', who: [], ...parsePageAccess(reader) };
  }
  const who = parseWho(reader);
  const form = reader.word('can', 'cannot') as 'can' | 'cannot';
  return { kind: 'page', form, who: [who], ...parsePageAccess(reader) };
}

function parsePageAccess(reader: Reader): { action: PageAction; page: PageRef } {
  const action = reader.word('read', 'publish') as PageAction;
  if (reader.word('page', 'pages') === 'page') {
    return { action, page: { kind: 'page', url: reader.string('the page URL') } };
  }
  reader.word('under');
  return { action, page: { kind: 'under', url: reader.string('the page URL') } };
}
