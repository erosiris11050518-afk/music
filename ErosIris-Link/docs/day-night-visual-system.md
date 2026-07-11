# ErosIris-Link 昼夜视觉系统

## 设计原则

- 白天使用冰晶玻璃：半透明表面、亮边、柔和阴影和背景模糊。
- 黑夜使用哑光机架：中性石墨表面、金属细边，不使用背景模糊。
- 业务布局、控件尺寸、连线算法和报告结构不随主题改变。
- 品牌蓝用于主操作与选中状态；Dante、警告和设备类型保留各自状态色。

## 场景联动

欢迎页 `config.js` 的每个 `scenes[]` 项必须声明：

```js
{ label: "暮霞", video: "...", darkContent: false, workbenchTheme: "light" }
```

- `darkContent` 只控制欢迎页文字在当前视频上的深浅。
- `workbenchTheme` 控制进入工作台后的材质主题，只允许 `light` 或 `dark`。
- 当前场景保存在 `signalpath-welcome-scene`。
- 工作台主题保存在 `signalpath-theme`。
- 用户在工作台手动切换主题后会立即保存；下一次从欢迎页进入时，当前场景重新决定初始主题。

## 工作台样式边界

主题变量和材质覆盖集中在 `css/workbench-skin.css`：

- `:root`：黑夜哑光变量。
- `html[data-theme="light"]`：白天玻璃变量。
- `Day / night material system`：顶栏、页签、面板、弹窗、字段和文字同步规则。

框图 SVG 使用 `js/diagram.js` 的 `diagramTheme()`，必须与工作台主题同时维护。

## 回归检查

```bash
bash tests/checksyntax.sh welcome-reverse-prototype/config.js welcome-reverse-prototype/app.js js/main.js js/diagram.js
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/test-ui.js
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/test-harness.js
```
