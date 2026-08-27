/** HarmonyOS NetworkKit POST SSE 客户端。 */
import { util } from '@kit.ArkTS';
import { http } from '@kit.NetworkKit';
import { apiBase, streamingAuthHeaders } from '../../common/Api';
import { SseEvent, SseParser } from './SseParser';

export interface SseStreamCallbacks {
  onEvent: (event: SseEvent) => void;
}

export class SseClient {
  private request: http.HttpRequest | null = null;
  private cancelled: boolean = false;

  async post(path: string, body: Object | null, callbacks: SseStreamCallbacks): Promise<void> {
    this.cancel();
    this.cancelled = false;
    const request = http.createHttp();
    this.request = request;
    const decoder = util.TextDecoder.create('utf-8');
    const parser = new SseParser(callbacks.onEvent);

    let responseEnded = false;
    let responseCode: number | null = null;
    let completed = false;

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        if (this.request === request) {
          this.request = null;
        }
        request.destroy();
      };
      const settle = (): void => {
        if (completed || !responseEnded || responseCode === null) {
          return;
        }
        completed = true;
        cleanup();
        if (this.cancelled) {
          reject(new Error('已停止回复'));
        } else if (responseCode < 200 || responseCode >= 300) {
          reject(new Error(`流式请求失败（HTTP ${responseCode}）`));
        } else {
          resolve();
        }
      };

      request.on('dataReceive', (chunk: ArrayBuffer) => {
        if (this.cancelled) {
          return;
        }
        const text = decoder.decodeToString(new Uint8Array(chunk), { stream: true });
        if (text.length > 0) {
          parser.feed(text);
        }
      });
      request.on('dataEnd', () => {
        if (!this.cancelled) {
          const tail = decoder.decodeToString(new Uint8Array(0), { stream: false });
          if (tail.length > 0) {
            parser.feed(tail);
          }
          parser.finish();
        }
        responseEnded = true;
        settle();
      });

      const headers = streamingAuthHeaders();
      headers['Accept'] = 'text/event-stream';
      headers['Content-Type'] = 'application/json';
      request.requestInStream(`${apiBase()}${path}`, {
        method: http.RequestMethod.POST,
        header: headers,
        extraData: body === null ? undefined : JSON.stringify(body),
        connectTimeout: 10000,
        readTimeout: 90000
      }).then((code: number) => {
        responseCode = code;
        settle();
      }).catch(() => {
        if (!completed) {
          completed = true;
          cleanup();
          reject(new Error(this.cancelled ? '已停止回复' : '流式连接中断，请检查网络'));
        }
      });
    });
  }

  cancel(): void {
    this.cancelled = true;
    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
  }
}
