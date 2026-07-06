把要用的分轨音频放到这里，页面里每个乐器卡片都可以单独扫描 / 导入。

默认目录：
- 音乐文件: audio/imports/music/
- 粉红噪声 / 正弦波: 页面内置发生器，不需要放文件。
- 人声: audio/imports/vocal/
- 吉他: audio/imports/guitar/
- 键盘: audio/imports/keys/
- 贝斯: audio/imports/bass/
- 鼓: audio/imports/drums/

文件名不固定。一个目录下有多个音频时，页面会按文件名顺序排序，你可以在对应轨道里选择。
如果“扫描端口文件夹”失败，直接点页面里的“选择本地文件夹”，选择 imports 或包含分轨的总文件夹即可。
浏览器不能直接读取任意本机绝对路径；如果手动输入路径，建议使用 audio/imports/vocal/ 这种端口相对路径。

【扫描的工作方式与 manifest.json（重要）】
“扫描端口文件夹”有两条路，页面会自动依次尝试：
1. 服务器目录列表：python3 -m http.server 这类服务器会直接列出文件夹内容，扫描开箱即用。
2. manifest.json 清单兜底：Vite / serve / nginx 等服务器通常不提供目录列表，
   这时页面会自动改读本目录下的 manifest.json。
   每次往 imports 里增删音频后，双击项目根目录的“更新音频清单.command”
   （Windows 电脑双击“更新音频清单.bat”）重新生成一次即可。

注意：直接双击 index.html（file:// 方式）打开时，浏览器禁止网页读盘，
以上两条路都不可用，只能点“选择本地文件夹”手动导入。
推荐双击项目根目录的“启动本地服务器.command”（Mac）
或“启动本地服务器.bat”（Windows）来打开页面。

批量换歌建议：
- 同名：每个目录里都放 song01.wav / song02.wav 这种相同文件名。
- 同编号：也可以 vocal01.wav / guitar01.wav / bass01.wav，页面会用结尾数字 01 匹配。
- 也可以完全不管命名，页面会按每个目录排序后的第 1 个、第 2 个、第 3 个来批量替换；点“下一个”可快速切换下一组。

也可以直接在页面对应轨道的 URL 输入框里填写实际路径。
浏览器兼容性最稳的是 wav / mp3；也会识别 flac / m4a / aac / ogg / opus / aiff / caf / webm / mp4 等常见音频格式，但能否播放取决于浏览器解码能力。
