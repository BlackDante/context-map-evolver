# Maps in TypeScript — reference

The [`.cme` DSL](DSL.md) is one way to write a model. TypeScript is the other:
contexts are **variables**, relations and promises point at those variables, and
the file ends by putting them on a map.

```ts
import { context, map } from 'context-map-evolver';

const sales = context('Sales');
const billing = context('Billing');

sales.upstreamOf(billing);

export default map('Ordering', sales, billing);
```

> **Experimental, and off by default.** TypeScript maps ship behind the
> `typescript` feature flag: open the app with `?features=typescript` (or build
> it with `VITE_FEATURES=typescript`). Without the flag the app is DSL-only and
> never runs a line of model code.

That is a complete model — the same one as the first example in the DSL
reference. Both languages produce **the same model**, so the slider, the lenses,
the layout and the numbers behave identically; everything in
[What each level reads](DSL.md#what-each-level-reads) and
[How the numbers are computed](DSL.md#how-the-numbers-are-computed) applies
unchanged.

**Why TypeScript?** Your editor knows the vocabulary: completion for every
option, a typo in a context name or a connascence kind is a compile error
instead of a message under the map, rename and go-to-definition work on
contexts. And it is code — a map can be computed. **Why the DSL?** It is
smaller, reads without knowing a programming language, and a file of it can do
nothing but describe a map. Pick per file; the two mix freely in one folder.

**Contents**

- [Getting started](#getting-started)
- [`context`](#context) · [promises](#promises-and-impositions) · [`upstreamOf`](#upstreamof) · [`map`](#map)
- [DSL ↔ TypeScript](#dsl--typescript)
- [It is code](#it-is-code)
- [Errors](#errors)
- [How a map file runs](#how-a-map-file-runs)
- [Recipes](#recipes)

---

## Getting started

**A file.** Name it `something.cme.ts`. The double extension is what marks it as
a map: `host` picks up `.cme` and `.cme.ts` files and leaves ordinary `.ts`
files alone.

```bash
npx context-map-evolver host ./architecture/context-map.cme.ts   # switches the flag on for you
npx context-map-evolver host ./architecture                      # then add ?features=typescript to the URL
```

**In the browser.** With `?features=typescript` in the address, the `DSL | TS`
switch under the editor rewrites the current
model in the other language, so the quickest way to see what a map looks like in
TypeScript is to open any demo and press `TS`. **import** accepts `.cme.ts`
files, **export** saves one.

**Types in your IDE.** The app itself needs nothing installed. For completion
and type-checking, add the package to the project that holds your maps:

```bash
npm install --save-dev context-map-evolver
```

---

## `context`

```ts
const legal = context('Legal', {
  subdomain: 'core',
  cynefin: 'complex',
  questions: ['When can a license be used, and where?'],
  at: [400, 200],
});
```

Declares a bounded context — a box on the map. Keep the result in a variable:
that variable is how relations and promises refer to the context. Every option
is optional, and so is the options object.

| Option | Values | DSL |
|---|---|---|
| `subdomain` | `'core'` \| `'supporting'` \| `'generic'` | [`subdomain`](DSL.md#subdomain) |
| `cynefin` | `'clear'` \| `'complicated'` \| `'complex'` \| `'chaotic'` \| `'disorder'` | [`cynefin`](DSL.md#cynefin) |
| `questions` | a list of strings | one [`question`](DSL.md#question) each |
| `at` | `[x, y]` | [`at x y`](DSL.md#at) |

The name is any string; unlike in the DSL there is nothing to quote specially.
Names must be unique on a map.

## Promises and impositions

[Promise Theory](DSL.md#promise-and-imposition): a context can only make
promises about its own behaviour. Three verbs on a context, one for each kind:

```ts
payments.promises('payment confirmation').to(orders);
orders.uses('payment confirmation').from(payments).if('order total is positive');
carrier.imposes('you must use our label format').on(warehouse);
```

| Call | Meaning | DSL |
|---|---|---|
| `a.promises(body)` | a **give** promise (+) — "I will provide …" | `promise + "body"` |
| `a.uses(body)` | a **use** promise (−) — "I will accept / rely on …" | `promise - "body"` |
| `a.imposes(body)` | an **imposition** — forcing behaviour onto another context | `imposition "body"` |
| `.to(b)` · `.from(b)` · `.on(b)` | the counterpart — each verb offers the word that reads naturally | `to b` · `from b` · `on b` |
| `.if(condition)` | the promise is conditional | `if "condition"` |

Leave the counterpart out for a promise **to everyone**:

```ts
identity.promises('tokens are valid for 15 minutes');
```

## `upstreamOf`

```ts
legal
  .upstreamOf(availability, {
    type: 'customer-supplier',
    upstream: 'OHS',
    downstream: 'ACL',
    integration: 'REST + events',
    coupling: 2,
  })
  .connascence('meaning', 'distant', 3)
  .connascence('value', 'distant', 2);
```

A directed integration: the context you call it on is **upstream**, the argument
is **downstream** — `legal.upstreamOf(availability)` is the DSL's
`Legal -> Availability`. Call it again for the same pair to model several
integrations; they fan out as separate curves.

| Option | Values | DSL |
|---|---|---|
| `type` | the DDD pattern — completion offers the common ones (`'partnership'`, `'shared-kernel'`, `'customer-supplier'`, `'conformist'`, `'anticorruption-layer'`, `'open-host-service'`, `'published-language'`, `'separate-ways'`), any string is accepted | [`type`](DSL.md#type) |
| `upstream` · `downstream` | the integration role on each side, e.g. `'OHS'`, `'ACL'` | [`upstream` / `downstream`](DSL.md#upstream--downstream) |
| `integration` | free text: how the integration happens | [`integration`](DSL.md#integration) |
| `coupling` | a positive number, default `1` | [`coupling`](DSL.md#coupling) |

**`.connascence(kind, locality?, degree?)`** declares one
[kind of connascence](DSL.md#connascence) on that boundary; chain it for
several. `kind` is one of `'name'`, `'type'`, `'meaning'`, `'position'`,
`'algorithm'`, `'execution'`, `'timing'`, `'value'`, `'identity'`; `locality` is
`'local'` (the default) or `'distant'`; `degree` is a whole number (default 2).
Either may be left out: `.connascence('name')`, `.connascence('name', 'distant')`,
`.connascence('name', 3)`.

## `map`

```ts
export default map('Media Rights Platform', legal, availability);
```

Puts contexts on a map, in the order given, under a title. A map file must
`export default` one. **Only the contexts listed are drawn** — a relation or a
promise that points at a context left out of the list is reported, exactly like
a reference to an undeclared context in the DSL.

---

## DSL ↔ TypeScript

The same model, side by side:

```
map "Media Rights Platform"

context Legal {
  subdomain core
  cynefin complex
  question "When can a license be used, and where?"
  promise + "authoritative licensing rules" to Availability
}

context Availability {
  subdomain supporting
  at 400 200
  promise - "authoritative licensing rules" from Legal
}

Legal -> Availability {
  type customer-supplier
  upstream OHS
  downstream ACL
  coupling 2
  connascence meaning distant 3
}
```

```ts
import { context, map } from 'context-map-evolver';

const legal = context('Legal', {
  subdomain: 'core',
  cynefin: 'complex',
  questions: ['When can a license be used, and where?'],
});

const availability = context('Availability', {
  subdomain: 'supporting',
  at: [400, 200],
});

legal.promises('authoritative licensing rules').to(availability);
availability.uses('authoritative licensing rules').from(legal);

legal
  .upstreamOf(availability, {
    type: 'customer-supplier',
    upstream: 'OHS',
    downstream: 'ACL',
    coupling: 2,
  })
  .connascence('meaning', 'distant', 3);

export default map('Media Rights Platform', legal, availability);
```

The editor's `DSL | TS` switch does this conversion for you, in both
directions. It goes through the model, so **comments and formatting are not
carried over** — but switching straight back, without editing in between,
returns the text you had. One thing has no TypeScript spelling: the DSL lets an
`imposition` carry a `-` sign; nothing draws it, and the conversion drops it.

Every file in [`examples/`](../examples) exists in both languages.

---

## It is code

A map file is an ordinary TypeScript module, so whatever is repetitive can be
computed:

```ts
import { context, map, type ContextBuilder } from 'context-map-evolver';

const hub = context('Orders', { subdomain: 'core' });

const spokes: ContextBuilder[] = ['Catalog', 'Payments', 'Shipping'].map((name) =>
  context(name, { subdomain: 'supporting' }),
);
for (const spoke of spokes) spoke.upstreamOf(hub, { type: 'customer-supplier' });

export default map('Hub and spoke', hub, ...spokes);
```

Three limits, all deliberate:

- **The only module a map file can import is `context-map-evolver`.** No
  relative imports, no npm packages, no Node built-ins — a map file has to mean
  the same thing in the browser as on your disk. (An import that nothing uses,
  or that only brings in types, is dropped and does no harm.)
- **The default export is the map.** Other exports are ignored.
- **It has two seconds.** A run that takes longer is stopped and reported.

---

## Errors

There are two lines of defence, and they catch the same mistakes.

**In your IDE**, the types reject them before the file is ever run: an unknown
`subdomain`, a misspelled option, `.from()` on a give-promise, a string where a
context is expected.

**In the app**, nothing is type-checked — the types are simply stripped — so the
builder checks everything again at run time. Like the DSL parser it never
throws: whatever it understood is drawn, and the problems are listed under the
editor.

| Message | Cause |
|---|---|
| `line N: …` | the file does not parse, or threw while running — nothing new is drawn; the last map that worked stays on screen |
| `a map file must end with 'export default map("Title", …contexts)'` | no default export, or it is not a map |
| `cannot import 'x' — a map file can only import 'context-map-evolver'` | |
| `the map file ran for more than 2 s and was stopped` | most likely a loop that never ends |
| `context 'X': subdomain must be core \| supporting \| generic` | likewise `cynefin` |
| `context 'X': unknown option 'x'` / `relation A -> B: unknown option 'x'` | a typo in an option name |
| `context 'X': questions expects a list of strings` | |
| `context 'X': at expects two numbers` | the context is left unpinned |
| `context() expects a name` | the context is left off the map |
| `context 'X': promises() expects the body as a string` | likewise `uses()`, `imposes()` |
| `context 'X': promises("…").to() expects a context` | a name was passed instead of the variable |
| `context 'X': upstreamOf() expects a context` | |
| `relation A -> B: coupling expects a positive number` | |
| `relation A -> B: unknown connascence kind 'x'` | |
| `map() expects a title as its first argument` / `map() expects contexts after the title` | |
| `duplicate context 'X' — ignored` | two contexts with one name; the first wins |
| `relation A -> B: 'B' is not passed to map()` | the relation is kept but not drawn |
| `context 'A': promise "…" names 'B', which is not passed to map()` | the promise is kept but not drawn |
| `'X' cannot have a relation with itself` | likewise for promises |

---

## How a map file runs

A `.cme` file is data. A `.cme.ts` file is a **program**, and the app runs it on
every keystroke — so it is worth knowing where:

- **In your browser, in a Web Worker.** The types are stripped (by
  [sucrase](https://github.com/alangpierce/sucrase), fetched only when a
  TypeScript map is first opened), and the code runs on a separate thread with
  no access to the page. That is also what makes the two-second limit possible:
  a half-typed endless loop is terminated instead of freezing the tab.
- **Never on the server.** `context-map-evolver host` serves `.cme.ts` files as
  text, like `.cme` files. It does not execute them, in any mode.
- **Without a way out, when hosted.** A map file run by `host` shares an origin
  with every model in the hosted folder, so the server sends a Content Security
  Policy that keeps requests and script loads on that origin: a map file cannot
  send what it can read anywhere else.

This is defence in depth, not a sandbox. Treat a `.cme.ts` file from someone
else the way you would treat any script from them: read it before you open it.

---

## Recipes

**Two integrations between the same pair**

```ts
payments.upstreamOf(orders, { type: 'open-host-service', upstream: 'OHS', integration: 'create payment' });
payments.upstreamOf(orders, { type: 'customer-supplier', integration: 'payment completed' });
```

**A bidirectional partnership** — declare both directions; they curve apart.

```ts
pricing.upstreamOf(underwriting, { type: 'partnership' });
underwriting.upstreamOf(pricing, { type: 'partnership' });
```

**A helper for a recurring kind of context**

```ts
import { context, map } from 'context-map-evolver';

const offTheShelf = (name: string) => context(name, { subdomain: 'generic', cynefin: 'clear' });

const identity = offTheShelf('Identity');
const payments = offTheShelf('Payments');
const orders = context('Orders', { subdomain: 'core', cynefin: 'complicated' });

identity.upstreamOf(orders, { type: 'conformist' });
payments.upstreamOf(orders, { type: 'conformist' });

export default map('Buy, do not build', orders, identity, payments);
```

**The model as data, in your own script** — the builder is a plain library, so
a map can be checked in CI or fed to other tooling. `toModel()` returns the
model and the list of problems:

```ts
import { context, map } from 'context-map-evolver';

const a = context('A');
const b = context('B');
a.upstreamOf(b);

const { map: model, errors } = map('Checked in CI', a, b).toModel();
if (errors.length) throw new Error(errors.join('\n'));
console.log(`${model.contexts.length} contexts, ${model.relations.length} relations`);
```
