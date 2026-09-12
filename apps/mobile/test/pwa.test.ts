import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const mobileRoot = resolve(process.cwd(), "apps/mobile");

describe("PWA configuration", () => {
  it("has an installable standalone manifest with regular and maskable icons", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(mobileRoot, "public/manifest.json"), "utf8"),
    ) as {
      display: string;
      start_url: string;
      icons: { purpose: string }[];
    };

    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons.some((icon) => icon.purpose === "any")).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(
      true,
    );
  });

  it("generates a service worker into the web export", () => {
    const config = readFileSync(
      resolve(mobileRoot, "workbox-config.cjs"),
      "utf8",
    );
    expect(config).toContain('swDest: "dist/sw.js"');
    expect(config).toContain('navigateFallback: "/index.html"');
  });
});
