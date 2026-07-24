"""Build transparent, aligned PNG frames for Miro's home grooming animation.

The source video has a nearly black, border-connected background and a dark cat.
Using a global black color key would erase details inside the character, so this
script flood-fills only the background connected to the canvas edge.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


FRAME_RATE = 12
CANVAS_SIZE = 640
BACKGROUND_THRESHOLD = 26
EDGE_FEATHER_RADIUS = 0.65
PADDING = 24


def extract_frames(video: Path, directory: Path) -> list[Path]:
    pattern = directory / "raw-%03d.png"
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(video),
            "-vf",
            f"fps={FRAME_RATE}",
            str(pattern),
        ],
        check=True,
    )
    return sorted(directory.glob("raw-*.png"))


def remove_connected_background(source: Path) -> Image.Image:
    rgb = Image.open(source).convert("RGB")
    flood = rgb.copy()
    # The video background surrounds the character, so one corner reaches the
    # entire background while enclosed dark details remain untouched.
    ImageDraw.floodfill(
        flood,
        (0, 0),
        value=(255, 0, 255),
        thresh=BACKGROUND_THRESHOLD,
    )
    flood_array = np.asarray(flood)
    background = np.all(flood_array == np.array([255, 0, 255]), axis=2)
    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8), mode="L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(EDGE_FEATHER_RADIUS))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def union_subject_box(frames: list[Image.Image]) -> tuple[int, int, int, int]:
    boxes = []
    for frame in frames:
        alpha = frame.getchannel("A")
        box = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
        if box:
            boxes.append(box)
    if not boxes:
        raise RuntimeError("No foreground subject found in extracted frames")
    left = max(0, min(box[0] for box in boxes) - PADDING)
    top = max(0, min(box[1] for box in boxes) - PADDING)
    right = min(frames[0].width, max(box[2] for box in boxes) + PADDING)
    bottom = min(frames[0].height, max(box[3] for box in boxes) + PADDING)
    return left, top, right, bottom


def align_to_canvas(frame: Image.Image, crop_box: tuple[int, int, int, int]) -> Image.Image:
    cropped = frame.crop(crop_box)
    usable = int(CANVAS_SIZE * 0.88)
    scale = min(usable / cropped.width, usable / cropped.height)
    size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - resized.width) // 2
    # Keep a stable bottom anchor and slightly more breathing room above.
    y = CANVAS_SIZE - resized.height - int(CANVAS_SIZE * 0.055)
    canvas.alpha_composite(resized, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    video = args.video.resolve()
    output = args.output.resolve()
    if not video.is_file():
        raise FileNotFoundError(video)

    output.mkdir(parents=True, exist_ok=True)
    for old_frame in output.glob("frame-*.png"):
        old_frame.unlink()

    # Write intermediates into the already-created output directory. Some
    # sandboxed Windows runtimes assign unusable ACLs to Python temp folders.
    raw_paths = extract_frames(video, output)
    if not raw_paths:
        raise RuntimeError("ffmpeg produced no frames")
    transparent = [remove_connected_background(path) for path in raw_paths]
    crop_box = union_subject_box(transparent)
    aligned = [align_to_canvas(frame, crop_box) for frame in transparent]
    for raw_path in raw_paths:
        raw_path.unlink()

    for index, frame in enumerate(aligned):
        frame.save(output / f"frame-{index:02d}.png", compress_level=4)

    shutil.copy2(output / "frame-00.png", output.parent / "miro-idle.png")
    print(f"Wrote {len(aligned)} RGBA frames at {FRAME_RATE} fps to {output}")


if __name__ == "__main__":
    main()
