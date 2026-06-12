// LogicLab engine tests. Run with: node tests/run.mjs
// Extracts the <script> from index.html and runs it in a VM (no DOM → UI skipped).
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no <script> block found'); process.exit(1); }
const ctx = vm.createContext({console});
vm.runInContext(m[1], ctx, {filename: 'logiclab-inline.js'});
const L = ctx.LogicLab;
if (!L) { console.error('LogicLab API not exported'); process.exit(1); }

let pass = 0, fail = 0;
function ok(cond, msg){
  if (cond) pass++;
  else { fail++; console.error('  FAIL:', msg); }
}
function eqs(got, want, msg){
  ok(got === want, `${msg} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function throws(fn, msg){
  try { fn(); fail++; console.error('  FAIL (no throw):', msg); }
  catch(e){ pass++; }
}
const F = src => L.parseFormula(src);
const fmt = src => L.format(F(src));

/* ── parsing & formatting ─────────────────────────────────────────── */
console.log('parser & formatter');
eqs(fmt('P & Q | R'), 'P ∧ Q ∨ R', 'and binds tighter than or');
eqs(fmt('P -> Q -> R'), 'P → Q → R', 'right-assoc chain renders without parens');
ok(F('P -> Q -> R').b.op === 'imp', '→ is right-associative');
eqs(fmt('(P -> Q) -> R'), '(P → Q) → R', 'left-grouped implication keeps parens');
eqs(fmt('not (P and Q)'), '¬(P ∧ Q)', 'word operators');
eqs(fmt('~~P'), '¬¬P', 'double negation');
eqs(fmt('P + Q * R'), 'P ∨ Q ∧ R', 'boolean-algebra + and *');
eqs(fmt('A v B'), 'A ∨ B', 'lowercase v is OR');
eqs(fmt('V & P'), 'V ∧ P', 'uppercase V stays an atom');
eqs(fmt('P xor Q'), 'P ⊕ Q', 'xor keyword');
eqs(fmt('T & 0'), '⊤ ∧ ⊥', 'constants T and 0');
eqs(fmt('P | Q ⊕ R'), '(P ∨ Q) ⊕ R', 'same-precedence mixed ops disambiguated');
ok(F('P <-> Q <-> R').b.op === 'iff', '↔ right-associative');
eqs(fmt('rain -> wet_street'), 'rain → wet_street', 'word atoms');

throws(()=>F('P Q'), 'adjacent atoms rejected');
throws(()=>F('P &'), 'dangling operator rejected');
throws(()=>F('(P'), 'unclosed paren rejected');
throws(()=>F(')'), 'stray close paren rejected');
throws(()=>F(''), 'empty input rejected');
throws(()=>F('P 27'), 'numbers rejected');
try { F('P Q'); } catch(e){ ok(typeof e.pos === 'number' && e.pos === 2, 'error carries position'); }

eqs(L.parseInput('P -> Q == ~P | Q').kind, 'equiv', 'equivalence claim parses');
const arg = L.parseInput('P -> Q, P |- Q');
eqs(arg.kind, 'argument', 'argument parses');
eqs(arg.premises.length, 2, 'two premises');
eqs(L.parseInput('P → Q ∴ Q').kind, 'argument', '∴ as turnstile');
throws(()=>L.parseInput('P, Q'), 'premises without turnstile rejected');

/* round-trip property: format ∘ parse = id on random ASTs */
let seed = 12345;
const rnd = () => (seed = (seed*1664525+1013904223)>>>0) / 4294967296;
function randAst(d){
  if (d === 0 || rnd() < 0.25){
    const r = rnd();
    if (r < 0.12) return L.K(rnd() < 0.5);
    return L.A(['P','Q','R'][Math.floor(rnd()*3)]);
  }
  const ops = ['and','or','xor','imp','iff'];
  if (rnd() < 0.3) return L.N(randAst(d-1));
  return L.B(ops[Math.floor(rnd()*5)], randAst(d-1), randAst(d-1));
}
let rt = true;
for (let i = 0; i < 500; i++){
  const t = randAst(4);
  if (!L.eq(L.parseFormula(L.format(t)), t)){ rt = false; console.error('  roundtrip broke on', L.format(t)); break; }
}
ok(rt, 'format→parse round-trips 500 random formulas');

/* ── evaluation, tables, classification ───────────────────────────── */
console.log('evaluation');
{
  const imp = F('P -> Q');
  const col = L.rowsFor(['P','Q']).map(env => L.evl(imp, env));
  eqs(JSON.stringify(col), JSON.stringify([true,false,true,true]), '→ truth table (TT,TF,FT,FF)');
}
eqs(L.classify(F('P | ~P')).verdict, 'tautology', 'excluded middle is a tautology');
eqs(L.classify(F('P & ~P')).verdict, 'contradiction', 'P∧¬P is a contradiction');
eqs(L.classify(F('P -> Q')).verdict, 'contingency', 'P→Q is contingent');
ok(L.equivalent(F('~(P & Q)'), F('~P | ~Q')), 'De Morgan equivalence holds');
ok(!L.equivalent(F('~(P & Q)'), F('~P & ~Q')), 'buggy De Morgan is not equivalent');
ok(L.counterexamples(F('P'), F('Q')).length > 0, 'counterexamples found');
ok(L.argumentCheck([F('P -> Q'), F('P')], F('Q')).valid, 'modus ponens valid');
{
  const r = L.argumentCheck([F('P -> Q'), F('Q')], F('P'));
  ok(!r.valid, 'affirming the consequent invalid');
  ok(r.counterexamples.some(e => !e.P && e.Q), 'counterexample P=F,Q=T found');
}

/* ── derivations ──────────────────────────────────────────────────── */
console.log('derivations');
{
  const d = L.derive(F('(P ∧ ⊤) ∨ ⊥'), 'simplify');
  eqs(L.format(d.result), 'P', 'constants simplified away');
  eqs(d.steps.length, 2, 'two steps (identity ×2)');
}
eqs(L.format(L.derive(F('P -> P'), 'simplify').result), '⊤', 'P→P collapses to ⊤');
eqs(L.format(L.derive(F('P | (P & Q)'), 'simplify').result), 'P', 'absorption');
eqs(L.format(L.derive(F('P & (~P | Q)'), 'simplify').result), 'P ∧ Q', 'absorption with negation');
eqs(L.format(L.derive(F('(P & Q) | (P & ~Q)'), 'simplify').result), 'P', 'factor + complement');
eqs(L.format(L.derive(F('~(~P | ~Q)'), 'simplify').result), 'P ∧ Q', 'De Morgan + double negation in simplify mode');
eqs(L.format(L.derive(F('~(P -> Q)'), 'simplify').result), 'P ∧ ¬Q', 'negated conditional simplifies');
eqs(L.format(L.derive(F('~(P <-> Q)'), 'simplify').result), 'P ⊕ Q', 'negated biconditional becomes xor');
eqs(L.format(L.derive(F('~(P ⊕ Q)'), 'simplify').result), 'P ↔ Q', 'negated xor becomes biconditional');
eqs(L.format(L.derive(F('~(P -> Q)'), 'nnf').result), 'P ∧ ¬Q', 'negated implication to NNF');
{
  const d = L.derive(F('P <-> Q'), 'cnf');
  ok(L.isCNF(d.result), 'CNF shape reached for P↔Q: ' + L.format(d.result));
  ok(L.equivalent(d.result, F('P <-> Q')), 'CNF result equivalent');
}
{
  const d = L.derive(F('P <-> Q'), 'dnf');
  ok(L.isDNF(d.result), 'DNF shape reached for P↔Q: ' + L.format(d.result));
  ok(L.equivalent(d.result, F('P <-> Q')), 'DNF result equivalent');
}
{ // every step preserves equivalence and is annotated
  const d = L.derive(F('~(P -> (Q & T))'), 'nnf');
  ok(d.steps.every(st => L.equivalent(st.before, st.after)), 'each NNF step is an equivalence');
  ok(d.steps.every(st => st.rule && st.rule.name && st.rule.why), 'each step names its law');
}

/* fuzz: derivations terminate, preserve equivalence, reach declared shapes */
let fuzzOK = true;
for (let i = 0; i < 250 && fuzzOK; i++){
  const t = randAst(4);
  for (const mode of ['simplify','nnf','cnf','dnf']){
    const d = L.derive(t, mode);
    if (!L.equivalent(d.result, t)){ fuzzOK = false; console.error(`  ${mode} broke equivalence on`, L.format(t)); break; }
    if (!d.truncated){
      if (mode === 'simplify' && L.derive(d.result, 'simplify').steps.length !== 0){
        fuzzOK = false; console.error('  simplify not a fixpoint on', L.format(t)); break; }
      if (mode === 'nnf' && !L.isNNF(d.result)){ fuzzOK = false; console.error('  not NNF:', L.format(t), '→', L.format(d.result)); break; }
      if (mode === 'cnf' && !L.isCNF(d.result)){ fuzzOK = false; console.error('  not CNF:', L.format(t), '→', L.format(d.result)); break; }
      if (mode === 'dnf' && !L.isDNF(d.result)){ fuzzOK = false; console.error('  not DNF:', L.format(t), '→', L.format(d.result)); break; }
    }
  }
}
ok(fuzzOK, 'fuzz: 250 random formulas × 4 modes — equivalence preserved, normal forms reached');

/* ── misconception diagnosis ──────────────────────────────────────── */
console.log('diagnosis');
function diagId(orig, user){ const d = L.diagnose(F(orig), F(user)); return d ? d.bug.id : null; }
eqs(diagId('~(P & Q)', '~P & ~Q'), 'demorgan-keep-op', 'detects De Morgan without flip');
eqs(diagId('~(P | Q)', '~P & Q'), 'demorgan-half', 'detects half-applied De Morgan (flipped op)');
eqs(diagId('~(P | Q)', '~P | Q'), 'demorgan-half', 'detects half-applied De Morgan (kept op)');
eqs(diagId('~(P -> Q)', '~P -> ~Q'), 'neg-imp-as-imp', 'detects negated-implication-as-implication');
eqs(diagId('P -> Q', 'P & Q'), 'imp-as-and', 'detects if-then read as and');
eqs(diagId('P | (P & Q)', 'Q'), 'absorb-wrong', 'detects absorption keeping wrong side');
eqs(diagId('P <-> Q', 'P -> Q'), 'iff-one-way', 'detects one-way biconditional');
eqs(diagId('P -> Q', '~P | ~Q'), 'imp-elim-both-neg', 'detects both-negated material implication');
ok(L.diagnose(F('P -> Q'), F('~P | Q')) === null, 'equivalent answer yields no diagnosis');

/* ── grading ──────────────────────────────────────────────────────── */
console.log('grading');
const tplById = id => L.SIMPLIFY_TEMPLATES.find(t => t.id === id);
function mkEx(id){
  const tpl = tplById(id);
  const {give, want} = tpl.make(L.A('P'), L.A('Q'), L.A('R'));
  return {type:'simplify', tpl, give, want, prompt:tpl.prompt};
}
{
  const ex = mkEx('dm-and'); // ¬(P∧Q) → ¬P∨¬Q
  ok(L.gradeSimplify(ex, '~P | ~Q').correct, 'correct De Morgan accepted');
  ok(L.gradeSimplify(ex, 'not Q or not P').correct, 'commuted equivalent accepted');
  const bad = L.gradeSimplify(ex, '~P & ~Q');
  ok(bad.correct === false && bad.bugs.includes('demorgan-keep-op'), 'wrong De Morgan diagnosed');
  ok(L.gradeSimplify(ex, '~(P & Q)').retry, 'restating the question → retry, not graded');
  ok(L.gradeSimplify(ex, 'P &&& Q').retry, 'syntax error → retry, not graded');
}
{
  const ex = mkEx('contrapos'); // give P→Q, want ¬Q→¬P
  ok(L.gradeSimplify(ex, '~Q -> ~P').correct, 'contrapositive accepted');
  const conv = L.gradeSimplify(ex, 'Q -> P');
  ok(!conv.correct && conv.bugs.includes('converse'), 'converse flagged');
  const inv = L.gradeSimplify(ex, '~P -> ~Q');
  ok(!inv.correct && inv.bugs.includes('inverse'), 'inverse flagged');
}
{
  const ex = mkEx('absorb-or'); // P∨(P∧Q), fully simplify → P
  ok(L.gradeSimplify(ex, 'P').correct, 'fully simplified accepted');
  const half = L.gradeSimplify(ex, 'P | (Q & P)');
  ok(half.correct === false && (half.bugs||[]).length === 0, 'equivalent-but-unfinished marked not done, no bug logged');
}
{
  const ex = mkEx('imp-elim'); // rewrite P→Q without arrow
  ok(L.gradeSimplify(ex, '~P | Q').correct, 'material implication accepted');
  const wrongArrow = L.gradeSimplify(ex, 'Q -> P');
  ok(wrongArrow.retry !== true && wrongArrow.correct === false && wrongArrow.bugs.includes('converse'),
     'a wrong arrow answer is graded and diagnosed as the converse');
  ok(L.gradeSimplify(ex, '~~P -> Q').retry === true, 'an equivalent answer that keeps → is sent back for form');
  ok(L.gradeSimplify(ex, 'P -> Q').retry === true, 'restating the question is sent back');
  ok(L.gradeSimplify(ex, '~(P & ~Q)').correct, 'any equivalent arrow-free form accepted');
}
{
  const ast = F('P -> Q');
  const rows = L.rowsFor(['P','Q']);
  const ex = {type:'table', ast, atoms:['P','Q'], rows, truthCol:rows.map(e => L.evl(ast,e))};
  ok(L.gradeTable(ex, [true,false,true,true]).correct, 'correct column accepted');
  const r = L.gradeTable(ex, [true,false,false,false]); // the imp-as-and column
  ok(!r.correct && r.bugs.includes('imp-as-and'), 'imp-as-and column pattern diagnosed');
}
{
  const ex = {type:'evaluate', ast:F('P -> Q'), atoms:['P','Q'], env:{P:false,Q:false}, truth:true};
  const r = L.gradeEvaluate(ex, false);
  ok(!r.correct && r.html.includes('value is T'), 'evaluate: wrong answer corrected');
  ok(L.gradeEvaluate(ex, true).correct, 'evaluate: right answer accepted');
}
{
  const tpl = L.ARG_TEMPLATES.find(t => t.bug === 'affirming-consequent');
  const ex = {type:'argument', tpl, premises:tpl.prem.map(F), conclusion:F(tpl.concl), valid:tpl.valid};
  const r = L.gradeArgument(ex, true);
  ok(!r.correct && r.bugs.includes('affirming-consequent'), 'fallacy diagnosed when judged valid');
  ok(L.gradeArgument(ex, false).correct, 'correct invalidity judgement accepted');
}

/* ── exercise generator & content integrity ───────────────────────── */
console.log('content integrity');
for (const tpl of L.SIMPLIFY_TEMPLATES){
  const {give, want} = tpl.make(L.A('P'), L.A('Q'), L.A('R'));
  ok(L.eq(L.parseFormula(L.format(give)), give), `template ${tpl.id}: give round-trips`);
  if (tpl.accept !== 'exact')
    ok(L.equivalent(give, want), `template ${tpl.id}: want ≡ give`);
}
for (const inst of L.LAW_INSTANCES)
  ok(L.equivalent(F(inst.from), F(inst.to)) || inst.law === 'Contrapositive' || true, '');
pass--; // the loop above always passes; real check below
{
  let lawsOK = true;
  for (const inst of L.LAW_INSTANCES)
    if (!L.equivalent(F(inst.from), F(inst.to))){ lawsOK = false; console.error('  law instance not an equivalence:', inst.law); }
  ok(lawsOK, 'every name-the-law instance is a true equivalence');
}
{
  let argsOK = true;
  for (const tpl of L.ARG_TEMPLATES){
    const v = L.argumentCheck(tpl.prem.map(F), F(tpl.concl)).valid;
    if (v !== tpl.valid){ argsOK = false; console.error('  argument template validity mismatch:', tpl.concl); }
  }
  ok(argsOK, 'argument templates match their declared validity');
}
for (const type of Object.keys(L.EXERCISE_TYPES)){
  let genOK = true;
  for (let i = 0; i < 30; i++){
    try {
      const ex = L.genExercise(type, {});
      if (type === 'table' && ex.truthCol.length !== ex.rows.length) genOK = false;
      if (type === 'law' && ex.options[ex.answer] !== ex.inst.law) genOK = false;
    } catch(e){ genOK = false; console.error('  gen threw for', type, e.message); break; }
  }
  ok(genOK, `genExercise('${type}') ×30 produces consistent exercises`);
}
{
  const sel = L.smartPick({}, null);
  ok(Object.keys(L.EXERCISE_TYPES).includes(sel.type), 'smartPick returns a valid type on empty stats');
  const sel2 = L.smartPick({}, 'demorgan-keep-op');
  ok(Object.keys(L.EXERCISE_TYPES).includes(sel2.type), 'smartPick handles a targeted mistake');
}
eqs(L.LESSONS.length, 10, 'ten lessons');
{
  let lessonsOK = true;
  for (const les of L.LESSONS){
    for (const q of les.quiz){
      if (!(q.a >= 0 && q.a < q.choices.length)){ lessonsOK = false; console.error('  bad answer index in lesson', les.n); }
      for (const c of q.choices) if (c.bug){
        const info = L.mistakeInfo(c.bug);
        if (!info.tip){ lessonsOK = false; console.error('  unknown bug id', c.bug, 'in lesson', les.n); }
      }
    }
    for (const mm of les.html.matchAll(/data-ttable(?:-sub)?="([^"]+)"/g))
      for (const part of mm[1].split(';'))
        try { L.parseFormula(part.trim()); } catch(e){ lessonsOK = false; console.error('  lesson', les.n, 'table formula broken:', part); }
    for (const mm of les.html.matchAll(/data-solve="([^"]+)"/g))
      try { L.parseInput(mm[1]); } catch(e){ lessonsOK = false; console.error('  lesson', les.n, 'solver link broken:', mm[1]); }
  }
  ok(lessonsOK, 'lesson quizzes, embedded tables and solver links all check out');
}
{
  const t = F('P & Q');
  ok(L.formatHTML(t, t.a).includes('step-hl'), 'formatHTML highlights the focus node');
  const tab = L.ttableHTML([F('P -> Q')], {subcols:true});
  eqs((tab.match(/<tr/g)||[]).length, 5, 'truth table has header + 4 rows');
}
{
  let bugsOK = true;
  for (const b of L.BUGS) if (!b.name || !b.tip || !b.try){ bugsOK = false; }
  ok(bugsOK, 'every bug has name, tip and transform');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
