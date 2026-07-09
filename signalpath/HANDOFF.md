# SignalPath 交接清单（v2.1）

> 给下一个接手的 AI / 开发者。先通读本文件再看代码。用户会自己直接改代码，
> **动手前先 grep 确认当前实现**，不要假设文件和你上次看到的一致。

## 项目概况

纯静态零依赖网页（双击 index.html 可用），音响系统连线图管理工具。
localStorage key：`signalpath-v2`（v1 自动迁移，旧 key 保留作备份）；
图片存 IndexedDB（js/db.js，SP.Images，内存缓存同步读写）。

模块（index.html 加载顺序）：
db → store → diagram → inspector → quick → keys → cables → mixer → teach → report → main

- **store.js**：数据模型 + 撤销栈（整体 + 5 分区）+ 智能连接规则 + 统计（线材/机柜/供电/功率报警）+ 模板体系
- **diagram.js**：SVG 框图（分层排版/重心排序/交叉计数/框选/缩放/分台视图/外侧走线/导出 PNG/PDF）
- **inspector.js**：右侧设备栏（列表+详情）、添加设备/模板管理/CSV 批量导入、连接清单抽屉、右键菜单
- **quick.js**：快速布局（数量布局 + 音响反推两页签，预设存取）
- **keys.js**：快捷键注册表（可改键，localStorage `signalpath-keys-v2`）
- **cables.js**：线材清单页（分组明细 + 批量长度）
- **mixer.js**：台内路由（调音台三矩阵 + DSP 内部矩阵/压限页）
- **teach.js**：接线教学（全设备类型 + 功放拨档教学卡）
- **report.js**：报告 PDF（TOC 跳转）+ Excel(CSV) 导出 + CSV 读写工具（SP.csvBuild/csvDownload/csvParse）
- **main.js**：启动、toast（SP.toast）、配置面板（槽切换/临时移除/模板库存档）、分台选择器

## 测试（tests/ 目录，无需 node，用系统 JavaScriptCore）

```bash
cd /Users/ethanye/AI/signalpath
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

## 已知缺口 / 下一步候选

- **浏览器人工回归未做**：反推页、分台视图、外侧走线、分组线材表、CSV 导入全流程，都只过了 DOM 桩测试。
- 报告的系统框图跟随当前分台视图渲染；没有「每台调音台一页框图」的专门报告选项。
- 相对对齐依赖最近一次渲染的快照 `SP._layout`（先渲染后对齐，正常流程没问题）。
- 线阵列只有占位（数据模型早已支持 linearray，扩展时打开 quick.js 的 soon 标记即可）。
- keys.js 的 `+`（Shift+=）已配；数字小键盘 NumpadAdd 未配。
- teach 拨档教学卡是文本卡片，没画开关图形。
- test-ui.js 的 DOM 桩较简（querySelector 恒 null），新增强交互 UI 时记得桩的局限。
