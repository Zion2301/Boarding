// All Claude calls live here. Structured outputs (zod) for every call; any failure throws AIUnavailable and the
// route answers { fallback: true } so the game uses its offline presets.
// AI_MOCK=1 swaps in a deterministic fake for development/tests (no API key, no cost).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GRADER, JUDGE, MODERATOR } from './prompts.js';

export const CHAT_MODEL = 'claude-haiku-4-5-20251001';   // NPC conversations + moderation (fast, cheap)
export const GRADE_MODEL = 'claude-sonnet-5-5';          // essay grading + debate judging

export const ACTIONS = ['none', 'accept_excuse', 'reject_excuse', 'punish', 'warn', 'give_item', 'start_mission', 'report_to_principal', 'discount', 'refuse', 'send_money', 'send_provisions', 'answer_question', 'end_conversation'];
export const EMOTIONS = ['neutral', 'happy', 'amused', 'annoyed', 'angry', 'sad', 'suspicious', 'impressed', 'worried'];

const ChatReply = z.object({
  reply: z.string(),
  emotion: z.enum(EMOTIONS),
  relationship_change: z.number().int(),
  action: z.enum(ACTIONS),
  action_detail: z.object({ item: z.string(), amount: z.number().int(), severity: z.number().int(), mission: z.string() }),
  memory_note: z.string(),
  distress: z.boolean(),
});
const Grade = z.object({ score: z.number().int(), out_of: z.number().int(), comment: z.string(), strengths: z.array(z.string()), improvements: z.array(z.string()) });
const Judge = z.object({ player_score: z.number().int(), opponent_score: z.number().int(), winner: z.enum(['player', 'opponent', 'tie']), comment: z.string() });
const Moderation = z.object({ allowed: z.boolean(), categories: z.array(z.string()), reason: z.string() });

export class AIUnavailable extends Error {}

const MOCK = process.env.AI_MOCK === '1';
let client = null;
const getClient = () => (client ||= new Anthropic()); // ANTHROPIC_API_KEY from the server environment only

/* Run a request and return the parsed object, or throw AIUnavailable */
async function run(kind, fn) {
  try {
    const res = await fn();
    if (res.stop_reason === 'refusal') throw new AIUnavailable(`${kind}: refusal (${res.stop_details && res.stop_details.category})`);
    if (res.stop_reason === 'max_tokens') throw new AIUnavailable(`${kind}: truncated`);
    if (!res.parsed_output) throw new AIUnavailable(`${kind}: unparseable output`);
    return { data: res.parsed_output, usage: res.usage };
  } catch (err) {
    if (err instanceof AIUnavailable) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new AIUnavailable(`${kind}: rate limited by API`);
    if (err instanceof Anthropic.AuthenticationError) throw new AIUnavailable(`${kind}: bad or missing ANTHROPIC_API_KEY`);
    if (err instanceof Anthropic.BadRequestError) throw new AIUnavailable(`${kind}: bad request — ${err.message}`);
    if (err instanceof Anthropic.APIError) throw new AIUnavailable(`${kind}: API error ${err.status}`);
    if (err instanceof Anthropic.APIConnectionError) throw new AIUnavailable(`${kind}: cannot reach API`);
    throw new AIUnavailable(`${kind}: ${err.message}`);
  }
}

/* ---------- NPC conversation (Haiku, short) ---------- */
export async function npcChat({ system, history, text }) {
  if (MOCK) return { data: mockChat(system, text), usage: null };
  const messages = [...history.slice(-14), { role: 'user', content: text }];
  return run('chat', () => getClient().messages.parse({
    model: CHAT_MODEL,
    max_tokens: 400,
    system,
    messages,
    output_config: { format: zodOutputFormat(ChatReply) },
  }));
}

/* ---------- essay grading (Sonnet 5.5) ---------- */
export async function gradeAnswer({ subject, level, question, rubric, keyPoints, outOf, answer }) {
  if (MOCK) return { data: mockGrade({ keyPoints, outOf, answer }), usage: null };
  const prompt = `Subject: ${subject} (${level})\nQuestion (${outOf} marks): ${question}\nRubric: ${rubric}\nKey points the best answers mention:\n${keyPoints.map((k) => `- ${k}`).join('\n')}\n\nThe student's answer is between the markers:\n<<<ANSWER\n${answer}\nANSWER>>>`;
  return run('grade', () => getClient().beta.messages.parse({
    model: GRADE_MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: GRADER,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'medium', format: zodOutputFormat(Grade) },
  }));
}

/* ---------- debate judging (Sonnet 5.5) ---------- */
export async function judgeDebate({ motion, side, opponent, argument }) {
  if (MOCK) return { data: mockJudge({ argument, opponent }), usage: null };
  const prompt = `Motion: "${motion}"\nThe player argues: ${side}.\n\nOpponent's argument:\n<<<OPPONENT\n${opponent}\nOPPONENT>>>\n\nPlayer's argument:\n<<<PLAYER\n${argument}\nPLAYER>>>`;
  return run('judge', () => getClient().beta.messages.parse({
    model: GRADE_MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: JUDGE,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'medium', format: zodOutputFormat(Judge) },
  }));
}

/* ---------- moderation of public text (Haiku) ---------- */
export async function moderateText({ text, kind }) {
  if (MOCK) return { data: { allowed: true, categories: [], reason: 'mock' }, usage: null };
  return run('moderate', () => getClient().messages.parse({
    model: CHAT_MODEL,
    max_tokens: 200,
    system: MODERATOR,
    messages: [{ role: 'user', content: `Type: ${kind}\nText:\n<<<\n${text}\n>>>` }],
    output_config: { format: zodOutputFormat(Moderation) },
  }));
}

/* ---------- mock model (deterministic, for development) ---------- */
function mockChat(system, text) {
  const t = String(text).toLowerCase();
  const sys = system.map((b) => b.text).join('\n');
  const excuse = /SITUATION: The player has been caught/.test(sys);
  const base = { emotion: 'neutral', relationship_change: 0, action: 'none', action_detail: { item: '', amount: 0, severity: 0, mission: '' }, memory_note: '', distress: false };
  if (/\b(kill|hurt) myself|want to die|suicid|touches me/.test(t)) return Object.assign(base, { distress: true, reply: '(Stepping out of the game for a moment.) What you just said matters. Please talk to a trusted adult — a parent, relative, teacher or school counsellor — and if you are in danger right now, contact emergency services.' });
  if (excuse) {
    if (/sick|nurse|matron|sick bay|vomit/.test(t)) return Object.assign(base, { emotion: 'suspicious', relationship_change: 1, action: 'accept_excuse', reply: 'Sick bay, you say? Hmm. I will check with Matron. Go to class, and do not let me see you late again.', memory_note: 'Claimed to be at the sick bay when late.' });
    if (/sorry|forgive|won'?t happen|my fault|i overslept/.test(t)) return Object.assign(base, { emotion: 'annoyed', action: 'warn', reply: 'At least you are honest. This is a warning. Next time, you will kneel at the assembly ground.', memory_note: 'Admitted fault honestly.' });
    if (/stupid|shut up|who are you|nonsense/.test(t)) return Object.assign(base, { emotion: 'angry', relationship_change: -6, action: 'punish', action_detail: Object.assign(base.action_detail, { severity: 2 }), reply: 'You dare talk to me like that? Go and cut that grass behind the admin block. Now!', memory_note: 'Was rude when caught.' });
    return Object.assign(base, { emotion: 'suspicious', relationship_change: -1, action: 'reject_excuse', reply: 'Is that so? I have heard that one since 1998. Kneel down there for ten minutes.', memory_note: 'Gave a weak excuse.' });
  }
  if (/passed you a folded note/.test(sys)) return Object.assign(base, { emotion: 'amused', reply: '(mock) 😂 Abeg focus, teacher dey look!' });
  if (/slam book/.test(sys)) return Object.assign(base, { emotion: 'happy', reply: '(mock) You be correct padi!' });
  if (/sign-out day/.test(sys)) return Object.assign(base, { emotion: 'happy', reply: '(mock) Six years together! 🎓' });
  if (/wrote you a letter|text message conversation/.test(sys)) {
    if (/money|send|provision|milo/.test(t)) return Object.assign(base, { emotion: 'happy', action: 'send_money', action_detail: Object.assign(base.action_detail, { amount: 1500 }), reply: '(mock) My dear, I will send small money through the Bursar. Eat well and read your books.' });
    return Object.assign(base, { emotion: 'happy', reply: '(mock) We miss you! Read your books and behave.' });
  }
  if (/asking you a question about/.test(sys)) return Object.assign(base, { action: 'answer_question', reply: `(mock) Good question. Here is a simple explanation of "${String(text).slice(0, 40)}"…` });
  if (/discount|reduce|abeg|last price/.test(t)) return Object.assign(base, { emotion: 'amused', action: 'discount', action_detail: Object.assign(base.action_detail, { amount: 15 }), reply: 'Ehen, because you sweet-mouth me, I go remove small. 15% off. No tell anybody!' });
  if (/money|send me|provisions|milo/.test(t)) return Object.assign(base, { emotion: 'happy', action: 'send_money', action_detail: Object.assign(base.action_detail, { amount: 1500 }), reply: 'My dear, I will send small money through the Bursar. Eat well and read your books.' });
  return Object.assign(base, { emotion: 'happy', relationship_change: 1, reply: '(mock) Okay o! I hear you.' });
}
function mockGrade({ keyPoints, outOf, answer }) {
  const a = String(answer).toLowerCase();
  const hits = keyPoints.filter((k) => k.toLowerCase().split(/\W+/).filter((w) => w.length > 4).some((w) => a.includes(w)));
  const score = Math.min(outOf, Math.round((hits.length / Math.max(1, keyPoints.length)) * outOf));
  return { score, out_of: outOf, comment: score >= outOf * 0.7 ? '(mock) Good work. You covered the main points.' : '(mock) Fair attempt. Mention more key points.', strengths: hits.slice(0, 2), improvements: keyPoints.filter((k) => !hits.includes(k)).slice(0, 2) };
}
function mockJudge({ argument }) {
  const p = Math.min(30, 8 + Math.floor(String(argument).length / 40));
  return { player_score: p, opponent_score: 18, winner: p > 18 ? 'player' : p < 18 ? 'opponent' : 'tie', comment: '(mock) A spirited debate. Judges commend both speakers.' };
}
