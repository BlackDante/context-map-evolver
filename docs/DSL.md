# The `.cme` DSL — language reference

A Context Map Evolver model is a plain-text file. You declare **bounded
contexts**, connect them with **relations**, and — as your understanding grows —
enrich both with more attributes. Nothing is ever redrawn: the same text gains
detail, and the [detail-level slider](#what-each-level-reads) decides how much
of it is on screen.

```
map "Ordering"

context Sales
context Billing

Sales -> Billing
```

That is a complete model. Everything below is optional enrichment.

**Contents**

- [Five-minute tutorial](#five-minute-tutorial)
- [Lexical rules](#lexical-rules) — comments, names, strings, whitespace
- [`map`](#map) · [`context`](#context) · [relations](#relations)
- [What each level reads](#what-each-level-reads)
- [How the numbers are computed](#how-the-numbers-are-computed)
- [Errors and recovery](#errors-and-recovery)
- [Grammar](#grammar)
- [Recipes](#recipes)

---

## Five-minute tutorial

The point of the tool is that one model *evolves*. Start with what you know on
day one and add a layer whenever the conversation needs it.

**Step 1 — structure (L0).** Who talks to whom, and who is upstream?

```
map "Media Rights Platform"

context Legal
context Availability

Legal -> Availability { type customer-supplier  upstream OHS  downstream ACL }
```

The arrow always points **upstream → downstream**: `Legal` is upstream, its model
flows into `Availability`, and `Availability` *depends on* `Legal`.

**Step 2 — strategy (L1).** What kind of problem is each context, and what
business questions does it exist to answer?

```
context Legal {
  subdomain core
  cynefin complex
  question "When can a license be used, and where?"
}
```

**Step 3 — promises (L2).** What does each context voluntarily commit to?

```
context Legal {
  …
  promise + "authoritative licensing rules" to Availability
}
context Availability {
  promise - "authoritative licensing rules" from Legal   # the matching use-promise
}
```

**Step 4 — coupling (L3).** How strong is each dependency, and what kind of
knowledge leaks across it?

```
Legal -> Availability {
  …
  coupling 2
  connascence meaning distant 3
  connascence value distant 2
}
```

Each step only *added* lines. Move the slider back to L0 and the map is as clean
as it was in step 1.

---

## Lexical rules

| | |
|---|---|
| **Comments** | `#` or `//` to the end of the line. Not recognised inside strings, so `"see http://x.io #42"` is safe. |
| **Whitespace** | Insignificant. Line breaks are not separators — `context A { subdomain core cynefin clear }` is fine on one line. |
| **Bare words** | Any run of characters without spaces, braces or quotes: `Sales`, `customer-supplier`, `OHS+PL`. A hyphen is part of the word unless it starts an arrow, so `A->B` still reads as `A`, `->`, `B`. |
| **Strings** | Double-quoted, single-line, **no escape sequences** — a string cannot contain `"`. |
| **Names** | Wherever a context is named you may use a bare word or a string. Quote names that contain spaces, and names that collide with the top-level keywords `map` and `context`. |
| **Numbers** | `12`, `-40`, `2.5`. |
| **Case** | Keywords and enum values are lower-case and case-sensitive. Names are case-sensitive: `Sales` and `sales` are different contexts. |

---

## `map`

```
map "Title"
```

Optional; at most one is useful (a later `map` overrides an earlier one). The
title names the exported files (`Media Rights Platform` →
`media-rights-platform.cme` / `.svg`) and is embedded in the SVG as its
`<title>`. Default: `Untitled map`.

---

## `context`

```
context Name
context "Name With Spaces" { … }
```

Declares a bounded context — a box on the map. The block is optional. Names
must be unique; a second `context` with the same name is reported and ignored
(the first declaration wins).

Declaration order does not matter: a relation may mention a context declared
further down the file.

### `subdomain`

```
subdomain core | supporting | generic
```

Strategic classification (Evans). Colours the box on L1+ and drives the
investment advice in the [analysis panel](#the-analysis-panel).

| Value | Colour | Advice |
|---|---|---|
| `core` | violet | Invest most — your competitive edge. Build in-house. |
| `supporting` | blue | Necessary but not differentiating. Build pragmatically. |
| `generic` | slate | Buy / adopt off-the-shelf. Minimise custom effort. |

### `cynefin`

```
cynefin clear | complicated | complex | chaotic | disorder
```

The *nature* of the problem (Snowden's Cynefin). Shown as a second chip.

| Value | How to act |
|---|---|
| `clear` | Best practice. Sense → categorise → respond. |
| `complicated` | Good practice. Sense → analyse → respond (experts). |
| `complex` | Emergent. Probe → sense → respond (experiments). |
| `chaotic` | Novel. Act → sense → respond (stabilise first). |
| `disorder` | Unknown domain — break it down until it is knowable. |

Subdomain and Cynefin are cross-checked: a **core** context marked **clear**, or
a **generic** one marked **complex**, gets a ⚠ in the
[analysis panel](#the-analysis-panel) — the classification probably deserves a
second look.

### `question`

```
question "What materials are we allowed to sell right now?"
```

A key business question this context exists to answer. Repeatable. Questions are
word-wrapped inside the box on L1. A context with no questions is flagged in the
[analysis panel](#the-analysis-panel) — if you cannot say what it answers, is it
really a context?

### `promise` and `imposition`

Promise Theory (Mark Burgess): contexts are autonomous agents that can only make
promises about **their own** behaviour.

```
promise [+|-] "body" [to|from|on Name] [if "condition"]
imposition    "body" [to|from|on Name] [if "condition"]
```

| Part | Meaning |
|---|---|
| promiser | The enclosing context. |
| `+` (default) | A **give** promise — "I will provide …". Drawn teal. |
| `-` | A **use** promise — "I will accept / rely on …". Drawn indigo. |
| `"body"` | What is promised, in domain language. Clipped to 20 characters on the map; hover for the full text. |
| `to` / `from` / `on` | Names the counterpart. The three words are interchangeable — pick whichever reads naturally (`+ … to`, `- … from`, `imposition … on`). Omit it for a promise **to everyone**, drawn as a tag floating above the box. |
| `if "condition"` | The promise is conditional. Marked with `*` on the map; the condition shows on hover. |
| `imposition` | Not a promise at all: an attempt to force behaviour onto another agent. Drawn red with `⊳`. Seeing one on the map is the point — it is a smell. |

Cooperation needs **both halves**: a `+` from the provider and a matching `-`
from the consumer.

```
context Payments { promise + "payment confirmation" to Orders }
context Orders   { promise - "payment confirmation" from Payments if "order total is positive" }
```

The counterpart must be an existing, *different* context.

### `at`

```
at 400 200
```

Pins the context at those coordinates; the automatic layout will not move it.
Coordinates are **relative to the other pinned contexts**, not absolute canvas
positions — after layout the whole map is shifted so that it starts at the
canvas padding. Pin everything for a fully hand-placed diagram (examples 2–4 do),
pin nothing for automatic layout, or pin a few anchors and let the rest settle
around them. Negative and fractional values are allowed.

---

## Relations

```
Upstream -> Downstream
Upstream -> Downstream { … }
```

A directed integration between two contexts. **Source is upstream, target is
downstream**, matching Context Mapper and the DDD literature: the upstream's
model influences the downstream, and the downstream depends on the upstream.
Both contexts must exist, and they must differ.

Declare the same pair more than once to model several integrations — they fan
out as separate curves, each with its own labels. Opposite directions
(`A -> B` and `B -> A`) are drawn on opposite sides.

### `type`

```
type customer-supplier
type "shared kernel"
```

The DDD relationship pattern. Free-form: the tool does not restrict you to a
fixed list. Common values: `partnership`, `shared-kernel`, `customer-supplier`,
`conformist`, `anticorruption-layer`, `open-host-service`, `published-language`,
`separate-ways`.

### `upstream` / `downstream`

```
upstream OHS
downstream ACL
```

The integration role on each side, shown in the `U:` and `D:` markers at the
ends of the arrow. Free-form; conventionally `OHS`, `PL` upstream and `ACL`, `CF`
downstream. Quote to combine: `upstream "OHS + PL"`.

### `integration`

```
integration "REST + events"
```

A free-text note about *how* the integration happens (protocol, technology,
cadence). Shown as `«…»` next to the type.

### `coupling`

```
coupling 2
```

Weight of this edge when computing afferent/efferent coupling. Positive number,
default `1`. Use it when one arrow stands for a heavy integration with many
touch-points.

### `connascence`

```
connascence <kind> [local|distant] [degree]
```

Connascence (Meilir Page-Jones): two components are connascent when a change in
one requires a change in the other. Repeatable — a boundary usually exhibits
several kinds at once. Locality and degree may come in either order.

| Kind | Rank | Form | The two sides must agree on… |
|---|---|---|---|
| `name` | 1 | static | the name of something |
| `type` | 2 | static | the type of something |
| `meaning` | 3 | static | the meaning of particular values (`status = 3`) |
| `position` | 4 | static | the order of values |
| `algorithm` | 5 | static | a particular algorithm (hashing, rounding) |
| `execution` | 6 | dynamic | the order of execution |
| `timing` | 7 | dynamic | the timing of execution |
| `value` | 8 | dynamic | values that must change together |
| `identity` | 9 | dynamic | referencing the same entity |

- **`local` / `distant`** — inside one deployable, or across a network/service
  boundary. Default `local`. Distance makes connascence more expensive, and
  *dynamic* connascence across a boundary is the classic distributed-systems
  trap, so it is penalised hardest.
- **degree** — a whole number: roughly how many elements must change together.
  Default `2`; values above `8` count as `8`.

---

## What each level reads

Levels are **lenses, not layers piled on top of each other**: each shows only
what that kind of reasoning needs.

| | L0 Structure | L1 Strategic | L2 Promise Theory | L3 Coupling |
|---|:-:|:-:|:-:|:-:|
| contexts, `at` | ● | ● | ● | ● |
| relations, `type`, `upstream`, `downstream`, `integration` | ● | ● | | |
| `subdomain`, `cynefin` | | ● | ● | ● |
| `question` | | ● | | |
| `promise`, `imposition` | | | ● | |
| `connascence`, `coupling` | | | | ● |

On L3 only relations that carry at least one `connascence` are drawn. The five
toggles in the toolbar override the preset so you can mix layers freely; moving
the slider restores the clean lens.

---

## How the numbers are computed

### Connascence risk (0–100)

Per `connascence` line:

```
score = rank/9 × 60                     strength of the kind
      + 14 if distant and static
      + 28 if distant and dynamic
      + min(degree, 8) × 1.5
```

rounded and capped at 100. **low** < 38 ≤ **medium** < 66 ≤ **high**. A relation
takes the score of its **strongest** kind; the badge reads e.g.
`Co⇢Value +1 84` — strongest kind *Value*, `⇢` distant (`·` local), one more kind
declared, score 84. Hover the badge for the full breakdown. Line colour and
thickness follow the score.

### Afferent / efferent coupling

After Robert C. Martin, weighted by `coupling`. For a context C:

- **Ca** (afferent) = Σ `coupling` of relations where C is the **source** — how
  much depends *on* C.
- **Ce** (efferent) = Σ `coupling` of relations where C is the **target** — how
  much C depends on.
- **Instability** `I = Ce / (Ca + Ce)` — `0` maximally stable, `1` maximally
  unstable (`0` for an isolated context). Green ≤ 0.25, red ≥ 0.75.

Instability is not "bad": unstable contexts are cheap to change. The smell is a
**Stable Dependencies Principle** violation — a context depending on one that is
*less* stable than itself — and those are listed in the
[analysis panel](#the-analysis-panel).

### The analysis panel

Several attributes feed a side panel that reads the model back as advice and
rankings. It is **experimental and off by default**; open the app with
`?features=analysis` to see it. Everything drawn *on the map* — chips, promise
arrows, risk badges, the `Ca · Ce · I` footers — works without it.

---

## Errors and recovery

The parser never throws and never gives up. Whatever it could understand is
still rendered, so the map stays alive while you are mid-keystroke. Problems
appear under the editor as `line N: …` (hover the status bar for the full list).

| Message | Cause |
|---|---|
| `'map' expects a quoted title` | `map` without a string after it |
| `'context' expects a name` | |
| `duplicate context 'X' (first declared on line N) — ignored` | the second block has no effect |
| `subdomain must be core \| supporting \| generic` | unknown or missing value |
| `cynefin must be clear \| complicated \| …` | unknown or missing value |
| `'question' expects a quoted string` | |
| `'promise' expects a quoted body` | body missing or not quoted |
| `'to' expects a context name` / `'if' expects a quoted condition` | |
| `'at' expects two numbers` | the context is left unpinned |
| `unknown context property 'x'` / `unknown relation property 'x'` | typo in a keyword |
| `'type' expects a value` | likewise `upstream`, `downstream` |
| `'integration' expects a quoted string` | |
| `coupling expects a positive number` | |
| `unknown connascence kind 'x'` | |
| `relation references unknown context 'X'` | the relation is kept but not drawn |
| `promise references unknown context 'X'` | the promise is kept but not drawn |
| `'X' cannot have a relation with itself` | likewise for promises |
| `context 'X' is missing its closing '}'` | the block ends at the next `context`, `map` or `A -> B` |
| `unterminated string` | the string runs to the end of its line |
| `unexpected 'x'` | a stray token at the top level |

---

## Grammar

```ebnf
model       = { map | context | relation } ;

map         = "map" STRING ;

context     = "context" name [ "{" { contextProp } "}" ] ;
contextProp = "subdomain" ( "core" | "supporting" | "generic" )
            | "cynefin"   ( "clear" | "complicated" | "complex" | "chaotic" | "disorder" )
            | "question"  STRING
            | ( "promise" | "imposition" ) [ "+" | "-" ] STRING
                  [ ( "to" | "from" | "on" ) name ] [ "if" STRING ]
            | "at" NUMBER NUMBER ;

relation    = name "->" name [ "{" { relationProp } "}" ] ;
relationProp= "type"        name
            | "upstream"    name
            | "downstream"  name
            | "integration" STRING
            | "coupling"    NUMBER
            | "connascence" kind { "local" | "distant" | INTEGER } ;

kind        = "name" | "type" | "meaning" | "position" | "algorithm"
            | "execution" | "timing" | "value" | "identity" ;

name        = WORD | STRING ;
```

---

## Recipes

**Two integrations between the same pair**

```
Payments -> Orders { type open-host-service  upstream OHS  integration "create payment" }
Payments -> Orders { type customer-supplier  integration "payment completed" }
```

**A bidirectional partnership** — declare both directions; they curve apart.

```
Pricing -> Underwriting { type partnership }
Underwriting -> Pricing { type partnership }
```

**A hand-placed hub-and-spoke diagram**

```
context Orders   { at 600 400 }
context Catalog  { at 100 400 }
context Shipping { at 1100 400 }
```

**A promise to everyone**

```
context Identity { promise "tokens are valid for 15 minutes" }
```

**Spotting a missing use-promise** — on L2, a teal `(+)` arrow with no indigo
`(−)` arrow coming back means the provider has promised something nobody has
committed to consuming (or the other way round).

More complete models live in [`examples/`](../examples) — import any of them
with the **import** button.
