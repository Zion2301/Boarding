/* The school calendar — the same formula on the server (which owns "today") and in the browser.
   A school day runs 05:00 → 05:00. Day 0 of every term is Resumption Sunday (arrival from 14:00); then 10 weeks of
   Monday–Sunday. Three terms make a school year; at the end of a year every student moves up one level
   (each player's own level — one player can be in JSS1 while another is in SS3).
   day = school days since the school opened · min = minute of the day (300 … 1739, i.e. 5:00 AM → 4:59 AM) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BHCalendar = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  const WEEKS = 10, TERMS = 3;
  const TERM_DAYS = 1 + WEEKS * 7;      // resumption + 10 weeks
  const DAY_START = 5 * 60, DAY_END = 29 * 60;
  const ARRIVAL = 14 * 60;              // resumption day starts at 2 PM

  function info(day) {
    day = Math.max(0, Math.floor(day));
    const termIndex = Math.floor(day / TERM_DAYS);
    const d = day % TERM_DAYS;
    const term = (termIndex % TERMS) + 1;
    const schoolYear = Math.floor(termIndex / TERMS) + 1;
    if (d === 0) return { day, term, schoolYear, termIndex, week: 1, dow: 6, dayType: 'resumption' };
    const dow = (d - 1) % 7;
    return { day, term, schoolYear, termIndex, week: Math.floor((d - 1) / 7) + 1, dow, dayType: dow === 5 ? 'saturday' : dow === 6 ? 'sunday' : 'weekday' };
  }
  /* absolute minutes (monotonic) ↔ day + minute */
  const abs = (day, min) => day * 1440 + (min - DAY_START);
  const split = (a) => { const day = Math.floor(a / 1440); return { day, min: DAY_START + (a - day * 1440) }; };
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const label = (day, min) => { const i = info(day); const h = Math.floor((min % 1440) / 60), m = Math.floor(min % 60); return `Year ${i.schoolYear} · Term ${i.term} · Week ${i.week} · ${DAYS[i.dow]} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

  return { WEEKS, TERMS, TERM_DAYS, DAY_START, DAY_END, ARRIVAL, info, abs, split, label, DAYS };
});
