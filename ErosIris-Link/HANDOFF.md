# ErosIris-Link 交接清单（v2.1）

> 给下一个接手的 AI / 开发者。先通读本文件再看代码。用户会自己直接改代码，
> **动手前先 grep 确认当前实现**，不要假设文件和你上次看到的一致。

## 项目概况

纯静态零依赖网页（双击 `点我打开ErosIris-Link软件.html` 可用），音响系统连线图管理工具。
localStorage key：`signalpath-v2`（v1 自动迁移，旧 key 保留作备份）；
图片存 IndexedDB（js/db.js，SP.Images，内存缓存同步读写）。

模块（`点我打开ErosIris-Link软件.html` 加载顺序）：
db → store → diagram → inspector → quick → keys → cables → mixer → teach → report → main

- **store.js**：数据模型 + 撤销栈（整体 + 5 分区）+ 智能连接规则 + 统计（线材/机柜/供电/功率报警）+ 模板体系
- **diagram.js**：SVG 框图（分层排版/重心排序/交叉计数/框选/缩放/分台视图/外侧走线/导出 PNG/PDF）
- **inspector.js**：右侧设备栏（列表+详情）、添加设备/模板管理/CSV 批量导入、连接清单抽屉、右键菜单
- **quick.js**：快速布局（音响反推 + 数量布局两页签，默认优先音响反推，预设存取）
- **keys.js**：快捷键注册表（可改键，localStorage `signalpath-keys-v2`）
- **cables.js**：线材清单页（分组明细 + 批量长度）
- **mixer.js**：台内路由（调音台三矩阵 + DSP 内部矩阵/压限页）
- **teach.js**：接线教学（全设备类型 + 功放拨档教学卡）
- **report.js**：报告 PDF（TOC 跳转）+ Excel(CSV) 导出 + CSV 读写工具（SP.csvBuild/csvDownload/csvParse）
- **main.js**：启动、toast（SP.toast）、配置面板（槽切换/临时移除/模板库存档）、分台选择器

## 测试（tests/ 目录，无需 node，用系统 JavaScriptCore）

```bash
cd /Users/ethanye/AI/ErosIris-Link
tests/checksyntax.sh js/*.js     # 语法检查（Function 构造器只解析不执行）
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
$JSC tests/test-harness.js       # 142 项逻辑回归（迁移/桥接/智能连接/统计/模板/反推相关）
$JSC tests/test-ui.js            # 76 项 UI 启动路径（DOM 桩，全模块加载+各弹窗入口）
```
本机 node 坏了（homebrew icu 缺库），别用 node。本地预览：`python3 -m http.server 8931`。
Chrome MCP 扩展连不上，**浏览器可视回归一直靠用户人工验证**。

## 关键交互约定

- 除两处外一律「直接执行 + SP.toast 提示（⌘Z 可撤销）」，不弹确认框。
  保留确认的两处：①功放切 P 档时问是否断开该对第二路输入线（用户点名要的）；
  ②配置槽彻底删除（不在撤销栈里）。
- 批量操作用 `Store.batch(fn)` 包裹 = 单个撤销步骤。
- 新增 state 字段必须在 store.js `upgradeData/normalize` 幂等补齐。

## 数据模型要点

- 功放：`ampPairModes`（每对 P/S/B，**新建默认 S**；B 桥接隐藏奇数输出口）、
  `specs.grounded` 整机接地（新建默认 true）、每输出口 `gain`。
- 音箱：`speakerRole`（linearray/fullrange/sub）+ `specs.powered`；
  **智能连接默认不自动并联**（autoSourceTypes 已去掉 'speaker'），手动并联允许
  （同有源属性+同分支），canAutoConnect 里保留了并联合法性判断供手动路径复用。
- DSP：`dspRoute = { matrix: {in:[outs]}, limits: {out:{rms,peak}} }`。
- 连接：`lenM`（数字米）+ `note`；`cable` 空时按信号级默认。
- 模板：`deviceTemplates`（tplId 关联实例可同步）、`quickPresets`、`userMixerTemplates`；
  三者可整体存档（Store.exportTemplateLib / importTemplateLib，按名称合并）。
- 用户自己加了：功率报警体系（未填功率的引导性 connWarning）、阻抗并联校验、
  线长规格分布 lengthBreakdown（cableSummary 内）——别当成我方代码回退掉。

## v2.1 已完成（用户编号 1-19，缺 5）

1 功放默认 S；切 P 询问断开该对第二路输入线
2 快速布局「线阵列」占位列（置灰敬请期待）
3 缩放快捷键 `=`/`-`/`0`（无修饰键，0=全局/定位双态），⌘滚轮仍在
4 快速布局默认 Ctrl+1（备 ⌘K）
6 报告导出 Excel(CSV带BOM)：设备（同型号合并计数）/连接/线材汇总；
  报告页悬浮 TOC；选项弹窗点名称跳预览章节
7 默认禁止自动并联；多余音响 toast「还有 N 只音响未接上」（smartAssignAll 返回 speakerLeft）
8 快速布局「音响反推」页签：音响×倍率(1.2/1.5/2/自定义)→功放功率建议(不足红警)、
  功放数=⌈音箱路数/通道数⌉、DSP数=⌈功放输入/DSP出口⌉，全部向上取整
9 分台视图：工具栏 #diagram-scope（>1 台调音台才显示），只显示该台下游可达设备
10 设备栏行色=框图节点色；点击行→切到设备连线页并居中定位
11 相对上级/相对下级重定义：层内保序等间距排整齐，组中心对齐上/下级（SP.relAlignLayout）
12 smart 布局模式（快速布局后自动启用）：上/下对齐各算一遍取交叉少的；
   placeAlignUp 内置重心排序（保持音箱角色分组）
13 DSP→有源音箱走正常曲线并参与 DSP 下级对齐；调音台→有源只做局部绕线，不再靠画布外侧通道
14 连线警示 → 框图节点红色 ! 角标（hover 看原因）+ 设备栏行 ⚠
15 线材明细按类型分组（组头色条+小计+斑马纹）
16 批量长度：组头「应用到未填（可勾覆盖）」+ 勾选行统一长度（均单撤销步骤）
17 配置面板「导出/导入模板库」（三类模板一个 JSON，按名合并）
18 添加设备弹窗「批量导入」：下载音响/功放 CSV 填写模板→回传→表头自动识别→合并进模板库
19 报告选项全选/全不选

## v2.3 模板面板「导入导出 / 提取」重构（本轮）

模板面板（顶栏「模板」→ SP.openTemplatePanel，在 inspector.js）的两个分区改名重构：
- 分区「导入模板表到库」→ **「导入导出」**，三个入口：
  · **模板库导出**（tplp-lib-out → SP.exportTemplateJson）导出整体模板库 JSON。
  · **模板库导入**（tplp-lib-in → tpl-lib-file → SP.promptTemplateLibImport）
    弹窗选「覆盖」或「合并」；覆盖走 Store.importTemplateLib(data,{replace:true}) 先清空再替换。
  · **批量导入CSV（选文件夹）**（tplp-csv-folder → SP.pickCsvFolder → SP.importCsvFolder）
    webkitdirectory 选整个文件夹，读全部 .csv/.xml，逐个 SP.parseTemplatesFromText 解析、
    符合表头标准的查重合并入库；表头不符的文件跳过并计数。
  · 原「一键模板」按钮已从该分区移除。
- 分区「识别当前配置为模板表」→ **「提取当前案例中的模板」**：
  每行加复选框 + 状态列（完整/待补全）+ 一键全选/全不选；captureRowComplete 判定必填
  （音响缺功率/无源缺阻抗、调音台/DSP 缺路数 = 待补全）；「确认加入模板库」只处理勾选行，
  含待补全的勾选行会被阻止并提示补全，实时输入即更新状态。
- store.js：importTemplateLib(data, opt) 新增 opt.replace（覆盖模式，返回含 replaced）。
- inspector.js：CSV 解析抽成纯函数 SP.parseTemplatesFromText(text)→{templates,skipped}|null，
  单文件 importCsvTemplates / 文件夹 importCsvFolder 共用它。
- 注：quick.js 与设备栏统计条仍保留各自的「一键模板」快捷入口（saveAllTemplates + bundle 导出），
  与面板的「提取」流程是两条并存路径，未合并。
- 遗留死函数 captureTemplates / tplToTotalRow（面板内闭包）现已无引用，保留未删（无害）。

## v2.4 音响反推重构 + 模板面板改名（本轮）

- 模板面板分区「导入导出」→ **「导出导入」**（inspector.js SECTIONS + importHtml + 测试）。
- **音响反推面板（quick.js）整体重构为类目模型**：
  · 顶部 **数字+空格 数量条**（`rv-count-bar`）：全频 / 超低（Shift 或点 `rv-show-active` 展开
    有源全频 / 有源超低）；数字填格、空格下一格、退格清空/回上格、回车创建，风格同数量布局。
  · 数据模型从 `rvRows[]`（自由多行）改为 **`rvCat`**（4 个固定类目 fullrange/sub/afullrange/asub，
    每类一份 {count,tplIdx,name,power,ohms,parallel}）。UI 每类一份配置；
    **注意：store 的 reverseCalc/reverseLayout 仍接受 rows[]，可多行**（测试直接调 store，不受影响）。
  · 数量>0 的类目在下方显示详情块：选模板 或 手填功率/阻抗（无源可设并联；有源无阻抗/无并联）。
  · **有源音箱不参与反推**（item 7）：reverseCalc 只吃无源行；有源经 `plan.activeRows` 传给
    reverseLayout，创建后从空闲 DSP/调音台线路输出接入（store.js reverseLayout 末尾新增该段）。
  · 移除「更新到一键模板」按钮/函数（updateReverseTemplates 已删）。
  · 「查看当前」→ **「查看当前案例反推过程」**，与「保存为反推模板」一起移到 **modal-foot 左侧**
    （`rv-foot-actions`，仅反推模式显示；bindRvFooter 绑定一次）。「创建系统」仍在右侧。
  · 反推快照 rows[] 增加 `active` 标记；applyReverseSnapshot/reverseFromCurrent 按类目聚合，
    兼容旧反推预设（无 active 视为无源，同类目多条合并计数）。
- 快照兼容：老 `reversePresets`（rows 无 active）套用时归入无源类目，数量累加。

## v2.5 快速布局事件委托 + 反推多组卡片（本轮）

- **quick.js 全量重写为事件委托**：keydown/click/input/change 各一个监听器挂在 modal-box，
  内部按 data-act / data-rv-* / data-ql-* 分发；不再有逐元素 addEventListener，
  杜绝“一处绑定抛异常导致整个面板键盘失效”（此前 bug 的根治）。
  打开面板与切页签用 rAF 聚焦第一个数量格；Shift 用 keydown 置 pending + keyup 确认
  （单独按下才触发，data-rv-name 自由文本框内不误触），任意焦点下可展开/收起有源；
  焦点不在输入控件时按数字自动跳到第一个空数量格填入。
- **keys.js**：弹窗打开时屏蔽无修饰键全局快捷键（=/-/0/Delete 等），避免抢弹窗键盘。
- **反推改多组卡片**（rvGroups[]，替代 v2.4 的固定 rvCat 四类目）：
  每张卡竖排 数量→功率→阻抗→模板→并联，同类可加多组（＋全频/＋超低/＋有源…，
  标题自动编号 全频①②）；选模板自动带出功率/阻抗并置只读（虚线边框），
  切回「手填」恢复编辑；手填卡可“存为模板”。数量/功率/阻抗全部 text+inputmode
  纯打字（data-num 过滤非数字），全局 CSS 隐藏 number spinner。
- **有源占用通道**（item 4）：reverseCalc 增加 opt.activeCount，
  dspN = ⌈(ampInputs + activeCount) ÷ dspOuts⌉，返回 activeCount/lineFeeds；
  UI 显示“有源占用 N 路”；无 DSP 模板时校验调音台输出总数并红警。
- **清线→智连行回配**（item 6）：reverseLayout 给每行功放打 `amp.reverseRow = 行号`；
  smartAssignAll 跳过锁定组从属音箱（index>1，不抢口）；autoFreeOuts 对带
  reverseParallel.row 的音箱，只要同行功放还在就只取同行功放的口——
  清线后再智连，功放-音响按行功率匹配不被打乱（测试 §15 专门用“行序与角色排序相反”
  的场景验证）。
- 反推快照 rows[] 结构不变（含 active），旧反推模板兼容；reverseFromCurrent 按
  (角色+有源+型号+参数+并联) 聚合为多组。
- 测试：§13 覆盖有源走线（DSP 正常曲线 / 调音台局部绕线）；§14 activeCount；§15 行回配；UI 加“严格桩”
  用例（getElementById 只认已渲染 id，验证初始化无 null 绑定）。

## v2.6 快速布局监听去重 + 反推体验优化（本轮）

- **【bug 根治】输入 1 变 11 / 变 128**：modal-box 是常驻复用元素，v2.5 的委托监听
  每开一次面板叠加一套。现在 openQuickLayout 开头先 removeEventListener 上一次的
  4+1 个 handler（引用存在 `box._qlHandlers`），再通过 `on(type,fn)` 统一挂载。
  测试桩的 removeEventListener 已升级为真实移除，UI 测试加“连开两次面板按 1 仍是 1”
  的行为回归（此前桩是 noop，抓不到这类叠加）。
- 模板下拉首项「— 手填 —」→「（选择模板）」，全界面去掉“手填”字样；
  反推结果与创建设备的兜底命名改为与卡片一致的 类型+编号（全频①/超低②…）。
- **功放自动匹配**（quick.js autoPickAmps）：按最大需求功率 needW，在 2/4 通道各自的
  模板池里选“满足 ≥needW 且最接近”的一台；全不满足选最大（红警保留）；
  **手动选过（amp2Manual/amp4Manual）或快照带功放名后不再自动改**，标「已自动匹配」。
  confirm2 创建前兜底再跑一次。
- 「查看当前案例反推过程」改双态：点亮前暂存面板快照（含手动标志），点灭还原。
- **反推左右分栏**：左=卡片组+反推模板 chips；右=设置+实时结果（sticky，#rv-calc
  max-height 42vh 内滚），填写时结果不需要拖动即可见；modal-quick 加大到
  min(1280px, 100vw-32px)、max-height 94vh；≤900px 自动堆叠。
- Shift 逻辑未动（用户确认正常）。

## v2.7 模板 CSV 导入增强（本轮）

- **导出导入区新增「导入CSV模板」单文件按钮**（tplp-csv-single → SP.pickCsvImport → csv-import-file
  单文件 → SP.importCsvTemplates）：直接读一个「下载填写模版表」(.xls SpreadsheetML / .csv) 合并入库。
  已用用户提供的 ErosIris-Link+…-模板总表.xls 验证：36 个型号一次导入。
- **文件夹批量导入按文件名推断类目**（SP.catFromFilename）：从工作簿拆出的单表 CSV
  （超低.csv / 功放.csv / DSP.csv / 全频有源.csv…）本来丢了类目——超低会被误判全频、
  功放/DSP/调音台因无类目列直接被拒。现在 importCsvFolder 先按内容解析，
  再用文件名类目 hint 强制归类（有源优先匹配；有类目列/类型列的总表不被覆盖）。
- parseTemplatesFromText(text, opt) 新增 opt.catHint：内容缺「类别/类型」列时按类目逐行强制解析。
- 测试：test-ui 加 catFromFilename、超低/功放/DSP 单表归类、总表不被 hint 覆盖等用例。

## v2.9 调音台不足提示 + 单设备智能分配升级（本轮）

- **调音台输出侧不足只提示、不自动加**：reverseCalc 新增 `res.dspInputs / res.mixerFeeds`
  （有 DSP＝dspN×dspIns 喂满 DSP 输入，无 DSP＝lineFeeds 直推功放+有源）；
  `dspOuts` 显式传 0 = 无 DSP 直推（quick.js 无 DSP 模板时传 0，向后兼容：省略仍按 8）。
  反推实时结果把「调音台输出不足」检查从"仅无 DSP"扩展到有 DSP 情形；
  afterCreate 用 `mixerShortage()`（画布上调音台可见输出 vs DSP 输入/功放输入+有源）
  兜底 toast，数量布局(count 页)同样覆盖。型号/数量仍手动填，不自动加台。
- **单设备智能分配（右键菜单 + 设备栏，均走 Store.smartAssign）升级为并联组感知**：
  `parallelGroupOf(dev)` 取该设备的反推并联锁定组（按 index 排序）。smartAssign：
  · 设备属锁定组 → 接顺整组（组长接同行功放 autoFreeOuts、chainLockedGroup 串接从属），
    从属不再乱抢功放口；组是一个逻辑整体，会顺带把同组组长/从属接顺（用户确认保留）。
  · 普通设备 → 原 autoFreeOuts 分配（已尊重 reverseRow 功放行绑定）；普通音箱若恰为
    某锁定组组长也顺带串接从属。严格只动这台设备 + 它所在并联组，不重排其它链路。
  smartAssignPreview 对锁定组成员返回"待接顺"连线数（组长缺功放 + 未正确串接的从属）。
- 测试：§17 mixerFeeds（有/无 DSP）；§18 并联从属被打乱后智能分配串回组长、组长智能分配
  接功放+串从属、"不影响整体"（其它组不变）、普通音箱仍接功放。

## v3.0 音箱单线规则 + 排版整理 + 交换机/Dante 体系（本轮）

用户确认的设计（审核通过后按 5 批实施，每批回归全绿）：

- **批次1 · 音箱单条功放线**：`connectionError` 新规则——无源音箱最多从功放接入
  一条音响线（同口换接不算），其余输入口只用于音箱↔音箱 link 串接；有源不接功放（原规则），
  有源↔有源 link 默认允许。`cleanupConnectionErrors` 改为逐条渐进保留
  （互相冲突的多条功放线只清多余的，不再整对误删）。
- **批次2 · 排版**：
  · 拖完自动挤开：`SP.settleAfterDrag(devId)`（diagram.js）——拖动松手后被拖节点主轴
    吸附回本层行（保持向下对齐），层内按当前顺序保序去重叠（只挤开重叠者，不等间距重排，
    只有真被挤动的节点写 px/py）。onUp 里先同步渲染刷新 `SP._layout` 再 settle。
  · 「对齐下级」按钮改名「对齐」= `SP.relAlignLayout('down')`（保持当前相对顺序，
    逐层等间距排整齐并对准下级）——用户明确要等间距重排，不要轻量去重叠。
  · 新增「恢复默认布局」按钮（btn-diagram-restore → SP.restoreDefaultLayout）：
    清全部 px/py 回到最初自动布局，不改 diagramLayout 模式。
- **批次3 · 交换机 + 网口线**：新 `switch` 设备类型（青绿 #3fbfb0 = SP.NET_COLOR，
  端口标签「网口 n」，模板库种子 8 网口，deviceTemplatesVersion 4→5）。
  网口线复用 connections 存储、`c.net=true`：源端 sport=-1 不占音频口；
  交换机端占真实网口 tport；调音台↔调音台直连用唯一负数 tport（(tid,tport) 键全局唯一）。
  Store API：addNetLink / removeNetLink / netLinkBetween / netLinksOf / freeNetPort / isNetConn。
  网口线不参与信号分层/智连/功率（diagram 分层与 relAlign 都过滤 c.net；
  autoSourceTypes / canAutoConnect / smartAssign / smartAssignAll 全部跳过 switch；
  音频线接交换机被 connectionError 拒绝）。框图：交换机独占最顶层（typeLayer -1），
  网口线青绿点划线（.net-edge）+ 两端 RJ45 方口，无箭头。右键调音台/交换机可
  连/断网口线，交换机可「一键连接所有调音台」（Store.batch 单撤销步）。
  线材表/连接总表/报告 CSV 的端口守卫放行 net 连线（源口显示「网口」）。
- **批次4 · Dante 分配**：调音台 `danteIn[]/danteOut[]`（各最多 4 路 = 主备双网口余量，
  normalize 清越界+截断）。Store：DANTE_MAX / danteList / isDante / toggleDante。
  三入口共用 `SP.openDanteConfig(devId)` 弹窗（inspector.js）：设备详情页按钮 /
  右键菜单「Dante 分配」/ 台内路由页 btn-mixer-dante；台内路由输入矩阵行头、
  输出矩阵列头同步显示 D 角标（.dante-badge，弹窗内即时联动刷新）。
- **批次5 · 交换机路由页 + 报告**：新顶部页签「交换机路由」（#tab-netroute，
  有交换机才显示；删光自动隐藏并切回设备连线页）。`SP.renderNetRoute`（mixer.js）：
  每台交换机一张表（网口 ↔ 调音台 ↔ 该台 Dante 输出/输入通道），
  调音台直连网口线单独列表。报告在连接清单后追加「网络层（Dante）」页
  （网口线 + 每台调音台 Dante 通道分配，有内容才出页）；网线(Dante) 归入线材汇总。
- 测试：harness §19 单线规则 / §20 挤开+恢复默认 / §21 交换机网口线 / §22 Dante 分配，
  共 175；test-ui 新增交换机路由页、Dante 弹窗、报告网络层、net-edge 渲染、
  页签隐藏等，共 88。全部通过。

## v3.1 Dante 视觉重做（聚合亮节点）+ 右键菜单重排 + 批量选择（本轮）

用户确认（AskUserQuestion）：Dante 用**聚合节点**（每台一个，不按对端拆）；有交换机时**只连交换机**
（接交换机自动清该台直连）；右键第 2 行**保留复制**。

- **右键菜单 3 行重排**（仅调音台，inspector.js showDeviceMenu）：
  行1 台内接线（data-ctx-patch→openPatchTeach 本台）· 台内路由（data-ctx-mixroute→setActiveMixer+switchView('mixer')）· Dante 分配；
  行2 智能分配·清IN·清OUT·复制·删除；行3 网口线（Dante，各对端连/断，可多行）。
  非调音台菜单不变。
- **Dante 分配弹窗升级批量选择**（openDanteConfig）：拖拽框选一段（pointerdown/move 只做 DOM 预览，
  pointerup 一次性 Store.setDante 提交＝单撤销步）、全选 / 全不选按钮。**取消了 4 路上限**
  （全选需要）——store 新增 `setDante(devId,side,ports,on)` / `setDanteAll(devId,side,on)`，
  toggleDante 去掉 cap，normalize 改为清越界+去重（不再截断到 4）。DANTE_MAX 已删除。
- **新 Dante 框图视觉**（diagram.js，取消旧的跨屏点划线 + RJ45）：
  · 每台有 Dante 活动（danteIn/Out 或有网口线）的调音台，在 **input 侧**（竖版=上方/横版=左侧）
    挂一个**聚合亮节点**（青绿 `dante-node-box`，两行文字「⇅ Dante」+ 对端摘要），
    `data-dante-node` 点击→openDanteConfig。
  · 交换机在调音台上一级（typeLayer switch=-1）；网口线从聚合节点锚点连到交换机朝向边
    （`danteBadge`/`switchAnchor`/`netPath` 均方向自适应），无交换机时两台聚合节点直连。
  · 连线画在设备节点之下、聚合节点画在设备节点之上（醒目）。
- **接交换机自动清直连**（store.addNetLink）：调音台接入 switch 时，删掉该台所有
  mixer↔mixer 直连；且"已在交换机上的台"不允许再直连（`onSwitch` 校验）。
- 测试：harness §21 改为断言聚合节点 + 直连被拒 + 线材数=net连线数、§23 接交换机自动清直连、
  §22 改为批量/全选/去重断言（共 183）；test-ui 88 全过。

## v3.2 对齐重做 + Dante 端口化 + 交换机自定义（本轮）

- **默认对齐（整齐树）**：`placeTidyDown`（diagram.js）取代原 bottomup 布局，成为**初始/默认布局**。
  两趟：排序趟（自上而下，按「父节点顺序 + 父输出口序」分组，让同一功放的音箱连续、不被插入）；
  定位趟（自下而上，父居中于子、同层重叠保序推开）。快速布局后 diagramLayout 从 'smart' 改 'bottomup'。
  按钮：`btn-diagram-align-default`「默认对齐」(SP.defaultAlignLayout：清 px/py + tidy)、
  `btn-diagram-align-relative`「相对对齐」(relAlignLayout('down') 保持相对)。移除了「恢复默认布局」按钮
  （被默认对齐取代；restoreDefaultLayout 函数仍在，供测试）。
- **Dante 端口化 + 小节点**（取代 v3.1 的大方框）：调音台参与 Dante 时，input 末尾多一个虚拟
  Dante 网口（`inCountOf`/`danteActive`，节点相应加长；portLocalCross/portPoint 输入口计数用 inCountOf）。
  网口线从 `dantePortPoint`（调音台 Dante 口）连到交换机对应网口。框图上画一个**小圆点 + 「dante」标注**
  （`.dante-dot`/`.dante-dot-label`），点击打开 Dante 分配。
- **交换机网口朝调音台**：`portsOnOutSide(d,isInput)` —— 交换机的输入网口画在朝下（竖版底/横版右）一侧，
  正对下方调音台。网口线锚到具体网口 `inPoint(sw, tport)`。
- **交换机网口数自定义**：`Store.setSwitchPorts(devId,n)`（1~64，缩减时断开越界网口线）；
  设备详情页「网口数量」输入框。
- **一键智能连接自动接 Dante**：smartAssignAll 末尾，有交换机时把未上网的调音台按顺序接到交换机
  网口 1、2、3…（复用 addNetLink/freeNetPort）。
- **右键网口线按钮两列网格**：`.ctx-net-actions` 两列、长名截断、「连接所有调音台」占整行。
- 测试：harness §24 默认对齐（分组 + 功放居中）、§25 智连接 Dante、§21 改小节点/自定义网口断言，
  共 190；test-ui 88，全过。

## v3.3 Dante 主框图简化 + 相对对齐修正（本轮）

- **交换机参与默认/相对对齐**：网口线仍不参与音频分层，但在 diagram.js 内转成
  `switch -> mixer` 的虚拟布局关系；交换机会居中到已互联调音台，不再只靠类型层随意站位。
- **相对对齐改为逐设备目标**：`SP.relAlignLayout('down')` 不再把整层统一拖到一个平均中心；
  每台设备优先对齐自己的下级，没有下级则保持当前位置（上级模式同理），再做同层避让。
- **主框图取消跨设备 Dante 网口线**：不再画 `.net-edge`；调音台/交换机只伸出一段
  `.dante-stub`，后半段 `.dante-stub-fade` 虚线淡出。点击调音台 Dante 小节点/短线打开
  Dante 分配；点击交换机短线选中交换机看互联状态。
- **交换机页只显示互联状态**：交换机路由页和交换机详情只列网口 ↔ 调音台，不显示/控制内部路由；
  具体 Dante 输入/输出在对应调音台的「台内路由 / Dante 分配」里处理。
- **台内路由 Dante 视觉**：Dante 输入行、输出列加 `dante-route` / `dante-route-head` 和图例，
  选中的路由方块使用 Dante 青绿色。
- 测试：harness §21 更新短线示意与交换机对齐断言，新增 §25 相对对齐逐设备断言；
  test-ui 更新交换机互联页、Dante 色块、短线示意。当前 harness 194、test-ui 90，全过。

## v3.4 AI 语音可用性修复（方案 A+B，本轮）

**背景诊断**：语音"点开没用"的根因不在解析逻辑（parse 测试全过），在"听"这一环——
Web Speech API 在 Chrome 里是云服务（音频送 Google 服务器识别），国内网络不可达 →
每轮 `onerror('network')`，旧代码只弹小灰字并 1.2s 无限重启；声波条又是恒定假动画，
看起来在听、实际服务从没通过。次要因素：file:// / http://IP 打开时麦克风被拒
（not-allowed）；Firefox 无此 API；AI 图标兼拖拽把手，移动 >3px 就吞点击。

- **方案 A（诚实报错 + 引导）**（quick.js 全局 AI 语音）：
  · 新增 `.rv-ai-banner` 醒目状态条（bad红/warn琥珀/正常青绿），`setGlobalAiBanner`；
    点击先 `globalAiEnvCheck()` 自检：无 API / 非安全上下文 / 权限已拒 / 离线，
    结论直接亮在面板上并进 `globalAiManualMode()`（聚焦+高亮输入框，is-manual 类）。
  · `network` 错误连续 ≥2 次（globalAiNetErrors）→ 停止无限重试，横幅明确引导：
    Chrome → "建议用 Edge 打开（微软语音国内可用）或直接打字"；Edge → 查网络。
    onresult 收到内容即清零计数。
  · 声波诚实化：待机 0.16 低电平，真收到 onresult 才 `bumpGlobalAiWave()` 跳到 0.85
    再回落（700ms 定时器）。
  · not-allowed 结合 `navigator.permissions.query('microphone')` 预检缓存
    （globalAiMicPermission），"已拒绝"给浏览器设置恢复路径，"未询问"提示点允许。
  · 拖拽改 pointer 事件（鼠标+触屏统一），阈值 3→6px，真拖动过才吞 click；
    orb 加 `touch-action:none`。
- **方案 B（Chrome 端侧识别，防御性）**：`probeGlobalAiLocal()` 在 init 时探测
  `SpeechRecognition.available({langs:['zh-CN'],processLocally:true})`；'available' 直接
  开本地模式；'downloadable' 在用户点击手势里 `kickGlobalAiLocalInstall()` 触发
  `install()`（横幅提示下载进度/完成）。本地模式下每轮识别设 `processLocally=true`
  （识别在本机完成，离线可用，env 自检的"离线拦截"也放行）。老浏览器无这些静态方法
  → 全部安静跳过，回落云端 + 方案 A 提示。
- 测试：test-ui 新增"语音不可用环境→状态条提示+手动输入"断言（jsc 无语音 API 正好走此路径）。
  当前 harness 196、test-ui 115，全过。
- **用户实测结论（2026-07-11）**：Safari ✅ 可用；Chrome ❌（Google 云不可达）；
  Edge ❌ "能激活但不出字"（onstart 触发、onresult 永不来，Edge 实现的已知问题）。
  用户决定：暂缓本地 WASM 方案 C；主用 Chrome，等 Chrome 139+ 端侧识别。

### v3.4b 补充（同轮）：录音波形 + Safari 优先 + 看门狗 + 端侧状态可视化

- **波形 = 录音指示灯**：正在听时 `.is-listening` 触发 CSS 持续起伏动画（transform scaleY，
  不与 JS 内联高度冲突），基线电平 .34；真收到识别结果仍 bump 到 .85。语义：动 = 麦克风在录。
- **看门狗**：会话开始 10 秒无任何识别结果（Edge 典型症状）→ 琥珀横幅提示换 Safari / 打字，
  不强行停止（armGlobalAiWatchdog / globalAiGotResult）。
- **引导文案首推 Safari**（用户已实测可用），Chrome 文案加"升级 139+ 后看面板底部端侧状态"。
- **端侧探测状态可视化**：面板底部 `#global-ai-local`（.rv-ai-local）常显端侧识别状态——
  检测中 / ✅本地包就绪 / 可下载（点图标自动下载）/ 当前浏览器无中文端侧包 /
  此版本不支持（升级 Chrome 139+）。probe/install 全流程同步刷新（setGlobalAiLocalStatus）。
- 人工验证：Chrome 升级到 139+ 后打开面板看端侧状态行；若显示"可下载/已就绪"，
  Chrome 本地识别即解锁（离线可用）。

### v3.4c 补充：第二次启动失败修复 + 提示精简 + 提速（用户 Chrome 端侧实测成功后）

- **用户实测**：Chrome 139+ 端侧中文包安装成功、第一句精准识别 ✅；但第二次点蝴蝶失败。
- **第二次启动失败三重修复**：
  · stopGlobalSpeakerVoice 改用 `rec.abort()`（stop 会等结果回吐，端侧引擎独占时拖住下一轮）；
  · startGlobalRecognitionCycle 开头先 abort 残留实例（globalAiRecognition 兜底清理）；
  · rec.start() 抛错时 350ms 自动重试一次（isRetry 参数），再失败才进手动模式。
- **file:// 一次性授权陷阱**：文件方式打开时若麦克风弹窗选了「仅本次允许」，第二次会
  not-allowed——报错文案检测 `location.protocol==='file:'` 时专门提示选
  「Allow while visiting the site」。
- **提示精简**（用户要求）：Safari 建议只在两处出现——10 秒看门狗（"一直识别不到？建议
  改用 Safari 或直接打字"）和 network×2 失败（"语音服务连不上。可改用 Safari 或直接打字"）；
  开场/正常流程不再提浏览器建议。错误兜底文案带原始错误码（括号）便于定位。
  phrases 偏置词表只在端侧模式启用（云端不支持，会报 phrases-not-supported）。
- **提速**：停顿判定窗口 GLOBAL_AI_PHRASE_MS 1500→800ms。注意：final 片段**必须**合并成
  完整句再执行（test-ui 有两条断言标定此语义——"我要8只"+"全频"要合成一句），
  不能 final 一到就提交，否则残句会被当成 incomplete 指令。
- 回归：harness 196 + test-ui 115 全绿。

## v3.5 移除网页语音 → 小蝶点击式智能引导（本轮）

**背景**：Chrome 端侧识别第二次启动仍不稳定，用户决定放弃网页语音，把蝴蝶入口改造成
纯点击的智能引导。架构决策：**删"耳朵"留"大脑"** —— SpeechRecognition 引擎全删，
指令解析/执行层（parseSpeakerVoiceCommand / applySpeakerVoiceCommand）保留，
成为引导的后端（test-ui 的大量解析测试全部保留有效）。

- **删除**：quick.js 原 356–1091 行语音引擎块（globalAi* 全套：识别循环、麦克风权限、
  波形、看门狗、横幅、端侧探测），main.js 改调 SP.initGuide()；语音专属 CSS
  （rv-ai-banner/rv-ai-local/wave 动画）删除。反推面板内的浮动小部件改名
  「快捷指令」（打字回车执行，非语音）。
- **新增 js/guide.js —— 小蝶引导 🦋**（`点我打开ErosIris-Link软件.html` 第 12 个模块，quick.js 之后）：
  · **状态感知主菜单**：空画布→「配一套系统/导入型号/接线教学」；有设备没连线→
    「一键智能连接」置顶；已连线→「排整齐/功率检查/报告/线材」。
  · **数量步骤**（STEPS.counts）：全频/超低数量输入 + 型号下拉（默认"智能推荐=库存最多"），
    点「帮我配好」→ 合成指令交给 applySpeakerVoiceCommand（打开反推、建组、自动算功放
    DSP 调音台），未指定型号的组自动补发「选库存最多的」。
  · **步骤流**：counts → afterCounts（全部确认）→ create（「直接帮我创建」programmatic
    点 #ql-confirm / 「点亮按钮我自己点」spotlight）→ afterCreate（推荐功率检查/线材/报告）。
  · **高亮带路引擎** SP.Guide.spotlight(id)：目标按钮琥珀脉冲光圈（.guide-spot，
    guide-spot-pulse 动画）+ scrollIntoView + 8 秒自动熄灭。注意实现顺序：先挂定时器
    再加类（jsc 桩的 setTimeout 同步执行）。
  · **常见问题**（faq 步骤）：并联串接（可直接生成×2预览+确认）、Dante/交换机、
    线材计算、报告导出、撤销、接线教学——每个都是"解释 + 直达动作"。
  · 蝴蝶浮球复用原 .global-ai-float/.rv-ai-orb 视觉（图标 assets/brand/ai-voice-icon.*），
    pointer 拖拽（>6px 才算拖不吞点击），位置存 signalpath.guideFloatPos。
  · API：SP.initGuide / SP.Guide.{go,act,spotlight,close}。
- **测试**：test-ui 删除全部 Fake SpeechRecognition 引擎测试与 speechResult 桩，
  新增小蝶引导 7 条（入口就绪/主菜单/数量步骤/填数落反推+自动选型/确认流/spotlight/FAQ）；
  解析层测试原样保留。当前 harness 196 + test-ui 108，全绿。
- **人工验证**：浏览器里点蝴蝶 → 主菜单 → 配一套系统流程走一遍；spotlight 光圈观感；
  「快捷指令」小部件回车执行。

## 已知缺口 / 下一步候选

- **本轮 Dante/对齐视觉是主观项，需浏览器人工看**：默认/相对对齐观感、Dante 小圆点与短线淡出、
  台内路由 Dante 色块、右键两列按钮。DOM 桩测不了观感。
- **待确认再做**：交换机主订阅矩阵（点开交换机→行=各台 Dante 输出、列=各台 Dante 输入、
  勾格=订阅、每接收口最多一个来源）——即真正的"交换机控制调音台"。任务 R4 挂起。
- **浏览器人工回归未做**：反推页、分台视图、外侧走线、分组线材表、CSV 导入全流程，都只过了 DOM 桩测试。
- 台内信号流向图（renderMixerDiagram）尚未画 D 角标；交换机级联暂不支持。
- 报告的系统框图跟随当前分台视图渲染；没有「每台调音台一页框图」的专门报告选项。
- 相对对齐依赖最近一次渲染的快照 `SP._layout`（先渲染后对齐，正常流程没问题）。
- 线阵列只有占位（数据模型早已支持 linearray，扩展时打开 quick.js 的 soon 标记即可）。
- keys.js 的 `+`（Shift+=）已配；数字小键盘 NumpadAdd 未配。
- teach 拨档教学卡是文本卡片，没画开关图形。
- test-ui.js 的 DOM 桩较简（querySelector 恒 null），新增强交互 UI 时记得桩的局限。
