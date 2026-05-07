# Rule: general-retrieval

## Scope
适用于需要依赖 OpenViking 检索的通用业务问答。

## Retrieval
1. 先用 `memsearch` 或 `memglob` 缩小候选资源范围。
2. 如果资源 URI 可能会展开成目录树，先用 `membrowse` 确认结构。
3. 只有在目标 URI 已经明确后，再用 `memread` 深入读取。

## Answer
- 优先给出带有具体 `viking://` URI 依据的回答。
- 当检索结果不完整时，要明确说明不确定性。

## Updates

### 2026-05-07T00:00:00.000Z
为当前 demo 项目建立第一版通用检索规则。
