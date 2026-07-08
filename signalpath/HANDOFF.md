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
$JSC tests/test-harness.js       # 57 项逻辑回归（迁移/桥接/智能连接/统计/模板/反推相关）
$JSC tests/test-ui.js            # 35 项 UI 启动路径（DOM 桩，全模块加载+各弹窗入口）
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
13 调音台/DSP→有源音箱的信号线走画布外侧通道（outerEdgePath，画布自动加宽 76px）
14 连线警示 → 框图节点红色 ! 角标（hover 看原因）+ 设备栏行 ⚠
15 线材明细按类型分组（组头色条+小计+斑马纹）
16 批量长度：组头「应用到未填（可勾覆盖）」+ 勾选行统一长度（均单撤销步骤）
17 配置面板「导出/导入模板库」（三类模板一个 JSON，按名合并）
18 添加设备弹窗「批量导入」：下载音响/功放 CSV 填写模板→回传→表头自动识别→合并进模板库
19 报告选项全选/全不选

## 已知缺口 / 下一步候选

- **浏览器人工回归未做**：反推页、分台视图、外侧走线、分组线材表、CSV 导入全流程，都只过了 DOM 桩测试。
- 报告的系统框图跟随当前分台视图渲染；没有「每台调音台一页框图」的专门报告选项。
- 相对对齐依赖最近一次渲染的快照 `SP._layout`（先渲染后对齐，正常流程没问题）。
- 线阵列只有占位（数据模型早已支持 linearray，扩展时打开 quick.js 的 soon 标记即可）。
- keys.js 的 `+`（Shift+=）已配；数字小键盘 NumpadAdd 未配。
- teach 拨档教学卡是文本卡片，没画开关图形。
- test-ui.js 的 DOM 桩较简（querySelector 恒 null），新增强交互 UI 时记得桩的局限。
