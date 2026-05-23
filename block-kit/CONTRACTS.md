# Contracts

## Naming

Use a stable slash-delimited name:

```ts
const name = "acme/team-grid";
```

Do not rename a block after content has been saved. Add an alias migration if a rename is unavoidable.

## Attrs

Attrs must be JSON-safe:

- strings, numbers, booleans
- arrays
- plain objects
- null when intentionally supported

Do not store functions, class instances, DOM data, editor-only state, or unresolved promises.

## Editor Contract

Editors receive parsed attrs and return complete next attrs:

```ts
function Editor({ attrs, onChange, disabled }: BlockEditorProps<MyAttrs>) {
  return <input value={attrs.title} onChange={(event) => onChange({ ...attrs, title: event.target.value })} disabled={disabled} />;
}
```

## Renderer Contract

Renderers receive parsed attrs and must not mutate them:

```ts
function Renderer({ attrs }: BlockRendererProps<MyAttrs>) {
  return <section>{attrs.title}</section>;
}
```

## Layout Contract

Shared layout values are optional and controlled by the canvas:

- `tone`: `default`, `muted`, `accent`, `contrast`
- `padding`: `compact`, `normal`, `spacious`
- `container`: `content`, `wide`, `full`
- `align`: `default`, `wide`, `full`

