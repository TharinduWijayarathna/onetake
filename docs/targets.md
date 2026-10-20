# Targets

Every action takes a **target**: the thing to click, type into, zoom on or highlight.

| Form | Example | Finds |
|---|---|---|
| `text=` | `'text=Save changes'` | The visible element whose text is exactly that (case and spacing don't matter). Must be unique. |
| `text*=` | `'text*=Invoice #'` | The shortest visible element whose text **contains** it. |
| `label=` | `'label=Email'` | A form field by its `<label>`, `aria-label`, `aria-labelledby`, `placeholder` or `name`. A label that *starts with* the text counts too. |
| `role=` | `'role=button[name="Save"]'` | An element by ARIA role and accessible name. `[name*="Sav"]` matches part of the name. |
| CSS | `'#save'`, `'[data-testid=save]'` | The first match of a CSS selector. |
| `css=` | `'css=div.card'` | Forces CSS (for a selector that starts like one of the forms above). |
| Element | `document.querySelector('#x')` | That element. |
| Function | `() => rows.at(-1)` | Whatever it returns, evaluated when the step runs. |

## Which one to use

1. **`role=` or `text=`** for buttons, links, tabs and menu items. They read like the
   UI, and they survive class-name changes.
2. **`label=`** for form fields.
3. **Test ids** (`[data-testid=…]`, `[dusk=…]`, `[data-cy=…]`) when the project has them.
4. **CSS** for structure (`#billing-form`, `.sidebar`), and for zoom and highlight targets.
5. **A function** when the element can only be found by logic: the last row, the newest
   card, the header that matches a pattern.

## Strict matching

`text=`, `label=` and `role=` must point at **one** visible element. If several match,
the step fails right away with a message that lists them and suggests a fix:

```
"text=Open" matches 3 elements: <button> "Open", <button> "Open", <a.nav> "Open"…
Make it unique: scope it ("#form >> text=Open"), pick one ("text=Open >> nth=0"),
or use text*= to take the shortest match.
```

This keeps the tour from quietly clicking the sidebar link when you meant the button. CSS
selectors aren't strict: they take the first match, like `querySelector`.

How `text=` picks its match:

1. An exact match on a clickable element or a heading (buttons, links, tabs, labels, menu
   items, `h1`–`h6`, table headers) wins.
2. Then an exact match on any element (the innermost one).
3. If nothing matches exactly, a clickable element that contains the text, then any element
   that does.

So `text=Save` finds `<button>Save</button>` even when a paragraph nearby says "Save time
with templates". Hidden elements never match.

Quotes are optional: `text="Save"` is the same as `text=Save`.

## Chaining: `>>`

`A >> B` looks for B inside each match of A:

```js
take.click('#invoice-42 >> text=Send')               // the Send button in that card
take.click('role=dialog >> role=button[name="Delete"]')
take.click('.datepicker.active >> text=15')
take.click('tbody tr >> nth=2 >> text=Edit')         // the third row's Edit link
```

`nth=N` keeps only the N-th match (from 0) of everything so far. `nth=-1` is the last one.

## Roles

`role=` knows the implicit roles of HTML elements:

| Role | Matches |
|---|---|
| `button` | `<button>`, `input[type=button/submit/reset]`, `[role=button]` |
| `link` | `a[href]`, `[role=link]` |
| `textbox` | text inputs, `<textarea>`, contenteditable, `[role=textbox]` |
| `checkbox` / `radio` | inputs of that type, `[role=checkbox]`, `[role=switch]`, `[role=radio]` |
| `combobox` | `<select>`, `[role=combobox]` |
| `heading` | `h1`–`h6`, `[role=heading]` |
| `dialog` | `<dialog>`, `[role=dialog]`, `[role=alertdialog]` |
| `tab`, `option`, `menuitem`, `listitem`, `row`, `cell`, `table`, `navigation`, `img` | the usual elements and roles |

Any other name matches `[role=that]`. The accessible name comes from `aria-label`,
`aria-labelledby`, a field's label, `alt`, `title`, or the element's text.

## Shadow DOM and iframes

- **Open shadow roots** are searched automatically by `text=`, `label=` and `role=`. A CSS
  selector looks inside shadow roots only when the page itself has no match.
- **Same-origin iframes**: chain through the iframe element:
  `'#payment-frame >> label=Card number'`. The cursor, clicks, typing and highlights all
  line up with the iframe's position on the page. Cross-origin iframes (Stripe, YouTube)
  can't be scripted. Show them, but don't plan steps inside them.

## Waiting

A step waits until its target exists, is visible, is enabled, has stopped moving, and isn't
covered by something else. The wait lasts up to `waitTimeout`, 8 s by default; pass
`{ timeout: 20000 }` on a step for a longer one. See
[Waiting and assertions](waiting-and-assertions.md).

## Finding targets from the console

The library exposes its target engine, which is handy while writing a tour:

```js
OneTake.query('role=button[name="Save"]')      // the element, null, or an "ambiguous" error
OneTake.resolveAll('text*=Invoice')            // every match
```

## Gotchas

- `label=` finds **form fields** only: inputs, selects, textareas, contenteditable and
  textbox/combobox roles. For a button with an `aria-label`, use
  `role=button[name="Close"]`.
- Text targets read what's *rendered*. CSS `text-transform: uppercase` doesn't matter
  (matching is case-insensitive), but text drawn with CSS `content:` or inside a `<canvas>`
  isn't there.
- Custom selects often keep their value in a hidden `<input>`. Target the visible trigger,
  then the option. See [Recipes](recipes.md#custom-dropdowns).
