// Turns the model's *suggested* action into *validated* game effects. The AI can never exceed these caps.
import { characters } from './prompts.js';
import { today } from './guard.js';

const CAPS = {
  relPerMessage: 8,
  relPerNpcPerDay: 15,
  moneyPerPlayerPerDay: 3000,
  itemsPerPlayerPerDay: 5,
  discountMax: 30,
  knowledgePerDay: 6,
};
const SITUATION_ACTIONS = {
  excuse: ['accept_excuse', 'reject_excuse', 'punish', 'warn', 'report_to_principal'],
  haggle: ['discount', 'refuse', 'give_item'],
  ask_subject: ['answer_question'],
  letter: ['send_money', 'send_provisions'],
  text_reply: ['send_money'],
  chat: ['give_item', 'start_mission', 'warn', 'answer_question'],
  note_reply: [], slambook: [], shirt: [],
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

export async function validate({ store, playerId, npcKey, sheetKey, situation, ctx = {}, ai }) {
  const sheet = characters().sheets[sheetKey];
  const day = `${today()}`;
  const out = {
    reply: String(ai.reply || '').slice(0, 600),
    emotion: ai.emotion || 'neutral',
    action: 'none',
    relationship_change: 0,
    effects: { money: 0, items: {}, discountPct: 0, punish: null, excuse: null, mission: null, knowledge: 0, end: false },
    distress: !!ai.distress,
  };
  if (out.distress) return out; // stepping out of the game: no game effects at all

  // relationship: per message and per NPC per day
  let rel = clamp(ai.relationship_change, -CAPS.relPerMessage, CAPS.relPerMessage);
  if (rel) {
    const used = await store.ledgerTotal(playerId, day, `rel:${npcKey}`);
    rel = Math.sign(rel) * Math.min(Math.abs(rel), Math.max(0, CAPS.relPerNpcPerDay - used));
    if (rel) await store.ledgerAdd(playerId, day, `rel:${npcKey}`, Math.abs(rel), npcKey);
  }
  out.relationship_change = rel;

  // action must be allowed for this character AND this situation
  let action = ai.action;
  const allowed = (sheet.allowed_actions || []).includes(action) && (action === 'none' || action === 'end_conversation' || (SITUATION_ACTIONS[situation] || []).includes(action));
  if (!allowed) action = action === 'end_conversation' ? 'end_conversation' : 'none';
  const d = ai.action_detail || {};
  const fx = out.effects;

  switch (action) {
    case 'accept_excuse': fx.excuse = 'accepted'; break;
    case 'warn': fx.excuse = situation === 'excuse' ? 'warned' : null; break;
    case 'reject_excuse': case 'punish': {
      const max = clamp(ctx.maxSeverity ?? 1, 0, 3);
      fx.excuse = 'rejected';
      fx.punish = { severity: clamp(action === 'punish' ? (d.severity || max) : max, 0, max) };
      break;
    }
    case 'report_to_principal': {
      const max = clamp(ctx.maxSeverity ?? 1, 0, 3);
      fx.excuse = 'rejected';
      fx.punish = { severity: max >= 1 ? Math.min(3, max + 1) : max, principal: true };
      break;
    }
    case 'discount': fx.discountPct = clamp(d.amount, 0, CAPS.discountMax); break;
    case 'give_item': case 'send_provisions': {
      const can = sheet.can_give || {};
      const item = d.item && can[d.item] ? d.item : null;
      if (!item) { action = 'none'; break; }
      const used = await store.ledgerTotal(playerId, day, 'items');
      const n = Math.min(clamp(d.amount || 1, 1, can[item]), Math.max(0, CAPS.itemsPerPlayerPerDay - used));
      if (n > 0) { fx.items[item] = n; await store.ledgerAdd(playerId, day, 'items', n, npcKey); } else action = 'none';
      break;
    }
    case 'send_money': {
      const used = await store.ledgerTotal(playerId, day, 'money');
      const amt = Math.min(clamp(d.amount, 0, sheet.money_cap || 0), Math.max(0, CAPS.moneyPerPlayerPerDay - used));
      const rounded = Math.floor(amt / 50) * 50;
      if (rounded > 0) { fx.money = rounded; await store.ledgerAdd(playerId, day, 'money', rounded, npcKey); } else action = 'none';
      break;
    }
    case 'start_mission': fx.mission = (sheet.missions || []).includes(d.mission) ? d.mission : null; if (!fx.mission) action = 'none'; break;
    case 'answer_question': {
      const used = await store.ledgerTotal(playerId, day, 'knowledge');
      fx.knowledge = Math.min(2, Math.max(0, CAPS.knowledgePerDay - used));
      if (fx.knowledge) await store.ledgerAdd(playerId, day, 'knowledge', fx.knowledge, npcKey);
      break;
    }
    case 'end_conversation': fx.end = true; break;
    default: break;
  }
  out.action = action;
  return out;
}

export { CAPS };
