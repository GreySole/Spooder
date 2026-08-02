(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('edit') === '1';
  console.log(isEditMode);

  const SNAP_PX = 8;
  const SAFE_AREAS = [10, 5]; // % inset guides: title-safe, action-safe

  async function fetchConfig() {
    const res = await fetch(window.location.origin + '/overlay_container/config');
    return res.json();
  }

  async function saveConfig(order) {
    const res = await fetch(window.location.origin + '/overlay_container/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    return res.json();
  }

  function applyBoxStyle(el, entry) {
    el.style.left = entry.x + '%';
    el.style.top = entry.y + '%';
    el.style.width = entry.width + '%';
    el.style.height = entry.height + '%';
  }

  async function initViewMode() {
    const config = await fetchConfig();
    const enabled = config.order.filter((entry) => entry.enabled);
    if (enabled.length === 0) {
      return;
    }

    const stack = document.getElementById('stack');
    const iframes = new Map();

    for (const entry of enabled) {
      const iframe = document.createElement('iframe');
      iframe.src = '/overlay/' + entry.pluginName + '/index.html?bridge=1';
      iframe.style.position = 'absolute';
      iframe.style.border = 'none';
      iframe.style.background = 'transparent';
      applyBoxStyle(iframe, entry);
      stack.appendChild(iframe);
      iframes.set(entry.pluginName, iframe);
    }

    const host = window.location.host;
    const protocol = window.location.protocol;
    const url = (protocol === 'https:' ? 'wss://' : 'ws://') + host + '/osc';
    const tcpPlugin = new window.OSC.WebsocketClientPlugin({ url });
    const osc = new window.OSC({ plugin: tcpPlugin });

    function postToPlugin(pluginName, payload) {
      const iframe = iframes.get(pluginName);
      if (!iframe || !iframe.contentWindow) return;
      console.log("Posting to plugin", pluginName, payload);
      iframe.contentWindow.postMessage(
        Object.assign({ __spooderBridge: true, pluginName }, payload),
        window.location.origin,
      );
    }

    let reconnectTimer = null;
    function scheduleReconnect() {
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        osc.open();
      }, 2000);
    }

    osc.on('open', () => {
      console.log('OVERLAY CONTAINER: OSC OPEN');
      for (const pluginName of iframes.keys()) {
        osc.send(
          new window.OSC.Message(
            '/' + pluginName + '/connect',
            JSON.stringify({ version: 'container', name: pluginName, type: 'overlay' }),
          ),
        );
        postToPlugin(pluginName, { type: 'open' });
      }
    });

    for (const pluginName of iframes.keys()) {
      osc.on('/' + pluginName + '/connect/success', () => {
        postToPlugin(pluginName, { type: 'connect_success' });
      });
    }

    osc.on('*', (message) => {
      const pluginName = message.address.split('/')[1];
      console.log("Incoming OSC message", message);
      if (!iframes.has(pluginName)) return;
      postToPlugin(pluginName, {
        type: 'message',
        address: message.address,
        args: message.args,
      });
    });

    osc.on('close', () => {
      for (const pluginName of iframes.keys()) {
        postToPlugin(pluginName, { type: 'close' });
      }
      scheduleReconnect();
    });

    osc.on('error', () => {
      for (const pluginName of iframes.keys()) {
        postToPlugin(pluginName, { type: 'error' });
      }
      scheduleReconnect();
    });

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.__spooderBridge !== true) return;

      const sourceIframe = iframes.get(data.pluginName);
      if (!sourceIframe || event.source !== sourceIframe.contentWindow) return;

      if (data.type === 'send') {
        osc.send(new window.OSC.Message(data.address, ...(data.args || [])));
      }
    });

    osc.open();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snapValue(value, targets, threshold) {
    let closest = null;
    let closestDist = threshold;
    for (const t of targets) {
      const dist = Math.abs(value - t);
      if (dist <= closestDist) {
        closest = t;
        closestDist = dist;
      }
    }
    return closest;
  }

  function getSnapTargets(order, excludeName, axis) {
    const targets = [0, 50, 100, ...SAFE_AREAS, ...SAFE_AREAS.map((a) => 100 - a)];
    for (const entry of order) {
      if (entry.pluginName === excludeName) continue;
      const pos = axis === 'x' ? entry.x : entry.y;
      const size = axis === 'x' ? entry.width : entry.height;
      targets.push(pos, pos + size, pos + size / 2);
    }
    return targets;
  }

  // Snaps a moving edge's left/center/right (or top/center/bottom) against targets.
  // Returns the adjusted position (top-left) for that axis and the guide coordinate to show.
  function snapPosition(pos, size, targets, threshold) {
    const left = pos;
    const center = pos + size / 2;
    const right = pos + size;

    const leftSnap = snapValue(left, targets, threshold);
    if (leftSnap !== null) return { value: leftSnap, guide: leftSnap };

    const centerSnap = snapValue(center, targets, threshold);
    if (centerSnap !== null) return { value: centerSnap - size / 2, guide: centerSnap };

    const rightSnap = snapValue(right, targets, threshold);
    if (rightSnap !== null) return { value: rightSnap - size, guide: rightSnap };

    return { value: pos, guide: null };
  }

  // Snaps a resizing edge (right or bottom) against targets, keeping the opposite edge fixed.
  function snapSize(pos, size, targets, threshold) {
    const edge = pos + size;
    const edgeSnap = snapValue(edge, targets, threshold);
    if (edgeSnap !== null) return { value: edgeSnap - pos, guide: edgeSnap };
    return { value: size, guide: null };
  }

  function showGuideV(guideV, percent) {
    if (percent === null || percent === undefined) {
      guideV.style.display = 'none';
      return;
    }
    guideV.style.display = 'block';
    guideV.style.left = percent + '%';
  }

  function showGuideH(guideH, percent) {
    if (percent === null || percent === undefined) {
      guideH.style.display = 'none';
      return;
    }
    guideH.style.display = 'block';
    guideH.style.top = percent + '%';
  }

  function hideGuides(guideV, guideH) {
    guideV.style.display = 'none';
    guideH.style.display = 'none';
  }

  function makeInteractive(box, handle, entry, order, canvas, guideV, guideH) {
    box.addEventListener('pointerdown', (downEvent) => {
      if (downEvent.target === handle) return;
      downEvent.preventDefault();
      box.setPointerCapture(downEvent.pointerId);

      const rect = canvas.getBoundingClientRect();
      const startClientX = downEvent.clientX;
      const startClientY = downEvent.clientY;
      const startX = entry.x;
      const startY = entry.y;
      const thresholdX = (SNAP_PX / rect.width) * 100;
      const thresholdY = (SNAP_PX / rect.height) * 100;
      const targetsX = getSnapTargets(order, entry.pluginName, 'x');
      const targetsY = getSnapTargets(order, entry.pluginName, 'y');

      function onMove(moveEvent) {
        const dxPercent = ((moveEvent.clientX - startClientX) / rect.width) * 100;
        const dyPercent = ((moveEvent.clientY - startClientY) / rect.height) * 100;
        const rawX = clamp(startX + dxPercent, 0, 100 - entry.width);
        const rawY = clamp(startY + dyPercent, 0, 100 - entry.height);

        const snapX = snapPosition(rawX, entry.width, targetsX, thresholdX);
        const snapY = snapPosition(rawY, entry.height, targetsY, thresholdY);

        entry.x = clamp(snapX.value, 0, 100 - entry.width);
        entry.y = clamp(snapY.value, 0, 100 - entry.height);
        applyBoxStyle(box, entry);
        showGuideV(guideV, snapX.guide);
        showGuideH(guideH, snapY.guide);
      }

      function onUp(upEvent) {
        box.releasePointerCapture(upEvent.pointerId);
        box.removeEventListener('pointermove', onMove);
        box.removeEventListener('pointerup', onUp);
        hideGuides(guideV, guideH);
      }

      box.addEventListener('pointermove', onMove);
      box.addEventListener('pointerup', onUp);
    });

    handle.addEventListener('pointerdown', (downEvent) => {
      downEvent.preventDefault();
      downEvent.stopPropagation();
      handle.setPointerCapture(downEvent.pointerId);

      const rect = canvas.getBoundingClientRect();
      const startClientX = downEvent.clientX;
      const startClientY = downEvent.clientY;
      const startWidth = entry.width;
      const startHeight = entry.height;
      const thresholdX = (SNAP_PX / rect.width) * 100;
      const thresholdY = (SNAP_PX / rect.height) * 100;
      const targetsX = getSnapTargets(order, entry.pluginName, 'x');
      const targetsY = getSnapTargets(order, entry.pluginName, 'y');

      function onMove(moveEvent) {
        const dwPercent = ((moveEvent.clientX - startClientX) / rect.width) * 100;
        const dhPercent = ((moveEvent.clientY - startClientY) / rect.height) * 100;
        const rawWidth = clamp(startWidth + dwPercent, 5, 100 - entry.x);
        const rawHeight = clamp(startHeight + dhPercent, 5, 100 - entry.y);

        const snapW = snapSize(entry.x, rawWidth, targetsX, thresholdX);
        const snapH = snapSize(entry.y, rawHeight, targetsY, thresholdY);

        entry.width = clamp(snapW.value, 5, 100 - entry.x);
        entry.height = clamp(snapH.value, 5, 100 - entry.y);
        applyBoxStyle(box, entry);
        showGuideV(guideV, snapW.guide);
        showGuideH(guideH, snapH.guide);
      }

      function onUp(upEvent) {
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        hideGuides(guideV, guideH);
      }

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  }

  async function initEditMode() {
    const config = await fetchConfig();
    const panel = document.getElementById('editPanel');
    const stack = document.getElementById('stack');
    panel.style.display = 'block';
    stack.style.display = 'none';

    const order = config.order.slice();
    const boxesByName = new Map();

    function render() {
      panel.innerHTML = '';
      boxesByName.clear();

      const heading = document.createElement('h2');
      heading.textContent = 'Overlay Container';
      panel.appendChild(heading);

      const hint = document.createElement('p');
      hint.textContent =
        'Drag overlays to position them and use the corner handle to resize. Boxes snap to center, safe-area guides, and other overlays. Use the list below to enable/disable and set front-to-back order (top of list renders on top).';
      panel.appendChild(hint);

      const canvasWrap = document.createElement('div');
      canvasWrap.id = 'editCanvasWrap';
      const canvas = document.createElement('div');
      canvas.id = 'editCanvas';
      canvasWrap.appendChild(canvas);
      panel.appendChild(canvasWrap);

      for (const inset of SAFE_AREAS) {
        const guide = document.createElement('div');
        guide.className = 'safe-area-guide';
        guide.style.inset = inset + '%';
        canvas.appendChild(guide);
      }

      const guideV = document.createElement('div');
      guideV.className = 'smart-guide smart-guide-v';
      canvas.appendChild(guideV);
      const guideH = document.createElement('div');
      guideH.className = 'smart-guide smart-guide-h';
      canvas.appendChild(guideH);

      order.forEach((entry) => {
        if(!entry.enabled){
          return;
        }
        const box = document.createElement('div');
        box.className = 'overlay-box' + (entry.enabled ? '' : ' disabled');
        box.textContent = entry.displayName || entry.pluginName;
        applyBoxStyle(box, entry);

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        box.appendChild(handle);

        canvas.appendChild(box);
        boxesByName.set(entry.pluginName, box);

        makeInteractive(box, handle, entry, order, canvas, guideV, guideH);
      });

      const list = document.createElement('ul');

      order.forEach((entry, index) => {
        const item = document.createElement('li');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = entry.enabled;
        checkbox.addEventListener('change', () => {
          entry.enabled = checkbox.checked;
          const box = boxesByName.get(entry.pluginName);
          if (box) box.classList.toggle('disabled', !entry.enabled);
        });

        const label = document.createElement('span');
        label.textContent = entry.displayName || entry.pluginName;

        const upBtn = document.createElement('button');
        upBtn.textContent = '↑';
        upBtn.disabled = index === 0;
        upBtn.addEventListener('click', () => {
          const prev = order[index - 1];
          order[index - 1] = order[index];
          order[index] = prev;
          render();
        });

        const downBtn = document.createElement('button');
        downBtn.textContent = '↓';
        downBtn.disabled = index === order.length - 1;
        downBtn.addEventListener('click', () => {
          const next = order[index + 1];
          order[index + 1] = order[index];
          order[index] = next;
          render();
        });

        item.appendChild(checkbox);
        item.appendChild(label);
        item.appendChild(upBtn);
        item.appendChild(downBtn);
        list.appendChild(item);
      });

      panel.appendChild(list);

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', async () => {
        await saveConfig(
          order.map((entry) => ({
            pluginName: entry.pluginName,
            enabled: entry.enabled,
            x: entry.x,
            y: entry.y,
            width: entry.width,
            height: entry.height,
          })),
        );
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
          saveBtn.textContent = 'Save';
        }, 1500);
      });
      panel.appendChild(saveBtn);
    }

    render();
  }

  if (isEditMode) {
    console.log('Run edit mode');
    initEditMode();
  } else {
    initViewMode();
  }
})();
