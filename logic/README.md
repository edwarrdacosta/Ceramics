# LogicLab — an all-in-one tutor for propositional logic

A single-file web app (`index.html`, no build step, no dependencies, works offline)
that teaches formal symbolic logic from zero and acts as a personal tutor:

- **Learn** — a 10-lesson course: propositions → connectives → truth tables →
  tautologies → equivalence laws → conditionals → arguments & validity → normal forms.
  Each lesson has live truth tables, “open in solver” demos, common-trap callouts and a quiz.
- **Solve** — a step-by-step symbolic solver. Give it:
  - a **formula** (`¬(P ∧ Q) → R`) — it simplifies / converts to NNF, CNF or DNF,
    showing **every step with the law that justified it** and the changed part highlighted,
    plus classification (tautology / contradiction / contingency) and a full working-columns truth table;
  - an **equivalence claim** (`P → Q == ¬Q → ¬P`) — it proves or refutes it with counterexample rows;
  - an **argument** (`P → Q, Q ⊢ P`) — it checks validity and exhibits counterexamples.
- **Truth tables** — build joint tables for up to three formulas and compare them column by column.
- **Practice** — five exercise types (rewrite & simplify, evaluate, fill-the-table,
  name-the-law, valid-or-not). Wrong answers are **diagnosed against a library of
  classic misconceptions** (buggy De Morgan, converse/inverse confusion, “if-then” read
  as “and”, exclusive-or readings, affirming the consequent, …) and answered with the
  specific explanation, a concrete counterexample row, and a link to the relevant lesson.
- **Progress** — lesson completion, accuracy per exercise type, and a ranked log of
  *your* recurring mistakes with one-tap targeted practice. **Smart practice** weights
  question selection toward your weak spots automatically.
- **Reference** — symbols & how to type them, precedence, all equivalence laws,
  argument forms and named fallacies.

Progress is stored in `localStorage` on the device. Nothing leaves the browser.

## Running it

Open `logic/index.html` in any modern browser — that’s it. (Or serve the repo with any
static server, e.g. `python3 -m http.server`, and browse to `/logic/`. Also installable
to the home screen.)

## Input syntax

| Symbol | Meaning | Type any of |
|---|---|---|
| ¬ | not | `~` `!` `not` |
| ∧ | and | `&` `^` `*` `and` |
| ∨ | or (inclusive) | `\|` `+` `v` `or` |
| → | if…then | `->` `=>` `implies` |
| ↔ | if and only if | `<->` `<=>` `iff` |
| ⊕ | exclusive or | `xor` |
| ⊤ / ⊥ | true / false | `T` `F` `true` `false` `1` `0` |
| ≡ | equivalence claim | `==` `=` |
| ⊢ | therefore | `\|-` `\|=` `therefore` `∴` |

Statement letters: any word starting with a letter (`P`, `Q`, `rain`, `x1`).
Precedence (tightest first): `¬  ∧  ∨/⊕  →  ↔`; arrows associate to the right.

## How it works

Everything lives in one `<script>` inside `index.html`:

1. **Parser** — tolerant tokenizer (Unicode + ASCII spellings) and recursive-descent
   parser producing an AST; friendly errors with caret positions.
2. **Semantics** — truth-table evaluation, classification, equivalence and
   argument-validity checking by exhaustive valuation.
3. **Rewrite engine** — a catalogue of named equivalence laws applied
   outside-in to a fixpoint. Four rule sets: *Simplify*, *NNF*, *CNF*, *DNF*.
   Every step records the law, the before/after trees, and the rewritten subterm
   (for highlighting). All steps are equivalence-preserving by construction.
4. **Misconception engine** — a library of *buggy rewrite rules* (the classic
   mistakes). A wrong answer is matched by applying each buggy rule at every
   position of the original formula and testing semantic equivalence with the
   student’s answer — the heart of the “it knows what I did wrong” tutoring.
   Truth-value exercises use altered-semantics models (e.g. “→ as ∧”) the same way.

The engine is DOM-free, so it runs headless in Node for testing.

## Tests

```
node logic/tests/run.mjs
```

No dependencies. ~160 assertions: parser round-trip fuzzing, semantics, derivation
fuzzing across all four modes (equivalence preserved, normal forms reached,
fixpoints stable), misconception diagnosis, grading flows, and content integrity
(every lesson table/solver link parses, every law instance is a true equivalence,
every argument template matches its declared validity).
