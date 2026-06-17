"""Create minimal placeholder PNG icons for Expo."""

import base64
import struct
import zlib
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
COLOR = (15, 23, 42)  # #0f172a
SIZE = 1024


def png_chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def make_png(path: Path, size: int = SIZE) -> None:
    raw = b""
    row = b"\x00" + bytes(COLOR) * size
    for _ in range(size):
        raw += row
    compressed = zlib.compress(raw, 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", ihdr)
    png += png_chunk(b"IDAT", compressed)
    png += png_chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name in ("icon.png", "splash-icon.png", "adaptive-icon.png"):
        make_png(ASSETS / name)
    print(f"Created icons in {ASSETS}")


if __name__ == "__main__":
    main()
