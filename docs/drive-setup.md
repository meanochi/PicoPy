# Enabling Google Drive integration

Drive support is **optional**. Without a Google OAuth client id configured,
the Drive section simply doesn't appear and everything else works normally.
Setup takes about 15 minutes and is free.

PicoPy uses the narrow **`drive.file`** scope: it can only see files it
created or files the user explicitly opened with it — it can never browse a
user's whole Drive. Nothing from Google loads until the user taps
"Connect Google Drive".

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in.
2. Top bar → project picker → **New project**. Name it e.g. `PicoPy`, create,
   and make sure it's selected.

## 2. Enable the Drive API

1. Menu → **APIs & Services → Library**.
2. Search for **Google Drive API** → **Enable**.

## 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → Create.
3. Fill the app name (`PicoPy`), your support email, and developer contact.
   Save through the steps — no extra scopes need to be added here.
4. Under **Audience**, either **Publish** the app, or (while testing) add your
   own Google account as a test user.

## 4. Create the OAuth client id

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorized JavaScript origins** add the exact origin(s) PicoPy is
   served from, e.g.:
   - `https://<your-user>.github.io`
   - `http://localhost:5173` (for local development)
4. Create, and copy the **Client ID** (ends with `.apps.googleusercontent.com`).

## 5. Give the client id to PicoPy

Pick one:

- **GitHub Pages deploys:** repository **Settings → Secrets and variables →
  Actions → Variables** → new variable `GOOGLE_CLIENT_ID` with the client id.
  The deploy workflow injects it into the build automatically.
- **Local development:** create `.env.local` in the repo root:

  ```
  VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
  ```

- **Without rebuilding** (e.g. trying it out on an existing deployment):
  open the browser console on the PicoPy page and run
  `localStorage.setItem('picopy.driveClientId', '<client id>')`, then reload.

## Filtered networks

Drive needs `accounts.google.com` and `www.googleapis.com` reachable. On
networks where they're blocked, the Connect button will show a clear error
and the rest of PicoPy keeps working.

## Current limitations

- Opening from Drive lists files that were saved there by PicoPy (that's what
  the `drive.file` scope can see). A Google Picker dialog for opening
  arbitrary Drive files can be added later; it needs an extra API key.
- If a file is edited in two places, the last save to Drive wins — there is
  no merge.
