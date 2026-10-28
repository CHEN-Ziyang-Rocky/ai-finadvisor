# 完整股票历史 CSV 更新（2026-10-29）

本轮重新下载原 CSV 中全部 503 个股票代码的可获得日线历史，生成独立的新文件，并已在 Rocky Finance 启用。没有使用付费接口、个人 API 密钥或少量实时报价来替代历史序列。

## 实际交付

| 项目 | 结果 |
|---|---|
| 文件 | `backend/data/market/stock_data_with_sector_2026-10-23.csv` |
| 股票范围 | 原有固定 503 个代码；不是全部美国上市股票，也不是当前指数成分清单 |
| 时间范围 | 2010-01-04 至 2026-10-23（上周五） |
| 日期行 / 列 | 4,228 行日线日期；2,516 列（日期 + 503 × 5 字段） |
| 格式 | 保留原四行表头、行业、代码及 Close / High / Low / Open / Volume 排列 |
| 价格 | 美元，股息及拆股调整价格；OHLC 使用同一调整因子，成交量保留来源原值 |
| 数据来源 | 488 个代码采用 Yahoo Finance chart；15 个采用明确记录来源的公开历史档案 |
| 当前覆盖 | 489 个代码覆盖至上周五；另 14 个保留原证券自己的历史终点 |
| 模型可选股票 | 486 个；14 个历史已结束/过期，另外 GEV、SOLV、SW 尚不足 36 个连续月回报 |
| CSV SHA-256 | `88ad8a0e05c538b6b19035ffdfce340e028816cb9102050273bcc62b4bd48c9f` |

同目录的 `.csv.metadata.json` 记录每只股票的来源代码、首末日期、观测数、历史重叠校验、缺口、异常跳变、隔离记录和整个 CSV 的校验和。`stock_coverage_2026-10-23.csv` 是便于浏览的逐股票覆盖表。上市前和历史结束后的空值保留为空，不向前填充。

## 为什么这样获取数据

主来源是 Yahoo Finance 的公开 chart 日线端点，逐股票指定起止时间、`interval=1d` 和公司行为事件；实际返回频率必须为日线，且必须是对应美元股票。使用 adjusted close 而非原始 close，避免把拆股或现金分红误当成投资损失。复权数据是下载时的修订版本，并非历史当时可见的价格档案。

已结束的证券往往无法从当前报价接口取得完整历史。备用来源为 [Johnbrick123/sp500-data](https://github.com/Johnbrick123/sp500-data) 的 `data` release / `prices.parquet`。程序核对 GitHub 返回的文件字节数和 SHA-256，再用 DuckDB 只读提取需要的证券；不会执行该仓库的代码。档案使用多个上游来源，不属于独立交易所验证。本次下载的档案 SHA-256 为 `2e28aa1abab81326b2a837fe9d16fad55a6e6f463d1feedd1d2f96b4027320d1`。

用户提供的 [Cboe Historical Market Volume](https://www.cboe.com/markets/us/equities/market-statistics/historical-market-volume/) 是市场成交量统计，不能代替每只股票的复权 OHLCV 历史。

免费访问不等于取得行情再分发授权。脚本和来源说明进入 GitHub，原始价格、缓存和生成文件保持为私有研究输入；没有将完整行情作为公开下载服务发布。使用范围仍受各来源条款限制，参见 [Yahoo 条款](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)。

## 证券身份与数据质量

程序要求下载历史覆盖原有历史终点，并比较最近最多 756 个重叠交易日的收益相关性（至少 0.95）。该检查可以拒绝明显的代码复用和历史截断，但不能证明数据在经济意义上完全正确。

保留原 CSV 的代码作为内部 ID，对同一发行人的更名做显式映射：

| 原 ID | 本次来源代码 | 核验依据 |
|---|---|---|
| FI | FISV | [Nasdaq 更名通知](https://nasdaqtrader.com/TraderNews.aspx?id=DTN2025-32) |
| MMC | MRSH | [Marsh 公告](https://www.marsh.com/en/corp/about/news/marsh-mclennan-to-change-nyse-symbol-to-mrsh.html) |
| BK | BNY | [BNY 公告](https://www.bny.com/corporate/global/en/about-us/newsroom/press-release/bny-announces-planned-change-of-stock-ticker-symbol-to-bny-130465.html) |
| EQR | VMRK | [发行人合并公告](https://investors.equityapartments.com/news-events/press-releases-news/news-details/2026/Equity-Residential-and-AvalonBay-Announce-Vivmark-Residential-as-Name-of-Combined-Company/default.aspx) |

这并不意味着可以把被收购股票换成收购方。PARA 已被另一个发行人使用，程序拒绝该代码的当前 Yahoo 序列；备用档案虽把前身历史放在 PSKY 下，也仅取至原证券最后交易日 2025-08-06，后续 PSKY 数据全部排除（[Nasdaq 通知](https://classic.nasdaqtrader.com/TraderNews.aspx?id=ECA2025-414)）。AVB 等也不拼接到收购方。

DHR 的当前 Yahoo 复权序列在 2016-07-05 分拆附近出现约 +61% 的不合理断点。本次整条 DHR 历史改用公开档案的公司行为调整序列，没有手工平滑或拼接价格；[Danaher 分拆公告](https://investors.danaher.com/2016-07-02-Danaher-Corporation-Completes-Separation-of-Fortive-Corporation) 和替代来源均记录在元数据。

HUBB 在 2021-05-05 存在来源价格关系错误（最低价高于开盘价）。保留有效复权收盘价和成交量，将当日 Open / High / Low 三个辅助单元格留空并记录隔离原因。其余观察到的 OHLC 关系、正价格和非负成交量检查通过。没有任何股票在自身首末日期之间缺少相对于 AAPL 日期索引的收盘观测；这个比较不是独立交易所日历认证。超过 50% 的日收益单独列出供审查，不会一律删除真实大幅波动。

以下 14 个代码未延伸至当前周，不参与新的当前组合拟合：

| 代码 | 数据末日 | 代码 | 数据末日 |
|---|---|---|---|
| ANSS | 2025-07-16 | AVB | 2026-08-14 |
| CTRA | 2026-05-06 | DAY | 2026-02-03 |
| DFS | 2025-05-16 | EA | 2026-08-04 |
| HES | 2025-07-17 | HOLX | 2026-04-06 |
| IPG | 2025-11-26 | JNPR | 2025-07-01 |
| K | 2025-12-10 | PARA | 2025-08-06 |
| WBA | 2025-08-27 | WBD | 2026-10-06 |

固定 2025 年范围仍存在选择和存续偏差，不应作为历史每个时点的标普 500 成分回测。行业沿用原 CSV，没有虚构逐时点行业分类。

## 手工下载及激活

从项目根目录运行，需要现有完整 CSV 作为股票范围、行业及身份重叠校验基准。新克隆仓库的数据准备参见原有数据准备说明；原始行情不随代码分发。

```sh
.venv/bin/python -m pip install -r requirements-data.txt

# 不指定 through 时，默认上一个已完成的周五。
.venv/bin/python backend/python-service/market_refresh.py --download-history

# 重现本轮的截止日期；仍下载当时提供方当前可获得的复权修订版。
.venv/bin/python backend/python-service/market_refresh.py --download-history --through 2026-10-23
```

新文件写入 `backend/data/market/`，原基准在下载阶段不会被覆盖。默认 3 个并发请求，全局间隔至少 0.25 秒、有限重试、24 小时原始响应缓存。403/401 不尝试绕过访问控制。免费端点可能限流、下线或改变格式，不能保证永久免费可用；失败保留已启用的数据。

仅在部署环境使用以下显式激活命令，它会备份数据及元信息、替换后重启 `finadvisor-python` 并核验版本；不操作数据库或其他应用：

```sh
.venv/bin/python backend/python-service/market_refresh.py --download-history --activate --weekly
```

全部 503 个代码均须获得通过校验的历史，模型数据须到达最近完整月份；否则不发布 CSV。周五为休市日时以该周实际最后交易日作为覆盖参照；若参照历史未到该周则拒绝发布。备用档案中的 carried 行不会冒充实际成交。元信息校验和、有效价格、月份有效观测数、月末新鲜程度及连续月回报继续在加载阶段检查。

## 与原有自动更新入口合并

原有 `market_refresh.py --activate` 保留作为统一入口。已激活 CSV 的元信息显式设置 `automatic_weekly_refresh=true` 后，它优先使用新下载器；未启用时保留旧的自备 CSV / JSON 导入方式。新流程不读取旧配置中的凭据。

现有 `finadvisor-market-refresh.timer` 每日 08:00 UTC（北京时间 16:00，另有最多约 5 分钟随机延迟）运行原入口。本次没有修改 systemd、Nginx 或共享数据库配置。每天检查一次，只有出现新的已完成周才重建完整历史，以纳入复权修订；同周跳过下载。纽约周五当天仍取前一周，周六以后才取刚结束的一周。月初即使不需重新下载，也会检查服务是否加载了刚完成的月份并按需重新激活。

下载、发布分别加锁；发布失败恢复之前 CSV 和对应元信息，再重启 Finance Python 服务。版本、备份、缓存和状态保存在 `backend/data/market/`，当前版本写在 `update-status.json`。没有自动删除历史备份。

## 验证与部署结果

新 CSV 已在本机及生产 Finance 服务启用。生产数据备份位于 `backend/data/market/releases/before-20261028T183856.025757Z/`；代码发布同样保留回退副本。旧 CSV SHA-256 为 `474353bdb303b1576afdab3857b3e01437f2f26c4f6758ec9cd56e19592a30b2`。

生产 `/assets` 返回 503 个代码、486 个可选标的、来源末日 2026-10-23 和相同 CSV 校验和。Historical、Statistical（含 GARCH）及 Parameterized 各自实际运行，均返回 baseline / optimistic / pessimistic。前两类使用最新 60 个月窗口 2021-10-31 至 2026-09-30；10 月仍未结束，不把部分月份当作完整回报。

原定时任务命令已在生产手工执行验证，返回 `current`，不会同周重复下载。Finance API 健康检查通过。

```sh
PYTHONPATH=backend/python-service ENABLE_AI_EXTENSIONS=0 .venv/bin/python -m unittest discover -s backend/python-service/tests -q
```

本轮 Python 测试共 68 项通过，覆盖下载身份与日线频率、复权比例、异常 OHLC 隔离、历史重叠、节假日末日、过期整周拒绝、缺失保留、完整月、元信息校验、PARA 身份边界、发布备份/回退和自动入口。没有修改前端代码；此前登录地址修复保持生效。
