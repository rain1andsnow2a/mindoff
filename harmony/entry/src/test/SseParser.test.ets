import { describe, expect, it } from '@ohos/hypium';
import { SseEvent, SseParser } from '../main/ets/core/network/SseParser';

export default function sseParserTest(): void {
  describe('SseParser', () => {
    it('parsesSplitAndJoinedEvents', 0, () => {
      const events: SseEvent[] = [];
      const parser = new SseParser((event: SseEvent) => events.push(event));
      parser.feed('event: token\ndata: {"delta":"你');
      parser.feed('好"}\n\nevent: done\ndata: {"content":"你好"}\n\n');
      expect(events.length).assertEqual(2);
      expect(events[0].event).assertEqual('token');
      expect(events[1].event).assertEqual('done');
    });

    it('parsesMultilineData', 0, () => {
      const events: SseEvent[] = [];
      const parser = new SseParser((event: SseEvent) => events.push(event));
      parser.feed('event: note\ndata: first\ndata: second\n\n');
      expect(events.length).assertEqual(1);
      expect(events[0].dataText).assertEqual('first\nsecond');
    });

    it('handlesSplitCrLfBoundary', 0, () => {
      const events: SseEvent[] = [];
      const parser = new SseParser((event: SseEvent) => events.push(event));
      parser.feed('event: token\r\ndata: {"delta":"好"}\r');
      parser.feed('\n\r\n');
      expect(events.length).assertEqual(1);
      expect(events[0].event).assertEqual('token');
    });

    it('flushesTailAndDoneMarker', 0, () => {
      const events: SseEvent[] = [];
      const parser = new SseParser((event: SseEvent) => events.push(event));
      parser.feed('event: done\ndata: [DONE]');
      parser.finish();
      expect(events.length).assertEqual(1);
      expect(events[0].data).assertNull();
    });
  });
}
