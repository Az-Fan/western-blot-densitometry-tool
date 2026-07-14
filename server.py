"""Local raw-pixel backend for the WB densitometry interface."""
from __future__ import annotations

import io
import json
import mimetypes
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "py_vendor"))

import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage
from scipy import signal as scipy_signal

STATE: dict[str, object] = {"array": None, "meta": None, "preview": None}
BACKEND_VERSION = "0.7.0"


def read_image(data: bytes, name: str) -> tuple[np.ndarray, dict]:
    if name.lower().endswith((".tif", ".tiff")):
        with tifffile.TiffFile(io.BytesIO(data)) as tif:
            page = tif.pages[0]
            arr = page.asarray()
            bits = int(page.bitspersample or arr.dtype.itemsize * 8)
            pages = len(tif.pages)
            photometric = getattr(page.photometric, "name", str(page.photometric))
    else:
        with Image.open(io.BytesIO(data)) as im:
            arr = np.asarray(im)
            bits = int(np.asarray(im).dtype.itemsize * 8)
            pages = getattr(im, "n_frames", 1)
            photometric = "UNKNOWN"
    arr = np.asarray(arr)
    if arr.ndim > 3:
        arr = arr[0]
    if arr.ndim == 3:
        if arr.shape[-1] >= 3:
            rgb = arr[..., :3].astype(np.float64)
            arr = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
        else:
            arr = arr[..., 0]
    if arr.ndim != 2:
        raise ValueError(f"不支持的图像维度：{arr.shape}")
    if not np.isfinite(arr).all():
        raise ValueError("图像包含 NaN 或无穷值")
    source_dtype = str(arr.dtype)
    arr = np.ascontiguousarray(arr)
    meta = {"name": name, "width": int(arr.shape[1]), "height": int(arr.shape[0]),
            "bits": bits, "dtype": source_dtype, "pages": pages,
            "photometric": photometric,
            "min": float(arr.min()), "max": float(arr.max())}
    return arr, meta


def make_preview(arr: np.ndarray) -> bytes:
    lo, hi = float(arr.min()), float(arr.max())
    if hi <= lo:
        view = np.zeros(arr.shape, np.uint8)
    else:
        view = np.clip(np.rint((arr.astype(np.float64) - lo) * 255.0 / (hi - lo)), 0, 255).astype(np.uint8)
    out = io.BytesIO()
    Image.fromarray(view, "L").save(out, "PNG")
    return out.getvalue()


def clipped_rect(r: dict, shape: tuple[int, int]) -> tuple[int, int, int, int]:
    h, w = shape
    x = max(0, min(w - 1, round(float(r["x"]))))
    y = max(0, min(h - 1, round(float(r["y"]))))
    rw = max(1, min(w - x, round(float(r["w"]))))
    rh = max(1, min(h - y, round(float(r["h"]))))
    return x, y, rw, rh


def measure(arr: np.ndarray, r: dict, mode: str, gap: int, bg_height: int) -> dict:
    x, y, w, h = clipped_rect(r, arr.shape)
    roi_gray = arr[y:y+h, x:x+w].astype(np.float64)
    max_signal = float(np.iinfo(arr.dtype).max) if np.issubdtype(arr.dtype, np.integer) else float(arr.max())
    signal = roi_gray if mode == "light" else max_signal - roi_gray
    backgrounds = []
    if y - gap - bg_height >= 0:
        backgrounds.append(arr[y-gap-bg_height:y-gap, x:x+w].astype(np.float64))
    if y + h + gap + bg_height <= arr.shape[0]:
        backgrounds.append(arr[y+h+gap:y+h+gap+bg_height, x:x+w].astype(np.float64))
    if backgrounds:
        bg_gray = np.concatenate([b.ravel() for b in backgrounds])
        bg_signal = bg_gray if mode == "light" else max_signal - bg_gray
        bg = float(np.median(bg_signal))
    else:
        bg = 0.0
    raw = float(signal.sum(dtype=np.float64))
    net_signed = raw - signal.size * bg
    if mode == "light":
        saturated = np.count_nonzero(roi_gray >= max_signal)
    else:
        saturated = np.count_nonzero(roi_gray <= 0)
    return {"area": int(signal.size), "rawIntDen": raw, "backgroundMedian": bg,
            "netIntDen": max(0.0, net_signed), "netIntDenSigned": net_signed,
            "saturationFraction": float(saturated / signal.size), "backend": "raw"}


def detect_bands(arr: np.ndarray, mode: str, search: dict | None = None) -> list[dict]:
    if search:
        x0, y0, rw, rh = clipped_rect(search, arr.shape)
    else:
        x0, y0, rw, rh = 0, 0, arr.shape[1], arr.shape[0]
    src = arr[y0:y0+rh, x0:x0+rw].astype(np.float64)
    # A broad local background preserves compact bands while suppressing slow illumination drift.
    sy = max(3.0, min(18.0, rh / 45.0))
    sx = max(5.0, min(30.0, rw / 45.0))
    background = ndimage.gaussian_filter(src, sigma=(sy, sx), mode="nearest")
    enhanced = src - background if mode == "light" else background - src
    med = float(np.median(enhanced))
    mad = float(np.median(np.abs(enhanced - med)))
    robust_sigma = max(1e-12, 1.4826 * mad)
    threshold = max(med + 4.0 * robust_sigma, float(np.percentile(enhanced, 92)))
    mask = enhanced > threshold
    mask = ndimage.binary_opening(mask, structure=np.ones((2, 2), bool))
    mask = ndimage.binary_closing(mask, structure=np.ones((3, 5), bool))
    labels, count = ndimage.label(mask)
    objects = ndimage.find_objects(labels)
    boxes = []
    min_area = max(8, int(src.size * 0.000002))
    max_area = max(100, int(src.size * 0.03))
    for label_id, sl in enumerate(objects, 1):
        if sl is None:
            continue
        ys, xs = sl
        h, w = ys.stop - ys.start, xs.stop - xs.start
        area = int(np.count_nonzero(labels[sl] == label_id))
        if area < min_area or area > max_area or w < 3 or h < 2:
            continue
        if w / max(h, 1) < 0.8 or w > rw * 0.35 or h > rh * 0.25:
            continue
        pad_x, pad_y = max(2, round(w * 0.25)), max(2, round(h * 0.35))
        bx = max(0, xs.start - pad_x)
        by = max(0, ys.start - pad_y)
        br = min(rw, xs.stop + pad_x)
        bb = min(rh, ys.stop + pad_y)
        score = float(enhanced[sl][labels[sl] == label_id].mean())
        boxes.append({"x": x0 + bx, "y": y0 + by, "w": br - bx, "h": bb - by,
                      "score": score, "area": area})
    # Reading order: rows first, then lanes from left to right.
    boxes.sort(key=lambda b: (round((b["y"] + b["h"] / 2) / max(10, np.median([x["h"] for x in boxes]) if boxes else 10)), b["x"]))
    return boxes


def detect_bands(arr: np.ndarray, mode: str, search: dict | None = None) -> list[dict]:
    """Detect the dominant WB band row, then individual horizontal peaks.

    This deliberately rejects isolated dust/noise away from the common band row.
    """
    if search:
        x0, y0, rw, rh = clipped_rect(search, arr.shape)
    else:
        x0, y0, rw, rh = 0, 0, arr.shape[1], arr.shape[0]
    src = arr[y0:y0+rh, x0:x0+rw].astype(np.float64)
    sy = max(4.0, min(24.0, rh / 35.0))
    sx = max(7.0, min(36.0, rw / 40.0))
    background = ndimage.gaussian_filter(src, sigma=(sy, sx), mode="nearest")
    enhanced = src - background if mode == "light" else background - src
    positive = np.maximum(enhanced, 0.0)

    # Locate a row supported by signal across several lanes, rather than one bright speck.
    cap = float(np.percentile(positive, 99.5))
    if cap <= 0:
        return []
    row_profile = np.mean(np.minimum(positive, cap), axis=1)
    row_profile = ndimage.gaussian_filter1d(row_profile, sigma=max(1.5, rh / 300.0))
    row_peaks, props = scipy_signal.find_peaks(row_profile, prominence=max(np.std(row_profile) * 0.8, 1e-12),
                                                distance=max(8, rh // 20))
    if not len(row_peaks):
        row_peak = int(np.argmax(row_profile))
    else:
        # Prefer rows with broad support, not merely the single highest pixel.
        row_peak = int(row_peaks[np.argmax(props["prominences"] * np.maximum(row_profile[row_peaks], 1e-12))])
    peak_value = row_profile[row_peak]
    cutoff = max(float(np.median(row_profile) + np.std(row_profile)), peak_value * 0.28)
    top = row_peak
    while top > 0 and row_profile[top - 1] >= cutoff:
        top -= 1
    bottom = row_peak + 1
    while bottom < rh and row_profile[bottom] >= cutoff:
        bottom += 1
    min_half = max(4, round(rh * 0.008))
    top, bottom = min(top, row_peak - min_half), max(bottom, row_peak + min_half + 1)
    top, bottom = max(0, top), min(rh, bottom)

    # Within the dominant row, each lane becomes a peak in the horizontal profile.
    x_profile = np.mean(positive[top:bottom], axis=0)
    x_profile = ndimage.gaussian_filter1d(x_profile, sigma=max(1.2, rw / 900.0))
    baseline = float(np.median(x_profile))
    mad = float(np.median(np.abs(x_profile - baseline)))
    noise = max(1e-12, 1.4826 * mad)
    peaks, props = scipy_signal.find_peaks(
        x_profile,
        height=baseline + 3.0 * noise,
        prominence=max(2.5 * noise, (float(x_profile.max()) - baseline) * 0.06),
        distance=max(6, round(rw * 0.025)),
    )
    if not len(peaks):
        return []
    widths = scipy_signal.peak_widths(x_profile, peaks, rel_height=0.72)[0]
    row_h = bottom - top
    # Quantification ROIs must contain the full diffuse band. Use one common size
    # for the entire row so intensity differences cannot change ROI area.
    common_w = int(np.clip(round(np.percentile(widths, 90) * 2.25), 12, max(18, rw * 0.16)))
    common_h = int(np.clip(round(row_h * 2.35), 12, max(18, rh * 0.45)))
    common_y = int(np.clip(round((top + bottom) / 2 - common_h / 2), 0, rh - common_h))
    boxes = []
    for peak, width, height, prominence in zip(peaks, widths, props["peak_heights"], props["prominences"]):
        bx = int(np.clip(round(peak - common_w / 2), 0, rw - common_w))
        boxes.append({"x": x0 + bx, "y": y0 + common_y, "w": common_w, "h": common_h,
                      "score": float(prominence), "area": common_w * common_h})
    boxes.sort(key=lambda b: b["x"])
    return boxes


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        relative = urlparse(path).path.lstrip("/") or "index.html"
        return str(ROOT / relative)

    def send_json(self, obj: object, status: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/status":
            self.send_json({"ok": True, "rawBackend": True, "version": BACKEND_VERSION, "meta": STATE["meta"]})
            return
        if self.path.startswith("/api/preview"):
            data = STATE.get("preview")
            if not data:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1024 * 1024 * 1024:
                raise ValueError("文件为空或超过 1 GB")
            body = self.rfile.read(length)
            if self.path == "/api/upload":
                name = unquote(self.headers.get("X-Filename", "image.tif"))
                arr, meta = read_image(body, name)
                STATE.update(array=arr, meta=meta, preview=make_preview(arr))
                self.send_json({"ok": True, **meta, "preview": "/api/preview"})
                return
            if self.path == "/api/measure":
                arr = STATE.get("array")
                if arr is None:
                    raise ValueError("尚未上传图片")
                req = json.loads(body)
                result = {key: [measure(arr, r, req["signalMode"], int(req["gap"]), int(req["height"]))
                                for r in req["groups"].get(key, [])] for key in ("target", "reference")}
                self.send_json({"ok": True, "results": result, "meta": STATE["meta"]})
                return
            if self.path == "/api/rotate":
                arr = STATE.get("array")
                if arr is None:
                    raise ValueError("尚未上传图片")
                req = json.loads(body)
                angle = float(req.get("angle", 0))
                if not np.isfinite(angle) or abs(angle) > 30:
                    raise ValueError("拉平角度必须在 ±30° 以内")
                rotated = ndimage.rotate(arr, angle, reshape=False, order=1, mode="nearest", prefilter=False)
                if np.issubdtype(arr.dtype, np.integer):
                    limits = np.iinfo(arr.dtype)
                    rotated = np.clip(np.rint(rotated), limits.min, limits.max).astype(arr.dtype)
                else:
                    rotated = rotated.astype(arr.dtype, copy=False)
                meta = dict(STATE["meta"] or {})
                meta.update(width=int(rotated.shape[1]), height=int(rotated.shape[0]), rotation=float(meta.get("rotation", 0))+angle)
                STATE.update(array=np.ascontiguousarray(rotated), meta=meta, preview=make_preview(rotated))
                self.send_json({"ok": True, **meta, "preview": "/api/preview"})
                return
            if self.path == "/api/detect":
                arr = STATE.get("array")
                if arr is None:
                    raise ValueError("尚未上传图片")
                req = json.loads(body)
                boxes = detect_bands(arr, req.get("signalMode", "light"), req.get("search"))
                self.send_json({"ok": True, "boxes": boxes})
                return
            self.send_error(404)
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, 400)

    def log_message(self, fmt: str, *args: object) -> None:
        print("[WB]", fmt % args)


if __name__ == "__main__":
    host, port = "127.0.0.1", 18765
    server = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{port}/"
    print(f"WB 灰度工具已启动：{url}")
    print("关闭此窗口即可停止。图片和数据只保存在本机内存。")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    server.serve_forever()
