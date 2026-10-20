# Validation — 0.1.2

19 tests passed with the supplied runtime:

- Ollama/LM Studio local request/response, endpoint restrictions, cancellation, failure and history persistence.
- VRM 0.x/1.0 fixture parsing, pose and expression update, disposal.
- Actual Three.js camera projection of bounding box corners at scale 0.5–1.8 on multiple screen sizes.
- Startup keeps settings, input and balloon hidden and shows only the mascot.
- Left click greeting and focused input, speech replacement and dismissal.
- Shared context menu for character right-click and tray left/right clicks.
- Transparent-area hit testing, explicit click-disable priority and drag movement.
- Bubble measurement, adjacent placement and work-area clamping.
- Renderer tests for input failure/retry, IME handling, Escape, safe plain-text speech and actual mesh picking.

Electron window calls and DOM operations were tested with doubles. No native Windows/GPU window test was performed. Windows mouse-event forwarding, desktop transparency, tray behavior, real Ollama/LM Studio inference and precise appearance on user VRMs remain unverified.

The supplied prebuilt renderer's library payload was retained and its application code was regenerated from src/renderer.js. Fresh npm/esbuild build was unavailable locally because the development dependencies are absent. Git clones should run npm ci and npm run build before npm test; delivered ZIPs include dist/renderer.js.
