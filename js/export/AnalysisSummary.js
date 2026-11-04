import { CONTINGENCY_RULE_LABELS } from '../models/contingencyRules.js';
import { SETTLEMENT_STATE_LABELS, settlementState } from '../models/payments.js';

const brl = cents => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

// Apenas apresenta o que o motor já calculou para a tela; não recalcula viabilidade.
export function buildAnalysisSummary(project, result) {
  const c = result.contingency;
  const viability = result.viability;
  const rows = [];
  const add = (label, text, cents) => rows.push({ label, text, cents });

  add('Regra de contingência', CONTINGENCY_RULE_LABELS[c.rule] + (c.ruleNeedsReview ? ' — origem não confirmada, revisão pendente' : ''));
  add('Percentual da reserva', `${Math.round(c.percent * 10000) / 100}%`);
  add('Valor da reserva protegida', brl(c.protectedCents), c.protectedCents);
  if (c.mode === 'target') {
    add('Data-alvo da contingência', c.targetDate ? `${c.targetDate} (mês ${c.targetMonth})` : 'Não informada');
    if (c.targetMonth !== null) {
      add('Reserva formada na data-alvo', brl(c.formedAtTargetCents), c.formedAtTargetCents);
      add('Reserva faltante na data-alvo', brl(c.shortfallAtTargetCents), c.shortfallAtTargetCents);
    }
  } else {
    add('Data-alvo da contingência', 'Não se aplica (regra anterior)');
  }
  add('Diagnóstico de caixa', result.firstDeficitMonth === null
    ? 'Sem déficit no período projetado'
    : `Déficit a partir do mês ${result.firstDeficitMonth}; máximo de ${brl(result.maxDeficitCents)} no mês ${result.worstDeficitMonth}${c.mode === 'legacy' ? ' (caixa livre após a reserva exigida)' : ''}`);
  if (c.mode === 'target') {
    add('Diagnóstico de contingência', c.targetMonth === null
      ? 'Não avaliável sem data-alvo'
      : c.firstReserveShortfallMonth !== null
        ? `Reserva não se mantém a partir do mês ${c.firstReserveShortfallMonth}; falta até ${brl(c.maxReserveShortfallCents)}`
        : c.sufficientAtTarget ? 'Reserva suficiente na data-alvo e preservada depois dela' : 'Reserva insuficiente na data-alvo');
  } else {
    add('Diagnóstico de contingência', `Reserva integral exigida desde o mês ${result.contingencyStartMonth}; incluída no diagnóstico de caixa livre`);
  }
  add('Conclusão', viability.label);

  const pending = [...(viability.missingFieldLabels || [])];
  if (result.postponedEssentialItems?.length) {
    pending.push(`Itens essenciais adiados: ${result.postponedEssentialItems.map(item => item.name).join(', ')}`);
  }
  if (c.ruleNeedsReview) pending.push('Confirmar a regra de contingência do projeto');

  const settlements = (result.processedItems || [])
    .map(item => ({ name: item.name, state: settlementState(item) }))
    .filter(entry => entry.state)
    .map(entry => ({ name: entry.name, label: SETTLEMENT_STATE_LABELS[entry.state] }));

  return { rows, pending, settlements };
}

export const XLSX_LIMITATION = 'Esta planilha contém valores calculados pelo aplicativo, não fórmulas editáveis.';
export const PDF_LIMITATION = 'Prévia para impressão: o aplicativo não gera um arquivo PDF automaticamente.';
