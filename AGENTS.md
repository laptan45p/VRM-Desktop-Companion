# Development and release workflow

- Inspect the latest remote `main` before starting or resuming work. Preserve unfinished local changes and integrate concurrent changes; never replace newer source with an older workspace copy.
- Commit and push every completed functional fix to GitHub before delivering it, including small fixes and trial builds. Do not distribute fixes that exist only in a local ZIP or another conversation.
- Recheck the remote head immediately before updating `main`. Use a normal fast-forward or an expected-SHA lease; on a mismatch, inspect and integrate the newer commit before retrying.
- Build distributed ZIPs from the pushed commit. Keep the existing `Update.zip` plus `apply_update.bat` workflow. Verify that the release branch points to the intended commit and all assets are published before reporting completion.
- Include meaningful regression tests for changed behavior. When touching shared files, preserve existing LAN TTS voice lookup, llama-server template handling, character settings and saved memory.
- Use fictional names and paths in public tests and documentation. Do not publish local paths, filenames or conversation excerpts taken from user screenshots.
- Report which changes reached GitHub and any remaining uncommitted or unpublished work accurately.
