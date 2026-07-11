/* =========================================================
   ErosIris Link 开场页 — 统一素材与文案配置
   ---------------------------------------------------------
   所有可替换的内容（文字 / 视频 / 图片 / 链接）都集中在这里，
   改完保存、刷新页面即生效，不需要动 index.html / app.js。
   ========================================================= */
window.SITE_CONFIG = {

  /* 浏览器标签页标题 */
  pageTitle: "ErosIris Link",

  /* 进入工作台的跳转地址。
     使用同项目相对路径：本地预览和 GitHub Pages 都会进入当前目录的最新版工作台，
     不再从本地欢迎页跳到写死的线上副本。 */
  workspaceUrl: "../index.html",

  /* ---------- 品牌 ---------- */
  brand: {
    /* Logo 文字，Instrument Serif italic 渲染。
       建议：8–16 个英文字符；太长会在手机端挤压汉堡按钮 */
    logo: "ErosIris Link"
  },

  /* ---------- 顶部导航 ---------- */
  nav: {
    /* 桌面玻璃胶囊与移动全屏菜单共用这组链接。
       建议：3–5 项，每项 2–6 个字（或 1–2 个英文单词） */
    links: ["音响反推", "设备模板", "系统连线", "工程报告"],
    /* 白色实心按钮文字，建议 ≤ 6 个字 */
    cta: "进入工作台"
  },

  /* ---------- Hero 主内容 ---------- */
  hero: {
    /* 玻璃胶囊小字，建议 ≤ 24 个字（或 ≤ 50 个英文字符） */
    badge: "调音师智能设备管家",

    /* 大标题，每个元素一行（自动加换行）。
       字体是 Instrument Serif（衬线，不含中文字形；
       写中文会回退到系统衬线体，效果打折，建议保持英文）。
       建议：每行 ≤ 26 个英文字符（约 4–6 个单词），最多 2 行 */
    headingLines: [
      "与优秀同行",
      "找到更好的自己"
    ],

    /* 副文案，系统无衬线字体，自动换行（最大宽度 36rem）。
       建议 40–70 个中文字，或 120–180 个英文字符 */
    subtext: "",

    /* 输入框占位文字与按钮文字 */
    inputPlaceholder: "例如：8只全频，4只超低",
    inputCta: "开始反推"
  },

  /* ---------- 前景遮罩图（"车窗"景框） ----------
     盖在视频上方的透明 PNG，是整个页面质感的关键。

     当前素材：assets/images/train-window.png
       2752 × 1536（16:9）· 带透明通道 · 1.8MB

     替换规格建议：
       - 必须是带透明通道的 PNG（中间镂空看到视频，边缘为实体前景）
       - 分辨率 ≥ 1920×1080，推荐 2560×1440 或以上（大屏不糊）
       - 四周边缘内容要比画面"多画"约 3%：
         页面有持续的上下浮动动画（scale 1.03 + translateY -6px），
         边缘不够会在浮动时露出黑边
       - 文件大小建议 ≤ 3MB
     不想要前景框时，把 image 设为 "" 即可（层会自动隐藏） */
  overlay: {
    image: "assets/images/train-window.png"
  },

  /* ---------- 背景场景视频 ----------
     数量可增减（2–6 个都可以），第一个是默认场景，
     label 显示在中部的场景切换器上。

     当前素材规格（4 个一致）：
       1920 × 1080（16:9）· 约 10 秒无缝循环 · H.264 MP4 · 14–22MB

     替换规格建议：
       - 分辨率 1920×1080 即可，不需要 4K（加载慢、收益小）
       - 时长 8–20 秒，首尾必须无缝循环（loop 时不能跳帧）
       - H.264 编码 .mp4（兼容性最好），码率 8–15 Mbps
       - 单个文件建议 ≤ 25MB（页面加载体验；GitHub 单文件硬上限 100MB）
       - 构图注意：画面中央与中上区域尽量"安静"（压着大标题和文案）
       - darkContent：该场景画面整体偏亮时设 true，
         Hero 文字会以 700ms 过渡切换为深色 #182C41 保证可读性
         （导航与底部统计始终保持白色） */
  scenes: [
    { label: "暖阳", video: "assets/videos/golden-hour.mp4", darkContent: false, workbenchTheme: "light" },
    { label: "静水", video: "assets/videos/still-water.mp4", darkContent: false, workbenchTheme: "light" },
    { label: "深林", video: "assets/videos/deep-woods.mp4", darkContent: true,  workbenchTheme: "dark"  },
    { label: "晨光", video: "assets/videos/quiet-dawn.mp4", darkContent: false, workbenchTheme: "light" }
  ],

  /* true：当前视频接近结尾时自动淡入下一个，最后一个播完回到第一个 */
  sceneAutoAdvance: true,

  /* ---------- 底部统计行 ----------
     value 会加粗显示，不需要数字时设为 ""。
     建议 3–4 组，每组文字 ≤ 10 个字（手机端会自动换行、隐藏分隔线） */
  stats: []
};
