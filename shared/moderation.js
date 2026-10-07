/* Text moderation shared by the browser (window.BHModeration) and the server (require('../shared/moderation')).
   moderate(text, { context }) -> { verdict: 'ok'|'masked'|'blocked', text, reasons[], distress: bool }
   - mild profanity is masked (f**k) in private-ish contexts and blocked in public ones
   - slurs, sexual content, harassment and personal info (phones, emails, links, @handles, addresses) are blocked
   - distress() detects a player who may be in real trouble (self-harm, abuse) so the help panel can open
   Lists are deliberately compact; extend them here. Matching normalises leetspeak and stretched letters. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BHModeration = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // mild — masked in private contexts, blocked when public
  const MILD = ['shit', 'damn', 'crap', 'bastard', 'ass', 'arse', 'bitch', 'piss', 'dick', 'mumu', 'ode', 'oloshi', 'werey', 'mugu'];
  // strong profanity — always blocked
  const STRONG = ['fuck', 'fck', 'motherfucker', 'cunt', 'wanker', 'twat', 'ashawo', 'olosho', 'ewu', 'dindin', 'pussy', 'puna', 'gbola', 'kpekus', 'toto', 'oloko'];
  // slurs / hate — always blocked (kept short; extend as needed)
  const SLURS = ['nigger', 'nigga', 'faggot', 'fag', 'retard', 'tranny', 'chink', 'spastic', 'aboki', 'ofemmanu', 'ngbati', 'kafir', 'yamiri', 'gambari'];
  // sexual content — always blocked
  const SEXUAL = ['sex', 'sexy', 'nude', 'nudes', 'naked', 'porn', 'boobs', 'breast', 'penis', 'vagina', 'horny', 'blowjob', 'kiss me', 'make love', 'nyash', 'shag', 'condom'];
  // harassment phrases
  const HARASS = [/\bkill\s*(your)?self\b/, /\bkys\b/, /\byou\s+(should|go)\s+die\b/, /\bi\s*('|wi)?ll\s+kill\s+you\b/, /\bnobody\s+likes\s+you\b/, /\bgo\s+hang\b/, /\bugly\s+(fool|idiot)\b/];
  // personal info
  const PII = [
    { re: /(\+?234|\b0)[\s-]?[789][01]\d[\s-]?\d{3}[\s-]?\d{4}\b/, why: 'phone number' },
    { re: /\b\d[\d\s-]{8,}\d\b/, why: 'phone number' },
    { re: /[a-z0-9._%+-]+\s*(@|\(at\))\s*[a-z0-9.-]+\s*(\.|\(dot\))\s*[a-z]{2,}/i, why: 'email address' },
    { re: /\b(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|ng|net|org|io|me|ly|gg|app|xyz)\b/i, why: 'link' },
    { re: /(^|\s)@[a-z0-9_.]{3,}/i, why: 'social handle' },
    { re: /\b(snap(chat)?|insta(gram)?|ig|tiktok|whatsapp|wa|telegram|facebook|fb|twitter|x\.com|discord)\b\s*[:\-]?\s*\S{3,}/i, why: 'social account' },
    { re: /\b\d{1,4}\s+[a-z]+(\s[a-z]+)?\s+(street|st|road|rd|avenue|ave|close|crescent|estate|lane)\b/i, why: 'address' },
  ];
  // signs of real distress (not in-game drama). Kept specific to avoid false alarms.
  const DISTRESS = [
    /\b(kill|hurt|harm|cut)\s*(my\s*self|myself)\b/, /\bsuicid/, /\bend\s+(my|it)\s+(life|all)\b/, /\bwant\s+to\s+die\b/, /\bwanna\s+die\b/,
    /\bdon'?t\s+want\s+to\s+(live|be\s+alive)\b/, /\bno\s+reason\s+to\s+live\b/, /\bself[\s-]?harm/,
    /\b(he|she|they|my\s+\w+)\s+(touches|touched|abuses|abused|beats|beat|hits|rapes|raped)\s+me\b/, /\b(i\s+am|i'?m)\s+being\s+(abused|hurt|beaten|bullied\s+every)/,
    /\bsexual(ly)?\s+abus/, /\bmolest/, /\brape\b/, /\bnot\s+safe\s+at\s+home\b/,
  ];

  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '+': 't' };
  function normalise(t) {
    return String(t || '').toLowerCase()
      .replace(/[013457@$!+]/g, (c) => LEET[c] || c)
      .replace(/(.)\1{2,}/g, '$1$1')             // fuuuuck -> fuuck
      .replace(/[^a-z\s']/g, ' ')
      .replace(/\s+/g, ' ');
  }
  // also catch s.p.a.c.e.d words: "f u c k"
  const squashed = (t) => normalise(t).replace(/\b(\w)\s(?=\w\b)/g, '$1');
  const hasWord = (norm, w) => (w.includes(' ') ? norm.includes(w) : new RegExp(`\\b${w.replace(/(.)\1/g, '$1$1?')}s?\\b`).test(norm));
  const mask = (text, words) => words.reduce((t, w) => t.replace(new RegExp(`\\b${w}\\w*`, 'gi'), (m) => m[0] + '*'.repeat(Math.max(1, m.length - 1))), text);

  function distress(text) {
    const n = String(text || '').toLowerCase();
    return DISTRESS.some((re) => re.test(n));
  }

  /* context: 'public' (others will see it) | 'private' (only you + an NPC) */
  function moderate(text, opts = {}) {
    const raw = String(text || '').slice(0, opts.max || 2000);
    const pub = opts.context === 'public';
    const norm = normalise(raw);
    const sq = squashed(raw);
    const reasons = [];
    const any = (list) => list.filter((w) => hasWord(norm, w) || hasWord(sq, w));
    if (any(SLURS).length) reasons.push('slur');
    if (any(STRONG).length) reasons.push('profanity');
    if (any(SEXUAL).length) reasons.push('sexual');
    if (HARASS.some((re) => re.test(norm))) reasons.push('harassment');
    PII.forEach((p) => { if (p.re.test(raw) && !reasons.includes(p.why)) reasons.push(p.why); });
    const mild = any(MILD);
    const d = distress(raw);
    if (reasons.length) return { verdict: 'blocked', text: raw, reasons, distress: d };
    if (mild.length) return pub ? { verdict: 'blocked', text: raw, reasons: ['profanity'], distress: d } : { verdict: 'masked', text: mask(raw, mild), reasons: ['mild'], distress: d };
    return { verdict: 'ok', text: raw.trim(), reasons: [], distress: d };
  }

  const explain = (reasons) => {
    const map = { slur: 'hateful words', profanity: 'swearing', sexual: 'sexual content', harassment: 'bullying language', 'phone number': 'a phone number', 'email address': 'an email address', link: 'a link', 'social handle': 'a social media handle', 'social account': 'a social media account', address: 'an address', mild: 'mild swearing' };
    return reasons.map((r) => map[r] || r).join(', ');
  };

  return { moderate, distress, normalise, explain };
});
