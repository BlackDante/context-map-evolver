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
      update();
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
  dslHlEl.innerHTML = highlight(dslEl.value);
  dslHlEl.scrollTop = dslEl.scrollTop;
  dslHlEl.scrollLeft = dslEl.scrollLeft;
}

function update() {
  paintHighlight();
  const { map, errors } = parse(dslEl.value);
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

function buildDemoPicker() {
  demoSelect.innerHTML = '';
  for (const d of DEMOS) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    demoSelect.appendChild(opt);
  }
  demoSelect.value = DEFAULT_DEMO_ID;
}

function loadDemo(id: string) {
  const demo = DEMOS.find((d) => d.id === id);
  if (!demo) return;
  dslEl.value = demo.dsl;
  levelEl.value = String(demo.level); // jump to the level that shows it best
  overrides = {};
  seed = 1; // fresh deterministic layout
  update();
}

demoSelect.addEventListener('change', () => loadDemo(demoSelect.value));

buildDemoPicker();
buildToggles();
loadDemo(DEFAULT_DEMO_ID);

dslEl.addEventListener('input', update);
dslEl.addEventListener('scroll', () => {
  dslHlEl.scrollTop = dslEl.scrollTop;
  dslHlEl.scrollLeft = dslEl.scrollLeft;
});
levelEl.addEventListener('input', () => {
  // moving the slider clears manual overrides so the level is authoritative
  overrides = {};
  update();
});

$('relayout').addEventListener('click', () => {
  seed++;
  update();
});

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
  const title = parse(dslEl.value).map.title;
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || 'context-map';
}

// --- export / import the model as .cme (the DSL text is the model) ----------

$('exportCme').addEventListener('click', () => {
  download(`${modelStem()}.cme`, new Blob([dslEl.value], { type: 'text/plain;charset=utf-8' }));
});

const cmeFile = $<HTMLInputElement>('cmeFile');
$('importCme').addEventListener('click', () => cmeFile.click());
cmeFile.addEventListener('change', async () => {
  const file = cmeFile.files?.[0];
  if (!file) return;
  dslEl.value = await file.text();
  cmeFile.value = ''; // allow re-importing the same file
  seed = 1; // fresh deterministic layout for the new model
  update();
});

$('exportSvg').addEventListener('click', () => {
  const svg = canvasWrap.querySelector('svg');
  if (!svg) return;
  download(`${modelStem()}.svg`, new Blob([svg.outerHTML], { type: 'image/svg+xml' }));
});
