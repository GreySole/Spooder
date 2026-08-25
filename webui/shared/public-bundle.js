// Shared bootstrap for plugin public pages, served at /shared/public-bundle.js.
//
// Drop this into a plugin's public index.html and it will fetch the server's public
// data, put the viewer through Twitch login if they aren't authenticated yet, and
// expose window.getApiUrl / window.publicData / window.userData for the page to use.
//
// This is for plain-JS public pages. Framework pages (React and friends) should do
// the same work inside their own component tree instead - the login screen here
// replaces document.body, which would blow away a mounted app's root node.

const path = window.location.pathname;
const pluginMatch = path.match(/\/plugin\/([^\/]+)/);
const pluginName = pluginMatch ? pluginMatch[1] : '';

window.getApiUrl = (endpoint) => {
  const realEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  return window.location.origin + '/plugin/api/' + pluginName + realEndpoint;
};

// Twitch's implicit flow sends the viewer back with #access_token=... in the URL.
// Pull it out of the hash on that first hop and keep it, otherwise fall back to
// whatever we stored on a previous visit. Without this the page posts an undefined
// token, validation always fails, and the viewer bounces through login forever.
function getStoredToken() {
  if (window.location.hash) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('access_token');
    if (token) {
      localStorage.setItem('twitch_access_token', token);
      window.location.hash = '';
      return token;
    }
  }
  return localStorage.getItem('twitch_access_token') ?? '';
}

function validateToken(token) {
  return fetch('/twitch/viewer/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: token }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.status !== 'ok') {
        showLogin();
      } else {
        window.userData = data.data;
      }
    });
}

function showLogin() {
  const twitchAuthURL = new URL(
    `https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=${window.publicData.clientId}&scope=&redirect_uri=${document.location.origin}&state=${pluginName}`,
  );
  document.body.innerHTML = `
    <div style="font-family:Arial; color:white; width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center;">

      ${buildSpooderPet().outerHTML}
      <h2>${window.publicData.botName}@${window.publicData.homeChannel}</h2>
      <h1>Hold up!</h1>
      <p>We need you to login to Twitch. This is just to get your profile for user experience and save data.</p>
      <button style="padding: 0.75em 2em; background: #444; color: white; border: 2px solid white; border-radius: 1em; font-size: 1.2em; cursor: pointer;">
          <a href="${twitchAuthURL}" style="color: inherit; text-decoration: none; display: block;">Login to Twitch</a>
      </button>
    </div>
  `;
}

function buildSpooderPet() {
  const spooderPet = window.publicData.spooderpet;
  const spooderPetSpans = [];

  for (let p in spooderPet) {
    spooderPetSpans.push(
      `<span style="color:${spooderPet[p].partColor}">${spooderPet[p].partString}</span>`,
    );
  }

  const spooderDiv = document.createElement('div');
  spooderDiv.style.fontSize = '3rem';
  spooderDiv.className = 'spooderpet';
  spooderDiv.innerHTML = spooderPetSpans.join('');
  return spooderDiv;
}

function getPublicData() {
  return fetch('/public/data')
    .then((res) => res.json())
    .then((data) => {
      window.publicData = data;
      return validateToken(getStoredToken());
    });
}

getPublicData();
