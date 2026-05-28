# Comfy Assistant Builder

Comfy Assistant Builder is a local ComfyUI control panel for building, loading, and running image or video workflows from one assistant UI.

It has two parts:

- A Python helper server at `http://127.0.0.1:8797`
- A Chrome/Chromium extension that injects the assistant panel into local ComfyUI at `http://127.0.0.1:8188`

The assistant can build starter workflows for Flux image generation and Wan/LTXV video generation, save workflow JSON files, load the workflow into an empty ComfyUI canvas, queue the run, and show live preview/output media in the assistant panel.

## Features

- Image/video mode switch.
- Strict media routing: image mode builds image workflows only, video mode builds video workflows only.
- Quality presets that patch sampler, resolution, FPS, and frame settings.
- Video length control for overriding the default frame count.
- Flux image workflows with optional LoRA stack.
- Wan 2.2, Flux-style Wan, and LTXV text-to-video starter workflows.
- Local LoRA picker with trigger word detection from safetensors metadata.
- Explicit LoRA clear controls so removing a selected LoRA really removes it from the next graph.
- Prompt composer that can include selected LoRA trigger words.
- Optional local LLM prompt composer through a helper-server proxy.
- Build and save workflow JSON files.
- Symlink saved workflows into ComfyUI's workflow folder.
- Build, save, and queue directly from the standalone assistant page.
- Chrome extension panel inside ComfyUI.
- Build, load, and run from the assistant without manually importing JSON.
- Live progress state, step counter, preview image, and final image/video display.
- Floating, draggable, resizable assistant panel inside ComfyUI.

## Requirements

- Linux, macOS, or Windows with Python 3
- ComfyUI running locally
- Chrome or Chromium with Developer Mode enabled for unpacked extensions
- Local ComfyUI model folders containing checkpoints, diffusion models, text encoders, VAEs, and LoRAs

Default paths assume this layout:

```text
~/Documents/ComfyUI
~/Desktop/workflows
```

You can override those paths with environment variables.

## Quick Start

Clone the repo:

```bash
git clone https://github.com/SumZero74/ComfyAssistantBuilder.git
cd ComfyAssistantBuilder
```

Start ComfyUI first. By default the assistant expects ComfyUI at:

```text
http://127.0.0.1:8188
```

Start the helper server:

```bash
./run.sh
```

The server will:

- Create `.cab_token` if it does not exist.
- Generate `chrome_extension/cab_config.js` with the local server URL and token.
- Serve the standalone assistant page at `http://127.0.0.1:8797`.

## Install The Chrome Extension

Open Chrome or Chromium and go to:

```text
chrome://extensions
```

Then:

1. Enable **Developer mode** in the top right.
2. Click **Load unpacked**.
3. Select the repo's extension folder:

```text
ComfyAssistantBuilder/chrome_extension
```

4. Open or refresh ComfyUI:

```text
http://127.0.0.1:8188
```

You should see an **Assistant Builder** button near the top right of the ComfyUI page.

## Reload The Extension After Code Changes

After editing extension files:

1. Make sure the helper server has been started at least once so `chrome_extension/cab_config.js` is current.
2. Go to `chrome://extensions`.
3. Find **Comfy Assistant Builder**.
4. Click the circular **Reload** button on the extension card.
5. Refresh the ComfyUI tab.

If the extension is not listed, install it again with **Load unpacked** and select:

```text
ComfyAssistantBuilder/chrome_extension
```

## Basic Use

1. Start ComfyUI.
2. Start the helper server with `./run.sh`.
3. Open `http://127.0.0.1:8188`.
4. Click **Assistant Builder**.
5. Choose **Image** or **Video**.
6. Pick a quality preset.
7. Pick a recipe.
8. Select LoRAs if needed.
9. Write or compose a prompt.
10. Click **Build, Load + Run**.

The assistant loads the generated workflow into the current ComfyUI canvas, queues it, tracks progress, and shows generated media in the preview window.

## Configuration

The app works out of the box for a common local ComfyUI install at `~/Documents/ComfyUI`. Use environment variables if your paths or ports are different.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CAB_COMFY_ROOT` | `~/Documents/ComfyUI` | ComfyUI install folder |
| `CAB_COMFY_API` | `http://127.0.0.1:8188` | ComfyUI API URL |
| `CAB_WORKFLOWS_DIR` | `~/Desktop/workflows` | Folder where assistant workflow JSON files are saved |
| `CAB_HOST` | `127.0.0.1` | Helper server bind host |
| `CAB_PORT` | `8797` | Helper server port |
| `CAB_TOKEN_PATH` | `.cab_token` in the app folder | API token file |

Example:

```bash
CAB_COMFY_ROOT="$HOME/ComfyUI" \
CAB_WORKFLOWS_DIR="$HOME/comfy-workflows" \
CAB_COMFY_API="http://127.0.0.1:8188" \
./run.sh
```

## Modes

**Image** mode uses Flux workflows:

- `Flux image with LoRA stack`
- `Flux base image`

**Video** mode uses video workflows:

- `Wan 2.2 text-to-video`
- `LTXV text-to-video`

If a mismatched recipe is selected, the backend normalizes it to the selected media type.

The assistant also patches the prompt text into the positive prompt nodes before queueing. Selected LoRAs are written into the LoRA loader widgets in the generated graph. Empty LoRA slots stay empty.

The video recipe named `Flux-style video (Wan backend)` is a video-safe option for Flux-style prompting. It still builds and queues a Wan video graph because Flux itself is handled as an image model in this assistant.

## LLM Prompt Composer

The composer can call a local LLM endpoint to rewrite the selected LoRA trigger words and scene idea into a stronger generation prompt.

Default local settings:

- `CAB_LLM_ENDPOINT=http://127.0.0.1:11434/api/generate`
- `CAB_LLM_MODEL=llama3.1`

The helper only accepts local LLM endpoints by default. Trigger words are preserved in the final prompt.

## Running Workflows

The Chrome extension panel can build, load into the ComfyUI canvas, queue, and show live preview events.

The standalone page can also use **Build, Save + Run**. That queues the generated API prompt directly to the configured ComfyUI API and returns the ComfyUI queue response.

## Quality Presets

The assistant has three quality presets:

- `Draft`: lower step counts for quicker tests.
- `Balanced`: practical defaults for normal use.
- `Max Quality`: higher image/video sampler settings, larger video latent settings where the bundled workflow supports them, and MP4/H.264 video saving.

Max Quality can take substantially longer and use more VRAM.

Video mode also exposes a `Length` field. This is the generated frame count, so higher values make longer videos and can substantially increase render time and VRAM pressure.

## Workflow Output Paths

Generated workflow JSON files are saved under:

```text
~/Desktop/workflows
```

or the folder set by `CAB_WORKFLOWS_DIR`.

They are also linked into ComfyUI's workflow folder:

```text
<CAB_COMFY_ROOT>/user/default/workflows
```

Generated images and videos are produced by ComfyUI in its normal output folder:

```text
<CAB_COMFY_ROOT>/output
```

## Project Layout

```text
ComfyAssistantBuilder/
  server.py                    Local helper server and workflow builder
  run.sh                       Starts the helper server
  static/                      Standalone browser UI
  chrome_extension/            Unpacked Chrome extension
    manifest.json              Extension manifest
    cab_config.js              Generated local API token config
    content.js                 Assistant panel injected into ComfyUI
    content.css                Assistant panel styling
    page_bridge.js             Bridge into ComfyUI frontend APIs
```

## Security Defaults

- The helper server binds only to `127.0.0.1:8797` by default.
- API calls require the private token in `.cab_token`.
- `.cab_token` is ignored by git.
- `chrome_extension/cab_config.js` is generated by the helper server for the local machine.
- The Chrome extension only has host permissions for local ComfyUI and the local helper server.
- No SwarmUI files, folders, presets, or APIs are touched.
- No cloud service is contacted by this project.

## Troubleshooting

**The assistant button does not appear in ComfyUI**

- Confirm the extension is installed at `chrome://extensions`.
- Confirm it is loaded from the repo's `chrome_extension` folder.
- Click the extension card's reload button.
- Refresh `http://127.0.0.1:8188`.
- Make sure you are using `127.0.0.1` or `localhost`; the extension only matches local ComfyUI URLs.

**The assistant says the server is not ready**

- Start the helper server:

```bash
cd ComfyAssistantBuilder
./run.sh
```

- Then reload the extension and refresh the ComfyUI tab.

**The extension is installed but API calls are unauthorized**

- Start `./run.sh` again so it regenerates `chrome_extension/cab_config.js`.
- Reload the extension at `chrome://extensions`.
- Refresh ComfyUI.

**Build works but run does not queue**

- Make sure ComfyUI is fully loaded before clicking **Build, Load + Run**.
- Refresh the ComfyUI page after reloading the extension.
- Check that ComfyUI is available at `http://127.0.0.1:8188`.

**Preview does not show**

- ComfyUI must emit preview/output events for the current workflow.
- Final media should still appear when ComfyUI reports image/video outputs.
- Video output depends on the video workflow/template saving a video file.

**Video mode builds but ComfyUI reports missing models**

- The assistant checks common loader nodes before returning the workflow.
- Install the missing model file into the folder named in the error.
- For Wan 2.2, the bundled workflow expects Wan diffusion models, a Wan VAE, and a Wan text encoder in the usual ComfyUI model folders.

## Notes For GitHub

Do not commit your personal `.cab_token`.

If you want `chrome_extension/cab_config.js` to stay as a generic template in the repo, run this before committing:

```bash
cat > chrome_extension/cab_config.js <<'EOF'
// Generated by Comfy Assistant Builder when the local server starts.
// Run ../run.sh before loading or reloading the unpacked extension.
window.CAB_SERVER = "http://127.0.0.1:8797";
window.CAB_EXTENSION_TOKEN = "";
EOF
```

This project is intentionally local-first. It is designed for a single-user workstation setup where ComfyUI, models, workflow files, and generated media all live on the same machine.
