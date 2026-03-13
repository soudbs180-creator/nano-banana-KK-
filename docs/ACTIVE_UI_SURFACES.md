# Active UI Surfaces

## Source Of Truth

- Mobile UI imports should come from `src/components/mobile/index.ts`.
- Workspace shell and workspace panels should come from `src/components/workspace/index.ts`.
- Settings shared layout and visual primitives should come from `src/components/settings/SettingsScaffold.tsx`.

## Migration Notes

- `src/components/MobileChatFeed.tsx` is still the current implementation, but callers should use `src/components/mobile/MobileChatFeed.tsx` or the mobile barrel export.
- `src/App.tsx` is the composition root for mobile, workspace, and global modal surfaces.
- New workspace or mobile UI should not bypass the barrel exports unless there is a deliberate migration plan.

## Safety Rules

- Shared buttons should default to `type="button"` unless they are meant to submit a form.
- Long labels, counts, and IDs must use truncation or controlled wrapping in shared scaffold components before being rendered in feature pages.
- New UI work should extend scaffold or workspace primitives before introducing one-off layout styles.
