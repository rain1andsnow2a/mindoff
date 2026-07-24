"""阶跃星辰接口常量。端点集中在此，改一处全局生效。"""

# HTTP 端点（相对 stepfun_base_url，即 .../v1）
CHAT_COMPLETIONS = "/chat/completions"
IMAGE_GENERATIONS = "/images/generations"  # 文生图（step-image-edit-2 等）
ASR_SSE = "/audio/asr/sse"  # 一次性识别，JSON+base64，SSE 返回文本
ASR_FILE_SUBMIT = "/audio/asr/file/submit"  # 大文件异步（需公网 URL）
ASR_FILE_QUERY = "/audio/asr/file/query"
AUDIO_SPEECH = "/audio/speech"  # 语音合成 TTS（step-tts-mini 等）

# WS 端点（相对 stepfun_ws_base，即 wss://.../v1）
WS_REALTIME = "/realtime"  # 双向实时语音
WS_ASR_STREAM = "/realtime/asr/stream"  # 双向流式语音识别
