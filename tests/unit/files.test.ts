import { describe, expect, it } from "vitest";
import { safeFileName, sniffMime } from "@/lib/files";

describe("upload type detection", () => {
  it("recognises allowed formats from their signature", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects disguised or dangerous files", () => {
    expect(sniffMime(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("MZ\x90\x00"))).toBeNull(); // Windows executable
    expect(sniffMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe("safeFileName", () => {
  it("strips path traversal and unsafe characters and forces the real extension", () => {
    expect(safeFileName("../../etc/passwd.pdf", "application/pdf")).toBe("etc-passwd.pdf");
    expect(safeFileName("Acte de naissance éléve.PHP", "image/jpeg")).toBe("Acte-de-naissance-eleve.jpg");
    expect(safeFileName("....", "image/png")).toBe("document.png");
  });
});
