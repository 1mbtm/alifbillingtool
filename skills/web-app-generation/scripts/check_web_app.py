"""Checks a single-file web app for bugs that break it in Canvas.

Run from the conversation directory (where skills/ lives) AFTER writing the app
and inlining images:

  python3 skills/web-app-generation/scripts/check_web_app.py APP [--previous
  PREV]

APP is the .html, .jsx, .tsx or .ng.ts file. On an edit, PREV is a copy of the
version before the edit; element ids and button labels that PREV had and APP
lost are reported. Needs no browser or network. Exits 1 if any ERROR is found.

How it works:
  1. Parse the file. For HTML, _PageParser collects ids, inline <script>s, on*
     attributes, buttons/links and src/href URLs. For React/Angular, the whole
     file is treated as one script.
  2. Run each check below on what was collected. Checks are regex heuristics,
     so ERROR is used only when the bug is near certain; anything a valid app
     could trigger (computed ids, library globals, declarative frameworks) is a
     WARNING or skipped.
  3. Print the findings and exit 1 if any is an ERROR.

  ERROR   TRUNCATED          an .html file ends before closing <script>,
                             <style>, <body> or <html>
  ERROR   JS_SYNTAX          an inline <script> fails `node --check` (HTML only;
                             skipped when node is not installed)
  ERROR   MISSING_ELEMENT    getElementById('x') / querySelector('#x') but no
                             element ever gets id="x" (WARNING if some ids are
                             computed)
  ERROR   UNDEFINED_HANDLER  onclick="fn()" (any on* attribute, also inside
                             innerHTML strings) calls a function never defined
                             (WARNING if the page loads a <script src>)
  ERROR   MODULE_HANDLER     on* attribute calls a function that only exists
                             inside <script type="module">, so it isn't global
  ERROR   BLOCKED_DIALOG     alert()/confirm()/prompt(); the Canvas iframe
                             blocks them
  ERROR   LOCAL_FILE         a src/href/import or VM path of a local file Canvas
                             can't load (WARNING for fetch of a relative URL)
  ERROR   CSP_META           a Content-Security-Policy meta tag
  ERROR   REACT_ENTRY        .jsx/.tsx without a default export, or calling
                             ReactDOM.render()/createRoot()
  ERROR   ANGULAR_ENTRY      .ng.ts without selector 'app-root', or with
                             NgModule/bootstrapApplication
  WARNING DUPLICATE_ID       multiple elements share an id="x" that scripts use
  WARNING UNWIRED_CONTROL    a <button> or <a href="#"> with no handler and no
                             id, class or data-* attribute that a script uses
  WARNING DEAD_ANCHOR        <a href="#x"> but no element has id="x"
  WARNING EMPTY_HANDLER      a click/submit/change/input handler with an empty
                             body
  WARNING PLACEHOLDER        TODO:/FIXME: comment or `...` truncation in code
  WARNING REMOVED_FEATURE    with --previous: an element id or button label
                             from the previous version is gone
"""

from collections.abc import Sequence
import dataclasses
import html.parser
import os
import re
import shutil
import subprocess
import sys
import tempfile

# ---------------------------------------------------------------------------
# Constants & Compiled Regular Expressions
# ---------------------------------------------------------------------------

# <script type> values that hold JavaScript.
_JS_TYPES = frozenset(
    ("", "text/javascript", "application/javascript", "module")
)
# Keywords and browser globals an inline handler may call without the page
# defining them.
_BUILTIN_CALLS = frozenset("""
    if for while switch return function typeof new void await async catch
    alert confirm prompt print open close focus blur stop scroll scrollTo
    scrollBy setTimeout setInterval clearTimeout clearInterval
    requestAnimationFrame cancelAnimationFrame queueMicrotask structuredClone
    getComputedStyle matchMedia postMessage fetch atob btoa parseInt parseFloat
    isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI
    escape unescape Number String Boolean Array Object Date Math JSON Promise
    Symbol RegExp Error Map Set BigInt event $ jQuery
""".split())
# A script matching this handles clicks for many elements at once (event
# delegation), so controls without their own handler may still work.
_DELEGATION_RE = re.compile(
    r"querySelectorAll\(\s*['\"`][^'\"`]*\b(?:button|a)\b"
    r"|getElementsByTagName\(\s*['\"`](?:button|a)['\"`]"
    r"|closest\(\s*['\"`][^'\"`]*\b(?:button|a)\b"
    r"|\.tagName\b|\.matches\("
)
# on*="..." inside an HTML tag written in a JS string (innerHTML templates).
_JS_HANDLER_RE = re.compile(
    r"""<[a-zA-Z][^<>]*?\s(on[a-z]+)\s*=\s*\\?(["'])(.*?)\\?\2"""
)
# Attributes that wire a control without a script on the page: native
# popovers, Alpine, Vue, htmx and Bootstrap.
_DECLARATIVE_ATTRS = (
    "popovertarget",
    "commandfor",
    "@",
    ":",
    "x-",
    "v-",
    "hx-",
    "data-bs-",
    "data-toggle",
    "data-dismiss",
)
# <link rel> values whose missing file doesn't break the app.
_OPTIONAL_LINK_RELS = frozenset(
    ("icon", "shortcut", "apple-touch-icon", "manifest", "preload", "prefetch")
)
_EMPTY_HREFS = frozenset(
    ("", "#", "javascript:void(0)", "javascript:void(0);", "javascript:;")
)
_MAX_LISTED = 8

# Parsing & cleanup patterns.
_ANCHOR_REF_RE = re.compile(r"#[\w-]+")
_COMMENT_BLOCK_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_NON_NEWLINE_RE = re.compile(r"[^\n]")
_LINE_COMMENT_RE = re.compile(r"(?m)^\s*//.*$")
_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
_ID_ATTR_RE = re.compile(
    r"""(?:(?<![\w-])id\s*[=:]\s*\{?|\.id\s*=\s*"""
    r"""|setAttribute\(\s*["']id["']\s*,\s*)\\?(["'`])(.*?)\\?\1"""
)
_TEMPLATE_SPLIT_RE = re.compile(r"\$\{|\{|[\"'`]\s*\+")
_COMPUTED_ID_RE = re.compile(
    r"""(?<![\w-])id\s*=\s*(?:\{\s*[^\s"'`]|\$\{)"""
    r"""|\.id\s*=\s*[^\s"'`=]|setAttribute\(\s*["']id["']\s*,\s*[^\s"'`]"""
)
_ID_LOOKUP_RE = re.compile(
    r"""getElementById\(\s*(["'`])([^"'`$]+)\1\s*\)"""
    r"""|querySelector(?:All)?\(\s*(["'`])#([\w-]+)\3\s*\)"""
)
_TEMPLATE_EXPR_RE = re.compile(r"\$\{[^}]*\}")
_CALL_RE = re.compile(r"(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(")
_NODE_LINE_RE = re.compile(r":(\d+)\s*$")
_ERROR_MSG_RE = re.compile(r"^\w*Error\b")
_BLOCKED_DIALOG_RE = re.compile(
    r"(?:(?<![\w.$])|(?<=window\.))(alert|confirm|prompt)\(([^()]*\)\s*\{)?"
)
_LOCAL_IMPORT_RE = re.compile(
    r"""\bfrom\s+["'](\.{1,2}/[^"']+)["']|\bimport\s+["'](\.{1,2}/[^"']+)["']"""
    r"""|\brequire\(\s*["'](\.{1,2}/[^"']+)["']"""
)
_LOCAL_FETCH_RE = re.compile(
    r"""\bfetch\(\s*["'`]((?![a-zA-Z][\w+.-]*:|//)[^"'`]+)["'`]"""
)
_VM_PATH_RE = re.compile(
    r"""(["'`])((?:user_uploaded_files|artifacts)/[^"'`\s]+)\1"""
)
_EMPTY_HANDLER_RE = re.compile(
    r"""addEventListener\(\s*["'`](?:click|submit|change|input)["'`]\s*,\s*(?:async\s*)?"""
    r"""(?:\([^)]*\)|[\w$]+)\s*=>\s*\{\s*\}"""
    r"""|addEventListener\(\s*["'`](?:click|submit|change|input)["'`]\s*,\s*function\s*\w*\([^)]*\)\s*\{\s*\}"""
    r"""|\bon(?:Click|Submit|Change|Input)=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}"""
)
_PLACEHOLDER_RE = re.compile(
    r"(?://|/\*|<!--|\{/\*)\s*(?:TODO|FIXME)\s*[:(]"
    r"|(?m:^[ \t]*(?://|/\*|\{/\*)?[ \t]*(?:\.\.\.|…)[ \t]*(?:\*/\}?|\*/)?["
    r" \t]*$)"
)
_KEBAB_RE = re.compile(r"-(\w)")
_ROUTING_RE = re.compile(r"hashchange|location\.hash")
_REACT_DEFAULT_EXPORT_RE = re.compile(r"\bexport\s+default\b|\bas\s+default\b")
_REACT_DOM_RENDER_RE = re.compile(
    r"ReactDOM\.(?:render|createRoot)\s*\("
    r"""|\bfrom\s+["']react-dom/client["']"""
)
_ANGULAR_SELECTOR_RE = re.compile(r"""selector\s*:\s*["'`]app-root["'`]""")
_ANGULAR_BOOTSTRAP_RE = re.compile(r"@NgModule\b|\bbootstrapApplication\s*\(")
_BUTTON_TAG_RE = re.compile(r"<button\b[^>]*>(.*?)</button>", re.DOTALL)
_STRIP_TAGS_RE = re.compile(r"<[^>]+>|\{[^}]*\}")


@dataclasses.dataclass(frozen=True)
class Finding:
  severity: str  # "ERROR" or "WARNING"
  code: str
  message: str
  line: int = 0


@dataclasses.dataclass(frozen=True)
class Script:
  kind: str  # the type attribute, lowercased
  text: str
  line: int  # 1-based line of the first character of `text`


@dataclasses.dataclass(frozen=True)
class Control:
  tag: str
  attrs: dict[str, str]
  label: str
  in_form: bool
  line: int


@dataclasses.dataclass(frozen=True)
class Ids:
  """The ids an app can give to elements."""

  literal: set[str]  # id="x", el.id = 'x', setAttribute('id', 'x')
  prefixes: list[str]  # "item-" from id="item-${i}" or 'item-' + i
  unknown: bool  # some id is computed in a way regexes can't follow


# ---------------------------------------------------------------------------
# Step 1: parse
# ---------------------------------------------------------------------------


class _PageParser(html.parser.HTMLParser):
  """Collects ids, scripts, inline handlers, controls and links from HTML."""

  def __init__(self) -> None:
    super().__init__(convert_charrefs=True)
    self.ids: set[str] = set()
    self.duplicate_ids: list[tuple[str, int]] = []
    self._html_ids: set[str] = set()
    self._seen_duplicates: set[str] = set()
    self.scripts: list[Script] = []
    self.handlers: list[tuple[str, str, int]] = []  # (attr, code, line)
    self.controls: list[Control] = []
    self.refs: list[tuple[str, str, str, int]] = []  # (tag, attr, url, line)
    self.anchors: list[tuple[str, int]] = []  # (target id, line)
    self.csp_line = 0
    self.has_library = False  # loads a <script src> that may define globals
    self.unclosed_tags: set[str] = set()
    self._script: tuple[str, bool, int] | None = None
    self._script_text: list[str] = []
    self._control: tuple[str, dict[str, str], bool, int] | None = None
    self._label: list[str] = []
    self._forms = 0

  def handle_starttag(
      self, tag: str, attrs: list[tuple[str, str | None]]
  ) -> None:
    attributes = {key.lower(): value or "" for key, value in attrs}
    line = self.getpos()[0]
    if tag in ("html", "body", "script", "style"):
      self.unclosed_tags.add(tag)
    elem_id = attributes.get("id", "")
    if elem_id:
      if elem_id in self._html_ids and elem_id not in self._seen_duplicates:
        self.duplicate_ids.append((elem_id, line))
        self._seen_duplicates.add(elem_id)
      self._html_ids.add(elem_id)
      self.ids.add(elem_id)
    if tag == "a" and attributes.get("name"):
      self.ids.add(attributes["name"])
    for key, value in attributes.items():
      if key.startswith("on") and len(key) > 2:
        self.handlers.append((key, value, line))
    if (
        tag == "meta"
        and attributes.get("http-equiv", "").lower()
        == "content-security-policy"
    ):
      self.csp_line = line
    rel = set(attributes.get("rel", "").lower().split())
    if not (tag == "link" and rel & _OPTIONAL_LINK_RELS):
      for key in ("src", "href"):
        if key in attributes:
          self.refs.append((tag, key, attributes[key].strip(), line))
    href = attributes.get("href", "").strip()
    if tag == "a" and _ANCHOR_REF_RE.fullmatch(href):
      self.anchors.append((href[1:], line))
    if tag == "form":
      self._forms += 1
    if tag == "script":
      self.has_library |= bool(attributes.get("src"))
      start = self.get_starttag_text() or ""
      self._script = (
          attributes.get("type", "").lower(),
          "src" in attributes,
          line + start.count("\n"),
      )
      self._script_text = []
    elif self._control is None and (
        tag == "button" or (tag == "a" and href in _EMPTY_HREFS)
    ):
      self._control = (tag, attributes, self._forms > 0, line)
      self._label = []

  def handle_startendtag(
      self, tag: str, attrs: list[tuple[str, str | None]]
  ) -> None:
    self.handle_starttag(tag, attrs)
    self.unclosed_tags.discard(tag)
    if tag == "script":
      self.handle_endtag(tag)

  def handle_endtag(self, tag: str) -> None:
    self.unclosed_tags.discard(tag)
    if tag == "form":
      self._forms = max(0, self._forms - 1)
    if tag == "script" and self._script is not None:
      kind, has_src, line = self._script
      if not has_src:
        self.scripts.append(Script(kind, "".join(self._script_text), line))
      self._script = None
    elif self._control is not None and tag == self._control[0]:
      control_tag, attributes, in_form, line = self._control
      label = " ".join("".join(self._label).split())
      self.controls.append(
          Control(control_tag, attributes, label, in_form, line)
      )
      self._control = None

  def handle_data(self, data: str) -> None:
    if self._script is not None:
      self._script_text.append(data)
    elif self._control is not None:
      self._label.append(data)

  def close(self) -> None:
    super().close()
    if self._script is not None:
      kind, has_src, line = self._script
      if not has_src:
        self.scripts.append(Script(kind, "".join(self._script_text), line))
      self._script = None


def _line_of(text: str, pos: int, base: int = 1) -> int:
  return base + text.count("\n", 0, pos)


def _strip_comments(js: str) -> str:
  """Blanks out /* */ blocks and whole-line // comments, keeping line count."""
  js = _COMMENT_BLOCK_RE.sub(
      lambda match: _NON_NEWLINE_RE.sub(" ", match.group(0)), js
  )
  return _LINE_COMMENT_RE.sub("", js)


def _is_local(url: str) -> bool:
  """True for relative or absolute paths that point at files on the VM."""
  if not url or url.startswith(("#", "//")):
    return False
  if "${" in url or "{{" in url or url.startswith("{"):
    return False
  return not _SCHEME_RE.search(url)


def _find_ids(source: str, parsed: set[str]) -> Ids:
  """Finds the ids the app can create, statically or from scripts."""
  literal = set(parsed)
  prefixes: list[str] = []
  for match in _ID_ATTR_RE.finditer(source):
    value = match.group(2)
    prefix = _TEMPLATE_SPLIT_RE.split(value, maxsplit=1)[0]
    if prefix != value:
      prefixes.append(prefix)
    elif value:
      literal.add(value)
  unknown = bool(_COMPUTED_ID_RE.search(source))
  return Ids(literal, prefixes, unknown or "" in prefixes)


def _has_id(ids: Ids, ref: str) -> bool:
  return ref in ids.literal or any(ref.startswith(p) for p in ids.prefixes if p)


def _defined_in(name: str, js: str) -> bool:
  escaped_name = re.escape(name)
  return bool(
      re.search(
          rf"\bfunction\s*\*?\s*{escaped_name}\s*\("
          rf"|\b(?:var|let|const|class)\s+{escaped_name}\b"
          rf"|\b(?:window|globalThis|self)\.{escaped_name}\s*="
          rf"|(?m:^\s*{escaped_name}\s*=[^=])",
          js,
      )
  )


def _exported_to_window(name: str, js: str) -> bool:
  escaped_name = re.escape(name)
  return bool(
      re.search(
          rf"\b(?:window|globalThis|self)\.{escaped_name}\s*="
          rf"|\b(?:window|globalThis|self)\[\s*['\"]{escaped_name}['\"]\s*\]\s*="
          rf"|Object\.assign\(\s*(?:window|globalThis)\s*,\s*\{{[^}}]*\b{escaped_name}\b",
          js,
      )
  )


# ---------------------------------------------------------------------------
# Step 2: checks. Each returns a list of Finding.
# ---------------------------------------------------------------------------


def _add(
    findings: list[Finding], severity: str, code: str, msg: str, line: int = 0
) -> None:
  findings.append(Finding(severity, code, msg, line))


def _missing_elements(js: str, base_line: int, ids: Ids) -> list[Finding]:
  """MISSING_ELEMENT: getElementById/querySelector('#x') of an id never set."""
  findings: list[Finding] = []
  for match in _ID_LOOKUP_RE.finditer(js):
    ref = match.group(2) or match.group(4)
    if not _has_id(ids, ref):
      # Unsure when some ids are computed; the element may exist.
      _add(
          findings,
          "WARNING" if ids.unknown else "ERROR",
          "MISSING_ELEMENT",
          f'code looks up #{ref} but no element has id="{ref}".',
          _line_of(js, match.start(), base_line),
      )
  return findings


def _check_handlers(
    handlers: Sequence[tuple[str, str, int]],
    classic: str,
    module: str,
    has_library: bool,
) -> list[Finding]:
  """UNDEFINED_HANDLER / MODULE_HANDLER: on* calls to non-global functions."""
  findings: list[Finding] = []
  reported: set[str] = set()
  for attr, code, line in handlers:
    code = _TEMPLATE_EXPR_RE.sub("0", code)  # ${...} is evaluated earlier
    shown = f'{attr}="{code.strip()[:60]}"'
    for name in _CALL_RE.findall(code):
      if name in _BUILTIN_CALLS or name in reported:
        continue
      if _defined_in(name, classic):
        continue
      reported.add(name)
      if _defined_in(name, module):
        if not _exported_to_window(name, module):
          _add(
              findings,
              "ERROR",
              "MODULE_HANDLER",
              f"{shown} calls {name}(), which is defined inside <script"
              f' type="module"> and isn\'t global. Add `window.{name} ='
              f" {name};` or use addEventListener.",
              line,
          )
      elif has_library:
        _add(
            findings,
            "WARNING",
            "UNDEFINED_HANDLER",
            f"{shown} calls {name}(), which this page never defines. Fine"
            " if a library loaded with <script src> defines it.",
            line,
        )
      else:
        _add(
            findings,
            "ERROR",
            "UNDEFINED_HANDLER",
            f"{shown} calls {name}(), which is never defined.",
            line,
        )
  return findings


def _node_binary() -> str | None:
  return shutil.which("node") or shutil.which("nodejs")


def parse_node_error(stderr: str, base_line: int) -> tuple[int, str]:
  """Maps `node --check` output to (line in the app file, error message)."""
  lines = stderr.strip().splitlines()
  line = 0
  match = _NODE_LINE_RE.search(lines[0]) if lines else None
  if match:
    line = base_line + int(match.group(1)) - 1
  message = next(
      (text.strip() for text in lines if _ERROR_MSG_RE.search(text)),
      lines[-1] if lines else "syntax error",
  )
  return line, message


def _check_syntax(scripts: Sequence[Script]) -> list[Finding]:
  """JS_SYNTAX: `node --check` on each inline script; no-op without node."""
  node = _node_binary()
  if not node:
    return []
  findings: list[Finding] = []
  with tempfile.TemporaryDirectory() as tmp:
    for idx, script in enumerate(scripts):
      if not script.text.strip():
        continue
      ext = "mjs" if script.kind == "module" else "js"
      path = os.path.join(tmp, f"s{idx}.{ext}")
      with open(path, "w", encoding="utf-8") as f:
        f.write(script.text)
      try:
        result = subprocess.run(
            [node, "--check", path],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
      except (OSError, subprocess.TimeoutExpired):
        continue
      if result.returncode:
        line, message = parse_node_error(result.stderr, script.line)
        _add(findings, "ERROR", "JS_SYNTAX", message, line)
  return findings


def _common_js_checks(js: str, base_line: int) -> list[Finding]:
  """BLOCKED_DIALOG, LOCAL_FILE, EMPTY_HANDLER, PLACEHOLDER for any JS/TS."""
  findings: list[Finding] = []
  code = _strip_comments(js)

  # BLOCKED_DIALOG. Skip names the app defines itself and `prompt(x) {`
  # method definitions.
  user_defined = {
      name
      for name in ("alert", "confirm", "prompt")
      if re.search(
          rf"\bfunction\s+{name}\s*\(|\b(?:const|let|var)\s+{name}\b", code
      )
  }
  for match in _BLOCKED_DIALOG_RE.finditer(code):
    dialog = match.group(1)
    if dialog not in user_defined and not match.group(2):
      _add(
          findings,
          "ERROR",
          "BLOCKED_DIALOG",
          f"{dialog}() is blocked in Canvas; use an in-page modal or toast.",
          _line_of(code, match.start(), base_line),
      )

  # LOCAL_FILE: relative imports and un-inlined VM paths are fatal; a relative
  # fetch may have a fallback, so it only warns.
  for match in _LOCAL_IMPORT_RE.finditer(code):
    target = next(g for g in match.groups() if g)
    _add(
        findings,
        "ERROR",
        "LOCAL_FILE",
        f"'{target}' is a local file; Canvas can't load it. Put the code in"
        " this file.",
        _line_of(code, match.start(), base_line),
    )
  for match in _VM_PATH_RE.finditer(code):
    _add(
        findings,
        "ERROR",
        "LOCAL_FILE",
        f"'{match.group(2)[:80]}' is a VM file path Canvas can't load; inline"
        " it as a base64 data URI.",
        _line_of(code, match.start(), base_line),
    )
  for match in _LOCAL_FETCH_RE.finditer(code):
    _add(
        findings,
        "WARNING",
        "LOCAL_FILE",
        f"fetch('{match.group(1)}') fails in Canvas, which has no server. Put"
        " the data in this file, or make sure the app still works when the"
        " fetch fails.",
        _line_of(code, match.start(), base_line),
    )

  # EMPTY_HANDLER, only for events a user triggers on purpose.
  for match in _EMPTY_HANDLER_RE.finditer(code):
    _add(
        findings,
        "WARNING",
        "EMPTY_HANDLER",
        "event handler does nothing.",
        _line_of(code, match.start(), base_line),
    )

  # PLACEHOLDER: `TODO:` comments and lines that are only `...`.
  for match in _PLACEHOLDER_RE.finditer(js):
    _add(
        findings,
        "WARNING",
        "PLACEHOLDER",
        "placeholder or truncated code; write the full implementation.",
        _line_of(js, match.start(), base_line),
    )
  return findings


def _check_controls(controls: Sequence[Control], js: str) -> list[Finding]:
  """UNWIRED_CONTROL: buttons and href="#" links no script can reach."""
  if _DELEGATION_RE.search(js):
    return []
  findings: list[Finding] = []
  for control in controls:
    attrs = control.attrs
    if "disabled" in attrs or "form" in attrs:
      continue
    if any(
        key.startswith(("on", *_DECLARATIVE_ATTRS)) and val
        for key, val in attrs.items()
    ):
      continue
    if (
        control.tag == "button"
        and control.in_form
        and attrs.get("type", "submit") != "button"
    ):
      continue  # submit or reset
    # Wired if a script mentions its id, a class, or a data-* attribute.
    data_keys = [k for k in attrs if k.startswith("data-")]
    names = [attrs.get("id", ""), *attrs.get("class", "").split(), *data_keys]
    names += [
        "dataset."
        + _KEBAB_RE.sub(lambda match: match.group(1).upper(), key[5:])
        for key in data_keys
    ]
    if any(
        name and re.search(rf"(?<![\w-]){re.escape(name)}(?![\w-])", js)
        for name in names
    ):
      continue
    label = (
        control.label or attrs.get("aria-label", "") or attrs.get("title", "")
    )
    what = f"<{control.tag}>" + (f" '{label[:40]}'" if label else "")
    _add(
        findings,
        "WARNING",
        "UNWIRED_CONTROL",
        f"{what} has no click handler and no script uses its id, class or"
        " data-* attribute; make it do something or remove it.",
        control.line,
    )
  return findings


def _features(ids: Ids, labels: Sequence[str]) -> dict[str, set[str]]:
  """What --previous compares: element ids and short button labels."""
  return {
      "element id": {i for i in ids.literal if i},
      "button": {b for b in labels if 0 < len(b) <= 40},
  }


def removed_features(
    previous: dict[str, set[str]], current: dict[str, set[str]]
) -> list[Finding]:
  """REMOVED_FEATURE: ids and button labels the previous version had."""
  findings: list[Finding] = []
  for kind, before in previous.items():
    gone = sorted(before - current.get(kind, set()))
    if not gone:
      continue
    shown = ", ".join(f"'{g}'" for g in gone[:_MAX_LISTED])
    if len(gone) > _MAX_LISTED:
      shown += f" and {len(gone) - _MAX_LISTED} more"
    _add(
        findings,
        "WARNING",
        "REMOVED_FEATURE",
        f"{kind} {shown} existed before this edit and is gone. Restore it"
        " unless the user asked to remove it.",
    )
  return findings


# ---------------------------------------------------------------------------
# Per-format entry points
# ---------------------------------------------------------------------------


def check_html(source: str) -> tuple[list[Finding], dict[str, set[str]]]:
  """Checks an .html app. Returns findings and its feature inventory."""
  parser = _PageParser()
  parser.feed(source)
  parser.close()
  scripts = [s for s in parser.scripts if s.kind in _JS_TYPES]
  classic = "\n".join(s.text for s in scripts if s.kind != "module")
  module = "\n".join(s.text for s in scripts if s.kind == "module")
  all_js = classic + "\n" + module
  ids = _find_ids(source, parser.ids)
  findings: list[Finding] = []

  # Script checks.
  findings += _check_syntax(scripts)
  handlers = list(parser.handlers)
  for script in scripts:
    findings += _common_js_checks(script.text, script.line)
    findings += _missing_elements(script.text, script.line, ids)
    handlers += [  # onclick="..." written inside innerHTML strings
        (
            match.group(1),
            match.group(3),
            _line_of(script.text, match.start(), script.line),
        )
        for match in _JS_HANDLER_RE.finditer(script.text)
    ]
  for _, code, line in parser.handlers:
    for finding in _common_js_checks(code, line):
      if finding.code != "PLACEHOLDER":
        findings.append(dataclasses.replace(finding, line=line))
  findings += _check_handlers(handlers, classic, module, parser.has_library)

  # Markup checks.
  if parser.unclosed_tags:
    missing = ", ".join(
        f"</{t}>"
        for t in ("script", "style", "body", "html")
        if t in parser.unclosed_tags
    )
    _add(
        findings,
        "ERROR",
        "TRUNCATED",
        f"file ends before closing {missing}; write the complete file.",
        source.count("\n") + 1,
    )
  for elem_id, line in parser.duplicate_ids:
    if re.search(rf"(?<![\w-]){re.escape(elem_id)}(?![\w-])", all_js):
      _add(
          findings,
          "WARNING",
          "DUPLICATE_ID",
          f'id="{elem_id}" is used on multiple elements; getElementById only'
          " finds the first.",
          line,
      )
  for tag, attr, url, line in parser.refs:
    if _is_local(url) and not (tag == "a" and url in _EMPTY_HREFS):
      _add(
          findings,
          "ERROR",
          "LOCAL_FILE",
          f'<{tag} {attr}="{url[:80]}"> points at a local file Canvas'
          " can't load. Inline it, or make it an in-page view.",
          line,
      )
  if parser.csp_line:
    _add(
        findings,
        "ERROR",
        "CSP_META",
        "remove the Content-Security-Policy meta tag; it breaks Canvas.",
        parser.csp_line,
    )
  routed = _ROUTING_RE.search(all_js)
  if not (ids.unknown or routed or _DELEGATION_RE.search(all_js)):
    for target, line in parser.anchors:
      if target != "top" and not _has_id(ids, target):
        _add(
            findings,
            "WARNING",
            "DEAD_ANCHOR",
            f'<a href="#{target}"> but no element has id="{target}".',
            line,
        )
  findings += _check_controls(parser.controls, all_js)

  labels = [c.label for c in parser.controls if c.tag == "button"]
  return findings, _features(ids, labels)


def check_component(
    source: str, ext: str
) -> tuple[list[Finding], dict[str, set[str]]]:
  """Checks a .jsx/.tsx (React) or .ng.ts (Angular) app."""
  findings = _common_js_checks(source, 1)
  code = _strip_comments(source)
  if ext in (".jsx", ".tsx"):
    if not _REACT_DEFAULT_EXPORT_RE.search(code):
      _add(
          findings,
          "ERROR",
          "REACT_ENTRY",
          "add `export default function App()`; Canvas renders the default"
          " export.",
          1,
      )
    match = _REACT_DOM_RENDER_RE.search(code)
    if match:
      _add(
          findings,
          "ERROR",
          "REACT_ENTRY",
          "don't call ReactDOM.render()/createRoot(); Canvas mounts the"
          " default export.",
          _line_of(code, match.start()),
      )
  else:
    if not _ANGULAR_SELECTOR_RE.search(code):
      _add(
          findings,
          "ERROR",
          "ANGULAR_ENTRY",
          "the component needs selector: 'app-root' and class App.",
          1,
      )
    match = _ANGULAR_BOOTSTRAP_RE.search(code)
    if match:
      _add(
          findings,
          "ERROR",
          "ANGULAR_ENTRY",
          "don't use NgModule or bootstrapApplication; Canvas bootstraps the"
          " App component.",
          _line_of(code, match.start()),
      )
  ids = _find_ids(source, set())
  findings += _missing_elements(code, 1, ids)
  labels = []
  for match in _BUTTON_TAG_RE.finditer(source):
    text = _STRIP_TAGS_RE.sub(" ", match.group(1))
    labels.append(" ".join(text.split()))
  return findings, _features(ids, labels)


def _extension(path: str) -> str:
  lower = path.lower()
  if lower.endswith(".ng.ts"):
    return ".ng.ts"
  return os.path.splitext(lower)[1]


def check_file(
    path: str, ext: str | None = None
) -> tuple[list[Finding], dict[str, set[str]]]:
  """Checks the app at `path`, parsed as `ext` (default: from the name)."""
  with open(path, encoding="utf-8", errors="replace") as f:
    source = f.read()
  ext = ext or _extension(path)
  if ext in (".html", ".htm"):
    return check_html(source)
  if ext in (".jsx", ".tsx", ".ng.ts"):
    return check_component(source, ext)
  return [
      Finding(
          "ERROR",
          "FORMAT",
          f"{ext or 'this file'} doesn't preview in Canvas; use .html,"
          " .jsx, .tsx or .ng.ts.",
      )
  ], {}


# ---------------------------------------------------------------------------
# Step 3: report
# ---------------------------------------------------------------------------


def main(argv: Sequence[str]) -> None:
  args = list(argv[1:])
  previous = None
  missing_value = False
  if "--previous" in args:
    idx = args.index("--previous")
    missing_value = idx + 1 >= len(args)
    previous = None if missing_value else args[idx + 1]
    del args[idx : idx + 2]
  if len(args) != 1 or missing_value:
    print(
        "Usage (run from the conversation directory): python3"
        " skills/web-app-generation/scripts/check_web_app.py <app file>"
        " [--previous <copy of the app before this edit>]"
    )
    sys.exit(2)

  findings, features = check_file(args[0])
  if previous is not None:
    if os.path.exists(previous):
      # The copy may be named e.g. app.html.prev; parse it like the app.
      _, before = check_file(previous, _extension(args[0]))
      findings += removed_features(before, features)
    else:
      _add(
          findings,
          "WARNING",
          "NO_PREVIOUS",
          f"{previous} not found, so removed features weren't checked.",
      )

  findings = list(dict.fromkeys(findings))  # drop duplicates
  findings.sort(key=lambda f: (f.severity != "ERROR", f.line))
  for finding in findings:
    where = f"line {finding.line}: " if finding.line else ""
    print(f"{finding.severity:<7} {finding.code:<17} {where}{finding.message}")
  errors = sum(finding.severity == "ERROR" for finding in findings)
  if not findings:
    print("OK: no issues found.")
  else:
    print(
        f"{errors} error(s), {len(findings) - errors} warning(s). Fix each"
        " finding and re-run; skip one only if it's clearly wrong for this"
        " app."
    )
  if errors:
    sys.exit(1)


if __name__ == "__main__":
  main(sys.argv)
