import { fieldType } from './fields.js';

// Reads a metric formula such as  sum(sum_pre_queue + sum_in_queue)  or  100 * countif(abandoned_final = 'Y') / count()
// and compiles it to SQL plus a list of parameters. Only whitelisted fields, numbers, + - * / ( ) and the
// functions below are accepted, so user text never becomes raw SQL.
//
// Grammar (docs/metric-dsl.md):
//   expr    := term (('+' | '-') term)*
//   term    := factor (('*' | '/') factor)*
//   factor  := number | '-' factor | '(' expr ')' | field (only inside an aggregate) | aggregate
//   aggregate := sum(expr) | avg(expr) | min(expr) | max(expr) | count() | countif(condition)
//   condition := comparison (('and' | 'or') comparison)*        ('and' binds tighter than 'or')
//   comparison := operand ('=' | '!=' | '<>' | '<' | '<=' | '>' | '>=') operand
//   operand := text field | 'text' | expr

export class MetricError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.expose = true;
  }
}

const AGGREGATES = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' };
const COMPARISONS = new Set(['=', '!=', '<>', '<', '<=', '>', '>=']);
const MAX_LENGTH = 1000;

function tokenize(text) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|'([^']*)'|"([^"]*)"|(<=|>=|!=|<>|[-+*/()=<>,]))/y;
  let pos = 0;
  while (pos < text.length) {
    if (/^\s*$/.test(text.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) throw new MetricError(`Unexpected character "${text.slice(pos).trim()[0]}" at position ${pos + 1}.`);
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ type: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'ident', value: m[2] });
    else if (m[3] !== undefined || m[4] !== undefined) tokens.push({ type: 'str', value: m[3] ?? m[4] });
    else tokens.push({ type: 'op', value: m[5] });
  }
  return tokens;
}

class Parser {
  constructor(text) {
    this.tokens = tokenize(text);
    this.i = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.i + offset];
  }

  isOp(value, offset = 0) {
    const t = this.peek(offset);
    return t?.type === 'op' && t.value === value;
  }

  isWord(value) {
    const t = this.peek();
    return t?.type === 'ident' && t.value.toLowerCase() === value;
  }

  expectOp(value) {
    if (!this.isOp(value)) {
      const t = this.peek();
      throw new MetricError(`Expected "${value}" but found ${t ? `"${t.value}"` : 'the end of the formula'}.`);
    }
    this.i++;
  }

  parseAll() {
    if (!this.tokens.length) throw new MetricError('The formula is empty.');
    const node = this.expr(false);
    if (this.i < this.tokens.length) throw new MetricError(`Unexpected "${this.peek().value}" - check brackets and operators.`);
    return node;
  }

  expr(inAgg) {
    let node = this.term(inAgg);
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.tokens[this.i++].value;
      node = { type: 'bin', op, left: node, right: this.term(inAgg) };
    }
    return node;
  }

  term(inAgg) {
    let node = this.factor(inAgg);
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.tokens[this.i++].value;
      node = { type: 'bin', op, left: node, right: this.factor(inAgg) };
    }
    return node;
  }

  factor(inAgg) {
    const t = this.peek();
    if (!t) throw new MetricError('The formula ends too early.');
    if (t.type === 'num') {
      this.i++;
      return { type: 'num', value: t.value };
    }
    if (this.isOp('-')) {
      this.i++;
      return { type: 'neg', arg: this.factor(inAgg) };
    }
    if (this.isOp('(')) {
      this.i++;
      const node = this.expr(inAgg);
      this.expectOp(')');
      return node;
    }
    if (t.type === 'str') throw new MetricError(`Text '${t.value}' can only be used in a comparison inside countif(...).`);
    if (t.type === 'ident') {
      if (this.isOp('(', 1)) return this.aggregate(inAgg);
      const type = fieldType(t.value);
      if (!type) throw new MetricError(`Unknown field "${t.value}".`);
      if (type === 'text') throw new MetricError(`"${t.value}" is a text field - use it in a filter or in countif(${t.value} = '...').`);
      if (!inAgg) throw new MetricError(`Field "${t.value}" must be inside sum(), avg(), min() or max().`);
      this.i++;
      return { type: 'field', name: t.value };
    }
    throw new MetricError(`Unexpected "${t.value}".`);
  }

  aggregate(inAgg) {
    const name = this.tokens[this.i++].value.toLowerCase();
    if (inAgg) throw new MetricError(`${name}() can't be used inside another function.`);
    this.expectOp('(');
    let node;
    if (AGGREGATES[name]) {
      node = { type: 'agg', fn: AGGREGATES[name], arg: this.expr(true) };
    } else if (name === 'count') {
      node = { type: 'count' };
    } else if (name === 'countif') {
      node = { type: 'countif', cond: this.condition() };
    } else {
      throw new MetricError(`Unknown function "${name}()". Use sum, avg, min, max, count or countif.`);
    }
    this.expectOp(')');
    return node;
  }

  condition() {
    let node = this.andCondition();
    while (this.isWord('or')) {
      this.i++;
      node = { type: 'logic', op: 'OR', left: node, right: this.andCondition() };
    }
    return node;
  }

  andCondition() {
    let node = this.comparison();
    while (this.isWord('and')) {
      this.i++;
      node = { type: 'logic', op: 'AND', left: node, right: this.comparison() };
    }
    return node;
  }

  comparison() {
    const left = this.operand();
    const t = this.peek();
    if (!(t?.type === 'op' && COMPARISONS.has(t.value))) throw new MetricError('Expected a comparison (=, !=, <, <=, >, >=) inside countif(...).');
    this.i++;
    const right = this.operand();
    const kinds = [left.kind, right.kind];
    if (kinds.includes('text') && kinds.includes('number')) throw new MetricError('Comparing text with a number - put text values in quotes and compare them with text fields.');
    if (left.kind === 'text' && !['=', '!=', '<>'].includes(t.value)) throw new MetricError('Text can only be compared with = or !=.');
    return { type: 'cmp', op: t.value === '!=' ? '<>' : t.value, left: left.node, right: right.node };
  }

  operand() {
    const t = this.peek();
    if (t?.type === 'str') {
      this.i++;
      return { kind: 'text', node: { type: 'str', value: t.value } };
    }
    if (t?.type === 'ident' && fieldType(t.value) === 'text' && !this.isOp('(', 1)) {
      this.i++;
      return { kind: 'text', node: { type: 'field', name: t.value } };
    }
    return { kind: 'number', node: this.expr(true) };
  }
}

function toSql(node, params) {
  switch (node.type) {
    case 'num':
    case 'str':
      params.push(node.value);
      return '?';
    case 'field':
      return `\`${node.name}\``; // whitelisted name only
    case 'neg':
      return `(-${toSql(node.arg, params)})`;
    case 'bin': {
      const left = toSql(node.left, params);
      const right = toSql(node.right, params);
      return node.op === '/' ? `(${left} / NULLIF(${right}, 0))` : `(${left} ${node.op} ${right})`;
    }
    case 'agg':
      return `${node.fn}(${toSql(node.arg, params)})`;
    case 'count':
      return 'COUNT(*)';
    case 'countif':
      return `SUM(CASE WHEN ${toSql(node.cond, params)} THEN 1 ELSE 0 END)`;
    case 'cmp':
    case 'logic':
      return `(${toSql(node.left, params)} ${node.op} ${toSql(node.right, params)})`;
    default:
      throw new MetricError('Internal error: unknown formula part.');
  }
}

// Returns { sql, params }. Throws MetricError with a plain-English message if the formula is invalid.
export function compileExpression(text) {
  if (typeof text !== 'string') throw new MetricError('The formula must be text.');
  if (text.length > MAX_LENGTH) throw new MetricError('The formula is too long.');
  const ast = new Parser(text).parseAll();
  const params = [];
  return { sql: toSql(ast, params), params };
}
