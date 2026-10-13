export type BusinessFormulaRpnToken =
  | { type: "NUMBER"; value: number }
  | { type: "FIELD"; fieldKey: string }
  | { type: "OPERATOR"; operator: "+" | "-" | "*" | "/" | "NEGATE" };

type LexToken =
  | { type: "NUMBER"; value: number; canonical: string }
  | { type: "FIELD"; fieldKey: string; fieldName: string }
  | { type: "OPERATOR"; operator: "+" | "-" | "*" | "/" }
  | { type: "LPAREN" }
  | { type: "RPAREN" };

export type ParsedBusinessFormula = {
  expression: string;
  displayExpression: string;
  referenceKeys: string[];
  rpn: BusinessFormulaRpnToken[];
};

export class BusinessFormulaError extends Error {}

export type BusinessJudgmentOperator = "GT" | "GTE" | "EQ" | "LT" | "LTE";
export const businessJudgmentOperatorLabels: Record<BusinessJudgmentOperator, string> = {
  GT: ">",
  GTE: "≥",
  EQ: "=",
  LT: "<",
  LTE: "≤",
};

export type BusinessJudgmentCondition = {
  leftExpression?: string;
  rightExpression?: string;
  leftDisplayExpression?: string;
  rightDisplayExpression?: string;
  leftReferenceKeys?: string[];
  rightReferenceKeys?: string[];
  leftRpn?: BusinessFormulaRpnToken[];
  rightRpn?: BusinessFormulaRpnToken[];
  leftFieldKey?: string;
  operator: BusinessJudgmentOperator;
  rightFieldKey?: string;
  result: string;
  leftFieldName?: string;
  rightFieldName?: string;
};

type JudgmentInterval = { lower: number | null; lowerInclusive: boolean; upper: number | null; upperInclusive: boolean };

function judgmentInterval(operator: BusinessJudgmentOperator): JudgmentInterval {
  if (operator === "GT") return { lower: 0, lowerInclusive: false, upper: null, upperInclusive: false };
  if (operator === "GTE") return { lower: 0, lowerInclusive: true, upper: null, upperInclusive: false };
  if (operator === "EQ") return { lower: 0, lowerInclusive: true, upper: 0, upperInclusive: true };
  if (operator === "LT") return { lower: null, lowerInclusive: false, upper: 0, upperInclusive: false };
  return { lower: null, lowerInclusive: false, upper: 0, upperInclusive: true };
}

function judgmentIntervalsOverlap(left: JudgmentInterval, right: JudgmentInterval) {
  if (left.lower !== null && right.upper !== null) {
    if (left.lower > right.upper) return false;
    if (left.lower === right.upper && !(left.lowerInclusive && right.upperInclusive)) return false;
  }
  if (right.lower !== null && left.upper !== null) {
    if (right.lower > left.upper) return false;
    if (right.lower === left.upper && !(right.lowerInclusive && left.upperInclusive)) return false;
  }
  return true;
}

export function validateBusinessJudgmentConditions(conditions: readonly BusinessJudgmentCondition[], numericFieldKeys: ReadonlySet<string>) {
  if (!conditions.length) return "至少新增一个判断条件";
  if (conditions.length > 20) return "判断条件最多支持20条";
  const signatures = new Map<string, number>();
  let firstSignature = "";
  const getOperand = (condition: BusinessJudgmentCondition, side: "left" | "right") => {
    const expression = side === "left" ? condition.leftExpression : condition.rightExpression;
    const referenceKeys = side === "left" ? condition.leftReferenceKeys : condition.rightReferenceKeys;
    const legacyKey = side === "left" ? condition.leftFieldKey : condition.rightFieldKey;
    return { expression: expression?.trim() || (legacyKey ? `{{${legacyKey}}}` : ""), referenceKeys: referenceKeys?.length ? referenceKeys : legacyKey ? [legacyKey] : [] };
  };
  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index];
    const left = getOperand(condition, "left");
    const right = getOperand(condition, "right");
    if (!left.expression || !right.expression) return `条件${index + 1}需要填写左右表达式`;
    if (!left.referenceKeys.every(key => numericFieldKeys.has(key)) || !right.referenceKeys.every(key => numericFieldKeys.has(key))) return "判断条件只能引用已添加的数值字段或公式字段";
    if (!Object.hasOwn(businessJudgmentOperatorLabels, condition.operator)) return "判断条件包含不支持的比较运算符";
    if (!condition.result.trim()) return "请输入每个判断条件的结果值";
    if (Array.from(condition.result.trim()).length > 50) return "判断结果不能超过50个字符";
    const signature = `${left.expression}|${right.expression}`;
    if (!firstSignature) firstSignature = signature;
    if (signature !== firstSignature) return "同一个判断字段的条件必须使用相同的左右表达式，避免判断口径不一致";
    const previous = signatures.get(signature);
    if (previous !== undefined && judgmentIntervalsOverlap(judgmentInterval(conditions[previous].operator), judgmentInterval(condition.operator))) {
      return `条件${previous + 1}与条件${index + 1}存在交叉或冲突，请调整比较运算符`;
    }
    signatures.set(signature, previous === undefined ? index : previous);
  }
  return null;
}

export function evaluateBusinessJudgment(conditions: readonly BusinessJudgmentCondition[], values: Record<string, number | null | undefined>) {
  for (const condition of conditions) {
    const left = condition.leftRpn ? evaluateBusinessFormula(condition.leftRpn, values) : condition.leftFieldKey ? values[condition.leftFieldKey] : null;
    const right = condition.rightRpn ? evaluateBusinessFormula(condition.rightRpn, values) : condition.rightFieldKey ? values[condition.rightFieldKey] : null;
    if (typeof left !== "number" || !Number.isFinite(left) || typeof right !== "number" || !Number.isFinite(right)) continue;
    const difference = left - right;
    const matches = condition.operator === "GT" ? difference > 0
      : condition.operator === "GTE" ? difference >= 0
        : condition.operator === "EQ" ? difference === 0
          : condition.operator === "LT" ? difference < 0 : difference <= 0;
    if (matches) return condition.result;
  }
  return null;
}

function tokenize(expression: string, resolveField: (fieldName: string) => string | null): LexToken[] {
  if (!expression.trim()) throw new BusinessFormulaError("请输入计算公式");
  if (Array.from(expression).length > 500) throw new BusinessFormulaError("计算公式不能超过500个字符");
  const tokens: LexToken[] = [];
  let position = 0;
  while (position < expression.length) {
    const character = expression[position];
    if (/\s/.test(character)) { position += 1; continue; }
    if (expression.startsWith("{{", position)) {
      const end = expression.indexOf("}}", position + 2);
      if (end < 0) throw new BusinessFormulaError("字段引用缺少右方括号 ]");
      const fieldKey = expression.slice(position + 2, end).trim();
      if (!fieldKey) throw new BusinessFormulaError("字段引用不能为空");
      tokens.push({ type: "FIELD", fieldKey, fieldName: fieldKey });
      position = end + 2;
      continue;
    }
    if (character === "[") {
      const end = expression.indexOf("]", position + 1);
      if (end < 0) throw new BusinessFormulaError("字段引用缺少右方括号 ]");
      const fieldName = expression.slice(position + 1, end).trim();
      if (!fieldName) throw new BusinessFormulaError("字段引用不能为空");
      const fieldKey = resolveField(fieldName);
      if (!fieldKey) throw new BusinessFormulaError(`公式引用的字段“${fieldName}”不存在或不是数值字段`);
      tokens.push({ type: "FIELD", fieldKey, fieldName });
      position = end + 1;
      continue;
    }
    const numberMatch = expression.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(%?)/);
    if (numberMatch) {
      const raw = numberMatch[0];
      const percentage = raw.endsWith("%");
      const numericText = percentage ? raw.slice(0, -1) : raw;
      const numericValue = Number(numericText);
      if (!Number.isFinite(numericValue)) throw new BusinessFormulaError("计算公式包含无效数字");
      tokens.push({ type: "NUMBER", value: percentage ? numericValue / 100 : numericValue, canonical: raw });
      position += raw.length;
      continue;
    }
    if (character === "+" || character === "-") {
      tokens.push({ type: "OPERATOR", operator: character }); position += 1; continue;
    }
    if (character === "*" || character === "×") {
      tokens.push({ type: "OPERATOR", operator: "*" }); position += 1; continue;
    }
    if (character === "/" || character === "÷") {
      tokens.push({ type: "OPERATOR", operator: "/" }); position += 1; continue;
    }
    if (character === "(") { tokens.push({ type: "LPAREN" }); position += 1; continue; }
    if (character === ")") { tokens.push({ type: "RPAREN" }); position += 1; continue; }
    throw new BusinessFormulaError(`计算公式包含不支持的内容：“${character}”`);
  }
  if (tokens.length > 200) throw new BusinessFormulaError("计算公式过于复杂，请减少运算项");
  return tokens;
}

export function parseBusinessFormula(expression: string, resolveField: (fieldName: string) => string | null, options: { requireField?: boolean } = {}): ParsedBusinessFormula {
  const tokens = tokenize(expression, resolveField);
  let cursor = 0;

  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  const parsePrimary = (): BusinessFormulaRpnToken[] => {
    const token = peek();
    if (!token) throw new BusinessFormulaError("计算公式不完整");
    if (token.type === "NUMBER") { consume(); return [{ type: "NUMBER", value: token.value }]; }
    if (token.type === "FIELD") { consume(); return [{ type: "FIELD", fieldKey: token.fieldKey }]; }
    if (token.type === "LPAREN") {
      consume();
      const nested = parseExpression();
      if (peek()?.type !== "RPAREN") throw new BusinessFormulaError("计算公式中的括号不匹配");
      consume();
      return nested;
    }
    throw new BusinessFormulaError("数字、字段或左括号位置不正确");
  };

  const parseUnary = (): BusinessFormulaRpnToken[] => {
    const token = peek();
    if (token?.type === "OPERATOR" && (token.operator === "+" || token.operator === "-")) {
      consume();
      const value = parseUnary();
      return token.operator === "-" ? [...value, { type: "OPERATOR", operator: "NEGATE" }] : value;
    }
    return parsePrimary();
  };

  const parseTerm = (): BusinessFormulaRpnToken[] => {
    let output = parseUnary();
    while (peek()?.type === "OPERATOR" && (peek() as Extract<LexToken, { type: "OPERATOR" }>).operator.match(/^[*/]$/)) {
      const operator = (consume() as Extract<LexToken, { type: "OPERATOR" }>).operator;
      output = [...output, ...parseUnary(), { type: "OPERATOR", operator }];
    }
    return output;
  };

  const parseExpression = (): BusinessFormulaRpnToken[] => {
    let output = parseTerm();
    while (peek()?.type === "OPERATOR" && ((peek() as Extract<LexToken, { type: "OPERATOR" }>).operator === "+" || (peek() as Extract<LexToken, { type: "OPERATOR" }>).operator === "-")) {
      const operator = (consume() as Extract<LexToken, { type: "OPERATOR" }>).operator;
      output = [...output, ...parseTerm(), { type: "OPERATOR", operator }];
    }
    return output;
  };

  const rpn = parseExpression();
  if (cursor !== tokens.length) throw new BusinessFormulaError(peek()?.type === "RPAREN" ? "计算公式中的括号不匹配" : "计算公式的运算符位置不正确");
  const references = tokens.filter((token): token is Extract<LexToken, { type: "FIELD" }> => token.type === "FIELD");
  if (!references.length && options.requireField !== false) throw new BusinessFormulaError("计算公式至少需要引用一个数值字段");
  const referenceKeys = [...new Set(references.map(token => token.fieldKey))];
  const canonical = tokens.map(token => {
    if (token.type === "FIELD") return `{{${token.fieldKey}}}`;
    if (token.type === "NUMBER") return token.canonical;
    if (token.type === "OPERATOR") return token.operator;
    return token.type === "LPAREN" ? "(" : ")";
  }).join(" ");
  const displayExpression = tokens.map(token => {
    if (token.type === "FIELD") return `[${token.fieldName}]`;
    if (token.type === "NUMBER") return token.canonical;
    if (token.type === "OPERATOR") return token.operator;
    return token.type === "LPAREN" ? "(" : ")";
  }).join(" ");
  return { expression: canonical, displayExpression, referenceKeys, rpn };
}

export function evaluateBusinessFormula(rpn: BusinessFormulaRpnToken[], values: Record<string, number | null | undefined>) {
  const stack: number[] = [];
  for (const token of rpn) {
    if (token.type === "NUMBER") { stack.push(token.value); continue; }
    if (token.type === "FIELD") {
      const value = values[token.fieldKey];
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      stack.push(value);
      continue;
    }
    if (token.operator === "NEGATE") {
      const value = stack.pop();
      if (value === undefined) return null;
      stack.push(-value);
      continue;
    }
    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined || (token.operator === "/" && right === 0)) return null;
    const result = token.operator === "+" ? left + right
      : token.operator === "-" ? left - right
        : token.operator === "*" ? left * right : left / right;
    if (!Number.isFinite(result)) return null;
    stack.push(result);
  }
  return stack.length === 1 ? stack[0] : null;
}
