import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type WebManifest = {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  background_color?: string;
  theme_color?: string;
  icons?: Array<{
    src?: string;
    sizes?: string;
    type?: string;
    purpose?: string;
  }>;
};

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("PWA install boundary", () => {
  it("keeps the app installable through the manifest and app shell", () => {
    const html = readProjectFile("index.html");
    const mainSource = readProjectFile("src/main.ts");
    const serviceWorker = readProjectFile("public/sw.js");
    const appSource = readProjectFile("src/App.svelte");
    const manifest = JSON.parse(readProjectFile("public/manifest.webmanifest")) as WebManifest;

    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<meta name="theme-color" content="#0f766e" />');
    expect(mainSource).toContain('navigator.serviceWorker.register("/sw.js")');

    expect(manifest).toMatchObject({
      name: "The Prawn Split",
      short_name: "Prawn Split",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0f766e",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/favicon.svg",
          sizes: "any",
          type: "image/svg+xml",
        }),
      ]),
    );

    expect(serviceWorker).toContain('const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];');
    expect(appSource).toContain("Add To Home Screen");
    expect(appSource).toContain('window.matchMedia("(display-mode: standalone)")');
    expect(appSource).toContain("standalone?: boolean");
  });
});
