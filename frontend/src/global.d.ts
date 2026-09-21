// Tipi di ciò che il preload espone in window.desktop.
interface Window {
  desktop: {
    getBackendUrl(): Promise<string>;
  };
}
