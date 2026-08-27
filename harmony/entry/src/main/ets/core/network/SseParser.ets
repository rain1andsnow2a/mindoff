/** 增量 SSE 解析器：处理半包、粘包、多行 data 与 CRLF。 */

export interface SseEvent {
  event: string;
  dataText: string;
  data: Object | null;
  id: string | null;
}

export class SseParser {
  private buffer: string = '';
  private pendingCarriageReturn: boolean = false;
  private readonly onEvent: (event: SseEvent) => void;

  constructor(onEvent: (event: SseEvent) => void) {
    this.onEvent = onEvent;
  }

  feed(chunk: string): void {
    let normalizedChunk = chunk;
    if (this.pendingCarriageReturn) {
      normalizedChunk = `\r${normalizedChunk}`;
      this.pendingCarriageReturn = false;
    }
    if (normalizedChunk.endsWith('\r')) {
      normalizedChunk = normalizedChunk.slice(0, normalizedChunk.length - 1);
      this.pendingCarriageReturn = true;
    }
    this.buffer += normalizedChunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      if (block.length > 0) {
        this.parseBlock(block);
      }
      boundary = this.buffer.indexOf('\n\n');
    }
  }

  finish(): void {
    if (this.pendingCarriageReturn) {
      this.buffer += '\n';
      this.pendingCarriageReturn = false;
    }
    const tail = this.buffer.trim();
    this.buffer = '';
    if (tail.length > 0) {
      this.parseBlock(tail);
    }
  }

  private parseBlock(block: string): void {
    const lines = block.split('\n');
    let eventName = 'message';
    let eventId: string | null = null;
    const dataLines: string[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.length === 0 || line.startsWith(':')) {
        continue;
      }
      const separator = line.indexOf(':');
      const field = separator >= 0 ? line.slice(0, separator) : line;
      let value = separator >= 0 ? line.slice(separator + 1) : '';
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      if (field === 'event') {
        eventName = value;
      } else if (field === 'data') {
        dataLines.push(value);
      } else if (field === 'id') {
        eventId = value;
      }
    }

    if (dataLines.length === 0) {
      return;
    }
    const dataText = dataLines.join('\n');
    let data: Object | null = null;
    if (dataText !== '[DONE]') {
      try {
        data = JSON.parse(dataText) as Object;
      } catch {
        data = null;
      }
    }
    this.onEvent({ event: eventName, dataText: dataText, data: data, id: eventId });
  }
}
