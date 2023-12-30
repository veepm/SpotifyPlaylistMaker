const clientId = "b102db7d41cf4fd884df1f90cd2a597a";
const redirectUri = "http://127.0.0.1:5500/SpotifyPlaylistMaker/index.html";
const authUrl = new URL("https://accounts.spotify.com/authorize");
const scope = "playlist-read-private playlist-modify-public playlist-modify-private user-library-read";
let code = null;

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

  console.log("Access");

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

   console.log(response);

   localStorage.setItem("access_token", response.access_token);
   localStorage.setItem("refresh_token", response.refresh_token);
 }

//refreshAccessToken()

const callApi = async (endpoint) => {
  const accessToken = localStorage.getItem("access_token");
  const payload = {
    method: "GET",
    headers: {
      "Authorization" : `Bearer ${accessToken}`
    },
  }

  const body = await fetch(endpoint, payload);
  let response = await body.json();

  // token expired so get new one and recall api
  if (body.status == 401){
    await refreshAccessToken();
    response = await callApi(endpoint);
  }

  console.log(response);
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
      break;
    }
  }
  return playlists;
}

// get array of liked songs
const getLikedSongs = async (market) => {
  let likedSongs = [];
  let i = 0;
  while (true) {
    let response = await callApi(`https://api.spotify.com/v1/me/tracks?market=${market}&limit=50&offset=${i}`)
    response.items.forEach(item => {
      likedSongs.push(item);
    });
    i += 50;
    if (!response.next) {
      break;
    }
  }
  return likedSongs;
}

// get all unique genres in a list of songs
const getGenres = (songs) => {
  let genres = new Set();
  songs.forEach(song => {
    genres.add(song.tracks.artists.genres);
  });
  console.log(genres);
}

// get all unique artist names from a list of songs
const getArtists = (songs) => {
  let artists = new Set();
  songs.forEach(song => {
    song.track.artists.forEach(artist => {
      if (artist.name)
      {
        artists.add(artist.name);
      }
    })
  });
  artists = Array.from(artists).sort();
  return artists;
}

// add playlists from list to html input
const addPlaylistsOption = (playlists) => {
  const playlistList = document.getElementById("playlists");
  playlistList.innerHTML = `<option value="Liked Songs"></option>`;
  playlists.forEach(playlist => {
    playlistList.innerHTML += `<option value="${playlist.name}"></option>`;
  });
}

// add artists from list to html input
const addArtistsOption = (artists) => {
  const artistList = document.getElementById("artists");
  artistList.innerHTML = "";
  artists.forEach(artist => {
    artistList.innerHTML += `<option value="${artist}">${artist}</option>`;
  });
}

const setAppPage = async () => {
  document.getElementById("app").style.display = "block";
  let playlists = await getPlaylists();
  addPlaylistsOption(playlists);
  document.getElementById("playlist").addEventListener("change", async () => {
    // if input is liked songs get artists
    if (document.getElementById("playlist").value == "Liked Songs") {
      let likedSongs = await getLikedSongs("IN");
      let artists = getArtists(likedSongs);
      addArtistsOption(artists);
    }
    // else find which playlist is input and get artists
    playlists.forEach(async playlist => {
      if (playlist.name == document.getElementById("playlist").value) {
        let songs = await callApi(playlist.tracks.href);
        let artists = getArtists(songs.items);
        addArtistsOption(artists);
      }
    });
  })
}

// get auth code on redirect
if (location.search.length > 0 ) {
  getCode();
  if (code) {
    //document.getElementById("app").style.display = "block";
    await getAccessToken(code);
  }
  // reload after redirected
  location.href = redirectUri;
}
else {
  const accessToken = localStorage.getItem("access_token");
  // if no accessToken then first visit and auth is required
  if (!accessToken) {
    document.getElementById("authorize").style.display = "block";
    document.getElementById("btn").addEventListener("click", requestAuthorization);
  }
  else {
    setAppPage();
  }
}
