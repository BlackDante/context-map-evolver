import './styles.css';
import { parse } from './parser';
import { render, type Layers } from './render';
import { DEMOS, DEFAULT_DEMO_ID } from './demos';
import { allRisks, couplingMetrics, promiseEdges, sdpViolations, strategicAdvice } from './analysis';
import { highlight } from './highlight';
import { LEVELS } from './levels';
import { esc } from './escape';
import { resolveFlags } from './flags';
import type { ContextMap } from './model';
import { toText } from './convert';
import { extensionOf, languageOf, type Lang } from './language';
import { createTsRunner, type WorkerLike } from './tsrunner';
import {
  fileUrl,
  hostApiFrom,
  initialFile,
  offeredFiles,
  parseSource,
  sourceValue,
  type HostedIndex,
  type Source,
} from './host';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const flags = resolveFlags(import.meta.env.VITE_FEATURES, location.search);

const dslEl = $<HTMLTextAreaElement>('dsl');
const dslHlEl = $<HTMLPreElement>('dslHl');
const levelEl = $<HTMLInputElement>('level');
const levelNameEl = $<HTMLSpanElement>('levelName');
const canvasWrap = $<HTMLDivElement>('canvasWrap');
const insightPanel = $<HTMLElement>('insightPanel');
const parseStatus = $<HTMLDivElement>('parseStatus');
const togglesEl = $<HTMLDivElement>('layerToggles');

// per-layer manual overrides; a missing key = follow the level slider
let overrides: Partial<Layers> = {};
let seed = 1;

// The editor holds a model in one of two languages. DSL is parsed right here;
// TypeScript is a program, so it runs in a worker (spawned on first use) and
// its model arrives a moment later. TypeScript ships dark: without the
// `typescript` flag the language never leaves 'dsl' and the worker is never spawned.
let lang: Lang = 'dsl';

/** The language a file is read as — everything is DSL text while TypeScript is off. */
function fileLanguage(name: string): Lang {
  return flags.typescript ? languageOf(name) : 'dsl';
}

let model: ContextMap = { title: 'Untitled map', contexts: [], relations: [] };
let errors: string[] = [];
let revision = 0; // bumped on every text change, so a late TypeScript result can tell it is stale
const tsRunner = createTsRunner(
  () => new Worker(new URL('./tsworker.ts', import.meta.url), { type: 'module' }) as WorkerLike
);

const TOGGLE_DEFS: { key: keyof Layers; label: string }[] = [
  { key: 'relations', label: 'Relations' },
  { key: 'classification', label: 'Classification' },
  { key: 'questions', label: 'Questions' },
  { key: 'promise', label: 'Promise' },
  { key: 'connascence', label: 'Connascence' },
];

function buildToggles() {
  togglesEl.innerHTML = '';
  for (const def of TOGGLE_DEFS) {
    const id = `tg-${def.key}`;
    const wrap = document.createElement('label');
    wrap.className = 'toggle';
    wrap.innerHTML = `<input type="checkbox" id="${id}"/><span>${def.label}</span>`;
    const cb = wrap.querySelector('input')!;
    cb.addEventListener('change', () => {
      overrides[def.key] = cb.checked;
      draw();
    });
    togglesEl.appendChild(wrap);
  }
}

function activeLayers(): Layers {
  return { ...LEVELS[Number(levelEl.value)].layers, ...overrides };
}

function syncToggleBoxes(layers: Layers) {
  for (const def of TOGGLE_DEFS) {
    const cb = document.getElementById(`tg-${def.key}`) as HTMLInputElement | null;
    if (cb) cb.checked = layers[def.key];
  }
}

function paintHighlight() {
  dslHlEl.innerHTML = highlight(dslEl.value, lang);
  dslHlEl.scrollTop = dslEl.scrollTop;
  dslHlEl.scrollLeft = dslEl.scrollLeft;
}

/** The text changed: read the model back out of it, then redraw. */
function update() {
  paintHighlight();
  const rev = ++revision;
  if (lang === 'dsl') {
    ({ map: model, errors } = parse(dslEl.value));
    draw();
    return;
  }
  tsRunner.run(dslEl.value, (result) => {
    if (rev !== revision) return;
    // a file that does not run keeps the last good map on screen, like a half-typed DSL line
    if (result.map) model = result.map;
    errors = result.errors;
    draw();
  });
}

/** Redraw the current model — all that the slider, the toggles and re-layout need. */
function draw() {
  const map = model;
  const layers = activeLayers();
  levelNameEl.textContent = LEVELS[Number(levelEl.value)].name;
  syncToggleBoxes(layers);

  canvasWrap.innerHTML = render(map, layers, seed);

  if (errors.length) {
    parseStatus.className = 'parse-status error';
    parseStatus.textContent = `${errors.length} issue(s): ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? ' …' : ''}`;
    parseStatus.title = errors.join('\n'); // the full list, when more than fit
  } else {
    parseStatus.title = '';
    parseStatus.className = 'parse-status ok';
    parseStatus.textContent = `✓ ${map.contexts.length} contexts · ${map.relations.length} relations`;
  }

  if (flags.analysis) renderInsights(map, layers);
}

function renderInsights(map: ContextMap, layers: Layers) {
  const blocks: string[] = [];

  if (layers.classification || layers.questions) {
    const advice = strategicAdvice(map);
    if (advice.length) {
      blocks.push(
        section(
          'Strategic read',
          advice
            .map((a) => `<li><b>${esc(a.context)}</b> — ${esc(a.note)}</li>`)
            .join('')
        )
      );
    }
  }

  if (layers.promise) {
    const pe = promiseEdges(map);
    if (pe.length) {
      blocks.push(
        section(
          'Promises (promiser · ± body · promisee)',
          pe
            .map((p) => {
              const verb =
                p.kind === 'imposition' ? 'imposes' : p.polarity === '-' ? 'promises to use' : 'promises';
              const sign = p.kind === 'imposition' ? '' : `(${p.polarity === '-' ? '−' : '+'}) `;
              const counterpart = p.to
                ? ` <span class="muted">${p.polarity === '-' ? '←' : '→'} ${esc(p.to)}</span>`
                : ' <span class="muted">(to all)</span>';
              const cond = p.condition ? `<br/><span class="muted">  if ${esc(p.condition)}</span>` : '';
              return `<li><b>${esc(p.from)}</b> ${verb} ${sign}“${esc(p.body)}”${counterpart}${cond}</li>`;
            })
            .join('')
        )
      );
    }
  }

  if (layers.connascence) {
    // afferent / efferent coupling per context
    const metrics = couplingMetrics(map);
    if (metrics.length) {
      blocks.push(
        section(
          'Coupling — Ca / Ce / Instability',
          metrics
            .map(
              (m) =>
                `<li><b>${esc(m.context)}</b> <span class="score">I ${m.instability.toFixed(2)}</span>` +
                `<br/><span class="muted">Ca ${m.ca} (depend on it) · Ce ${m.ce} (it depends on) — ${esc(m.note)}</span></li>`
            )
            .join('')
        )
      );
    }

    // Stable Dependencies Principle violations
    const sdp = sdpViolations(map);
    if (sdp.length) {
      blocks.push(
        section(
          '⚠ Stable Dependencies Principle',
          sdp
            .map(
              (v) =>
                `<li><b>${esc(v.rel.target)}</b> depends on <b>${esc(v.rel.source)}</b><br/>` +
                `<span class="muted">more-stable (I ${v.dependerI.toFixed(2)}) depends on less-stable (I ${v.dependeeI.toFixed(2)})</span></li>`
            )
            .join('')
        )
      );
    }

    // connascence risk per boundary (each kind listed)
    const risks = allRisks(map);
    if (risks.length) {
      blocks.push(
        section(
          'Connascence risk (highest first)',
          risks
            .map(
              (r) =>
                `<li><span class="risk-dot ${r.band}"></span><b>${esc(r.rel.source)} → ${esc(r.rel.target)}</b> ` +
                `<span class="score">${r.score}</span>` +
                `<ul class="sub">${r.kinds
                  .map((k) => `<li class="muted">${esc(k.reason)} — <b>${k.score}</b></li>`)
                  .join('')}</ul></li>`
            )
            .join('')
        )
      );
    }
  }

  insightPanel.innerHTML = blocks.length
    ? blocks.join('')
    : '<p class="muted pad">Raise the detail level to surface analysis here.</p>';
}

function section(title: string, body: string): string {
  return `<div class="insight-block"><h3>${title}</h3><ul>${body}</ul></div>`;
}

// --- wiring -----------------------------------------------------------------

const demoSelect = $<HTMLSelectElement>('demoSelect');
const sourceLabel = $<HTMLSpanElement>('sourceLabel');

// Hosted mode (`context-map-evolver host <dir>`): the CLI serves this page with
// a <meta name="cme-host"> tag, and the .cme files on disk join the picker next
// to the built-in demos. On a static deploy `hostApi` is null and only demos show.
const hostApi = hostApiFrom(document);
let hosted: HostedIndex | null = null;
let current: Source = { kind: 'demo', id: DEFAULT_DEMO_ID };
let loadedFromDisk = ''; // what the open file looked like on disk — differs when edited here

function buildPicker() {
  demoSelect.innerHTML = '';
  if (hosted) {
    const files = document.createElement('optgroup');
    files.label = `${hosted.dir}/`;
    for (const f of hosted.files) files.appendChild(option(sourceValue({ kind: 'file', path: f.path }), f.name));
    demoSelect.appendChild(files);
  }
  const demos = document.createElement('optgroup');
  demos.label = hosted ? 'demos' : 'built-in demos';
  for (const d of DEMOS) demos.appendChild(option(sourceValue({ kind: 'demo', id: d.id }), d.name));
  demoSelect.appendChild(demos);
  demoSelect.value = sourceValue(current);
}

function option(value: string, text: string): HTMLOptionElement {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  return opt;
}

function loadDemo(id: string) {
  const demo = DEMOS.find((d) => d.id === id);
  if (!demo) return;
  current = { kind: 'demo', id };
  demoSelect.value = sourceValue(current);
  setLanguage('dsl');
  dslEl.value = demo.dsl;
  levelEl.value = String(demo.level); // jump to the level that shows it best
  overrides = {};
  seed = 1; // fresh deterministic layout
  update();
}

async function loadFile(path: string) {
  if (!hostApi) return;
  let text: string;
  try {
    const res = await fetch(fileUrl(hostApi, path));
    if (!res.ok) throw new Error(res.statusText);
    text = await res.text();
  } catch {
    parseStatus.className = 'parse-status error';
    parseStatus.textContent = `could not read ${path} from disk`;
    return;
  }
  current = { kind: 'file', path };
  loadedFromDisk = text;
  demoSelect.value = sourceValue(current);
  setLanguage(fileLanguage(path));
  dslEl.value = text;
  seed = 1; // fresh deterministic layout for the new model
  update();
}

demoSelect.addEventListener('change', () => {
  const source = parseSource(demoSelect.value);
  if (source?.kind === 'demo') loadDemo(source.id);
  else if (source?.kind === 'file') void loadFile(source.path);
});

async function fetchHostedIndex(): Promise<HostedIndex | null> {
  if (!hostApi) return null;
  try {
    const res = await fetch(`${hostApi}/files`);
    if (!res.ok) return null;
    const index = (await res.json()) as HostedIndex;
    return { ...index, files: offeredFiles(index.files, flags.typescript) };
  } catch {
    return null;
  }
}

/** Something changed on disk: refresh the picker and re-read the open file, unless it was edited here. */
async function onDiskChange() {
  hosted = await fetchHostedIndex();
  buildPicker();
  if (current.kind !== 'file') return;
  const open = current.path;
  const stillThere = hosted?.files.some((f) => f.path === open);
  if (stillThere && dslEl.value === loadedFromDisk) await loadFile(open);
}

async function start() {
  hosted = await fetchHostedIndex();
  if (hosted && hostApi) {
    sourceLabel.textContent = 'file';
    document.title = `${hosted.dir} · Context Map Evolver`;
    new EventSource(`${hostApi}/events`).addEventListener('message', () => void onDiskChange());
    const first = initialFile(hosted.files, location.search);
    if (first) {
      current = { kind: 'file', path: first.path };
      buildPicker();
      await loadFile(first.path);
      return;
    }
  }
  buildPicker();
  loadDemo(DEFAULT_DEMO_ID);
}

buildToggles();
void start();

dslEl.addEventListener('input', update);
dslEl.addEventListener('scroll', () => {
  dslHlEl.scrollTop = dslEl.scrollTop;
  dslHlEl.scrollLeft = dslEl.scrollLeft;
});
levelEl.addEventListener('input', () => {
  // moving the slider clears manual overrides so the level is authoritative
  overrides = {};
  draw();
});

$('relayout').addEventListener('click', () => {
  seed++;
  draw();
});

// --- model language: DSL ⇄ TypeScript ---------------------------------------

const exportBtn = $<HTMLButtonElement>('exportCme');
const langButtons: Record<Lang, HTMLButtonElement> = { dsl: $('langDsl'), ts: $('langTs') };

// The last switch, so that switching straight back returns the text that was
// there — comments, layout and all — instead of a second, lossy conversion.
let lastSwitch: { from: Lang; original: string; converted: string } | null = null;

/** Make `next` the language the editor text is read as. Does not touch the text. */
function setLanguage(next: Lang) {
  lang = next;
  lastSwitch = null;
  for (const [key, btn] of Object.entries(langButtons)) btn.setAttribute('aria-pressed', String(key === next));
  exportBtn.textContent = `export ${extensionOf(next)}`;
  exportBtn.title = `Download the model as ${extensionOf(next)}`;
}

/** Rewrite the model in the other language. */
function switchLanguage(next: Lang) {
  if (next === lang) return;
  const original = dslEl.value;
  const apply = (converted: string) => {
    const from = lang;
    setLanguage(next);
    lastSwitch = { from, original, converted };
    dslEl.value = converted;
    update();
  };
  if (lastSwitch && lastSwitch.from === next && lastSwitch.converted === original) return apply(lastSwitch.original);
  if (lang === 'dsl') return apply(toText(parse(original).map, next));
  // TypeScript has to run first; a file that does not run has no model to convert
  const rev = revision;
  tsRunner.run(original, (result) => {
    if (rev !== revision) return; // the text changed while it ran
    if (result.map) return apply(toText(result.map, next));
    errors = [...result.errors, 'fix this before converting to DSL'];
    draw();
  });
}

// feature-flagged: the switch stays `hidden` in the markup unless `typescript` is on
if (flags.typescript) {
  $('langSwitch').hidden = false;
  for (const [key, btn] of Object.entries(langButtons)) btn.addEventListener('click', () => switchLanguage(key as Lang));
}

// the analysis panel ships dark: its button and <aside> stay `hidden` in the
// markup unless the feature flag is on
if (flags.analysis) {
  const toggleInsight = $<HTMLButtonElement>('toggleInsight');
  toggleInsight.hidden = false;
  insightPanel.hidden = false;
  toggleInsight.addEventListener('click', () => {
    const collapsed = insightPanel.classList.toggle('collapsed');
    toggleInsight.textContent = collapsed ? 'show analysis ◂' : 'hide analysis ▸';
  });
}

// --- instant hover tooltip for truncated labels (elements with data-tip) -----
const tooltip = document.createElement('div');
tooltip.className = 'svg-tip';
document.body.appendChild(tooltip);

canvasWrap.addEventListener('mousemove', (e) => {
  const host = (e.target as Element).closest?.('[data-tip]');
  const text = host?.getAttribute('data-tip');
  if (!text) {
    tooltip.style.display = 'none';
    return;
  }
  tooltip.textContent = text;
  tooltip.style.display = 'block';
  // keep the tooltip on-screen near the cursor
  const pad = 14;
  const x = Math.min(e.clientX + pad, window.innerWidth - tooltip.offsetWidth - 8);
  const y = Math.min(e.clientY + pad, window.innerHeight - tooltip.offsetHeight - 8);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
});
canvasWrap.addEventListener('mouseleave', () => (tooltip.style.display = 'none'));

const copyBtn = $<HTMLButtonElement>('copyDsl');
copyBtn.addEventListener('click', async () => {
  let ok = true;
  try {
    await navigator.clipboard.writeText(dslEl.value);
  } catch {
    ok = false; // permission denied, or a non-secure (http) origin
  }
  copyBtn.textContent = ok ? 'copied ✓' : 'copy failed';
  setTimeout(() => (copyBtn.textContent = 'copy'), 1400);
});

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Derive a safe file stem from the model title, e.g. "Media Rights" → media-rights. */
function modelStem(): string {
  const stem = model.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || 'context-map';
}

// --- export / import the model as .cme or .cme.ts (the text is the model) ---

exportBtn.addEventListener('click', () => {
  download(`${modelStem()}${extensionOf(lang)}`, new Blob([dslEl.value], { type: 'text/plain;charset=utf-8' }));
});

const cmeFile = $<HTMLInputElement>('cmeFile');
const importBtn = $<HTMLButtonElement>('importCme');
if (flags.typescript) {
  cmeFile.accept = '.cme,.ts,text/plain';
  importBtn.title = 'Import a .cme or .cme.ts model';
}
importBtn.addEventListener('click', () => cmeFile.click());
cmeFile.addEventListener('change', async () => {
  const file = cmeFile.files?.[0];
  if (!file) return;
  const text = await file.text();
  setLanguage(fileLanguage(file.name));
  dslEl.value = text;
  cmeFile.value = ''; // allow re-importing the same file
  seed = 1; // fresh deterministic layout for the new model
  update();
});

$('exportSvg').addEventListener('click', () => {
  const svg = canvasWrap.querySelector('svg');
  if (!svg) return;
  download(`${modelStem()}.svg`, new Blob([svg.outerHTML], { type: 'image/svg+xml' }));
});
