'use strict';

// Project task order (v515). Tasks follow their due dates until one is
// moved; the first move numbers the group's open tasks 1..n, and every later
// move rewrites ONLY the moved task (so two phones reordering at once can't
// scramble each other through the per-item newest-wins merge). Done tasks
// sink to the bottom. Cleans up after itself.
module.exports = {
  name: '94-project-task-order',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function item(id, title, extra){
        var o = { id:id, type:'task', title:title, date:'', amount:'', who:'', phone:'', url:'', notes:'', group:'', order:'', done:false, sentAt:0, added:id, updated:1000 };
        Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; });
        return o;
      }
      function titles(p, key){ return projSortTasks(projGroupTasks(p, key || '')).map(function(x){ return x.title; }).join('|'); }
      var saved = storeGet('fl4_projects');

      // ── Before any move: due-date order, done last ───────────────────────
      storeSet('fl4_projects', [ { id:1, name:'Kitchen', status:'active', target:'', notes:'', updated:1, items:[
        item(11, 'C', { date:'2030-03-01' }), item(12, 'A', { date:'2030-01-01' }), item(13, 'B', { date:'2030-02-01' }),
        item(14, 'Done', { done:true }), item(15, 'Other group', { group:'Garden' }),
        { id:16, type:'link', title:'L', url:'https://example.com', group:'', order:'', updated:1000, added:16 } ] } ]);
      var p = getProjects()[0];
      ok('an unmoved group follows due dates, done last', titles(p) === 'A|B|C|Done', titles(p));

      // ── The first move numbers the group, later moves touch one task ─────
      projMoveTask(1, 13, 1);                              // B down
      p = getProjects()[0];
      ok('moving B down puts it after C', titles(p) === 'A|C|B|Done', titles(p));
      ok('the first move numbers every open task in the group',
        [11, 12, 13].every(function(id){ return typeof projFind(p.items, id).order === 'number'; }));
      ok('a done task and another group are left alone',
        projFind(p.items, 14).order === '' && projFind(p.items, 15).order === '' && projFind(p.items, 16).order === '');
      // Make every stamp distinct-and-old so a change is visible.
      p.items.forEach(function(x){ x.updated = 500; }); storeSet('fl4_projects', [p]);
      projMoveTask(1, 12, 1);                              // A down
      p = getProjects()[0];
      ok('a second move works', titles(p) === 'C|A|B|Done', titles(p));
      ok('and rewrites ONLY the moved task',
        p.items.filter(function(x){ return x.updated !== 500; }).map(function(x){ return x.id; }).join(',') === '12',
        JSON.stringify(p.items.map(function(x){ return [x.id, x.updated]; })));
      projMoveTask(1, 11, -1);                             // C already at the top
      ok('moving the top task up does nothing', titles(getProjects()[0]) === 'C|A|B|Done');

      // Many moves into the same gap: it renumbers instead of wearing out.
      for (var n = 0; n < 70; n++) { projMoveTask(1, n % 2 ? 11 : 12, 1); }
      p = getProjects()[0];
      ok('70 moves later the order is still a clean list of three', projSortTasks(projGroupTasks(p, '')).filter(function(x){ return !x.done; }).length === 3);

      // ── Ticked tasks keep their number; joining a group goes to the end ──
      ok('a new task joins the end of an ordered group', projOrderForJoin(p, '') > Math.max(projFind(p.items, 11).order, projFind(p.items, 12).order, projFind(p.items, 13).order));
      ok('an unordered group gives no order', projOrderForJoin(p, 'garden') === '');

      // ── Merge: the order field rides the per-item merge ──────────────────
      var A = [{ id:1, name:'K', updated:1, items:[ item(21, 'x', { order:1, updated:1000 }), item(22, 'y', { order:2, updated:1000 }) ] }];
      var B = [{ id:1, name:'K', updated:1, items:[ item(21, 'x', { order:3, updated:2000 }), item(22, 'y', { order:2, updated:1000 }) ] }];
      var m = mergeProjectsData(A, B, {}, {});
      ok('a move on the other phone arrives', projFind(m.projects[0].items, 21).order === 3);
      var m2 = mergeProjectsData(A, [{ id:1, name:'K', updated:1, items:[ { id:21, type:'task', title:'x', updated:3000 } ] }], {}, {});
      ok('an older build that never heard of order cannot drop it', projFind(m2.projects[0].items, 21).order === 1);

      // ── Import keeps the plan's order from the start ─────────────────────
      storeSet('fl4_projects', []);
      var np = projApplyImport({ name:'Plan', status:'planning', target:'', notes:'', items:[
        { type:'task', title:'Late-dated first', group:'', date:'2031-01-01', url:'', notes:'', done:false },
        { type:'task', title:'Early-dated second', group:'', date:'2030-01-01', url:'', notes:'', done:false } ] });
      ok('an imported plan keeps its own order, not its dates', titles(getProjects()[0]) === 'Late-dated first|Early-dated second', titles(getProjects()[0]));

      // ── Render: numbers always, arrows only while reordering ─────────────
      storeSet('fl4_projects', [ { id:2, name:'R', status:'active', target:'', notes:'', updated:1, items:[
        item(31, 'First'), item(32, 'Second'), item(33, 'Solo', { group:'Other' }) ] } ]);
      _projReorderId = null;
      openRecord('projects', 2);
      var content = document.getElementById('projectsContent');
      ok('open tasks are numbered', /1\\./.test(content.querySelector('.proj-item-body[data-iid="31"]').textContent) &&
        /2\\./.test(content.querySelector('.proj-item-body[data-iid="32"]').textContent));
      ok('no arrows until Reorder is tapped', content.querySelectorAll('.proj-move').length === 0);
      document.getElementById('projReorder').click();
      ok('Reorder shows arrows on the open tasks', content.querySelectorAll('.proj-move').length === 4);
      ok('the top task cannot go up', content.querySelector('.proj-move[data-iid="31"][data-dir="-1"]').disabled === true);
      ok('a task alone in its group gets no arrows', !content.querySelector('.proj-move[data-iid="33"]'));
      content.querySelector('.proj-move[data-iid="31"][data-dir="1"]').click();
      ok('tapping down moves the task', titles(getProjects()[0]) === 'Second|First');
      ok('and the list stays in reorder mode', content.querySelectorAll('.proj-move').length === 4);
      document.getElementById('projBack').click();
      ok('leaving the project ends reorder mode', _projReorderId === null);

      // ── Clean up ─────────────────────────────────────────────────────────
      storeSet('fl4_projects', saved || []); if (saved == null) localStorage.removeItem('fl4_projects');
      _projView = 'list'; _projOpenId = null; _projReorderId = null;
      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
