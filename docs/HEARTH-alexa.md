# Hearth — Alexa → Grocery list (v527)

Design record and setup. Confirmed with Cathal 15/11/2026: **"Alexa, tell family hub to add milk and eggs"** (spoken name renamed from "hearth" on 16/11/2026, see Decisions); several items in one go; items **sorted into grocery categories**; **add-only** (Alexa never reads the list out).

## How it works
- **Why not Alexa's own shopping list:** "Alexa, add X to my shopping list" always goes to Amazon's built-in list, and Amazon closed third-party access to that list in 2024. So this is a private custom skill with its own invocation name.
- **The skill** stays in **development** mode on Cathal's free Amazon developer account. It is never published and works only on Echo devices signed in to that Amazon account. Its interaction model is `docs/HEARTH-alexa-model.json`: one `AddItemsIntent` with a free-text `items` slot (`AMAZON.SearchQuery`).
- **`functions/api/alexa.js`** (Pages Function, `/api/alexa`) checks that each request is genuine, then POSTs `{text, ts:<server time>, src:"alexa"}` to **`/hearth/households/<code>/inbox`**, signed in to Firebase as one family login. Alexa replies "Added milk and eggs."
- **The app** (`src/js/18b-alexa-inbox.js`) listens on `/inbox` next to the household stream and also reads it on the 5-minute fallback. It splits the phrase with the voice-capture splitter (`parseVoiceItems`) and drops carrier words ("some", "to the shopping list"). It categorises each item with `detectCatFor("grocery", …)`, the same keywords as a manual add. Then it adds the items the way Home quick-add does: an item already on the list is left alone, and a ticked-off match is moved back. Finally it saves, pushes, deletes the inbox entry and shows "🔊 Alexa added …". The other phone gets the items through normal sync, with an "Alexa added …" toast. Items carry `addedBy:"alexa"`.
- **A device only drains when** it is in a household, Grocery sync is on, and it has completed a household read. Test builds and demo-tainted devices never drain.

## Decisions on record — do NOT simplify these
- **Do NOT have the function write into `/shared`.** Every device PUTs the whole `/shared` document (`pushHousehold`), so a push already on its way would overwrite an item the function wrote there. `/inbox` is never touched by `pushHousehold`.
- **Item ids are the entry's server timestamp (+ index), not `Date.now()` on the phone.** Two phones draining the same entry then create the *same* item, and the union-by-id merge keeps one. An id already tombstoned is skipped. Changing this to a random id brings back duplicates. Server timestamps are not unique, though: if the id is already held by a *different* item, the next free id is taken. The worst case is then a duplicate, never a lost item (PR #300 review). **A drain whose household changed while the read was in flight is discarded** (`drainAlexaInbox` captures `hearthHouse`).
- **An entry is deleted only after the local save succeeded** (`applyAlexaInbox` returns no keys if `storeSet` fails), so nothing is lost on a full phone.
- **Categorising happens in the app, not the function.** That keeps one keyword table (`GROCERY_KW`) and no second copy to drift.
- **`/api/alexa` is OUTSIDE the Cloudflare Access login** (Alexa cannot sign in). It is protected instead by: Amazon's `Signature-256` over the raw body, the cert URL pinned to `https://s3.amazonaws.com/echo.api/…`, the cert in date and naming `echo-api.amazon.com`, the timestamp within 150 s, and the skill id equal to the `ALEXA_SKILL_ID` secret. Every check is required; a missing secret rejects everything. **Known limit:** the certificate chain up to Amazon's root CA is not re-verified, because a zero-dependency function has no X.509 library. The URL pin is what vouches for the certificate. Worst case if that were ever beaten: someone adds grocery items. The endpoint cannot read or delete anything.
- If the deferred Firebase rules tightening (`HEARTH-firebase-rules.md` § proposed replacement) is ever applied, it must add `"inbox": { ".write": "auth != null" }` under `$code`, or Alexa stops working.

- **The spoken name is "family hub", NOT "hearth" (16/11/2026).** "hearth" was accepted by the console and worked when typed in the Test tab, but by voice Alexa heard it as "hive" (sent to her own shopping list) and "heart" (Heart radio on Spotify). The name lives only in the Amazon console (Build → Invocations) and in `HEARTH-alexa-model.json`; nothing in the app or the function depends on it. A replacement name must be two words, and must avoid "list" and anything that sounds like a brand or station. **Diagnose mishearing** in the Alexa app → Settings → Alexa Privacy → Review Alexa History, which shows what she transcribed.

Pinned by `tests/cases/98-alexa-grocery.js`. It loads the function in Node, signs requests with a key generated at test time and builds a certificate by hand, so no key is ever committed.

## Setup (Cathal, once)
**A. Cloudflare secrets.** Workers & Pages → the Hearth project → **Settings → Variables and Secrets**. Add each one as type **Secret**, for **Production**:

| Name | Value |
|---|---|
| `HEARTH_FIREBASE_URL` | the Firebase database URL Hearth asks for at login (Settings → Sync) |
| `HEARTH_FIREBASE_KEY` | the Firebase web API key Hearth asks for at login |
| `HEARTH_USER` | `cathal1` (the Hearth username, without `@hearth.app`) |
| `HEARTH_PASSWORD` | that login's password |
| `HEARTH_HOUSEHOLD` | the household code (Hearth → Settings → Household) |
| `ALEXA_SKILL_ID` | from step B.4 |

**B. The skill.** Sign in at developer.amazon.com with the **same Amazon account the Echo uses**, then Alexa Skills Kit → Console.
1. **Create Skill.** Name: Hearth. Locale: **English (UK)**, or whatever language the Echo is set to; they must match. Type **Custom**, hosting **Provide your own**, template **Start from scratch**.
2. **Build → Interaction Model → JSON Editor.** Paste all of `docs/HEARTH-alexa-model.json` → **Save** → **Build skill**. The invocation name is `family hub` (see Decisions for why not "hearth").
3. **Build → Endpoint → HTTPS.** Default region: `https://miniature-journey-b9p.pages.dev/api/alexa`. Certificate option: **"My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority"** → **Save**.
4. Copy the **Skill ID** (`amzn1.ask.skill.…`, at the top of the Endpoint page) into the `ALEXA_SKILL_ID` secret.
5. **Test tab** → set "Skill testing is enabled in" to **Development**.

**C. Let Alexa past the login.** Cloudflare **Zero Trust → Access → Applications → Add an application → Self-hosted**. Name: "Hearth Alexa". Domain `miniature-journey-b9p.pages.dev`, path **`api/alexa`**. Policy: action **Bypass**, include **Everyone**. A path-specific application takes precedence over the whole-site one, so the rest of Hearth stays gated. **Check afterwards:** in a private browser window, the main URL must still show the Cloudflare login page.

**D. Redeploy** (Deployments → latest → ⋯ → Retry deployment) so the secrets reach the function, or just merge the next PR.

**E. Try it.** Use the console's Test tab first: type `tell family hub to add milk and eggs`. Then try it on the Echo.

## Troubleshooting
- **Alexa says "there was a problem with the requested skill's response"**: the function refused the request. Usually `ALEXA_SKILL_ID` is missing or wrong, or step D was not done.
- **Alexa says "Sorry, I couldn't reach Hearth"**: the Firebase sign-in or write failed. Check `HEARTH_FIREBASE_URL`, `HEARTH_FIREBASE_KEY`, `HEARTH_USER`, `HEARTH_PASSWORD` and `HEARTH_HOUSEHOLD`. **If that login's password is ever changed, update `HEARTH_PASSWORD` too.**
- **Alexa confirms but nothing appears**: open Hearth on a phone that has Grocery sync on. Items wait in the inbox until a phone picks them up.
- **The Cloudflare login page reaches Alexa instead of the function**: step C is missing or its path is wrong.
