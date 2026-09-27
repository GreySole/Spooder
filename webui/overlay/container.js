(function () {
  // /overlays/<name> picks a saved layout. The bare /overlays/ URL names none, so it's empty.
  const layoutName = (window.location.pathname.split('/')[2] || '').toLowerCase();

  async function fetchConfig() {
    if (!layoutName) {
      return { order: [] };
    }
    const res = await fetch(
      window.location.origin +
        '/overlay_container/config?layout=' +
        encodeURIComponent(layoutName),
    );
    if (!res.ok) {
      console.error('No overlay layout named', layoutName);
      return { order: [] };
    }
    return res.json();
  }

  // A layer is either a plugin's overlay page (drawn as an iframe) or a built-in widget.
  function applyBoxStyle(el, entry) {
    el.style.left = entry.x + '%';
    el.style.top = entry.y + '%';
    el.style.width = entry.width + '%';
    el.style.height = entry.height + '%';
  }

  async function initViewMode() {
    const config = await fetchConfig();
    const layers = config.layers || [];
    if (layers.length === 0) {
      return;
    }

    const stack = document.getElementById('stack');
    const iframes = new Map();
    const widgets = [];

    for (const entry of layers) {
      // The saved order is front-to-back, so the first layer gets the highest z-index.
      const zIndex = String(layers.length - layers.indexOf(entry));

      if (entry.type === 'widget') {
        const widget = window.SpooderWidgets && window.SpooderWidgets.create(entry);
        if (!widget) continue;
        widget.el.style.zIndex = zIndex;
        applyBoxStyle(widget.el, entry);
        stack.appendChild(widget.el);
        widgets.push(widget);
        continue;
      }

      const iframe = document.createElement('iframe');
      iframe.src = '/overlay/' + entry.pluginName + '/index.html?bridge=1';
      iframe.style.position = 'absolute';
      iframe.style.border = 'none';
      iframe.style.background = 'transparent';
      // The editor treats a lower index in the saved order as more "front" (its layer list
      // shows the front-most overlay at the top). Set z-index explicitly from that index rather
      // than relying on append order, which would put the *last* entry on top instead.
      iframe.style.zIndex = zIndex;
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
      const payload = { type: 'message', address: message.address, args: message.args };
      for (const widget of widgets) {
        widget.update(message);
      }
      // Messages are broadcast to every OSC client, and a plugin's overlay page sees all of them
      // standalone. Only some are namespaced by plugin name ('/alerttoaster/alert'); others use
      // their own ('/chat/general' belongs to the chatbox plugin), so routing on the first
      // segment alone dropped those. Whatever doesn't name an overlay goes to all of them, and
      // each page ignores addresses it doesn't handle, as it does standalone.
      if (iframes.has(pluginName)) {
        postToPlugin(pluginName, payload);
        return;
      }
      for (const name of iframes.keys()) {
        postToPlugin(name, payload);
      }
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

  initViewMode();
})();
