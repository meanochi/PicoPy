// Google Drive integration — deliberately an optional island:
//  - Nothing Google-related loads until the user taps "Connect".
//  - Uses the `drive.file` OAuth scope: PicoPy can only see files it created
//    or that the user explicitly opened with it. Minimal-trust for schools.
//  - Talks to the Drive v3 REST API with plain fetch (no gapi client bundle);
//    only the small Google Identity Services script is loaded, on demand.
//  - Configured via a Google OAuth client id (see docs/drive-setup.md). If no
//    id is configured, the whole feature stays invisible.
//  - Tests inject window.__picopyDriveMock to exercise the full flow without
//    Google's servers.

export interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
}

export interface DriveTransport {
  connect(): Promise<void>;
  list(): Promise<DriveFileMeta[]>;
  download(id: string): Promise<string>;
  upload(name: string, content: string, mimeType: string, existingId?: string): Promise<string>;
  signOut(): void;
}

interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}

declare global {
  interface Window {
    __picopyDriveMock?: DriveTransport;
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }): TokenClient;
          revoke(token: string, cb?: () => void): void;
        };
      };
    };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export function driveClientId(): string | undefined {
  if (window.__picopyDriveMock) return 'mock';
  const fromEnv = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  let fromStorage: string | null = null;
  try {
    fromStorage = localStorage.getItem('picopy.driveClientId');
  } catch {
    // Storage may be blocked; env config still applies.
  }
  return fromStorage || fromEnv || undefined;
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in (blocked or offline).'));
    document.head.appendChild(s);
  });
}

class RealDriveTransport implements DriveTransport {
  private token?: string;
  private tokenClient?: TokenClient;

  constructor(private clientId: string) {}

  async connect(): Promise<void> {
    await loadGisScript();
    if (!window.google) throw new Error('Google sign-in unavailable.');
    this.token = await new Promise<string>((resolve, reject) => {
      this.tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.access_token) resolve(resp.access_token);
          else reject(new Error(resp.error ?? 'Sign-in was cancelled.'));
        },
      });
      this.tokenClient.requestAccessToken();
    });
  }

  private async call(input: string, init?: RequestInit): Promise<Response> {
    if (!this.token) throw new Error('Not connected to Drive.');
    const res = await fetch(input, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 401) {
      this.token = undefined;
      throw new Error('Drive session expired — please connect again.');
    }
    if (!res.ok) throw new Error(`Drive request failed (${res.status}).`);
    return res;
  }

  async list(): Promise<DriveFileMeta[]> {
    const q = encodeURIComponent("trashed=false and (name contains '.ipynb' or name contains '.py')");
    const fields = encodeURIComponent('files(id,name,modifiedTime)');
    const res = await this.call(`${API}/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=50`);
    const data = (await res.json()) as { files?: DriveFileMeta[] };
    return data.files ?? [];
  }

  async download(id: string): Promise<string> {
    const res = await this.call(`${API}/files/${id}?alt=media`);
    return res.text();
  }

  async upload(name: string, content: string, mimeType: string, existingId?: string): Promise<string> {
    if (existingId) {
      const res = await this.call(`${UPLOAD_API}/files/${existingId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType },
        body: content,
      });
      return ((await res.json()) as { id: string }).id;
    }
    const boundary = 'picopy' + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, mimeType }) +
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n` +
      content +
      `\r\n--${boundary}--`;
    const res = await this.call(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return ((await res.json()) as { id: string }).id;
  }

  signOut(): void {
    if (this.token) window.google?.accounts.oauth2.revoke(this.token);
    this.token = undefined;
  }
}

let transport: DriveTransport | undefined;

/** Returns the Drive transport, or undefined when Drive isn't configured. */
export function getDriveTransport(): DriveTransport | undefined {
  if (window.__picopyDriveMock) return window.__picopyDriveMock;
  const clientId = driveClientId();
  if (!clientId) return undefined;
  transport ??= new RealDriveTransport(clientId);
  return transport;
}
