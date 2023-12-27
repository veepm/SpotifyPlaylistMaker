const clientId = "b102db7d41cf4fd884df1f90cd2a597a";
const redirectUri = "http://127.0.0.1:5500/SpotifyPlaylistMaker/index.html";
const authUrl = new URL("https://accounts.spotify.com/authorize");
const scope = "playlist-read-private playlist-modify-public playlist-modify-private user-library-read";
let codeVerifier = null;
let code = null;
let accessToken = null; 
let refreshToken = null;
let playlists = null;

//localStorage.removeItem("access_token");

const generateRandomString = (length) => {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

const sha256 = async (plain) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return crypto.subtle.digest("SHA-256", data)
}

const base64encode = (input) => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const requestAuthorization = async () => {

  codeVerifier  = generateRandomString(64);
  localStorage.setItem("code_verifier", codeVerifier);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  const params =  {
    client_id: clientId,
    response_type: "code",
    scope,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
  }

  authUrl.search = new URLSearchParams(params).toString();
  location.href = authUrl.toString();
}

// get auth code from return url
const getCode = () => {
  const urlParams = new URLSearchParams(location.search);
  code = urlParams.get("code");
}

// request access token from api
const getAccessToken = async (code) => {

  codeVerifier = localStorage.getItem("code_verifier");

  const payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  }

  const body = await fetch("https://accounts.spotify.com/api/token", payload);
  const response = await body.json();

  console.log(response);
  localStorage.setItem("access_token", response.access_token);
  localStorage.setItem("refresh_token", response.refresh_token);
}

// request api for new access token using refresh token
const refreshAccessToken = async () => {

  refreshToken = localStorage.getItem("refresh_token");

  const payload = {
     method: "POST",
     headers: {
       "Content-Type": "application/x-www-form-urlencoded"
     },
     body: new URLSearchParams({
       grant_type: "refresh_token",
       refresh_token: refreshToken,
       client_id: clientId
     }),
   }
   const body = await fetch("https://accounts.spotify.com/api/token", payload);
   const response = await body.json();

   console.log(response);

   localStorage.setItem("access_token", response.access_token);
   localStorage.setItem("refresh_token", response.refresh_token);
 }

const callApi = async (endpoint) => {
  const payload = {
    method: "GET",
    headers: {
      "Authorization" : `Bearer ${localStorage.getItem("access_token")}`
    },
  }
  const body = await fetch(endpoint, payload);
  const response = await body.json();
  console.log(response);
  return response;
}


// get array of liked songs
const getLikedSongs = async (market) => {
  let likedSongs = [];
  let i = 0;
  while (true) {
    let response = await callApi(`https://api.spotify.com/v1/me/tracks?market=${market}&limit=50&offset=${i}`)
    response.items.forEach(item => {
      likedSongs.push(item.track);
    });
    i += 50;
    if (!response.next) {
      break;
    }
  }
}

 // add playlists to html input
 const addPlaylists = () => {
  playlists.forEach(playlist => {
    document.getElementById("playlists").innerHTML += `<option value="${playlist.name}">${playlist.name}</option>`;
  });
}

// get auth code on redirect
if (location.search.length > 0 ) {
  getCode();
  if (code) {
    //document.getElementById("app").style.display = "block";
    await getAccessToken(code);
  }
  location.href = redirectUri;
}
else {
  accessToken = localStorage.getItem("access_token");
  if (!accessToken) {
    document.getElementById("authorize").style.display = "block";
    document.getElementById("btn").addEventListener("click", requestAuthorization);
  }
  else {
    document.getElementById("app").style.display = "block";
    playlists = (await callApi("https://api.spotify.com/v1/me/playlists")).items;
    addPlaylists();
  }
}

document.getElementById("playlists").addEventListener("change", () => {
  playlists.forEach(async playlist => {
    if (playlist.name == document.getElementById("playlists").value) {
      await callApi(playlist.tracks.href);
      await getLikedSongs("IN");
    }
  });
})