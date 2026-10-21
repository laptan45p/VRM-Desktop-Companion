# Validation — 0.1.23

127 tests passed after a fresh dependency install and renderer build:

- OpenAI/OpenRouter model-list buttons show immediate progress, retain disabled status during unrelated updates, prevent duplicate requests and expose selectable results.
- Model-list selection persists the chosen ID; missing-key errors, empty responses and stale results after provider changes have explicit UI handling.
- Model-list status precedes the cloud settings block in the actual HTML so it is next to the request button.
- Ctrl-wheel mesh hit requirement, normal-wheel exclusion, pixel/line/page delta normalization and malformed delta rejection.
- Mascot-only zoom IPC, cumulative latest-scale updates, limits, restart settings, unchanged popup bounds and stable center/bottom through repeated zooms.
- Numeric scale input supports the 0.001 increments used by wheel zoom; direct numeric edits are included in settings saves.
- External wheel scale updates the numeric field while retaining unsaved persona edits; zoom broadcasts retain hover eligibility for continued wheel use.
- OpenRouter fixed endpoint and independent key scope, text model discovery, manual model IDs, max_tokens and nested reasoning settings.
- OpenRouter successful chat/touch requests, relationship context, HTTP 200/402/429/503 error redaction and no automatic retries.
- OpenRouter settings preset, help visibility, API-key registration/clearing, model save and main-process integration without key leakage.
- Relationship stages, cooldowns, daily caps, clock rollback, mood expiry, anger penalties and romance opt-out.
- Application-controlled confession acceptance/rejection, retry cooldown, no automatic romance, quoted-text exclusion and pre-award eligibility.
- Per-character history/profile persistence, outfit bindings, legacy migration and malformed data bounds.
- Successful-chat-only affection, cancellation, rejected in-flight profile/VRM changes, control-only relationship IPC and history clearing without relationship loss.
- Settings controls for relationship summaries, profile creation, romance toggles and explicit confession.
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

Additional touch LLM coverage:
- Ollama and LM Studio request bodies include persona, recent history, region/gesture/emotion/count, and a 128-token budget without mutating history.
- Debouncing, aborting superseded requests, stale response suppression and failure/unconfigured-model fallback.
- Immediate motion with deferred generated text, no touch history insertion, and normal conversation priority/cancellation.

Cloth drag coverage:
- 8/12 Japanese/English skirt chains with varied lengths, scales and rotations.
- Hem picking requires cloth skin influence; background and torso do not select a chain.
- Bounded drag angles and reach, smooth release, restoration before spring updates and cancellation.
- Renderer gesture arbitration, upward motion, pointer cancellation and Shift-drag; cloth toggle and LLM reaction routing.
- Regression test reproduces the former frozen-cloth failure with actual VRMSpringBoneJoint/Manager and SkinnedMesh: skin vertices and GPU bone matrices must change after dragging and restore after release, while matrixAutoUpdate remains false.
- Read-only inspection of two supplied VRMs confirmed 8 four-node and 12 five-node chains, a selectable weighted hem vertex, bounded movement and reset using reconstructed scene transforms. Additional 0.1.9 verification loaded both supplied models with GLTFLoader/VRMLoaderPlugin, keeping geometry, skins and spring definitions while omitting textures for headless execution. Under the same gesture, a selected hem vertex moved about 0.0502 and 0.0222 model units with the fix (previous code showed only about 0.0017 and 0.0022 units of incidental spring movement). These measurements verify skinning rather than quaternion changes alone. Textured GPU rendering and native desktop gestures on these models were not verified. The supplied models are not included in the repository or release.

0.1.10 coverage:
- Cached picking matches the original Three.js raycast with relative/absolute morph targets, active negative weights, and changing bone poses/expressions. Each skinned vertex is evaluated once per query; original mesh methods are restored even when raycasting throws.
- Seven coat chains are detected; missing garment chains safely ignore repeated drag attempts.
- The third supplied VRM was loaded headlessly with its actual geometry, skins, humanoid and spring definitions, omitting textures. With the fix, a selected coat hem vertex moved about 0.0183 model units and returned to its original position after release.
- Headless profiling of that model measured original repeated raycasts around 78–120ms and optimized warmed queries around 36–40ms. These timings are environment-specific, not native desktop freeze reproduction. Exact native freezing remains unconfirmed.

0.1.11 coverage:
- Larger defaults move the test hem farther than the former 6%/0.5rad limits; configurable 2–50% reach and 10–120deg bend remain bounded under extreme input.
- Settings default migration, clamping, and percentage/degree UI save behavior.
- Existing real spring/SkinnedMesh restoration regression runs with the enlarged defaults.
- Headless checks of all three supplied models confirmed selected hem vertices move roughly 2.3–2.5x farther under a large identical gesture than with the previous defaults, then return after release (with incidental spring motion on two models). Textured desktop appearance remains unverified.

0.1.12 coverage:
- Both hands and VRM 0.x/1.0 track reachable IK targets and restore after release. Unreachable and shoulder-origin targets remain finite and preserve upper/forearm lengths.
- Skin-influence/distance selection, missing arm fallback, cancellation, renderer gesture ownership/Shift movement, and restricted hand LLM reactions/toggle.
- Headless validation of all three supplied models checks both actual raw and normalized hand positions and restoration using their real humanoid/spring runtimes; textures are omitted. Native textured dragging remains unverified.

Electron window calls and DOM operations were tested with doubles. No native Windows/GPU window test was performed. Windows mouse-event forwarding, desktop transparency, tray behavior, real Ollama/LM Studio inference and precise appearance on user VRMs remain unverified.

The supplied prebuilt renderer's library payload was retained and its application code was regenerated from src/renderer.js. Fresh npm/esbuild build was unavailable locally because the development dependencies are absent. Git clones should run npm ci and npm run build before npm test; delivered ZIPs include dist/renderer.js.


## XYZ orientation coverage

- Fixed hips pivot under repeated X/Y/Z and combined rotations; geometric-center fallback.
- Camera projection keeps the pivot centered and every rotated reference-bound corner visible.
- Actual mesh picking routes Ctrl-drag to XY and Ctrl+Shift-drag to Z, without touch/chat/window movement; cancellation does not persist.
- Axis settings save, legacy Y migration, persistence/reload, sender and finite-range validation, pass-through priority, and independent window positions.
- External orientation updates preserve unsaved persona text in the settings form.

Native Windows visual interaction has not been verified in this environment.

## VRMA coverage

- Synthetic GLB animation applied through the actual VRM animation loader, clip conversion and mixer to both VRM 0.x and 1.0 fixtures; bone movement, vertical hips translation, all-joint restoration and cleanup.
- Startup/click greeting priority, seven-item shuffled selection, completion-relative intervals, interaction/visibility/conversation suspension, no accumulated playback bursts, and periodic disable without disabling greetings.
- Renderer integration loads actual synthetic VRMA bytes and animates a fixture on startup and greeting updates; hiding stops playback and restores the pose.
- Folder selection, registered-file reads, sender checks, external-resource and malformed GLB rejection, interval bounds and persisted settings.
- Separately loaded all seven user-supplied VRMA files and sampled each at 100 time points on both VRM format fixtures. Every bone transform remained finite (14 clip/model combinations). The supplied files are not committed or redistributed.
- Native Windows visual appearance and manual gesture interaction remain unverified in this environment.

- Suspended VRMA playback preserves pose changes from the existing idle animation.

## Selected idle animation / pose coverage

- Loop playback across several durations at configured speed; frozen pose remains stable over 100 frames, including exact 0%/100% endpoints.
- Real mixer blends one-shot greetings/random motions back to selected idle; idle and greeting can use the same source clip independently.
- Conversation continues idle, manipulation suspends it, release/show resumes it, missing idle file falls back, disposal releases actions.
- Renderer integration covers static idle after greeting, during conversation, after another greeting, and hide/show. Form selection, draft preservation, settings validation, migration, persistence.
- Static/constant tracks are re-applied after procedural idle and IK preparation so unchanged mixer tracks cannot revert to the neutral pose.
- Separately sampled all seven supplied VRM animations in both loop and frozen-pose modes on VRM 0.x and 1.0 fixtures (28 combinations), checking finite transforms and static pose stability. Motion files are not included in the repository or release.
- Native Windows visual checks remain unperformed in this environment.

## Irodori TTS and audio-driven mouth coverage

- Real local HTTP request/response test checks WAV bytes, selected embedding path, caption, speed, response format and model alias; malformed audio, invalid speaker path, nonlocal endpoint, server errors and cancellation.
- Latest-utterance voice lane discards late completion/failure and aborts superseded work.
- Web Audio adapter tested with a deterministic audio context: output playback clock, RMS waveform/silence, volume, ending, decode failure and cancellation before playback. This is not an audio device test.
- Lip motion follows sound amplitude/progress even after pseudo-text timing would have expired, closes during silence and respects disabled/missing vowel expressions.
- Main-process integration checks embedding choice, mascot-only audio/ack IPC, balloon retention until audio ends, cancellation on hide/new speech and text retention on synthesis failure.
- Renderer integration covers current/stale audio IDs, waiting before playback, explicit stop, voice settings and saved-settings requirement for testing the voice.
- Existing model, interaction, orientation, VRMA loop/static pose and UI tests remain passing.
- Actual Irodori GPU inference with the user's trained embedding, native Windows audio-device output and perceived viseme accuracy remain unverified. No model or embedding is bundled.

## Cloud LLM coverage

- OpenAI and compatible HTTPS endpoint normalization, official-host enforcement, endpoint-scoped key identifiers, loopback-only TTS/local-provider rules.
- Mocked network verifies bearer auth, model discovery, chat history bounds, completion-token budgets, opt-in reasoning/temperature, compatible API root and token parameter, and OpenAI store:false.
- Same cloud credential routing for touch reactions; no model, audio or embedding files sent to LLM.
- Key vault delegates encryption/decryption to safeStorage (tested with deterministic-interface cryptographic test doubles), persists ciphertext separately, reloads, deletes, rejects insecure fallback and malformed keys, and reports unreadable keys generically.
- IPC tests cover control-only key operations, main-process credential injection, model/chat/touch lanes and absence of secret values in renderer state/events. Renderer tests cover manual model IDs, clearing password fields, editable compatible URLs and switching back to local.
- API error redaction, no automatic paid-request retry and cancellation.
- Live cloud requests/billing, real account/model availability and native Windows DPAPI integration were not tested in this environment.

Relationship language and TTS expressiveness are covered through request/state tests; live conversation quality, actual Irodori audio, and user VRM expressions still require testing on the target Windows PC.

OpenRouter requests are verified with mocked API responses. No user API key was available for a paid live request; model availability and actual output quality must be checked with the selected OpenRouter account.

Ctrl-wheel is covered with renderer/IPC tests; physical mouse and touchpad behavior requires confirmation on the target Windows PC.
