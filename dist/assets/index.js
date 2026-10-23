(function() {
  const __modules = {};
  const __cache = {};
  __modules["react"] = function(module, exports, __req) {
'use strict';

const Fragment = Symbol.for('react.fragment');

let currentInstance = null;
let currentHookIndex = 0;

function createElement(type, props, ...children) {
  const normalizedProps = Object.assign({}, props || {});
  const flatChildren = [];
  const flatten = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (Array.isArray(c)) {
        flatten(c);
      } else if (c !== null && c !== undefined && c !== false && c !== true) {
        flatChildren.push(typeof c === 'object' ? c : String(c));
      }
    }
  };
  flatten(children);
  if (flatChildren.length > 0) {
    normalizedProps.children = flatChildren;
  } else if (normalizedProps.children !== undefined) {
    const pChildren = Array.isArray(normalizedProps.children)
      ? normalizedProps.children
      : [normalizedProps.children];
    flatChildren.length = 0;
    flatten(pChildren);
    normalizedProps.children = flatChildren;
  } else {
    normalizedProps.children = [];
  }
  const key = normalizedProps.key !== undefined ? String(normalizedProps.key) : null;
  const ref = normalizedProps.ref !== undefined ? normalizedProps.ref : null;
  delete normalizedProps.key;
  delete normalizedProps.ref;
  return {
    $$typeof: Symbol.for('react.element'),
    type,
    key,
    ref,
    props: normalizedProps
  };
}

function useState(initialValue) {
  const inst = currentInstance;
  if (!inst) throw new Error('useState must be called inside a component');
  const idx = currentHookIndex++;
  if (inst.hooks.length <= idx) {
    const val = typeof initialValue === 'function' ? initialValue() : initialValue;
    inst.hooks[idx] = { type: 'state', value: val };
  }
  const hook = inst.hooks[idx];
  const setState = (updater) => {
    const nextVal = typeof updater === 'function' ? updater(hook.value) : updater;
    if (!Object.is(nextVal, hook.value)) {
      hook.value = nextVal;
      if (inst.root && typeof inst.root.scheduleRender === 'function') {
        inst.root.scheduleRender();
      }
    }
  };
  return [hook.value, setState];
}

function depsChanged(prevDeps, nextDeps) {
  if (!prevDeps || !nextDeps) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  for (let i = 0; i < prevDeps.length; i++) {
    if (!Object.is(prevDeps[i], nextDeps[i])) return true;
  }
  return false;
}

function useEffect(effect, deps) {
  const inst = currentInstance;
  if (!inst) throw new Error('useEffect must be called inside a component');
  const idx = currentHookIndex++;
  const prevHook = inst.hooks[idx];
  if (!prevHook || depsChanged(prevHook.deps, deps)) {
    inst.hooks[idx] = {
      type: 'effect',
      effect,
      deps,
      cleanup: prevHook ? prevHook.cleanup : null,
      pending: true
    };
    inst.root.pendingEffects.push(inst.hooks[idx]);
  }
}

function useMemo(factory, deps) {
  const inst = currentInstance;
  if (!inst) throw new Error('useMemo must be called inside a component');
  const idx = currentHookIndex++;
  const prevHook = inst.hooks[idx];
  if (!prevHook || depsChanged(prevHook.deps, deps)) {
    const value = factory();
    inst.hooks[idx] = { type: 'memo', value, deps };
    return value;
  }
  return prevHook.value;
}

function useCallback(cb, deps) {
  return useMemo(() => cb, deps);
}

function useRef(initialValue) {
  const inst = currentInstance;
  if (!inst) throw new Error('useRef must be called inside a component');
  const idx = currentHookIndex++;
  if (inst.hooks.length <= idx) {
    inst.hooks[idx] = { type: 'ref', value: { current: initialValue } };
  }
  return inst.hooks[idx].value;
}

function createContext(defaultValue) {
  const ctx = {
    _currentValue: defaultValue,
    Provider: function Provider(props) {
      ctx._currentValue = props.value;
      return props.children;
    }
  };
  return ctx;
}

function useContext(ctx) {
  return ctx._currentValue;
}

function __beginComponent(inst) {
  const prevInst = currentInstance;
  const prevIdx = currentHookIndex;
  currentInstance = inst;
  currentHookIndex = 0;
  return () => {
    currentInstance = prevInst;
    currentHookIndex = prevIdx;
  };
}

const React = {
  Fragment,
  createElement,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  createContext,
  useContext,
  __beginComponent,
  StrictMode: Fragment,
  version: '18.2.0'
};

module.exports = React;
module.exports.default = React;

  };
  __modules["react/jsx-runtime"] = function(module, exports, __req) {
'use strict';
const React = __req('./index.js');
function jsx(type, config, maybeKey) {
  const props = Object.assign({}, config);
  if (maybeKey !== undefined) props.key = maybeKey;
  const children = props.children !== undefined ? props.children : [];
  delete props.children;
  return Array.isArray(children)
    ? React.createElement(type, props, ...children)
    : React.createElement(type, props, children);
}
module.exports = {
  Fragment: React.Fragment,
  jsx,
  jsxs: jsx,
  jsxDEV: jsx
};

  };
  __modules["react-dom/client"] = function(module, exports, __req) {
'use strict';
const React = __req('react');

const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g',
  'defs', 'linearGradient', 'stop', 'clipPath', 'text', 'tspan'
]);

function setDomProps(dom, prevProps, nextProps, isSvg) {
  const allKeys = new Set([...Object.keys(prevProps || {}), ...Object.keys(nextProps || {})]);
  allKeys.forEach((key) => {
    if (key === 'children' || key === 'key' || key === 'ref') return;
    const prevVal = prevProps ? prevProps[key] : undefined;
    const nextVal = nextProps ? nextProps[key] : undefined;
    if (Object.is(prevVal, nextVal) && key !== 'value' && key !== 'checked') return;

    if (key.startsWith('on') && key.length > 2) {
      const rawEvent = key.slice(2).toLowerCase();
      const eventName = rawEvent === 'change' && (dom.tagName === 'INPUT' || dom.tagName === 'TEXTAREA') && dom.type !== 'checkbox' && dom.type !== 'radio' && dom.type !== 'file' && dom.type !== 'date'
        ? 'input'
        : rawEvent;
      dom.__handlers = dom.__handlers || {};
      if (dom.__handlers[eventName]) {
        dom.removeEventListener(eventName, dom.__handlers[eventName]);
        delete dom.__handlers[eventName];
      }
      if (rawEvent === 'change' && eventName === 'input' && dom.__handlers['change']) {
        dom.removeEventListener('change', dom.__handlers['change']);
        delete dom.__handlers['change'];
      }
      if (typeof nextVal === 'function') {
        const listener = (e) => nextVal(e);
        dom.__handlers[eventName] = listener;
        dom.addEventListener(eventName, listener);
        if (rawEvent === 'change' && eventName === 'input') {
          dom.__handlers['change'] = listener;
          dom.addEventListener('change', listener);
        }
      }
      return;
    }

    if (key === 'dangerouslySetInnerHTML') {
      if (nextVal && nextVal.__html !== undefined) {
        dom.innerHTML = nextVal.__html;
      }
      return;
    }

    if (key === 'className') {
      if (isSvg) {
        if (nextVal) dom.setAttribute('class', nextVal);
        else dom.removeAttribute('class');
      } else {
        dom.className = nextVal || '';
      }
      return;
    }

    if (key === 'style') {
      if (!nextVal) {
        dom.removeAttribute('style');
      } else if (typeof nextVal === 'string') {
        dom.style.cssText = nextVal;
      } else if (typeof nextVal === 'object') {
        if (prevVal && typeof prevVal === 'object') {
          Object.keys(prevVal).forEach((sKey) => {
            if (!(sKey in nextVal)) dom.style[sKey] = '';
          });
        }
        Object.keys(nextVal).forEach((sKey) => {
          dom.style[sKey] = nextVal[sKey] != null ? String(nextVal[sKey]) : '';
        });
      }
      return;
    }

    if (key === 'value' && (dom.tagName === 'INPUT' || dom.tagName === 'TEXTAREA' || dom.tagName === 'SELECT')) {
      const strVal = nextVal == null ? '' : String(nextVal);
      if (dom.value !== strVal) {
        dom.value = strVal;
      }
      return;
    }

    if (key === 'checked' && dom.tagName === 'INPUT') {
      dom.checked = Boolean(nextVal);
      return;
    }

    if (key === 'disabled' || key === 'readOnly' || key === 'required' || key === 'multiple' || key === 'autoFocus') {
      dom[key] = Boolean(nextVal);
      if (nextVal) dom.setAttribute(key.toLowerCase(), '');
      else dom.removeAttribute(key.toLowerCase());
      return;
    }

    if (key === 'htmlFor') {
      if (nextVal != null) dom.setAttribute('for', String(nextVal));
      else dom.removeAttribute('for');
      return;
    }

    if (nextVal == null || nextVal === false) {
      dom.removeAttribute(key);
    } else {
      dom.setAttribute(key, String(nextVal));
    }
  });
}

function createRoot(container) {
  const root = {
    container,
    element: null,
    instances: new Map(),
    visitedPaths: new Set(),
    pendingEffects: [],
    isRendering: false,
    needsRender: false,
    scheduleRender() {
      if (root.isRendering) {
        root.needsRender = true;
        return;
      }
      root.performRender();
    },
    performRender() {
      if (!root.element) return;
      root.isRendering = true;
      root.needsRender = false;
      root.visitedPaths.clear();
      try {
        const expanded = expandVNode(root.element, '0', false);
        patchChildren(container, expanded, false);
        for (const [pathKey, inst] of root.instances.entries()) {
          if (!root.visitedPaths.has(pathKey)) {
            if (inst.hooks) {
              inst.hooks.forEach((h) => {
                if (h && h.type === 'effect' && typeof h.cleanup === 'function') {
                  try { h.cleanup(); } catch (_e) {}
                }
              });
            }
            root.instances.delete(pathKey);
          }
        }
      } finally {
        root.isRendering = false;
      }
      const effects = root.pendingEffects.splice(0);
      for (const eff of effects) {
        if (eff.pending) {
          eff.pending = false;
          if (typeof eff.cleanup === 'function') {
            try { eff.cleanup(); } catch (_e) {}
          }
          const res = eff.effect();
          eff.cleanup = typeof res === 'function' ? res : null;
        }
      }
      if (root.needsRender) {
        root.performRender();
      }
    },
    render(element) {
      root.element = element;
      root.performRender();
    },
    unmount() {
      for (const [, inst] of root.instances.entries()) {
        if (inst.hooks) {
          inst.hooks.forEach((h) => {
            if (h && h.type === 'effect' && typeof h.cleanup === 'function') {
              try { h.cleanup(); } catch (_e) {}
            }
          });
        }
      }
      root.instances.clear();
      container.innerHTML = '';
    }
  };

  function expandVNode(vnode, pathKey, isSvg) {
    if (vnode === null || vnode === undefined || typeof vnode === 'boolean') {
      return [];
    }
    if (typeof vnode === 'string' || typeof vnode === 'number') {
      return [{ type: '#text', text: String(vnode), key: pathKey }];
    }
    if (Array.isArray(vnode)) {
      const res = [];
      for (let i = 0; i < vnode.length; i++) {
        const child = vnode[i];
        const cKey = (child && typeof child === 'object' && child.key != null) ? 'k:' + child.key : String(i);
        res.push(...expandVNode(child, pathKey + '.' + cKey, isSvg));
      }
      return res;
    }
    if (vnode.type === React.Fragment) {
      return expandVNode(vnode.props.children || [], pathKey + '.frag', isSvg);
    }
    if (typeof vnode.type === 'function') {
      const compId = pathKey + ':' + (vnode.type.name || 'Anon');
      root.visitedPaths.add(compId);
      let inst = root.instances.get(compId);
      if (!inst || inst.type !== vnode.type) {
        inst = { type: vnode.type, hooks: [], root };
        root.instances.set(compId, inst);
      }
      const endComp = React.__beginComponent(inst);
      let rendered;
      try {
        rendered = vnode.type(vnode.props || {});
      } finally {
        endComp();
      }
      return expandVNode(rendered, compId, isSvg);
    }
    const tagIsSvg = isSvg || vnode.type === 'svg' || SVG_TAGS.has(vnode.type);
    const expandedChildren = expandVNode(vnode.props ? vnode.props.children : [], pathKey, tagIsSvg);
    return [{
      type: vnode.type,
      key: vnode.key != null ? vnode.key : pathKey,
      ref: vnode.ref,
      props: vnode.props || {},
      children: expandedChildren,
      isSvg: tagIsSvg
    }];
  }

  function createDomFromDesc(desc) {
    if (desc.type === '#text') {
      const textNode = document.createTextNode(desc.text);
      textNode.__vdesc = desc;
      return textNode;
    }
    const dom = desc.isSvg
      ? document.createElementNS('http://www.w3.org/2000/svg', desc.type)
      : document.createElement(desc.type);
    dom.__vdesc = desc;
    setDomProps(dom, null, desc.props, desc.isSvg);
    if (!desc.props || !desc.props.dangerouslySetInnerHTML) {
      patchChildren(dom, desc.children, desc.isSvg);
    }
    if (desc.type === 'select' && desc.props && desc.props.value !== undefined) {
      dom.value = String(desc.props.value);
    }
    if (desc.ref) {
      if (typeof desc.ref === 'function') desc.ref(dom);
      else if (typeof desc.ref === 'object') desc.ref.current = dom;
    }
    return dom;
  }

  function patchChildren(parentDom, nextDescs) {
    const existingNodes = Array.from(parentDom.childNodes);
    const keyedExisting = new Map();
    existingNodes.forEach((node, idx) => {
      const k = node.__vdesc && node.__vdesc.key != null ? node.__vdesc.key : '__idx_' + idx;
      keyedExisting.set(k, node);
    });

    const usedNodes = new Set();
    const newChildNodes = [];

    for (let i = 0; i < nextDescs.length; i++) {
      const desc = nextDescs[i];
      const lookupKey = desc.key != null ? desc.key : '__idx_' + i;
      let match = keyedExisting.get(lookupKey);
      if (!match || usedNodes.has(match) || !match.__vdesc || match.__vdesc.type !== desc.type) {
        const posNode = existingNodes[i];
        if (posNode && !usedNodes.has(posNode) && posNode.__vdesc && posNode.__vdesc.type === desc.type) {
          match = posNode;
        } else {
          match = null;
        }
      }

      if (match) {
        usedNodes.add(match);
        const prevDesc = match.__vdesc;
        match.__vdesc = desc;
        if (desc.type === '#text') {
          if (match.nodeValue !== desc.text) {
            match.nodeValue = desc.text;
          }
        } else {
          setDomProps(match, prevDesc.props, desc.props, desc.isSvg);
          if (!desc.props || !desc.props.dangerouslySetInnerHTML) {
            patchChildren(match, desc.children, desc.isSvg);
          }
          if (desc.type === 'select' && desc.props && desc.props.value !== undefined) {
            const targetVal = String(desc.props.value);
            if (match.value !== targetVal) match.value = targetVal;
          }
          if (desc.ref) {
            if (typeof desc.ref === 'function') desc.ref(match);
            else if (typeof desc.ref === 'object') desc.ref.current = match;
          }
        }
        newChildNodes.push(match);
      } else {
        const created = createDomFromDesc(desc);
        newChildNodes.push(created);
      }
    }

    existingNodes.forEach((node) => {
      if (!usedNodes.has(node) && node.parentNode === parentDom) {
        parentDom.removeChild(node);
      }
    });

    for (let i = 0; i < newChildNodes.length; i++) {
      const desired = newChildNodes[i];
      const currentAtPos = parentDom.childNodes[i];
      if (currentAtPos !== desired) {
        parentDom.insertBefore(desired, currentAtPos || null);
      }
    }
  }

  return root;
}

module.exports = { createRoot };
module.exports.default = { createRoot };

  };
  __modules["react-dom"] = function(module, exports, __req) {
'use strict';
module.exports = __req('./client.js');

  };
  __modules["dexie"] = function(module, exports, __req) {
'use strict';

const GLOBAL_DB_STORAGE = new Map();

function cloneDeep(val) {
  if (val === null || typeof val !== 'object') return val;
  return JSON.parse(JSON.stringify(val));
}

function parseSchemaSpec(specStr) {
  const parts = String(specStr || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const first = parts[0] || 'id';
  let autoIncrement = false;
  let unique = false;
  let keyPath = first;
  if (keyPath.startsWith('++')) {
    autoIncrement = true;
    keyPath = keyPath.slice(2);
  } else if (keyPath.startsWith('&')) {
    unique = true;
    keyPath = keyPath.slice(1);
  }
  const indexes = parts.slice(1).map((p) => {
    let idxName = p;
    let idxUnique = false;
    let multiEntry = false;
    if (idxName.startsWith('&')) {
      idxUnique = true;
      idxName = idxName.slice(1);
    } else if (idxName.startsWith('*')) {
      multiEntry = true;
      idxName = idxName.slice(1);
    }
    return { name: idxName, keyPath: idxName, unique: idxUnique, multiEntry };
  });
  return { keyPath, autoIncrement, unique, indexes };
}

class Collection {
  constructor(table, filterFn = null, sortField = null, reversed = false, limitCount = null) {
    this._table = table;
    this._filterFns = filterFn ? [filterFn] : [];
    this._sortField = sortField;
    this._reversed = reversed;
    this._limitCount = limitCount;
  }

  and(fn) {
    return this.filter(fn);
  }

  filter(fn) {
    const next = new Collection(this._table, null, this._sortField, this._reversed, this._limitCount);
    next._filterFns = [...this._filterFns, fn];
    return next;
  }

  reverse() {
    const next = new Collection(this._table, null, this._sortField, !this._reversed, this._limitCount);
    next._filterFns = [...this._filterFns];
    return next;
  }

  limit(n) {
    const next = new Collection(this._table, null, this._sortField, this._reversed, n);
    next._filterFns = [...this._filterFns];
    return next;
  }

  async _resolveItems() {
    await this._table._db._ensureOpen();
    let items = Array.from(this._table._store().records.values()).map(cloneDeep);
    for (const fn of this._filterFns) {
      items = items.filter(fn);
    }
    if (this._sortField) {
      const f = this._sortField;
      items.sort((a, b) => {
        const va = a[f];
        const vb = b[f];
        if (va === vb) return 0;
        if (va === undefined || va === null) return -1;
        if (vb === undefined || vb === null) return 1;
        return va < vb ? -1 : 1;
      });
    }
    if (this._reversed) {
      items.reverse();
    }
    if (typeof this._limitCount === 'number') {
      items = items.slice(0, Math.max(0, this._limitCount));
    }
    return items;
  }

  async toArray() {
    return this._resolveItems();
  }

  async sortBy(field) {
    this._sortField = field;
    return this._resolveItems();
  }

  async first() {
    const arr = await this._resolveItems();
    return arr[0];
  }

  async last() {
    const arr = await this._resolveItems();
    return arr[arr.length - 1];
  }

  async count() {
    const arr = await this._resolveItems();
    return arr.length;
  }

  async delete() {
    const items = await this._resolveItems();
    const kp = this._table._schema.keyPath;
    for (const item of items) {
      await this._table.delete(item[kp]);
    }
    return items.length;
  }

  async modify(changesOrFn) {
    const items = await this._resolveItems();
    const kp = this._table._schema.keyPath;
    let count = 0;
    for (const item of items) {
      const copy = cloneDeep(item);
      if (typeof changesOrFn === 'function') {
        changesOrFn(copy);
      } else if (changesOrFn && typeof changesOrFn === 'object') {
        Object.assign(copy, changesOrFn);
      }
      await this._table.put(copy);
      count++;
    }
    return count;
  }
}

class WhereClause {
  constructor(table, field) {
    this._table = table;
    this._field = field;
  }

  equals(val) {
    const f = this._field;
    return new Collection(this._table, (item) => item[f] === val);
  }

  equalsIgnoreCase(val) {
    const f = this._field;
    const target = String(val || '').toLowerCase();
    return new Collection(this._table, (item) => String(item[f] || '').toLowerCase() === target);
  }

  startsWithIgnoreCase(prefix) {
    const f = this._field;
    const target = String(prefix || '').toLowerCase();
    return new Collection(this._table, (item) => String(item[f] || '').toLowerCase().startsWith(target));
  }

  anyOf(...vals) {
    const flat = vals.length === 1 && Array.isArray(vals[0]) ? vals[0] : vals;
    const set = new Set(flat);
    const f = this._field;
    return new Collection(this._table, (item) => set.has(item[f]));
  }

  above(val) {
    const f = this._field;
    return new Collection(this._table, (item) => item[f] > val);
  }

  aboveOrEqual(val) {
    const f = this._field;
    return new Collection(this._table, (item) => item[f] >= val);
  }

  below(val) {
    const f = this._field;
    return new Collection(this._table, (item) => item[f] < val);
  }

  belowOrEqual(val) {
    const f = this._field;
    return new Collection(this._table, (item) => item[f] <= val);
  }

  between(low, high, includeLow = true, includeHigh = true) {
    const f = this._field;
    return new Collection(this._table, (item) => {
      const v = item[f];
      if (v === undefined || v === null) return false;
      const condLow = includeLow ? v >= low : v > low;
      const condHigh = includeHigh ? v <= high : v < high;
      return condLow && condHigh;
    });
  }
}

class Table {
  constructor(db, name, schema) {
    this._db = db;
    this.name = name;
    this._schema = schema;
  }

  _store() {
    return this._db._getStore(this.name);
  }

  async get(keyOrCrit) {
    await this._db._ensureOpen();
    if (keyOrCrit && typeof keyOrCrit === 'object' && !Array.isArray(keyOrCrit)) {
      const entries = Object.entries(keyOrCrit);
      for (const rec of this._store().records.values()) {
        if (entries.every(([k, v]) => rec[k] === v)) {
          return cloneDeep(rec);
        }
      }
      return undefined;
    }
    const found = this._store().records.get(keyOrCrit);
    return found !== undefined ? cloneDeep(found) : undefined;
  }

  async add(item, explicitKey) {
    await this._db._ensureOpen();
    const store = this._store();
    const copy = cloneDeep(item);
    const kp = this._schema.keyPath;
    let key = explicitKey !== undefined ? explicitKey : (kp ? copy[kp] : undefined);
    if (key === undefined || key === null) {
      if (this._schema.autoIncrement) {
        key = ++store.autoInc;
        if (kp) copy[kp] = key;
      } else {
        throw new Error(`Missing primary key "${kp}" on table "${this.name}"`);
      }
    } else if (this._schema.autoIncrement && typeof key === 'number' && key > store.autoInc) {
      store.autoInc = key;
    }
    if (store.records.has(key)) {
      throw new Error(`Key "${key}" already exists in table "${this.name}"`);
    }
    // Check unique indexes
    for (const idx of this._schema.indexes) {
      if (idx.unique && copy[idx.keyPath] !== undefined) {
        for (const existing of store.records.values()) {
          if (existing[idx.keyPath] === copy[idx.keyPath]) {
            throw new Error(`Unique constraint violation on "${this.name}.${idx.keyPath}" for value "${copy[idx.keyPath]}"`);
          }
        }
      }
    }
    store.records.set(key, copy);
    await this._db._persistRecord(this.name, copy);
    return key;
  }

  async put(item, explicitKey) {
    await this._db._ensureOpen();
    const store = this._store();
    const copy = cloneDeep(item);
    const kp = this._schema.keyPath;
    let key = explicitKey !== undefined ? explicitKey : (kp ? copy[kp] : undefined);
    if (key === undefined || key === null) {
      if (this._schema.autoIncrement) {
        key = ++store.autoInc;
        if (kp) copy[kp] = key;
      } else {
        throw new Error(`Missing primary key "${kp}" on table "${this.name}"`);
      }
    } else if (this._schema.autoIncrement && typeof key === 'number' && key > store.autoInc) {
      store.autoInc = key;
    }
    // Check unique indexes against other keys
    for (const idx of this._schema.indexes) {
      if (idx.unique && copy[idx.keyPath] !== undefined) {
        for (const [exKey, existing] of store.records.entries()) {
          if (exKey !== key && existing[idx.keyPath] === copy[idx.keyPath]) {
            throw new Error(`Unique constraint violation on "${this.name}.${idx.keyPath}" for value "${copy[idx.keyPath]}"`);
          }
        }
      }
    }
    store.records.set(key, copy);
    await this._db._persistRecord(this.name, copy);
    return key;
  }

  async update(key, changes) {
    await this._db._ensureOpen();
    const store = this._store();
    const existing = store.records.get(key);
    if (!existing) return 0;
    const updated = Object.assign(cloneDeep(existing), cloneDeep(changes));
    await this.put(updated, key);
    return 1;
  }

  async delete(key) {
    await this._db._ensureOpen();
    const store = this._store();
    store.records.delete(key);
    await this._db._deleteRecord(this.name, key);
  }

  async clear() {
    await this._db._ensureOpen();
    const store = this._store();
    store.records.clear();
    await this._db._clearStore(this.name);
  }

  async toArray() {
    await this._db._ensureOpen();
    return Array.from(this._store().records.values()).map(cloneDeep);
  }

  async count() {
    await this._db._ensureOpen();
    return this._store().records.size;
  }

  async bulkAdd(items) {
    let lastKey;
    for (const item of items) {
      lastKey = await this.add(item);
    }
    return lastKey;
  }

  async bulkPut(items) {
    let lastKey;
    for (const item of items) {
      lastKey = await this.put(item);
    }
    return lastKey;
  }

  async bulkDelete(keys) {
    for (const k of keys) {
      await this.delete(k);
    }
  }

  orderBy(field) {
    return new Collection(this, null, field, false, null);
  }

  where(fieldOrObj) {
    if (typeof fieldOrObj === 'string') {
      return new WhereClause(this, fieldOrObj);
    }
    const entries = Object.entries(fieldOrObj || {});
    return new Collection(this, (item) => entries.every(([k, v]) => item[k] === v));
  }

  filter(fn) {
    return new Collection(this, fn, null, false, null);
  }

  toCollection() {
    return new Collection(this, null, null, false, null);
  }
}

class Dexie {
  constructor(dbName) {
    this.name = dbName;
    this._versions = [];
    this._maxVersion = 1;
    this._schemas = {};
    this._tables = {};
    this._isOpen = false;
    this._openingPromise = null;
    this._idb = null;
  }

  version(verNum) {
    if (verNum > this._maxVersion) this._maxVersion = verNum;
    const verEntry = { version: verNum, stores: {}, upgradeFn: null };
    this._versions.push(verEntry);
    const self = this;
    const builder = {
      stores(schemaMap) {
        verEntry.stores = Object.assign({}, schemaMap);
        Object.entries(schemaMap).forEach(([tName, spec]) => {
          if (spec === null) {
            delete self._schemas[tName];
            delete self._tables[tName];
            delete self[tName];
          } else {
            const parsed = parseSchemaSpec(spec);
            self._schemas[tName] = parsed;
            const tbl = new Table(self, tName, parsed);
            self._tables[tName] = tbl;
            self[tName] = tbl;
          }
        });
        return builder;
      },
      upgrade(fn) {
        verEntry.upgradeFn = fn;
        return builder;
      }
    };
    return builder;
  }

  table(name) {
    const t = this._tables[name];
    if (!t) throw new Error(`Table "${name}" does not exist in database "${this.name}"`);
    return t;
  }

  _getBackingMap() {
    if (!GLOBAL_DB_STORAGE.has(this.name)) {
      GLOBAL_DB_STORAGE.set(this.name, {
        version: this._maxVersion,
        stores: new Map()
      });
    }
    const dbMem = GLOBAL_DB_STORAGE.get(this.name);
    Object.keys(this._schemas).forEach((tName) => {
      if (!dbMem.stores.has(tName)) {
        dbMem.stores.set(tName, { autoInc: 0, records: new Map() });
      }
    });
    return dbMem;
  }

  _getStore(tableName) {
    const dbMem = this._getBackingMap();
    if (!dbMem.stores.has(tableName)) {
      dbMem.stores.set(tableName, { autoInc: 0, records: new Map() });
    }
    return dbMem.stores.get(tableName);
  }

  async _ensureOpen() {
    if (this._isOpen) return;
    if (this._openingPromise) return this._openingPromise;
    this._openingPromise = this._openInternal();
    try {
      await this._openingPromise;
    } finally {
      this._openingPromise = null;
    }
  }

  async _openInternal() {
    const dbMem = this._getBackingMap();
    const hasNativeIDB = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
    if (hasNativeIDB && !this._idb) {
      try {
        this._idb = await new Promise((resolve, reject) => {
          const req = window.indexedDB.open(this.name, this._maxVersion);
          req.onupgradeneeded = () => {
            const idb = req.result;
            Object.entries(this._schemas).forEach(([tName, schema]) => {
              if (!idb.objectStoreNames.contains(tName)) {
                const store = idb.createObjectStore(tName, {
                  keyPath: schema.keyPath || 'id',
                  autoIncrement: Boolean(schema.autoIncrement)
                });
                schema.indexes.forEach((idx) => {
                  try {
                    store.createIndex(idx.name, idx.keyPath, {
                      unique: idx.unique,
                      multiEntry: idx.multiEntry
                    });
                  } catch (_e) {}
                });
              }
            });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        // Hydrate in-memory cache from native IndexedDB
        for (const [tName, schema] of Object.entries(this._schemas)) {
          if (this._idb.objectStoreNames.contains(tName)) {
            const rows = await new Promise((resolve) => {
              try {
                const tx = this._idb.transaction(tName, 'readonly');
                const st = tx.objectStore(tName);
                const getAllReq = st.getAll();
                getAllReq.onsuccess = () => resolve(getAllReq.result || []);
                getAllReq.onerror = () => resolve([]);
              } catch (_e) {
                resolve([]);
              }
            });
            const memStore = dbMem.stores.get(tName);
            if (rows.length > 0 && memStore.records.size === 0) {
              for (const row of rows) {
                const key = row[schema.keyPath];
                memStore.records.set(key, cloneDeep(row));
                if (typeof key === 'number' && key > memStore.autoInc) {
                  memStore.autoInc = key;
                }
              }
            }
          }
        }
      } catch (_err) {
        this._idb = null;
      }
    }
    this._isOpen = true;
  }

  async _persistRecord(tableName, record) {
    if (!this._idb || !this._idb.objectStoreNames.contains(tableName)) return;
    await new Promise((resolve) => {
      try {
        const tx = this._idb.transaction(tableName, 'readwrite');
        tx.objectStore(tableName).put(cloneDeep(record));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_e) {
        resolve();
      }
    });
  }

  async _deleteRecord(tableName, key) {
    if (!this._idb || !this._idb.objectStoreNames.contains(tableName)) return;
    await new Promise((resolve) => {
      try {
        const tx = this._idb.transaction(tableName, 'readwrite');
        tx.objectStore(tableName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_e) {
        resolve();
      }
    });
  }

  async _clearStore(tableName) {
    if (!this._idb || !this._idb.objectStoreNames.contains(tableName)) return;
    await new Promise((resolve) => {
      try {
        const tx = this._idb.transaction(tableName, 'readwrite');
        tx.objectStore(tableName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_e) {
        resolve();
      }
    });
  }

  async open() {
    await this._ensureOpen();
    return this;
  }

  close() {
    if (this._idb) {
      try { this._idb.close(); } catch (_e) {}
      this._idb = null;
    }
    this._isOpen = false;
  }

  isOpen() {
    return this._isOpen;
  }

  async delete() {
    this.close();
    GLOBAL_DB_STORAGE.delete(this.name);
    if (typeof window !== 'undefined' && window.indexedDB) {
      await new Promise((resolve) => {
        try {
          const req = window.indexedDB.deleteDatabase(this.name);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        } catch (_e) {
          resolve();
        }
      });
    }
  }

  static async delete(dbName) {
    GLOBAL_DB_STORAGE.delete(dbName);
    if (typeof window !== 'undefined' && window.indexedDB) {
      await new Promise((resolve) => {
        try {
          const req = window.indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        } catch (_e) {
          resolve();
        }
      });
    }
  }

  async transaction(_mode, ...args) {
    await this._ensureOpen();
    const scopeFn = args[args.length - 1];
    if (typeof scopeFn !== 'function') {
      throw new Error('Transaction requires a callback function');
    }

    // Take atomic snapshot of all stores before running transaction
    const dbMem = this._getBackingMap();
    const snapshot = new Map();
    for (const [tName, st] of dbMem.stores.entries()) {
      const recCopy = new Map();
      for (const [k, v] of st.records.entries()) {
        recCopy.set(k, cloneDeep(v));
      }
      snapshot.set(tName, { autoInc: st.autoInc, records: recCopy });
    }

    try {
      const result = await scopeFn();
      return result;
    } catch (err) {
      // Roll back in-memory state and sync to native IDB
      for (const [tName, snap] of snapshot.entries()) {
        const st = dbMem.stores.get(tName);
        if (st) {
          st.autoInc = snap.autoInc;
          st.records = snap.records;
        }
        await this._clearStore(tName);
        for (const rec of snap.records.values()) {
          await this._persistRecord(tName, rec);
        }
      }
      throw err;
    }
  }
}

module.exports = Dexie;
module.exports.Dexie = Dexie;
module.exports.default = Dexie;

  };
  __modules["./src/App"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = App;
var _react = _interopRequireWildcard(__req("react"));
var _seed = __req("./db/seed");
var _database = __req("./db/database");
var _billingService = __req("./services/billingService");
var _DashboardView = __req("./components/DashboardView");
var _CreateBillView = __req("./components/CreateBillView");
var _InvoicesHistoryView = __req("./components/InvoicesHistoryView");
var _CustomersView = __req("./components/CustomersView");
var _CatalogueView = __req("./components/CatalogueView");
var _ReportsView = __req("./components/ReportsView");
var _SettingsBackupView = __req("./components/SettingsBackupView");
var _InvoiceDetailModal = __req("./components/InvoiceDetailModal");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
const NAV_ITEMS = [{
  id: 'dashboard',
  label: 'Overview',
  shortLabel: 'Home'
}, {
  id: 'create-bill',
  label: '+ New Bill',
  shortLabel: '+ Bill'
}, {
  id: 'invoices',
  label: 'Invoices',
  shortLabel: 'Bills'
}, {
  id: 'customers',
  label: 'Clients',
  shortLabel: 'Clients'
}, {
  id: 'catalogue',
  label: 'Catalogue',
  shortLabel: 'Items'
}, {
  id: 'reports',
  label: 'Reports',
  shortLabel: 'Reports'
}, {
  id: 'settings',
  label: 'Settings',
  shortLabel: 'Shop'
}];
function App() {
  const [activeTab, setActiveTab] = (0, _react.useState)('dashboard');
  const [settings, setSettings] = (0, _react.useState)(_seed.DEFAULT_SHOP_SETTINGS);
  const [customers, setCustomers] = (0, _react.useState)([]);
  const [catalogue, setCatalogue] = (0, _react.useState)([]);
  const [invoices, setInvoices] = (0, _react.useState)([]);
  const [payments, setPayments] = (0, _react.useState)([]);
  const [metrics, setMetrics] = (0, _react.useState)({
    todayDate: (0, _billingService.getTodayIsoDate)(),
    todayInvoiceValuePaise: 0,
    todayPaymentsReceivedPaise: 0,
    todayInvoiceCount: 0,
    totalOutstandingPaise: 0,
    outstandingInvoiceCount: 0,
    recentInvoices: []
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = (0, _react.useState)(null);
  const [preselectedCustomer, setPreselectedCustomer] = (0, _react.useState)(null);
  const [toast, setToast] = (0, _react.useState)(null);
  const [isOnline, setIsOnline] = (0, _react.useState)(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [dbError, setDbError] = (0, _react.useState)(null);
  function showNotification(message, isError = false) {
    setToast({
      message,
      isError
    });
  }
  (0, _react.useEffect)(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function refreshAllData() {
    try {
      await _database.db.ensureSeeded();
      const [s, custs, cats, invs, pays, dash] = await Promise.all([(0, _billingService.getShopSettings)(), (0, _billingService.listCustomers)(), (0, _billingService.listCatalogue)(), (0, _billingService.listInvoices)(), _database.db.payments.toArray(), (0, _billingService.getDashboardMetrics)()]);
      setSettings(s);
      setCustomers(custs);
      setCatalogue(cats);
      setInvoices(invs);
      setPayments(pays);
      setMetrics(dash);
      setDbError(null);
    } catch (err) {
      setDbError((err === null || err === void 0 ? void 0 : err.message) || 'Database initialization error');
    }
  }
  (0, _react.useEffect)(() => {
    refreshAllData();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "min-h-screen bg-alif-bg text-alif-charcoal flex flex-col pb-20 md:pb-10"
  }, /*#__PURE__*/_react.default.createElement("header", {
    className: "sticky top-0 z-30 bg-alif-bg border-b border-black no-print"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    onClick: () => setActiveTab('dashboard'),
    className: "flex items-baseline gap-3 cursor-pointer min-w-0"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-serif text-lg sm:text-xl tracking-[0.25em] uppercase text-alif-black font-normal shrink-0"
  }, "ALiF"), /*#__PURE__*/_react.default.createElement("div", {
    className: "min-w-0"
  }, /*#__PURE__*/_react.default.createElement("h1", {
    className: "text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-alif-charcoal font-medium truncate"
  }, settings.shopName), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[9px] uppercase tracking-[0.15em] text-alif-grey truncate"
  }, settings.city, ", ", settings.state, " \u2022 INR (\u20B9)"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2.5 shrink-0"
  }, /*#__PURE__*/_react.default.createElement("span", {
    "data-testid": "status-offline-badge",
    className: "px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] border border-alif-border text-alif-grey bg-white"
  }, isOnline ? 'Offline-Ready' : 'Offline Mode'), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      setPreselectedCustomer(null);
      setActiveTab('create-bill');
    },
    "data-testid": "header-new-bill-btn",
    className: "px-3.5 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800 transition"
  }, "+ New Bill"))), /*#__PURE__*/_react.default.createElement("nav", {
    "aria-label": "Primary Navigation",
    className: "max-w-5xl mx-auto px-4 sm:px-6 border-t border-alif-border overflow-x-auto bg-white"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-1 sm:gap-2"
  }, NAV_ITEMS.map(item => /*#__PURE__*/_react.default.createElement("button", {
    key: item.id,
    type: "button",
    onClick: () => setActiveTab(item.id),
    "data-testid": `nav-${item.id}`,
    className: `px-3 py-2.5 text-[10px] uppercase tracking-[0.16em] whitespace-nowrap border-b-2 transition ${activeTab === item.id ? 'border-black text-alif-black font-semibold' : 'border-transparent text-alif-grey hover:text-alif-black'}`
  }, item.label))))), toast && /*#__PURE__*/_react.default.createElement("div", {
    className: "fixed bottom-14 md:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 no-print"
  }, /*#__PURE__*/_react.default.createElement("div", {
    role: "status",
    "data-testid": "toast-banner",
    className: `px-4 py-3 border text-[11px] uppercase tracking-[0.12em] font-medium flex items-center justify-between gap-3 ${toast.isError ? 'bg-alif-charcoal text-white border-black' : 'bg-alif-black text-white border-black'}`
  }, /*#__PURE__*/_react.default.createElement("span", null, toast.message), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setToast(null),
    className: "text-zinc-300 hover:text-white font-semibold"
  }, "\u2715"))), dbError && /*#__PURE__*/_react.default.createElement("div", {
    className: "max-w-5xl mx-auto w-full px-4 sm:px-6 mt-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-black text-alif-black p-3 text-xs uppercase tracking-wider"
  }, "Database Error: ", dbError)), /*#__PURE__*/_react.default.createElement("main", {
    className: "max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex-1"
  }, activeTab === 'dashboard' && /*#__PURE__*/_react.default.createElement(_DashboardView.DashboardView, {
    metrics: metrics,
    onNavigate: tab => setActiveTab(tab),
    onSelectInvoice: inv => setSelectedInvoiceId(inv.id)
  }), activeTab === 'create-bill' && /*#__PURE__*/_react.default.createElement(_CreateBillView.CreateBillView, {
    customers: customers,
    catalogue: catalogue,
    settings: settings,
    preselectedCustomer: preselectedCustomer,
    onNotify: showNotification,
    onBillCreated: async created => {
      await refreshAllData();
      setSelectedInvoiceId(created.id);
    }
  }), activeTab === 'invoices' && /*#__PURE__*/_react.default.createElement(_InvoicesHistoryView.InvoicesHistoryView, {
    invoices: invoices,
    settings: settings,
    onSelectInvoice: inv => setSelectedInvoiceId(inv.id),
    onNotify: showNotification
  }), activeTab === 'customers' && /*#__PURE__*/_react.default.createElement(_CustomersView.CustomersView, {
    customers: customers,
    invoices: invoices,
    onRefresh: refreshAllData,
    onSelectInvoice: inv => setSelectedInvoiceId(inv.id),
    onStartBillForCustomer: cust => {
      setPreselectedCustomer(cust);
      setActiveTab('create-bill');
    },
    onNotify: showNotification
  }), activeTab === 'catalogue' && /*#__PURE__*/_react.default.createElement(_CatalogueView.CatalogueView, {
    catalogue: catalogue,
    onRefresh: refreshAllData,
    onNotify: showNotification
  }), activeTab === 'reports' && /*#__PURE__*/_react.default.createElement(_ReportsView.ReportsView, {
    invoices: invoices,
    payments: payments,
    onNotify: showNotification
  }), activeTab === 'settings' && /*#__PURE__*/_react.default.createElement(_SettingsBackupView.SettingsBackupView, {
    settings: settings,
    customers: customers,
    catalogue: catalogue,
    invoices: invoices,
    payments: payments,
    onRefreshAll: refreshAllData,
    onNotify: showNotification
  })), /*#__PURE__*/_react.default.createElement("nav", {
    "aria-label": "Mobile Bottom Navigation",
    className: "md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-black no-print"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-7 h-12 divide-x"
  }, NAV_ITEMS.map(item => /*#__PURE__*/_react.default.createElement("button", {
    key: item.id,
    type: "button",
    onClick: () => setActiveTab(item.id),
    className: `flex flex-col items-center justify-center text-[9px] uppercase tracking-[0.08em] font-semibold px-0.5 transition ${activeTab === item.id ? 'bg-alif-black text-white' : 'text-alif-charcoal hover:bg-alif-muted'}`
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "truncate w-full text-center"
  }, item.shortLabel))))), selectedInvoiceId && /*#__PURE__*/_react.default.createElement(_InvoiceDetailModal.InvoiceDetailModal, {
    invoiceId: selectedInvoiceId,
    settings: settings,
    onClose: () => setSelectedInvoiceId(null),
    onUpdated: refreshAllData,
    onNotify: showNotification
  }));
}
  };
  __modules["./src/components/CatalogueView"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CatalogueView = CatalogueView;
var _react = _interopRequireWildcard(__req("react"));
var _currency = __req("../utils/currency");
var _billingService = __req("../services/billingService");
var _StatusBadge = __req("./StatusBadge");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function CatalogueView({
  catalogue,
  onRefresh,
  onNotify
}) {
  const [filterCat, setFilterCat] = (0, _react.useState)('all');
  const [search, setSearch] = (0, _react.useState)('');
  const [editingItem, setEditingItem] = (0, _react.useState)(null);
  const [name, setName] = (0, _react.useState)('');
  const [category, setCategory] = (0, _react.useState)('service');
  const [defaultPriceRupees, setDefaultPriceRupees] = (0, _react.useState)('');
  const [minPriceRupees, setMinPriceRupees] = (0, _react.useState)('');
  const [maxPriceRupees, setMaxPriceRupees] = (0, _react.useState)('');
  const [costPriceRupees, setCostPriceRupees] = (0, _react.useState)('');
  const [unit, setUnit] = (0, _react.useState)('pc');
  const [description, setDescription] = (0, _react.useState)('');
  const [isActive, setIsActive] = (0, _react.useState)(true);
  const [confirmResetOpen, setConfirmResetOpen] = (0, _react.useState)(false);
  const filtered = (0, _react.useMemo)(() => {
    return catalogue.filter(item => {
      if (filterCat !== 'all' && item.category !== filterCat) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return item.name.toLowerCase().includes(q) || item.unit.toLowerCase().includes(q) || item.description && item.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [catalogue, filterCat, search]);
  function startEdit(item) {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category);
    setDefaultPriceRupees((0, _currency.paiseToRupeesString)(item.defaultPricePaise));
    setMinPriceRupees(item.minPricePaise !== undefined ? (0, _currency.paiseToRupeesString)(item.minPricePaise) : '');
    setMaxPriceRupees(item.maxPricePaise !== undefined ? (0, _currency.paiseToRupeesString)(item.maxPricePaise) : '');
    setCostPriceRupees(item.costPricePaise !== undefined ? (0, _currency.paiseToRupeesString)(item.costPricePaise) : '');
    setUnit(item.unit);
    setDescription(item.description || '');
    setIsActive(item.isActive);
  }
  function resetForm() {
    setEditingItem(null);
    setName('');
    setCategory('service');
    setDefaultPriceRupees('');
    setMinPriceRupees('');
    setMaxPriceRupees('');
    setCostPriceRupees('');
    setUnit('pc');
    setDescription('');
    setIsActive(true);
  }
  async function handleSaveItem(e) {
    e.preventDefault();
    try {
      const defaultPricePaise = (0, _currency.rupeesToPaise)(defaultPriceRupees || '0');
      const minPricePaise = minPriceRupees.trim() ? (0, _currency.rupeesToPaise)(minPriceRupees) : undefined;
      const maxPricePaise = maxPriceRupees.trim() ? (0, _currency.rupeesToPaise)(maxPriceRupees) : undefined;
      const costPricePaise = costPriceRupees.trim() ? (0, _currency.rupeesToPaise)(costPriceRupees) : undefined;
      const saved = await (0, _billingService.saveCatalogueItem)({
        id: editingItem === null || editingItem === void 0 ? void 0 : editingItem.id,
        name,
        category,
        defaultPricePaise,
        minPricePaise,
        maxPricePaise,
        costPricePaise,
        unit,
        description,
        isActive
      });
      resetForm();
      onRefresh();
      onNotify(`Saved catalogue item "${saved.name}" (${(0, _currency.formatINR)(saved.defaultPricePaise)})`);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to save catalogue item', true);
    }
  }
  async function handleToggleActive(item) {
    try {
      await (0, _billingService.saveCatalogueItem)({
        ...item,
        isActive: !item.isActive
      });
      onRefresh();
      onNotify(`${item.name} marked as ${!item.isActive ? 'Active' : 'Inactive'}`);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to update item', true);
    }
  }
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-8"
  }, /*#__PURE__*/_react.default.createElement("form", {
    onSubmit: handleSaveItem,
    className: "border-b border-black pb-6 space-y-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-baseline justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Atelier Rate Card"), /*#__PURE__*/_react.default.createElement("h2", {
    className: "font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5"
  }, editingItem ? `Edit Item: ${editingItem.name}` : 'Catalogue & Pricing'), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[11px] text-alif-grey mt-0.5"
  }, "Default prices and ranges remain configurable per invoice.")), editingItem && /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: resetForm,
    className: "text-[10px] font-semibold uppercase tracking-widest text-alif-grey underline"
  }, "Cancel Edit")), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Item / Service Name *"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "e.g. Bridal Astar Blouse",
    "data-testid": "cat-form-name",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Category"), /*#__PURE__*/_react.default.createElement("select", {
    value: category,
    onChange: e => setCategory(e.target.value),
    "data-testid": "cat-form-category",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  }, /*#__PURE__*/_react.default.createElement("option", {
    value: "service"
  }, "Tailoring Service"), /*#__PURE__*/_react.default.createElement("option", {
    value: "product"
  }, "Product / Material (Fabric, Lace, Latkan, Dori)"), /*#__PURE__*/_react.default.createElement("option", {
    value: "custom"
  }, "Custom Item"))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Unit (pc, set, mtr, pair, saree)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: unit,
    onChange: e => setUnit(e.target.value),
    placeholder: "pc",
    "data-testid": "cat-form-unit",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-4 gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Default Rate (\u20B9) *"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: defaultPriceRupees,
    onChange: e => setDefaultPriceRupees(e.target.value),
    placeholder: "450",
    "data-testid": "cat-form-price",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Min Range (\u20B9)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: minPriceRupees,
    onChange: e => setMinPriceRupees(e.target.value),
    placeholder: "Optional",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Max Range (\u20B9)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: maxPriceRupees,
    onChange: e => setMaxPriceRupees(e.target.value),
    placeholder: "Optional",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Cost Price (\u20B9)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: costPriceRupees,
    onChange: e => setCostPriceRupees(e.target.value),
    placeholder: "Optional",
    "data-testid": "cat-form-cost",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: description,
    onChange: e => setDescription(e.target.value),
    placeholder: "Optional specification note...",
    className: "flex-1 px-3 py-2 text-xs border border-alif-border bg-white"
  }), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/_react.default.createElement("label", {
    className: "inline-flex items-center gap-2 text-xs uppercase tracking-wider text-alif-charcoal"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "checkbox",
    checked: isActive,
    onChange: e => setIsActive(e.target.checked)
  }), "Active"), /*#__PURE__*/_react.default.createElement("button", {
    type: "submit",
    "data-testid": "btn-save-catalogue",
    className: "px-5 py-2.5 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
  }, editingItem ? 'Update Item' : '+ Add to Catalogue')))), /*#__PURE__*/_react.default.createElement("section", {
    className: "space-y-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-center justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, ['all', 'service', 'product', 'custom'].map(cat => /*#__PURE__*/_react.default.createElement("button", {
    key: cat,
    type: "button",
    onClick: () => setFilterCat(cat),
    className: `px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] border font-semibold ${filterCat === cat ? 'bg-alif-black text-white border-black' : 'bg-white text-alif-charcoal border-alif-border hover:border-black'}`
  }, cat === 'all' ? `All (${catalogue.length})` : cat === 'service' ? 'Tailoring Services' : cat === 'product' ? 'Materials' : 'Custom'))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search catalogue...",
    className: "px-3 py-1.5 text-xs border border-alif-border bg-white"
  }), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setConfirmResetOpen(true),
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Restore Defaults"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-alif-border divide-y"
  }, filtered.map(item => /*#__PURE__*/_react.default.createElement("div", {
    key: item.id,
    className: "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2.5 flex-wrap"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "text-sm font-medium text-alif-black"
  }, item.name), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-alif-border text-alif-grey"
  }, item.category), !item.isActive && /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-dashed border-alif-border text-alif-grey"
  }, "Hidden")), item.description && /*#__PURE__*/_react.default.createElement("p", {
    className: "text-xs text-alif-grey"
  }, item.description), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-4 text-xs text-alif-charcoal font-mono pt-0.5"
  }, /*#__PURE__*/_react.default.createElement("span", null, "Default: ", /*#__PURE__*/_react.default.createElement("strong", null, (0, _currency.formatINR)(item.defaultPricePaise)), " / ", item.unit), item.minPricePaise !== undefined && item.maxPricePaise !== undefined && /*#__PURE__*/_react.default.createElement("span", {
    className: "text-alif-grey"
  }, "Range: ", (0, _currency.formatINR)(item.minPricePaise), "\u2013", (0, _currency.formatINR)(item.maxPricePaise)), item.costPricePaise !== undefined && /*#__PURE__*/_react.default.createElement("span", {
    className: "text-alif-grey"
  }, "Cost: ", (0, _currency.formatINR)(item.costPricePaise)))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2 shrink-0"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => startEdit(item),
    "data-testid": `btn-edit-${item.id}`,
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Edit Price / Details"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => handleToggleActive(item),
    className: "px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] border border-alif-border text-alif-grey hover:text-alif-black"
  }, item.isActive ? 'Hide' : 'Enable')))))), /*#__PURE__*/_react.default.createElement(_StatusBadge.ConfirmDialog, {
    open: confirmResetOpen,
    title: "Restore Default Tailoring Catalogue?",
    message: "This will restore the default ALiF Ladies Tailor items (astar blouse, plain blouse, fall & pico, suit, kurti, alter, Patiala, palazzo, gharara, sharara, frock, lehenga, fabric, lace, latkan, dori, and custom item) while keeping any custom items you added.",
    confirmLabel: "Restore Defaults",
    onConfirm: async () => {
      await (0, _billingService.resetDefaultCatalogue)();
      setConfirmResetOpen(false);
      onRefresh();
      onNotify('Restored default catalogue items');
    },
    onCancel: () => setConfirmResetOpen(false)
  }));
}
  };
  __modules["./src/components/CreateBillView"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CreateBillView = CreateBillView;
var _react = _interopRequireWildcard(__req("react"));
var _currency = __req("../utils/currency");
var _billingService = __req("../services/billingService");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function CreateBillView({
  customers,
  catalogue,
  settings,
  preselectedCustomer,
  onBillCreated,
  onNotify
}) {
  const [selectedCustomerId, setSelectedCustomerId] = (0, _react.useState)((preselectedCustomer === null || preselectedCustomer === void 0 ? void 0 : preselectedCustomer.id) || '');
  const [customerSearch, setCustomerSearch] = (0, _react.useState)('');
  const [customerName, setCustomerName] = (0, _react.useState)((preselectedCustomer === null || preselectedCustomer === void 0 ? void 0 : preselectedCustomer.name) || '');
  const [customerPhone, setCustomerPhone] = (0, _react.useState)((preselectedCustomer === null || preselectedCustomer === void 0 ? void 0 : preselectedCustomer.phone) || '');
  const [customerNotes, setCustomerNotes] = (0, _react.useState)((preselectedCustomer === null || preselectedCustomer === void 0 ? void 0 : preselectedCustomer.notes) || '');
  const [invoiceDate, setInvoiceDate] = (0, _react.useState)((0, _billingService.getTodayIsoDate)());
  const [collectionDate, setCollectionDate] = (0, _react.useState)('');
  const [previewNumber, setPreviewNumber] = (0, _react.useState)('ALIF-2026-0001');
  const [catFilter, setCatFilter] = (0, _react.useState)('all');
  const [catSearch, setCatSearch] = (0, _react.useState)('');
  const [lines, setLines] = (0, _react.useState)([]);
  const [discountType, setDiscountType] = (0, _react.useState)('flat');
  const [discountInput, setDiscountInput] = (0, _react.useState)('0');
  const [advanceInput, setAdvanceInput] = (0, _react.useState)('0');
  const [advanceMethod, setAdvanceMethod] = (0, _react.useState)(settings.defaultPaymentMethod || 'cash');
  const [billNotes, setBillNotes] = (0, _react.useState)('');
  const [idempotencyKey, setIdempotencyKey] = (0, _react.useState)(() => (0, _billingService.generateId)('idem'));
  const [isSaving, setIsSaving] = (0, _react.useState)(false);
  const [showPreviewModal, setShowPreviewModal] = (0, _react.useState)(false);
  (0, _react.useEffect)(() => {
    if (preselectedCustomer) {
      setSelectedCustomerId(preselectedCustomer.id);
      setCustomerName(preselectedCustomer.name);
      setCustomerPhone(preselectedCustomer.phone);
      setCustomerNotes(preselectedCustomer.notes || '');
    }
  }, [preselectedCustomer]);
  (0, _react.useEffect)(() => {
    (0, _billingService.previewNextInvoiceNumber)(invoiceDate).then(setPreviewNumber).catch(() => {});
  }, [invoiceDate]);
  (0, _react.useEffect)(() => {
    if (lines.length === 0 && catalogue.length > 0) {
      const astar = catalogue.find(c => c.id === 'srv-astar-blouse') || catalogue[0];
      if (astar) {
        addCatalogueItemToBill(astar);
      }
    }
  }, []);
  const filteredCustomers = (0, _react.useMemo)(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)).slice(0, 10);
  }, [customers, customerSearch]);
  const filteredCatalogue = (0, _react.useMemo)(() => {
    return catalogue.filter(item => {
      if (!item.isActive) return false;
      if (catFilter !== 'all' && item.category !== catFilter) return false;
      if (catSearch.trim()) {
        const q = catSearch.trim().toLowerCase();
        return item.name.toLowerCase().includes(q) || item.unit.toLowerCase().includes(q);
      }
      return true;
    });
  }, [catalogue, catFilter, catSearch]);
  function handleSelectExistingCustomer(cust) {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    setCustomerNotes(cust.notes || '');
    setCustomerSearch('');
  }
  function addCatalogueItemToBill(item) {
    const rangeHint = item.minPricePaise !== undefined && item.maxPricePaise !== undefined ? `${(0, _currency.formatINR)(item.minPricePaise)}–${(0, _currency.formatINR)(item.maxPricePaise)}/${item.unit}` : undefined;
    setLines(prev => [...prev, {
      id: (0, _billingService.generateId)('row'),
      catalogueItemId: item.id,
      name: item.name,
      category: item.category,
      quantity: '1',
      unit: item.unit,
      unitPriceRupees: (0, _currency.paiseToRupeesString)(item.defaultPricePaise),
      costPricePaise: item.costPricePaise,
      rangeHint,
      notes: ''
    }]);
  }
  function addBlankCustomItem() {
    setLines(prev => [...prev, {
      id: (0, _billingService.generateId)('row'),
      catalogueItemId: null,
      name: 'Custom Tailoring / Material',
      category: 'custom',
      quantity: '1',
      unit: 'item',
      unitPriceRupees: '200',
      notes: ''
    }]);
  }
  function updateLine(id, patch) {
    setLines(prev => prev.map(line => line.id === id ? {
      ...line,
      ...patch
    } : line));
  }
  function removeLine(id) {
    setLines(prev => prev.filter(line => line.id !== id));
  }
  const calculated = (0, _react.useMemo)(() => {
    const parsedLines = lines.map(l => {
      const qty = Math.max(0, Number(l.quantity) || 0);
      let unitPaise = 0;
      try {
        unitPaise = Math.max(0, (0, _currency.rupeesToPaise)(l.unitPriceRupees || '0'));
      } catch (_e) {
        unitPaise = 0;
      }
      const lineTotalPaise = qty > 0 ? (0, _currency.calculateLineTotalPaise)(qty, unitPaise) : 0;
      return {
        ...l,
        qty,
        unitPaise,
        lineTotalPaise
      };
    });
    let discountVal = 0;
    try {
      discountVal = discountType === 'flat' ? Math.max(0, (0, _currency.rupeesToPaise)(discountInput || '0')) : Math.max(0, Math.min(100, Number(discountInput) || 0));
    } catch (_e) {
      discountVal = 0;
    }
    const totals = (0, _currency.calculateInvoiceTotals)({
      items: parsedLines.filter(l => l.qty > 0).map(l => ({
        quantity: l.qty,
        unitPricePaise: l.unitPaise
      })),
      discountType,
      discountValue: discountVal,
      taxEnabled: settings.taxEnabled,
      taxRatePercent: settings.taxRatePercent
    });
    let advancePaise = 0;
    try {
      advancePaise = Math.max(0, (0, _currency.rupeesToPaise)(advanceInput || '0'));
    } catch (_e) {
      advancePaise = 0;
    }
    const balancePaise = Math.max(0, totals.totalPaise - advancePaise);
    const status = totals.totalPaise === 0 || advancePaise >= totals.totalPaise ? 'Paid' : advancePaise > 0 ? 'Partially Paid' : 'Unpaid';
    return {
      parsedLines,
      discountVal,
      totals,
      advancePaise,
      balancePaise,
      status
    };
  }, [lines, discountType, discountInput, advanceInput, settings]);
  function validateForm() {
    if (!customerName.trim()) return 'Please enter the customer name.';
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 6) {
      return 'Please enter a valid customer phone number (at least 6 digits).';
    }
    if (calculated.parsedLines.length === 0) {
      return 'Please add at least one tailoring service or product item.';
    }
    for (let i = 0; i < calculated.parsedLines.length; i++) {
      const l = calculated.parsedLines[i];
      if (!l.name.trim()) return `Line item #${i + 1} needs a name.`;
      if (l.qty <= 0) return `Line item "${l.name}" must have a quantity greater than 0.`;
      if (l.unitPaise < 0) return `Line item "${l.name}" cannot have a negative price.`;
    }
    if (calculated.advancePaise > calculated.totals.totalPaise) {
      return 'Advance received cannot exceed the final bill total.';
    }
    return null;
  }
  async function handleSaveBill() {
    if (isSaving) return;
    const errorMsg = validateForm();
    if (errorMsg) {
      onNotify(errorMsg, true);
      return;
    }
    setIsSaving(true);
    try {
      const result = await (0, _billingService.createInvoice)({
        customerId: selectedCustomerId || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerNotes: customerNotes.trim(),
        invoiceDate,
        collectionDate: collectionDate || undefined,
        items: calculated.parsedLines.map(l => ({
          catalogueItemId: l.catalogueItemId,
          name: l.name.trim(),
          category: l.category,
          quantity: l.qty,
          unit: l.unit.trim() || 'pc',
          unitPricePaise: l.unitPaise,
          costPricePaise: l.costPricePaise,
          notes: l.notes.trim() || undefined
        })),
        discountType,
        discountValue: calculated.discountVal,
        advancePaise: calculated.advancePaise,
        advanceMethod,
        notes: billNotes.trim(),
        idempotencyKey
      });
      setShowPreviewModal(false);
      setIdempotencyKey((0, _billingService.generateId)('idem'));
      onNotify(`Saved bill ${result.invoice.invoiceNumber} (${(0, _currency.formatINR)(result.invoice.totalPaise)})`);
      onBillCreated(result.invoice);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to save bill', true);
    } finally {
      setIsSaving(false);
    }
  }
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-8"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "border-b border-black pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "New Order & Invoice"), /*#__PURE__*/_react.default.createElement("h2", {
    className: "font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5"
  }, "Create Tailoring Bill")), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "editorial-label"
  }, "Invoice No"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-xs font-semibold px-2.5 py-1 border border-black bg-white text-alif-black",
    "data-testid": "next-invoice-number"
  }, previewNumber))), /*#__PURE__*/_react.default.createElement("section", {
    className: "space-y-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-alif-border pb-2"
  }, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "01 / Client & Schedule"), customers.length > 0 && /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: customerSearch,
    onChange: e => setCustomerSearch(e.target.value),
    placeholder: "Search saved client...",
    className: "px-2.5 py-1 text-xs border border-alif-border bg-white"
  }), selectedCustomerId && /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      setSelectedCustomerId('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerNotes('');
    },
    className: "text-[10px] uppercase tracking-wider text-alif-grey underline"
  }, "Clear"))), filteredCustomers.length > 0 && /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, filteredCustomers.map(c => /*#__PURE__*/_react.default.createElement("button", {
    key: c.id,
    type: "button",
    onClick: () => handleSelectExistingCustomer(c),
    className: `px-2.5 py-1 text-[11px] border transition ${selectedCustomerId === c.id ? 'bg-alif-black text-white border-black font-semibold' : 'bg-white text-alif-charcoal border-alif-border hover:border-black'}`
  }, c.name, " (", c.phone, ")"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Customer Name *"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: customerName,
    onChange: e => setCustomerName(e.target.value),
    placeholder: "e.g. Ayesha Khatoon",
    "data-testid": "input-customer-name",
    className: "w-full px-3 py-2 text-sm border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Phone / WhatsApp *"), /*#__PURE__*/_react.default.createElement("input", {
    type: "tel",
    value: customerPhone,
    onChange: e => setCustomerPhone(e.target.value),
    placeholder: "e.g. 9876543210",
    "data-testid": "input-customer-phone",
    className: "w-full px-3 py-2 text-sm border border-alif-border bg-white font-mono"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Bill Date"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: invoiceDate,
    onChange: e => setInvoiceDate(e.target.value),
    className: "w-full px-3 py-2 text-sm border border-alif-border bg-white font-mono"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Collection Date (Optional)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: collectionDate,
    onChange: e => setCollectionDate(e.target.value),
    "data-testid": "input-collection-date",
    className: "w-full px-3 py-2 text-sm border border-alif-border bg-white font-mono"
  })))), /*#__PURE__*/_react.default.createElement("section", {
    className: "space-y-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-alif-border pb-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "02 / Catalogue Selection"), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[11px] text-alif-grey mt-0.5"
  }, "Tap any garment service or material to add to the invoice")), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap items-center gap-1.5"
  }, ['all', 'service', 'product', 'custom'].map(cat => /*#__PURE__*/_react.default.createElement("button", {
    key: cat,
    type: "button",
    onClick: () => setCatFilter(cat),
    className: `px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] border font-semibold ${catFilter === cat ? 'bg-alif-black text-white border-black' : 'bg-white text-alif-charcoal border-alif-border hover:border-black'}`
  }, cat === 'all' ? 'All' : cat === 'service' ? 'Services' : cat === 'product' ? 'Materials' : 'Custom')), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: catSearch,
    onChange: e => setCatSearch(e.target.value),
    placeholder: "Filter catalogue...",
    className: "px-2.5 py-1 text-xs border border-alif-border bg-white w-32"
  }), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: addBlankCustomItem,
    "data-testid": "btn-add-custom-line",
    className: "px-3 py-1 text-[10px] uppercase tracking-[0.14em] font-semibold bg-alif-charcoal text-white hover:bg-black"
  }, "+ Custom Item"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 border-t border-l border-alif-border max-h-56 overflow-y-auto bg-white"
  }, filteredCatalogue.map(item => /*#__PURE__*/_react.default.createElement("button", {
    key: item.id,
    type: "button",
    onClick: () => addCatalogueItemToBill(item),
    "data-testid": `pick-${item.id}`,
    className: "text-left p-3 border-r border-b border-alif-border bg-white hover:bg-alif-muted transition flex flex-col justify-between"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-baseline justify-between gap-1"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs font-medium text-alif-black truncate"
  }, item.name), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[9px] uppercase tracking-wider text-alif-grey shrink-0"
  }, item.category === 'service' ? 'SRV' : item.category === 'product' ? 'MAT' : 'CST')), item.minPricePaise !== undefined && item.maxPricePaise !== undefined && /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] font-mono text-alif-grey mt-0.5"
  }, (0, _currency.formatINR)(item.minPricePaise), "\u2013", (0, _currency.formatINR)(item.maxPricePaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xs font-mono font-semibold text-alif-black mt-2"
  }, (0, _currency.formatINR)(item.defaultPricePaise), " / ", item.unit))))), /*#__PURE__*/_react.default.createElement("section", {
    className: "space-y-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-baseline justify-between border-b border-black pb-2"
  }, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "03 / Invoice Line Items (", lines.length, ")"), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[10px] uppercase tracking-wider text-alif-grey"
  }, "Rates configurable per garment")), lines.length === 0 ? /*#__PURE__*/_react.default.createElement("div", {
    className: "p-8 text-center border border-alif-border bg-white text-xs uppercase tracking-wider text-alif-grey"
  }, "No items selected. Choose a service or material above.") : /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-alif-border divide-y"
  }, calculated.parsedLines.map((line, idx) => /*#__PURE__*/_react.default.createElement("div", {
    key: line.id,
    className: "p-3.5 space-y-2.5",
    "data-testid": `bill-line-${idx}`
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-4 gap-3 items-start"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "sm:col-span-2"
  }, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Item / Service #", idx + 1), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: line.name,
    onChange: e => updateLine(line.id, {
      name: e.target.value
    }),
    "data-testid": `line-name-${idx}`,
    className: "w-full px-2.5 py-1.5 text-xs font-medium border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Qty (", line.unit, ")"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0.1",
    step: "any",
    value: line.quantity,
    onChange: e => updateLine(line.id, {
      quantity: e.target.value
    }),
    "data-testid": `line-qty-${idx}`,
    className: "w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Unit Price (\u20B9)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: line.unitPriceRupees,
    onChange: e => updateLine(line.id, {
      unitPriceRupees: e.target.value
    }),
    "data-testid": `line-price-${idx}`,
    className: "w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
  }), line.rangeHint && /*#__PURE__*/_react.default.createElement("span", {
    className: "block text-[9px] font-mono text-alif-grey mt-0.5"
  }, "Default: ", line.rangeHint))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Line Total"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-sm font-mono font-semibold text-alif-black",
    "data-testid": `line-total-${idx}`
  }, (0, _currency.formatINR)(line.lineTotalPaise))), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => removeLine(line.id),
    className: "px-2.5 py-1 text-[10px] uppercase tracking-wider text-alif-grey hover:text-alif-black border border-alif-border",
    title: "Remove item"
  }, "Remove"))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: line.notes,
    onChange: e => updateLine(line.id, {
      notes: e.target.value
    }),
    placeholder: "Measurement / styling note (e.g. deep back neck with dori, 14 in length)...",
    className: "w-full px-2.5 py-1.5 text-xs border border-alif-border bg-stone-50 text-alif-charcoal"
  })))))), /*#__PURE__*/_react.default.createElement("section", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-6 pt-2"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "border-b border-alif-border pb-2"
  }, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "04 / Discount, Advance & Notes")), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Discount Type"), /*#__PURE__*/_react.default.createElement("select", {
    value: discountType,
    onChange: e => setDiscountType(e.target.value),
    "data-testid": "select-discount-type",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  }, /*#__PURE__*/_react.default.createElement("option", {
    value: "flat"
  }, "Flat Amount (\u20B9)"), /*#__PURE__*/_react.default.createElement("option", {
    value: "percent"
  }, "Percentage (%)"))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Discount (", discountType === 'flat' ? '₹' : '%', ")"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: discountInput,
    onChange: e => setDiscountInput(e.target.value),
    "data-testid": "input-discount-value",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Advance Received (\u20B9)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: advanceInput,
    onChange: e => setAdvanceInput(e.target.value),
    "data-testid": "input-advance-amount",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Payment Method"), /*#__PURE__*/_react.default.createElement("select", {
    value: advanceMethod,
    onChange: e => setAdvanceMethod(e.target.value),
    "data-testid": "select-advance-method",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  }, (settings.enabledPaymentMethods || ['cash', 'upi', 'bank_transfer', 'other']).map(m => /*#__PURE__*/_react.default.createElement("option", {
    key: m,
    value: m
  }, _currency.PAYMENT_METHOD_LABELS[m]))))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Order / Fitting Notes"), /*#__PURE__*/_react.default.createElement("textarea", {
    rows: 2,
    value: billNotes,
    onChange: e => setBillNotes(e.target.value),
    placeholder: "Delivery instructions, trial schedule, or fabric notes...",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-black p-5 flex flex-col justify-between space-y-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between border-b border-alif-border pb-2.5"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "editorial-label"
  }, "Order Summary"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-xs font-semibold text-alif-black"
  }, previewNumber)), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between text-xs"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-grey"
  }, "Subtotal"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-alif-black",
    "data-testid": "summary-subtotal"
  }, (0, _currency.formatINR)(calculated.totals.subtotalPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between text-xs"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-grey"
  }, "Discount"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-alif-charcoal",
    "data-testid": "summary-discount"
  }, "- ", (0, _currency.formatINR)(calculated.totals.discountPaise))), settings.taxEnabled && calculated.totals.taxPaise > 0 && /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between text-xs"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-grey"
  }, settings.taxLabel || 'Tax', " (", settings.taxRatePercent, "%)"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-alif-charcoal"
  }, "+ ", (0, _currency.formatINR)(calculated.totals.taxPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "border-t border-black pt-3 flex items-baseline justify-between"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs font-semibold uppercase tracking-[0.16em] text-alif-black"
  }, "Final Total"), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xl font-mono font-semibold text-alif-black",
    "data-testid": "summary-final-total"
  }, (0, _currency.formatINR)(calculated.totals.totalPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between text-xs pt-1"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-grey"
  }, "Advance (", _currency.PAYMENT_METHOD_LABELS[advanceMethod], ")"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono font-medium text-alif-black"
  }, (0, _currency.formatINR)(calculated.advancePaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-baseline justify-between pt-2 border-t border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs font-semibold uppercase tracking-[0.14em] text-alif-charcoal"
  }, "Balance Due"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-base font-semibold text-alif-black",
    "data-testid": "summary-balance-due"
  }, (0, _currency.formatINR)(calculated.balancePaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between text-[10px] uppercase tracking-[0.14em] pt-1 text-alif-grey"
  }, /*#__PURE__*/_react.default.createElement("span", null, "Status"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-semibold text-alif-black"
  }, calculated.status))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row gap-2 pt-3 border-t border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      const err = validateForm();
      if (err) {
        onNotify(err, true);
      } else {
        setShowPreviewModal(true);
      }
    },
    className: "flex-1 py-3 px-3 border border-black bg-white text-alif-black text-[11px] font-semibold uppercase tracking-[0.15em] hover:bg-alif-muted"
  }, "Preview Bill"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    disabled: isSaving,
    onClick: handleSaveBill,
    "data-testid": "btn-save-bill",
    className: "flex-1 py-3 px-4 bg-alif-black text-white text-[11px] font-semibold uppercase tracking-[0.15em] hover:bg-zinc-800"
  }, isSaving ? 'Saving...' : 'Save & Generate Receipt')))), showPreviewModal && /*#__PURE__*/_react.default.createElement("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-black max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-start justify-between border-b border-black pb-4"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Receipt Preview"), /*#__PURE__*/_react.default.createElement("h3", {
    className: "font-serif text-lg uppercase tracking-[0.18em] text-alif-black mt-1"
  }, settings.shopName), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-xs font-mono text-alif-grey mt-0.5"
  }, previewNumber, " \u2022 ", customerName, " (", customerPhone, ")")), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setShowPreviewModal(false),
    className: "text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 border border-alif-border hover:border-black"
  }, "Close")), /*#__PURE__*/_react.default.createElement("div", {
    className: "divide-y border-b border-alif-border text-xs"
  }, calculated.parsedLines.map((l, i) => /*#__PURE__*/_react.default.createElement("div", {
    key: l.id,
    className: "flex items-center justify-between py-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-medium text-alif-black"
  }, i + 1, ". ", l.name), ' ', /*#__PURE__*/_react.default.createElement("span", {
    className: "text-alif-grey font-mono"
  }, "(", l.qty, " ", l.unit, " \xD7 ", (0, _currency.formatINR)(l.unitPaise), ")")), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono font-semibold text-alif-black"
  }, (0, _currency.formatINR)(l.lineTotalPaise))))), /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-1.5 text-xs"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-grey"
  }, "Subtotal"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono"
  }, (0, _currency.formatINR)(calculated.totals.subtotalPaise))), calculated.totals.discountPaise > 0 && /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-grey"
  }, "Discount"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono"
  }, "- ", (0, _currency.formatINR)(calculated.totals.discountPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-between font-semibold text-sm pt-2 border-t border-black"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-[0.14em]"
  }, "Final Total"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono"
  }, (0, _currency.formatINR)(calculated.totals.totalPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-grey"
  }, "Advance Paid"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono"
  }, (0, _currency.formatINR)(calculated.advancePaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-between font-semibold pt-1 border-t border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-[0.14em]"
  }, "Balance Due"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono"
  }, (0, _currency.formatINR)(calculated.balancePaise)))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-end gap-2 pt-3 border-t border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setShowPreviewModal(false),
    className: "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border hover:border-black"
  }, "Back to Edit"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    disabled: isSaving,
    onClick: handleSaveBill,
    className: "px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-alif-black text-white hover:bg-zinc-800"
  }, isSaving ? 'Saving...' : 'Confirm & Save Bill')))));
}
  };
  __modules["./src/components/CustomersView"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CustomersView = CustomersView;
var _react = _interopRequireWildcard(__req("react"));
var _currency = __req("../utils/currency");
var _billingService = __req("../services/billingService");
var _StatusBadge = __req("./StatusBadge");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function CustomersView({
  customers,
  invoices,
  onRefresh,
  onSelectInvoice,
  onStartBillForCustomer,
  onNotify
}) {
  const [search, setSearch] = (0, _react.useState)('');
  const [editingCustomer, setEditingCustomer] = (0, _react.useState)(null);
  const [name, setName] = (0, _react.useState)('');
  const [phone, setPhone] = (0, _react.useState)('');
  const [notes, setNotes] = (0, _react.useState)('');
  const [selectedHistoryCustomerId, setSelectedHistoryCustomerId] = (0, _react.useState)(null);
  const filteredCustomers = (0, _react.useMemo)(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.notes && c.notes.toLowerCase().includes(q));
  }, [customers, search]);
  const customerStats = (0, _react.useMemo)(() => {
    const map = new Map();
    for (const inv of invoices) {
      const cur = map.get(inv.customerId) || {
        count: 0,
        billedPaise: 0,
        paidPaise: 0,
        balancePaise: 0
      };
      cur.count++;
      if (inv.status !== 'Cancelled') {
        cur.billedPaise += inv.totalPaise;
        cur.balancePaise += inv.balancePaise;
      }
      cur.paidPaise += inv.paidPaise;
      map.set(inv.customerId, cur);
    }
    return map;
  }, [invoices]);
  function startEdit(c) {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setNotes(c.notes || '');
  }
  function resetForm() {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setNotes('');
  }
  async function handleSaveCustomer(e) {
    e.preventDefault();
    try {
      const saved = await (0, _billingService.saveCustomer)({
        id: editingCustomer === null || editingCustomer === void 0 ? void 0 : editingCustomer.id,
        name,
        phone,
        notes
      });
      resetForm();
      onRefresh();
      onNotify(`Saved customer ${saved.name}`);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to save customer', true);
    }
  }
  const selectedCustomer = customers.find(c => c.id === selectedHistoryCustomerId);
  const selectedCustomerInvoices = (0, _react.useMemo)(() => {
    if (!selectedHistoryCustomerId) return [];
    return invoices.filter(inv => inv.customerId === selectedHistoryCustomerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices, selectedHistoryCustomerId]);
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-8"
  }, /*#__PURE__*/_react.default.createElement("form", {
    onSubmit: handleSaveCustomer,
    className: "border-b border-black pb-6 space-y-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-baseline justify-between"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Client Book"), /*#__PURE__*/_react.default.createElement("h2", {
    className: "font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5"
  }, editingCustomer ? `Edit Client: ${editingCustomer.name}` : 'Register Client')), editingCustomer && /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: resetForm,
    className: "text-[10px] font-semibold uppercase tracking-widest text-alif-grey underline"
  }, "Cancel Edit")), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Full Name *"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "e.g. Farzana Begum",
    "data-testid": "cust-form-name",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Phone Number *"), /*#__PURE__*/_react.default.createElement("input", {
    type: "tel",
    value: phone,
    onChange: e => setPhone(e.target.value),
    placeholder: "e.g. 9431122334",
    "data-testid": "cust-form-phone",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Measurements / Notes"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: notes,
    onChange: e => setNotes(e.target.value),
    placeholder: "e.g. Blouse length 14.5, cotton astar",
    "data-testid": "cust-form-notes",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-end"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "submit",
    "data-testid": "btn-save-customer",
    className: "px-5 py-2.5 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
  }, editingCustomer ? 'Update Customer' : '+ Save Customer'))), /*#__PURE__*/_react.default.createElement("section", {
    className: "space-y-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-alif-border pb-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "Client Directory (", filteredCustomers.length, ")"), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[11px] text-alif-grey mt-0.5"
  }, "Search by name or phone number to inspect ledger and past bills")), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search name or phone...",
    "data-testid": "input-search-customers",
    className: "px-3 py-2 text-xs border border-alif-border bg-white w-full sm:w-64"
  })), filteredCustomers.length === 0 ? /*#__PURE__*/_react.default.createElement("div", {
    className: "p-10 text-center border border-alif-border bg-white text-xs uppercase tracking-wider text-alif-grey"
  }, "No clients found. Add a client above or create a new bill.") : /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-alif-border divide-y"
  }, filteredCustomers.map(c => {
    const st = customerStats.get(c.id) || {
      count: 0,
      billedPaise: 0,
      paidPaise: 0,
      balancePaise: 0
    };
    const isSelected = selectedHistoryCustomerId === c.id;
    return /*#__PURE__*/_react.default.createElement("div", {
      key: c.id,
      className: "p-4 space-y-3"
    }, /*#__PURE__*/_react.default.createElement("div", {
      className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    }, /*#__PURE__*/_react.default.createElement("div", {
      className: "space-y-1"
    }, /*#__PURE__*/_react.default.createElement("div", {
      className: "text-sm font-medium text-alif-black"
    }, c.name, ' ', /*#__PURE__*/_react.default.createElement("span", {
      className: "font-mono text-xs text-alif-grey ml-1.5"
    }, c.phone)), c.notes && /*#__PURE__*/_react.default.createElement("div", {
      className: "text-xs text-alif-grey"
    }, c.notes), /*#__PURE__*/_react.default.createElement("div", {
      className: "flex flex-wrap gap-4 text-[11px] font-mono text-alif-grey pt-0.5"
    }, /*#__PURE__*/_react.default.createElement("span", null, "Bills: ", st.count), /*#__PURE__*/_react.default.createElement("span", null, "Billed: ", (0, _currency.formatINR)(st.billedPaise)), /*#__PURE__*/_react.default.createElement("span", null, "Paid: ", (0, _currency.formatINR)(st.paidPaise)), st.balancePaise > 0 && /*#__PURE__*/_react.default.createElement("span", {
      className: "font-semibold text-alif-black"
    }, "Due: ", (0, _currency.formatINR)(st.balancePaise)))), /*#__PURE__*/_react.default.createElement("div", {
      className: "flex flex-wrap gap-1.5"
    }, /*#__PURE__*/_react.default.createElement("button", {
      type: "button",
      onClick: () => onStartBillForCustomer(c),
      className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-alif-black text-white hover:bg-zinc-800"
    }, "+ New Bill"), /*#__PURE__*/_react.default.createElement("button", {
      type: "button",
      onClick: () => setSelectedHistoryCustomerId(isSelected ? null : c.id),
      "data-testid": `btn-history-${c.phone}`,
      className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
    }, isSelected ? 'Hide History' : `History (${st.count})`), /*#__PURE__*/_react.default.createElement("button", {
      type: "button",
      onClick: () => startEdit(c),
      className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
    }, "Edit"))), isSelected && selectedCustomer && /*#__PURE__*/_react.default.createElement("div", {
      className: "bg-stone-50 border border-alif-border p-3 space-y-2"
    }, /*#__PURE__*/_react.default.createElement("div", {
      className: "editorial-label"
    }, "Invoice Ledger \u2014 ", selectedCustomer.name), selectedCustomerInvoices.length === 0 ? /*#__PURE__*/_react.default.createElement("div", {
      className: "text-xs text-alif-grey"
    }, "No bills recorded for this client yet.") : /*#__PURE__*/_react.default.createElement("div", {
      className: "divide-y bg-white border border-alif-border"
    }, selectedCustomerInvoices.map(inv => /*#__PURE__*/_react.default.createElement("div", {
      key: inv.id,
      onClick: () => onSelectInvoice(inv),
      className: "p-2.5 flex items-center justify-between text-xs hover:bg-stone-50 cursor-pointer"
    }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("span", {
      className: "font-mono font-semibold text-alif-black"
    }, inv.invoiceNumber), ' ', /*#__PURE__*/_react.default.createElement("span", {
      className: "font-mono text-alif-grey mx-1"
    }, inv.invoiceDate), ' ', /*#__PURE__*/_react.default.createElement(_StatusBadge.StatusBadge, {
      status: inv.status
    }), /*#__PURE__*/_react.default.createElement("div", {
      className: "text-alif-grey mt-0.5"
    }, inv.items.map(i => `${i.name} ×${i.quantity}`).join(' / '))), /*#__PURE__*/_react.default.createElement("div", {
      className: "text-right font-mono"
    }, /*#__PURE__*/_react.default.createElement("div", {
      className: "font-semibold text-alif-black"
    }, (0, _currency.formatINR)(inv.totalPaise)), inv.balancePaise > 0 && inv.status !== 'Cancelled' && /*#__PURE__*/_react.default.createElement("div", {
      className: "text-[11px] text-alif-charcoal"
    }, "Due ", (0, _currency.formatINR)(inv.balancePaise))))))));
  }))));
}
  };
  __modules["./src/components/DashboardView"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DashboardView = DashboardView;
var _react = _interopRequireDefault(__req("react"));
var _currency = __req("../utils/currency");
var _StatusBadge = __req("./StatusBadge");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function DashboardView({
  metrics,
  onNavigate,
  onSelectInvoice
}) {
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-8"
  }, /*#__PURE__*/_react.default.createElement("section", {
    className: "border-b border-black pb-6 space-y-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-end justify-between gap-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Sahibganj, Jharkhand \u2014 ", metrics.todayDate), /*#__PURE__*/_react.default.createElement("h2", {
    className: "font-serif text-xl sm:text-2xl uppercase tracking-[0.18em] text-alif-black font-normal"
  }, "Atelier Billing & Ledger")), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('create-bill'),
    "data-testid": "quick-new-bill",
    className: "flex-1 sm:flex-auto px-5 py-3 bg-alif-black text-white text-[11px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800 transition"
  }, "+ Create New Bill"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('invoices'),
    className: "flex-1 sm:flex-auto px-4 py-3 bg-white text-alif-black border border-black text-[11px] font-semibold uppercase tracking-[0.16em] hover:bg-alif-muted transition"
  }, "Receive Payment"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border bg-white"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('customers'),
    className: "text-left p-3 border-r border-b border-alif-border hover:bg-alif-muted transition flex items-center justify-between"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-alif-black"
  }, "Customers"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] text-alif-grey mt-0.5"
  }, "Client directory")), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs text-alif-grey"
  }, "\u2192")), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('catalogue'),
    className: "text-left p-3 border-r border-b border-alif-border hover:bg-alif-muted transition flex items-center justify-between"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-alif-black"
  }, "Catalogue"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] text-alif-grey mt-0.5"
  }, "Services & fabric")), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs text-alif-grey"
  }, "\u2192")), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('reports'),
    className: "text-left p-3 border-r border-b border-alif-border hover:bg-alif-muted transition flex items-center justify-between"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-alif-black"
  }, "Sales Reports"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] text-alif-grey mt-0.5"
  }, "Period & CSV")), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs text-alif-grey"
  }, "\u2192")), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('settings'),
    className: "text-left p-3 border-r border-b border-alif-border hover:bg-alif-muted transition flex items-center justify-between"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-alif-black"
  }, "Backup & Shop"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] text-alif-grey mt-0.5"
  }, "JSON & preferences")), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs text-alif-grey"
  }, "\u2192")))), /*#__PURE__*/_react.default.createElement("section", {
    "aria-label": "Financial Summary"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label mb-2.5"
  }, "Daily Financial Summary"), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 lg:grid-cols-4 border-t border-l border-alif-border bg-white"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Today's Invoice Value"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl sm:text-2xl font-normal text-alif-black mt-2 font-mono",
    "data-testid": "metric-today-invoice-value"
  }, (0, _currency.formatINR)(metrics.todayInvoiceValuePaise)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] uppercase tracking-wider text-alif-grey mt-1.5"
  }, "Excludes cancelled")), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Payments Received"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl sm:text-2xl font-normal text-alif-black mt-2 font-mono",
    "data-testid": "metric-today-payments"
  }, (0, _currency.formatINR)(metrics.todayPaymentsReceivedPaise)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] uppercase tracking-wider text-alif-grey mt-1.5"
  }, "Advances + balance")), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Outstanding Balance"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl sm:text-2xl font-normal text-alif-black mt-2 font-mono",
    "data-testid": "metric-outstanding-balance"
  }, (0, _currency.formatINR)(metrics.totalOutstandingPaise)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] uppercase tracking-wider text-alif-grey mt-1.5"
  }, metrics.outstandingInvoiceCount, " pending bill(s)")), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Today's Invoice Count"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl sm:text-2xl font-normal text-alif-black mt-2 font-mono",
    "data-testid": "metric-today-count"
  }, metrics.todayInvoiceCount), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] uppercase tracking-wider text-alif-grey mt-1.5"
  }, "Active bills today")))), /*#__PURE__*/_react.default.createElement("section", {
    className: "space-y-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-baseline justify-between border-b border-black pb-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "Recent Invoices"), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[11px] text-alif-grey mt-0.5"
  }, "Select any record to log payment, print receipt, or share PDF")), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('invoices'),
    className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-alif-black underline hover:text-alif-grey"
  }, "View All")), metrics.recentInvoices.length === 0 ? /*#__PURE__*/_react.default.createElement("div", {
    className: "py-12 px-4 text-center border border-alif-border bg-white space-y-4"
  }, /*#__PURE__*/_react.default.createElement("p", {
    className: "text-xs uppercase tracking-[0.14em] text-alif-grey"
  }, "No tailoring bills recorded yet"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onNavigate('create-bill'),
    className: "px-5 py-2.5 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
  }, "+ Create First Bill")) : /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-alif-border divide-y"
  }, metrics.recentInvoices.map(inv => /*#__PURE__*/_react.default.createElement("div", {
    key: inv.id,
    onClick: () => onSelectInvoice(inv),
    className: "p-4 hover:bg-stone-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "min-w-0 space-y-1"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2.5 flex-wrap"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-xs font-semibold tracking-wider text-alif-black"
  }, inv.invoiceNumber), /*#__PURE__*/_react.default.createElement(_StatusBadge.StatusBadge, {
    status: inv.status
  }), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[11px] font-mono text-alif-grey"
  }, inv.invoiceDate), inv.collectionDate && /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[10px] uppercase tracking-wider text-alif-charcoal border border-alif-border px-1.5 py-0.5"
  }, "Due ", inv.collectionDate)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-sm font-medium text-alif-black truncate"
  }, inv.customerName, ' ', /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs font-mono text-alif-grey ml-1"
  }, inv.customerPhone)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xs text-alif-grey truncate"
  }, inv.items.map(i => `${i.name} ×${i.quantity}`).join(' / '))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex sm:flex-col items-baseline sm:items-end justify-between border-t sm:border-t-0 pt-2.5 sm:pt-0 border-alif-border shrink-0"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono text-sm font-semibold text-alif-black"
  }, (0, _currency.formatINR)(inv.totalPaise)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] font-mono text-alif-grey mt-0.5"
  }, "Paid ", (0, _currency.formatINR)(inv.paidPaise), inv.balancePaise > 0 && inv.status !== 'Cancelled' && /*#__PURE__*/_react.default.createElement("span", {
    className: "text-alif-black font-semibold ml-2"
  }, "\u2022 Bal ", (0, _currency.formatINR)(inv.balancePaise)))))))));
}
  };
  __modules["./src/components/InvoiceDetailModal"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InvoiceDetailModal = InvoiceDetailModal;
var _react = _interopRequireWildcard(__req("react"));
var _currency = __req("../utils/currency");
var _pdf = __req("../utils/pdf");
var _billingService = __req("../services/billingService");
var _StatusBadge = __req("./StatusBadge");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function InvoiceDetailModal({
  invoiceId,
  settings,
  onClose,
  onUpdated,
  onNotify
}) {
  const [invoice, setInvoice] = (0, _react.useState)(null);
  const [payments, setPayments] = (0, _react.useState)([]);
  const [loading, setLoading] = (0, _react.useState)(true);
  const [payType, setPayType] = (0, _react.useState)('payment');
  const [payAmountRupees, setPayAmountRupees] = (0, _react.useState)('');
  const [payMethod, setPayMethod] = (0, _react.useState)(settings.defaultPaymentMethod || 'cash');
  const [payDate, setPayDate] = (0, _react.useState)((0, _billingService.getTodayIsoDate)());
  const [payNote, setPayNote] = (0, _react.useState)('');
  const [submittingPay, setSubmittingPay] = (0, _react.useState)(false);
  const [isEditingBill, setIsEditingBill] = (0, _react.useState)(false);
  const [editLines, setEditLines] = (0, _react.useState)([]);
  const [editDiscountType, setEditDiscountType] = (0, _react.useState)('flat');
  const [editDiscountValue, setEditDiscountValue] = (0, _react.useState)('0');
  const [editCollectionDate, setEditCollectionDate] = (0, _react.useState)('');
  const [editNotes, setEditNotes] = (0, _react.useState)('');
  const [showCancelPrompt, setShowCancelPrompt] = (0, _react.useState)(false);
  const [cancelReason, setCancelReason] = (0, _react.useState)('');
  const [confirmReopenOpen, setConfirmReopenOpen] = (0, _react.useState)(false);
  async function loadDetails() {
    setLoading(true);
    try {
      const data = await (0, _billingService.getInvoiceDetails)(invoiceId);
      setInvoice(data.invoice);
      setPayments(data.payments);
      if (data.invoice.balancePaise > 0) {
        setPayAmountRupees((0, _currency.paiseToRupeesString)(data.invoice.balancePaise));
      } else {
        setPayAmountRupees('');
      }
      setEditLines(data.invoice.items.map(it => ({
        id: it.id,
        catalogueItemId: it.catalogueItemId,
        name: it.name,
        category: it.category,
        quantity: String(it.quantity),
        unit: it.unit,
        unitPriceRupees: (0, _currency.paiseToRupeesString)(it.unitPricePaise),
        costPricePaise: it.costPricePaise,
        notes: it.notes || ''
      })));
      setEditDiscountType(data.invoice.discountType);
      setEditDiscountValue(data.invoice.discountType === 'flat' ? (0, _currency.paiseToRupeesString)(data.invoice.discountValue) : String(data.invoice.discountValue));
      setEditCollectionDate(data.invoice.collectionDate || '');
      setEditNotes(data.invoice.notes || '');
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Could not load invoice details', true);
    } finally {
      setLoading(false);
    }
  }
  (0, _react.useEffect)(() => {
    loadDetails();
  }, [invoiceId]);
  if (loading || !invoice) {
    return /*#__PURE__*/_react.default.createElement("div", {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    }, /*#__PURE__*/_react.default.createElement("div", {
      className: "bg-white border border-black p-6 text-xs uppercase tracking-widest font-semibold"
    }, "Loading invoice receipt..."));
  }
  async function handleRecordPayment(e) {
    e.preventDefault();
    if (!invoice || submittingPay) return;
    let amountPaise = 0;
    try {
      amountPaise = (0, _currency.rupeesToPaise)(payAmountRupees);
    } catch (_err) {
      onNotify('Enter a valid amount in Rupees', true);
      return;
    }
    if (amountPaise === 0) {
      onNotify('Payment amount cannot be zero', true);
      return;
    }
    setSubmittingPay(true);
    try {
      const res = await (0, _billingService.recordInvoicePayment)({
        invoiceId: invoice.id,
        amountPaise,
        method: payMethod,
        type: payType,
        date: payDate,
        note: payNote
      });
      setInvoice(res.invoice);
      setPayments(res.allPayments);
      setPayNote('');
      setPayAmountRupees(res.invoice.balancePaise > 0 ? (0, _currency.paiseToRupeesString)(res.invoice.balancePaise) : '');
      onUpdated();
      onNotify(`Recorded ${payType} of ${(0, _currency.formatINR)(Math.abs(amountPaise))}`);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to record transaction', true);
    } finally {
      setSubmittingPay(false);
    }
  }
  async function handleCancelInvoice() {
    if (!invoice) return;
    if (!cancelReason.trim()) {
      onNotify('Please enter a reason for cancelling this bill', true);
      return;
    }
    try {
      const updated = await (0, _billingService.cancelInvoice)(invoice.id, cancelReason.trim());
      setInvoice(updated);
      setShowCancelPrompt(false);
      setCancelReason('');
      onUpdated();
      onNotify(`Cancelled invoice ${updated.invoiceNumber}`);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to cancel invoice', true);
    }
  }
  async function handleSaveEditedInvoice() {
    if (!invoice) return;
    try {
      const parsedItems = editLines.map(l => ({
        id: l.id,
        catalogueItemId: l.catalogueItemId,
        name: l.name.trim(),
        category: l.category,
        quantity: Number(l.quantity) || 1,
        unit: l.unit.trim() || 'pc',
        unitPricePaise: (0, _currency.rupeesToPaise)(l.unitPriceRupees || '0'),
        costPricePaise: l.costPricePaise,
        notes: l.notes.trim() || undefined
      }));
      const discVal = editDiscountType === 'flat' ? (0, _currency.rupeesToPaise)(editDiscountValue || '0') : Number(editDiscountValue) || 0;
      const updated = await (0, _billingService.reopenAndUpdateInvoice)({
        invoiceId: invoice.id,
        items: parsedItems,
        discountType: editDiscountType,
        discountValue: discVal,
        collectionDate: editCollectionDate,
        notes: editNotes
      });
      setInvoice(updated);
      setIsEditingBill(false);
      setConfirmReopenOpen(false);
      onUpdated();
      onNotify(`Updated & recalculated invoice ${updated.invoiceNumber}`);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to update invoice', true);
    }
  }
  async function handleNativeShare() {
    if (!invoice) return;
    const res = await (0, _pdf.shareInvoicePdf)(invoice, payments, settings);
    onNotify(res.message);
  }
  function handleDownloadPdf() {
    if (!invoice) return;
    const filename = (0, _pdf.downloadInvoicePdf)(invoice, payments, settings);
    onNotify(`Downloaded ${filename}`);
  }
  const whatsappUrl = (0, _pdf.buildWhatsAppShareUrl)(invoice, settings);
  const smsUrl = (0, _pdf.buildSmsShareUrl)(invoice, settings);
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4",
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-black max-w-3xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-6"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-start justify-between gap-3 border-b border-black pb-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, settings.shopName, " \u2022 ", settings.city, ", ", settings.state), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2.5 flex-wrap"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-base sm:text-lg font-semibold tracking-wider text-alif-black"
  }, invoice.invoiceNumber), /*#__PURE__*/_react.default.createElement(_StatusBadge.StatusBadge, {
    status: invoice.status
  })), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[11px] font-mono text-alif-grey"
  }, "Issued: ", invoice.invoiceDate, invoice.collectionDate ? `  |  Collection: ${invoice.collectionDate}` : '')), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: onClose,
    "data-testid": "btn-close-invoice-modal",
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] border border-alif-border text-alif-black hover:border-black"
  }, "Close \u2715")), invoice.status === 'Cancelled' && /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-alif-muted border border-black p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xs text-alif-black"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-semibold uppercase tracking-wider"
  }, "Cancelled Bill:"), ' ', invoice.cancelReason || 'Cancelled', invoice.cancelledAt && /*#__PURE__*/_react.default.createElement("span", {
    className: "text-alif-grey font-mono ml-1.5"
  }, "(", invoice.cancelledAt.slice(0, 10), ")")), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setConfirmReopenOpen(true),
    "data-testid": "btn-reopen-invoice",
    className: "px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-white text-alif-black border border-black hover:bg-stone-50 shrink-0"
  }, "Reopen Invoice")), /*#__PURE__*/_react.default.createElement("div", {
    className: "border-t border-b border-alif-border py-3.5 space-y-2.5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Receipt Export & Client Dispatch"), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleDownloadPdf,
    "data-testid": "btn-download-pdf",
    className: "px-3.5 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.15em] hover:bg-zinc-800"
  }, "Download PDF"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => (0, _pdf.printInvoiceReceipt)(invoice, payments, settings),
    className: "px-3.5 py-2 bg-white text-alif-black border border-alif-border text-[10px] font-semibold uppercase tracking-[0.15em] hover:border-black"
  }, "Print Receipt"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleNativeShare,
    className: "px-3.5 py-2 bg-white text-alif-black border border-alif-border text-[10px] font-semibold uppercase tracking-[0.15em] hover:border-black"
  }, "Share PDF"), /*#__PURE__*/_react.default.createElement("a", {
    href: whatsappUrl,
    target: "_blank",
    rel: "noopener noreferrer",
    "data-testid": "link-whatsapp-share",
    className: "px-3.5 py-2 bg-alif-charcoal text-white text-[10px] font-semibold uppercase tracking-[0.15em] hover:bg-black inline-flex items-center"
  }, "WhatsApp Summary"), /*#__PURE__*/_react.default.createElement("a", {
    href: smsUrl,
    "data-testid": "link-sms-share",
    className: "px-3.5 py-2 bg-white text-alif-black border border-alif-border text-[10px] font-semibold uppercase tracking-[0.15em] hover:border-black inline-flex items-center"
  }, "SMS Summary")), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[10px] text-alif-grey"
  }, "WhatsApp and SMS actions prefill the client's number and invoice summary in your messaging app for manual review before sending.")), /*#__PURE__*/_react.default.createElement("div", {
    className: "border border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-stone-50 px-4 py-2.5 border-b border-alif-border flex flex-wrap items-center justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xs"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "editorial-label mr-2"
  }, "Client"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-semibold text-alif-black"
  }, invoice.customerName), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-alif-grey ml-2"
  }, invoice.customerPhone)), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setIsEditingBill(!isEditingBill),
    className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-alif-black underline"
  }, isEditingBill ? 'Cancel Editing' : 'Edit / Reopen Bill Items')), !isEditingBill ? /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 space-y-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "divide-y"
  }, invoice.items.map((item, idx) => /*#__PURE__*/_react.default.createElement("div", {
    key: item.id,
    className: "py-2.5 flex items-start justify-between gap-3 text-xs"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "font-medium text-alif-black"
  }, idx + 1, ". ", item.name, ' ', /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[9px] uppercase tracking-widest text-alif-grey ml-1.5"
  }, "[", item.category, "]")), /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono text-[11px] text-alif-grey mt-0.5"
  }, item.quantity, " ", item.unit, " \xD7 ", (0, _currency.formatINR)(item.unitPricePaise), item.notes ? ` — ${item.notes}` : '')), /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono font-semibold text-alif-black shrink-0"
  }, (0, _currency.formatINR)(item.lineTotalPaise))))), invoice.notes && /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xs bg-stone-50 p-3 border-t border-b border-alif-border text-alif-charcoal"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "editorial-label mr-2"
  }, "Notes:"), " ", invoice.notes), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border text-xs"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "p-3 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Subtotal"), /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono font-medium mt-1"
  }, (0, _currency.formatINR)(invoice.subtotalPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-3 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Discount"), /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono font-medium mt-1"
  }, "- ", (0, _currency.formatINR)(invoice.discountPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-3 border-r border-b border-alif-border bg-stone-50"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Final Total"), /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono font-semibold text-sm text-alif-black mt-1",
    "data-testid": "detail-total"
  }, (0, _currency.formatINR)(invoice.totalPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-3 border-r border-b border-alif-border bg-alif-muted"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Balance Due"), /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono font-semibold text-sm text-alif-black mt-1",
    "data-testid": "detail-balance"
  }, (0, _currency.formatINR)(invoice.balancePaise))))) : /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 space-y-3 bg-stone-50"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-subhead"
  }, "Edit Line Items & Recalculate (Payment history preserved)"), editLines.map((line, idx) => /*#__PURE__*/_react.default.createElement("div", {
    key: line.id,
    className: "grid grid-cols-1 sm:grid-cols-4 gap-2 bg-white p-2.5 border border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: line.name,
    onChange: e => {
      const copy = [...editLines];
      copy[idx] = {
        ...copy[idx],
        name: e.target.value
      };
      setEditLines(copy);
    },
    className: "px-2 py-1.5 text-xs border border-alif-border",
    placeholder: "Item name"
  }), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0.1",
    step: "any",
    value: line.quantity,
    onChange: e => {
      const copy = [...editLines];
      copy[idx] = {
        ...copy[idx],
        quantity: e.target.value
      };
      setEditLines(copy);
    },
    className: "px-2 py-1.5 text-xs font-mono border border-alif-border",
    placeholder: "Qty"
  }), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: line.unitPriceRupees,
    onChange: e => {
      const copy = [...editLines];
      copy[idx] = {
        ...copy[idx],
        unitPriceRupees: e.target.value
      };
      setEditLines(copy);
    },
    className: "px-2 py-1.5 text-xs font-mono border border-alif-border",
    placeholder: "Price (\u20B9)"
  }), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-1"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: line.notes,
    onChange: e => {
      const copy = [...editLines];
      copy[idx] = {
        ...copy[idx],
        notes: e.target.value
      };
      setEditLines(copy);
    },
    className: "flex-1 px-2 py-1.5 text-xs border border-alif-border",
    placeholder: "Note"
  }), editLines.length > 1 && /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setEditLines(editLines.filter((_, i) => i !== idx)),
    className: "px-2 py-1 text-xs text-alif-charcoal border border-alif-border"
  }, "\u2715")))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Discount (", editDiscountType, ")"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    step: "any",
    value: editDiscountValue,
    onChange: e => setEditDiscountValue(e.target.value),
    className: "w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Collection Date"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: editCollectionDate,
    onChange: e => setEditCollectionDate(e.target.value),
    className: "w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Bill Notes"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: editNotes,
    onChange: e => setEditNotes(e.target.value),
    className: "w-full px-2.5 py-1.5 text-xs border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-end gap-2 pt-2"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setIsEditingBill(false),
    className: "px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest border border-alif-border bg-white"
  }, "Cancel"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleSaveEditedInvoice,
    className: "px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest bg-alif-black text-white"
  }, "Save Updated Bill")))), /*#__PURE__*/_react.default.createElement("form", {
    onSubmit: handleRecordPayment,
    className: "border border-alif-border p-4 space-y-3.5 bg-stone-50"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-2 border-b border-alif-border pb-2.5"
  }, /*#__PURE__*/_react.default.createElement("h4", {
    className: "editorial-subhead"
  }, "Record Payment, Refund or Correction"), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex gap-1"
  }, ['payment', 'refund', 'correction'].map(t => /*#__PURE__*/_react.default.createElement("button", {
    key: t,
    type: "button",
    onClick: () => setPayType(t),
    className: `px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] border font-semibold ${payType === t ? 'bg-alif-black text-white border-black' : 'bg-white text-alif-charcoal border-alif-border'}`
  }, t === 'payment' ? 'Receive Payment' : t === 'refund' ? 'Issue Refund' : 'Correction')))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-4 gap-2.5"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Amount (\u20B9) *"), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex gap-1"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    step: "any",
    value: payAmountRupees,
    onChange: e => setPayAmountRupees(e.target.value),
    placeholder: "0",
    "data-testid": "input-record-payment-amount",
    className: "w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
  }), payType === 'payment' && invoice.balancePaise > 0 && /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setPayAmountRupees((0, _currency.paiseToRupeesString)(invoice.balancePaise)),
    className: "px-2 py-1 text-[9px] uppercase tracking-wider font-semibold border border-alif-border bg-white hover:border-black shrink-0"
  }, "Full"))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Method"), /*#__PURE__*/_react.default.createElement("select", {
    value: payMethod,
    onChange: e => setPayMethod(e.target.value),
    "data-testid": "select-record-payment-method",
    className: "w-full px-2.5 py-1.5 text-xs border border-alif-border bg-white"
  }, /*#__PURE__*/_react.default.createElement("option", {
    value: "cash"
  }, "Cash"), /*#__PURE__*/_react.default.createElement("option", {
    value: "upi"
  }, "UPI"), /*#__PURE__*/_react.default.createElement("option", {
    value: "bank_transfer"
  }, "Bank Transfer"), /*#__PURE__*/_react.default.createElement("option", {
    value: "other"
  }, "Other"))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Date"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: payDate,
    onChange: e => setPayDate(e.target.value),
    className: "w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Note ", payType !== 'payment' ? '*' : ''), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: payNote,
    onChange: e => setPayNote(e.target.value),
    placeholder: payType === 'payment' ? 'Paid on collection' : 'Mandatory audit note',
    "data-testid": "input-record-payment-note",
    className: "w-full px-2.5 py-1.5 text-xs border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-end"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "submit",
    disabled: submittingPay,
    "data-testid": "btn-submit-payment",
    className: "px-4 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
  }, submittingPay ? 'Saving...' : payType === 'payment' ? '+ Record Payment' : payType === 'refund' ? 'Record Refund' : 'Record Correction'))), /*#__PURE__*/_react.default.createElement("div", {
    className: "border border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-stone-50 px-4 py-2.5 border-b border-alif-border flex items-center justify-between"
  }, /*#__PURE__*/_react.default.createElement("h4", {
    className: "editorial-subhead"
  }, "Payment History (", payments.length, ")"), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs font-mono font-semibold text-alif-black",
    "data-testid": "detail-net-paid"
  }, "Net Paid: ", (0, _currency.formatINR)(invoice.paidPaise))), payments.length === 0 ? /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 text-xs text-alif-grey text-center uppercase tracking-wider"
  }, "No payments recorded yet") : /*#__PURE__*/_react.default.createElement("div", {
    className: "divide-y"
  }, payments.map(p => /*#__PURE__*/_react.default.createElement("div", {
    key: p.id,
    className: "px-4 py-2.5 flex items-center justify-between text-xs"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-semibold uppercase tracking-wider text-alif-black"
  }, p.type), /*#__PURE__*/_react.default.createElement("span", {
    className: "px-1.5 py-0.5 border border-alif-border text-[9px] uppercase tracking-wider text-alif-grey"
  }, _currency.PAYMENT_METHOD_LABELS[p.method] || p.method), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-alif-grey"
  }, p.date)), p.note && /*#__PURE__*/_react.default.createElement("div", {
    className: "text-alif-grey mt-0.5"
  }, p.note)), /*#__PURE__*/_react.default.createElement("div", {
    className: "font-mono font-semibold text-alif-black"
  }, p.type === 'refund' ? '- ' : '+ ', (0, _currency.formatINR)(Math.abs(p.amountPaise))))))), invoice.status !== 'Cancelled' && /*#__PURE__*/_react.default.createElement("div", {
    className: "border-t border-alif-border pt-3 flex items-center justify-between"
  }, !showCancelPrompt ? /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setShowCancelPrompt(true),
    "data-testid": "btn-open-cancel-invoice",
    className: "text-[10px] font-semibold uppercase tracking-[0.15em] text-alif-grey hover:text-alif-black underline"
  }, "Cancel This Invoice...") : /*#__PURE__*/_react.default.createElement("div", {
    className: "w-full bg-stone-50 border border-black p-3.5 space-y-2.5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] font-semibold uppercase tracking-wider text-alif-black"
  }, "Cancel Invoice ", invoice.invoiceNumber, " (Preserves historical ledger)"), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row gap-2"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: cancelReason,
    onChange: e => setCancelReason(e.target.value),
    placeholder: "Enter mandatory cancellation reason...",
    "data-testid": "input-cancel-reason",
    className: "flex-1 px-3 py-1.5 text-xs border border-alif-border bg-white"
  }), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setShowCancelPrompt(false),
    className: "px-3 py-1.5 text-[10px] uppercase tracking-widest border border-alif-border bg-white"
  }, "Back"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleCancelInvoice,
    "data-testid": "btn-confirm-cancel-invoice",
    className: "px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest bg-alif-black text-white"
  }, "Confirm Cancel"))))), /*#__PURE__*/_react.default.createElement(_StatusBadge.ConfirmDialog, {
    open: confirmReopenOpen,
    title: `Reopen Invoice ${invoice.invoiceNumber}?`,
    message: "Reopening this bill restores its active status and recalculates the outstanding balance based on its preserved payment history.",
    confirmLabel: "Reopen Bill",
    onConfirm: handleSaveEditedInvoice,
    onCancel: () => setConfirmReopenOpen(false)
  })));
}
  };
  __modules["./src/components/InvoicesHistoryView"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InvoicesHistoryView = InvoicesHistoryView;
var _react = _interopRequireWildcard(__req("react"));
var _currency = __req("../utils/currency");
var _pdf = __req("../utils/pdf");
var _billingService = __req("../services/billingService");
var _StatusBadge = __req("./StatusBadge");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function InvoicesHistoryView({
  invoices,
  settings,
  onSelectInvoice,
  onNotify
}) {
  const [search, setSearch] = (0, _react.useState)('');
  const [statusFilter, setStatusFilter] = (0, _react.useState)('All');
  const [startDate, setStartDate] = (0, _react.useState)('');
  const [endDate, setEndDate] = (0, _react.useState)('');
  const filtered = (0, _react.useMemo)(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'All' && inv.status !== statusFilter) return false;
      if (startDate && inv.invoiceDate < startDate) return false;
      if (endDate && inv.invoiceDate > endDate) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches = inv.invoiceNumber.toLowerCase().includes(q) || inv.customerName.toLowerCase().includes(q) || inv.customerPhone.toLowerCase().includes(q) || inv.items.some(i => i.name.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [invoices, search, statusFilter, startDate, endDate]);
  const totals = (0, _react.useMemo)(() => {
    let activeTotalPaise = 0;
    let paidPaise = 0;
    let balancePaise = 0;
    for (const inv of filtered) {
      if (inv.status !== 'Cancelled') {
        activeTotalPaise += inv.totalPaise;
        balancePaise += inv.balancePaise;
      }
      paidPaise += inv.paidPaise;
    }
    return {
      activeTotalPaise,
      paidPaise,
      balancePaise
    };
  }, [filtered]);
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/_react.default.createElement("section", {
    className: "space-y-4 border-b border-black pb-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-end justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Archive & Ledger"), /*#__PURE__*/_react.default.createElement("h2", {
    className: "font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5"
  }, "Invoice History")), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      const today = (0, _billingService.getTodayIsoDate)();
      setStartDate(today);
      setEndDate(today);
    },
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Today Only"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      setSearch('');
      setStatusFilter('All');
      setStartDate('');
      setEndDate('');
    },
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Reset"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Search Invoice / Client / Phone"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "ALIF-2026-0001 or client...",
    "data-testid": "input-invoice-search",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "From Date"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: startDate,
    onChange: e => setStartDate(e.target.value),
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "To Date"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: endDate,
    onChange: e => setEndDate(e.target.value),
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-1.5 pt-1"
  }, ['All', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled'].map(st => /*#__PURE__*/_react.default.createElement("button", {
    key: st,
    type: "button",
    onClick: () => setStatusFilter(st),
    "data-testid": `filter-status-${st}`,
    className: `px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] border font-semibold transition ${statusFilter === st ? 'bg-alif-black text-white border-black' : 'bg-white text-alif-charcoal border-alif-border hover:border-black'}`
  }, st)))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-3 border-t border-l border-alif-border bg-white"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "p-3.5 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "editorial-label block"
  }, "Active Value (", filtered.length, ")"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono font-semibold text-sm text-alif-black mt-1 block"
  }, (0, _currency.formatINR)(totals.activeTotalPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-3.5 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "editorial-label block"
  }, "Net Paid"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono font-semibold text-sm text-alif-black mt-1 block"
  }, (0, _currency.formatINR)(totals.paidPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-3.5 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "editorial-label block"
  }, "Outstanding"), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono font-semibold text-sm text-alif-black mt-1 block"
  }, (0, _currency.formatINR)(totals.balancePaise)))), /*#__PURE__*/_react.default.createElement("section", {
    className: "bg-white border border-alif-border"
  }, filtered.length === 0 ? /*#__PURE__*/_react.default.createElement("div", {
    className: "p-10 text-center text-xs uppercase tracking-wider text-alif-grey"
  }, "No invoices match the current filter criteria.") : /*#__PURE__*/_react.default.createElement("div", {
    className: "divide-y"
  }, filtered.map(inv => /*#__PURE__*/_react.default.createElement("div", {
    key: inv.id,
    "data-testid": `invoice-row-${inv.invoiceNumber}`,
    className: "p-4 hover:bg-stone-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-1 min-w-0"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-2.5 flex-wrap"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onSelectInvoice(inv),
    className: "font-mono text-xs font-semibold tracking-wider text-alif-black hover:underline"
  }, inv.invoiceNumber), /*#__PURE__*/_react.default.createElement(_StatusBadge.StatusBadge, {
    status: inv.status
  }), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[11px] font-mono text-alif-grey"
  }, inv.invoiceDate), inv.collectionDate && /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-alif-border text-alif-charcoal"
  }, "Due ", inv.collectionDate)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-sm font-medium text-alif-black"
  }, inv.customerName, ' ', /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs font-mono text-alif-grey ml-1"
  }, inv.customerPhone)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xs text-alif-grey truncate"
  }, inv.items.map(it => `${it.name} ×${it.quantity}`).join(' / ')), inv.status === 'Cancelled' && inv.cancelReason && /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] text-alif-grey italic"
  }, "Reason: ", inv.cancelReason)), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:items-end justify-between gap-2 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-alif-border shrink-0"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex sm:flex-col items-baseline sm:items-end justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono text-sm font-semibold text-alif-black"
  }, (0, _currency.formatINR)(inv.totalPaise)), /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[11px] font-mono text-alif-grey"
  }, "Paid ", (0, _currency.formatINR)(inv.paidPaise), " \u2022", ' ', /*#__PURE__*/_react.default.createElement("strong", {
    className: "text-alif-black"
  }, "Bal ", (0, _currency.formatINR)(inv.balancePaise)))), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => onSelectInvoice(inv),
    "data-testid": `btn-open-${inv.invoiceNumber}`,
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-alif-black text-white hover:bg-zinc-800"
  }, "Open / Pay"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      (0, _pdf.downloadInvoicePdf)(inv, [], settings);
      onNotify(`Downloaded ${inv.invoiceNumber}.pdf`);
    },
    className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "PDF"), /*#__PURE__*/_react.default.createElement("a", {
    href: (0, _pdf.buildWhatsAppShareUrl)(inv, settings),
    target: "_blank",
    rel: "noopener noreferrer",
    className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white text-alif-black hover:border-black"
  }, "WhatsApp"))))))));
}
  };
  __modules["./src/components/ReportsView"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ReportsView = ReportsView;
var _react = _interopRequireWildcard(__req("react"));
var _currency = __req("../utils/currency");
var _csv = __req("../utils/csv");
var _billingService = __req("../services/billingService");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function ReportsView({
  invoices,
  payments,
  onNotify
}) {
  const today = (0, _billingService.getTodayIsoDate)();
  const [startDate, setStartDate] = (0, _react.useState)(today);
  const [endDate, setEndDate] = (0, _react.useState)(today);
  const [report, setReport] = (0, _react.useState)(null);
  (0, _react.useEffect)(() => {
    (0, _billingService.getPeriodReport)(startDate, endDate).then(setReport).catch(() => {});
  }, [startDate, endDate, invoices, payments]);
  function applyPreset(preset) {
    const now = new Date();
    const todayStr = (0, _billingService.getTodayIsoDate)();
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const y = past.getFullYear();
      const m = String(past.getMonth() + 1).padStart(2, '0');
      const d = String(past.getDate()).padStart(2, '0');
      setStartDate(`${y}-${m}-${d}`);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(todayStr);
    } else {
      setStartDate('2020-01-01');
      setEndDate('2099-12-31');
    }
  }
  function handleExportReportCsv() {
    if (!report) return;
    const csv = (0, _csv.generatePeriodReportCsv)(report);
    const filename = `ALiF-Report-${startDate}-to-${endDate}.csv`;
    (0, _csv.triggerTextFileDownload)(filename, csv);
    onNotify(`Exported ${filename}`);
  }
  function handleExportPeriodInvoicesCsv() {
    const periodInvoices = invoices.filter(i => i.invoiceDate >= startDate && i.invoiceDate <= endDate);
    const csv = (0, _csv.generateInvoicesCsv)(periodInvoices);
    const filename = `ALiF-Invoices-${startDate}-to-${endDate}.csv`;
    (0, _csv.triggerTextFileDownload)(filename, csv);
    onNotify(`Exported ${filename}`);
  }
  function handleExportPeriodPaymentsCsv() {
    const periodPayments = payments.filter(p => p.date >= startDate && p.date <= endDate);
    const csv = (0, _csv.generatePaymentsCsv)(periodPayments);
    const filename = `ALiF-Payments-${startDate}-to-${endDate}.csv`;
    (0, _csv.triggerTextFileDownload)(filename, csv);
    onNotify(`Exported ${filename}`);
  }
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-8"
  }, /*#__PURE__*/_react.default.createElement("section", {
    className: "border-b border-black pb-5 space-y-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-end justify-between gap-3"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Financial Analytics"), /*#__PURE__*/_react.default.createElement("h2", {
    className: "font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5"
  }, "Sales & Collections Report"), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[11px] text-alif-grey mt-0.5"
  }, "Separates invoiced sales value from actual payments collected. Cancelled bills are excluded from sales totals.")), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => applyPreset('today'),
    className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Today"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => applyPreset('7days'),
    className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Last 7 Days"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => applyPreset('month'),
    className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "This Month"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => applyPreset('all'),
    "data-testid": "btn-report-all-time",
    className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "All Time"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Start Date"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: startDate,
    onChange: e => setStartDate(e.target.value),
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "End Date"), /*#__PURE__*/_react.default.createElement("input", {
    type: "date",
    value: endDate,
    onChange: e => setEndDate(e.target.value),
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleExportReportCsv,
    "data-testid": "btn-export-report-csv",
    className: "px-3.5 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-zinc-800"
  }, "Export Summary CSV"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleExportPeriodInvoicesCsv,
    className: "px-2.5 py-2 border border-alif-border bg-white text-[10px] font-semibold uppercase tracking-[0.14em] hover:border-black"
  }, "Invoices CSV"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleExportPeriodPaymentsCsv,
    className: "px-2.5 py-2 border border-alif-border bg-white text-[10px] font-semibold uppercase tracking-[0.14em] hover:border-black"
  }, "Payments CSV")))), report && /*#__PURE__*/_react.default.createElement(_react.default.Fragment, null, /*#__PURE__*/_react.default.createElement("section", {
    className: "grid grid-cols-2 lg:grid-cols-4 border-t border-l border-alif-border bg-white"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Invoiced Sales Value"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl font-mono font-normal text-alif-black mt-2",
    "data-testid": "report-invoiced-sales"
  }, (0, _currency.formatINR)(report.invoicedSalesPaise)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] font-mono text-alif-grey mt-1.5"
  }, report.activeInvoiceCount, " active \u2022 Disc ", (0, _currency.formatINR)(report.discountsGivenPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Net Payments Collected"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl font-mono font-normal text-alif-black mt-2",
    "data-testid": "report-net-payments"
  }, (0, _currency.formatINR)(report.netCashCollectedPaise)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] font-mono text-alif-grey mt-1.5"
  }, "Gross ", (0, _currency.formatINR)(report.paymentsReceivedPaise), " \u2022 Ref ", (0, _currency.formatINR)(report.refundsIssuedPaise))), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Period Outstanding"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl font-mono font-normal text-alif-black mt-2",
    "data-testid": "report-outstanding"
  }, (0, _currency.formatINR)(report.outstandingBalancePaise)), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] uppercase tracking-wider text-alif-grey mt-1.5"
  }, "Uncollected balance")), /*#__PURE__*/_react.default.createElement("div", {
    className: "p-4 border-r border-b border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Active / Cancelled"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xl font-mono font-normal text-alif-black mt-2"
  }, report.activeInvoiceCount, ' ', /*#__PURE__*/_react.default.createElement("span", {
    className: "text-xs text-alif-grey"
  }, "/ ", report.cancelledInvoiceCount, " cancelled")), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[10px] uppercase tracking-wider text-alif-grey mt-1.5"
  }, "Cancelled excluded"))), /*#__PURE__*/_react.default.createElement("section", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-6"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "px-4 py-3 border-b border-alif-border bg-stone-50"
  }, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "Collections by Payment Method")), /*#__PURE__*/_react.default.createElement("div", {
    className: "divide-y px-4"
  }, ['cash', 'upi', 'bank_transfer', 'other'].map(m => /*#__PURE__*/_react.default.createElement("div", {
    key: m,
    className: "py-2.5 flex items-center justify-between text-xs"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "uppercase tracking-wider text-alif-charcoal"
  }, _currency.PAYMENT_METHOD_LABELS[m]), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono font-semibold text-alif-black"
  }, (0, _currency.formatINR)(report.paymentsByMethod[m] || 0)))))), /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "px-4 py-3 border-b border-alif-border bg-stone-50"
  }, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "Category Breakdown (Active Bills)")), /*#__PURE__*/_react.default.createElement("div", {
    className: "divide-y px-4"
  }, report.categoryBreakdown.map(cat => /*#__PURE__*/_react.default.createElement("div", {
    key: cat.category,
    className: "py-2.5 flex items-center justify-between text-xs"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "font-medium text-alif-black"
  }, cat.label), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] font-mono text-alif-grey"
  }, "Qty: ", cat.quantity, cat.estimatedCostPaise > 0 ? ` • Est. Cost: ${(0, _currency.formatINR)(cat.estimatedCostPaise)}` : '')), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-mono font-semibold text-alif-black"
  }, (0, _currency.formatINR)(cat.revenuePaise))))))), /*#__PURE__*/_react.default.createElement("section", {
    className: "bg-white border border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "px-4 py-3 border-b border-alif-border bg-stone-50"
  }, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "Itemised Service & Material Breakdown (", report.itemBreakdown.length, ")")), report.itemBreakdown.length === 0 ? /*#__PURE__*/_react.default.createElement("div", {
    className: "p-8 text-center text-xs uppercase tracking-wider text-alif-grey"
  }, "No active sales recorded in this period.") : /*#__PURE__*/_react.default.createElement("div", {
    className: "divide-y"
  }, report.itemBreakdown.map(it => /*#__PURE__*/_react.default.createElement("div", {
    key: `${it.category}-${it.name}`,
    className: "px-4 py-2.5 flex items-center justify-between text-xs"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("span", {
    className: "font-medium text-alif-black"
  }, it.name), ' ', /*#__PURE__*/_react.default.createElement("span", {
    className: "text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-alif-border text-alif-grey ml-1.5"
  }, it.category)), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center gap-4 font-mono"
  }, /*#__PURE__*/_react.default.createElement("span", {
    className: "text-alif-grey"
  }, "Qty: ", it.quantity), /*#__PURE__*/_react.default.createElement("span", {
    className: "font-semibold text-alif-black"
  }, (0, _currency.formatINR)(it.revenuePaise)))))))));
}
  };
  __modules["./src/components/SettingsBackupView"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SettingsBackupView = SettingsBackupView;
var _react = _interopRequireWildcard(__req("react"));
var _currency = __req("../utils/currency");
var _csv = __req("../utils/csv");
var _billingService = __req("../services/billingService");
var _StatusBadge = __req("./StatusBadge");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function SettingsBackupView({
  settings,
  customers,
  catalogue,
  invoices,
  payments,
  onRefreshAll,
  onNotify
}) {
  const [shopName, setShopName] = (0, _react.useState)(settings.shopName);
  const [tagline, setTagline] = (0, _react.useState)(settings.tagline);
  const [address, setAddress] = (0, _react.useState)(settings.address);
  const [city, setCity] = (0, _react.useState)(settings.city);
  const [state, setState] = (0, _react.useState)(settings.state);
  const [pinCode, setPinCode] = (0, _react.useState)(settings.pinCode);
  const [phone, setPhone] = (0, _react.useState)(settings.phone);
  const [whatsappNumber, setWhatsappNumber] = (0, _react.useState)(settings.whatsappNumber);
  const [invoicePrefix, setInvoicePrefix] = (0, _react.useState)(settings.invoicePrefix);
  const [nextInvoiceSequence, setNextInvoiceSequence] = (0, _react.useState)(String(settings.nextInvoiceSequence));
  const [defaultPaymentMethod, setDefaultPaymentMethod] = (0, _react.useState)(settings.defaultPaymentMethod);
  const [taxEnabled, setTaxEnabled] = (0, _react.useState)(settings.taxEnabled);
  const [taxLabel, setTaxLabel] = (0, _react.useState)(settings.taxLabel || 'Tax');
  const [taxRatePercent, setTaxRatePercent] = (0, _react.useState)(String(settings.taxRatePercent || 0));
  const [receiptFooter, setReceiptFooter] = (0, _react.useState)(settings.receiptFooter);
  const [jsonImportText, setJsonImportText] = (0, _react.useState)('');
  const [validationResult, setValidationResult] = (0, _react.useState)(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = (0, _react.useState)(false);
  async function handleSaveSettings(e) {
    e.preventDefault();
    try {
      await (0, _billingService.updateShopSettings)({
        shopName: shopName.trim() || 'ALiF Ladies Tailor',
        tagline: tagline.trim(),
        address: address.trim(),
        city: city.trim() || 'Sahibganj',
        state: state.trim() || 'Jharkhand',
        pinCode: pinCode.trim(),
        phone: phone.trim(),
        whatsappNumber: whatsappNumber.trim(),
        invoicePrefix: invoicePrefix.trim().toUpperCase() || 'ALIF',
        nextInvoiceSequence: Math.max(1, parseInt(nextInvoiceSequence, 10) || 1),
        defaultPaymentMethod,
        taxEnabled,
        taxLabel: taxLabel.trim() || 'Tax',
        taxRatePercent: taxEnabled ? Number(taxRatePercent) || 0 : 0,
        receiptFooter: receiptFooter.trim()
      });
      onRefreshAll();
      onNotify('Shop & billing settings saved');
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to save settings', true);
    }
  }
  async function handleExportJsonBackup() {
    try {
      const payload = await (0, _billingService.exportBackupPayload)();
      const jsonStr = JSON.stringify(payload, null, 2);
      const datePart = payload.exportedAt.slice(0, 10);
      const filename = `ALiF-Billing-Backup-${datePart}.json`;
      (0, _csv.triggerTextFileDownload)(filename, jsonStr, 'application/json;charset=utf-8');
      onNotify(`Exported backup ${filename}`);
    } catch (err) {
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Failed to export JSON backup', true);
    }
  }
  function handleValidateImportText(rawText) {
    setJsonImportText(rawText);
    if (!rawText.trim()) {
      setValidationResult(null);
      return;
    }
    try {
      const parsed = JSON.parse(rawText);
      const check = (0, _billingService.validateBackupPayload)(parsed);
      if (check.valid && check.payload) {
        setValidationResult({
          valid: true,
          errors: [],
          parsed,
          summary: `Valid backup (${check.payload.customers.length} customers, ${check.payload.catalogue.length} catalogue items, ${check.payload.invoices.length} invoices, ${check.payload.payments.length} payment records)`
        });
      } else {
        setValidationResult({
          valid: false,
          errors: check.errors
        });
      }
    } catch (err) {
      setValidationResult({
        valid: false,
        errors: [`Invalid JSON syntax: ${(err === null || err === void 0 ? void 0 : err.message) || 'Parse error'}`]
      });
    }
  }
  function handleFileUpload(e) {
    var _e$target$files;
    const file = (_e$target$files = e.target.files) === null || _e$target$files === void 0 ? void 0 : _e$target$files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      handleValidateImportText(content);
    };
    reader.readAsText(file);
  }
  async function handleConfirmRestore() {
    if (!(validationResult !== null && validationResult !== void 0 && validationResult.valid) || !validationResult.parsed) return;
    try {
      const counts = await (0, _billingService.restoreBackupPayload)(validationResult.parsed);
      setConfirmRestoreOpen(false);
      setJsonImportText('');
      setValidationResult(null);
      onRefreshAll();
      onNotify(`Restored ${counts.invoices} invoices, ${counts.customers} customers, and ${counts.payments} payments.`);
    } catch (err) {
      setConfirmRestoreOpen(false);
      onNotify((err === null || err === void 0 ? void 0 : err.message) || 'Restore failed; existing data was protected.', true);
    }
  }
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-8"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "border-b border-black pb-4"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Atelier Configuration & Archive"), /*#__PURE__*/_react.default.createElement("h2", {
    className: "font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5"
  }, "Backup & Shop Settings")), /*#__PURE__*/_react.default.createElement("section", {
    className: "bg-white border border-alif-border p-4 space-y-1.5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-subhead"
  }, "Offline Local Storage & Data Protection Notice"), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-xs text-alif-charcoal leading-relaxed"
  }, "All client records, tailoring bills, catalogue rates and payment ledgers are stored exclusively on this device in browser IndexedDB (", /*#__PURE__*/_react.default.createElement("code", null, "alif_ladies_tailor_db"), "). Zero customer data is transmitted to external servers. Clearing browser data or changing devices will erase unsaved records \u2014 export a validated JSON backup regularly.")), /*#__PURE__*/_react.default.createElement("section", {
    className: "bg-white border border-alif-border p-5 space-y-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-alif-border pb-4"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "01 / Validated JSON Backup & CSV Export"), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-[11px] font-mono text-alif-grey mt-1"
  }, customers.length, " clients \u2022 ", catalogue.length, " catalogue items \u2022 ", invoices.length, " invoices \u2022 ", payments.length, " payments")), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: handleExportJsonBackup,
    "data-testid": "btn-export-json-backup",
    className: "px-4 py-2.5 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.15em] hover:bg-zinc-800 shrink-0"
  }, "Download Full JSON Backup")), /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Individual CSV Table Exports"), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      (0, _csv.triggerTextFileDownload)('ALiF-Invoices.csv', (0, _csv.generateInvoicesCsv)(invoices));
      onNotify('Exported ALiF-Invoices.csv');
    },
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Export Invoices CSV"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      (0, _csv.triggerTextFileDownload)('ALiF-Payments.csv', (0, _csv.generatePaymentsCsv)(payments));
      onNotify('Exported ALiF-Payments.csv');
    },
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Export Payments CSV"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      (0, _csv.triggerTextFileDownload)('ALiF-Customers.csv', (0, _csv.generateCustomersCsv)(customers));
      onNotify('Exported ALiF-Customers.csv');
    },
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Export Customers CSV"), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => {
      (0, _csv.triggerTextFileDownload)('ALiF-Catalogue.csv', (0, _csv.generateCatalogueCsv)(catalogue));
      onNotify('Exported ALiF-Catalogue.csv');
    },
    className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
  }, "Export Catalogue CSV"))), /*#__PURE__*/_react.default.createElement("div", {
    className: "border-t border-alif-border pt-4 space-y-3"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-subhead"
  }, "Restore from Validated JSON Backup"), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-xs text-alif-grey"
  }, "Select a ", /*#__PURE__*/_react.default.createElement("code", null, ".json"), " backup file or paste JSON below. All records are validated before restoring so existing data is protected from corrupted imports."), /*#__PURE__*/_react.default.createElement("input", {
    type: "file",
    accept: ".json,application/json",
    onChange: handleFileUpload,
    className: "block w-full text-xs text-alif-charcoal p-2 border border-alif-border bg-stone-50"
  }), /*#__PURE__*/_react.default.createElement("textarea", {
    rows: 4,
    value: jsonImportText,
    onChange: e => handleValidateImportText(e.target.value),
    placeholder: "Paste backup JSON here ({\"schemaVersion\":2,\"app\":\"ALIF_BILLING_PWA\",...})",
    "data-testid": "textarea-restore-json",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  }), validationResult && /*#__PURE__*/_react.default.createElement("div", {
    "data-testid": "backup-validation-status",
    className: "p-3.5 border border-black bg-stone-50 text-xs text-alif-black"
  }, validationResult.valid ? /*#__PURE__*/_react.default.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-center justify-between gap-2"
  }, /*#__PURE__*/_react.default.createElement("span", null, "\u2713 ", validationResult.summary), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: () => setConfirmRestoreOpen(true),
    "data-testid": "btn-trigger-restore",
    className: "px-4 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-zinc-800 shrink-0"
  }, "Restore Validated Backup")) : /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "font-semibold uppercase tracking-wider"
  }, "\u2715 Backup Validation Failed (Existing data protected):"), /*#__PURE__*/_react.default.createElement("ul", {
    className: "mt-1.5 space-y-0.5 text-alif-charcoal"
  }, validationResult.errors.map((err, i) => /*#__PURE__*/_react.default.createElement("li", {
    key: i
  }, "\u2022 ", err))))))), /*#__PURE__*/_react.default.createElement("form", {
    onSubmit: handleSaveSettings,
    className: "bg-white border border-alif-border p-5 space-y-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "border-b border-alif-border pb-3"
  }, /*#__PURE__*/_react.default.createElement("h3", {
    className: "editorial-subhead"
  }, "02 / Shop Details, Invoice Prefix & Payment Preferences")), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3.5"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Shop Name"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: shopName,
    onChange: e => setShopName(e.target.value),
    "data-testid": "settings-shop-name",
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Tagline / Specialisation"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: tagline,
    onChange: e => setTagline(e.target.value),
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Street Address"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: address,
    onChange: e => setAddress(e.target.value),
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-3 gap-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "City"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: city,
    onChange: e => setCity(e.target.value),
    className: "w-full px-2.5 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "State"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: state,
    onChange: e => setState(e.target.value),
    className: "w-full px-2.5 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "PIN"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: pinCode,
    onChange: e => setPinCode(e.target.value),
    className: "w-full px-2.5 py-2 text-xs font-mono border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Shop Phone"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: phone,
    onChange: e => setPhone(e.target.value),
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Shop WhatsApp Number"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: whatsappNumber,
    onChange: e => setWhatsappNumber(e.target.value),
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  }))), /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-3 border-t border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Invoice Prefix"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: invoicePrefix,
    onChange: e => setInvoicePrefix(e.target.value),
    "data-testid": "settings-invoice-prefix",
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Next Sequence Number"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "1",
    value: nextInvoiceSequence,
    onChange: e => setNextInvoiceSequence(e.target.value),
    className: "w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Default Payment Method"), /*#__PURE__*/_react.default.createElement("select", {
    value: defaultPaymentMethod,
    onChange: e => setDefaultPaymentMethod(e.target.value),
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  }, ['cash', 'upi', 'bank_transfer', 'other'].map(m => /*#__PURE__*/_react.default.createElement("option", {
    key: m,
    value: m
  }, _currency.PAYMENT_METHOD_LABELS[m]))))), /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-stone-50 border border-alif-border p-3.5 space-y-2"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("div", {
    className: "text-xs font-semibold uppercase tracking-wider text-alif-black"
  }, "Optional Tax Line (Disabled by Default)"), /*#__PURE__*/_react.default.createElement("div", {
    className: "text-[11px] text-alif-grey"
  }, "GST registration is never assumed. Leave disabled for standard non-tax tailoring bills.")), /*#__PURE__*/_react.default.createElement("label", {
    className: "inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold"
  }, /*#__PURE__*/_react.default.createElement("input", {
    type: "checkbox",
    checked: taxEnabled,
    onChange: e => setTaxEnabled(e.target.checked)
  }), "Enable Tax")), taxEnabled && /*#__PURE__*/_react.default.createElement("div", {
    className: "grid grid-cols-2 gap-3 pt-2"
  }, /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Tax Label"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: taxLabel,
    onChange: e => setTaxLabel(e.target.value),
    className: "w-full px-2.5 py-1.5 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Tax Percentage (%)"), /*#__PURE__*/_react.default.createElement("input", {
    type: "number",
    min: "0",
    max: "50",
    step: "any",
    value: taxRatePercent,
    onChange: e => setTaxRatePercent(e.target.value),
    className: "w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
  })))), /*#__PURE__*/_react.default.createElement("div", null, /*#__PURE__*/_react.default.createElement("label", {
    className: "block editorial-label mb-1"
  }, "Receipt Footer Message"), /*#__PURE__*/_react.default.createElement("input", {
    type: "text",
    value: receiptFooter,
    onChange: e => setReceiptFooter(e.target.value),
    className: "w-full px-3 py-2 text-xs border border-alif-border bg-white"
  })), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex justify-end"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "submit",
    "data-testid": "btn-save-settings",
    className: "px-6 py-2.5 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
  }, "Save Shop Settings"))), /*#__PURE__*/_react.default.createElement(_StatusBadge.ConfirmDialog, {
    open: confirmRestoreOpen,
    title: "Restore Validated Backup?",
    message: "Restoring this backup will replace current local records with the validated backup data. Make sure you have downloaded a backup of current records if needed.",
    confirmLabel: "Confirm Restore",
    onConfirm: handleConfirmRestore,
    onCancel: () => setConfirmRestoreOpen(false)
  }));
}
  };
  __modules["./src/components/StatusBadge"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ConfirmDialog = ConfirmDialog;
exports.StatusBadge = StatusBadge;
var _react = _interopRequireDefault(__req("react"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function StatusBadge({
  status
}) {
  const styles = {
    Paid: 'bg-alif-black text-white border-black',
    'Partially Paid': 'bg-alif-muted text-alif-black border-alif-charcoal',
    Unpaid: 'bg-transparent text-alif-grey border-zinc-300',
    Cancelled: 'bg-transparent text-alif-grey border-zinc-300 border-dashed line-through'
  };
  return /*#__PURE__*/_react.default.createElement("span", {
    className: `inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] border ${styles[status] || styles.Unpaid}`
  }, status);
}
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}) {
  if (!open) return null;
  return /*#__PURE__*/_react.default.createElement("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "bg-white border border-black max-w-md w-full p-6 space-y-5"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/_react.default.createElement("div", {
    className: "editorial-label"
  }, "Confirmation Required"), /*#__PURE__*/_react.default.createElement("h3", {
    className: "text-sm font-semibold uppercase tracking-[0.12em] text-alif-black"
  }, title), /*#__PURE__*/_react.default.createElement("p", {
    className: "text-xs text-zinc-600 leading-relaxed"
  }, message)), /*#__PURE__*/_react.default.createElement("div", {
    className: "flex items-center justify-end gap-2 pt-4 border-t border-alif-border"
  }, /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: onCancel,
    className: "px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] border border-alif-border text-alif-charcoal hover:border-black"
  }, cancelLabel), /*#__PURE__*/_react.default.createElement("button", {
    type: "button",
    onClick: onConfirm,
    className: `px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white ${danger ? 'bg-alif-charcoal hover:bg-black' : 'bg-alif-black hover:bg-zinc-800'}`
  }, confirmLabel))));
}
  };
  __modules["./src/db/database"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.db = exports.ALIFBillingDatabase = void 0;
var _dexie = _interopRequireDefault(__req("dexie"));
var _seed = __req("./seed");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class ALIFBillingDatabase extends _dexie.default {
  constructor(dbName = 'alif_ladies_tailor_db') {
    super(dbName);

    // Version 1 initial schema
    this.version(1).stores({
      settings: 'id',
      customers: 'id, name, phone, updatedAt',
      catalogue: 'id, name, category, isActive',
      invoices: 'id, &invoiceNumber, customerId, invoiceDate, status, createdAt',
      payments: 'id, invoiceId, customerId, date, type, method, createdAt'
    });

    // Version 2 safe migration adding idempotencyKey index support
    this.version(2).stores({
      settings: 'id',
      customers: 'id, name, phone, updatedAt',
      catalogue: 'id, name, category, isActive',
      invoices: 'id, &invoiceNumber, customerId, invoiceDate, status, idempotencyKey, createdAt',
      payments: 'id, invoiceId, customerId, date, type, method, createdAt'
    }).upgrade(async tx => {
      const invoices = await tx.table('invoices').toArray();
      for (const inv of invoices) {
        if (inv.taxEnabled === undefined) {
          inv.taxEnabled = false;
          inv.taxRatePercent = 0;
          inv.taxPaise = 0;
          await tx.table('invoices').put(inv);
        }
      }
    });
  }

  /**
   * Ensures default shop settings and initial tailoring catalogue exist.
   * Never overwrites existing user modifications.
   */
  async ensureSeeded() {
    await this.open();
    const existingSettings = await this.settings.get('default');
    if (!existingSettings) {
      await this.settings.put({
        ..._seed.DEFAULT_SHOP_SETTINGS
      });
    }
    const catalogueCount = await this.catalogue.count();
    if (catalogueCount === 0) {
      await this.catalogue.bulkPut(_seed.DEFAULT_CATALOGUE_ITEMS.map(item => ({
        ...item
      })));
    }
  }
}
exports.ALIFBillingDatabase = ALIFBillingDatabase;
const db = new ALIFBillingDatabase();
exports.db = db;
  };
  __modules["./src/db/seed"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DEFAULT_SHOP_SETTINGS = exports.DEFAULT_CATALOGUE_ITEMS = void 0;
const DEFAULT_SHOP_SETTINGS = {
  id: 'default',
  shopName: 'ALiF Ladies Tailor',
  tagline: 'Bespoke Ladies Tailoring, Bridal & Boutique Finishing',
  address: 'Station Road, Near Chowk Bazar',
  city: 'Sahibganj',
  state: 'Jharkhand',
  pinCode: '816109',
  phone: '+91 94311 00000',
  whatsappNumber: '919431100000',
  currencyCode: 'INR',
  currencySymbol: '₹',
  invoicePrefix: 'ALIF',
  nextInvoiceSequence: 1,
  taxEnabled: false,
  // Tax disabled by default; never assume GST registration
  taxLabel: 'Tax',
  taxRatePercent: 0,
  defaultPaymentMethod: 'cash',
  enabledPaymentMethods: ['cash', 'upi', 'bank_transfer', 'other'],
  receiptFooter: 'Thank you for choosing ALiF Ladies Tailor, Sahibganj. Please bring this bill at the time of garment collection.',
  updatedAt: '2026-10-18T00:00:00.000Z'
};
exports.DEFAULT_SHOP_SETTINGS = DEFAULT_SHOP_SETTINGS;
const SEED_TIMESTAMP = '2026-10-18T00:00:00.000Z';

/**
 * Default configurable catalogue for ALiF Ladies Tailor.
 * Price ranges and defaults are strictly configurable defaults, never fixed prices.
 */
const DEFAULT_CATALOGUE_ITEMS = [
// Tailoring Services
{
  id: 'srv-astar-blouse',
  name: 'Astar Blouse',
  category: 'service',
  defaultPricePaise: 45000,
  // ₹450 default
  minPricePaise: 35000,
  maxPricePaise: 75000,
  unit: 'pc',
  description: 'Lined (astar) blouse stitching with custom neck & sleeve finish',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-plain-blouse',
  name: 'Plain Blouse',
  category: 'service',
  defaultPricePaise: 25000,
  // ₹250 default
  minPricePaise: 18000,
  maxPricePaise: 40000,
  unit: 'pc',
  description: 'Standard unlined plain blouse stitching & hemming',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-fall-pico',
  name: 'Fall & Pico',
  category: 'service',
  defaultPricePaise: 12000,
  // ₹120 default
  minPricePaise: 8000,
  maxPricePaise: 20000,
  unit: 'saree',
  description: 'Saree fall stitching and edge pico finishing',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-suit',
  name: 'Suit',
  category: 'service',
  defaultPricePaise: 65000,
  // ₹650 default
  minPricePaise: 45000,
  maxPricePaise: 110000,
  unit: 'set',
  description: 'Complete salwar kameez suit stitching (with or without lining)',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-kurti',
  name: 'Kurti',
  category: 'service',
  defaultPricePaise: 40000,
  // ₹400 default
  minPricePaise: 25000,
  maxPricePaise: 75000,
  unit: 'pc',
  description: 'Everyday or designer kurti stitching',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-alter',
  name: 'Alter',
  category: 'service',
  defaultPricePaise: 10000,
  // ₹100 default
  minPricePaise: 5000,
  maxPricePaise: 30000,
  unit: 'pc',
  description: 'Garment fitting, resizing, zip or length alteration',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-patiala',
  name: 'Patiala',
  category: 'service',
  defaultPricePaise: 75000,
  // ₹750 default
  minPricePaise: 55000,
  maxPricePaise: 120000,
  unit: 'set',
  description: 'Full pleated Patiala salwar suit / bottom stitching',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-palazzo',
  name: 'Palazzo',
  category: 'service',
  defaultPricePaise: 55000,
  // ₹550 default
  minPricePaise: 35000,
  maxPricePaise: 90000,
  unit: 'pc',
  description: 'Flared palazzo pant or palazzo suit stitching',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-gharara',
  name: 'Gharara',
  category: 'service',
  defaultPricePaise: 140000,
  // ₹1,400 default
  minPricePaise: 100000,
  maxPricePaise: 250000,
  unit: 'set',
  description: 'Traditional jointed flared gharara suit stitching',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-sharara',
  name: 'Sharara',
  category: 'service',
  defaultPricePaise: 135000,
  // ₹1,350 default
  minPricePaise: 95000,
  maxPricePaise: 240000,
  unit: 'set',
  description: 'Festive flowing sharara suit stitching',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-frock',
  name: 'Frock',
  category: 'service',
  defaultPricePaise: 85000,
  // ₹850 default
  minPricePaise: 50000,
  maxPricePaise: 160000,
  unit: 'pc',
  description: 'Anarkali frock, gown or pleated dress stitching',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'srv-lehenga',
  name: 'Lehenga',
  category: 'service',
  defaultPricePaise: 220000,
  // ₹2,200 default
  minPricePaise: 150000,
  maxPricePaise: 450000,
  unit: 'set',
  description: 'Bridal & festive lehenga choli stitching with cancan/astar options',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
},
// Tailoring Materials & Products
{
  id: 'prd-fabric',
  name: 'Fabric',
  category: 'product',
  defaultPricePaise: 12000,
  // ₹120/mtr default
  minPricePaise: 6000,
  maxPricePaise: 60000,
  costPricePaise: 8500,
  // ₹85/mtr optional cost
  unit: 'mtr',
  description: 'Cotton astar lining, crepe, satin or dress fabric material',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'prd-lace',
  name: 'Lace',
  category: 'product',
  defaultPricePaise: 6000,
  // ₹60/mtr default
  minPricePaise: 2000,
  maxPricePaise: 30000,
  costPricePaise: 3500,
  // ₹35/mtr optional cost
  unit: 'mtr',
  description: 'Gota patti, zari, velvet or designer border lace',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'prd-latkan',
  name: 'Latkan',
  category: 'product',
  defaultPricePaise: 15000,
  // ₹150/pair default
  minPricePaise: 5000,
  maxPricePaise: 45000,
  costPricePaise: 9000,
  // ₹90/pair optional cost
  unit: 'pair',
  description: 'Decorative blouse/lehenga back tassels & latkan pair',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'prd-dori',
  name: 'Dori',
  category: 'product',
  defaultPricePaise: 5000,
  // ₹50/pc default
  minPricePaise: 2500,
  maxPricePaise: 15000,
  costPricePaise: 2500,
  // ₹25/pc optional cost
  unit: 'pc',
  description: 'Custom fabric piping dori or readymade back tie cord',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}, {
  id: 'itm-custom',
  name: 'Custom Item',
  category: 'custom',
  defaultPricePaise: 20000,
  // ₹200 configurable default
  minPricePaise: 1000,
  maxPricePaise: 500000,
  unit: 'item',
  description: 'Custom bespoke work, embroidery, button/tassel work or special add-on',
  isActive: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}];
exports.DEFAULT_CATALOGUE_ITEMS = DEFAULT_CATALOGUE_ITEMS;
  };
  __modules["./src/main"] = function(module, exports, __req) {
"use strict";

var _react = _interopRequireDefault(__req("react"));
var _client = __req("react-dom/client");
var _App = _interopRequireDefault(__req("./App"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const container = document.getElementById('root');
if (container) {
  const root = (0, _client.createRoot)(container);
  root.render( /*#__PURE__*/_react.default.createElement(_react.default.StrictMode, null, /*#__PURE__*/_react.default.createElement(_App.default, null)));
}

// Register offline Service Worker when supported
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Ignore registration errors in restricted preview iframes
    });
  });
}
  };
  __modules["./src/services/billingService"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cancelInvoice = cancelInvoice;
exports.createInvoice = createInvoice;
exports.exportBackupPayload = exportBackupPayload;
exports.generateId = generateId;
exports.getCustomerHistory = getCustomerHistory;
exports.getDashboardMetrics = getDashboardMetrics;
exports.getInvoiceDetails = getInvoiceDetails;
exports.getPeriodReport = getPeriodReport;
exports.getShopSettings = getShopSettings;
exports.getTodayIsoDate = getTodayIsoDate;
exports.listCatalogue = listCatalogue;
exports.listCustomers = listCustomers;
exports.listInvoices = listInvoices;
exports.previewNextInvoiceNumber = previewNextInvoiceNumber;
exports.recordInvoicePayment = recordInvoicePayment;
exports.reopenAndUpdateInvoice = reopenAndUpdateInvoice;
exports.resetDefaultCatalogue = resetDefaultCatalogue;
exports.restoreBackupPayload = restoreBackupPayload;
exports.saveCatalogueItem = saveCatalogueItem;
exports.saveCustomer = saveCustomer;
exports.updateShopSettings = updateShopSettings;
exports.validateBackupPayload = validateBackupPayload;
var _database = __req("../db/database");
var _seed = __req("../db/seed");
var _currency = __req("../utils/currency");
const activeSubmissionLocks = new Set();
function generateId(prefix) {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now()}-${rand}`;
}
function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// 1. SHOP SETTINGS
// ============================================================================

async function getShopSettings(database = _database.db) {
  await database.ensureSeeded();
  const s = await database.settings.get('default');
  return s || {
    ..._seed.DEFAULT_SHOP_SETTINGS
  };
}
async function updateShopSettings(patch, database = _database.db) {
  await database.ensureSeeded();
  const current = await getShopSettings(database);
  const cleanPrefix = patch.invoicePrefix !== undefined ? patch.invoicePrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'ALIF' : current.invoicePrefix;
  const updated = {
    ...current,
    ...patch,
    id: 'default',
    currencyCode: 'INR',
    currencySymbol: '₹',
    invoicePrefix: cleanPrefix,
    nextInvoiceSequence: Math.max(1, Math.floor(Number(patch.nextInvoiceSequence ?? current.nextInvoiceSequence) || 1)),
    taxEnabled: Boolean(patch.taxEnabled ?? current.taxEnabled),
    taxRatePercent: Math.max(0, Math.min(50, Number(patch.taxRatePercent ?? current.taxRatePercent) || 0)),
    updatedAt: new Date().toISOString()
  };
  await database.settings.put(updated);
  return updated;
}

// ============================================================================
// 2. CUSTOMERS
// ============================================================================

async function saveCustomer(input, database = _database.db) {
  await database.ensureSeeded();
  const name = String(input.name || '').trim();
  const phone = String(input.phone || '').trim();
  const notes = String(input.notes || '').trim();
  if (!name) {
    throw new Error('Customer name is required');
  }
  if (!phone || phone.replace(/\D/g, '').length < 6) {
    throw new Error('Valid customer phone number is required');
  }
  const now = new Date().toISOString();
  if (input.id) {
    const existing = await database.customers.get(input.id);
    const updated = {
      id: input.id,
      name,
      phone,
      notes,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    await database.customers.put(updated);
    return updated;
  }
  const created = {
    id: generateId('cust'),
    name,
    phone,
    notes,
    createdAt: now,
    updatedAt: now
  };
  await database.customers.put(created);
  return created;
}
async function listCustomers(searchQuery = '', database = _database.db) {
  await database.ensureSeeded();
  const all = await database.customers.toArray();
  const q = searchQuery.trim().toLowerCase();
  const filtered = q ? all.filter(c => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.notes && c.notes.toLowerCase().includes(q)) : all;
  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}
async function getCustomerHistory(customerId, database = _database.db) {
  await database.ensureSeeded();
  const customer = await database.customers.get(customerId);
  const invoices = await database.invoices.where('customerId').equals(customerId).toArray();
  invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const payments = await database.payments.where('customerId').equals(customerId).toArray();
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let totalBilledPaise = 0;
  let totalPaidPaise = 0;
  let totalOutstandingPaise = 0;
  for (const inv of invoices) {
    if (inv.status !== 'Cancelled') {
      totalBilledPaise += inv.totalPaise;
      totalOutstandingPaise += inv.balancePaise;
    }
    totalPaidPaise += inv.paidPaise;
  }
  return {
    customer,
    invoices,
    payments,
    totalBilledPaise,
    totalPaidPaise,
    totalOutstandingPaise
  };
}

// ============================================================================
// 3. CATALOGUE
// ============================================================================

async function listCatalogue(options = {}, database = _database.db) {
  await database.ensureSeeded();
  let items = await database.catalogue.toArray();
  if (options.activeOnly) {
    items = items.filter(i => i.isActive);
  }
  if (options.category && options.category !== 'all') {
    items = items.filter(i => i.category === options.category);
  }
  if (options.search && options.search.trim()) {
    const q = options.search.trim().toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(q) || i.unit.toLowerCase().includes(q) || i.description && i.description.toLowerCase().includes(q));
  }
  return items.sort((a, b) => {
    if (a.category !== b.category) {
      const order = {
        service: 1,
        product: 2,
        custom: 3
      };
      return order[a.category] - order[b.category];
    }
    return a.name.localeCompare(b.name);
  });
}
async function saveCatalogueItem(input, database = _database.db) {
  var _input$description2;
  await database.ensureSeeded();
  const name = String(input.name || '').trim();
  if (!name) {
    throw new Error('Catalogue item name is required');
  }
  const unit = String(input.unit || 'pc').trim() || 'pc';
  const defaultPricePaise = Math.round(Number(input.defaultPricePaise));
  if (!Number.isFinite(defaultPricePaise) || defaultPricePaise < 0) {
    throw new Error('Default price must be zero or greater');
  }
  const costPricePaise = input.costPricePaise !== undefined && input.costPricePaise !== null ? Math.max(0, Math.round(Number(input.costPricePaise))) : undefined;
  const minPricePaise = input.minPricePaise !== undefined && input.minPricePaise !== null ? Math.max(0, Math.round(Number(input.minPricePaise))) : undefined;
  const maxPricePaise = input.maxPricePaise !== undefined && input.maxPricePaise !== null ? Math.max(0, Math.round(Number(input.maxPricePaise))) : undefined;
  const now = new Date().toISOString();
  if (input.id) {
    var _input$description;
    const existing = await database.catalogue.get(input.id);
    const updated = {
      id: input.id,
      name,
      category: input.category,
      defaultPricePaise,
      minPricePaise,
      maxPricePaise,
      costPricePaise,
      unit,
      description: ((_input$description = input.description) === null || _input$description === void 0 ? void 0 : _input$description.trim()) || '',
      isActive: input.isActive !== undefined ? input.isActive : existing ? existing.isActive : true,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    await database.catalogue.put(updated);
    return updated;
  }
  const created = {
    id: generateId('cat'),
    name,
    category: input.category,
    defaultPricePaise,
    minPricePaise,
    maxPricePaise,
    costPricePaise,
    unit,
    description: ((_input$description2 = input.description) === null || _input$description2 === void 0 ? void 0 : _input$description2.trim()) || '',
    isActive: input.isActive !== undefined ? input.isActive : true,
    createdAt: now,
    updatedAt: now
  };
  await database.catalogue.put(created);
  return created;
}
async function resetDefaultCatalogue(database = _database.db) {
  await database.ensureSeeded();
  await database.catalogue.bulkPut(_seed.DEFAULT_CATALOGUE_ITEMS.map(item => ({
    ...item
  })));
}

// ============================================================================
// 4. INVOICE CREATION, NUMBERING & DUPLICATE PREVENTION
// ============================================================================

async function previewNextInvoiceNumber(invoiceDate = getTodayIsoDate(), database = _database.db) {
  const settings = await getShopSettings(database);
  const year = parseInt(invoiceDate.slice(0, 4), 10) || new Date().getFullYear();
  const allInvoices = await database.invoices.toArray();
  const existingNumbers = new Set(allInvoices.map(inv => inv.invoiceNumber));
  let seq = Math.max(1, settings.nextInvoiceSequence || 1);
  let candidate = (0, _currency.formatInvoiceNumber)(settings.invoicePrefix, year, seq);
  while (existingNumbers.has(candidate)) {
    seq++;
    candidate = (0, _currency.formatInvoiceNumber)(settings.invoicePrefix, year, seq);
  }
  return candidate;
}
async function createInvoice(input, database = _database.db) {
  await database.ensureSeeded();
  const lockKey = input.idempotencyKey || `${input.customerPhone}-${input.items.length}`;
  if (activeSubmissionLocks.has(lockKey)) {
    throw new Error('Duplicate bill submission in progress. Please wait.');
  }
  activeSubmissionLocks.add(lockKey);
  try {
    // Check idempotency key in DB to prevent duplicate invoice creation
    if (input.idempotencyKey) {
      const existingByKey = await database.invoices.where('idempotencyKey').equals(input.idempotencyKey).first();
      if (existingByKey) {
        throw new Error(`Duplicate submission prevented: Invoice ${existingByKey.invoiceNumber} already saved.`);
      }
    }
    const customerName = String(input.customerName || '').trim();
    const customerPhone = String(input.customerPhone || '').trim();
    if (!customerName) {
      throw new Error('Customer name is required on a bill');
    }
    if (!customerPhone || customerPhone.replace(/\D/g, '').length < 6) {
      throw new Error('Valid customer phone number is required on a bill');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('At least one tailoring service or product item is required');
    }
    const normalizedItems = input.items.map((raw, idx) => {
      const itemName = String(raw.name || '').trim();
      if (!itemName) {
        throw new Error(`Line item #${idx + 1} requires a name`);
      }
      const qty = Number(raw.quantity);
      const unitPaise = Math.round(Number(raw.unitPricePaise));
      const lineTotalPaise = (0, _currency.calculateLineTotalPaise)(qty, unitPaise);
      return {
        id: raw.id || generateId(`line-${idx + 1}`),
        catalogueItemId: raw.catalogueItemId ?? null,
        name: itemName,
        category: raw.category || 'service',
        quantity: qty,
        unit: String(raw.unit || 'pc').trim() || 'pc',
        unitPricePaise: unitPaise,
        costPricePaise: raw.costPricePaise !== undefined ? Math.round(raw.costPricePaise) : undefined,
        lineTotalPaise,
        notes: raw.notes ? String(raw.notes).trim() : undefined
      };
    });
    const invoiceDate = input.invoiceDate || getTodayIsoDate();
    const discountType = input.discountType || 'flat';
    const discountValue = Number(input.discountValue || 0);
    if (discountValue < 0) {
      throw new Error('Discount cannot be negative');
    }
    return await database.transaction('rw', database.settings, database.customers, database.invoices, database.payments, async () => {
      const settings = await getShopSettings(database);
      const totals = (0, _currency.calculateInvoiceTotals)({
        items: normalizedItems,
        discountType,
        discountValue,
        taxEnabled: settings.taxEnabled,
        taxRatePercent: settings.taxRatePercent
      });
      const advancePaise = Math.max(0, Math.round(Number(input.advancePaise || 0)));
      if (advancePaise > totals.totalPaise) {
        throw new Error('Advance amount cannot exceed the final bill total');
      }
      const now = new Date().toISOString();

      // Resolve or create customer
      let customer;
      if (input.customerId) {
        customer = await database.customers.get(input.customerId);
      }
      if (!customer) {
        const allCustomers = await database.customers.toArray();
        customer = allCustomers.find(c => c.phone.replace(/\D/g, '') === customerPhone.replace(/\D/g, '') && c.name.toLowerCase() === customerName.toLowerCase());
      }
      if (customer) {
        customer = {
          ...customer,
          name: customerName,
          phone: customerPhone,
          notes: input.customerNotes !== undefined ? input.customerNotes.trim() : customer.notes,
          updatedAt: now
        };
        await database.customers.put(customer);
      } else {
        customer = {
          id: generateId('cust'),
          name: customerName,
          phone: customerPhone,
          notes: input.customerNotes ? input.customerNotes.trim() : '',
          createdAt: now,
          updatedAt: now
        };
        await database.customers.put(customer);
      }

      // Generate guaranteed unique invoice number
      const year = parseInt(invoiceDate.slice(0, 4), 10) || new Date().getFullYear();
      const allInvoices = await database.invoices.toArray();
      const existingNumbers = new Set(allInvoices.map(i => i.invoiceNumber));
      let seq = Math.max(1, settings.nextInvoiceSequence || 1);
      let invoiceNumber = (0, _currency.formatInvoiceNumber)(settings.invoicePrefix, year, seq);
      while (existingNumbers.has(invoiceNumber)) {
        seq++;
        invoiceNumber = (0, _currency.formatInvoiceNumber)(settings.invoicePrefix, year, seq);
      }

      // Update sequence counter
      await database.settings.put({
        ...settings,
        nextInvoiceSequence: seq + 1,
        updatedAt: now
      });
      const invoiceId = generateId('inv');
      const createdPayments = [];
      if (advancePaise > 0) {
        const advancePayment = {
          id: generateId('pay'),
          invoiceId,
          invoiceNumber,
          customerId: customer.id,
          customerName: customer.name,
          amountPaise: advancePaise,
          method: input.advanceMethod || settings.defaultPaymentMethod || 'cash',
          type: 'advance',
          date: invoiceDate,
          createdAt: now,
          note: 'Initial advance received at billing'
        };
        await database.payments.put(advancePayment);
        createdPayments.push(advancePayment);
      }
      const ledger = (0, _currency.computePaymentLedger)(totals.totalPaise, false, createdPayments);
      const invoice = {
        id: invoiceId,
        invoiceNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        invoiceDate,
        collectionDate: input.collectionDate || undefined,
        items: normalizedItems,
        subtotalPaise: totals.subtotalPaise,
        discountType,
        discountValue,
        discountPaise: totals.discountPaise,
        taxEnabled: settings.taxEnabled,
        taxLabel: settings.taxLabel,
        taxRatePercent: settings.taxRatePercent,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        advancePaise: ledger.advancePaise,
        paidPaise: ledger.netPaidPaise,
        balancePaise: ledger.balancePaise,
        status: ledger.status,
        notes: String(input.notes || '').trim(),
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now
      };
      await database.invoices.put(invoice);
      return {
        invoice,
        payments: createdPayments,
        customer
      };
    });
  } finally {
    activeSubmissionLocks.delete(lockKey);
  }
}

// ============================================================================
// 5. PAYMENTS, REFUNDS, CORRECTIONS, CANCELLATIONS & REOPENING
// ============================================================================

async function recordInvoicePayment(input, database = _database.db) {
  await database.ensureSeeded();
  const type = input.type || 'payment';
  const amountPaise = Math.round(Number(input.amountPaise));
  if (!Number.isFinite(amountPaise) || amountPaise === 0) {
    throw new Error('Payment amount must be a non-zero number');
  }
  if ((type === 'payment' || type === 'advance' || type === 'refund') && amountPaise < 0) {
    throw new Error('Amount must be greater than zero');
  }
  if ((type === 'refund' || type === 'correction') && !String(input.note || '').trim()) {
    throw new Error(`A note explaining the ${type} is required for audit integrity`);
  }
  return await database.transaction('rw', database.invoices, database.payments, async () => {
    const invoice = await database.invoices.get(input.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    if (invoice.status === 'Cancelled' && type !== 'refund' && type !== 'correction') {
      throw new Error('Cannot record new payments on a cancelled invoice. Reopen the invoice first.');
    }
    const existingPayments = await database.payments.where('invoiceId').equals(invoice.id).toArray();
    const currentLedger = (0, _currency.computePaymentLedger)(invoice.totalPaise, invoice.status === 'Cancelled', existingPayments);
    if (type === 'refund' && amountPaise > currentLedger.netPaidPaise) {
      throw new Error('Refund amount cannot exceed total net paid amount on this invoice');
    }
    const now = new Date().toISOString();
    const payment = {
      id: generateId('pay'),
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      amountPaise,
      method: input.method || 'cash',
      type,
      date: input.date || getTodayIsoDate(),
      createdAt: now,
      note: String(input.note || '').trim() || (type === 'advance' ? 'Advance payment' : 'Balance payment received')
    };
    await database.payments.put(payment);
    const allPayments = [...existingPayments, payment].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const updatedLedger = (0, _currency.computePaymentLedger)(invoice.totalPaise, invoice.status === 'Cancelled', allPayments);
    const updatedInvoice = {
      ...invoice,
      advancePaise: updatedLedger.advancePaise,
      paidPaise: updatedLedger.netPaidPaise,
      balancePaise: updatedLedger.balancePaise,
      status: updatedLedger.status,
      updatedAt: now
    };
    await database.invoices.put(updatedInvoice);
    return {
      invoice: updatedInvoice,
      payment,
      allPayments
    };
  });
}
async function cancelInvoice(invoiceId, reason, database = _database.db) {
  await database.ensureSeeded();
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw new Error('Cancellation reason is required');
  }
  return await database.transaction('rw', database.invoices, database.payments, async () => {
    const invoice = await database.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const existingPayments = await database.payments.where('invoiceId').equals(invoiceId).toArray();
    const ledger = (0, _currency.computePaymentLedger)(invoice.totalPaise, true, existingPayments);
    const now = new Date().toISOString();
    const updated = {
      ...invoice,
      advancePaise: ledger.advancePaise,
      paidPaise: ledger.netPaidPaise,
      balancePaise: 0,
      status: 'Cancelled',
      cancelReason: cleanReason,
      cancelledAt: now,
      updatedAt: now
    };
    await database.invoices.put(updated);
    return updated;
  });
}
async function reopenAndUpdateInvoice(input, database = _database.db) {
  await database.ensureSeeded();
  return await database.transaction('rw', database.invoices, database.payments, async () => {
    const invoice = await database.invoices.get(input.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const updatedItems = input.items ? input.items.map((raw, idx) => {
      const lineTotalPaise = (0, _currency.calculateLineTotalPaise)(raw.quantity, raw.unitPricePaise);
      return {
        id: raw.id || generateId(`line-${idx + 1}`),
        catalogueItemId: raw.catalogueItemId ?? null,
        name: String(raw.name || '').trim(),
        category: raw.category || 'service',
        quantity: Number(raw.quantity),
        unit: String(raw.unit || 'pc').trim() || 'pc',
        unitPricePaise: Math.round(Number(raw.unitPricePaise)),
        costPricePaise: raw.costPricePaise !== undefined ? Math.round(raw.costPricePaise) : undefined,
        lineTotalPaise,
        notes: raw.notes ? String(raw.notes).trim() : undefined
      };
    }) : invoice.items;
    if (updatedItems.length === 0) {
      throw new Error('Invoice must contain at least one item');
    }
    const discountType = input.discountType ?? invoice.discountType;
    const discountValue = input.discountValue ?? invoice.discountValue;
    const totals = (0, _currency.calculateInvoiceTotals)({
      items: updatedItems,
      discountType,
      discountValue,
      taxEnabled: invoice.taxEnabled,
      taxRatePercent: invoice.taxRatePercent
    });
    const payments = await database.payments.where('invoiceId').equals(invoice.id).toArray();
    const ledger = (0, _currency.computePaymentLedger)(totals.totalPaise, false, payments);
    const now = new Date().toISOString();
    const updated = {
      ...invoice,
      items: updatedItems,
      subtotalPaise: totals.subtotalPaise,
      discountType,
      discountValue,
      discountPaise: totals.discountPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      advancePaise: ledger.advancePaise,
      paidPaise: ledger.netPaidPaise,
      balancePaise: ledger.balancePaise,
      status: ledger.status,
      collectionDate: input.collectionDate !== undefined ? input.collectionDate || undefined : invoice.collectionDate,
      notes: input.notes !== undefined ? input.notes.trim() : invoice.notes,
      cancelReason: undefined,
      cancelledAt: undefined,
      updatedAt: now
    };
    await database.invoices.put(updated);
    return updated;
  });
}
async function listInvoices(filters = {}, database = _database.db) {
  await database.ensureSeeded();
  let invoices = await database.invoices.toArray();
  if (filters.customerId) {
    invoices = invoices.filter(inv => inv.customerId === filters.customerId);
  }
  if (filters.status && filters.status !== 'All') {
    invoices = invoices.filter(inv => inv.status === filters.status);
  }
  if (filters.startDate) {
    invoices = invoices.filter(inv => inv.invoiceDate >= filters.startDate);
  }
  if (filters.endDate) {
    invoices = invoices.filter(inv => inv.invoiceDate <= filters.endDate);
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    invoices = invoices.filter(inv => inv.invoiceNumber.toLowerCase().includes(q) || inv.customerName.toLowerCase().includes(q) || inv.customerPhone.toLowerCase().includes(q) || inv.items.some(it => it.name.toLowerCase().includes(q)));
  }
  return invoices.sort((a, b) => {
    if (a.invoiceDate !== b.invoiceDate) {
      return b.invoiceDate.localeCompare(a.invoiceDate);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}
async function getInvoiceDetails(invoiceId, database = _database.db) {
  await database.ensureSeeded();
  const invoice = await database.invoices.get(invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  const payments = await database.payments.where('invoiceId').equals(invoiceId).toArray();
  payments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const customer = await database.customers.get(invoice.customerId);
  return {
    invoice,
    payments,
    customer
  };
}

// ============================================================================
// 6. DASHBOARD & REPORTS
// ============================================================================

async function getDashboardMetrics(todayDate = getTodayIsoDate(), database = _database.db) {
  await database.ensureSeeded();
  const allInvoices = await database.invoices.toArray();
  const allPayments = await database.payments.toArray();
  let todayInvoiceValuePaise = 0;
  let todayInvoiceCount = 0;
  let totalOutstandingPaise = 0;
  let outstandingInvoiceCount = 0;
  for (const inv of allInvoices) {
    if (inv.status !== 'Cancelled') {
      if (inv.invoiceDate === todayDate) {
        todayInvoiceValuePaise += inv.totalPaise;
        todayInvoiceCount++;
      }
      if (inv.balancePaise > 0) {
        totalOutstandingPaise += inv.balancePaise;
        outstandingInvoiceCount++;
      }
    }
  }
  let todayPaymentsReceivedPaise = 0;
  for (const p of allPayments) {
    if (p.date === todayDate) {
      if (p.type === 'advance' || p.type === 'payment') {
        todayPaymentsReceivedPaise += p.amountPaise;
      } else if (p.type === 'refund') {
        todayPaymentsReceivedPaise -= Math.abs(p.amountPaise);
      } else if (p.type === 'correction') {
        todayPaymentsReceivedPaise += p.amountPaise;
      }
    }
  }
  const recentInvoices = [...allInvoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  return {
    todayDate,
    todayInvoiceValuePaise,
    todayPaymentsReceivedPaise: Math.max(0, todayPaymentsReceivedPaise),
    todayInvoiceCount,
    totalOutstandingPaise,
    outstandingInvoiceCount,
    recentInvoices
  };
}
async function getPeriodReport(startDate, endDate, database = _database.db) {
  await database.ensureSeeded();
  const allInvoices = await database.invoices.toArray();
  const allPayments = await database.payments.toArray();
  const periodInvoices = allInvoices.filter(inv => inv.invoiceDate >= startDate && inv.invoiceDate <= endDate);
  let activeInvoiceCount = 0;
  let cancelledInvoiceCount = 0;
  let invoicedSalesPaise = 0;
  let discountsGivenPaise = 0;
  let outstandingBalancePaise = 0;
  const catMap = {
    service: {
      label: 'Tailoring Services',
      quantity: 0,
      revenuePaise: 0,
      estimatedCostPaise: 0
    },
    product: {
      label: 'Products & Materials',
      quantity: 0,
      revenuePaise: 0,
      estimatedCostPaise: 0
    },
    custom: {
      label: 'Custom Items',
      quantity: 0,
      revenuePaise: 0,
      estimatedCostPaise: 0
    }
  };
  const itemMap = new Map();
  for (const inv of periodInvoices) {
    if (inv.status === 'Cancelled') {
      cancelledInvoiceCount++;
      continue;
    }
    activeInvoiceCount++;
    invoicedSalesPaise += inv.totalPaise;
    discountsGivenPaise += inv.discountPaise;
    outstandingBalancePaise += inv.balancePaise;
    for (const item of inv.items) {
      const cat = catMap[item.category] ? item.category : 'service';
      catMap[cat].quantity += item.quantity;
      catMap[cat].revenuePaise += item.lineTotalPaise;
      if (item.costPricePaise) {
        catMap[cat].estimatedCostPaise += Math.round(item.costPricePaise * item.quantity);
      }
      const key = `${item.category}:${item.name}`;
      const existingItem = itemMap.get(key);
      if (existingItem) {
        existingItem.quantity += item.quantity;
        existingItem.revenuePaise += item.lineTotalPaise;
      } else {
        itemMap.set(key, {
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          revenuePaise: item.lineTotalPaise
        });
      }
    }
  }
  let paymentsReceivedPaise = 0;
  let refundsIssuedPaise = 0;
  const paymentsByMethod = {
    cash: 0,
    upi: 0,
    bank_transfer: 0,
    other: 0
  };
  const periodPayments = allPayments.filter(p => p.date >= startDate && p.date <= endDate);
  for (const p of periodPayments) {
    const method = paymentsByMethod[p.method] !== undefined ? p.method : 'other';
    if (p.type === 'advance' || p.type === 'payment') {
      paymentsReceivedPaise += p.amountPaise;
      paymentsByMethod[method] += p.amountPaise;
    } else if (p.type === 'refund') {
      const amt = Math.abs(p.amountPaise);
      refundsIssuedPaise += amt;
      paymentsByMethod[method] = Math.max(0, paymentsByMethod[method] - amt);
    } else if (p.type === 'correction') {
      if (p.amountPaise >= 0) {
        paymentsReceivedPaise += p.amountPaise;
      } else {
        refundsIssuedPaise += Math.abs(p.amountPaise);
      }
      paymentsByMethod[method] = Math.max(0, paymentsByMethod[method] + p.amountPaise);
    }
  }
  const netCashCollectedPaise = Math.max(0, paymentsReceivedPaise - refundsIssuedPaise);
  return {
    startDate,
    endDate,
    activeInvoiceCount,
    cancelledInvoiceCount,
    invoicedSalesPaise,
    discountsGivenPaise,
    paymentsReceivedPaise,
    refundsIssuedPaise,
    netCashCollectedPaise,
    outstandingBalancePaise,
    paymentsByMethod,
    categoryBreakdown: ['service', 'product', 'custom'].map(c => ({
      category: c,
      ...catMap[c]
    })),
    itemBreakdown: Array.from(itemMap.values()).sort((a, b) => b.revenuePaise - a.revenuePaise)
  };
}

// ============================================================================
// 7. BACKUP & RESTORE (VALIDATED & ATOMIC)
// ============================================================================

async function exportBackupPayload(database = _database.db) {
  await database.ensureSeeded();
  const [settings, customers, catalogue, invoices, payments] = await Promise.all([database.settings.toArray(), database.customers.toArray(), database.catalogue.toArray(), database.invoices.toArray(), database.payments.toArray()]);
  return {
    schemaVersion: 2,
    app: 'ALIF_BILLING_PWA',
    exportedAt: new Date().toISOString(),
    settings,
    customers,
    catalogue,
    invoices,
    payments
  };
}
function validateBackupPayload(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: ['Backup file must be a JSON object']
    };
  }
  const obj = raw;
  if (obj.app !== 'ALIF_BILLING_PWA') {
    errors.push('Invalid backup identifier: expected app="ALIF_BILLING_PWA"');
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion < 1) {
    errors.push('Invalid or missing schemaVersion');
  }
  const requiredArrays = ['settings', 'customers', 'catalogue', 'invoices', 'payments'];
  for (const key of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      errors.push(`Missing or invalid "${key}" array in backup`);
    }
  }
  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }
  const customers = obj.customers;
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    if (!c || typeof c.id !== 'string' || !c.name || !c.phone) {
      errors.push(`Customer at index ${i} is missing id, name, or phone`);
    }
  }
  const catalogue = obj.catalogue;
  for (let i = 0; i < catalogue.length; i++) {
    const cat = catalogue[i];
    if (!cat || typeof cat.id !== 'string' || !cat.name || typeof cat.defaultPricePaise !== 'number' || !Number.isInteger(cat.defaultPricePaise) || cat.defaultPricePaise < 0) {
      errors.push(`Catalogue item at index ${i} has invalid id, name, or non-integer price`);
    }
  }
  const invoices = obj.invoices;
  const invoiceIds = new Set();
  const invoiceNumbers = new Set();
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    if (!inv || typeof inv.id !== 'string' || !inv.invoiceNumber || !Array.isArray(inv.items)) {
      errors.push(`Invoice at index ${i} is missing id, invoiceNumber, or items array`);
      continue;
    }
    if (invoiceIds.has(inv.id)) {
      errors.push(`Duplicate invoice id "${inv.id}" in backup`);
    }
    if (invoiceNumbers.has(inv.invoiceNumber)) {
      errors.push(`Duplicate invoiceNumber "${inv.invoiceNumber}" in backup`);
    }
    invoiceIds.add(inv.id);
    invoiceNumbers.add(inv.invoiceNumber);
    if (typeof inv.totalPaise !== 'number' || !Number.isInteger(inv.totalPaise) || inv.totalPaise < 0) {
      errors.push(`Invoice ${inv.invoiceNumber} has invalid totalPaise`);
    }
  }
  const payments = obj.payments;
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    if (!p || typeof p.id !== 'string' || typeof p.invoiceId !== 'string' || typeof p.amountPaise !== 'number' || !Number.isInteger(p.amountPaise)) {
      errors.push(`Payment record at index ${i} is malformed`);
    }
  }
  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }
  return {
    valid: true,
    errors: [],
    payload: obj
  };
}
async function restoreBackupPayload(raw, database = _database.db) {
  const validation = validateBackupPayload(raw);
  if (!validation.valid || !validation.payload) {
    throw new Error(`Backup validation failed: ${validation.errors.join('; ')}`);
  }
  const payload = validation.payload;
  return await database.transaction('rw', database.settings, database.customers, database.catalogue, database.invoices, database.payments, async () => {
    await database.settings.clear();
    await database.customers.clear();
    await database.catalogue.clear();
    await database.invoices.clear();
    await database.payments.clear();
    if (payload.settings.length > 0) {
      await database.settings.bulkPut(payload.settings);
    } else {
      await database.settings.put({
        ..._seed.DEFAULT_SHOP_SETTINGS
      });
    }
    if (payload.catalogue.length > 0) {
      await database.catalogue.bulkPut(payload.catalogue);
    } else {
      await database.catalogue.bulkPut(_seed.DEFAULT_CATALOGUE_ITEMS.map(i => ({
        ...i
      })));
    }
    if (payload.customers.length > 0) {
      await database.customers.bulkPut(payload.customers);
    }
    if (payload.invoices.length > 0) {
      await database.invoices.bulkPut(payload.invoices);
    }
    if (payload.payments.length > 0) {
      await database.payments.bulkPut(payload.payments);
    }
    return {
      customers: payload.customers.length,
      catalogue: payload.catalogue.length,
      invoices: payload.invoices.length,
      payments: payload.payments.length
    };
  });
}
  };
  __modules["./src/types/billing"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
  };
  __modules["./src/utils/csv"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.escapeCsvCell = escapeCsvCell;
exports.generateCatalogueCsv = generateCatalogueCsv;
exports.generateCustomersCsv = generateCustomersCsv;
exports.generateInvoicesCsv = generateInvoicesCsv;
exports.generatePaymentsCsv = generatePaymentsCsv;
exports.generatePeriodReportCsv = generatePeriodReportCsv;
exports.rowsToCsv = rowsToCsv;
exports.triggerTextFileDownload = triggerTextFileDownload;
var _currency = __req("./currency");
function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function rowsToCsv(headers, rows) {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map(row => row.map(escapeCsvCell).join(','));
  return [headerLine, ...bodyLines].join('\r\n');
}
function generateInvoicesCsv(invoices) {
  const headers = ['Invoice Number', 'Invoice Date', 'Collection Date', 'Customer Name', 'Customer Phone', 'Status', 'Items Summary', 'Subtotal (INR)', 'Discount (INR)', 'Tax (INR)', 'Final Total (INR)', 'Advance (INR)', 'Total Net Paid (INR)', 'Balance Due (INR)', 'Notes', 'Cancel Reason'];
  const rows = invoices.map(inv => [inv.invoiceNumber, inv.invoiceDate, inv.collectionDate || '', inv.customerName, inv.customerPhone, inv.status, inv.items.map(i => `${i.name} (${i.quantity} ${i.unit})`).join('; '), (0, _currency.paiseToRupeesString)(inv.subtotalPaise), (0, _currency.paiseToRupeesString)(inv.discountPaise), (0, _currency.paiseToRupeesString)(inv.taxPaise), (0, _currency.paiseToRupeesString)(inv.totalPaise), (0, _currency.paiseToRupeesString)(inv.advancePaise), (0, _currency.paiseToRupeesString)(inv.paidPaise), (0, _currency.paiseToRupeesString)(inv.balancePaise), inv.notes || '', inv.cancelReason || '']);
  return rowsToCsv(headers, rows);
}
function generatePaymentsCsv(payments) {
  const headers = ['Payment ID', 'Date', 'Invoice Number', 'Customer Name', 'Type', 'Method', 'Amount (INR)', 'Note', 'Recorded At'];
  const rows = payments.map(p => [p.id, p.date, p.invoiceNumber, p.customerName, p.type, _currency.PAYMENT_METHOD_LABELS[p.method] || p.method, (0, _currency.paiseToRupeesString)(p.amountPaise), p.note || '', p.createdAt]);
  return rowsToCsv(headers, rows);
}
function generateCustomersCsv(customers) {
  const headers = ['Customer ID', 'Name', 'Phone', 'Notes', 'Created At', 'Updated At'];
  const rows = customers.map(c => [c.id, c.name, c.phone, c.notes || '', c.createdAt, c.updatedAt]);
  return rowsToCsv(headers, rows);
}
function generateCatalogueCsv(catalogue) {
  const headers = ['Item ID', 'Name', 'Category', 'Default Price (INR)', 'Min Price Hint (INR)', 'Max Price Hint (INR)', 'Cost Price (INR)', 'Unit', 'Active', 'Description'];
  const rows = catalogue.map(item => [item.id, item.name, item.category, (0, _currency.paiseToRupeesString)(item.defaultPricePaise), item.minPricePaise !== undefined ? (0, _currency.paiseToRupeesString)(item.minPricePaise) : '', item.maxPricePaise !== undefined ? (0, _currency.paiseToRupeesString)(item.maxPricePaise) : '', item.costPricePaise !== undefined ? (0, _currency.paiseToRupeesString)(item.costPricePaise) : '', item.unit, item.isActive ? 'Yes' : 'No', item.description || '']);
  return rowsToCsv(headers, rows);
}
function generatePeriodReportCsv(report) {
  const summaryRows = [['Report Period', `${report.startDate} to ${report.endDate}`], ['Active Invoices (Excl. Cancelled)', report.activeInvoiceCount], ['Cancelled Invoices', report.cancelledInvoiceCount], ['Invoiced Sales Value (INR)', (0, _currency.paiseToRupeesString)(report.invoicedSalesPaise)], ['Discounts Given (INR)', (0, _currency.paiseToRupeesString)(report.discountsGivenPaise)], ['Gross Payments Received in Period (INR)', (0, _currency.paiseToRupeesString)(report.paymentsReceivedPaise)], ['Refunds Issued in Period (INR)', (0, _currency.paiseToRupeesString)(report.refundsIssuedPaise)], ['Net Cash/Payments Collected in Period (INR)', (0, _currency.paiseToRupeesString)(report.netCashCollectedPaise)], ['Outstanding Balance on Active Bills (INR)', (0, _currency.paiseToRupeesString)(report.outstandingBalancePaise)], ['', ''], ['Category Breakdown', 'Quantity', 'Revenue (INR)', 'Estimated Cost (INR)']];
  for (const cat of report.categoryBreakdown) {
    summaryRows.push([cat.label, cat.quantity, (0, _currency.paiseToRupeesString)(cat.revenuePaise), (0, _currency.paiseToRupeesString)(cat.estimatedCostPaise)]);
  }
  summaryRows.push(['', '', '', '']);
  summaryRows.push(['Item Breakdown', 'Category', 'Quantity', 'Revenue (INR)']);
  for (const item of report.itemBreakdown) {
    summaryRows.push([item.name, item.category, item.quantity, (0, _currency.paiseToRupeesString)(item.revenuePaise)]);
  }
  return rowsToCsv(['Metric / Item', 'Value / Category', 'Extra 1', 'Extra 2'], summaryRows);
}
function triggerTextFileDownload(filename, content, mimeType = 'text/csv;charset=utf-8') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], {
    type: mimeType
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
  };
  __modules["./src/utils/currency"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PAYMENT_METHOD_LABELS = void 0;
exports.calculateInvoiceTotals = calculateInvoiceTotals;
exports.calculateLineTotalPaise = calculateLineTotalPaise;
exports.computePaymentLedger = computePaymentLedger;
exports.formatINR = formatINR;
exports.formatInvoiceNumber = formatInvoiceNumber;
exports.paiseToRupeesString = paiseToRupeesString;
exports.rupeesToPaise = rupeesToPaise;
/**
 * Converts a rupee value (string or number, e.g. "450", "450.5", 450.25)
 * into exact integer paise without floating-point drift.
 */
function rupeesToPaise(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error('Invalid currency amount');
    }
    return Math.round(input * 100);
  }
  const trimmed = String(input ?? '').trim().replace(/,/g, '').replace(/^₹\s*/, '');
  if (!trimmed) return 0;
  if (!/^-?\d+(\.\d{0,2})?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid currency format: "${input}"`);
    }
    return Math.round(parsed * 100);
  }
  const isNegative = trimmed.startsWith('-');
  const clean = isNegative ? trimmed.slice(1) : trimmed;
  const [wholePart = '0', fracPart = ''] = clean.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const paise = parseInt(wholePart, 10) * 100 + parseInt(paddedFrac, 10);
  return isNegative ? -paise : paise;
}

/**
 * Converts integer paise to a plain rupee string suitable for input fields.
 */
function paiseToRupeesString(paise) {
  if (!Number.isFinite(paise)) return '0';
  const rounded = Math.round(paise);
  const isNeg = rounded < 0;
  const abs = Math.abs(rounded);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const formatted = rem === 0 ? `${rupees}` : `${rupees}.${String(rem).padStart(2, '0')}`;
  return isNeg ? `-${formatted}` : formatted;
}

/**
 * Formats integer paise into Indian Rupee format (e.g., ₹1,250 or ₹1,25,000.50).
 */
function formatINR(paise, alwaysShowPaise = false) {
  if (!Number.isFinite(paise)) return '₹0';
  const rounded = Math.round(paise);
  const isNegative = rounded < 0;
  const absPaise = Math.abs(rounded);
  const wholeRupees = Math.floor(absPaise / 100);
  const remPaise = absPaise % 100;
  const rupeeStr = formatIndianInteger(wholeRupees);
  const fracStr = remPaise > 0 || alwaysShowPaise ? `.${String(remPaise).padStart(2, '0')}` : '';
  return `${isNegative ? '-₹' : '₹'}${rupeeStr}${fracStr}`;
}
function formatIndianInteger(num) {
  const s = String(Math.floor(Math.abs(num)));
  if (s.length <= 3) return s;
  const lastThree = s.slice(-3);
  const otherNumbers = s.slice(0, -3);
  const grouped = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${lastThree}`;
}

/**
 * Calculates exact integer paise for a single line item.
 * Quantity can be integer or decimal (e.g. 2.5 mtr of fabric/lace).
 */
function calculateLineTotalPaise(quantity, unitPricePaise) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }
  if (!Number.isFinite(unitPricePaise) || unitPricePaise < 0) {
    throw new Error('Unit price cannot be negative');
  }
  const intUnitPaise = Math.round(unitPricePaise);
  // Multiply using integer thousandths of quantity to avoid float drift
  const qtyThousandths = Math.round(quantity * 1000);
  return Math.round(qtyThousandths * intUnitPaise / 1000);
}
function calculateInvoiceTotals(input) {
  let subtotalPaise = 0;
  for (const item of input.items) {
    const lineTotal = calculateLineTotalPaise(item.quantity, item.unitPricePaise);
    subtotalPaise += lineTotal;
  }
  let rawDiscountPaise = 0;
  if (input.discountType === 'flat') {
    rawDiscountPaise = Math.max(0, Math.round(input.discountValue || 0));
  } else if (input.discountType === 'percent') {
    const pct = Math.max(0, Math.min(100, Number(input.discountValue || 0)));
    const basisPoints = Math.round(pct * 100);
    rawDiscountPaise = Math.round(subtotalPaise * basisPoints / 10000);
  }
  const discountPaise = Math.min(subtotalPaise, rawDiscountPaise);
  const taxablePaise = Math.max(0, subtotalPaise - discountPaise);
  let taxPaise = 0;
  if (input.taxEnabled && input.taxRatePercent && input.taxRatePercent > 0) {
    const taxBasisPoints = Math.round(input.taxRatePercent * 100);
    taxPaise = Math.round(taxablePaise * taxBasisPoints / 10000);
  }
  const totalPaise = taxablePaise + taxPaise;
  return {
    subtotalPaise,
    discountPaise,
    taxablePaise,
    taxPaise,
    totalPaise
  };
}
/**
 * Computes the complete payment ledger and status from explicit PaymentRecords.
 * Advance payments are stored as explicit PaymentRecords with type === 'advance'
 * and are NEVER double-counted alongside subsequent payments.
 */
function computePaymentLedger(totalPaise, isCancelled, payments) {
  let advancePaise = 0;
  let subsequentPaidPaise = 0;
  let refundedPaise = 0;
  let correctionPaise = 0;
  for (const p of payments) {
    const amt = Math.round(p.amountPaise || 0);
    if (p.type === 'advance') {
      advancePaise += amt;
    } else if (p.type === 'payment') {
      subsequentPaidPaise += amt;
    } else if (p.type === 'refund') {
      refundedPaise += Math.abs(amt);
    } else if (p.type === 'correction') {
      correctionPaise += amt;
    }
  }
  const rawNetPaid = advancePaise + subsequentPaidPaise + correctionPaise - refundedPaise;
  const netPaidPaise = Math.max(0, rawNetPaid);
  const cleanTotal = Math.max(0, Math.round(totalPaise));
  if (isCancelled) {
    return {
      advancePaise,
      subsequentPaidPaise,
      refundedPaise,
      correctionPaise,
      netPaidPaise,
      balancePaise: 0,
      overpaidPaise: 0,
      status: 'Cancelled'
    };
  }
  const balancePaise = Math.max(0, cleanTotal - netPaidPaise);
  const overpaidPaise = Math.max(0, netPaidPaise - cleanTotal);
  let status;
  if (cleanTotal === 0) {
    status = 'Paid';
  } else if (netPaidPaise <= 0) {
    status = 'Unpaid';
  } else if (netPaidPaise < cleanTotal) {
    status = 'Partially Paid';
  } else {
    status = 'Paid';
  }
  return {
    advancePaise,
    subsequentPaidPaise,
    refundedPaise,
    correctionPaise,
    netPaidPaise,
    balancePaise,
    overpaidPaise,
    status
  };
}
const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other'
};
exports.PAYMENT_METHOD_LABELS = PAYMENT_METHOD_LABELS;
function formatInvoiceNumber(prefix, year, sequence) {
  const cleanPrefix = (prefix || 'ALIF').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'ALIF';
  const paddedSeq = String(Math.max(1, Math.floor(sequence))).padStart(4, '0');
  return `${cleanPrefix}-${year}-${paddedSeq}`;
}
  };
  __modules["./src/utils/pdf"] = function(module, exports, __req) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.buildConciseInvoiceMessage = buildConciseInvoiceMessage;
exports.buildSmsShareUrl = buildSmsShareUrl;
exports.buildWhatsAppShareUrl = buildWhatsAppShareUrl;
exports.createInvoicePdfBlob = createInvoicePdfBlob;
exports.downloadInvoicePdf = downloadInvoicePdf;
exports.formatRupeesPlain = formatRupeesPlain;
exports.generateInvoicePdfBytes = generateInvoicePdfBytes;
exports.normalizeIndianPhone = normalizeIndianPhone;
exports.printInvoiceReceipt = printInvoiceReceipt;
exports.shareInvoicePdf = shareInvoicePdf;
var _currency = __req("./currency");
/**
 * Formats integer paise for standard PDF Type1 Helvetica font (which uses WinAnsi/ASCII
 * where 'Rs.' is universally readable without missing-glyph boxes).
 */
function formatPdfCurrency(paise) {
  const formatted = (0, _currency.formatINR)(paise);
  return formatted.replace(/₹/g, 'Rs. ');
}
function escapePdfText(text) {
  return String(text || '').replace(/₹/g, 'Rs. ').replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Generates a real, standards-compliant PDF 1.4 binary document (Uint8Array)
 * containing ALiF Ladies Tailor branding, customer & invoice details, itemised table,
 * discount, payment history, advance, and balance due.
 */
function generateInvoicePdfBytes(invoice, payments, settings) {
  const pageWidth = 595.28; // A4 width in pt
  const pageHeight = 841.89; // A4 height in pt
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const ops = [];
  const drawRect = (x, yTop, w, h, fillRgb) => {
    const yPdf = pageHeight - yTop - h;
    ops.push(`q ${fillRgb[0].toFixed(3)} ${fillRgb[1].toFixed(3)} ${fillRgb[2].toFixed(3)} rg ${x.toFixed(2)} ${yPdf.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`);
  };
  const drawStrokeRect = (x, yTop, w, h, strokeRgb, lineWidth = 0.75) => {
    const yPdf = pageHeight - yTop - h;
    ops.push(`q ${lineWidth.toFixed(2)} w ${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG ${x.toFixed(2)} ${yPdf.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S Q`);
  };
  const drawLine = (x1, yTop1, x2, yTop2, strokeRgb = [0.85, 0.84, 0.81], lineWidth = 0.75) => {
    const y1 = pageHeight - yTop1;
    const y2 = pageHeight - yTop2;
    ops.push(`q ${lineWidth.toFixed(2)} w ${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  };
  const drawText = (text, x, yTop, options = {}) => {
    const font = options.font || 'F1';
    const size = options.size || 10;
    const color = options.color || [0.11, 0.11, 0.13];
    const align = options.align || 'left';
    const clean = escapePdfText(text);
    const approxWidth = String(text || '').replace(/₹/g, 'Rs. ').length * size * (font === 'F2' ? 0.54 : 0.5);
    let drawX = x;
    if (align === 'right') drawX = x - approxWidth;else if (align === 'center') drawX = x - approxWidth / 2;
    const yPdf = pageHeight - yTop;
    ops.push(`BT /${font} ${size} Tf ${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg ${drawX.toFixed(2)} ${yPdf.toFixed(2)} Td (${clean}) Tj ET`);
  };

  // 1. Header Banner (Charcoal/Black minimal premium header)
  drawRect(margin, 36, contentWidth, 74, [0.05, 0.05, 0.06]);
  drawText(settings.shopName || 'ALiF Ladies Tailor', margin + 18, 62, {
    font: 'F2',
    size: 20,
    color: [0.97, 0.96, 0.95]
  });
  drawText(settings.tagline || 'Ladies Tailoring & Boutique Finishing', margin + 18, 80, {
    font: 'F1',
    size: 9,
    color: [0.75, 0.76, 0.78]
  });
  const locationLine = [settings.address, settings.city, settings.state, settings.pinCode].filter(Boolean).join(', ');
  drawText(`${locationLine}  |  Phone: ${settings.phone}`, margin + 18, 96, {
    font: 'F1',
    size: 8.5,
    color: [0.68, 0.70, 0.73]
  });

  // Status badge in header right
  drawText('TAX INVOICE / TAILORING BILL', pageWidth - margin - 18, 60, {
    font: 'F2',
    size: 10,
    color: [0.97, 0.96, 0.95],
    align: 'right'
  });
  drawText(`STATUS: ${invoice.status.toUpperCase()}`, pageWidth - margin - 18, 78, {
    font: 'F2',
    size: 10,
    color: invoice.status === 'Paid' ? [0.43, 0.91, 0.72] : invoice.status === 'Cancelled' ? [0.98, 0.55, 0.55] : [0.98, 0.82, 0.45],
    align: 'right'
  });
  drawText(`No: ${invoice.invoiceNumber}`, pageWidth - margin - 18, 95, {
    font: 'F1',
    size: 9.5,
    color: [0.90, 0.90, 0.92],
    align: 'right'
  });

  // 2. Customer & Invoice Metadata Box
  let y = 122;
  drawRect(margin, y, contentWidth, 62, [0.97, 0.96, 0.95]);
  drawStrokeRect(margin, y, contentWidth, 62, [0.85, 0.84, 0.81]);
  drawText('BILLED TO:', margin + 14, y + 18, {
    font: 'F2',
    size: 8.5,
    color: [0.42, 0.45, 0.50]
  });
  drawText(invoice.customerName || 'Walk-in Customer', margin + 14, y + 34, {
    font: 'F2',
    size: 12
  });
  drawText(`Phone: ${invoice.customerPhone || 'N/A'}`, margin + 14, y + 50, {
    font: 'F1',
    size: 9.5,
    color: [0.32, 0.34, 0.38]
  });
  const metaX = margin + contentWidth * 0.56;
  drawText(`Invoice Number: ${invoice.invoiceNumber}`, metaX, y + 18, {
    font: 'F2',
    size: 9.5
  });
  drawText(`Bill Date: ${invoice.invoiceDate}`, metaX, y + 34, {
    font: 'F1',
    size: 9.5
  });
  drawText(`Collection Date: ${invoice.collectionDate ? invoice.collectionDate : 'As Scheduled'}`, metaX, y + 50, {
    font: 'F2',
    size: 9.5,
    color: [0.15, 0.16, 0.18]
  });
  y += 76;

  // Cancelled Notice if applicable
  if (invoice.status === 'Cancelled') {
    drawRect(margin, y, contentWidth, 26, [0.99, 0.93, 0.93]);
    drawStrokeRect(margin, y, contentWidth, 26, [0.90, 0.45, 0.45]);
    drawText(`CANCELLED BILL — Reason: ${invoice.cancelReason || 'Cancelled by shop'}`, margin + 12, y + 17, {
      font: 'F2',
      size: 9.5,
      color: [0.72, 0.11, 0.11]
    });
    y += 36;
  }

  // 3. Line Items Table Header
  drawRect(margin, y, contentWidth, 24, [0.14, 0.15, 0.17]);
  drawText('#', margin + 10, y + 16, {
    font: 'F2',
    size: 9,
    color: [1, 1, 1]
  });
  drawText('ITEM / TAILORING SERVICE', margin + 32, y + 16, {
    font: 'F2',
    size: 9,
    color: [1, 1, 1]
  });
  drawText('CATEGORY', margin + 245, y + 16, {
    font: 'F2',
    size: 9,
    color: [1, 1, 1]
  });
  drawText('QTY', margin + 335, y + 16, {
    font: 'F2',
    size: 9,
    color: [1, 1, 1]
  });
  drawText('RATE', margin + 425, y + 16, {
    font: 'F2',
    size: 9,
    color: [1, 1, 1],
    align: 'right'
  });
  drawText('AMOUNT', pageWidth - margin - 10, y + 16, {
    font: 'F2',
    size: 9,
    color: [1, 1, 1],
    align: 'right'
  });
  y += 24;

  // Line Items Rows
  const maxItemsToRender = Math.min(invoice.items.length, 14);
  for (let idx = 0; idx < maxItemsToRender; idx++) {
    const item = invoice.items[idx];
    const rowHeight = item.notes ? 30 : 22;
    if (idx % 2 === 1) {
      drawRect(margin, y, contentWidth, rowHeight, [0.98, 0.98, 0.97]);
    }
    drawText(String(idx + 1), margin + 10, y + 15, {
      size: 9
    });
    drawText(item.name.slice(0, 36), margin + 32, y + 15, {
      font: 'F2',
      size: 9.5
    });
    if (item.notes) {
      drawText(`Note: ${item.notes.slice(0, 48)}`, margin + 32, y + 26, {
        size: 8,
        color: [0.42, 0.45, 0.50]
      });
    }
    drawText(item.category.toUpperCase(), margin + 245, y + 15, {
      size: 8.5,
      color: [0.40, 0.42, 0.46]
    });
    drawText(`${item.quantity} ${item.unit}`, margin + 335, y + 15, {
      size: 9
    });
    drawText(formatPdfCurrency(item.unitPricePaise), margin + 425, y + 15, {
      size: 9,
      align: 'right'
    });
    drawText(formatPdfCurrency(item.lineTotalPaise), pageWidth - margin - 10, y + 15, {
      font: 'F2',
      size: 9.5,
      align: 'right'
    });
    drawLine(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  }
  y += 12;

  // 4. Totals & Payment Summary Side-by-Side
  const totalsBoxX = margin + contentWidth * 0.52;
  const totalsBoxW = contentWidth * 0.48;
  let totalsY = y;
  const drawTotalRow = (label, val, bold = false, highlight = false) => {
    if (highlight) {
      drawRect(totalsBoxX, totalsY, totalsBoxW, 24, [0.07, 0.07, 0.09]);
      drawText(label, totalsBoxX + 10, totalsY + 16, {
        font: 'F2',
        size: 10,
        color: [1, 1, 1]
      });
      drawText(val, totalsBoxX + totalsBoxW - 10, totalsY + 16, {
        font: 'F2',
        size: 10.5,
        color: [1, 1, 1],
        align: 'right'
      });
      totalsY += 26;
    } else {
      drawText(label, totalsBoxX + 10, totalsY + 14, {
        font: bold ? 'F2' : 'F1',
        size: 9.5,
        color: [0.22, 0.24, 0.27]
      });
      drawText(val, totalsBoxX + totalsBoxW - 10, totalsY + 14, {
        font: bold ? 'F2' : 'F1',
        size: 9.5,
        align: 'right'
      });
      drawLine(totalsBoxX, totalsY + 20, totalsBoxX + totalsBoxW, totalsY + 20);
      totalsY += 20;
    }
  };
  drawTotalRow('Subtotal', formatPdfCurrency(invoice.subtotalPaise));
  if (invoice.discountPaise > 0) {
    const discLabel = invoice.discountType === 'percent' ? `Discount (${invoice.discountValue}%)` : 'Discount';
    drawTotalRow(discLabel, `- ${formatPdfCurrency(invoice.discountPaise)}`);
  }
  if (invoice.taxEnabled && invoice.taxPaise > 0) {
    drawTotalRow(`${invoice.taxLabel || 'Tax'} (${invoice.taxRatePercent}%)`, formatPdfCurrency(invoice.taxPaise));
  }
  drawTotalRow('FINAL TOTAL', formatPdfCurrency(invoice.totalPaise), true, true);
  drawTotalRow('Advance at Billing', formatPdfCurrency(invoice.advancePaise));
  drawTotalRow('Total Net Paid', formatPdfCurrency(invoice.paidPaise), true);
  drawTotalRow('BALANCE DUE', formatPdfCurrency(invoice.balancePaise), true, invoice.balancePaise > 0 && invoice.status !== 'Cancelled');

  // Left side: Notes & Payment History
  let leftY = y;
  const leftW = contentWidth * 0.48;
  if (invoice.notes) {
    drawText('STITCHING / MEASUREMENT NOTES:', margin, leftY + 12, {
      font: 'F2',
      size: 8.5,
      color: [0.42, 0.45, 0.50]
    });
    drawText(invoice.notes.slice(0, 65), margin, leftY + 26, {
      size: 9
    });
    if (invoice.notes.length > 65) {
      drawText(invoice.notes.slice(65, 130), margin, leftY + 38, {
        size: 9
      });
      leftY += 46;
    } else {
      leftY += 34;
    }
  }
  drawText('PAYMENT HISTORY:', margin, leftY + 14, {
    font: 'F2',
    size: 8.5,
    color: [0.42, 0.45, 0.50]
  });
  leftY += 20;
  if (payments.length === 0) {
    drawText('No payments recorded yet.', margin, leftY + 12, {
      size: 8.5,
      color: [0.5, 0.5, 0.55]
    });
    leftY += 18;
  } else {
    for (const p of payments.slice(0, 6)) {
      const methodLabel = _currency.PAYMENT_METHOD_LABELS[p.method] || p.method;
      const typeLabel = p.type.toUpperCase();
      const sign = p.type === 'refund' ? '-' : '';
      drawText(`${p.date} | ${typeLabel} (${methodLabel}): ${sign}${formatPdfCurrency(p.amountPaise)}`, margin, leftY + 12, {
        size: 8.5
      });
      leftY += 14;
    }
    drawLine(margin, leftY + 4, margin + leftW, leftY + 4);
  }

  // 5. Footer
  const footerY = Math.max(totalsY + 36, leftY + 36, 755);
  drawLine(margin, footerY, pageWidth - margin, footerY, [0.15, 0.16, 0.18], 1);
  drawText(settings.receiptFooter || 'Thank you for choosing ALiF Ladies Tailor, Sahibganj.', margin, footerY + 16, {
    size: 8.5,
    color: [0.35, 0.37, 0.40]
  });
  drawText('Authorised Signatory — ALiF Ladies Tailor', pageWidth - margin, footerY + 32, {
    font: 'F2',
    size: 9,
    align: 'right'
  });

  // Assemble valid PDF 1.4 objects
  const streamContent = ops.join('\n');
  const objects = ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj', '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj', `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`, '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj', '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj', `6 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`];
  let pdfString = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdfString.length);
    pdfString += obj + '\n';
  }
  const xrefStart = pdfString.length;
  pdfString += `xref\n0 ${objects.length + 1}\n`;
  pdfString += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdfString += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfString += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const bytes = new Uint8Array(pdfString.length);
  for (let i = 0; i < pdfString.length; i++) {
    bytes[i] = pdfString.charCodeAt(i) & 0xff;
  }
  return bytes;
}
function createInvoicePdfBlob(invoice, payments, settings) {
  const bytes = generateInvoicePdfBytes(invoice, payments, settings);
  return new Blob([bytes], {
    type: 'application/pdf'
  });
}
function downloadInvoicePdf(invoice, payments, settings) {
  const filename = `${invoice.invoiceNumber}.pdf`;
  if (typeof document === 'undefined') return filename;
  const blob = createInvoicePdfBlob(invoice, payments, settings);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}
async function shareInvoicePdf(invoice, payments, settings) {
  const filename = `${invoice.invoiceNumber}.pdf`;
  const summaryText = buildConciseInvoiceMessage(invoice, settings);
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const blob = createInvoicePdfBlob(invoice, payments, settings);
      if (typeof File !== 'undefined') {
        const file = new File([blob], filename, {
          type: 'application/pdf'
        });
        if (typeof navigator.canShare === 'function' && navigator.canShare({
          files: [file]
        })) {
          await navigator.share({
            title: `${settings.shopName} — Bill ${invoice.invoiceNumber}`,
            text: summaryText,
            files: [file]
          });
          return {
            shared: true,
            method: 'native-file',
            message: 'Opened system share sheet with PDF invoice.'
          };
        }
      }
      await navigator.share({
        title: `${settings.shopName} — Bill ${invoice.invoiceNumber}`,
        text: summaryText
      });
      return {
        shared: true,
        method: 'native-text',
        message: 'Opened system share sheet with invoice summary.'
      };
    } catch (_err) {
      // User cancelled or browser blocked native share; fall back to download
    }
  }
  downloadInvoicePdf(invoice, payments, settings);
  return {
    shared: false,
    method: 'download-fallback',
    message: `Downloaded ${filename}. Attach it in WhatsApp or your messaging app to send.`
  };
}
function printInvoiceReceipt(invoice, payments, settings) {
  if (typeof window === 'undefined') return;
  const blob = createInvoicePdfBlob(invoice, payments, settings);
  const url = URL.createObjectURL(blob);
  const printWin = window.open(url, '_blank');
  if (!printWin) {
    window.print();
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Normalizes an Indian phone number for wa.me / SMS links.
 */
function normalizeIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}
function buildConciseInvoiceMessage(invoice, settings) {
  const lines = [`*${settings.shopName}* (${settings.city})`, `Bill No: *${invoice.invoiceNumber}*`, `Date: ${invoice.invoiceDate}`, `Customer: ${invoice.customerName}`];
  if (invoice.collectionDate) {
    lines.push(`Collection Date: ${invoice.collectionDate}`);
  }
  lines.push('Items: ' + invoice.items.map(it => `${it.name} x${it.quantity} (${(0, _currency.formatINR)(it.lineTotalPaise)})`).join(', '));
  if (invoice.discountPaise > 0) {
    lines.push(`Subtotal: ${(0, _currency.formatINR)(invoice.subtotalPaise)} | Discount: -${(0, _currency.formatINR)(invoice.discountPaise)}`);
  }
  lines.push(`*Total: ${(0, _currency.formatINR)(invoice.totalPaise)}*`);
  lines.push(`Paid: ${(0, _currency.formatINR)(invoice.paidPaise)} (Advance: ${(0, _currency.formatINR)(invoice.advancePaise)})`);
  lines.push(`*Balance Due: ${(0, _currency.formatINR)(invoice.balancePaise)}* (${invoice.status})`);
  if (invoice.status === 'Cancelled' && invoice.cancelReason) {
    lines.push(`Cancelled Reason: ${invoice.cancelReason}`);
  } else {
    lines.push(`Thank you for visiting ${settings.shopName}!`);
  }
  return lines.join('\n');
}
function buildWhatsAppShareUrl(invoice, settings) {
  const phone = normalizeIndianPhone(invoice.customerPhone);
  const text = encodeURIComponent(buildConciseInvoiceMessage(invoice, settings));
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
function buildSmsShareUrl(invoice, settings) {
  const digits = normalizeIndianPhone(invoice.customerPhone);
  const target = digits ? `+${digits}` : '';
  const plainText = buildConciseInvoiceMessage(invoice, settings).replace(/\*/g, '');
  return `sms:${target}?body=${encodeURIComponent(plainText)}`;
}
function formatRupeesPlain(paise) {
  return (0, _currency.paiseToRupeesString)(paise);
}
  };

  function resolvePath(baseDir, target) {
    if (!target.startsWith('.')) return target;
    const parts = (baseDir + '/' + target).split('/');
    const out = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return './' + out.join('/');
  }
  function __require(id, fromDir) {
    const resolved = fromDir && id.startsWith('.') ? resolvePath(fromDir, id) : id;
    const candidates = [
      resolved,
      resolved.replace(/\.(ts|tsx|js)$/, ''),
      resolved + '/index'
    ];
    let foundId = null;
    for (const c of candidates) {
      if (__modules[c]) {
        foundId = c;
        break;
      }
    }
    if (!foundId) {
      throw new Error('Cannot find module: ' + id + ' (resolved: ' + resolved + ')');
    }
    if (__cache[foundId]) return __cache[foundId].exports;
    const mod = { exports: {} };
    __cache[foundId] = mod;
    const nextDir = foundId.startsWith('./') ? foundId.split('/').slice(0, -1).join('/') : '';
    __modules[foundId](mod, mod.exports, (childId) => __require(childId, nextDir));
    return mod.exports;
  }
  window.__ALIF_REQUIRE__ = __require;
  __require('./src/main', '.');
})();
