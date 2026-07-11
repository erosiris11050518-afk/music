# ErosIris Link — 电影式开场页（Cinematic Hero）

全屏电影式开场页，作为进入 ErosIris Link 工作台之前的交互动画入口。
原生 HTML / CSS / JS，无框架、无构建工具，可直接部署 GitHub Pages。
**未修改原有工作台的任何文件。**

## 文件结构

```text
welcome-reverse-prototype/
├── index.html          页面骨架（动态内容由配置注入，一般不需要改）
├── config.js           ★ 所有可替换内容都在这里：文字 / 视频 / 图片 / 链接
├── style.css           样式与动效（liquid-glass、train-bob、深色模式、响应式）
├── app.js              渲染与交互逻辑（按 config.js 生成页面）
├── README.md
└── assets/
    ├── videos/         背景场景视频（本地）
    │   ├── golden-hour.mp4
    │   ├── still-water.mp4
    │   ├── deep-woods.mp4
    │   └── quiet-dawn.mp4
    └── images/
        └── train-window.png   前景"车窗"透明遮罩
```

## 怎么替换内容

**只改 `config.js` 一个文件**，每一项旁边都有规格注释：

| 想改什么 | 改哪里 |
|---|---|
| Logo 文字 | `brand.logo` |
| 导航链接 / 按钮文字 | `nav.links` / `nav.cta` |
| 徽章、大标题、副文案 | `hero.badge` / `hero.headingLines` / `hero.subtext` |
| 输入框占位与按钮 | `hero.inputPlaceholder` / `hero.inputCta` |
| 背景视频（可增减数量） | `scenes[]`，文件放 `assets/videos/` |
| 场景切换器标签 | `scenes[].label` |
| 某场景文字变深色 | `scenes[].darkContent: true` |
| 场景进入工作台的主题 | `scenes[].workbenchTheme: "light" / "dark"` |
| 前景车窗图 | `overlay.image`，文件放 `assets/images/`（设 `""` 可关闭） |
| 底部统计 | `stats[]` |
| 工作台跳转地址 | `workspaceUrl`（默认 `../index.html`，同时适配本地与线上） |
| 标签页标题 | `pageTitle` |

## 素材规格速查表

### 背景视频（`assets/videos/`）

| 项目 | 当前素材 | 替换建议 |
|---|---|---|
| 分辨率 | 1920 × 1080 (16:9) | 1920×1080 即可，不必 4K |
| 时长 | 约 10 秒 | 8–20 秒，**首尾无缝循环** |
| 编码 | H.264 MP4 | H.264 .mp4（兼容性最好） |
| 大小 | 14–22 MB / 个 | ≤ 25MB（GitHub 单文件上限 100MB） |
| 构图 | — | 画面中央与中上部保持"安静"，那里压着大标题 |
| 声音 | 无 | 无所谓，页面强制静音 |

### 前景遮罩 PNG（`assets/images/`）

| 项目 | 当前素材 | 替换建议 |
|---|---|---|
| 分辨率 | 2752 × 1536 | ≥ 1920×1080，推荐 2560×1440+ |
| 格式 | PNG + 透明通道 | 必须带透明通道（中间镂空、边缘实体） |
| 大小 | 1.8 MB | ≤ 3MB |
| 出血 | — | 四周多画 ≥3%（页面有 scale 1.03 浮动动画，防止露边） |

### 文字长度建议（详见 config.js 内注释）

| 位置 | 建议 |
|---|---|
| Logo | 8–16 个英文字符 |
| 导航链接 | 3–5 项，每项 2–6 字 |
| 徽章 badge | ≤ 24 字 |
| 大标题 | 每行 ≤ 26 个英文字符，最多 2 行；建议保持英文（衬线字体无中文字形） |
| 副文案 | 40–70 字 |
| 底部统计 | 3–4 组，每组 ≤ 10 字 |

## 本地预览

```bash
cd /Users/ethanye/AI/signalpath
python3 -m http.server 8080
# 打开 http://localhost:8080/welcome-reverse-prototype/
```

素材已全部本地化，**离线也能完整运行**（只有 Google Fonts 需要联网，
断网时标题回退到系统衬线字体，页面仍可用）。

审核辅助：`?v=1` `?v=2` `?v=3` 直接打开对应场景（`?v=2` 可查看深色文字模式）。

## 页面行为

- **视频切换**：点击场景标签，两层视频 1000ms 交叉淡化；冷却期内忽略点击
- **深色内容模式**：`darkContent: true` 的场景激活时，Hero 文字 700ms 过渡为 `#182C41`；导航与底部统计始终白色
- **工作台主题联动**：进入工作台时按当前场景的 `workbenchTheme` 使用白天玻璃或黑夜哑光主题，返回后恢复离开前场景
- **train-bob**：前景 PNG 持续上下 6px 浮动（3s 循环），恒定 scale(1.03)
- **移动菜单**：汉堡按钮 Menu/X 交叉旋转；全屏菜单链接交错入场；Escape / 点背板关闭
- **双向联动**：欢迎页三处 CTA 均进入同项目最新版工作台；中间输入框会把反推语句带入工作台，工作台顶部首页按钮可返回欢迎页
- **跳转**：视频或 PNG 加载失败时对应层自动隐藏，页面不崩

## 部署注意

- 整个目录直接放上 GitHub Pages 即可（视频共约 76MB，首次 push 稍慢属正常）；
- 不要覆盖当前线上工作台（`signalpath` 根目录）；
- 视频素材来源于原型规格中提供的第三方链接，若正式商用请先确认版权。
