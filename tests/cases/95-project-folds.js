'use strict';

// Project section folds (v516). Each section header of a project's detail
// (Tasks, Links, and every named group) folds on its own; Collapse all /
// Expand all folds them together (any open → collapse all). The state is
// device-local (fl4_proj_folds), remembered per project, and never synced.
// Cleans up after itself.
module.exports = {
  name: '95-project-folds',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function item(id, type, title, group){
        return { id:id, type:type, title:title, date:'', amount:'', who:'', phone:'', url:type === 'link' ? 'https://example.com' : '',
                 notes:'', group:group || '', order:'', done:false, sentAt:0, added:id, updated:1000 };
      }
      var saved = storeGet('fl4_projects'), savedF = storeGet('fl4_proj_folds');
      localStorage.removeItem('fl4_proj_folds');
      storeSet('fl4_projects', [
        { id:1, name:'K', status:'active', target:'', notes:'', updated:1, items:[
          item(11, 'task', 'Loose task'), item(12, 'link', 'Loose link'),
          item(13, 'task', 'Worktop task', 'Worktops'), item(14, 'task', 'Proto task', '__proto__') ] },
        { id:2, name:'Other', status:'active', target:'', notes:'', updated:1, items:[ item(21, 'task', 'Other task', 'Worktops') ] } ]);
      _projReorderId = null;
      openRecord('projects', 1);
      var el = document.getElementById('projectsContent');
      function shown(id){ return !!el.querySelector('.proj-item-body[data-iid="' + id + '"]'); }
      function hdr(sec){ return el.querySelector('.proj-fold[data-sec="' + sec + '"]'); }

      ok('every section has a fold header, open by default',
        ['t:task', 't:link', 'g:worktops', 'g:__proto__'].every(function(s){ return hdr(s) && hdr(s).getAttribute('aria-expanded') === 'true'; }));
      ok('a group typed as __proto__ starts open', shown(14));
      ok('Collapse all is offered', /Collapse all/.test(document.getElementById('projFoldAll').textContent));

      // ── One section on its own ───────────────────────────────────────────
      hdr('g:worktops').click();
      ok('tapping a group header folds just that group', !shown(13) && shown(11) && shown(12) && shown(14));
      ok('its header stays, marked collapsed', hdr('g:worktops').getAttribute('aria-expanded') === 'false');
      hdr('t:link').click();
      ok('the ungrouped Links section folds on its own', !shown(12) && shown(11));
      hdr('g:worktops').click();
      ok('tapping again unfolds it', shown(13));

      // ── Remembered per project, never synced ─────────────────────────────
      document.getElementById('projBack').click();
      openRecord('projects', 1);
      ok('the fold is remembered on reopening', !shown(12) && shown(13));
      openRecord('projects', 2);
      ok('another project with a same-named group is unaffected', shown(21));
      openRecord('projects', 1);
      ok('the folds are not in the backup', !('proj_folds' in buildExportPayload()) && JSON.stringify(buildExportPayload()).indexOf('fl4_proj_folds') === -1);

      // ── Collapse all / Expand all ────────────────────────────────────────
      document.getElementById('projFoldAll').click();
      ok('Collapse all folds every section', ![11, 12, 13, 14].some(shown));
      ok('and the button turns to Expand all', /Expand all/.test(document.getElementById('projFoldAll').textContent));
      document.getElementById('projFoldAll').click();
      ok('Expand all opens every section', [11, 12, 13, 14].every(shown));
      ok('and no fold state is left for the project', !projFolds()[1]);

      // ── A single section gets no Collapse all; deleting drops the state ──
      openRecord('projects', 2);
      ok('one section: no Collapse all button', !document.getElementById('projFoldAll'));
      hdr('g:worktops').click();
      ok('the state is stored for project 2', projSecFolded(2, 'g:worktops'));
      projDelete(2);
      ok('deleting a project drops its fold state', !projFolds()[2]);

      // ── Clean up ─────────────────────────────────────────────────────────
      storeSet('fl4_projects', saved || []); if (saved == null) localStorage.removeItem('fl4_projects');
      if (savedF == null) localStorage.removeItem('fl4_proj_folds'); else storeSet('fl4_proj_folds', savedF);
      var tombs = getTombs('projects'); delete tombs[2]; storeSet('fl4_tomb_projects', tombs);
      _projView = 'list'; _projOpenId = null;
      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
