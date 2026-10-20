// Type definitions for OneTake 2.x
// Project: https://github.com/TharinduWijayarathna/one-take
// Docs: docs/api.md
//
// In a tour script run by the recorder, `take` is a ready OneTake instance. For editor
// hints in a plain .js tour, add at the top:
//   /// <reference types="onetake" />
//   /** @type {import('onetake').OneTake} */ var take;   // (or use the global below)

export as namespace OneTake;
export = OneTake;

/**
 * Where to act. A string target is one of:
 *   '#save', '.card:nth-child(2)'          CSS (first match)
 *   'text=Save'                            visible text, exact, must be unique
 *   'text*=Save'                           text contains (shortest match wins)
 *   'label=Email'                          a form field by its label, aria-label, placeholder or name
 *   'role=button[name="Save"]'             ARIA role + accessible name ([name*="Sav"] = contains)
 *   'css=...'                              force CSS
 *   '#dialog >> text=Save'                 chain: search inside the previous match (iframes too)
 *   '.row >> nth=2'                        pick the third match
 * Or an Element, or a function returning one.
 */
type Target = string | Element | (() => Element | null | undefined);

interface Point { x: number; y: number }

declare namespace OneTake {
  type TargetLike = Target;

  interface Options {
    /** Global speed multiplier (2 = twice as fast). Default 1. */
    speed?: number;
    /** ms to wait for an element to appear and become actionable. Default 8000. */
    waitTimeout?: number;
    /** Cursor start position in viewport px. */
    startPosition?: Point | null;
    zIndex?: number;
    /** Skip the first N steps (the recorder sets this after a page load). */
    resumeFrom?: number;
    onStep?: ((name: string, args: IArguments, info: StepInfo) => void) | null;
    onError?: ((error: Error, name: string, info: StepInfo) => void) | null;

    cursorSize?: number;
    cursorColor?: string;
    cursorOutline?: string;
    /** Hide the real mouse pointer while the tour runs. Default true. */
    hideNativeCursor?: boolean;
    /** ms without movement before the cursor fades out (0 = never). */
    cursorIdle?: number;
    /** Slight motion blur on fast moves. Default true. */
    cursorBlur?: boolean;
    /** Make CSS :hover/:active react to the cursor (synthetic mode). Default true. */
    emulateHover?: boolean;
    /** Occasionally overshoot long moves and correct. Default true. */
    overshoot?: boolean;
    /** 'smooth' (frame-exact, default) | 'native' | 'instant'. */
    scrollBehavior?: 'smooth' | 'native' | 'instant';

    /** Wait for network and DOM to go quiet after actions. Default true. */
    settle?: boolean;
    /** ms of quiet that counts as settled. Default 200. */
    settleQuiet?: number;
    /** Give up waiting to settle after this many ms. Default 4000. */
    settleTimeout?: number;

    clickColor?: string;
    /** Use trusted mouse/keyboard from the recorder when available. Default true. */
    realInput?: boolean;
    /** Average ms per typed character. Default 75. */
    typingDelay?: number;
    /** 0..1 randomness of typing rhythm. Default 0.55. */
    typingVariance?: number;
    /** Probability per letter of a typo that gets corrected. Default 0. */
    typos?: number;
    /** Soft click/key sounds in the page (live demos). The recorder adds its own with --sound. */
    sound?: boolean;
    highlightColor?: string;

    /** Default scale for zoom(). Default 2. */
    zoomScale?: number;
    /** Camera spring stiffness. Default 6.5. */
    zoomSmoothness?: number;
    /** Zoom toward every click automatically. */
    autoZoom?: boolean | { scale?: number; hold?: number };
    [key: string]: unknown;
  }

  interface StepInfo { index: number; name: string; site: string | null; arg: string }

  interface ActionOptions {
    /** ms to wait for the target. */
    timeout?: number;
    /** Skip the actionability checks (visible, enabled, stable, not covered). */
    force?: boolean;
    /** Wait for the app to settle afterwards (default: the settle option). */
    settle?: boolean;
  }

  interface MoveOptions {
    /** Movement duration in ms (default: from distance). */
    duration?: number;
    speed?: number;
    curve?: number;
    overshoot?: boolean;
    /** Where inside the element, as fractions: { x: 0.5, y: 0.5 } is the centre. */
    position?: Point;
    timeout?: number;
  }

  interface ClickOptions extends ActionOptions, MoveOptions {
    double?: boolean;
    button?: 'left' | 'right' | 'middle';
  }

  interface TypeOptions extends ActionOptions {
    /** Click the field first. Default true. */
    click?: boolean;
    /** Clear the field first. Default true. */
    clear?: boolean;
    /** Press Enter afterwards. */
    enter?: boolean;
    /** ms per character for this field. */
    delay?: number;
    typos?: number;
  }

  interface HighlightOptions {
    shape?: 'circle' | 'box' | 'underline' | 'arrow' | 'spotlight' | 'pulse' | string;
    color?: string;
    padding?: number;
    strokeWidth?: number;
    /** ms to draw the shape. Default 750. */
    drawDuration?: number;
    /** ms before it is removed (0 = until clearHighlights()). Default 2600. */
    duration?: number;
    /** Wait for the highlight to be removed before the next step. Default true. */
    block?: boolean;
    /** With block: false, ms to wait after drawing. */
    hold?: number;
    label?: string | null;
    labelColor?: string;
    labelPosition?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
    from?: string;
    glow?: boolean;
    timeout?: number;
  }

  interface ZoomOptions {
    /** Zoom factor (default from the element size, at most zoomScale). */
    scale?: number;
    /** Space around the element in px. */
    padding?: number;
    /** Keep following the cursor while zoomed. */
    follow?: boolean;
    /** Wait for the timed zoom to end before the next step. */
    block?: boolean;
    smoothness?: number;
    timeout?: number;
  }

  interface CaptionOptions {
    /** Auto-hide after ms. */
    duration?: number;
    position?: 'bottom' | 'top';
    /** ms to wait after showing it. Default 350. */
    wait?: number;
  }

  interface ExpectOptions {
    /** Text contains (or matches). */
    text?: string | RegExp;
    /** Input value equals (or matches). */
    value?: string | RegExp;
    /** false = hidden or gone. */
    visible?: boolean;
    /** Number of visible matches. */
    count?: number;
    checked?: boolean;
    enabled?: boolean;
    timeout?: number;
  }

  interface ScrollOptions { block?: 'center' | 'start' | 'end' | 'nearest'; duration?: number; container?: Target; force?: boolean }
  interface ScrollUntilOptions { container?: Target; step?: number; maxScrolls?: number; duration?: number }
  interface DragOptions extends ActionOptions { /** Drop point inside the target, as fractions. */ to?: Point }
  interface UploadOptions extends ActionOptions { /** Drop onto a drop zone instead of setting a file input. */ drop?: boolean }
  /** A path (relative to the tour script with the recorder; a URL on live pages), or inline content. */
  type FileSpec = string | { name: string; content: string | BlobPart; type?: string };

  interface OneTake extends PromiseLike<void> {
    readonly opts: Required<Options>;
    /** Cursor position in viewport px. */
    readonly pos: Point;

    /* movement */
    moveTo(target: Target | Point, o?: MoveOptions): this;
    hover(target: Target, o?: MoveOptions & { duration?: number }): this;
    showCursor(): this;
    hideCursor(): this;

    /* actions */
    click(target: Target, o?: ClickOptions): this;
    doubleClick(target: Target, o?: ClickOptions): this;
    check(target: Target, state?: boolean, o?: ClickOptions): this;
    check(target: Target, o?: ClickOptions): this;
    uncheck(target: Target, o?: ClickOptions): this;
    type(target: Target, text: string, o?: TypeOptions): this;
    clear(target: Target, o?: ActionOptions): this;
    /** Press a key on the focused element: 'Enter', 'Tab', 'Escape', 'ControlOrMeta+K' … */
    press(key: string, o?: { times?: number; settle?: boolean }): this;
    select(target: Target, valueOrText: string, o?: ActionOptions): this;
    drag(source: Target, target: Target, o?: DragOptions): this;
    upload(target: Target, files: FileSpec | FileSpec[], o?: UploadOptions): this;

    /* scrolling */
    scrollTo(target: Target | number, o?: ScrollOptions): this;
    scrollBy(dy: number, o?: ScrollOptions): this;
    scrollUntil(target: Target, o?: ScrollUntilOptions): this;

    /* waiting and assertions */
    wait(ms: number): this;
    waitFor(target: Target, o?: { timeout?: number }): this;
    expect(target: Target, o?: ExpectOptions): this;
    expectUrl(pattern: string | RegExp, o?: { timeout?: number }): this;
    waitForUrl(pattern: string | RegExp, o?: { timeout?: number }): this;

    /* storytelling */
    highlight(target: Target, o?: HighlightOptions): this;
    circle(target: Target, o?: HighlightOptions): this;
    box(target: Target, o?: HighlightOptions): this;
    underline(target: Target, o?: HighlightOptions): this;
    arrow(target: Target, o?: HighlightOptions): this;
    spotlight(target: Target, o?: HighlightOptions): this;
    pulse(target: Target, o?: HighlightOptions): this;
    clearHighlights(): this;
    caption(text: string, o?: CaptionOptions): this;
    hideCaption(): this;
    /** zoom(target, seconds) · zoom(target) until zoomOut() · zoom(seconds) around the cursor */
    zoom(target: Target, seconds?: number, o?: ZoomOptions): this;
    zoom(seconds: number, o?: ZoomOptions): this;
    zoomOut(): this;
    /** Start a chapter (video chapter markers and a YouTube chapter list). */
    chapter(title: string): this;
    /** Use this moment as the video's thumbnail. */
    thumbnail(): this;

    /* control */
    run(fn: (take: this) => unknown): this;
    set(opts: Options): this;
    /** Inline a group of steps: take.use(addContact, 'Priya'). */
    use<A extends unknown[]>(fn: (take: this, ...args: A) => void, ...args: A): this;
    stop(): this;
    destroy(): void;
    then<R1 = void, R2 = never>(onfulfilled?: ((value: void) => R1 | PromiseLike<R1>) | null, onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null): Promise<R1 | R2>;
    catch<R = never>(onrejected?: ((reason: any) => R | PromiseLike<R>) | null): Promise<void | R>;

    /** Steps added with OneTake.define(). */
    [custom: string]: any;
  }

  /** onetake.config.js — every key can also be given as a command-line flag (docs/recording.md). */
  interface Config {
    url?: string;
    tour?: string | string[];
    include?: string | string[];
    viewport?: { width: number; height: number };
    scale?: number;
    fps?: number;
    mode?: 'frames' | 'realtime';
    speed?: number;
    seed?: number;
    /** The app's clock, e.g. '2026-11-01T09:00'. */
    now?: string | null;
    storage?: string | null;
    out?: string;
    name?: string | null;
    lead?: number;
    tail?: number;
    max?: number;
    captureFormat?: 'jpeg' | 'png';
    crf?: number;
    headed?: boolean;
    realInput?: boolean;
    /** OneTake options for the page. */
    options?: Options;
    frame?: boolean | string | { background?: string; padding?: number; radius?: number; shadow?: boolean; chrome?: 'mac' | 'none'; title?: string };
    sound?: boolean;
    music?: string | null;
    musicVolume?: number;
    subtitles?: boolean;
    chapters?: boolean;
    thumbnail?: boolean;
    formats?: Array<'mp4' | 'webm' | 'gif'>;
    aspect?: string | null;
    intro?: string | Card | null;
    outro?: string | Card | null;
    timeline?: boolean;
  }
  interface Card { title: string; subtitle?: string; duration?: number; logo?: string; background?: string; color?: string }

  interface Static {
    new (options?: Options): OneTake;
    (options?: Options): OneTake;
    defaults: Options;
    /** Add a chainable step made of other steps. */
    define(name: string, fn: (take: OneTake, ...args: any[]) => void): Static;
    /** Find one element for a target (strict for text/label/role). Throws if ambiguous. */
    query(target: Target): Element | null;
    resolveAll(target: Target): Element[];
    findByText(text: string, root?: ParentNode): Element | null;
    readonly version: string;
    findByLabel(text: string, root?: ParentNode): Element | null;
    /** Recorder hook: the part of the page on screen (keeps captions inside it). */
    view(v: { x: number; y: number; width: number; height: number } | null): void;
    shapes: Record<string, unknown>;
    feature(def: Record<string, unknown>): void;
  }
}

declare const OneTake: OneTake.Static;

declare global {
  /** The ready instance inside a recorder tour script. */
  // eslint-disable-next-line no-var
  var take: OneTake.OneTake;
  interface Window { OneTake: OneTake.Static }
}
