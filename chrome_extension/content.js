const CAB_SERVER = window.CAB_SERVER || 'http://127.0.0.1:8797';
let cabLastWorkflow = null;
let cabModelData = null;
let cabMediaType = 'image';

function injectBridge() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page_bridge.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  if (text) node.textContent = text;
  return node;
}

async function cabFetch(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {}, {
    'X-CAB-Token': window.CAB_EXTENSION_TOKEN || ''
  });
  const res = await fetch(`${CAB_SERVER}${path}`, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.json();
}

async function loadCabModels() {
  if (!cabModelData) cabModelData = await cabFetch('/api/models');
  return cabModelData;
}

function cabCompatibleLoras(panel) {
  const recipe = panel.querySelector('#cab-recipe').value;
  return (cabModelData?.lora_catalog || []).filter(item => (item.compatible_recipes || []).includes(recipe));
}

function cabSetMediaType(panel, type) {
  cabMediaType = type === 'video' ? 'video' : 'image';
  panel.querySelectorAll('[data-cab-media]').forEach(button => {
    button.classList.toggle('active', button.dataset.cabMedia === cabMediaType);
  });
  const recipe = panel.querySelector('#cab-recipe');
  [...recipe.options].forEach(option => {
    option.hidden = option.dataset.media !== cabMediaType;
  });
  if (recipe.selectedOptions[0]?.dataset.media !== cabMediaType) {
    recipe.value = cabMediaType === 'video' ? 'wan_t2v' : 'flux_lora';
  }
  panel.querySelector('#cab-name').value = cabMediaType === 'video' ? 'Assistant Video' : 'Assistant Image';
  if (cabMediaType === 'video') {
    panel.querySelector('#cab-prompt').value = 'A cinematic text-to-video shot with clear subject motion, natural lighting, consistent anatomy, detailed environment, smooth camera movement, high quality video';
  } else {
    panel.querySelector('#cab-prompt').value = 'Flux image workflow, 1024 square, photoreal portrait, cinematic lighting, high detail, save image';
  }
  populateCabLoras(panel);
}

function populateCabLoras(panel) {
  const items = cabCompatibleLoras(panel);
  panel.querySelectorAll('[data-cab-lora-slot]').forEach((row, index) => {
    const select = row.querySelector('.cab-lora');
    const prior = select.value;
    select.innerHTML = '';
    const empty = el('option', { value: '' }, items.length ? 'None - no LoRA' : 'No compatible LoRAs');
    select.appendChild(empty);
    for (const item of items) {
      const trigger = item.trigger_words?.length ? ` - ${item.trigger_words.join(', ')}` : '';
      const opt = el('option', { value: item.name }, `${item.name.replace(/\.safetensors$/i, '')} [${item.family}]${trigger}`);
      if (item.name === prior) opt.selected = true;
      select.appendChild(opt);
    }
    refreshCabTriggerWords(row);
  });
}

async function refreshCabTriggerWords(row) {
  const select = row.querySelector('.cab-lora');
  const box = row.querySelector('.cab-trigger');
  if (!select.value) {
    box.textContent = 'No LoRA selected.';
    box.classList.remove('has-trigger');
    return;
  }
  box.textContent = 'Reading trigger words...';
  try {
    const info = await cabFetch(`/api/lora-info?name=${encodeURIComponent(select.value)}`);
    const words = info.trigger_words || [];
    if (words.length) {
      box.textContent = `${info.family || 'Unknown'} trigger: ${words.join(', ')}`;
      box.title = `Source: ${info.source_keys.join(', ') || 'metadata'}`;
      row.dataset.triggerWords = words.join('|');
      box.classList.add('has-trigger');
    } else if (info.has_metadata) {
      box.textContent = 'No trigger words found in metadata.';
      row.dataset.triggerWords = '';
      box.classList.remove('has-trigger');
    } else {
      box.textContent = 'No embedded metadata found.';
      row.dataset.triggerWords = '';
      box.classList.remove('has-trigger');
    }
  } catch (err) {
    box.textContent = `Trigger check failed: ${err.message}`;
    row.dataset.triggerWords = '';
    box.classList.remove('has-trigger');
  }
}

function cabSelectedTriggerWords(panel) {
  const words = [];
  panel.querySelectorAll('[data-cab-lora-slot]').forEach(row => {
    (row.dataset.triggerWords || '').split('|').forEach(word => {
      const clean = word.trim();
      if (clean && !words.some(item => item.toLowerCase() === clean.toLowerCase())) words.push(clean);
    });
  });
  return words;
}

function cabTogglePromptComposer(panel) {
  const enabled = panel.querySelector('#cab-enable-composer').checked;
  ['#cab-scene', '#cab-write-prompt', '#cab-write-llm', '#cab-llm-model', '#cab-llm-endpoint'].forEach(selector => {
    const node = panel.querySelector(selector);
    if (node) node.disabled = !enabled;
  });
}

function cabWritePrompt(panel) {
  const scene = panel.querySelector('#cab-scene').value.trim() || 'cinematic scene';
  const triggers = cabSelectedTriggerWords(panel);
  const triggerLead = triggers.length ? `${triggers.join(', ')}, ` : '';
  const recipe = panel.querySelector('#cab-recipe').value;
  const medium = recipe === 'wan_t2v' || recipe === 'flux_wan_t2v' || recipe === 'ltxv_t2v' ? 'text-to-video prompt' : 'image prompt';
  panel.querySelector('#cab-prompt').value = `${triggerLead}${scene}, ${medium}, coherent story moment, expressive subject, detailed environment, cinematic lighting, natural composition, sharp focus, high detail`;
}

async function cabWritePromptWithLlm(panel) {
  const output = panel.querySelector('#cab-output');
  output.textContent = 'Writing prompt with LLM...';
  const data = await cabFetch('/api/compose-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scene: panel.querySelector('#cab-scene').value,
      trigger_words: cabSelectedTriggerWords(panel),
      media_type: cabMediaType,
      recipe: panel.querySelector('#cab-recipe').value,
      model: panel.querySelector('#cab-llm-model').value,
      endpoint: panel.querySelector('#cab-llm-endpoint').value
    })
  });
  panel.querySelector('#cab-prompt').value = data.prompt;
  output.textContent = JSON.stringify({ composer: 'llm', model: data.model, endpoint: data.endpoint }, null, 2);
}

function cabClearLora(row) {
  row.querySelector('.cab-lora').value = '';
  row.querySelector('.cab-strength').value = row.dataset.defaultStrength || '0.75';
  row.dataset.triggerWords = '';
  row.querySelector('.cab-trigger').textContent = 'No LoRA selected.';
  row.querySelector('.cab-trigger').classList.remove('has-trigger');
}

function cabShowMedia(panel, detail) {
  const viewer = panel.querySelector('#cab-viewer');
  if (!detail?.url) return;
  const url = detail.url;
  const kind = detail.kind === 'video' ? 'video' : 'image';
  viewer.innerHTML = '';
  const media = document.createElement(kind === 'video' ? 'video' : 'img');
  media.src = url;
  if (kind === 'video') {
    media.controls = true;
    media.autoplay = true;
    media.loop = true;
    media.muted = true;
  }
  viewer.appendChild(media);
}

function buildPanel() {
  if (document.getElementById('cab-panel')) return;
  const toggle = el('button', { id: 'cab-toggle' }, 'Assistant Builder');
  const panel = el('section', { id: 'cab-panel' });
  panel.innerHTML = `
    <header id="cab-drag-handle">
      <div>
        <h2>Comfy Assistant</h2>
        <div class="cab-subtitle">Floating workflow cockpit</div>
      </div>
      <div class="cab-window-actions">
        <button class="cab-mini" id="cab-collapse" title="Collapse">-</button>
        <button class="cab-close" title="Hide">x</button>
      </div>
    </header>
    <div class="body">
      <div class="cab-mode-strip">
        <button type="button" class="active" data-cab-media="image">Image</button>
        <button type="button" data-cab-media="video">Video</button>
      </div>
      <div class="cab-toolbar-grid">
        <div>
          <label>Quality</label>
          <select id="cab-quality">
            <option value="balanced" selected>Balanced</option>
            <option value="max">Max Quality</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div>
          <label>Workflow name</label>
          <input id="cab-name" value="Assistant Image">
        </div>
      </div>
      <div class="cab-main-grid">
        <div class="cab-left">
          <label>Workflow request</label>
          <textarea id="cab-prompt">Flux image workflow with kwingo LoRA, 1024 square, photoreal portrait, save image</textarea>
        </div>
        <div class="cab-right">
          <div id="cab-viewer" class="cab-viewer">
            <span>Preview appears here while ComfyUI runs.</span>
          </div>
          <div class="cab-stats">
            <div><b id="cab-run-state">Idle</b><span>Run state</span></div>
            <div><b id="cab-run-step">--</b><span>Step</span></div>
          </div>
        </div>
      </div>
      <label class="cab-toggle-line">
        <input id="cab-enable-composer" type="checkbox">
        <span>Enable LoRA prompt composer</span>
      </label>
      <div class="row cab-composer-row">
        <div>
          <label>Scene idea</label>
          <input id="cab-scene" value="cinematic portrait in a neon city at night" disabled>
        </div>
        <div>
          <label>&nbsp;</label>
          <button id="cab-write-prompt" type="button" disabled>Write</button>
        </div>
      </div>
      <div class="row cab-llm-row">
        <div>
          <label>LLM model</label>
          <input id="cab-llm-model" value="llama3.1" disabled>
        </div>
        <div>
          <label>LLM endpoint</label>
          <input id="cab-llm-endpoint" value="http://127.0.0.1:11434/api/generate" disabled>
        </div>
        <button id="cab-write-llm" type="button" disabled>LLM Write</button>
      </div>
      <label>Recipe</label>
      <select id="cab-recipe">
        <option value="flux_lora" data-media="image">Flux image with LoRA stack</option>
        <option value="flux_base" data-media="image">Flux base image</option>
        <option value="wan_t2v" data-media="video">Wan 2.2 text-to-video</option>
        <option value="flux_wan_t2v" data-media="video">Flux-style video (Wan backend)</option>
        <option value="ltxv_t2v" data-media="video">LTXV text-to-video</option>
      </select>
      <div class="cab-loras">
        <div class="row cab-lora-row" data-cab-lora-slot>
          <div>
            <label>LoRA 1</label>
            <select class="cab-lora" data-primary="true"></select>
          </div>
          <div>
            <label>Strength</label>
            <input class="cab-strength" type="number" step="0.05" value="0.75">
          </div>
          <button type="button" class="cab-clear-lora" title="Remove LoRA">Clear</button>
          <div class="cab-trigger">Choose a LoRA to see trigger words.</div>
        </div>
        <div class="row cab-lora-row" data-cab-lora-slot>
          <div>
            <label>LoRA 2</label>
            <select class="cab-lora"></select>
          </div>
          <div>
            <label>Strength</label>
            <input class="cab-strength" type="number" step="0.05" value="0.45">
          </div>
          <button type="button" class="cab-clear-lora" title="Remove LoRA">Clear</button>
          <div class="cab-trigger">No LoRA selected.</div>
        </div>
        <div class="row cab-lora-row" data-cab-lora-slot>
          <div>
            <label>LoRA 3</label>
            <select class="cab-lora"></select>
          </div>
          <div>
            <label>Strength</label>
            <input class="cab-strength" type="number" step="0.05" value="0.30">
          </div>
          <button type="button" class="cab-clear-lora" title="Remove LoRA">Clear</button>
          <div class="cab-trigger">No LoRA selected.</div>
        </div>
      </div>
      <div class="actions">
        <button id="cab-run">Build, Load + Run</button>
        <button id="cab-build">Build + Load</button>
        <button id="cab-save">Save Only</button>
      </div>
      <pre id="cab-output">Waiting.</pre>
    </div>
    <div id="cab-resize-handle" title="Resize"></div>
  `;
  document.body.append(toggle, panel);

  const output = panel.querySelector('#cab-output');
  loadCabModels()
    .then(models => {
      panel.querySelector('#cab-llm-model').value = models.llm?.model || 'llama3.1';
      panel.querySelector('#cab-llm-endpoint').value = models.llm?.endpoint || 'http://127.0.0.1:11434/api/generate';
      cabSetMediaType(panel, 'image');
    })
    .catch(err => output.textContent = `Server not ready: ${err.message}`);
  panel.querySelectorAll('[data-cab-media]').forEach(button => {
    button.addEventListener('click', () => cabSetMediaType(panel, button.dataset.cabMedia));
  });
  panel.querySelector('#cab-recipe').addEventListener('change', () => {
    const selectedMedia = panel.querySelector('#cab-recipe').selectedOptions[0]?.dataset.media || cabMediaType;
    cabSetMediaType(panel, selectedMedia);
  });
  panel.querySelector('#cab-enable-composer').addEventListener('change', () => cabTogglePromptComposer(panel));
  panel.querySelector('#cab-write-prompt').addEventListener('click', () => cabWritePrompt(panel));
  panel.querySelector('#cab-write-llm').addEventListener('click', () => {
    cabWritePromptWithLlm(panel).catch(err => {
      output.textContent = err.stack || err.message;
    });
  });
  cabTogglePromptComposer(panel);
  panel.querySelectorAll('[data-cab-lora-slot]').forEach(row => {
    row.dataset.defaultStrength = row.querySelector('.cab-strength').value;
    row.querySelector('.cab-lora').addEventListener('change', () => refreshCabTriggerWords(row));
    row.querySelector('.cab-clear-lora').addEventListener('click', () => cabClearLora(row));
  });

  toggle.addEventListener('click', () => panel.hidden = !panel.hidden);
  panel.querySelector('.cab-close').addEventListener('click', () => panel.hidden = true);
  panel.querySelector('#cab-collapse').addEventListener('click', () => panel.classList.toggle('cab-collapsed'));
  makeFloatingWindow(panel);

  async function build(mode) {
    output.textContent = 'Building...';
    panel.querySelector('#cab-run-state').textContent = 'Building';
    const loras = [...panel.querySelectorAll('[data-cab-lora-slot]')]
      .map(row => ({
        name: row.querySelector('.cab-lora').value,
        strength: row.querySelector('.cab-strength').value
      }))
      .filter(slot => slot.name);
    const payload = {
      prompt: panel.querySelector('#cab-prompt').value,
      media_type: cabMediaType,
      recipe: panel.querySelector('#cab-recipe').value,
      quality: panel.querySelector('#cab-quality').value,
      loras,
      lora: loras[0] ? loras[0].name : '',
      lora_strength: loras[0] ? loras[0].strength : 0.75,
      name: panel.querySelector('#cab-name').value,
      save: true
    };
    const data = await cabFetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    cabLastWorkflow = data.workflow;
    output.textContent = JSON.stringify({
      saved_path: data.saved_path,
      comfy_link: data.comfy_link,
      family: data.family
    }, null, 2);
    if (mode === 'load') {
      panel.querySelector('#cab-run-state').textContent = 'Loaded';
      window.dispatchEvent(new CustomEvent('CAB_LOAD_WORKFLOW', { detail: cabLastWorkflow }));
    }
    if (mode === 'run') {
      panel.querySelector('#cab-run-state').textContent = 'Queueing';
      window.dispatchEvent(new CustomEvent('CAB_LOAD_AND_RUN_WORKFLOW', { detail: cabLastWorkflow }));
    }
  }

  panel.querySelector('#cab-run').addEventListener('click', () => {
    build('run').catch(err => {
      output.textContent = err.stack || err.message;
      panel.querySelector('#cab-run-state').textContent = 'Error';
    });
  });
  panel.querySelector('#cab-build').addEventListener('click', () => {
    build('load').catch(err => output.textContent = err.stack || err.message);
  });
  panel.querySelector('#cab-save').addEventListener('click', () => {
    build('save').catch(err => output.textContent = err.stack || err.message);
  });
  window.addEventListener('CAB_LOAD_RESULT', event => {
    const prior = output.textContent;
    output.textContent = `${prior}\n\nCanvas load: ${event.detail.ok ? 'ok' : event.detail.error}`;
  });
  window.addEventListener('CAB_RUN_RESULT', event => {
    const prior = output.textContent;
    if (event.detail.ok) {
      panel.querySelector('#cab-run-state').textContent = 'Running';
      output.textContent = `${prior}\n\nQueued: ${event.detail.prompt_id}`;
    } else {
      panel.querySelector('#cab-run-state').textContent = 'Run error';
      output.textContent = `${prior}\n\nRun failed: ${event.detail.error}`;
    }
  });
  window.addEventListener('CAB_PROGRESS', event => {
    const data = event.detail || {};
    if (data.max) panel.querySelector('#cab-run-step').textContent = `${data.value}/${data.max}`;
    panel.querySelector('#cab-run-state').textContent = 'Running';
  });
  window.addEventListener('CAB_PREVIEW', event => cabShowMedia(panel, event.detail));
  window.addEventListener('CAB_OUTPUT_MEDIA', event => {
    cabShowMedia(panel, event.detail);
    panel.querySelector('#cab-run-state').textContent = 'Output ready';
  });
  window.addEventListener('CAB_EXECUTION_DONE', () => {
    panel.querySelector('#cab-run-state').textContent = 'Complete';
  });
  window.addEventListener('CAB_EXECUTION_ERROR', event => {
    panel.querySelector('#cab-run-state').textContent = 'Error';
    output.textContent = `${output.textContent}\n\nExecution error: ${event.detail?.exception_message || 'ComfyUI execution failed'}`;
  });
}

function makeFloatingWindow(panel) {
  const handle = panel.querySelector('#cab-drag-handle');
  const resize = panel.querySelector('#cab-resize-handle');
  let drag = null;
  let sizing = null;

  const saved = JSON.parse(localStorage.getItem('cab_window_rect') || 'null');
  if (saved) {
    panel.style.left = `${saved.left}px`;
    panel.style.top = `${saved.top}px`;
    panel.style.width = `${saved.width}px`;
    panel.style.height = `${saved.height}px`;
    panel.style.right = 'auto';
  }

  function persist() {
    const rect = panel.getBoundingClientRect();
    localStorage.setItem('cab_window_rect', JSON.stringify({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }));
  }

  handle.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', event => {
    if (!drag) return;
    const left = Math.max(8, Math.min(window.innerWidth - 220, drag.left + event.clientX - drag.x));
    const top = Math.max(8, Math.min(window.innerHeight - 80, drag.top + event.clientY - drag.y));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
  });

  handle.addEventListener('pointerup', event => {
    if (!drag) return;
    drag = null;
    handle.releasePointerCapture(event.pointerId);
    persist();
  });

  resize.addEventListener('pointerdown', event => {
    const rect = panel.getBoundingClientRect();
    sizing = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    resize.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  resize.addEventListener('pointermove', event => {
    if (!sizing) return;
    panel.style.width = `${Math.max(520, sizing.width + event.clientX - sizing.x)}px`;
    panel.style.height = `${Math.max(420, sizing.height + event.clientY - sizing.y)}px`;
    panel.style.maxHeight = 'none';
  });

  resize.addEventListener('pointerup', event => {
    if (!sizing) return;
    sizing = null;
    resize.releasePointerCapture(event.pointerId);
    persist();
  });
}

injectBridge();
buildPanel();
