# Fitting the announcer into a codebase

The behavior comes from [`../assets/announcer.ts`](../assets/announcer.ts); everything else follows the codebase: folder, file and export names, comment style, formatting, lint rules, test style. Resolve each `ADAPT:` comment in the copied file, then delete it.

## Where it goes

- **From a dependency, when one ships it.** The inventory lists dependencies with an announcer first. M7KIT (`@bremmdev/m7kit`) exports this design from 0.64.0: `announce`, `clearAnnouncer`, `useAnnounce`. Upgrade to it when needed (decisions.md says when that is a proposal), import from it, and add no copy: the app then shares one queue with the library's own components. Its `ensureLiveRegion` is internal, so a modal of the app's own primes its regions through `useAnnounce(ref)` in a component inside it.
- **One module, one instance per page.** Put it with the shared utilities (`src/lib/`, `src/utils/`, a `ui` or `a11y` package in a monorepo), next to the framework binding. Every copy of the module has its own queue, so a page needs one copy: in a monorepo, one shared package; for a component library, a public export so apps use the library's copy.
- **A library exports** `announce`, `clearAnnouncer`, the binding and the types. `ensureLiveRegion` stays internal unless the library's consumers build their own modals.
- **The attribute** is `data-<project>-announcer`. Two copies on one page (a library and the app) then reuse each other's regions, though not each other's queue.
- **Language**: TypeScript as given; for JavaScript, strip the types. Another language (a server-rendered app with a little JS) gets the same file as a script module.

## Framework bindings

The binding primes the regions when the component mounts (inside its dialog, if it has one) and returns `announce` with `from` set to the component's element. React: [`../assets/use-announce.ts`](../assets/use-announce.ts). Others, in the same shape:

```ts
// Vue 3 composable
export function useAnnounce(el?: Ref<Element | null>) {
  onMounted(() => ensureLiveRegion(el?.value));
  return (message: string, options?: AnnounceOptions) => announce(message, { from: el?.value, ...options });
}
```

```ts
// Svelte action: <ul use:announcer> primes on mount; call announce(message, { from: node }) in handlers
export function announcer(node: Element) {
  ensureLiveRegion(node);
}
```

```ts
// Angular: a root service, so components inject it like LiveAnnouncer
@Injectable({ providedIn: "root" })
export class Announcer {
  announce(message: string, options?: AnnounceOptions) { announce(message, options); }
  clear(politeness?: Politeness) { clearAnnouncer(politeness); }
}
```

- **Solid, Preact, Qwik**: like React, with the framework's mount hook and refs.
- **Lit and other web components**: `closest()` stops at a shadow root, so a component inside a dialog's shadow tree can't find that dialog through `from`. Walk up with `getRootNode().host` in `getOwnDialog`, or pass the host element as `from`. Regions inside a shadow root work, but only if the dialog that contains them is the open modal.
- **No framework or server-rendered pages**: import the module (or expose `announce` on a global the templates use), and call `ensureLiveRegion()` on `DOMContentLoaded`.
- **Several roots, islands, micro-frontends**: one shared module (an import map, a shared chunk, or a global set by the host page); the function needs no provider, so every root can call it.

## Modals

For every modal in the inventory, settle two things:

1. **Is it detected?** Open it and check that the element around its content matches `dialog:modal` or the announcer's `MODAL_SELECTOR` (`[aria-modal="true"]` by default) and is visible. A modal that hides the page another way (a focus trap that sets `inert` or `aria-hidden` on the rest, a wrapper library's own attribute) needs `aria-modal="true"` on its dialog element (an accessibility fix in itself) or its selector added to `MODAL_SELECTOR`. React Aria's modals put `aria-hidden` on the page but leave out `[data-live-announcer]`; this announcer routes into the modal instead, so nothing extra is needed there.
2. **Is it primed?** Call `ensureLiveRegion(dialogElement)` when it opens (in the modal component's open handler or effect), so the pair exists before the first message. Without it, the first message waits 150 ms while a pair is created.

Then check where the wrapper sits inside it. The wrapper is absolutely positioned, so it takes no space, but it counts for structural selectors. `prepend` (the default) keeps the content's last child last, which suits styles that skip the last child (Tailwind v4 `space-*` and `divide-*`, `:not(:last-child)`). Styles that skip the first child (Tailwind v3 `space-*`, `* + *`, `:first-child` resets) want `append`. Look at the dialogs' styles and pick one. A component library that renders the dialog's children through a framework still works: frameworks leave unknown nodes alone, and if a re-render wipes the wrapper, the next message creates a new pair.

## Server rendering

- `announce()` and `ensureLiveRegion()` do nothing without a `document`, so they are safe to import on the server.
- To skip the priming wait for the first message on the page, the server may render an empty pair at the end of `<body>`: `<div data-<project>-announcer style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0"><div role="log" aria-live="polite" aria-relevant="additions"></div><div role="log" aria-live="assertive" aria-relevant="additions"></div></div>`. The announcer reuses a pair it finds. Under a strict Content Security Policy, use a class with the same styles instead of the `style` attribute.
- Hydration frameworks that own `<body>` may remove nodes they didn't render; then let the announcer create the pair on the client (the default).

## Content Security Policy

The announcer sets its styles through the CSSOM (`element.style`), which `style-src` without `'unsafe-inline'` allows. Keep it that way: `setAttribute("style", …)` or a `style` attribute in markup is blocked by such a policy.

## Text

Messages go through the project's translation function like any visible text. A component library takes them as props with English defaults (as it does for visible labels), so apps can translate them.

## Documentation

- Where the project documents its utilities or hooks (README, docs site, Storybook), document the announcer: when to use it, the options, polite by default, and how it behaves in dialogs.
- A changelog entry when the project keeps one.
- One line in the agent instructions (`AGENTS.md`, `CLAUDE.md`) when the project has them: components announce status messages through the shared announcer (name its file and binding), so future changes don't add new live regions. Put it outside blocks a tool generates (`<!-- intent-skills:start -->` … `end`), which get rewritten.
- Docs that describe the old regions ("one live region holds every outcome", a table of `role="alert"` elements) are rewritten to say how each message is heard now: announced, read by focus, or a kept region.
