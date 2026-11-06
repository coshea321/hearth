'use strict';

// v512: project import (`project-v1`, the golf-course AI-prompt pattern) and
// item groups. The parts that would fail quietly: a retired type or a bad
// link slipping in, a bad date kept, the plan's order lost, a reused id, an
// import touching an existing project, and the detail losing its groups.
// Cleans up after itself so later cases see an empty store.
module.exports = {
  name: '92-project-import',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var saved = storeGet('fl4_projects');

      // ── Parsing ──────────────────────────────────────────────────────────
      ok('JSON that is not a project file is refused', !!parseProjectFile('{"name":"x"}').error);
      ok('broken JSON is refused', !!parseProjectFile('{nope').error);
      ok('a file with no name is refused', !!parseProjectFile(JSON.stringify({ hearth:'project-v1', name:' ' })).error);
      ok('items that are not a list are refused', !!parseProjectFile(JSON.stringify({ hearth:'project-v1', name:'P', items:{} })).error);
      var file = { hearth:'project-v1', name:'US passports', status:'weird', target:'2026-02-30', notes:'Costs: $1,385',
        items:[
          { type:'task', group:'Part A', title:'Book the embassy', date:'2026-12-01', notes:'', done:false },
          { type:'task', group:'Part A', title:'Pay online', date:'next week', url:'https://pay.gov', notes:'' },
          { type:'link', group:'Part A', title:'Form DS-11', url:'https://pptform.state.gov' },
          { type:'link', group:'', title:'Bad link', url:'javascript:alert(1)' },
          { type:'cost', title:'Filing fee', notes:'$1,385' },
          { type:'task', group:'part a ', title:'Print the form', done:true },
          { type:'task', group:'Part B', title:'File N-600K' },
          { type:'task', title:'' },
          'junk'
        ] };
      var r = parseProjectFile(JSON.stringify(file));
      ok('a good file parses', !r.error && r.project && r.project.name === 'US passports', JSON.stringify(r).slice(0, 200));
      ok('an unknown status reads as planning', r.project.status === 'planning');
      ok('an impossible target date is cleared', r.project.target === '');
      ok('both bad dates are counted', r.badDates === 2, 'got ' + r.badDates);
      ok('five items kept', r.project.items.length === 5, 'got ' + r.project.items.length);
      ok('four skipped, each named', r.skipped.length === 4, JSON.stringify(r.skipped));
      ok('a cost is skipped and pointed at the notes', r.skipped.some(function(k){ return k.title === 'Filing fee' && /notes/.test(k.why); }));
      ok('an unsafe link is skipped', r.skipped.some(function(k){ return k.title === 'Bad link'; }));
      ok('a task keeps a stray web address in its notes', r.project.items[1].notes.indexOf('https://pay.gov') !== -1 && r.project.items[1].url === '');
      ok('done is kept on a task', r.project.items[3].done === true);

      // ── Applying ─────────────────────────────────────────────────────────
      var existing = { id:5, name:'Kitchen', status:'active', target:'', notes:'', updated:1, items:[ { id:6, type:'task', title:'Keep me', group:'', date:'', amount:'', who:'', phone:'', url:'', notes:'', done:false, sentAt:0, updated:1 } ] };
      storeSet('fl4_projects', [ existing ]);
      var made = projApplyImport(r.project);
      var all = getProjects();
      ok('the import makes a new project and leaves the old one alone', all.length === 2 && projFind(all, 5).items.length === 1 && projFind(all, 5).name === 'Kitchen');
      var np = projFind(all, made.id);
      var ids = {}; var dup = false;
      all.forEach(function(p){ if (ids[p.id]) dup = true; ids[p.id] = true; p.items.forEach(function(it){ if (ids[it.id]) dup = true; ids[it.id] = true; }); });
      ok('every id is unique across projects and items', !dup);
      ok('every imported item stores every field', np.items.every(function(it){
        return ['type','title','date','amount','who','phone','url','notes','group','done','sentAt','added','updated'].every(function(k){ return it[k] !== undefined; });
      }));
      ok('file order survives in the added stamps', np.items.map(function(it){ return it.title; }).join('|') ===
        np.items.slice().sort(function(a, b){ return a.added - b.added; }).map(function(it){ return it.title; }).join('|'));

      // ── Groups ───────────────────────────────────────────────────────────
      var g = projItemGroups(np.items);
      ok('"Part A" and "part a " are one group, then Part B', g.map(function(x){ return x.label; }).join('|') === 'Part A|Part B', g.map(function(x){ return x.label; }).join('|'));
      ok('Part A holds its three tasks and its link', g[0].items.length === 4);
      var odd = projItemGroups([ { group:'constructor', added:1 }, { group:'__proto__', added:2 }, { group:'toString', added:3 } ]);
      ok('a group named like a built-in property is still a group', odd.map(function(x){ return x.label + ':' + x.items.length; }).join('|') === 'constructor:1|__proto__:1|toString:1', JSON.stringify(odd));
      ok('search finds an item by its group', projectSearchText(np).indexOf('part b') !== -1);

      switchSection('projects');
      _projOpenId = made.id; _projView = 'detail'; renderProjects();
      var txt = document.getElementById('projectsContent').textContent;
      ok('the detail shows each group with its done count', txt.indexOf('Part A · 1 of 3 done') !== -1 && txt.indexOf('Part B · 0 of 1 done') !== -1, txt.slice(0, 300));
      ok('only Task and Link add buttons', document.querySelectorAll('#projectsContent .proj-add').length === 2);

      // ── The screen ───────────────────────────────────────────────────────
      document.querySelector('.hdr-act[data-sec="projects"] .hdr-more').click();
      document.getElementById('projImportBtn').click();
      ok('Import a plan opens the importer', _projView === 'import' && !!document.getElementById('projImportJson'));
      document.getElementById('projImportJson').value = '\`\`\`json\\n' + JSON.stringify({ hearth:'project-v1', name:'Pasted zz92', items:[ { type:'task', title:'One' } ] }) + '\\n\`\`\`';
      document.getElementById('projImportNext').click();
      ok('a fenced paste reaches the preview', !!document.getElementById('projImportGo'));
      document.getElementById('projImportGo').click();
      ok('Create opens the new project', _projView === 'detail' && getProjects().some(function(p){ return p.name === 'Pasted zz92' && p.id === _projOpenId; }));

      // ── Clean up ─────────────────────────────────────────────────────────
      storeSet('fl4_projects', saved || []); if (saved == null) localStorage.removeItem('fl4_projects');
      _projView = 'list'; _projOpenId = null; _projEditing = false; _projCancelFn = null;
      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
