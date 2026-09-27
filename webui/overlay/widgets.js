// Built-in widgets for the master overlay. Each draws into a layer's box and updates from the
// container's OSC connection. Keep the ids and setting names in step with the manifest in
// src/core/service/OverlayWidgets.ts, which is what the editor builds its settings forms from.
(function () {
  function toRgba(hex, opacityPercent) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!match) return 'transparent';
    const n = parseInt(match[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${(opacityPercent ?? 100) / 100})`;
  }

  function formatValue(value, decimals) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const places = Number.isInteger(Number(decimals)) ? Math.max(0, Number(decimals)) : 2;
      return value.toFixed(places);
    }
    return value === undefined || value === null ? '--' : String(value);
  }

  // Args arrive as {type, value} objects from osc-js, or bare values, depending on the source.
  function argValue(args, index) {
    const arg = (args || [])[index];
    return arg && typeof arg === 'object' && 'value' in arg ? arg.value : arg;
  }

  function makeBox() {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.boxSizing = 'border-box';
    // Sizes below are in container units (cqh/cqw), so a widget scales with its box - and with
    // whatever browser-source size the layout is shown in.
    el.style.containerType = 'size';
    el.style.overflow = 'hidden';
    el.style.fontFamily = 'sans-serif';
    return el;
  }

  // A builder draws a widget into its box and returns render(rawValue). Where the value comes
  // from is separate - see `sources` below - so the OSC and storage widgets share their drawing.
  const builders = {
    value(settings, el) {
      el.style.background = toRgba(settings.background, settings.backgroundOpacity);
      el.style.display = 'flex';
      el.style.flexDirection = 'column';
      el.style.justifyContent = 'center';
      el.style.textAlign = settings.align || 'left';
      el.style.padding = '0 2cqh';

      const hasLabel = !!settings.label;
      const size = Number(settings.fontSize) || 60;
      if (hasLabel) {
        const label = document.createElement('div');
        label.textContent = settings.label;
        label.style.color = settings.labelColor;
        label.style.fontSize = size * 0.5 + 'cqh';
        label.style.lineHeight = '1.1';
        el.appendChild(label);
      }
      const value = document.createElement('div');
      value.style.color = settings.color;
      // With a label above it the value shares the box, so it can't take the full height.
      value.style.fontSize = (hasLabel ? size * 0.7 : size) + 'cqh';
      value.style.lineHeight = '1.1';
      value.style.whiteSpace = 'nowrap';
      const render = (raw) =>
        (value.textContent =
          (settings.prefix || '') + formatValue(raw, settings.decimals) + (settings.suffix || ''));
      render(undefined);
      el.appendChild(value);

      return render;
    },

    bar(settings, el) {
      el.style.background = settings.background;
      const vertical = settings.orientation === 'vertical';

      const fill = document.createElement('div');
      fill.style.position = 'absolute';
      fill.style.background = settings.color;
      fill.style.left = '0';
      fill.style.bottom = '0';
      if (vertical) {
        fill.style.width = '100%';
        fill.style.height = '0%';
      } else {
        fill.style.height = '100%';
        fill.style.width = '0%';
      }
      el.appendChild(fill);

      const text = document.createElement('div');
      text.style.position = 'absolute';
      text.style.inset = '0';
      text.style.display = 'flex';
      text.style.alignItems = 'center';
      text.style.justifyContent = 'center';
      text.style.color = settings.textColor;
      text.style.fontSize = (vertical ? 12 : 55) + 'cqh';
      text.style.whiteSpace = 'nowrap';
      el.appendChild(text);

      const renderText = (raw) => {
        const parts = [];
        if (settings.label) parts.push(settings.label);
        if (settings.showValue) parts.push(formatValue(raw, settings.decimals));
        text.textContent = parts.join(': ');
      };
      renderText(undefined);

      // The range is normally fixed by the settings; a widget reading it from storage keys
      // changes it through setRange as those values arrive.
      let min = Number(settings.min);
      let max = Number(settings.max);
      let lastRaw;
      const render = (raw) => {
        lastRaw = raw;
        // A stored boolean fills the bar fully or not at all.
        const number = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
        const span = max - min;
        const ratio =
          typeof number === 'number' && span !== 0
            ? Math.min(1, Math.max(0, (number - min) / span))
            : 0;
        fill.style[vertical ? 'height' : 'width'] = ratio * 100 + '%';
        renderText(number);
      };
      render.setRange = (nextMin, nextMax) => {
        if (nextMin !== undefined && Number.isFinite(Number(nextMin))) min = Number(nextMin);
        if (nextMax !== undefined && Number.isFinite(Number(nextMax))) max = Number(nextMax);
        render(lastRaw);
      };
      return render;
    },
  };

  // Where a widget's value comes from. `read` returns { value } for a message the widget cares
  // about and null for any other; `start` runs once when the widget is created.
  const sources = {
    osc: {
      read(settings, message) {
        if (!settings.address || settings.address !== message.address) return null;
        return { value: argValue(message.args, Number(settings.argIndex) || 0) };
      },
    },
    // Event storage values are announced by the server as /eventstorage/value [event, key, json]
    // whenever one is written, and read once on load for the value already there.
    storage: {
      // With minFromKey / maxFromKey a bar's min and max come from other keys of the same event, so those
      // arrive as { min } / { max } beside the plain { value }.
      read(settings, message) {
        if (message.address !== '/eventstorage/value') return null;
        if (argValue(message.args, 0) !== settings.eventName) return null;
        const key = argValue(message.args, 1);
        let value;
        try {
          value = JSON.parse(argValue(message.args, 2));
        } catch (e) {
          return null;
        }
        if (key === settings.key) return { value };
        if (settings.minFromKey && key === settings.minKey) return { min: value };
        if (settings.maxFromKey && key === settings.maxKey) return { max: value };
        return null;
      },
      start(settings, render) {
        if (!settings.eventName) return;
        const load = (key, apply) => {
          if (!key) return;
          fetch(
            '/overlay_container/storage?event=' +
              encodeURIComponent(settings.eventName) +
              '&key=' +
              encodeURIComponent(key),
          )
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => {
              if (body && body.value !== null && body.value !== undefined) apply(body.value);
            })
            .catch(() => {});
        };
        load(settings.key, (value) => render(value));
        if (render.setRange) {
          if (settings.minFromKey) load(settings.minKey, (min) => render.setRange(min, undefined));
          if (settings.maxFromKey) load(settings.maxKey, (max) => render.setRange(undefined, max));
        }
      },
    },
  };

  const types = {
    osc_value: { builder: 'value', source: 'osc' },
    osc_bar: { builder: 'bar', source: 'osc' },
    storage_value: { builder: 'value', source: 'storage' },
    storage_bar: { builder: 'bar', source: 'storage' },
  };

  // Returns { el, update(message) }, or null for a type this page doesn't know. update() ignores
  // messages the widget has no interest in, so the container can hand every message to every
  // widget.
  window.SpooderWidgets = {
    create(layer) {
      const type = types[layer.widgetType];
      if (!type) return null;
      const settings = layer.settings || {};
      const source = sources[type.source];
      const el = makeBox();
      const render = builders[type.builder](settings, el);
      if (source.start) source.start(settings, render);
      return {
        el,
        update(message) {
          const result = source.read(settings, message);
          if (!result) return;
          if ('value' in result) render(result.value);
          if (render.setRange && ('min' in result || 'max' in result)) {
            render.setRange(result.min, result.max);
          }
        },
      };
    },
  };
})();
