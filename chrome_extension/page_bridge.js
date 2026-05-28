(function () {
  function api() {
    return window.comfyAPI?.api?.api;
  }

  async function graphToPrompt() {
    if (window.app && typeof window.app.graphToPrompt === 'function') {
      return await window.app.graphToPrompt();
    }
    if (window.app && typeof window.app.graphToPromptSerialized === 'function') {
      return await window.app.graphToPromptSerialized();
    }
    throw new Error('Comfy frontend graphToPrompt was not available.');
  }

  function mediaUrl(item) {
    if (!item || !item.filename) return '';
    const params = new URLSearchParams({
      filename: item.filename,
      type: item.type || 'output',
      subfolder: item.subfolder || ''
    });
    return `/view?${params.toString()}`;
  }

  async function loadWorkflow(workflow) {
    if (window.app && typeof window.app.loadGraphData === 'function') {
      await window.app.loadGraphData(workflow);
      window.app.canvas?.setDirty?.(true, true);
      return;
    }
    throw new Error('Comfy frontend app.loadGraphData was not available.');
  }

  async function queueCurrentWorkflow(workflow) {
    const comfyApi = api();
    if (!comfyApi || typeof comfyApi.queuePrompt !== 'function') {
      throw new Error('Comfy frontend queue API was not available.');
    }
    const prompt = await graphToPrompt();
    const queued = await comfyApi.queuePrompt(0, prompt, { previewMethod: 'auto' });
    return queued;
  }

  window.addEventListener('CAB_LOAD_WORKFLOW', async (event) => {
    try {
      await loadWorkflow(event.detail);
      window.dispatchEvent(new CustomEvent('CAB_LOAD_RESULT', { detail: { ok: true } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('CAB_LOAD_RESULT', {
        detail: { ok: false, error: String(err && err.message ? err.message : err) }
      }));
    }
  });

  window.addEventListener('CAB_LOAD_AND_RUN_WORKFLOW', async (event) => {
    try {
      await loadWorkflow(event.detail);
      const queued = await queueCurrentWorkflow(event.detail);
      window.dispatchEvent(new CustomEvent('CAB_RUN_RESULT', {
        detail: { ok: true, prompt_id: queued.prompt_id, number: queued.number }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('CAB_RUN_RESULT', {
        detail: { ok: false, error: String(err && err.message ? err.message : err) }
      }));
    }
  });

  function attachComfyEvents(attempt = 0) {
    const comfyApi = api();
    if (!comfyApi) {
      if (attempt < 40) window.setTimeout(() => attachComfyEvents(attempt + 1), 250);
      return;
    }
    comfyApi.addEventListener('progress', event => {
      window.dispatchEvent(new CustomEvent('CAB_PROGRESS', { detail: event.detail }));
    });
    comfyApi.addEventListener('executing', event => {
      window.dispatchEvent(new CustomEvent('CAB_EXECUTING', { detail: event.detail }));
    });
    comfyApi.addEventListener('b_preview', event => {
      const url = URL.createObjectURL(event.detail);
      window.dispatchEvent(new CustomEvent('CAB_PREVIEW', { detail: { url, kind: 'image' } }));
    });
    comfyApi.addEventListener('executed', event => {
      const output = event.detail?.output || {};
      const images = output.images || [];
      const gifs = output.gifs || [];
      const videos = output.videos || [];
      const item = videos[0] || gifs[0] || images[0];
      if (item) {
        window.dispatchEvent(new CustomEvent('CAB_OUTPUT_MEDIA', {
          detail: {
            url: mediaUrl(item),
            kind: item.format?.includes('video') || /\.(mp4|webm|gif)$/i.test(item.filename || '') ? 'video' : 'image',
            filename: item.filename,
            subfolder: item.subfolder || '',
            type: item.type || 'output'
          }
        }));
      }
    });
    comfyApi.addEventListener('execution_success', event => {
      window.dispatchEvent(new CustomEvent('CAB_EXECUTION_DONE', { detail: event.detail }));
    });
    comfyApi.addEventListener('execution_error', event => {
      window.dispatchEvent(new CustomEvent('CAB_EXECUTION_ERROR', { detail: event.detail }));
    });
  }

  attachComfyEvents();
})();
