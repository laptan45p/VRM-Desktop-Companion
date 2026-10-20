# Validation — 0.1.6

33 tests passed with the supplied runtime:

- Ollama/LM Studio local request/response, endpoint restrictions, cancellation, failure and history persistence.
- VRM 0.x/1.0 fixture parsing, pose and expression update, disposal.
- Unrestricted movement beyond all four screen edges; Maximum size is 10.0x. Actual Three.js camera projection of bounding box corners at scale 0.5–10.0 on multiple screen sizes.
- Startup keeps settings, input and balloon hidden and shows only the mascot.
- Left click greeting and focused input, speech replacement and dismissal.
- Shared context menu for character right-click and tray left/right clicks.
- Transparent-area hit testing, explicit click-disable priority and drag movement.
- Bubble height limits and independent position persistence across speech, mascot movement, save and restart; explicit position reset.
- Arbitrary bubble font family and size apply from settings.
- Rotating anatomical region tests separate front chest and rear buttocks, excluding front pelvis and arms.
- Completed pointer tap/stroke, cancellation and Shift-drag through actual VRM mesh picking.
- Sensitive-action counts, timeout/reset, restricted touch IPC and disabling reactions.
- Reaction motions restore the pose and tolerate missing expression presets in VRM 0.x/1.0.
- Text lip motion is bounded, closes when finished/disabled and tolerates missing or partial vowel expressions.
- Soft idle works with VRM 0.x/1.0, stays within small bone rotation limits and restores the original pose when disabled.
- Motion controls retain their settings; preview action works without an LLM.
- Input position persists independently through reopening, mascot movement, settings save and restart.
- Renderer tests for input failure/retry, IME handling, Escape, safe plain-text speech and actual mesh picking.

Electron window calls and DOM operations were tested with doubles. No native Windows/GPU window test was performed. Windows mouse-event forwarding, desktop transparency, tray behavior, real Ollama/LM Studio inference and precise appearance on user VRMs remain unverified.

The supplied prebuilt renderer's library payload was retained and its application code was regenerated from src/renderer.js. Fresh npm/esbuild build was unavailable locally because the development dependencies are absent. Git clones should run npm ci and npm run build before npm test; delivered ZIPs include dist/renderer.js.
