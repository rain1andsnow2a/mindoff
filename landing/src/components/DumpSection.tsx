import type { VarStyle } from '../config';

/** Feature 01 · 倾倒思绪:对话面板 + 思绪碎片被整理成待办。 */
export default function DumpSection() {
  return (
    <section id="dump">
      <div className="wrap f1-grid">
        <div className="reveal">
          <p className="eyebrow">倾倒思绪</p>
          <h2>脑子太吵的时候,<br />就先说给我听。</h2>
          <p className="lede" style={{ marginTop: 22 }}>
            不用组织语言,不用想清楚再开口。说出来的那一刻,喵灵就开始帮你把事情一件件接住、放好。
          </p>
          <p className="f1-tag">你负责说,<b>喵灵负责把混乱接住</b>。</p>
        </div>
        <div className="chat-panel reveal" id="chatPanel">
          <div className="bubble user">今天有好多事情没做完,明天还要交东西,我现在脑子有点乱……</div>
          <div className="bubble miro-b">
            <span className="who"><img src="/assets/favicon.png" alt="" />米露</span>
            我在呢。先深呼吸一下——你说,我听着。刚才那些事情,我帮你挑出来了三件,放在这里了。
          </div>
          <div className="tidy">
            <p className="tidy-label">已为你整理</p>
            <div className="chips">
              <div className="chip" style={{ '--fx': '-46px', '--fy': '-30px', '--fr': '-7deg', '--d': '0.15s' } as VarStyle}>
                <span className="mark">✓</span>明天提交实训材料
              </div>
              <div className="chip" style={{ '--fx': '38px', '--fy': '-44px', '--fr': '5deg', '--d': '0.35s' } as VarStyle}>
                <span className="mark">✓</span>回复消息
              </div>
              <div className="chip" style={{ '--fx': '-24px', '--fy': '36px', '--fr': '-4deg', '--d': '0.55s' } as VarStyle}>
                <span className="mark">✓</span>晚上早点休息
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
