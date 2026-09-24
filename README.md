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

在其他产品中安装生成的 `here-evidence-memory-0.3.0.tgz`：

```sh
npm install /path/to/here-evidence-memory-0.3.0.tgz
```

构建输出如下，三种 JavaScript 产物均独立、无运行依赖：

| 文件 | 使用方式 |
| --- | --- |
| `dist/index.js` | 浏览器直接 ESM import，或 Node / 打包器的包导入 |
| `dist/index.cjs` | `require("here-evidence-memory")`，也可单独改名搬运 |
| `dist/here-evidence-memory.iife.js` | 普通 script 加载，提供 `window.HereEvidenceMemory` |
| `dist/index.d.ts` / `dist/index.d.cts` | ESM / CJS 各自的 TypeScript 类型 |

```html
<script src="/vendor/here-evidence-memory.iife.js"></script>
<script>
  const HEM = window.HereEvidenceMemory;
</script>
```

```js
// 将 dist/index.cjs 单独放到宿主 vendor/evidence-memory.cjs；不需要其他文件。
const HEM = require("./vendor/evidence-memory.cjs");
// 浏览器 ESM 也可直接 import * as HEM from "/vendor/index.js"。
```

浏览器需要支持 ES2022（包括 Unicode property escapes、Array.at、Object.hasOwn），请通过 HTTP(S) 提供 ESM 文件。IIFE 是普通脚本，不是 ES module；不要用 import 的副作用加载方式代替 script 标签。构建使用开发依赖 [esbuild](https://esbuild.github.io/api/#format)，包入口遵循 [Node conditional exports](https://nodejs.org/api/packages.html#conditional-exports)。

原有 evidence API 继续可用：

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

## 本地会话适配

适合已经把 `session.timeline` 保存在同设备 localStorage / IndexedDB 的宿主。库不读取浏览器存储、不创建账号、不提供跨设备同步，也不建立服务端全局记忆库。

```js
const sessions = [{
  id: "synthetic-session-1",
  createdAt: "2026-01-02T08:00:00.000Z",
  updatedAt: "2026-01-03T08:00:00.000Z",
  timeline: [
    { type: "bubble", role: "user", id: "entry-1", text: "我想练习在工作中表达边界。" },
    { type: "bubble", role: "coach", id: "entry-2", text: "这是一条合成回复，不作为用户事实。" },
  ],
}];
const boundary = {
  ownerId: "synthetic-local-device", // 宿主固定命名空间，不是已认证账号
  memoryEnabled: true,
  excludedBefore: null,             // 从宿主持久状态读取
  excludedSourceIds: [],
  now: "2026-02-01T08:00:00.000Z",
};
const adapted = HEM.adaptSessions(sessions, boundary);
const options = { ...boundary, query: "如何表达工作边界？", maxItems: 4, maxCharacters: 2400 };
const result = HEM.retrieveEvidence(adapted.sources, options);
const sourceById = new Map(adapted.sources.map(source => [source.id, source]));
const verified = result.evidence.every(evidence => {
  const source = sourceById.get(evidence.sourceId);
  return source && HEM.verifyEvidence(evidence, source, options);
});
if (!verified) throw new Error("Discard stale evidence and retrieve again.");
const first = result.evidence[0];
const ref = first ? adapted.sourceRefs[first.sourceId] : undefined;
// ref: { sessionId, entryId }，用于回到宿主原始消息。
```

### 固定契约

```ts
createSessionSourceId(ownerId: string, sessionId: string, entryId: string): string;
adaptSessions<S = LocalSession, E = LocalSessionEntry>(
  sessions: readonly S[], options: SessionAdapterOptions<S, E>
): SessionAdapterResult;
```

`SessionAdapterOptions` 包含 `ownerId`、`now?`、`memoryEnabled?`、`excludedBefore?`、`sessionExcludedBefore?`、`excludedSourceIds?` 和可选 `mapping`。`ownerId` 必须是固定非空字符串；更改命名空间会更改所有 source ID，宿主必须同时迁移排除记录，不能借改名复活旧记忆。

`SessionAdapterResult` 包含：

- `sources: AdaptedMemorySource[]`：保留 `MemorySource` 全部字段，附 `entryId` 和必填 `observedAtPrecision: "message" | "session-date"`。`source.id` 就是 `evidence.sourceId`。
- `sourceRefs: Record<string, { sessionId: string; entryId: string }>`：仅包含本次成功输出的来源，使用无原型对象，可以 JSON 序列化。
- `diagnostics: SessionAdapterDiagnostic[]`：仅含 `reason`、`sessionIndex`、可选 `entryIndex`；索引从 0 开始，调用级问题用 `sessionIndex: -1`，没有原文、ID 或异常消息。原因包括 `memory-disabled`、`invalid-boundary`、`invalid-sessions`、`invalid-session-id`、`invalid-timeline`、`duplicate-session-id`、`invalid-entry-id`、`duplicate-source-id`、`non-user`、`invalid-text`、`invalid-time`、`revoked`、`ineligible`、`mapping-error`。

默认只接收 `type === "bubble" && role === "user"`，不把 coach / recipient / assistant 或摘要变成用户事实。不修剪或改写原文。ID 使用含 owner、session、entry 的无歧义元组编码；把 helper 返回值视为不透明字符串，勿手工拼接或拆解。缺少稳定 ID 就跳过，不用数组下标或文本哈希补造。重复 session ID 全部排除；同一 session 的重复 entry ID 在角色、撤回和时间过滤前全部排除。请先在宿主合并分页，避免把同一 session 的多页当成多个 session 输入。

### 旧字段映射

`mapping` 的所有 getter 均可选，未提供时使用默认字段。函数必须纯粹、确定性，并读取宿主原始记录，不能从模型摘要合成用户原话。

```js
const mapping = {
  sessionId: session => session.key,
  entries: session => session.messages,
  sessionDate: session => session.day,
  entryId: (entry, session) => entry.key,
  isUserEntry: (entry, session) => entry.speaker === "human",
  text: (entry, session) => entry.body,
  observedAt: (entry, session) => entry.sentAt,
  isRevoked: (entry, session) => entry.removed === true,
};
const adapted = HEM.adaptSessions(legacySessions, { ...boundary, mapping });
```

默认 `status` 只能省略或为 `"active"`；`"revoked"` 和其他值保守排除。`isRevoked` 可以增加排除，不能覆盖原记录的撤回状态。getter 抛错会跳过对应记录并报告 `mapping-error`，不会泄露异常文本。

### 时间精度

- 消息 `observedAt` 支持带时区的完整 ISO 时间（至少到秒，最多三位毫秒）或 epoch 毫秒数，统一成 UTC ISO，精度为 `message`。不猜测秒数单位，不接受无时区时间。
- 仅当消息时间为 `undefined` / `null` 时，使用 session `createdAt`（或 `mapping.sessionDate`）的 **UTC 日期**，输出 `YYYY-MM-DD`，精度为 `session-date`。合法日期字符串直接保留。UTC 日期可能与当地日历日期不同；宿主若使用另一日历口径，需明确映射并统一其水位口径。
- 空字符串、非法日期、只有日期的消息时间、未来时间均不补造有效时间。无有效 session 日期则跳过，不回退到 `updatedAt` 或当前时间。
- `session-date` 是会话日期锚点，不证明某条消息就在当天发生，也不支持同日消息先后推断；多日会话尤其如此。`ageDays` 是锚点的近似年龄，不是精确消息年龄。
- 精度标记随 evidence 进入格式化上下文，verify 会检查一致性。对于日期精度，UTC 日期起点必须严格晚于水位，否则保守排除，可能漏掉仍可用的旧消息。

### 暂停、清除与竞态

库是无状态纯函数，不能替代宿主的 persistent `excludedBefore` 和 epoch：

1. 暂停时持久化 `memoryEnabled: false` 并增加 epoch；适配、检索和 verify 都遵守该开关。恢复不会自动清除水位。若暂停期间聊天也不能在恢复后进入记忆，宿主需持久排除这些 source ID，或接受更保守的恢复时水位。
2. 清除记忆但保留聊天时，先持久化包含边界的 `excludedBefore`、增加 epoch 并清空衍生缓存；清除聊天内容不是必要条件。不允许备份恢复、改 `updatedAt` 或重试任务绕过水位。
3. 按来源排除时持久化 `source.id`；保留旧排除项。改变原消息 ID 或为旧记录补时间属于数据迁移，不能重写历史以绕过删除。
4. 异步工作开始时捕获 epoch；发送模型请求、接受迟到答复、写入缓存前重新读取并比较 epoch。变化则丢弃结果；已有请求的旧快照不能恢复记忆。多标签页和跨存储读写的并发协调由宿主负责。
5. 使用证据前从最新 timeline 与边界重新 `adaptSessions`，以新 `sourceById` 核对每条 evidence，必要时重新检索；不要仅验证旧快照。正文编辑、撤回、ID 冲突和水位变化都可能使旧结果失效。
6. shared card / 分享 / 导出使用独立允许字段列表，绝不序列化 memory result、source、quote、sourceRefs、上下文或包含记忆的模型回复。库不生成或保证分享卡片隔离。

更正历史会保留各次用户原话及日期，不自动判真、不合并为诊断。明确撤回旧说法时可同时排除旧 source；仅词面检索不能保证在小预算内一定召回更正，当前更正仍应进入当前对话上下文。

### 强记忆主张的完整历史校验

检索结果故意有限长，可能选中早期说法却漏掉后来更正。宿主如果允许 Coach 用“我记得你以前说过……”等肯定句，应另取**完整、已授权的原始用户消息**做本地或服务端确定性校验；不要把校验语料送进模型。0.3.0 提供纯函数 `collectClaimVerificationCorpus` 来整理这份短暂的语料：

```ts
import { collectClaimVerificationCorpus } from "here-evidence-memory";

const corpus = collectClaimVerificationCorpus(allAuthorizedSources, {
  ownerId: "synthetic-user", now: "2026-02-01T08:00:00.000Z",
  currentTurnSourceIds: ["message-just-persisted"],
  fullHistoryLoaded: true, // 只有数据库分页全部读完并核对扫描范围后才能为 true
  scanTruncated: false,
});
if (!corpus.complete) {
  // 不能据此说“我记得你以前说过……”；改用不确定的、可让用户纠正的表达。
}
// corpus.texts 仅给宿主的本地校验器使用，绝不放进模型上下文或分享卡。
```

`currentTurnSourceIds` 必须包含已持久化的本轮消息，否则当前的话会被误当成历史回忆。函数按当前 owner、撤回、删除水位、时间和角色过滤，并在同一 owner 出现重复 source ID 时保守失败；校验语料按真实时间由新到旧排序。默认最多读取 200 万 UTF-16 字符，可降低上限但不能提高硬上限。分页不完整、扫描截断、无效边界、身份冲突或超限时返回 `complete: false` 且 `texts: []`。`fullHistoryLoaded` 是宿主声明，模块无法自行证明数据库已经读全；也无法判断哪一句“更正”推翻哪一句旧话。最终的强主张检查、可修正的观察和专业边界仍由宿主负责。

### 服务端 CJS 的可信边界

服务端可对客户端提交的 source / quote 调用 `verifyEvidence`，核对字段、原文切片、UTF-16 位置、来源 ID、session、时间精度，以及**本次提供的**边界。它不能证明客户端真的保存过这段聊天、请求者拥有这些记录、时间真实或水位未被篡改。客户端同时伪造原文和相符 quote 仍可通过校验，不得称为数据库认证。

网络入口仍需独立 schema、长度 / 数量限制、权限与注入防护；该库不是任意 JSON 的安全解析器，不会执行来源中的指令。不要把 `sourceRefs` 或 owner 相等当成账号认证，也不要让模型设置生命周期边界。

## API 与数据约定

`retrieveEvidence(sources, options)` 返回 `{ evidence, coverage }`。`verifyEvidence(evidence, source, options)` 核对命名空间、来源、时间、精度、状态、引用及位置；只证明引用与提供的记录一致。`formatEvidenceContext(result)` 返回标注为不可信历史资料的字符串。verify 沿用 `RetrievalOptions`（包含 `query`），但不验证排序相关性。

`start` / `end` 是 JavaScript **UTF-16 code unit** 位置，`end` 不包含在片段内。它们不是字节位置，也不保证位于句子、字素或 Unicode 码点边界。需要解释关键事实时，回查完整原消息及相邻语境。

| 选项 | 含义 |
| --- | --- |
| `ownerId` | 本地命名空间或宿主已授权用户 ID；相等比较不是身份验证 |
| `now` | 参考时间；支持带时区完整 ISO 或 UTC 日期，非法值保守排除来源 |
| `memoryEnabled` | 默认 true；false 禁止适配、召回和验证已有证据 |
| `excludedBefore` | 排除该用户此时间及之前的资料 |
| `sessionExcludedBefore` | 按 session ID 设置同样的排除水位 |
| `excludedSourceIds` | 精确排除已删除或不再使用的来源 |
| `alreadyPresentSourceIds` | 排除已在当前模型上下文里的原话 |
| `maxItems` | 默认 14，最多 32 条证据 |
| `maxCharacters` | 默认 8,000，最多 24,000；按每条证据 JSON 的 UTF-16 长度计费，包含其元数据 |
| `eligibleCount` / `scanTruncated` | 未加载全部本地或服务端历史时，报告总量与截断状态 |

`maxCharacters` 不包含上下文提示文案、coverage、外层 JSON 标点或模型 token 开销；调用方仍需对最终请求做预算控制。有限预算会省略原文；输出证据不能代替完整历史备份。

删除水位只接受带时区完整 ISO 或 UTC 日期；省略或 null 表示无水位，空字符串和其他非法值会排除受影响的来源。同一 owner 的重复 ID 在有效性过滤前全部排除，避免撤回副本与旧活跃副本冲突时旧资料复活。适配诊断与检索 coverage 分开：coverage 只描述传给检索器的 sources，不能证明宿主已加载所有 session。

0.1.x 的 evidence 函数名、参数与字段保留；旧 `MemorySource` 可省略精度字段。0.2.0 收紧了空水位、无效 now、非法状态和撤回副本冲突的处理。0.3.0 新增强记忆主张的完整历史校验语料 API，没有改变旧检索 API。宿主应显式传合法时间 / null，而不是依赖宽松的 Date.parse 行为。

## 调用方必须负责的部分

1. 从授权的本地存储或服务端数据库取得原始消息，在相应边界检查访问权限；本地模式不意味着服务端能认证这些记录。不要让模型构造来源、时间或删除水位。
2. 提供持久化、重试幂等、完整聊天历史、分页、加密、访问审计及保留策略；跨设备同步不是本地模式的前提，也不是本库能力。
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
PLAYWRIGHT_BROWSERS_PATH="$PWD/node_modules/.cache/ms-playwright" npx playwright install --only-shell chromium
npm run test:package
npm audit --omit=dev --registry=https://registry.npmjs.org
```

包测试会安装真实 `npm pack` 制品，验证包 ESM / CJS、单独改名的 vendor CJS、两种类型入口、打包器类型解析、八文件白名单和零运行依赖，并用独立真实 Chromium 页面通过 HTTP 加载 ESM / IIFE，断言 `window.HereEvidenceMemory` 的检索与边界行为。临时消费者位于仓库内，浏览器和 HTTP 测试服务会关闭。CI 在 Node 20 / 22 上执行；不发布 npm 包。

MIT License。
