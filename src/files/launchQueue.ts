// Desktop file association: once PicoPy is installed, double-clicking a
// .py/.ipynb file (or "Open with → PicoPy") launches it via the File
// Handling API (see file_handlers in manifest.webmanifest). Supported on
// Windows/ChromeOS/desktop Chrome installs; harmlessly absent elsewhere.
// A minimal local handle type avoids depending on lib.dom's full File System
// Access API surface, which some TS/lib configurations don't include.
interface LaunchFileHandle {
  getFile(): Promise<File>;
}

declare global {
  interface Window {
    launchQueue?: {
      setConsumer(consumer: (params: { files: LaunchFileHandle[] }) => void): void;
    };
  }
}

export function onFileLaunch(handler: (name: string, content: string) => void): void {
  if (!window.launchQueue) return;
  window.launchQueue.setConsumer((params) => {
    const handle = params.files[0];
    if (!handle) return;
    void handle.getFile().then(async (file) => handler(file.name, await file.text()));
  });
}
