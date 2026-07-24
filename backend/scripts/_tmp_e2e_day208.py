# -*- coding: utf-8 -*-
"""DAY-208 临时 E2E：阶跃文生图接入 + 转存（跑完即删）。

- mock httpx 校验请求体/解析/风控/落盘/静态供图；
- 若检测到真实 STEPFUN_API_KEY，额外跑一次真实生图冒烟。
"""
import asyncio
import base64
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp(prefix='e2e208_')}/e2e.db")

import httpx  # noqa: E402

from app.stepfun import image as img  # noqa: E402
from app.config import get_settings  # noqa: E402

PASS, FAIL = [], []


def check(name: str, cond: bool, extra: str = "") -> None:
    (PASS if cond else FAIL).append(name)
    print(("PASS " if cond else "FAIL ") + name + (f" | {extra}" if extra else ""))


# 1x1 PNG 的合法字节，编码成 b64_json 供 mock 返回
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
PNG_B64 = base64.b64encode(PNG_1PX).decode()


class FakeResp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("err", request=None, response=None)

    def json(self):
        return self._payload


class FakeClient:
    """捕获 post 请求体，返回预设 payload。"""
    captured = {}

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, headers=None, json=None):
        FakeClient.captured = {"url": url, "headers": headers, "json": json}
        return FakeResp({"data": [{"b64_json": PNG_B64, "finish_reason": "stop"}]})


async def run_mock():
    # 2) generate_image 请求体正确 + 返回解码 bytes
    with patch.object(img.httpx, "AsyncClient", FakeClient):
        data = await img.generate_image("x" * 600, size="1360x768")  # 超长 prompt
    body = FakeClient.captured["json"]
    check("请求 model = step-image-edit-2", body["model"] == "step-image-edit-2", body["model"])
    check("size 透传 1360x768", body["size"] == "1360x768")
    check("response_format = b64_json", body["response_format"] == "b64_json")
    check("steps/cfg_scale 默认值", body["steps"] == 8 and body["cfg_scale"] == 1.0)
    check("prompt 截断到 512", len(body["prompt"]) == 512, str(len(body["prompt"])))
    check("URL 指向 /images/generations", body is not None and FakeClient.captured["url"].endswith("/images/generations"))
    check("返回解码后的 PNG bytes", data == PNG_1PX)

    # 3) content_filtered → ImageGenError
    class Filtered(FakeClient):
        async def post(self, url, headers=None, json=None):
            return FakeResp({"data": [{"finish_reason": "content_filtered"}]})

    got = False
    with patch.object(img.httpx, "AsyncClient", Filtered):
        try:
            await img.generate_image("被拦截")
        except img.ImageGenError:
            got = True
    check("风控 content_filtered 抛 ImageGenError", got)

    # 4) 缺 b64_json → ImageGenError
    class NoB64(FakeClient):
        async def post(self, url, headers=None, json=None):
            return FakeResp({"data": [{"finish_reason": "stop"}]})

    got = False
    with patch.object(img.httpx, "AsyncClient", NoB64):
        try:
            await img.generate_image("无图")
        except img.ImageGenError:
            got = True
    check("缺 b64_json 抛 ImageGenError", got)

    # 5) generate_and_store 落盘 + 返回相对 URL；sprite 用 1184x896
    with patch.object(img.httpx, "AsyncClient", FakeClient):
        url_bg = await img.generate_and_store("背景", kind="bg")
        size_used_bg = FakeClient.captured["json"]["size"]
        url_sp = await img.generate_and_store("立绘", kind="sprite")
        size_used_sp = FakeClient.captured["json"]["size"]
    check("bg 尺寸 1360x768", size_used_bg == "1360x768")
    check("sprite 尺寸 1184x896", size_used_sp == "1184x896")
    check("返回相对 URL 前缀", url_bg.startswith("/static/scene_images/") and url_bg.endswith(".png"))
    fname = url_bg.rsplit("/", 1)[-1]
    fpath = img.SCENE_IMAGE_DIR / fname
    check("图片已落盘且内容正确", fpath.exists() and fpath.read_bytes() == PNG_1PX)

    return fname


def run_static(fname):
    # 6) StaticFiles 挂载能供图（用 TestClient 走真实 app）
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    r = client.get(f"/static/scene_images/{fname}")
    check("GET /static/scene_images/{f} 200", r.status_code == 200, str(r.status_code))
    check("静态图字节一致", r.content == PNG_1PX)


async def run_real():
    s = get_settings()
    if not s.stepfun_api_key or len(s.stepfun_api_key) < 10:
        print("SKIP 真实生图冒烟（无 STEPFUN_API_KEY）")
        return
    try:
        data = await img.generate_image("一间温暖的黄昏餐厅，柔和暖光，日系插画风", size="1360x768")
        check("真实生图返回非空 bytes", isinstance(data, bytes) and len(data) > 1000, f"{len(data)} bytes")
    except img.ImageGenError as e:
        # 真实调用失败（网络/风控/额度）不判 FAIL，但打印以便人工确认
        print(f"WARN 真实生图未成功（可人工复核）: {e}")


async def main():
    fname = await run_mock()
    run_static(fname)
    await run_real()


asyncio.run(main())
print(f"\n== DAY-208 E2E: {len(PASS)} PASS / {len(FAIL)} FAIL ==")
# 清理本次落盘的测试图
for p in Path(img.SCENE_IMAGE_DIR).glob("*.png"):
    try:
        p.unlink()
    except Exception:
        pass
sys.exit(0 if not FAIL else 1)
