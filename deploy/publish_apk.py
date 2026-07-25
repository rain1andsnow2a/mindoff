"""把 APK 传到服务器并生成现场扫码下载的二维码。

APK 落在后端容器的 static 卷里（/app/static/download/），由 FastAPI 的 /static 直接托管，
不用另起 web 服务。二维码存到本地 deploy/ 下。

用法：
    $env:MINDOFF_SSH_PASSWORD='...'
    uv run --with paramiko --with "qrcode[pil]" python deploy/publish_apk.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko
import qrcode

APK = Path(os.environ.get(
    "MINDOFF_APK",
    r"D:\bigproject\AdventureX\frontend-demo\android\app\build\outputs\apk\release\app-release.apk",
))
HOST = os.environ.get("MINDOFF_SSH_HOST", "223.109.142.152")
USER = os.environ.get("MINDOFF_SSH_USER", "root")
PASSWORD = os.environ.get("MINDOFF_SSH_PASSWORD")

# 容器名 + 卷内路径（/app/static 是 mindoff-static 卷，由 /static 路由托管）
CONTAINER = "mindoff-backend"
REMOTE_TMP = "/opt/mindoff/mindoff.apk"
IN_CONTAINER = "/app/static/download/mindoff.apk"
DOWNLOAD_URL = f"http://{HOST}:8000/static/download/mindoff.apk"
QR_PATH = Path(__file__).resolve().parent / "apk-download-qr.png"


def main() -> None:
    if not PASSWORD:
        sys.exit("缺少环境变量 MINDOFF_SSH_PASSWORD")
    if not APK.is_file():
        sys.exit(f"找不到 APK: {APK}")
    size_mb = APK.stat().st_size / 1024 / 1024
    print(f"[apk] {APK.name}  {size_mb:.1f}MB")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, timeout=25)

    def run(cmd: str) -> str:
        _in, out, err = client.exec_command(cmd, timeout=600)
        text = out.read().decode("utf-8", "replace")
        code = out.channel.recv_exit_status()
        if code != 0:
            stderr = err.read().decode("utf-8", "replace")
            raise RuntimeError(f"远端命令失败({code}): {cmd}\n{stderr}")
        return text

    print("[upload] 上传到服务器…")
    sftp = client.open_sftp()
    transferred = {"n": 0}

    def progress(sent: int, total: int) -> None:
        pct = int(sent * 100 / total) if total else 0
        if pct >= transferred["n"] + 20:
            transferred["n"] = pct
            print(f"    {pct}%  ({sent/1024/1024:.1f}/{total/1024/1024:.1f}MB)")

    sftp.put(str(APK), REMOTE_TMP, callback=progress)
    sftp.close()

    print("[copy] 放进容器的 static 卷…")
    run(f"docker exec {CONTAINER} mkdir -p /app/static/download")
    run(f"docker cp {REMOTE_TMP} {CONTAINER}:{IN_CONTAINER}")
    run(f"rm -f {REMOTE_TMP}")
    listing = run(f"docker exec {CONTAINER} ls -l {IN_CONTAINER}")
    print("    " + listing.strip())
    client.close()

    print("[check] 校验公网可下载…")
    import httpx

    r = httpx.head(DOWNLOAD_URL, timeout=30, follow_redirects=True)
    length = int(r.headers.get("content-length") or 0)
    print(f"    HEAD {r.status_code}  content-length={length/1024/1024:.1f}MB  "
          f"type={r.headers.get('content-type')}")
    if r.status_code != 200 or abs(length - APK.stat().st_size) > 1024:
        sys.exit("公网下载校验失败")

    print("[qr] 生成二维码…")
    qr = qrcode.QRCode(box_size=10, border=3, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(DOWNLOAD_URL)
    qr.make(fit=True)
    qr.make_image(fill_color="black", back_color="white").save(QR_PATH)
    print(f"\n下载地址: {DOWNLOAD_URL}")
    print(f"二维码:   {QR_PATH}")


if __name__ == "__main__":
    main()
