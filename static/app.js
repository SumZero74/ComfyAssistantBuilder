const API = '';
let lastWorkflow = null;
let modelData = null;
let mediaType = 'image';

async function getJSON(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {}, {'X-CAB-Token': window.CAB_TOKEN || ''});
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.json();
}

async function loadModels() {
  const status = document.getElementById('status');
  try {
    modelData = await getJSON('/api/models');
    document.getElementById('llm-model').value = modelData.llm?.model || 'llama3.1';
    document.getElementById('llm-endpoint').value = modelData.llm?.endpoint || 'http://127.0.0.1:11434/api/generate';
    document.getElementById('recipe').addEventListener('change', () => {
      syncMediaFromRecipe();
      populateLoraSlots();
    });
    document.querySelectorAll('[data-media]').forEach(button => {
      if (button.classList.contains('mode')) {
        button.addEventListener('click', () => setMediaType(button.dataset.media));
      }
    });
    setMediaType('image');
    populateLoraSlots();
    const st = await getJSON('/api/status');
    status.textContent = st.comfy && !st.comfy.error ? 'ComfyUI reachable' : 'ComfyUI not reachable';
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
}

function setMediaType(type) {
  mediaType = type === 'video' ? 'video' : 'image';
  document.querySelectorAll('.mode[data-media]').forEach(button => {
    button.classList.toggle('active', button.dataset.media === mediaType);
  });
  const recipe = document.getElementById('recipe');
  for (const option of recipe.options) {
    option.hidden = option.dataset.media !== mediaType;
  }
  if (recipe.selectedOptions[0]?.dataset.media !== mediaType) {
    recipe.value = mediaType === 'video' ? 'wan_t2v' : 'flux_lora';
  }
  document.getElementById('name').value = mediaType === 'video' ? 'Assistant Video' : 'Assistant Image';
  document.getElementById('video-length-field').hidden = mediaType !== 'video';
  populateLoraSlots();
}

function syncMediaFromRecipe() {
  const selected = document.getElementById('recipe').selectedOptions[0];
  if (selected?.dataset.media && selected.dataset.media !== mediaType) {
    setMediaType(selected.dataset.media);
  }
}

function compatibleLoras() {
  const recipe = document.getElementById('recipe').value;
  return (modelData?.lora_catalog || []).filter(item => (item.compatible_recipes || []).includes(recipe));
}

function populateLoraSlots() {
  const rows = [...document.querySelectorAll('[data-lora-slot]')];
  const items = compatibleLoras();
  rows.forEach((row, index) => {
    const select = row.querySelector('.lora-select');
    const prior = select.value;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = items.length ? 'None - no LoRA' : 'No compatible LoRAs for this recipe';
    select.appendChild(empty);
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = item.name;
      const trigger = item.trigger_words?.length ? ` - ${item.trigger_words.join(', ')}` : '';
      opt.textContent = `${item.name.replace(/\.safetensors$/i, '')} [${item.family}]${trigger}`;
      if (item.name === prior) opt.selected = true;
      select.appendChild(opt);
    }
    if (!select.dataset.bound) {
      select.addEventListener('change', () => refreshTriggerWords(row));
      row.querySelector('.lora-clear')?.addEventListener('click', () => clearLora(row));
      select.dataset.bound = 'true';
    }
    refreshTriggerWords(row);
  });
}

function clearLora(row) {
  row.querySelector('.lora-select').value = '';
  row.dataset.triggerWords = '';
  row.querySelector('.trigger-words').textContent = 'No LoRA selected.';
  row.querySelector('.trigger-words').classList.remove('has-trigger');
}

async function refreshTriggerWords(row) {
  const select = row.querySelector('.lora-select');
  const box = row.querySelector('.trigger-words');
  if (!select.value) {
    box.textContent = 'No LoRA selected.';
    box.classList.remove('has-trigger');
    return;
  }
  box.textContent = 'Reading trigger words...';
  try {
    const info = await getJSON(`/api/lora-info?name=${encodeURIComponent(select.value)}`);
    const words = info.trigger_words || [];
    if (words.length) {
      box.textContent = `${info.family || 'Unknown'} trigger: ${words.join(', ')}`;
      box.title = `Source: ${info.source_keys.join(', ') || 'metadata'}`;
      row.dataset.triggerWords = words.join('|');
      row.dataset.loraFamily = info.family || '';
      box.classList.add('has-trigger');
    } else if (info.has_metadata) {
      box.textContent = 'No trigger words found in metadata.';
      row.dataset.triggerWords = '';
      row.dataset.loraFamily = info.family || '';
      box.classList.remove('has-trigger');
    } else {
      box.textContent = 'No embedded metadata found.';
      row.dataset.triggerWords = '';
      row.dataset.loraFamily = info.family || '';
      box.classList.remove('has-trigger');
    }
  } catch (err) {
    box.textContent = `Trigger check failed: ${err.message}`;
    row.dataset.triggerWords = '';
    row.dataset.loraFamily = '';
    box.classList.remove('has-trigger');
  }
}

function selectedTriggerWords() {
  const words = [];
  for (const row of document.querySelectorAll('[data-lora-slot]')) {
    for (const word of (row.dataset.triggerWords || '').split('|')) {
      const clean = word.trim();
      if (clean && !words.some(item => item.toLowerCase() === clean.toLowerCase())) {
        words.push(clean);
      }
    }
  }
  return words;
}

function writePromptFromLoras() {
  const scene = document.getElementById('scene').value.trim() || 'cinematic scene';
  const triggers = selectedTriggerWords();
  const triggerLead = triggers.length ? `${triggers.join(', ')}, ` : '';
  const recipe = document.getElementById('recipe').value;
  const medium = recipe === 'wan_t2v' || recipe === 'flux_wan_t2v' || recipe === 'ltxv_t2v' ? 'text-to-video prompt' : 'image prompt';
  const prompt = `${triggerLead}${scene}, ${medium}, coherent story moment, expressive subject, detailed environment, cinematic lighting, natural composition, sharp focus, high detail`;
  document.getElementById('creative-prompt').value = prompt;
}

async function writePromptWithLlm() {
  const out = document.getElementById('output');
  out.textContent = 'Writing prompt with LLM...';
  const data = await getJSON('/api/compose-prompt', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      scene: document.getElementById('scene').value,
      trigger_words: selectedTriggerWords(),
      media_type: mediaType,
      recipe: document.getElementById('recipe').value,
      model: document.getElementById('llm-model').value,
      endpoint: document.getElementById('llm-endpoint').value
    })
  });
  document.getElementById('creative-prompt').value = data.prompt;
  out.textContent = JSON.stringify({composer: 'llm', model: data.model, endpoint: data.endpoint}, null, 2);
}

function useCreativePrompt() {
  const creative = document.getElementById('creative-prompt').value.trim();
  if (!creative) return;
  const recipe = document.getElementById('recipe').selectedOptions[0]?.textContent || 'workflow';
  document.getElementById('prompt').value = `${recipe}. Prompt: ${creative}`;
}

function togglePromptComposer() {
  const enabled = document.getElementById('enable-prompt-composer').checked;
  for (const id of ['scene', 'creative-prompt', 'write-prompt', 'llm-write-prompt', 'use-prompt', 'llm-model', 'llm-endpoint']) {
    document.getElementById(id).disabled = !enabled;
  }
}

function workflowPayload() {
  const loras = [...document.querySelectorAll('[data-lora-slot]')]
    .map(row => ({
      name: row.querySelector('.lora-select').value,
      strength: row.querySelector('.lora-strength').value
    }))
    .filter(slot => slot.name);
  return {
    prompt: document.getElementById('prompt').value,
    media_type: mediaType,
    recipe: document.getElementById('recipe').value,
    quality: document.getElementById('quality').value,
    video_length_frames: mediaType === 'video' ? document.getElementById('video-length').value : '',
    loras,
    lora: loras[0] ? loras[0].name : '',
    lora_strength: loras[0] ? loras[0].strength : 0.75,
    name: document.getElementById('name').value,
    save: true
  };
}

async function buildWorkflow(run = false) {
  const payload = workflowPayload();
  const out = document.getElementById('output');
  out.textContent = run ? 'Building and queueing...' : 'Building...';
  const data = await getJSON(run ? '/api/build-run' : '/api/build', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  lastWorkflow = data.workflow;
  document.getElementById('download').disabled = false;
  out.textContent = JSON.stringify({
    saved_path: data.saved_path,
    comfy_link: data.comfy_link,
    family: data.family,
    name: data.name,
    queued: data.queued || null
  }, null, 2);
}

function downloadWorkflow() {
  if (!lastWorkflow) return;
  const blob = new Blob([JSON.stringify(lastWorkflow, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'assistant-workflow.json';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('build').addEventListener('click', () => {
  buildWorkflow().catch(err => {
    document.getElementById('output').textContent = err.stack || err.message;
  });
});
document.getElementById('build-run').addEventListener('click', () => {
  buildWorkflow(true).catch(err => {
    document.getElementById('output').textContent = err.stack || err.message;
  });
});
document.getElementById('download').addEventListener('click', downloadWorkflow);
document.getElementById('write-prompt').addEventListener('click', writePromptFromLoras);
document.getElementById('llm-write-prompt').addEventListener('click', () => {
  writePromptWithLlm().catch(err => {
    document.getElementById('output').textContent = err.stack || err.message;
  });
});
document.getElementById('use-prompt').addEventListener('click', useCreativePrompt);
document.getElementById('enable-prompt-composer').addEventListener('change', togglePromptComposer);
togglePromptComposer();
loadModels();
