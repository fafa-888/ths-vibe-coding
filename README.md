# 选股条件工作台

面向同花顺 AI 产品经理笔试题的可操作 Web 产品。用户输入自然语言选股意图，检查和修改结构化条件，再基于扶摇金融数据查看筛选结果及逐项依据。产品提供条件筛选与解释，不提供投资建议。

已部署站点：[选股条件工作台](https://stock-intent-lab-1026.alivehen130.chatgpt.site/)（持链接者可访问）。

## 启动

要求 Node.js 22.13+。在本目录执行：

```bash
npm ci
npm run dev
```

浏览终端输出的本地地址。生产构建使用 `npm run build`。

## 环境变量

本地运行真实服务时，将 `.env.example` 复制为 `.dev.vars` 并填写变量；部署时将它们设置为站点的服务端 Secret。不要提交密钥、`.env` 或 `.dev.vars`。

| 名称 | 必需 | 用途 |
| --- | --- | --- |
| `HITHINK_FINANCE_API_KEY` | 真实数据必需 | 服务端调用扶摇 REST API 的 `X-api-key` |
| `AI_API_KEY` | AI 解析必需 | 模型服务端密钥 |
| `AI_MODEL` | AI 解析必需 | 兼容 Chat Completions 接口的模型 ID |
| `AI_BASE_URL` | AI 解析必需 | HTTPS API 基址，末尾可含 `/v1` |

当前站点使用千问百炼按量付费北京地域的 `qwen-plus`，接口基址为 `https://dashscope.aliyuncs.com/compatible-mode/v1`。参见[阿里云百炼 Base URL 总览](https://help.aliyun.com/zh/model-studio/base-url)与[千问 OpenAI 兼容接口说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)。

配置模型后，`/api/parse` 才会启用“理解意图”；未配置时仍可手工编辑默认条件。若扶摇密钥未配置，`/api/dataset` 返回 503，界面不会展示虚构股票。

## 用户主链路

1. 输入描述，例如“经营改善、估值合理、走势相对稳定”。
2. AI 仅把文字解释为预设的五个可编辑阈值。模糊词使用默认阈值时，界面提示用户确认。
3. 选择白酒概念或沪深 300 股票池；系统按股票代码排序，取前 16 只成分股作为**明确标注的样本**。
4. 服务端获取扶摇成分股、估值快照、两期财务指标和前复权日 K；浏览器中的确定性规则引擎逐项筛选。
5. 查看“符合 / 未通过 / 数据不足”，点击股票核对原始字段、单位、报告期、数据时点和请求标识。
6. 修改阈值后在同一份数据快照上重新计算，查看新增、移出和保持符合的数量；可把方案保存在当前浏览器。

## 指标定义

| 用户语言 | 确定性条件 | 来源及口径 |
| --- | --- | --- |
| 经营改善 | 2026 半年报营收同比增速达到下限，且比 2025 半年报同项增速提高至少指定百分点 | 扶摇财务指标 `calculate_operating_income_yoy_growth_ratio`；原始值为百分数值 |
| 估值合理 | 正市盈率 TTM 位于用户设定的开闭区间 | 扶摇最新估值快照 `pe_ttm`；倍 |
| 走势稳定 | 近 60 个交易日最大回撤不超过阈值 | 扶摇历史日 K `close_price`，`adjust=forward`；百分比 |

最大回撤：在最近 60 个有效收盘价内，逐日计算 `(截至当日的区间峰值－当日收盘价)/截至当日的区间峰值`，取最大值。少于 60 根 K 线、指标缺失或无法获取时保留空值。

## 系统职责

- **AI：**解析意图并提出受控阈值建议，不能输出股票是否入选的决定。返回值经字段白名单与范围校验。
- **扶摇：**提供成分股、估值、财务和日 K 事实数据。服务端持有 Key；前端不可接触密钥。
- **确定性引擎：**计算回撤、校验冲突、按阈值判断、生成可复核的逐项结果。存在已证实不满足的条件时为“未通过”；没有失败但有缺失条件时为“数据不足”。

## 交付范围与异常处理

- 产品只评估页面标明的 16 只样本，不代表指数全量或全 A 股。
- 财务口径固定为 2026 与 2025 半年报。
- 扶摇估值 `data.timestamp` 是本批次上游指标元数据的**最大**有效时间，不是每只股票每个指标的独立更新时间。页面展示这一限制。
- 估值与日 K 的批次/最新时间超过 14 天时标记数据不足；财务数据按报告期展示。
- 股票方案保存在当前浏览器的 `localStorage`，支持再次载入。
- 用户直接调整条件时在同一份快照上比较；切换股票池后重新取数，不把不同时点的数据混作一次条件影响。
- 数据缺失时显示“数据不足”；成分股接口拒绝访问时停止生成结果并保留上游请求标识。公开站点已配置密钥并完成真实调用；独立部署需配置自己的密钥和接口权限。

## 数据文档

- [扶摇 API 说明](https://fuyao.aicubes.cn/docs/)
- [指数成分股](https://fuyao.aicubes.cn/docs/api-reference/a-share-index/)
- [估值快照](https://fuyao.aicubes.cn/docs/api-reference/valuations/)
- [财务指标](https://fuyao.aicubes.cn/docs/api-reference/financial-indicators/)
- [历史 K 线](https://fuyao.aicubes.cn/docs/api-reference/prices/)

## 验证

```bash
npx tsc --noEmit
node --import tsx --test tests/*.test.ts
npm run build
```

详见 [测试说明](./TESTING.md) 与 [AI 使用与验证记录](./AI_USAGE.md)。
