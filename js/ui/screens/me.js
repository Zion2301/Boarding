/* Me tab: profile, academics, report cards, certificates, senior life, family, discipline, settings */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const UI = () => BH.UI;

  const avg = (a) => (a && a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);

  /* Shared HTML for a report card (used by Me tab + vacation popup) */
  function reportHtml(s, r) {
    return `<div class="report">
      <div class="report-head">
        <div class="crest-sm">🏫</div>
        <div><b>${U.esc(s.player.schoolName.toUpperCase())}</b><small>Student's Terminal Report · ${r.level}, ${['First', 'Second', 'Third'][r.term - 1]} Term</small></div>
      </div>
      <div class="report-meta"><span>Name: <b>${U.esc(s.player.name)}</b></span><span>House: ${s.player.house.name}</span>
        <span>Position: <b>${BH.Reports.ordinal(r.position)}</b> of ${r.classSize}</span><span>Average: <b>${r.average}%</b></span>
        <span>Conduct: ${r.conduct}</span></div>
      <table class="acad report-table"><thead><tr><th>Subject</th><th>CA<small>40</small></th><th>Exam<small>60</small></th><th>Total</th><th>Gr.</th><th>Remark</th></tr></thead>
      <tbody>${r.rows.map((x) => `<tr><td>${U.esc(x.name)}</td><td>${x.ca}</td><td>${x.exam}</td><td><b>${x.total}</b></td><td><b class="grade g${x.grade}">${x.grade}</b></td><td class="tiny">${x.remark}<br><i class="muted">${U.esc(x.comment)}</i></td></tr>`).join('')}</tbody></table>
      <div class="report-comments">
        <p><b>Form Teacher:</b> <i>"${U.esc(r.form)}"</i></p>
        <p><b>Principal:</b> <i>"${U.esc(r.principal)}"</i></p>
      </div>
    </div>`;
  }

  function certHtml(s) {
    const c = s.certificates || {};
    let h = '';
    if (c.bece) {
      h += `<h4>🎓 BECE (Junior WAEC)</h4><p class="muted tiny">${c.bece.summary}</p>
        <div class="cert-grid">${c.bece.subjects.map((x) => `<span>${U.esc(x.name)}</span><b class="${x.grade === 'Fail' ? 'crit-txt' : x.grade === 'Distinction' ? 'good-txt' : ''}">${x.grade}</b>`).join('')}</div>`;
    }
    if (c.waec) {
      ['waec', 'neco'].forEach((k) => {
        h += `<h4>📜 ${k.toUpperCase()} SSCE — ${c[k].credits} credits${c[k].core ? ' incl. English & Maths' : ''}</h4>
          <div class="cert-grid">${c[k].results.map((x) => `<span>${U.esc(x.name)}</span><b class="${BH.Reports.isCredit(x.grade) ? 'good-txt' : 'crit-txt'}">${x.grade}</b>`).join('')}</div>`;
      });
      h += `<h4>🖊️ JAMB UTME — ${c.jamb.total}/400</h4><div class="cert-grid">${c.jamb.results.map((x) => `<span>${U.esc(x.name)}</span><b>${x.score}</b>`).join('')}</div>`;
    }
    return h;
  }

  BH.Screens.me = {
    reportHtml, certHtml,
    mount(s) {
      BH.Avatar3D.viewer(document.getElementById('av-stage-mini'), s.player.avatar || D.defaultAvatar(s.player.gender, s.player.religion), BH.Avatar3D.outfitFor(s));
    },
    render(s) {
      const p = s.player;
      const A = BH.Academics;
      const quiz = A.quizzable(s);
      const subs = A.codes(s).sort((a, b) => (quiz.includes(b) ? 1 : 0) - (quiz.includes(a) ? 1 : 0));
      const ds = BH.Discipline.status(s);
      const h = s.stats_history;
      const dept = s.academics.dept && D.DEPARTMENTS[s.academics.dept];

      const academics = subs.map((c) => {
        const sub = s.academics.subjects[c];
        const ca = A.average(s, c);
        const ex = avg(sub.exam);
        return `<tr><td>${A.emoji(c)} ${A.name(s, c, true)}${quiz.includes(c) ? ' ⭐' : ''}</td>
          <td><span class="mini-bar"><i style="width:${sub.knowledge}%"></i></span></td>
          <td>${sub.attended}/${sub.attended + sub.missed}${sub.late ? ` <small>(${sub.late} late)</small>` : ''}</td>
          <td>${ca === null ? '–' : ca + '%'}</td><td>${ex === null ? '–' : ex + '%'}</td></tr>`;
      }).join('');

      const record = s.discipline.record.slice(0, 8).map((r) => `<li><span class="tag ${r.sev >= 2 ? 'bad' : ''}">${'❗'.repeat(r.sev)}</span> ${U.esc(r.label)} <small class="muted">${r.when}</small></li>`).join('');
      const reports = (s.reports || []).map((r, i) => `<button class="report-row" data-act="viewReport" data-arg="${i}">
          <span>📜 ${r.level} · Term ${r.term}</span><span><b>${r.average}%</b> · ${BH.Reports.ordinal(r.position)}/${r.classSize}</span></button>`).reverse().join('');
      const certs = certHtml(s);
      const style = BH.Seniority.label(s);
      const post = BH.Seniority.postLabel(s);
      const child = s.senior.schoolChild && BH.NPC.get(s, s.senior.schoolChild);
      const famBar = (k, label) => `<div class="rel-row"><span class="fam-l">${label}</span>${UI().relBar(s.family[k], 'wide')}<b>${Math.round(s.family[k])}</b></div>`;

      return `<section class="card profile-card">
          <div class="profile-head"><div class="av-stage mini" id="av-stage-mini"></div>
            <div><h2>${U.esc(p.name)}</h2>
              <div class="muted">${BH.Time.levelName(s)}${dept ? ` ${dept.label}` : ''} · ${U.esc(p.schoolName)}</div>
              <div class="muted tiny"><span class="house-dot" style="background:${p.house.color}"></span> ${p.house.name} · ${p.origin} State · ${D.RELIGIONS[p.religion].label}</div>
              <button class="btn ghost sm" data-act="editLook">✂️ Change look</button>
            </div></div>
          <div class="traits">${p.traits.map((t) => `<span class="tag">${D.TRAITS[t].emoji} ${D.TRAITS[t].label}</span>`).join('')}
            <span class="tag">${D.BACKGROUNDS[p.background].emoji} ${D.BACKGROUNDS[p.background].label}</span>
            ${post ? `<span class="tag good">${post}</span>` : ''}</div>
          <div class="kpis">
            <div><b>${U.money(s.money)}</b><small>Money</small></div>
            <div><b>${Math.round(s.reputation)}</b><small>⭐ Clout</small></div>
            <div><b>${Math.round(s.seniorFavour)}</b><small>🎖️ Senior favour</small></div>
            <div><b class="${ds.cls}-txt">${ds.label}</b><small>😖 Discipline (${s.discipline.points} pts)</small></div>
          </div>
        </section>

        <section class="card"><h2>🏆 Your paths</h2>
          <div class="paths">${BH.Paths.summary(s).map((x) => `<div class="path-row"><span>${x.emoji}</span><b>${x.label}</b><span class="mini-bar wide"><i style="width:${Math.min(100, x.score)}%"></i></span><small>${x.tier ? U.esc(x.title) : '—'}${x.next ? ` · next at ${x.next}` : ''}</small></div>`).join('')}</div>
          <p class="muted tiny">Many ways to win: top of the class, sports star, prefect & leader, hustler, popular icon — or troublemaker legend.</p>
        </section>

        <section class="card"><h2>🗳️ Reputation</h2>
          ${[['teachers'], ['seniors'], ['juniors'], ['coursemates'], ['house']].map(([g]) => { const v = Math.round(BH.Consequences.group(s, g)); return `<div class="rel-row"><span class="fam-l">${g === 'house' ? `🏠 ${U.esc(p.house.name)}` : BH.Consequences.GROUPS[g]}</span>${UI().relBar(v, 'wide')}<b>${v}</b><small class="muted">${BH.Consequences.repLabel(v)}</small></div>`; }).join('')}
          ${BH.Gist.aboutMe(s).length ? `<p class="muted tiny">🗣️ What people dey talk about you:</p><ul class="record">${BH.Gist.aboutMe(s).map((r) => `<li>${U.esc(r.text)} <small class="muted">${Math.round(r.spread * 100)}% know</small></li>`).join('')}</ul>` : ''}
        </section>

        ${style || post || child ? `<section class="card"><h2>👑 Senior Life</h2>
          ${style ? `<p>${style}</p><div class="style-meter"><span>😇</span><span class="meter"><i style="left:${U.clamp(50 + s.senior.style * 3, 2, 98)}%"></i></span><span>😈</span></div>` : ''}
          ${post ? `<p>Prefect post: <b>${post}</b> — ${BH.Seniority.POSTS[s.senior.prefect].perk}</p>` : s.senior.stripped ? '<p class="crit-txt">Stripped of your prefect post.</p>' : ''}
          ${child ? `<p>🐣 School child: <b>${U.esc(child.first)} ${U.esc(child.last)}</b> (${BH.NPC.relLabel(child)})</p>` : ''}
        </section>` : ''}

        <section class="card"><h2>📚 Academics — ${BH.Time.levelName(s)}, Term ${s.time.term}</h2>
          <p class="muted tiny">Classes are optional — but tracked. Tests in weeks ${A.TEST_WEEKS.join(' & ')}, exams in week ${D.CONFIG.TERM_WEEKS} (⭐ = has a question bank). CA = tests + assignments, adjusted for attendance. Report card = 40% CA + 60% exam. More preparation = more hints in tests.</p>
          <table class="acad"><thead><tr><th>Subject</th><th>Knowledge</th><th>Attended</th><th>CA</th><th>Exam</th></tr></thead><tbody>${academics}</tbody></table>
        </section>

        <section class="card"><h2>📜 Report Cards</h2>
          ${reports || `<p class="muted">Your first report card comes at the end of the term (week ${D.CONFIG.TERM_WEEKS}).</p>`}
          ${certs ? `<div class="certs">${certs}</div>` : ''}
        </section>

        <section class="card"><h2>🏠 Home & Family</h2>
          ${famBar('mummy', '👩🏾 Mummy')}${famBar('daddy', '👨🏾 Daddy')}${famBar('sibling', `🧒🏾 ${U.esc(s.family.sibName)}`)}${famBar('friend', `😎 ${U.esc(s.family.friendName)}`)}
          <p class="muted tiny">${s.phone.has ? (s.phone.confiscated ? '📵 Your phone is seized.' : `📱 You have a phone${s.phone.hidden ? ' (in your mattress)' : ''}. Battery ${Math.round(s.phone.battery)}%.`) : '📵 No phone — use the school phone in the Admin Block or write letters on your bed.'}${s.family.letterDue !== null ? ' ✉️ Waiting for a letter reply.' : ''}</p>
        </section>

        <section class="card"><h2>👥 People</h2>
          ${[['classmates', 'Coursemates'], ['seniors', 'Seniors'], ['juniors', 'Juniors'], ['teachers', 'Teachers'], ['staff', 'Staff']].filter(([k]) => (s.npcs[k] || []).length).map(([k, label]) => `
            <details ${k === 'classmates' ? 'open' : ''}><summary>${label} (${s.npcs[k].length})</summary>
              <div class="people-mini">${s.npcs[k].slice().sort((a, b) => b.rel - a.rel).map((n) => `
                <button class="pm-row" data-act="profile" data-arg="${n.id}"><span>${BH.NPC.emoji(n)}</span><b>${U.esc(BH.NPC.fullName(n))}</b>${UI().relBar(n.rel)}</button>`).join('')}</div>
            </details>`).join('')}
        </section>

        <section class="card"><h2>😖 Discipline record</h2>
          ${record ? `<ul class="record">${record}</ul>` : '<p class="muted">Clean record. Angel. 😇 (for now)</p>'}
          <p class="muted tiny">10 pts = letter home · 20 pts = suspension · 30 pts = expulsion. Each clean day removes 1 pt.</p>
        </section>

        <section class="card"><h2>📈 Life so far</h2>
          <div class="grid2"><span>📅 Days: ${h.daysPlayed}</span><span>🍛 Meals: ${h.meals}</span>
            <span>📝 Tests & exams: ${h.quizzes}</span><span>✅ Correct answers: ${h.correct}</span>
            <span>🎯 Missions done: ${h.missionsDone}</span><span>😖 Times punished: ${h.punished}</span></div>
        </section>

        <section class="card settings">
          <button class="btn secondary" data-act="wHub">✍️ Diary, letters & slam book</button>
          <button class="btn secondary" data-act="wTrophies">🏆 Trophy room</button>
          <button class="btn primary" data-act="saveNow">💾 Save now (Slot ${s.slot})</button>
          <button class="btn secondary" data-act="loadMenu">📂 Load another save</button>
          <button class="btn ghost" data-act="howTo">❓ How to play</button>
          <button class="btn ghost" data-act="quitToTitle">🏠 Save & quit to title</button>
        </section>`;
    },
  };

  Object.assign(BH.actions, {
    saveNow() { UI().toast(BH.Game.save() ? '💾 Game saved!' : 'Save failed — storage full?', 'good'); },
    quitToTitle() { BH.Game.save(); BH.actions.toTitle(); },
    viewReport(i) {
      const s = BH.Game.s;
      const r = s.reports[Number(i)];
      if (r) UI().modal(reportHtml(s, r), { cls: 'wide' });
    },
  });
})(window.BH);
