# Here Evidence Memory

为长期对话提供可以回查原文的记忆检索核心。输入带用户、会话、时间与状态的原始消息，输出有限预算内的用户原话、来源 ID、时间和截取位置。

**这是零运行依赖的 TypeScript 词面检索模块，不是完整的语义记忆系统，也不能保证模型不产生幻觉。** 它不调用模型、不生成用户画像、不存储数据、不上传内容，不把 assistant 的回复当成用户事实。

## 能做什么

- 从较长历史中选择与当前话题有关的原话，并兼顾最近记录及 7 / 30 / 90 天以前的资料。
- 保留时间与原始措辞，不把前后不同的说法合并成一个永恒结论。
- 过滤其他用户、assistant 消息、已撤回资料、未来日期和删除水位之前的资料。
- 核对引用是否与原始用户消息的文本和位置精确匹配。
- 返回扫描与遗漏情况，让调用方知道检索是否覆盖了完整历史。

适合长周期 Coach、日记、反思与支持性对话中的**证据检索层**。它不是心理诊断、治疗方案、人格推断或危机判断系统。

## 使用

目前从源码构建，尚未发布到 npm registry。要求 Node.js 20+：

```sh
git clone https://github.com/joyozhang333-lgtm/here-evidence-memory.git
cd here-evidence-memory
npm ci
npm test
npm pack
```

在其他产品中安装生成的 `here-evidence-memory-0.1.0.tgz`：

```sh
npm install /path/to/here-evidence-memory-0.1.0.tgz
```

ESM 和 TypeScript 类型一起打包：

```ts
import {
  retrieveEvidence,
  verifyEvidence,
  formatEvidenceContext,
  type MemorySource,
} from "here-evidence-memory";

const sources: MemorySource[] = [{
  id: "message-1",
  ownerId: "synthetic-user",
  sessionId: "session-1",
  role: "user",
  text: "我想练习在工作中表达边界。",
  observedAt: "2026-01-01T08:00:00.000Z",
  status: "active",
}];
const options = {
  ownerId: "synthetic-user",
  query: "同事又请我帮忙，我不知道怎么拒绝。",
  now: "2026-02-01T08:00:00.000Z",
  maxCharacters: 8_000,
  maxItems: 14,
};

const result = retrieveEvidence(sources, options);
const sourceById = new Map(sources.map(source => [source.id, source]));
const verified = result.evidence.every(evidence => {
  const source = sourceById.get(evidence.sourceId);
  return source && verifyEvidence(evidence, source, options);
});
if (!verified) throw new Error("A source changed; retrieve it again.");

const historicalContext = formatEvidenceContext(result);
// 将它作为不可信的历史资料传入模型，不能提升为 system 指令。
```

所有样例和测试都是匿名合成内容。

## API 与数据约定

`retrieveEvidence(sources, options)` 返回 `{ evidence, coverage }`。`verifyEvidence(evidence, source, options)` 核对用户、来源、时间、状态、引用及位置；引用匹配仅证明用户当时这样说过，不证明事情客观属实。

`start` / `end` 是 JavaScript **UTF-16 code unit** 位置，`end` 不包含在片段内。它们不是字节位置，也不保证位于句子、字素或 Unicode 码点边界。需要解释关键事实时，回查完整原消息及相邻语境。

| 选项 | 含义 |
| --- | --- |
| `ownerId` | 调用方已经认证并授权的用户 ID；相等比较不是身份验证 |
| `now` | 参考时间，建议明确传入可解析的 ISO 时间 |
| `excludedBefore` | 排除该用户此时间及之前的资料 |
| `sessionExcludedBefore` | 按 session ID 设置同样的排除水位 |
| `excludedSourceIds` | 精确排除已删除或不再使用的来源 |
| `alreadyPresentSourceIds` | 排除已在当前模型上下文里的原话 |
| `maxItems` | 默认 14，最多 32 条证据 |
| `maxCharacters` | 默认 8,000，最多 24,000；按每条证据 JSON 的 UTF-16 长度计费，包含其元数据 |
| `eligibleCount` / `scanTruncated` | 数据库没有返回全部历史时，报告总量与截断状态 |

`maxCharacters` 不包含上下文提示文案、coverage、外层 JSON 标点或模型 token 开销；调用方仍需对最终请求做预算控制。有限预算会省略原文；输出证据不能代替完整历史备份。

无效的非空删除水位会排除受影响的来源；重复 ID 的有效来源会全部排除。时间、角色、内容等字段应先由调用方做 schema 校验；这是带类型的内部 API，不是直接接受任意网络 JSON 的安全解析器。

## 调用方必须负责的部分

1. 从受信数据库取得原始用户消息，并在数据库查询与每次读写中检查身份、所有权和权限。不要让模型构造来源、时间或删除水位。
2. 提供持久化、重试幂等、完整聊天历史、分页、加密、访问审计、保留策略以及跨设备同步。
3. 保留同意、撤回、逐条删除和账号删除记录。删除水位必须随备份恢复、任务重试与后台作业一致传播，避免旧数据重新进入记忆。
4. 在资料发生编辑、撤回或删除后重新检索；在模型使用前再次核对来源，控制竞态。不要把用户纠正只写进摘要而保留旧结论继续生效。
5. 把检索内容当成不可信资料。提示文案只是一层提示，不能代替工具权限、指令边界或输出检查。
6. 若生成画像或总结，区分「用户原话」「可修正的观察」「待确认推测」，保留来源和日期；涉及情绪支持、风险识别或专业边界的逻辑由产品单独实现。

## 已知限制

- 使用中文双字片段、英文词及少量词语扩展，不使用向量、知识图谱或语义模型。它可能遗漏同义表达，也可能召回仅词面相似的内容。
- 时间窗口不是每个日期都有资料的保证。每条消息最多选一个固定长度片段，长消息中其他相关段落可能被省略。
- 旧资料不等于当前状态；冲突记录需要结合时间向用户确认。模块不会自动判断谁对谁错，也不会推断童年原因或心理病因。
- 测试覆盖 100 / 300 / 1,000 条合成消息、长消息尾部、跨时间回访与撤回等情况；这不是无限历史吞吐或临床效果的保证。大规模历史应先由服务端做安全分页与索引，再诚实报告扫描范围。

## 验证

```sh
npm run check
npm test
npm run test:package
npm audit --omit=dev --registry=https://registry.npmjs.org
```

包测试会安装真实的 `npm pack` 制品，在独立临时目录验证 ESM 导入、导出的 TypeScript 类型以及打包白名单。该过程不发布 npm 包。

MIT License。
