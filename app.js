// global variables for api call
const clientId = "b102db7d41cf4fd884df1f90cd2a597a";
//const redirectUri = "http://127.0.0.1:5500/SpotifyPlaylistMaker/index.html";
const redirectUri = "https://veepm.github.io/SpotifySubPlaylistMaker/";
const authUrl = new URL("https://accounts.spotify.com/authorize");
const scope = "playlist-read-private playlist-modify-public playlist-modify-private user-library-read user-library-modify";
let code = null;

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

  const codeVerifier  = generateRandomString(64);
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

  const codeVerifier = localStorage.getItem("code_verifier");

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

  localStorage.setItem("access_token", response.access_token);
  localStorage.setItem("refresh_token", response.refresh_token);
}

// request api for new access token using refresh token
const refreshAccessToken = async () => {

  const refreshToken = localStorage.getItem("refresh_token");

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

   localStorage.setItem("access_token", response.access_token);
   localStorage.setItem("refresh_token", response.refresh_token);
 }

const callApi = async (endpoint) => {
  const accessToken = localStorage.getItem("access_token");
  const payload = {
    method: "GET",
    headers: {
      "Authorization" : `Bearer ${accessToken}`
    }
  }

  const body = await fetch(endpoint, payload);
  let response = await body.json();

  // token expired so get new one and recall api
  if (body.status == 401){
    await refreshAccessToken();
    response = await callApi(endpoint);
  }

  return response;
}

// get array of user playlists
const getPlaylists = async () => {
  let playlists = [];
  let i = 0;
  while (true) {
    const response = await callApi(`https://api.spotify.com/v1/me/playlists?limit=50&offset=${i}`);
    response.items.forEach(item => {
      playlists.push(item);
    })
    i += 50;
    if (!response.next) {
      return playlists;
    }
  }
}

// get array of item of songs of a playlist from provided endpoint
const getSongs = async (endpoint) => {
  let songs = [];
  let i = 0;
  while (true) {
    let response = await callApi(`${endpoint}?limit=50&offset=${i}`)
    response.items.forEach(item => {
      songs.push(item);
    });
    i += 50;
    if (!response.next) {
      return songs;
    }
  }
}

// get all unique artist names from a list of songs
const getUniqueArtists = (songs, artistSongs) => {
  let artists = new Set();
  songs.forEach(song => {
    song.track.artists.forEach(artist => {
      // artist name might be empty
      if (artist.name)
      {
        if (artist.name in artistSongs) {
          artistSongs[artist.name].push(song);
        }
        else {
          artistSongs[artist.name] = [song];
        }
        artists.add(artist.name);
      }
    })
  });
  artists = Array.from(artists).sort();
  return artists;
}

// add playlists from list of playlist names to html input
const addPlaylistsOption = (playlists) => {
  const playlistList = document.getElementById("playlists");
  playlistList.innerHTML = "";
  playlists.forEach(playlist => {
    playlistList.innerHTML += `<option value="${playlist}"></option>`;
  });
}

// add artists from list of artist names to html input
const addArtistsOption = (artists) => {
  const artistList = document.getElementById("artists");
  artistList.innerHTML = "";
  document.getElementById("artist").value = "";
  artists.forEach(artist => {
    artistList.innerHTML += `<option value="${artist}"></option>`;
  });
}

// create a new playlist with given name for the userId account
const createPlaylist = async (playlistName, userId) => {
  const accessToken = localStorage.getItem("access_token");
  const payload = {
    method: "POST",
    headers: {
      "Authorization" : `Bearer ${accessToken}`,
      "Content-Type" : "application/json"
    },
    body : JSON.stringify({
      name: playlistName
    })
  }
  const body = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, payload);
  const response = await body.json();

  if (body.status == 401){
    await refreshAccessToken();
    response = await callApi(endpoint);
  }

  return response;
}

// adds song from songs list into the given playlist
const addSongs = async (songs, playlist) => {
  const accessToken = localStorage.getItem("access_token");
  let body = null;
  // need to call api multiple times since till all songs are added
  for (let i=0; i < songs.length; i+=50) {
    if (playlist == "Liked Songs") {
      const ids = songs.filter((song, index) => index >= i && index < i+50).map(song => song.track.id);
      const payload = {
        method: "PUT",
        headers: {
          "Authorization" : `Bearer ${accessToken}`,
          "Content-Type" : "application/json"
        },
        body : JSON.stringify({
          ids
        })
      }
      body = await fetch(`https://api.spotify.com/v1/me/tracks`, payload);  
    }
    else {    
      const uris = songs.filter((song, index) => index >= i && index < i+50).map(song => song.track.uri);
      const payload = {
        method: "POST",
        headers: {
          "Authorization" : `Bearer ${accessToken}`,
          "Content-Type" : "application/json"
        },
        body : JSON.stringify({
          uris
        })
      }                                                     
      body = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, payload);
    }

    if (body.status == 401){
      await refreshAccessToken();
      response = await callApi(endpoint);
    }

  }
}

// get auth code on redirect
if (location.search.length > 0 ) {
  getCode();
  if (code) {
    await getAccessToken(code);
  }
  // reload after redirected
  location.href = redirectUri;
}
else {
  const accessToken = localStorage.getItem("access_token");
  // if no accessToken then user's first visit so auth is required
  if (!accessToken) {
    document.getElementById("authorize").style.display = "block";
    document.getElementById("btn").addEventListener("click", requestAuthorization);
  }
  // else user has already authorized
  else {
    document.getElementById("app").style.display = "block";
  
    const userProfile = await callApi("https://api.spotify.com/v1/me");
    
    const playlistElem = document.getElementById("playlist");
    const artistElem = document.getElementById("artist");
    const playlistNameElem = document.getElementById("playlistName");
    const selectedArtistsElem = document.getElementById("selectedArtists");
    
    // stores artist name along with array of item of their songs
    let artistSongs = {};

    const playlists = await getPlaylists();
    const playlistNames = playlists.map(playlist => playlist.name);
    playlistNames.push("Liked Songs");
    addPlaylistsOption(playlistNames);

    let songs = null;
    let artists = null;

    let selectedArtists = [];

    playlistElem.addEventListener("change", async () => {
      artistSongs = {};
      selectedArtists = [];
      document.getElementById("artists").innerHTML = "";
      selectedArtistsElem.innerHTML = "";
      // check if input playlist is an option
      if (playlistNames.indexOf(playlistElem.value) != -1) {
        // get songs depending on the playlist input
        if (playlistElem.value == "Liked Songs") {
          songs = await getSongs("https://api.spotify.com/v1/me/tracks");
        }
        else {
          const playlist = playlists[playlistNames.indexOf(playlistElem.value)];
          songs = await getSongs(playlist.tracks.href);
        }
        artists = getUniqueArtists(songs, artistSongs);
        addArtistsOption(artists);
      }
    })

    artistElem.addEventListener("change", () => {
      if (artists && artists.indexOf(artistElem.value) != -1 && selectedArtists.indexOf(artistElem.value) == -1) {
        selectedArtistsElem.innerHTML += `<div>${artistElem.value}</div>`;
        selectedArtists.push(artistElem.value);
        artistElem.value = "";
      }
    })

    // create playlist on button click
    document.getElementById("addBtn").addEventListener("click", async () => {
      let playlist = null;
      if (playlistNameElem.value && selectedArtists.length > 0) {
        if (playlistNames.indexOf(playlistNameElem.value) == -1) {
          playlist = await createPlaylist(playlistNameElem.value, userProfile.id);
        }
        else if (playlistNameElem.value != "Liked Songs") {
          playlist = playlists[playlistNames.indexOf(playlistNameElem.value)];
        }
        else {
          playlist = "Liked Songs";
        }
        for (const artist of selectedArtists) {
          await addSongs(artistSongs[artist], playlist);
        }
        // refresh after songs are added
        location.href = redirectUri;
      }
    })
  }
}
