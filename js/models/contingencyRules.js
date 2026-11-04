// Versionamento explícito da regra de contingência (assumptions.ruleSchemaVersion = 2).
export const CONTINGENCY_RULE = {
  MONTH_ZERO: 'month_zero',               // versão publicada (10e4939): reserva integral desde o mês 0
  FIRST_DISBURSEMENT: 'first_disbursement', // versão intermediária (89a62b4): reserva integral no primeiro desembolso
  TARGET: 'target'                        // regra atual: reserva formada até uma data-alvo
};

export const CONTINGENCY_RULE_LABELS = {
  month_zero: 'Regra anterior (publicada): reserva integral exigida desde o mês 0',
  first_disbursement: 'Regra anterior (intermediária): reserva integral exigida desde o primeiro desembolso',
  target: 'Regra com data-alvo: reserva formada até a data-alvo e preservada depois dela'
};

export const RULE_SCHEMA_VERSION = 2;

const VALID_RULES = Object.values(CONTINGENCY_RULE);

export function resolveContingencyRule(assumptions) {
  const rule = assumptions?.contingencyRule;
  if (VALID_RULES.includes(rule)) return rule;
  // Marcador de compilações de desenvolvimento anteriores ao versionamento.
  if (assumptions?.contingencyMode === 'target') return CONTINGENCY_RULE.TARGET;
  if (assumptions?.contingencyMode === 'legacy') return CONTINGENCY_RULE.FIRST_DISBURSEMENT;
  // Sem marcador: o único formato publicado aplicava a reserva desde o mês 0.
  return CONTINGENCY_RULE.MONTH_ZERO;
}

// Regra antiga cuja origem não foi confirmada pelo usuário: exige revisão.
export function contingencyRuleNeedsReview(assumptions) {
  return resolveContingencyRule(assumptions) !== CONTINGENCY_RULE.TARGET &&
    assumptions?.contingencyRuleConfirmed !== true;
}
