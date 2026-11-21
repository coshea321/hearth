'use strict';

// v529 — Recipes › Tools › Export: a recipe-v1 file, sectioned like the
// Calorie helper (Favourites default · All · a category).
//
// What's worth pinning:
//   1. the file is exactly what the import reads: hearth tag + recipes[] with
//      the nine recipe fields, and NOT the book's own bookkeeping (fav,
//      inRotation, lastCooked, id) — that's the confirmed "recipe only" scope
//   2. ingredients round-trip through the import unchanged, headers included
//   3. the section picks which recipes go out; the sheet opens on Favourites
//   4. exporting writes nothing to the book

module.exports = {
  name: '100-recipe-export',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      storeSet('fl4_recipebook', [
        { id: 10001, name: 'Fav Stew', servings: 4, kcal: 550, updated: 1, category: 'Dinner', fav: true,
          inRotation: true, lastCooked: '2026-11-01', prep: 'Chop the onion', method: 'Stew it.', notes: 'Freezes well',
          url: 'https://example.com/stew',
          ingredients: parseIngredients('<b>Base</b>\\n500 g Beef\\n2 tbsp Olive oil\\n2 eggs (whites only)') },
        { id: 10002, name: 'Plain Soup', servings: 2, updated: 1, category: 'Lunch',
          method: 'Simmer it.', ingredients: parseIngredients('300 g Lentils') }
      ]);
      var before = JSON.stringify(getRecipeBook());

      // ── 1. Shape ───────────────────────────────────────────────────────
      var p = recipeExportPayload('fav');
      ok('the file carries the recipe-v1 tag', p.hearth === RECIPE_FILE_TAG, p.hearth);
      ok('favourites section exports only the favourite', p.recipes.length === 1 && p.recipes[0].name === 'Fav Stew',
        JSON.stringify(p.recipes.map(function(r){ return r.name; })));
      var keys = Object.keys(p.recipes[0]).sort().join(',');
      ok('exactly the nine recipe fields, no bookkeeping', keys === 'category,ingredients,kcal,method,name,notes,prep,servings,url', keys);

      // ── 2. Round trip through the real import parser ───────────────────
      var back = recipesFromImportText(JSON.stringify(p));
      ok('the import reads the file back', !back.error && back.recipes.length === 1, back.error);
      var r = back.recipes[0] || {};
      ok('scalars survive', r.name === 'Fav Stew' && r.servings === 4 && r.kcal === 550 && r.category === 'Dinner' &&
        r.prep === 'Chop the onion' && r.method === 'Stew it.' && r.notes === 'Freezes well' && r.url === 'https://example.com/stew',
        JSON.stringify(r));
      var orig = getRecipeBook()[0].ingredients;
      ok('ingredients survive, header included (case aside: the import tidy capitalises names)',
        (r.ingredients || []).map(ingredientToLine).join('|').toLowerCase() === orig.map(ingredientToLine).join('|').toLowerCase() && !!(r.ingredients[0] || {}).header,
        (r.ingredients || []).map(ingredientToLine).join('|'));
      ok('bracketed ingredient notes survive (the editor keeps them)',
        (r.ingredients || []).some(function(i){ return /whites only/.test(ingredientToLine(i)); }),
        (r.ingredients || []).map(ingredientToLine).join('|'));
      var aiBack = recipesFromImportText(JSON.stringify({ hearth: RECIPE_FILE_TAG, name: 'AI Eggs', ingredients: '2 eggs (whites only)' }));
      ok('an AI reply (no from:hearth) still has brackets stripped',
        aiBack.recipes.length === 1 && !/whites/.test(ingredientToLine(aiBack.recipes[0].ingredients[0])),
        aiBack.recipes.length && ingredientToLine(aiBack.recipes[0].ingredients[0]));
      ok('a re-imported recipe arrives unstarred (stars stay personal)', r.fav === false, String(r.fav));

      // ── 3. Sections ────────────────────────────────────────────────────
      ok('All exports everything, sorted by name',
        recipeExportPayload('all').recipes.map(function(x){ return x.name; }).join(',') === 'Fav Stew,Plain Soup');
      ok('a category exports that category',
        recipeExportPayload('Lunch').recipes.map(function(x){ return x.name; }).join(',') === 'Plain Soup');
      ok('filename names the section', /^hearth-recipes-favourites-\\d{4}-\\d{2}-\\d{2}\\.json$/.test(recipeExportFilename('fav')),
        recipeExportFilename('fav'));

      // ── 4. The sheet ───────────────────────────────────────────────────
      openRecipeExportSheet();
      var cnt = document.getElementById('rcpExpCount');
      ok('the sheet opens on Favourites', cnt && /1 favourite\\b/.test(cnt.textContent), cnt && cnt.textContent);
      var allChip = Array.prototype.filter.call(document.querySelectorAll('.cal-filter'), function(b){ return b.getAttribute('data-key') === 'all'; })[0];
      if (allChip) allChip.click();
      cnt = document.getElementById('rcpExpCount');
      ok('a chip re-counts the section', cnt && /2 recipes/.test(cnt.textContent), cnt && cnt.textContent);
      document.getElementById('rcpExpClose').click();
      ok('Close removes the sheet', !document.getElementById('rcpExpCount'));

      ok('exporting writes nothing to the book', JSON.stringify(getRecipeBook()) === before);
      return { pass: pass, fail: fail };
    })()`);
  }
};
